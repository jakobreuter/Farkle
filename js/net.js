// Connection between the two players' browsers.
//
// Messages go through public MQTT brokers over secure WebSockets (wss://, port 443-style
// TLS). Unlike a direct browser-to-browser (WebRTC) link, this works on any network:
// cellular, home Wi-Fi, strict routers. And when an iPhone pauses Safari in the
// background, it simply reconnects. We connect to several brokers at once and
// de-duplicate, so the game keeps working if one of them is down.
//
// Fairness doesn't depend on the relay: dice come from the commit–reveal scheme in rng.js,
// which the guest verifies itself.
//
// Testing overrides: ?transport=bc (two tabs, same browser, no network) and
// ?broker=wss://host/path (use one specific broker).

const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const TOPIC_PREFIX = 'farkle-dice-game/v1/';
const PING_MS = 2500;
const DEAD_MS = 9000;

function rid(n = 12) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, n);
}

/**
 * role: 'host' | 'guest'
 * handlers: { onReady(), onConnect(), onDisconnect(), onData(msg), onError(text) }
 *   onReady      – we're connected to the relay (fires again after every reconnect)
 *   onConnect    – we're hearing from the other player
 *   onDisconnect – the other player went quiet
 * returns { send(msg), isConnected() }
 */
function createEndpoint(code, role, h) {
  const q = new URLSearchParams(location.search);
  const sid = rid();
  const topic = TOPIC_PREFIX + code;
  const lastSeq = new Map(); // sender session -> last message number
  let seq = 0;
  let lastSeen = 0;
  let alive = false;

  function receive(raw) {
    let env;
    try {
      env = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (!env || env.r === role || env.s === sid || typeof env.n !== 'number') return;
    // Same message arrives once per broker; also drop anything older than what we've seen.
    if (env.n <= (lastSeq.get(env.s) || 0)) return;
    lastSeq.set(env.s, env.n);
    lastSeen = Date.now();
    if (!alive) {
      alive = true;
      h.onConnect?.();
    }
    if (env.m?.t !== '__ping') h.onData(env.m);
  }

  let links; // [{ publish(payload, isPing), connected(), wake() }]
  if (q.get('transport') === 'bc') {
    const ch = new BroadcastChannel(topic);
    ch.onmessage = (e) => receive(e.data);
    links = [{ publish: (p) => ch.postMessage(p), connected: () => true, wake() {} }];
    setTimeout(() => h.onReady?.(), 30);
  } else {
    if (!window.mqtt) {
      h.onError?.('Could not load the connection library — check your internet and reload.');
      return { send() {}, isConnected: () => false };
    }
    const urls = q.get('broker') ? q.get('broker').split(',') : BROKERS;
    let everConnected = false;
    links = urls.map((url) => {
      const c = window.mqtt.connect(url, {
        clientId: `farkle_${rid(10)}`,
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
        publish: (p, isPing) => {
          if (isPing && !c.connected) return; // don't queue heartbeats while offline
          c.publish(topic, p, { qos: isPing ? 0 : 1 });
        },
        connected: () => c.connected,
        wake: () => { if (!c.connected && !c.reconnecting) c.reconnect(); },
      };
    });
    setTimeout(() => {
      if (!everConnected) h.onError?.('Can’t reach the game relay — check your internet connection.');
    }, 12000);
  }

  function send(m) {
    const payload = JSON.stringify({ r: role, s: sid, n: ++seq, m });
    const isPing = m?.t === '__ping';
    for (const l of links) {
      try { l.publish(payload, isPing); } catch { /* ignore */ }
    }
  }

  setInterval(() => {
    send({ t: '__ping' });
    if (alive && Date.now() - lastSeen > DEAD_MS) {
      alive = false;
      h.onDisconnect?.();
    }
  }, PING_MS);

  // Phones pause pages in the background; reconnect right away when we come back.
  const wake = () => {
    for (const l of links) l.wake();
    send({ t: '__ping' });
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
  addEventListener('pageshow', (e) => e.persisted && wake());
  addEventListener('online', wake);

  return { send, isConnected: () => alive };
}

export const createHost = (code, h) => createEndpoint(code, 'host', h);
export const createGuest = (code, h) => createEndpoint(code, 'guest', h);
