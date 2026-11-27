// Hexlands — an island-settling game of resources, roads and trading.
//
// Island: 19 hex tiles (radius-2 hex grid, pointy-top) — 4 Timber, 3 Clay,
// 4 Wool, 4 Grain, 3 Ore and 1 Dunes — with number tokens 2..12 (no 6/8 on
// neighbouring tiles) and 9 harbors on the coast (4 × 3:1, one 2:1 per resource).
//
// Flow:
//   deal (system) → setup (snake order: village + road each, twice; the second
//   village yields one of each neighbouring resource) → turns:
//   roll → [7: discard (everyone with >7 cards, simultaneous) → move the storm +
//   steal] → main (build / buy / play cards / trade) → end.
//
// Board pieces in state:
//   bo[v]   owner of vertex v (-1 empty), bl[v] level (1 village, 2 city)
//   roads[e] owner of edge e (-1 empty)
// Hands are [timber, clay, wool, grain, ore].

export const RES = ['timber', 'clay', 'wool', 'grain', 'ore'];
export const RES_NAME = ['Timber', 'Clay', 'Wool', 'Grain', 'Ore'];
export const RES_ICON = ['🌲', '🧱', '🐑', '🌾', '🪨'];
export const DESERT = 5;
export const COST = {
  road: [1, 1, 0, 0, 0],
  village: [1, 1, 1, 1, 0],
  city: [0, 0, 0, 2, 3],
  dev: [0, 0, 1, 1, 1],
};
export const PIECES = { road: 15, village: 5, city: 4 };
export const BANK_EACH = 19;
export const DEV = {
  K: { name: 'Watchman', icon: '🛡️', text: 'Move the storm and take a card from a player beside it. Counts toward the Strongest Guard.' },
  V: { name: 'Landmark', icon: '🏛️', text: '+1 point (kept secret until the end).' },
  R: { name: 'Pathfinders', icon: '🛤️', text: 'Build 2 roads for free.' },
  P: { name: 'Windfall', icon: '🎁', text: 'Take any 2 resources from the bank.' },
  M: { name: 'Market Corner', icon: '📯', text: 'Name a resource: every other player hands you all of theirs.' },
};
export const DECK = 'KKKKKKKKKKKKKKVVVVVRRPPMM';
export const TARGETS = [8, 10, 12];
export const ROUND_CAP = 120; // safety net: after this many rounds the highest score wins
export const PLAYER_COLORS = ['#d8383a', '#2e6bd3', '#f08a24', '#8e4fc4'];
export const COLOR_NAMES = ['Red', 'Blue', 'Orange', 'Purple'];

const RES_TILES = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, DESERT];
const OTHER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 9, 9, 10, 10, 11, 11, 12];
const RED_TOKENS = [6, 8, 6, 8];
const HARBOR_TYPES = [-1, -1, -1, -1, 0, 1, 2, 3, 4]; // -1 = any 3:1

// ---------- geometry (fixed for every game) ----------

const SQ3 = Math.sqrt(3);
export const TILES = [];
for (let r = -2; r <= 2; r++) {
  for (let q = -2; q <= 2; q++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > 2) continue;
    TILES.push({ q, r, x: SQ3 * (q + r / 2), y: 1.5 * r, v: [], e: [], n: [] });
  }
}
export const VERTS = [];
export const EDGES = [];
{
  const vIdx = new Map();
  const eIdx = new Map();
  const vid = (x, y) => {
    const k = `${Math.round(x * 100)},${Math.round(y * 100)}`;
    if (!vIdx.has(k)) { vIdx.set(k, VERTS.length); VERTS.push({ x, y, tiles: [], n: [], e: [], harbor: -1 }); }
    return vIdx.get(k);
  };
  TILES.forEach((t, ti) => {
    for (let i = 0; i < 6; i++) {
      const a = ((60 * i - 90) * Math.PI) / 180;
      const v = vid(t.x + Math.cos(a), t.y + Math.sin(a));
      t.v.push(v);
      VERTS[v].tiles.push(ti);
    }
    for (let i = 0; i < 6; i++) {
      const a = t.v[i];
      const b = t.v[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!eIdx.has(k)) {
        eIdx.set(k, EDGES.length);
        EDGES.push({ a: Math.min(a, b), b: Math.max(a, b), tiles: [] });
        VERTS[a].n.push(b); VERTS[b].n.push(a);
        VERTS[a].e.push(EDGES.length - 1); VERTS[b].e.push(EDGES.length - 1);
      }
      const e = eIdx.get(k);
      t.e.push(e);
      EDGES[e].tiles.push(ti);
    }
  });
  for (const ed of EDGES) {
    if (ed.tiles.length === 2) {
      const [x, y] = ed.tiles;
      TILES[x].n.push(y); TILES[y].n.push(x);
    }
  }
}
// coast edges in order around the island; 9 harbor spots spread evenly
export const COAST = EDGES.map((ed, i) => i).filter((i) => EDGES[i].tiles.length === 1)
  .sort((i, j) => ang(i) - ang(j));
function ang(i) {
  const { a, b } = EDGES[i];
  const x = (VERTS[a].x + VERTS[b].x) / 2;
  const y = (VERTS[a].y + VERTS[b].y) / 2;
  return (Math.atan2(y, x) + Math.PI * 2 + 0.01) % (Math.PI * 2);
}
export const HARBOR_EDGES = [0, 3, 6, 10, 13, 16, 20, 23, 26].map((k) => COAST[k]);
HARBOR_EDGES.forEach((e, hi) => { VERTS[EDGES[e].a].harbor = hi; VERTS[EDGES[e].b].harbor = hi; });

