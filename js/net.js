// Peer-to-peer connection between two browsers. Uses PeerJS (WebRTC) so no game
// server is needed — the site can be hosted on GitHub Pages.
// `?transport=bc` switches to a BroadcastChannel (two tabs, same browser) for local testing.
//
// Phones (especially iPhones) suspend pages when you switch apps, which can silently
// kill connections. So we send a heartbeat every few seconds, treat a quiet link as
// dead, and reconnect as soon as the page becomes visible again.

const PREFIX = 'farkle-dice-room-';
const PING_MS = 3000;
const DEAD_MS = 10000;

function useBroadcast() {
  return new URLSearchParams(location.search).get('transport') === 'bc';
}

// Wraps a data connection with heartbeat + dead-link detection.
function watch(conn, h, onDead) {
  let last = Date.now();
  let dead = false;
  const kill = () => {
    if (dead) return;
    dead = true;
    clearInterval(iv);
    try { conn.close(); } catch { /* ignore */ }
    onDead();
  };
  const iv = setInterval(() => {
    if (dead) return;
    if (Date.now() - last > DEAD_MS) return kill();
    try { conn.send({ t: '__ping' }); } catch { /* ignore */ }
  }, PING_MS);
  conn.on('data', (d) => {
    last = Date.now();
    if (!dead && d?.t !== '__ping') h.onData(d);
  });
  conn.on('close', kill);
  conn.on('error', kill);
  return { kill, isAlive: () => !dead && conn.open && Date.now() - last < DEAD_MS };
}

function onVisible(fn) {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && fn());
  addEventListener('pageshow', (e) => e.persisted && fn()); // iOS back/forward cache
  addEventListener('online', fn);
}

/**
 * handlers: { onReady(), onConnect(), onData(msg), onDisconnect(), onError(text) }
 * returns { send(msg), isConnected() }
 */
export function createHost(code, h) {
  if (useBroadcast()) return bcEndpoint(code, 'host', h);

  let conn = null;
  let link = null;
  let peer;
  let tries = 0;
  const start = () => {
    peer = new Peer(PREFIX + code);
    peer.on('open', () => { tries = 0; h.onReady?.(); });
    peer.on('connection', (c) => {
      c.on('open', () => {
        if (conn && conn !== c) link?.kill();
        conn = c;
        link = watch(c, h, () => {
          if (conn === c) {
            conn = null;
            h.onDisconnect?.();
          }
        });
        h.onConnect?.();
      });
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), 1000);
    });
    peer.on('error', (e) => {
      // After a refresh/app switch the server may still hold our id for a few seconds.
      if ((e.type === 'unavailable-id' || e.type === 'network' || e.type === 'server-error') && tries < 20) {
        tries++;
        peer.destroy();
        h.onError?.('Reconnecting to the game server…');
        setTimeout(start, 2500);
      } else if (e.type !== 'peer-unavailable') {
        h.onError?.(`Connection error: ${e.type || e.message}`);
      }
    });
  };
  start();
  onVisible(() => {
    if (peer.destroyed) return start();
    if (peer.disconnected) peer.reconnect();
  });
  return {
    send: (m) => { if (conn?.open) try { conn.send(m); } catch { /* ignore */ } },
    isConnected: () => !!link?.isAlive(),
  };
}

export function createGuest(code, h) {
  if (useBroadcast()) return bcEndpoint(code, 'guest', h);

  let conn = null;
  let link = null;
  let peer;
  let retryTimer = null;
  let connecting = false;

  const connect = () => {
    clearTimeout(retryTimer);
    if (!peer || peer.destroyed) return newPeer();
    if (peer.disconnected) {
      peer.reconnect();
      retryTimer = setTimeout(connect, 2000);
      return;
    }
    if (connecting) return;
    connecting = true;
    const c = peer.connect(PREFIX + code, { reliable: true });
    const giveUp = setTimeout(() => {
      // iOS sometimes never opens or errors; try again.
      if (!c.open) {
        connecting = false;
        try { c.close(); } catch { /* ignore */ }
        connect();
      }
    }, 8000);
    c.on('open', () => {
      clearTimeout(giveUp);
      connecting = false;
      if (link) link.kill();
      conn = c;
      link = watch(c, h, () => {
        if (conn === c) {
          conn = null;
          h.onDisconnect?.();
          retryTimer = setTimeout(connect, 1000);
        }
      });
      h.onConnect?.();
    });
    c.on('error', () => { clearTimeout(giveUp); connecting = false; });
  };

  const newPeer = () => {
    connecting = false;
    peer = new Peer();
    peer.on('open', () => {
      h.onReady?.();
      connect();
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), 1000);
    });
    peer.on('error', (e) => {
      connecting = false;
      if (e.type === 'peer-unavailable') {
        h.onError?.('Waiting for the host… (is their game page open?)');
        retryTimer = setTimeout(connect, 3000);
      } else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') {
        h.onError?.('Reconnecting…');
        peer.destroy();
        retryTimer = setTimeout(newPeer, 2500);
      } else {
        h.onError?.(`Connection error: ${e.type || e.message}`);
      }
    });
  };
  newPeer();

  onVisible(() => {
    if (!link?.isAlive()) {
      link?.kill();
      connect();
    }
  });
  return {
    send: (m) => { if (conn?.open) try { conn.send(m); } catch { /* ignore */ } },
    isConnected: () => !!link?.isAlive(),
  };
}

function bcEndpoint(code, role, h) {
  const ch = new BroadcastChannel(PREFIX + code);
  let connected = false;
  ch.onmessage = (e) => {
    const { from, msg, ctl } = e.data;
    if (from === role) return;
    if (ctl === 'hello' || ctl === 'hello-ack') {
      if (ctl === 'hello') ch.postMessage({ from: role, ctl: 'hello-ack' });
      if (!connected || ctl === 'hello') {
        connected = true;
        h.onConnect?.();
      }
      return;
    }
    if (ctl === 'bye') {
      connected = false;
      h.onDisconnect?.();
      return;
    }
    h.onData(msg);
  };
  addEventListener('pagehide', () => ch.postMessage({ from: role, ctl: 'bye' }));
  setTimeout(() => {
    h.onReady?.();
    ch.postMessage({ from: role, ctl: 'hello' });
  }, 50);
  return {
    send: (m) => connected && ch.postMessage({ from: role, msg: m }),
    isConnected: () => connected,
  };
}
