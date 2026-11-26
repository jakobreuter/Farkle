// A session (room) that friends join once and then play several games in.
//
// The host's browser is the referee: it holds the authoritative session state
// (members, chosen game, game state), applies everyone's moves, and broadcasts the
// result. If the host disappears for a few seconds (closed the page, switched apps),
// the next person in join order takes over automatically. The original host can
// come back and simply rejoins as a regular player.
//
// Randomness (dice, cards, words) uses commit–reveal with another player (see rng.js),
// falling back to the host's own crypto RNG if nobody else answers within a moment, so
// a player can always finish their turn even if the others have stepped away.

import { createRelay, DEAD_MS } from './net.js';
import { randomHex, sha256Hex, deriveInts, cryptoInts } from './rng.js';
import { GAMES } from './games/index.js';

const SEED_WAIT_MS = 1500;

export function createSession({ code, me, name, create, ui }) {
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem(`sess-${code}`)); } catch { return null; } },
    set(v) { try { sessionStorage.setItem(`sess-${code}`, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  let sess = store.get();
  if (create && !sess) {
    sess = { v: 1, host: me, seq: 1, members: [{ pid: me, name }], lobby: { game: 'farkle', opts: {} }, game: null, gameNo: 0 };
  }
  let clockOffset = 0; // hostNow - localNow
  const bootAt = Date.now();
  let hostQueue = Promise.resolve();
  let busy = false;
  const seedWaiters = new Map(); // rollId -> resolve
  const myCommits = new Map(); // rollId -> {commit, seed}
  const verified = new Set();
  let left = false;

  const isHost = () => !!sess && sess.host === me;
  const memberIndex = (pid) => sess.members.findIndex((m) => m.pid === pid);
  const nameOf = (pid) => sess?.members.find((m) => m.pid === pid)?.name || 'Someone';

  const relay = createRelay(code, me, {
    onReady: () => {
      ui.onConnection?.(true);
      if (isHost()) broadcast();
      else hello();
    },
    onError: (t) => ui.onError?.(t),
    onPresence: (pid, alive) => {
      if (!sess) return;
      if (isHost() && alive) broadcast();
      if (!isHost() && pid === sess.host && alive) hello();
      ui.onPresence?.();
      if (!alive) checkHost();
    },
    onMessage,
  });

  // ---------- sending ----------
  function broadcast(to) {
    if (!sess || left) return;
    relay.send({ t: 'sess', sess, now: Date.now() }, to);
  }
  function hello() {
    if (left) return;
    relay.send({ t: 'hello', name });
  }

  function changed(prev) {
    store.set(sess);
    ui.onSession?.(sess, prev);
  }

  function setSess(next, { send = true } = {}) {
    const prev = sess;
    sess = next;
    if (send && isHost()) broadcast();
    changed(prev);
  }

  let lastChangeAt = 0;
  function hostUpdate(fn) {
    if (!isHost()) return;
    const next = structuredClone(sess);
    fn(next);
    next.seq++;
    lastChangeAt = Date.now();
    setSess(next);
  }

  // Computer players live in the member list with ids starting "bot-". They're
  // always "present", never become host, and the host's browser plays their moves.
  const isBot = (pid) => typeof pid === 'string' && pid.startsWith('bot-');
  const alive = (pid) => isBot(pid) || relay.isAlive(pid);
  const BOT_NAMES = ['Robo', 'Chip', 'Pixel', 'Bolt', 'Sprocket', 'Widget', 'Byte'];

  // ---------- receiving ----------
  function newer(a, b) {
    if (!b) return true;
    if (a.v !== b.v) return a.v > b.v;
    if (a.host !== b.host) {
      // two people promoted themselves at once: the one earlier in join order wins
      const order = (pid) => { const i = a.members.findIndex((m) => m.pid === pid); return i < 0 ? 1e9 : i; };
      return order(a.host) < order(b.host);
    }
    return a.seq > b.seq;
  }

  function onMessage(m, from) {
    if (!m || typeof m !== 'object' || left) return;
    switch (m.t) {
      case 'sess': {
        const incoming = m.sess;
        if (!incoming || !Array.isArray(incoming.members)) return;
        if (!newer(incoming, sess)) {
          // someone is behind (e.g. an old host coming back): bring them up to date
          if (isHost() && sess && incoming.seq !== sess.seq) broadcast(from);
          return;
        }
        const wasHost = isHost();
        const prevHost = sess?.host;
        if (typeof m.now === 'number') clockOffset = m.now - Date.now();
        setSess(incoming, { send: false });
        if (!wasHost && isHost()) {
          ui.onToast?.(`${nameOf(prevHost)} left — you’re the host now.`, 4000);
          broadcast();
        } else if (wasHost && !isHost()) {
          ui.onToast?.(`${nameOf(sess.host)} is the host now.`);
          hello();
        } else if (prevHost && prevHost !== sess.host && !isHost()) {
          ui.onToast?.(`${nameOf(sess.host)} is now the host.`);
        }
        if (!sess.members.some((x) => x.pid === me)) hello();
        verifyProof();
        return;
      }
      case 'hello': {
        if (!isHost()) return;
        const nm = String(m.name || 'Player').slice(0, 16);
        const known = sess.members.find((x) => x.pid === from);
        if (!known) {
          hostUpdate((s) => s.members.push({ pid: from, name: nm }));
          ui.onToast?.(`${nm} joined.`);
        } else if (known.name !== nm) {
          hostUpdate((s) => { s.members.find((x) => x.pid === from).name = nm; });
        } else {
          broadcast();
        }
        const items = ui.gameSync?.();
        if (items) relay.send({ t: 'gxsync', no: sess.game?.no, items }, from);
        return;
      }
      case 'act': {
        if (!isHost() || !sess.game || m.no !== sess.game.no) return;
        const seat = sess.game.state.players.findIndex((p) => p.pid === from);
        if (seat < 0) return;
        enqueue(m.a, seat);
        return;
      }
      case 'commit': {
        if (from !== sess?.host) return;
        const seed = randomHex(32);
        myCommits.set(m.id, { commit: m.commit, seed });
        relay.send({ t: 'seed', id: m.id, seed }, from);
        return;
      }
      case 'seed': {
        const w = seedWaiters.get(m.id);
        if (w && w.from === from && /^[0-9a-f]{64}$/.test(m.seed || '')) w.resolve(m.seed);
        return;
      }
      case 'gx':
        if (sess?.game && m.no === sess.game.no) ui.onGameEvent?.(m.m, from);
        return;
      case 'gxsync':
        if (sess?.game && m.no === sess.game.no) ui.onGameSync?.(m.items);
        return;
      default:
    }
  }

  // ---------- fairness check (by the player who contributed randomness) ----------
  async function verifyProof() {
    const p = sess?.game?.proof;
    if (!p || p.by !== me || verified.has(p.id)) return;
    verified.add(p.id);
    const mine = myCommits.get(p.id);
    if (!mine) return; // from before we (re)loaded the page
    let ok = mine.commit === p.commit && mine.seed === p.guestSeed && (await sha256Hex(p.hostSeed)) === p.commit;
    if (ok) {
      const v = await deriveInts(p.hostSeed, p.guestSeed, p.id, p.ranges);
      ok = v.join() === p.values.join();
    }
    if (!ok) ui.onFairnessProblem?.();
  }

  // ---------- host migration ----------
  function checkHost() {
    if (!sess || isHost() || left) return;
    if (relay.isAlive(sess.host)) return;
    if (Date.now() - bootAt < DEAD_MS + 2000) return; // give a fresh page time to hear the host
    const n = sess.members.length;
    const start = memberIndex(sess.host);
    for (let k = 1; k <= n; k++) {
      const cand = sess.members[(start + k) % n];
      if (cand.pid === sess.host) continue;
      if (cand.pid === me) return promote(`${nameOf(sess.host)} left — you’re the host now.`);
      if (relay.isAlive(cand.pid)) return; // someone ahead of us will take over
    }
  }

  function promote(msg) {
    const next = structuredClone(sess);
    next.v++;
    next.host = me;
    next.seq = 1;
    sess = next;
    busy = false;
    broadcast();
    changed(null);
    ui.onToast?.(msg, 4000);
  }

  setInterval(() => {
    checkHost();
    if (isHost()) {
      tick();
      if (Date.now() % 5000 < 1000) broadcast(); // periodic resync (~every 5s)
    } else if (!sess || !sess.members.some((x) => x.pid === me)) {
      hello();
    }
  }, 1000);

  // ---------- game engine plumbing (host) ----------
  function contributorFor(seat) {
    const players = sess.game.state.players;
    const own = players[seat]?.pid;
    if (own && own !== me && relay.isAlive(own)) return own;
    const other = sess.members.find((x) => x.pid !== me && relay.isAlive(x.pid));
    return other?.pid || null;
  }

  async function fairRandom(ranges, contributor) {
    if (!contributor) return { values: cryptoInts(ranges), proof: null };
    const id = randomHex(8);
    const hostSeed = randomHex(32);
    const commit = await sha256Hex(hostSeed);
    const seed = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), SEED_WAIT_MS);
      seedWaiters.set(id, { from: contributor, resolve: (s) => { clearTimeout(timer); resolve(s); } });
      relay.send({ t: 'commit', id, commit }, contributor);
    });
    seedWaiters.delete(id);
    if (!seed) return { values: cryptoInts(ranges), proof: null }; // they didn't answer: don't stall the game
    const values = await deriveInts(hostSeed, seed, id, ranges);
    return { values, proof: { id, commit, hostSeed, guestSeed: seed, ranges, values, by: contributor } };
  }

  function enqueue(action, seat) {
    hostQueue = hostQueue.then(() => dispatch(action, seat)).catch((e) => console.warn(e));
  }

  async function dispatch(action, seat) {
    if (!isHost() || !sess.game) return;
    busy = true;
    try {
      const g = sess.game;
      const plugin = GAMES[g.id];
      const ranges = plugin.randomFor?.(g.state, action, seat);
      let rand = null;
      let proof = null;
      if (ranges && ranges.length) {
        ({ values: rand, proof } = await fairRandom(ranges, contributorFor(seat)));
        if (!isHost() || sess.game?.no !== g.no) return; // game changed meanwhile
      }
      let next;
      try {
        next = plugin.apply(sess.game.state, action, seat, { now: Date.now(), rand });
      } catch (e) {
        console.warn('rejected', action, e.message);
        return;
      }
      hostUpdate((s) => {
        s.game.state = next;
        if (proof) s.game.proof = proof;
      });
    } finally {
      busy = false;
    }
  }

  function tick() {
    if (busy || !sess.game) return;
    const plugin = GAMES[sess.game.id];
    const a = plugin.tick?.(sess.game.state, { now: Date.now() });
    if (a) enqueue(a, -1);
  }

  // let computer players move, one action at a time, at a watchable pace
  function botTick() {
    if (!isHost() || busy || !sess.game) return;
    const plugin = GAMES[sess.game.id];
    if (!plugin.bot || Date.now() - lastChangeAt < (plugin.botDelay ?? 1100)) return;
    const st = sess.game.state;
    for (let seat = 0; seat < st.players.length; seat++) {
      if (!isBot(st.players[seat].pid)) continue;
      let a = null;
      try { a = plugin.bot(st, seat); } catch (e) { console.warn('bot', e); }
      if (a) { lastChangeAt = Date.now(); enqueue(a, seat); return; }
    }
  }
  setInterval(botTick, 300);

  // ---------- public API ----------
  return {
    me,
    get state() { return sess; },
    isHost,
    isAlive: alive,
    isBot,
    hostNow: () => Date.now() + clockOffset,
    nameOf,

    act(action) {
      if (!sess?.game) return;
      if (isHost()) {
        const seat = sess.game.state.players.findIndex((p) => p.pid === me);
        if (seat >= 0) enqueue(action, seat);
      } else {
        relay.send({ t: 'act', no: sess.game.no, a: action }, sess.host);
      }
    },
    gameEvent(m, light = true) {
      if (!sess?.game) return;
      relay.send({ t: 'gx', no: sess.game.no, m, light });
    },

    // host-only lobby controls
    selectGame(id) { hostUpdate((s) => { s.lobby.game = id; }); },
    setOption(key, val) { hostUpdate((s) => { s.lobby.opts = { ...s.lobby.opts, [`${s.lobby.game}.${key}`]: val }; }); },
    startGame() {
      if (!isHost()) return;
      const plugin = GAMES[sess.lobby.game];
      const players = sess.members.filter((x) => alive(x.pid));
      if (!plugin.bot && players.some((x) => isBot(x.pid))) return ui.onToast?.(`${plugin.name} can’t be played with computer players.`);
      if (players.length < plugin.minPlayers) return ui.onToast?.(`${plugin.name} needs at least ${plugin.minPlayers} players.`);
      if (players.length > plugin.maxPlayers) return ui.onToast?.(`${plugin.name} allows up to ${plugin.maxPlayers} players.`);
      const opts = {};
      for (const o of plugin.options || []) opts[o.key] = sess.lobby.opts[`${plugin.id}.${o.key}`] ?? o.default;
      const no = (sess.gameNo || 0) + 1;
      const state = plugin.setup(players.map((p) => ({ pid: p.pid, name: p.name })), opts, { now: Date.now(), first: (no - 1) % players.length });
      hostUpdate((s) => {
        s.gameNo = no;
        s.game = { id: plugin.id, no, opts, state, proof: null };
      });
    },
    endGame() { hostUpdate((s) => { s.game = null; }); },
    addBot() {
      if (!isHost()) return;
      const used = new Set(sess.members.map((m) => m.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${sess.members.length}`;
      hostUpdate((s) => s.members.push({ pid: `bot-${randomHex(4)}`, name, bot: true }));
    },
    kick(pid) {
      if (pid === me) return;
      hostUpdate((s) => { s.members = s.members.filter((x) => x.pid !== pid); });
    },
    leave() {
      if (isHost() && sess) {
        // hand the room to the next person who's here
        const n = sess.members.length;
        const start = memberIndex(me);
        for (let k = 1; k < n; k++) {
          const cand = sess.members[(start + k) % n];
          if (relay.isAlive(cand.pid)) {
            const next = structuredClone(sess);
            next.v++;
            next.host = cand.pid;
            next.seq = 1;
            sess = next;
            broadcast();
            break;
          }
        }
      }
      relay.leave();
      left = true;
    },
  };
}
