// Peer-to-peer connection between two browsers. Uses PeerJS (WebRTC) so no game
// server is needed — the site can be hosted on GitHub Pages.
// `?transport=bc` switches to a BroadcastChannel (two tabs, same browser) for local testing.

const PREFIX = 'farkle-dice-room-';

function useBroadcast() {
  return new URLSearchParams(location.search).get('transport') === 'bc';
}

/**
 * handlers: { onReady(), onConnect(), onData(msg), onDisconnect(), onError(text) }
 * returns { send(msg), isConnected() }
 */
export function createHost(code, h) {
  if (useBroadcast()) return bcEndpoint(code, 'host', h);

  let conn = null;
  let peer;
  let tries = 0;
  const start = () => {
    peer = new Peer(PREFIX + code);
    peer.on('open', () => h.onReady?.());
    peer.on('connection', (c) => {
      c.on('open', () => {
        if (conn && conn !== c) conn.close();
        conn = c;
        h.onConnect?.();
      });
      c.on('data', (d) => c === conn && h.onData(d));
      c.on('close', () => {
        if (c === conn) {
          conn = null;
          h.onDisconnect?.();
        }
      });
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (e) => {
      // After a page refresh the server may still hold our old id for a few seconds.
      if (e.type === 'unavailable-id' && tries < 8) {
        tries++;
        peer.destroy();
        h.onError?.('Reclaiming room… (retrying)');
        setTimeout(start, 2500);
      } else if (e.type !== 'peer-unavailable') {
        h.onError?.(`Connection error: ${e.type || e.message}`);
      }
    });
  };
  start();
  return {
    send: (m) => conn?.open && conn.send(m),
    isConnected: () => !!conn?.open,
  };
}

export function createGuest(code, h) {
  if (useBroadcast()) return bcEndpoint(code, 'guest', h);

  let conn = null;
  const peer = new Peer();
  let retryTimer = null;

  const connect = () => {
    clearTimeout(retryTimer);
    const c = peer.connect(PREFIX + code, { reliable: true });
    c.on('open', () => {
      conn = c;
      h.onConnect?.();
    });
    c.on('data', (d) => h.onData(d));
    c.on('close', () => {
      if (c === conn) {
        conn = null;
        h.onDisconnect?.();
        retryTimer = setTimeout(connect, 2000);
      }
    });
  };

  peer.on('open', () => {
    h.onReady?.();
    connect();
  });
  peer.on('disconnected', () => {
    if (!peer.destroyed) peer.reconnect();
  });
  peer.on('error', (e) => {
    if (e.type === 'peer-unavailable') {
      h.onError?.('Room not found yet — waiting for the host…');
      retryTimer = setTimeout(connect, 3000);
    } else {
      h.onError?.(`Connection error: ${e.type || e.message}`);
    }
  });
  return {
    send: (m) => conn?.open && conn.send(m),
    isConnected: () => !!conn?.open,
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
      if (!connected) {
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
  addEventListener('beforeunload', () => ch.postMessage({ from: role, ctl: 'bye' }));
  setTimeout(() => {
    h.onReady?.();
    ch.postMessage({ from: role, ctl: 'hello' });
  }, 50);
  return {
    send: (m) => connected && ch.postMessage({ from: role, msg: m }),
    isConnected: () => connected,
  };
}