export const otherEnd = (e, v) => (EDGES[e].a === v ? EDGES[e].b : EDGES[e].a);
export const pip = (n) => (n ? 6 - Math.abs(7 - n) : 0);
export const sum = (h) => h.reduce((a, b) => a + b, 0);
const canPay = (hand, cost) => cost.every((c, i) => hand[i] >= c);

// ---------- setup / deal ----------

export function newGame(players, { target = 10, first = 0 } = {}) {
  return {
    phase: 'deal',
    players: players.map((p) => ({ pid: p.pid, name: p.name, hand: [0, 0, 0, 0, 0], dev: [], knights: 0 })),
    target: TARGETS.includes(Number(target)) ? Number(target) : 10,
    first,
    current: first,
    res: null, // tile -> resource index (5 = dunes)
    num: null, // tile -> number token (0 on dunes)
    harbors: null, // harbor spot -> type (-1 = 3:1, else resource 2:1)
    bandit: -1,
    bo: Array(VERTS.length).fill(-1),
    bl: Array(VERTS.length).fill(0),
    roads: Array(EDGES.length).fill(-1),
    deck: DECK,
    setup: null, // { order: [seats], i, v }
    dice: null,
    rollNo: 0,
    turn: 0,
    devPlayed: false,
    freeRoads: 0,
    offer: null,
    offerNo: 0,
    offers: 0,
    discard: null, // per seat: cards still to discard
    after: null, // phase to return to after moving the storm
    roadHolder: -1,
    armyHolder: -1,
    ev: null, // last notable event, for the view
    evNo: 0,
    lastProd: null, // what the last roll paid: per-seat hands
    winners: null,
    log: ['A new island rises from the sea…'],
  };
}

const shuffleRanges = (n) => Array.from({ length: n - 1 }, (_, k) => n - k);
export const dealRanges = () => [...shuffleRanges(19), ...shuffleRanges(18), ...shuffleRanges(14), ...shuffleRanges(9)];

