// Message relay between everyone in a session.
//
// Messages go through public MQTT brokers over secure WebSockets. That works on any
// network (cellular, Wi-Fi, strict routers) and reconnects cleanly when a phone pauses
// the page. We connect to several brokers at once and de-duplicate, so the game keeps
// working if one of them is down. Every message reaches everyone in the room; a `to`
// field marks messages meant for one person.
//
// Presence: everyone sends a tiny heartbeat every few seconds. Someone who's been
// silent for DEAD_MS is "away" (closed the page, switched apps, lost signal).
//
// Testing overrides: ?transport=bc (tabs in one browser, no network) and
// ?broker=url[,url] (use specific brokers).

const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const TOPIC_PREFIX = 'farkle-dice-game/v2/';
const PING_MS = 2000;
export const DEAD_MS = 8000;

function rid(n = 12) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => (x % 36).toString(36)).join('');
}

/**
 * me: this player's id (stable across reloads of the same tab)
 * h: { onReady(), onMessage(msg, fromPid), onPresence(pid, alive) }
 */
export function createRelay(code, me, h) {
  const q = new URLSearchParams(location.search);
  const boot = rid(8); // new on every page load, so a reload isn't mistaken for old messages
  const topic = TOPIC_PREFIX + code;
  const lastSeq = new Map(); // `${pid}:${boot}` -> last message number
  const lastSeen = new Map(); // pid -> time
  const alive = new Set();
  let seq = 0;

  function seen(pid) {
    lastSeen.set(pid, Date.now());
    if (!alive.has(pid)) {
      alive.add(pid);
      h.onPresence?.(pid, true);
    }
  }

  function markGone(pid) {
    if (alive.delete(pid)) h.onPresence?.(pid, false);
  }

  function receive(raw) {
    let env;
    try {
      env = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (!env || typeof env.p !== 'string' || env.p === me || typeof env.n !== 'number') return;
    const key = `${env.p}:${env.b}`;
    if (env.n <= (lastSeq.get(key) || 0)) return; // duplicate (one copy per broker) or stale
    lastSeq.set(key, env.n);
    if (env.m?.t === '__bye') {
      markGone(env.p);
      return;
    }
    seen(env.p);
    if (env.m?.t === '__ping') return;
    if (env.to && env.to !== me) return;
    h.onMessage(env.m, env.p);
  }

  let links;
  if (q.get('transport') === 'bc') {
    const ch = new BroadcastChannel(topic);
    ch.onmessage = (e) => receive(e.data);
    links = [{ publish: (p) => ch.postMessage(p), wake() {} }];
    setTimeout(() => h.onReady?.(), 30);
  } else {
    if (!window.mqtt) {
      setTimeout(() => h.onError?.('Could not load the connection library — check your internet and reload.'));
      return { send() {}, isAlive: () => false, leave() {} };
    }
    const urls = q.get('broker') ? q.get('broker').split(',') : BROKERS;
    let everConnected = false;
    links = urls.map((url) => {
      const c = window.mqtt.connect(url, {
        clientId: `fk_${rid(12)}`,
        clean: true,
        keepalive: 20,
        reconnectPeriod: 2000,
        connectTimeout: 10000,
      });
      c.on('connect', () => {
        c.subscribe(topic, { qos: 1 }, (err) => {
          if (err) return;
          everConnected = true;
          h.onReady?.();
        });
      });
      c.on('message', (_t, payload) => receive(payload));
      c.on('error', () => {});
      return {
        publish: (p, light) => {
          if (light && !c.connected) return; // don't queue heartbeats while offline
          c.publish(topic, p, { qos: light ? 0 : 1 });
        },
        wake: () => { if (!c.connected && !c.reconnecting) c.reconnect(); },
      };
    });
    setTimeout(() => {
      if (!everConnected) h.onError?.('Can’t reach the game relay — check your internet connection.');
    }, 12000);
  }

  function send(m, to) {
    const env = { p: me, b: boot, n: ++seq, m };
    if (to) env.to = to;
    const payload = JSON.stringify(env);
    const light = m?.t === '__ping' || m?.light;
    for (const l of links) {
      try { l.publish(payload, light); } catch { /* ignore */ }
    }
  }

  setInterval(() => {
    send({ t: '__ping' });
    const now = Date.now();
    for (const pid of [...alive]) if (now - (lastSeen.get(pid) || 0) > DEAD_MS) markGone(pid);
  }, PING_MS);

  // Phones pause pages in the background; reconnect right away when we come back.
  const wake = () => {
    for (const l of links) l.wake();
    send({ t: '__ping' });
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
  addEventListener('pageshow', (e) => e.persisted && wake());
  addEventListener('online', wake);

  return {
    send,
    isAlive: (pid) => pid === me || alive.has(pid),
    leave: () => send({ t: '__bye' }),
  };
}