function shuffle(arr, take) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = take(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Lay out the island from random ints (see dealRanges). */
export function deal(s0, rand) {
  const s = structuredClone(s0);
  let k = 0;
  const take = (r) => ((rand?.[k++] ?? 0) % r + r) % r;
  s.res = shuffle(RES_TILES, take);
  const land = s.res.map((r, i) => i).filter((i) => s.res[i] !== DESERT);
  const order = shuffle(land, take);
  const others = shuffle(OTHER_TOKENS, take);
  s.harbors = shuffle(HARBOR_TYPES, take);
  // red numbers (6/8) on four tiles that don't touch, first such set in random order
  const reds = [];
  const pick = (from) => {
    if (reds.length === 4) return true;
    for (let i = from; i < order.length; i++) {
      const t = order[i];
      if (reds.some((x) => TILES[x].n.includes(t))) continue;
      reds.push(t);
      if (pick(i + 1)) return true;
      reds.pop();
    }
    return false;
  };
  pick(0);
  s.num = Array(TILES.length).fill(0);
  reds.forEach((t, i) => { s.num[t] = RED_TOKENS[i]; });
  let oi = 0;
  for (const t of order) if (!s.num[t]) s.num[t] = others[oi++];
  s.bandit = s.res.indexOf(DESERT);
  const n = s.players.length;
  const seats = Array.from({ length: n }, (_, i) => (s.first + i) % n);
  s.setup = { order: [...seats, ...seats.slice().reverse()], i: 0, v: -1 };
  s.current = s.setup.order[0];
  s.phase = 'setup';
  addLog(s, `The island is ready. ${s.players[s.current].name} places first.`);
  return s;
}

// ---------- queries ----------

export function addLog(s, msg) { s.log = [...s.log, msg].slice(-60); }
const nm = (s, i) => s.players[i].name;
const fmtCards = (h) => h.map((c, r) => (c ? `${c}${RES_ICON[r]}` : '')).filter(Boolean).join(' ') || 'nothing';

export const countOf = (s, seat, lvl) => s.bo.reduce((a, o, v) => a + (o === seat && s.bl[v] === lvl ? 1 : 0), 0);
export const roadCount = (s, seat) => s.roads.reduce((a, o) => a + (o === seat ? 1 : 0), 0);
export const bank = (s) => RES.map((_, r) => BANK_EACH - s.players.reduce((a, p) => a + p.hand[r], 0));

/** Points: buildings + awards, plus hidden Landmark cards when `hidden`. */
export function points(s, seat, hidden = false) {
  let p = countOf(s, seat, 1) + 2 * countOf(s, seat, 2);
  if (s.roadHolder === seat) p += 2;
  if (s.armyHolder === seat) p += 2;
  if (hidden) p += s.players[seat].dev.filter((d) => d.k === 'V').length;
  return p;
}

function villageSpotFree(s, v) {
  return s.bo[v] < 0 && VERTS[v].n.every((u) => s.bo[u] < 0);
}

/** Vertices where `seat` may put a village (during setup: anywhere free). */
export function legalVillages(s, seat) {
  const out = [];
  const setup = s.phase === 'setup';
  for (let v = 0; v < VERTS.length; v++) {
    if (!villageSpotFree(s, v)) continue;
    if (!setup && !VERTS[v].e.some((e) => s.roads[e] === seat)) continue;
    out.push(v);
  }
  return out;
}

export const legalCities = (s, seat) => s.bo.map((o, v) => v).filter((v) => s.bo[v] === seat && s.bl[v] === 1);

function roadOk(s, seat, e) {
  if (s.roads[e] >= 0) return false;
  for (const v of [EDGES[e].a, EDGES[e].b]) {
    if (s.bo[v] === seat) return true;
    if (s.bo[v] >= 0) continue; // an opponent's building cuts the way
    if (VERTS[v].e.some((x) => x !== e && s.roads[x] === seat)) return true;
  }
  return false;
}

export function legalRoads(s, seat) {
  if (s.phase === 'setup') {
    if (!s.setup || s.setup.v < 0) return [];
    return VERTS[s.setup.v].e.filter((e) => s.roads[e] < 0);
  }
  if (roadCount(s, seat) >= PIECES.road) return [];
  const out = [];
  for (let e = 0; e < EDGES.length; e++) if (roadOk(s, seat, e)) out.push(e);
  return out;
}

/** Best trade rate for giving resource r to the bank. */
export function rateFor(s, seat, r) {
  let rate = 4;
  for (let v = 0; v < VERTS.length; v++) {
    if (s.bo[v] !== seat || VERTS[v].harbor < 0) continue;
    const t = s.harbors[VERTS[v].harbor];
    if (t === r) return 2;
    if (t === -1) rate = 3;
  }
  return rate;
}

/** Longest single trail of roads (opponent buildings break it). */
export function longestRoad(s, seat) {
  const mine = [];
  s.roads.forEach((o, e) => { if (o === seat) mine.push(e); });
  if (!mine.length) return 0;
  const used = new Set();
  let best = 0;
  const dfs = (v, len) => {
    if (len > best) best = len;
    if (len > 0 && s.bo[v] >= 0 && s.bo[v] !== seat) return;
    for (const e of VERTS[v].e) {
      if (s.roads[e] !== seat || used.has(e)) continue;
      used.add(e);
      dfs(otherEnd(e, v), len + 1);
      used.delete(e);
    }
  };
  const starts = new Set();
  for (const e of mine) { starts.add(EDGES[e].a); starts.add(EDGES[e].b); }
  for (const v of starts) dfs(v, 0);
  return best;
}

function updateRoadAward(s) {
  const L = s.players.map((_, i) => longestRoad(s, i));
  const h = s.roadHolder;
  const max = Math.max(...L);
  let next;
  if (max < 5) next = -1;
  else if (h >= 0 && L[h] === max) next = h;
  else {
    const top = L.map((x, i) => i).filter((i) => L[i] === max);
    next = top.length === 1 ? top[0] : -1;
  }
  if (next !== h) {
    s.roadHolder = next;
    if (next >= 0) { addLog(s, `${nm(s, next)} has the Grand Road (${L[next]} long) — +2 points.`); event(s, { kind: 'road', seat: next }); }
    else addLog(s, `${nm(s, h)} loses the Grand Road.`);
  }
}

function event(s, ev) { s.evNo++; s.ev = { ...ev, no: s.evNo }; }

export const playable = (s, seat, k) => s.players[seat].dev.some((d) => d.k === k && d.t < s.turn);

function produce(s, total) {
  const gains = s.players.map(() => [0, 0, 0, 0, 0]);
  TILES.forEach((t, ti) => {
    if (s.num[ti] !== total || ti === s.bandit) return;
    for (const v of t.v) if (s.bo[v] >= 0) gains[s.bo[v]][s.res[ti]] += s.bl[v];
  });
  const left = bank(s);
  for (let r = 0; r < 5; r++) {
    const want = gains.reduce((a, g) => a + g[r], 0);
    const takers = gains.filter((g) => g[r] > 0).length;
    if (want <= left[r]) continue;
    if (takers === 1) { const g = gains.find((x) => x[r] > 0); g[r] = left[r]; } else gains.forEach((g) => { g[r] = 0; });
  }
  gains.forEach((g, i) => g.forEach((c, r) => { s.players[i].hand[r] += c; }));
  return gains;
}

function checkWin(s) {
  if (s.phase === 'over' || s.phase === 'setup' || s.phase === 'deal') return;
  const i = s.current;
  if (points(s, i, true) >= s.target) {
    s.phase = 'over';
    s.winners = [i];
    s.offer = null;
    addLog(s, `🏆 ${nm(s, i)} reaches ${points(s, i, true)} points and wins!`);
    event(s, { kind: 'win', seat: i });
  }
}

function endTurn(s) {
  s.offer = null;
  s.freeRoads = 0;
  s.devPlayed = false;
  s.offers = 0;
  s.turn++;
  s.current = (s.current + 1) % s.players.length;
  s.phase = 'roll';
  if (s.turn >= ROUND_CAP * s.players.length) {
    const sc = s.players.map((_, i) => points(s, i, true));
    const max = Math.max(...sc);
    s.phase = 'over';
    s.winners = sc.map((x, i) => i).filter((i) => sc[i] === max);
    addLog(s, `The season ends after ${ROUND_CAP} rounds — highest score wins.`);
  }
}

function stormVictims(s, tile, seat) {
  const out = new Set();
  for (const v of TILES[tile].v) if (s.bo[v] >= 0 && s.bo[v] !== seat && sum(s.players[s.bo[v]].hand) > 0) out.add(s.bo[v]);
  return [...out];
}
export { stormVictims };

// ---------- randomness needed per action ----------

export function randomFor(s, a, seat) {
  if (!a || typeof a !== 'object') return null;
  if (a.type === 'deal' && seat === -1 && s.phase === 'deal') return dealRanges();
  if (a.type === 'roll' && seat === s.current && s.phase === 'roll') return [6, 6];
  if (a.type === 'buy' && seat === s.current && s.phase === 'main' && s.deck.length) return [s.deck.length];
  if (a.type === 'bandit' && seat === s.current && s.phase === 'robber') {
    const v = Number(a.victim);
    if (v >= 0 && v < s.players.length && v !== seat) {
      const n = sum(s.players[v].hand);
      if (n > 0) return [n];
    }
  }
  return null;
}

// ---------- actions ----------

const isRes = (r) => Number.isInteger(r) && r >= 0 && r < 5;
const isHand = (h) => Array.isArray(h) && h.length === 5 && h.every((c) => Number.isInteger(c) && c >= 0 && c <= 19);

export function apply(s0, a, seat, { now = 0, rand = null } = {}) {
  if (!a || typeof a !== 'object') throw new Error('bad action');
  if (s0.phase === 'over') throw new Error('game over');
  if (a.type === 'deal') {
    if (seat !== -1 || s0.phase !== 'deal') throw new Error('not now');
    return deal(s0, rand);
  }
  if (seat < 0 || seat >= s0.players.length) throw new Error('not a player');
  const s = structuredClone(s0);
  const me = s.players[seat];
  const cur = seat === s.current;

  // ----- things players other than the current one may do -----
  if (a.type === 'discard') {
    if (s.phase !== 'discard' || !(s.discard[seat] > 0)) throw new Error('no discard needed');
    if (!isHand(a.cards) || sum(a.cards) !== s.discard[seat] || !canPay(me.hand, a.cards)) throw new Error('bad discard');
    a.cards.forEach((c, r) => { me.hand[r] -= c; });
    s.discard[seat] = 0;
    addLog(s, `${me.name} loses ${sum(a.cards)} cards to the storm (${fmtCards(a.cards)}).`);
    if (s.discard.every((x) => !x)) { s.discard = null; s.phase = 'robber'; }
    return s;
  }
  if (a.type === 'accept' || a.type === 'decline') {
    const o = s.offer;
    if (!o || !o.to.includes(seat) || o.declined.includes(seat)) throw new Error('no offer for you');
    if (a.type === 'decline') {
      o.declined.push(seat);
      if (o.to.every((x) => o.declined.includes(x))) { s.offer = null; addLog(s, `No takers for ${nm(s, o.from)}’s offer.`); }
      return s;
    }
    const from = s.players[o.from];
    if (!canPay(me.hand, o.get)) throw new Error('you don’t have those cards');
    if (!canPay(from.hand, o.give)) throw new Error('offer no longer possible');
    for (let r = 0; r < 5; r++) {
      from.hand[r] += o.get[r] - o.give[r];
      me.hand[r] += o.give[r] - o.get[r];
    }
    s.offer = null;
    addLog(s, `${from.name} trades ${fmtCards(o.give)} to ${me.name} for ${fmtCards(o.get)}.`);
    event(s, { kind: 'trade', a: o.from, b: seat });
    return s;
  }
  if (!cur) throw new Error('not your turn');

  // ----- setup -----
  if (s.phase === 'setup') {
    const st = s.setup;
    if (a.type === 'place' && st.v < 0) {
      const v = Number(a.v);
      if (!Number.isInteger(v) || v < 0 || v >= VERTS.length || !villageSpotFree(s, v)) throw new Error('can’t build there');
      s.bo[v] = seat; s.bl[v] = 1; st.v = v;
      if (st.i >= s.players.length) {
        const got = [0, 0, 0, 0, 0];
        for (const t of VERTS[v].tiles) if (s.res[t] !== DESERT) got[s.res[t]]++;
        got.forEach((c, r) => { me.hand[r] += c; });
        addLog(s, `${me.name} settles a second village and collects ${fmtCards(got)}.`);
      } else addLog(s, `${me.name} settles a village.`);
      return s;
    }
    if (a.type === 'road' && st.v >= 0) {
      const e = Number(a.e);
      if (!legalRoads(s, seat).includes(e)) throw new Error('road must touch your new village');
      s.roads[e] = seat;
      st.v = -1;
      st.i++;
      if (st.i >= st.order.length) {
        s.setup = null;
        s.phase = 'roll';
        s.current = s.first;
        addLog(s, `Settling done — ${nm(s, s.current)} rolls first.`);
      } else s.current = st.order[st.i];
      return s;
    }
    throw new Error('place a village, then a road');
  }

  // offers are cleared by anything else the current player does
  if (s.offer && a.type !== 'cancel') s.offer = null;

  if (s.freeRoads > 0 && a.type !== 'road' && a.type !== 'stopRoads') throw new Error('place your free roads first');

  switch (a.type) {
    case 'roll': {
      if (s.phase !== 'roll') throw new Error('not time to roll');
      if (!rand || rand.length < 2) throw new Error('no dice');
      const d = [rand[0] % 6 + 1, rand[1] % 6 + 1];
      const total = d[0] + d[1];
      s.dice = d;
      s.rollNo++;
      if (total === 7) {
        s.lastProd = null;
        const need = s.players.map((p) => (sum(p.hand) > 7 ? Math.floor(sum(p.hand) / 2) : 0));
        addLog(s, `${me.name} rolls 7 — a storm gathers!`);
        event(s, { kind: 'seven', seat });
        s.after = 'main';
        if (need.some((x) => x)) { s.discard = need; s.phase = 'discard'; } else s.phase = 'robber';
      } else {
        const g = produce(s, total);
        s.lastProd = g;
        const parts = g.map((h, i) => (sum(h) ? `${nm(s, i)} ${fmtCards(h)}` : '')).filter(Boolean);
        addLog(s, `${me.name} rolls ${total}${parts.length ? ` — ${parts.join(', ')}` : ' — nobody collects'}.`);
        s.phase = 'main';
      }
      checkWin(s);
      return s;
    }
    case 'bandit': {
      if (s.phase !== 'robber') throw new Error('not now');
      const t = Number(a.tile);
      if (!Number.isInteger(t) || t < 0 || t >= TILES.length || t === s.bandit) throw new Error('move the storm to a new tile');
      const victims = stormVictims(s, t, seat);
      const v = a.victim == null ? -1 : Number(a.victim);
      if (victims.length && !victims.includes(v)) throw new Error('choose who to take from');
      if (!victims.length && v !== -1) throw new Error('nobody to take from there');
      s.bandit = t;
      let msg = `${me.name} sends the storm to ${RES_NAME[s.res[t]] || 'the Dunes'} ${s.num[t] || ''}`.trim();
      if (v >= 0) {
        const vh = s.players[v].hand;
        let k = (rand?.[0] ?? 0) % sum(vh);
        let r = 0;
        while (k >= vh[r]) { k -= vh[r]; r++; }
        vh[r]--; me.hand[r]++;
        msg += ` and takes a card from ${nm(s, v)}`;
        event(s, { kind: 'steal', seat, victim: v, res: r });
      }
      addLog(s, `${msg}.`);
      s.phase = s.after || 'main';
      s.after = null;
      checkWin(s);
      return s;
    }
    case 'road': {
      if (s.phase !== 'main') throw new Error('not now');
      const e = Number(a.e);
      if (!Number.isInteger(e) || !roadOk(s, seat, e)) throw new Error('can’t build a road there');
      if (roadCount(s, seat) >= PIECES.road) throw new Error('no roads left');
      if (s.freeRoads > 0) s.freeRoads--;
      else {
        if (!canPay(me.hand, COST.road)) throw new Error('not enough resources');
        COST.road.forEach((c, r) => { me.hand[r] -= c; });
      }
      s.roads[e] = seat;
      if (s.freeRoads > 0 && !legalRoads(s, seat).length) s.freeRoads = 0;
      addLog(s, `${me.name} builds a road.`);
      updateRoadAward(s);
      checkWin(s);
      return s;
    }
    case 'stopRoads': {
      if (!s.freeRoads) throw new Error('no free roads');
      s.freeRoads = 0;
      return s;
    }
    case 'build': {
      if (s.phase !== 'main') throw new Error('not now');
      const v = Number(a.v);
      if (a.what === 'village') {
        if (!legalVillages(s, seat).includes(v)) throw new Error('can’t build a village there');
        if (countOf(s, seat, 1) >= PIECES.village) throw new Error('no villages left');
        if (!canPay(me.hand, COST.village)) throw new Error('not enough resources');
        COST.village.forEach((c, r) => { me.hand[r] -= c; });
        s.bo[v] = seat; s.bl[v] = 1;
        addLog(s, `${me.name} builds a village.`);
        event(s, { kind: 'village', seat, v });
        updateRoadAward(s); // may cut someone's trail
      } else if (a.what === 'city') {
        if (s.bo[v] !== seat || s.bl[v] !== 1) throw new Error('upgrade one of your villages');
        if (countOf(s, seat, 2) >= PIECES.city) throw new Error('no cities left');
        if (!canPay(me.hand, COST.city)) throw new Error('not enough resources');
        COST.city.forEach((c, r) => { me.hand[r] -= c; });
        s.bl[v] = 2;
        addLog(s, `${me.name} grows a village into a city.`);
        event(s, { kind: 'city', seat, v });
      } else throw new Error('build what?');
      checkWin(s);
      return s;
    }
    case 'buy': {
      if (s.phase !== 'main') throw new Error('not now');
      if (!s.deck.length) throw new Error('no cards left');
      if (!canPay(me.hand, COST.dev)) throw new Error('not enough resources');
      COST.dev.forEach((c, r) => { me.hand[r] -= c; });
      const i = (rand?.[0] ?? 0) % s.deck.length;
      const k = s.deck[i];
      s.deck = s.deck.slice(0, i) + s.deck.slice(i + 1);
      me.dev.push({ k, t: s.turn });
      addLog(s, `${me.name} buys a discovery card.`);
      event(s, { kind: 'buy', seat, card: k });
      checkWin(s);
      return s;
    }
    case 'play': {
      const k = a.card;
      if (!DEV[k] || k === 'V') throw new Error('can’t play that');
      if (s.devPlayed) throw new Error('one card per turn');
      if (k === 'K' ? !['roll', 'main'].includes(s.phase) : s.phase !== 'main') throw new Error('not now');
      if (!playable(s, seat, k)) throw new Error('you have no such card to play (new cards wait a turn)');
      const di = me.dev.findIndex((d) => d.k === k && d.t < s.turn);
      if (k === 'P') {
        const rs = a.res;
        if (!Array.isArray(rs) || rs.length !== 2 || !rs.every(isRes)) throw new Error('pick two resources');
        const b = bank(s);
        const want = [0, 0, 0, 0, 0];
        rs.forEach((r) => { want[r]++; });
        if (want.some((c, r) => c > b[r])) throw new Error('the bank is out of that');
        want.forEach((c, r) => { me.hand[r] += c; });
        addLog(s, `${me.name} plays ${DEV.P.icon} ${DEV.P.name}: ${fmtCards(want)}.`);
      } else if (k === 'M') {
        const r = a.res;
        if (!isRes(r)) throw new Error('pick a resource');
        let got = 0;
        s.players.forEach((p, i) => { if (i !== seat) { got += p.hand[r]; p.hand[r] = 0; } });
        me.hand[r] += got;
        addLog(s, `${me.name} plays ${DEV.M.icon} ${DEV.M.name} on ${RES_NAME[r]} and collects ${got}.`);
      } else if (k === 'R') {
        const n = Math.min(2, PIECES.road - roadCount(s, seat));
        if (!n || !legalRoads(s, seat).length) throw new Error('nowhere to build roads');
        s.freeRoads = n;
        addLog(s, `${me.name} plays ${DEV.R.icon} ${DEV.R.name}.`);
      } else if (k === 'K') {
        me.knights++;
        s.after = s.phase;
        s.phase = 'robber';
        addLog(s, `${me.name} plays ${DEV.K.icon} ${DEV.K.name} (${me.knights}).`);
        const h = s.armyHolder;
        if (me.knights >= 3 && h !== seat && (h < 0 || me.knights > s.players[h].knights)) {
          s.armyHolder = seat;
          addLog(s, `${me.name} now has the Strongest Guard — +2 points.`);
        }
      }
      me.dev.splice(di, 1);
      s.devPlayed = true;
      event(s, { kind: 'play', seat, card: k, res: a.res });
      checkWin(s);
      return s;
    }
    case 'bank': {
      if (s.phase !== 'main') throw new Error('not now');
      const give = Number(a.give);
      const get = Number(a.get);
      if (!isRes(give) || !isRes(get) || give === get) throw new Error('bad trade');
      const rate = rateFor(s, seat, give);
      if (me.hand[give] < rate) throw new Error('not enough to trade');
      if (bank(s)[get] < 1) throw new Error('the bank is out of that');
      me.hand[give] -= rate;
      me.hand[get]++;
      addLog(s, `${me.name} trades ${rate}${RES_ICON[give]} with the bank for 1${RES_ICON[get]}.`);
      return s;
    }
    case 'offer': {
      if (s.phase !== 'main') throw new Error('not now');
      if (s.offers >= 3) throw new Error('three offers per turn');
      if (!isHand(a.give) || !isHand(a.get) || !sum(a.give) || !sum(a.get)) throw new Error('give and ask for something');
      if (a.give.some((c, r) => c && a.get[r])) throw new Error('can’t give and ask for the same resource');
      if (!canPay(me.hand, a.give)) throw new Error('you don’t have those cards');
      const to = [...new Set((Array.isArray(a.to) ? a.to : []).map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x < s.players.length && x !== seat);
      if (!to.length) throw new Error('offer to whom?');
      s.offers++;
      s.offerNo++;
      s.offer = { from: seat, to, give: a.give.slice(), get: a.get.slice(), declined: [], at: now, no: s.offerNo };
      addLog(s, `${me.name} offers ${fmtCards(a.give)} for ${fmtCards(a.get)}.`);
      return s;
    }
    case 'cancel': {
      if (!s.offer) throw new Error('no offer');
      s.offer = null;
      return s;
    }
    case 'end': {
      if (s.phase !== 'main') throw new Error('roll first');
      endTurn(s);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

// ---------- computer player ----------

const WANT_ORDER = ['city', 'village', 'road', 'dev'];

function vertexValue(s, v, seat, produced) {
  let val = 0;
  const kinds = new Set();
  for (const t of VERTS[v].tiles) {
    if (s.res[t] === DESERT) continue;
    const p = pip(s.num[t]) * (t === s.bandit ? 0.5 : 1);
    val += p * (s.res[t] === 4 || s.res[t] === 3 ? 1.1 : 1);
    if (!kinds.has(s.res[t])) { kinds.add(s.res[t]); if (produced && !produced[s.res[t]]) val += 1.5; }
  }
  val += kinds.size * 0.8;
  const h = VERTS[v].harbor;
  if (h >= 0) val += s.harbors[h] === -1 ? 0.8 : (produced && produced[s.harbors[h]] >= 4 ? 2 : 0.5);
  return val;
}

/** Pips of each resource the seat collects. */
export function income(s, seat) {
  const inc = [0, 0, 0, 0, 0];
  s.bo.forEach((o, v) => {
    if (o !== seat) return;
    for (const t of VERTS[v].tiles) if (s.res[t] !== DESERT && t !== s.bandit) inc[s.res[t]] += pip(s.num[t]) * s.bl[v];
  });
  return inc;
}

// first road edge of a shortest path from the seat's network to a free village spot
function roadTowardSpot(s, seat) {
  const start = [];
  const seen = new Map(); // vertex -> first edge used (null at sources)
  for (let v = 0; v < VERTS.length; v++) {
    if (s.bo[v] === seat || (s.bo[v] < 0 && VERTS[v].e.some((e) => s.roads[e] === seat))) { start.push(v); seen.set(v, null); }
  }
  const q = start.slice();
  let best = null;
  let bestVal = -1;
  let depth = 0;
  let frontier = q;
  while (frontier.length && depth < 4) {
    const next = [];
    for (const v of frontier) {
      for (const e of VERTS[v].e) {
        if (s.roads[e] >= 0) continue;
        if (s.bo[v] >= 0 && s.bo[v] !== seat) continue;
        const u = otherEnd(e, v);
        if (seen.has(u)) continue;
        const first = seen.get(v) ?? e;
        seen.set(u, first);
        next.push(u);
        if (villageSpotFree(s, u)) {
          const val = vertexValue(s, u, seat, income(s, seat)) - depth * 1.5;
          if (val > bestVal) { bestVal = val; best = first; }
        }
      }
    }
    if (best != null) return best;
    frontier = next;
    depth++;
  }
  return best;
}

function bestVillage(s, seat) {
  const inc = s.phase === 'setup' ? setupIncome(s, seat) : income(s, seat);
  let best = -1;
  let bv = -Infinity;
  for (const v of legalVillages(s, seat)) {
    const val = vertexValue(s, v, seat, inc);
    if (val > bv) { bv = val; best = v; }
  }
  return best;
}
function setupIncome(s, seat) { return income(s, seat); }

function setupRoad(s, seat) {
  let best = null;
  let bv = -Infinity;
  for (const e of legalRoads(s, seat)) {
    const u = otherEnd(e, s.setup.v);
    let val = 0;
    for (const w of VERTS[u].n) if (w !== s.setup.v && villageSpotFree(s, w)) val = Math.max(val, vertexValue(s, w, seat, null));
    if (val > bv) { bv = val; best = e; }
  }
  return best;
}

const missing = (hand, cost) => cost.map((c, r) => Math.max(0, c - hand[r]));

function goal(s, seat) {
  const p = s.players[seat];
  const opts = [];
  if (countOf(s, seat, 1) > 0 && countOf(s, seat, 2) < PIECES.city) opts.push('city');
  const hasSpot = countOf(s, seat, 1) < PIECES.village && legalVillages(s, seat).length > 0;
  if (hasSpot) opts.push('village');
  if (!opts.length || (!hasSpot && countOf(s, seat, 1) + countOf(s, seat, 2) < 5)) {
    if (roadCount(s, seat) < PIECES.road && roadTowardSpot(s, seat) != null && !hasSpot) opts.push('road');
  }
  if (!opts.length) return s.deck.length ? 'dev' : null;
  // fewest missing cards; villages win ties early on
  let best = opts[0];
  let bm = Infinity;
  for (const o of opts) {
    let m = sum(missing(p.hand, COST[o]));
    if (o === 'village' && countOf(s, seat, 1) + countOf(s, seat, 2) < 4) m -= 0.5;
    if (o === 'road') m += 0.2;
    if (m < bm) { bm = m; best = o; }
  }
  return best;
}

function leaderOf(s, seat) {
  let best = -1;
  let bp = -1;
  s.players.forEach((_, i) => { if (i !== seat && points(s, i) > bp) { bp = points(s, i); best = i; } });
  return best;
}

function stormMove(s, seat) {
  let best = null;
  let bv = -Infinity;
  TILES.forEach((t, ti) => {
    if (ti === s.bandit) return;
    let val = 0;
    let mineHere = false;
    for (const v of t.v) {
      if (s.bo[v] < 0) continue;
      if (s.bo[v] === seat) { mineHere = true; continue; }
      val += pip(s.num[ti]) * s.bl[v] * (1 + points(s, s.bo[v]) / 3) + (sum(s.players[s.bo[v]].hand) ? 1 : 0);
    }
    if (mineHere) val -= 20;
    if (val > bv) { bv = val; best = ti; }
  });
  const victims = stormVictims(s, best, seat);
  let victim = -1;
  let vp = -1;
  for (const v of victims) {
    const sc = points(s, v) * 10 + sum(s.players[v].hand);
    if (sc > vp) { vp = sc; victim = v; }
  }
  return { type: 'bandit', tile: best, victim };
}

function chooseDiscard(s, seat) {
  const n = s.discard[seat];
  const hand = s.players[seat].hand.slice();
  const g = goal(s, seat);
  const need = g ? COST[g] : [0, 0, 0, 0, 0];
  const out = [0, 0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    let br = -1;
    let bv = -Infinity;
    for (let r = 0; r < 5; r++) {
      if (!hand[r]) continue;
      const v = hand[r] - need[r] * 1.5;
      if (v > bv) { bv = v; br = r; }
    }
    hand[br]--; out[br]++;
  }
  return out;
}

function offerValue(s, seat, gets, gives) {
  // seat receives `gets` and pays `gives`
  const p = s.players[seat];
  const g = goal(s, seat);
  const need = g ? COST[g] : [0, 0, 0, 0, 0];
  let val = 0;
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < gets[r]; k++) val += p.hand[r] + k < need[r] ? 1 : 0.3;
    for (let k = 0; k < gives[r]; k++) val -= p.hand[r] - k <= need[r] ? 1.2 : 0.3;
  }
  return val;
}

/** One legal action for the computer player in `seat`, or null. */
export function botAction(s, seat, now = 0) {
  if (s.phase === 'over' || s.phase === 'deal') return null;
  const p = s.players[seat];
  if (s.phase === 'discard') return s.discard[seat] > 0 ? { type: 'discard', cards: chooseDiscard(s, seat) } : null;
  // answer offers made to me
  if (s.offer && s.offer.to.includes(seat) && !s.offer.declined.includes(seat)) {
    const o = s.offer;
    const ok = sum(o.get) && o.get.every((c, r) => p.hand[r] >= c) && points(s, o.from) < s.target - 2
      && offerValue(s, seat, o.give, o.get) >= 0 && sum(o.give) >= sum(o.get);
    return { type: ok ? 'accept' : 'decline' };
  }
  if (seat !== s.current) return null;
  if (s.phase === 'setup') {
    if (s.setup.v < 0) return { type: 'place', v: bestVillage(s, seat) };
    return { type: 'road', e: setupRoad(s, seat) };
  }
  if (s.offer) return s.offer.from === seat && now - s.offer.at > 8000 ? { type: 'cancel' } : null;
  if (s.phase === 'robber') return stormMove(s, seat);
  const stormOnMe = TILES[s.bandit].v.some((v) => s.bo[v] === seat);
  if (s.phase === 'roll') {
    if (!s.devPlayed && playable(s, seat, 'K') && (stormOnMe || p.knights >= 2)) return { type: 'play', card: 'K' };
    return { type: 'roll' };
  }
  if (s.phase !== 'main') return null;
  if (s.freeRoads > 0) {
    const e = roadTowardSpot(s, seat) ?? legalRoads(s, seat)[0];
    return e != null ? { type: 'road', e } : { type: 'stopRoads' };
  }
  const hand = p.hand;
  const g = goal(s, seat);
  // discovery cards
  if (!s.devPlayed) {
    if (playable(s, seat, 'K') && stormOnMe) return { type: 'play', card: 'K' };
    if (playable(s, seat, 'M')) {
      let br = -1;
      let bc = 2;
      for (let r = 0; r < 5; r++) {
        const c = s.players.reduce((a, q, i) => a + (i === seat ? 0 : q.hand[r]), 0);
        if (c > bc) { bc = c; br = r; }
      }
      if (br >= 0) return { type: 'play', card: 'M', res: br };
    }
    if (playable(s, seat, 'P') && g) {
      const m = missing(hand, COST[g]);
      const rs = [];
      const b = bank(s);
      for (let r = 0; r < 5 && rs.length < 2; r++) for (let k = 0; k < m[r] && rs.length < 2; k++) if (b[r] > rs.filter((x) => x === r).length) rs.push(r);
      for (const r of [4, 3, 0, 1, 2]) if (rs.length < 2 && b[r] > rs.filter((x) => x === r).length) rs.push(r);
      if (rs.length === 2) return { type: 'play', card: 'P', res: rs };
    }
    if (playable(s, seat, 'R') && roadCount(s, seat) < PIECES.road - 1 && roadTowardSpot(s, seat) != null) return { type: 'play', card: 'R' };
    if (playable(s, seat, 'K') && p.knights >= 1) return { type: 'play', card: 'K' };
  }
  // build
  const cities = legalCities(s, seat);
  if (cities.length && countOf(s, seat, 2) < PIECES.city && canPay(hand, COST.city)) {
    const inc = (v) => VERTS[v].tiles.reduce((a, t) => a + pip(s.num[t]), 0);
    return { type: 'build', what: 'city', v: cities.sort((x, y) => inc(y) - inc(x))[0] };
  }
  if (countOf(s, seat, 1) < PIECES.village && canPay(hand, COST.village)) {
    const v = bestVillage(s, seat);
    if (v >= 0) return { type: 'build', what: 'village', v };
  }
  if (canPay(hand, COST.road) && roadCount(s, seat) < PIECES.road && (g === 'road' || g === 'dev' || g == null || sum(hand) > 7)) {
    const e = roadTowardSpot(s, seat) ?? (legalRoads(s, seat).length && (g === 'dev' || g == null) ? legalRoads(s, seat)[0] : null);
    if (e != null && (g !== 'village' || !legalVillages(s, seat).length)) return { type: 'road', e };
  }
  // trade toward the goal
  if (g) {
    const need = COST[g];
    const m = missing(hand, need);
    const b = bank(s);
    if (sum(m)) {
      for (let r = 0; r < 5; r++) {
        if (!m[r] || b[r] < 1) continue;
        let give = -1;
        let spare = 0;
        for (let x = 0; x < 5; x++) {
          const extra = hand[x] - need[x] - rateFor(s, seat, x);
          if (x !== r && extra >= 0 && extra + 1 > spare) { spare = extra + 1; give = x; }
        }
        if (give >= 0) return { type: 'bank', give, get: r };
      }
      if (s.offers === 0 && sum(m) === 1) {
        const r = m.findIndex((c) => c > 0);
        let give = -1;
        let spare = 0;
        for (let x = 0; x < 5; x++) if (x !== r && hand[x] - need[x] > spare) { spare = hand[x] - need[x]; give = x; }
        const to = s.players.map((_, i) => i).filter((i) => i !== seat);
        if (give >= 0) {
          const gv = [0, 0, 0, 0, 0];
          const gt = [0, 0, 0, 0, 0];
          gv[give] = 1; gt[r] = 1;
          return { type: 'offer', to, give: gv, get: gt };
        }
      }
    }
  }
  if (s.deck.length && canPay(hand, COST.dev) && (g !== 'city' || hand[4] >= 4 || sum(hand) > 7)) return { type: 'buy' };
  return { type: 'end' };
}
export { WANT_ORDER };
