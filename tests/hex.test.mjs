import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../js/engines/hex.js';
import hex from '../js/games/hex.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

// apply through the plugin with exactly the random ints randomFor asks for
function act(s, a, seat, rand, now = 0) {
  const ranges = hex.randomFor(s, a, seat);
  const r = ranges?.length ? (rand || randFor(ranges)) : null;
  if (r) r.forEach((v, i) => assert.ok(v >= 0 && v < ranges[i], `rand ${v} out of range ${ranges[i]}`));
  return hex.apply(s, a, seat, { now, rand: r });
}
const dealt = (n = 3, opts = {}) => act(hex.setup(P(n), opts, { now: 0, first: 0 }), { type: 'deal' }, -1);

// play the setup with the bots' choices
function afterSetup(n = 3) {
  let s = dealt(n);
  while (s.phase === 'setup') s = act(s, H.botAction(s, s.current), s.current);
  return s;
}
// a clean mid-game board: no pieces, chosen hands, main phase for seat 0
function blank(n = 3) {
  const s = structuredClone(afterSetup(n));
  s.bo.fill(-1); s.bl.fill(0); s.roads.fill(-1);
  s.players.forEach((p) => { p.hand = [0, 0, 0, 0, 0]; });
  s.phase = 'main'; s.current = 0; s.roadHolder = -1; s.armyHolder = -1;
  return s;
}
// a simple chain of `len` edges starting at `from` (depth-first search)
function path(from, len) {
  const verts = [from];
  const edges = [];
  const go = () => {
    if (edges.length === len) return true;
    const v = verts[verts.length - 1];
    for (const e of H.VERTS[v].e) {
      const u = H.otherEnd(e, v);
      if (verts.includes(u)) continue;
      verts.push(u); edges.push(e);
      if (go()) return true;
      verts.pop(); edges.pop();
    }
    return false;
  };
  assert.ok(go());
  return { verts, edges };
}

test('geometry: 19 tiles, 54 corners, 72 edges, 30 coast edges, 9 harbors', () => {
  assert.equal(H.TILES.length, 19);
  assert.equal(H.VERTS.length, 54);
  assert.equal(H.EDGES.length, 72);
  assert.equal(H.COAST.length, 30);
  assert.equal(new Set(H.HARBOR_EDGES).size, 9);
  assert.equal(H.VERTS.filter((v) => v.harbor >= 0).length, 18, 'harbors share no corner');
  for (const v of H.VERTS) assert.ok(v.n.length >= 2 && v.n.length <= 3);
});

test('deal: random island with the right tiles, tokens, harbors; never adjacent 6/8', () => {
  for (let k = 0; k < 300; k++) {
    const s = dealt(3);
    const cnt = [0, 0, 0, 0, 0, 0];
    s.res.forEach((r) => cnt[r]++);
    assert.deepEqual(cnt, [4, 3, 4, 4, 3, 1]);
    const d = s.res.indexOf(H.DESERT);
    assert.equal(s.num[d], 0);
    assert.equal(s.bandit, d);
    assert.deepEqual(s.num.filter(Boolean).sort((a, b) => a - b), [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    H.TILES.forEach((t, i) => {
      if (s.num[i] !== 6 && s.num[i] !== 8) return;
      for (const j of t.n) assert.ok(s.num[j] !== 6 && s.num[j] !== 8, 'red numbers apart');
    });
    assert.deepEqual(s.harbors.slice().sort(), [-1, -1, -1, -1, 0, 1, 2, 3, 4].sort());
    assert.equal(s.phase, 'setup');
  }
  assert.equal(hex.tick(hex.setup(P(2), {}, { first: 0 }), {}).type, 'deal');
  assert.throws(() => hex.apply(hex.setup(P(2), {}, { first: 0 }), { type: 'deal' }, 0, { rand: null }));
});

test('setup: snake order, distance rule, road beside the new village, second village pays', () => {
  let s = dealt(3);
  assert.deepEqual(s.setup.order, [0, 1, 2, 2, 1, 0]);
  const v0 = 0;
  assert.throws(() => act(s, { type: 'road', e: 0 }, 0), /village/);
  assert.throws(() => act(s, { type: 'place', v: v0 }, 1), /turn/);
  s = act(s, { type: 'place', v: v0 }, 0);
  const farEdge = H.EDGES.findIndex((e) => e.a !== v0 && e.b !== v0);
  assert.throws(() => act(s, { type: 'road', e: farEdge }, 0), /touch/);
  s = act(s, { type: 'road', e: H.VERTS[v0].e[0] }, 0);
  assert.equal(s.current, 1);
  assert.throws(() => act(s, { type: 'place', v: H.VERTS[v0].n[0] }, 1), /can’t build/, 'distance rule');
  assert.deepEqual(s.players[0].hand, [0, 0, 0, 0, 0], 'first village pays nothing');
  // finish with bots and check the second village paid
  while (s.phase === 'setup') {
    const seat = s.current;
    const second = s.setup.i >= 3 && s.setup.v < 0;
    const a = H.botAction(s, seat);
    const before = H.sum(s.players[seat].hand);
    s = act(s, a, seat);
    if (second) {
      const exp = H.VERTS[a.v].tiles.filter((t) => s.res[t] !== H.DESERT).length;
      assert.equal(H.sum(s.players[seat].hand) - before, exp);
    }
  }
  assert.equal(s.phase, 'roll');
  assert.equal(s.current, 0);
  s.players.forEach((_, i) => { assert.equal(H.countOf(s, i, 1), 2); assert.equal(H.roadCount(s, i), 2); });
});

test('production: villages 1, cities 2, storm tile pays nothing, bank shortage', () => {
  const s = blank(3);
  const t = H.TILES.findIndex((_, i) => s.num[i] === 8);
  const t2 = H.TILES.findIndex((_, i) => i !== t && s.num[i] === 8);
  const corners = H.TILES[t].v.filter((v) => !H.TILES[t2].v.includes(v));
  const a = corners[0];
  const c = corners.find((v) => v !== a && !H.VERTS[a].n.includes(v));
  s.bo[a] = 0; s.bl[a] = 1; s.bo[c] = 1; s.bl[c] = 2;
  s.phase = 'roll';
  s.bandit = s.res.indexOf(H.DESERT);
  const r = s.res[t];
  let n = act(s, { type: 'roll' }, 0, [2, 4]); // 3 + 5
  assert.equal(n.players[0].hand[r], 1);
  assert.equal(n.players[1].hand[r], 2);
  assert.equal(n.phase, 'main');
  assert.deepEqual(n.dice, [3, 5]);
  s.bandit = t;
  n = act(s, { type: 'roll' }, 0, [2, 4]);
  assert.equal(H.sum(n.players[0].hand) + H.sum(n.players[1].hand), 0, 'storm blocks the tile');
  // the bank has 1 left and two players want it: nobody gets it
  s.bandit = s.res.indexOf(H.DESERT);
  s.players[2].hand[r] = 18;
  n = act(s, { type: 'roll' }, 0, [2, 4]);
  assert.equal(n.players[0].hand[r] + n.players[1].hand[r], 0);
});

test('rolling 7: discards half (simultaneous) then storm move and steal', () => {
  const s = blank(3);
  s.phase = 'roll';
  s.players[0].hand = [2, 2, 2, 2, 1]; // 9 -> discard 4
  s.players[1].hand = [1, 1, 1, 1, 1]; // 5 -> keep
  s.players[2].hand = [4, 4, 0, 0, 0]; // 8 -> discard 4
  let n = act(s, { type: 'roll' }, 0, [2, 3]);
  assert.equal(n.phase, 'discard');
  assert.deepEqual(n.discard, [4, 0, 4]);
  assert.throws(() => act(n, { type: 'discard', cards: [1, 0, 0, 0, 0] }, 1), /no discard/);
  assert.throws(() => act(n, { type: 'discard', cards: [1, 1, 1, 0, 0] }, 2), /bad/);
  assert.throws(() => act(n, { type: 'bandit', tile: 0, victim: -1 }, 0), /not now/);
  n = act(n, { type: 'discard', cards: [2, 2, 0, 0, 0] }, 2);
  assert.equal(n.phase, 'discard');
  n = act(n, { type: 'discard', cards: [1, 1, 1, 1, 0] }, 0);
  assert.equal(n.phase, 'robber');
  assert.equal(H.sum(n.players[0].hand), 5);
  // put seat 1's village on a tile and steal from them
  const t = H.TILES.findIndex((_, i) => i !== n.bandit);
  n.bo[H.TILES[t].v[0]] = 1; n.bl[H.TILES[t].v[0]] = 1;
  assert.throws(() => act(n, { type: 'bandit', tile: n.bandit, victim: -1 }, 0), /new tile/);
  assert.throws(() => act(n, { type: 'bandit', tile: t, victim: -1 }, 0), /choose/);
  assert.deepEqual(hex.randomFor(n, { type: 'bandit', tile: t, victim: 1 }, 0), [5]);
  const m = act(n, { type: 'bandit', tile: t, victim: 1 }, 0, [4]);
  assert.equal(m.bandit, t);
  assert.equal(H.sum(m.players[1].hand), 4);
  assert.equal(m.players[0].hand[4], n.players[0].hand[4] + 1, '5th card is ore');
  assert.equal(m.phase, 'main');
  assert.equal(m.ev.kind, 'steal');
  assert.ok(!m.log.at(-1).includes('🪨'), 'log does not reveal the stolen card');
});

test('building: costs, distance rule, road connection, city upgrade, piece limits', () => {
  let s = blank(2);
  const { verts, edges } = path(0, 3);
  s.bo[verts[0]] = 0; s.bl[verts[0]] = 1;
  assert.throws(() => act(s, { type: 'road', e: edges[0] }, 0), /resources/);
  s.players[0].hand = [5, 5, 2, 4, 3];
  assert.throws(() => act(s, { type: 'road', e: edges[1] }, 0), /can’t build/, 'roads must connect');
  s = act(s, { type: 'road', e: edges[0] }, 0);
  assert.throws(() => act(s, { type: 'build', what: 'village', v: verts[1] }, 0), /can’t build/, 'too close');
  s = act(s, { type: 'road', e: edges[1] }, 0);
  s = act(s, { type: 'build', what: 'village', v: verts[2] }, 0);
  assert.equal(H.countOf(s, 0, 1), 2);
  assert.deepEqual(s.players[0].hand, [2, 2, 1, 3, 3]);
  assert.throws(() => act(s, { type: 'build', what: 'city', v: verts[1] }, 0), /upgrade/);
  s = act(s, { type: 'build', what: 'city', v: verts[2] }, 0);
  assert.equal(s.bl[verts[2]], 2);
  assert.equal(H.points(s, 0), 3);
  // an opponent's road can't pass through my village
  const t = structuredClone(s);
  t.current = 1; t.players[1].hand = [3, 3, 0, 0, 0];
  const e3 = edges[2];
  t.roads[edges[1]] = -1; t.roads[edges[0]] = -1;
  t.roads[H.VERTS[verts[2]].e.find((x) => x !== e3 && x !== edges[1]) ?? e3] = 1;
  assert.ok(!H.legalRoads(t, 1).includes(edges[1]) || H.VERTS[verts[2]].e.length < 3);
  // limits
  const u = structuredClone(s);
  for (let k = 0, n = 0; n < 15 && k < 72; k++) if (u.roads[k] < 0) { u.roads[k] = 0; n++; }
  u.players[0].hand = [5, 5, 0, 0, 0];
  assert.deepEqual(H.legalRoads(u, 0), []);
});

test('bank and harbor trades', () => {
  let s = blank(2);
  s.players[0].hand = [4, 3, 0, 0, 0];
  assert.equal(H.rateFor(s, 0, 0), 4);
  s = act(s, { type: 'bank', give: 0, get: 4 }, 0);
  assert.deepEqual(s.players[0].hand, [0, 3, 0, 0, 1]);
  assert.throws(() => act(s, { type: 'bank', give: 1, get: 4 }, 0), /not enough/);
  const hi = s.harbors.indexOf(-1);
  const hv = H.EDGES[H.HARBOR_EDGES[hi]].a;
  s.bo[hv] = 0; s.bl[hv] = 1;
  assert.equal(H.rateFor(s, 0, 1), 3);
  s = act(s, { type: 'bank', give: 1, get: 2 }, 0);
  assert.deepEqual(s.players[0].hand, [0, 0, 1, 0, 1]);
  const h2 = s.harbors.indexOf(3);
  const v2 = H.EDGES[H.HARBOR_EDGES[h2]].b;
  s.bo[v2] = 0; s.bl[v2] = 1;
  assert.equal(H.rateFor(s, 0, 3), 2);
  assert.equal(H.rateFor(s, 0, 0), 3);
});

test('player offers: accept swaps cards, declines from everyone cancel, only one target may answer', () => {
  let s = blank(3);
  s.players[0].hand = [2, 0, 0, 0, 0];
  s.players[1].hand = [0, 0, 0, 1, 0];
  s.players[2].hand = [0, 0, 0, 1, 0];
  const give = [1, 0, 0, 0, 0];
  const get = [0, 0, 0, 1, 0];
  assert.throws(() => act(s, { type: 'offer', to: [1], give: [3, 0, 0, 0, 0], get }, 0), /don’t have/);
  assert.throws(() => act(s, { type: 'offer', to: [1], give, get }, 1), /turn/);
  s = act(s, { type: 'offer', to: [1], give, get }, 0);
  assert.throws(() => act(s, { type: 'accept' }, 2), /no offer/);
  let a = act(s, { type: 'accept' }, 1);
  assert.deepEqual(a.players[0].hand, [1, 0, 0, 1, 0]);
  assert.deepEqual(a.players[1].hand, [1, 0, 0, 0, 0]);
  assert.equal(a.offer, null);
  // to everyone, both decline
  s = act(a, { type: 'offer', to: [1, 2], give, get }, 0);
  s = act(s, { type: 'decline' }, 2);
  assert.ok(s.offer);
  s = act(s, { type: 'decline' }, 1);
  assert.equal(s.offer, null);
  // offers per turn are capped
  s = act(s, { type: 'offer', to: [2], give, get }, 0);
  assert.throws(() => act(s, { type: 'offer', to: [2], give, get }, 0), /three/);
  // the proposer doing anything else withdraws the offer
  s = act(s, { type: 'cancel' }, 0);
  assert.equal(s.offer, null);
});

test('discovery cards: buy, wait a turn, one per turn; each card works', () => {
  let s = blank(3);
  s.players[0].hand = [0, 0, 1, 1, 1];
  const deck = s.deck;
  s = act(s, { type: 'buy' }, 0, [0]);
  assert.equal(s.players[0].dev[0].k, deck[0]);
  assert.equal(s.deck.length, deck.length - 1);
  s.players[0].dev = [{ k: 'P', t: s.turn }];
  assert.throws(() => act(s, { type: 'play', card: 'P', res: [0, 1] }, 0), /wait/);
  s.players[0].dev = [{ k: 'P', t: -1 }, { k: 'M', t: -1 }, { k: 'R', t: -1 }, { k: 'K', t: -1 }, { k: 'K', t: -1 }, { k: 'K', t: -1 }, { k: 'V', t: -1 }];
  assert.equal(H.points(s, 0, true) - H.points(s, 0), 1, 'landmark is a hidden point');
  let n = act(s, { type: 'play', card: 'P', res: [4, 4] }, 0);
  assert.equal(n.players[0].hand[4], 2);
  assert.throws(() => act(n, { type: 'play', card: 'M', res: 4 }, 0), /one card/);
  assert.throws(() => act(s, { type: 'play', card: 'V' }, 0), /can’t play/);
  // monopoly
  s.players[1].hand = [0, 0, 3, 0, 0]; s.players[2].hand = [0, 0, 2, 1, 0];
  n = act(s, { type: 'play', card: 'M', res: 2 }, 0);
  assert.equal(n.players[0].hand[2], 5);
  assert.equal(n.players[1].hand[2] + n.players[2].hand[2], 0);
  // pathfinders: 2 free roads
  s.bo[0] = 0; s.bl[0] = 1;
  n = act(s, { type: 'play', card: 'R' }, 0);
  assert.equal(n.freeRoads, 2);
  assert.throws(() => act(n, { type: 'end' }, 0), /free roads/);
  n = act(n, { type: 'road', e: H.legalRoads(n, 0)[0] }, 0);
  n = act(n, { type: 'road', e: H.legalRoads(n, 0)[0] }, 0);
  assert.equal(n.freeRoads, 0);
  assert.equal(H.roadCount(n, 0), 2);
  assert.deepEqual(n.players[0].hand, s.players[0].hand, 'roads were free');
  // watchman before rolling, then back to roll; 3 watchmen -> strongest guard
  let k = structuredClone(s);
  k.phase = 'roll';
  k.players[0].knights = 2;
  k = act(k, { type: 'play', card: 'K' }, 0);
  assert.equal(k.phase, 'robber');
  assert.equal(k.armyHolder, 0);
  assert.equal(H.points(k, 0), 1 + 2);
  const tile = H.TILES.findIndex((_, i) => i !== k.bandit && !H.stormVictims(k, i, 0).length);
  k = act(k, { type: 'bandit', tile, victim: -1 }, 0);
  assert.equal(k.phase, 'roll');
  assert.throws(() => act(k, { type: 'play', card: 'K' }, 0), /one card/);
});

test('longest road: 5+ needed, ties keep the holder, an opponent village cuts it', () => {
  let s = blank(2);
  const { verts, edges } = path(0, 6);
  s.bo[verts[0]] = 0; s.bl[verts[0]] = 1;
  s.players[0].hand = [10, 10, 0, 0, 0];
  for (let i = 0; i < 4; i++) s = act(s, { type: 'road', e: edges[i] }, 0);
  assert.equal(H.longestRoad(s, 0), 4);
  assert.equal(s.roadHolder, -1);
  s = act(s, { type: 'road', e: edges[4] }, 0);
  assert.equal(H.longestRoad(s, 0), 5);
  assert.equal(s.roadHolder, 0);
  assert.equal(H.points(s, 0), 3);
  // a branch doesn't add length
  const branch = H.VERTS[verts[2]].e.find((e) => !edges.includes(e) && s.roads[e] < 0);
  if (branch != null) { s = act(s, { type: 'road', e: branch }, 0); assert.equal(H.longestRoad(s, 0), 5); }
  // seat 1 ties with 5: the holder keeps it
  let tieChecked = false;
  const far = path(53, 5);
  const t = structuredClone(s);
  if (far.edges.every((e) => t.roads[e] < 0) && far.verts.every((v) => !verts.includes(v))) {
    t.current = 1;
    t.bo[far.verts[0]] = 1; t.bl[far.verts[0]] = 1;
    t.players[1].hand = [10, 10, 0, 0, 0];
    let w = t;
    for (const e of far.edges) w = act(w, { type: 'road', e }, 1);
    assert.equal(H.longestRoad(w, 1), 5);
    assert.equal(w.roadHolder, 0, 'tie keeps the holder');
    tieChecked = true;
  }
  assert.ok(tieChecked, 'tie case ran');
  // an opponent village in the middle cuts the trail -> award lost
  const u = structuredClone(s);
  u.bo[verts[3]] = 1; u.bl[verts[3]] = 1;
  assert.equal(H.longestRoad(u, 0), 3);
  u.current = 1; u.players[1].hand = [1, 1, 0, 0, 0];
  const r1 = H.legalRoads(u, 1)[0];
  const w = act(u, { type: 'road', e: r1 }, 1);
  assert.equal(w.roadHolder, -1);
});

test('win: reaching the target on your turn ends the game (hidden points count)', () => {
  let s = blank(2);
  s.target = 8;
  const spots = [];
  for (let v = 0; v < 54 && spots.length < 4; v++) if (spots.every((x) => x !== v && !H.VERTS[x].n.includes(v))) spots.push(v);
  spots.forEach((v) => { s.bo[v] = 0; s.bl[v] = 2; }); // 8 points minus one city below
  s.bl[spots[0]] = 1; // 7 points
  s.players[0].dev = [{ k: 'V', t: -1 }];
  s.players[0].hand = [0, 0, 0, 0, 0];
  s.phase = 'roll';
  s = act(s, { type: 'roll' }, 0, [0, 0]);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [0]);
  const r = hex.results(s);
  assert.equal(r.over, true);
  assert.equal(r.rows[0].score, 8);
  assert.ok(r.rows[0].win && !r.rows[1].win);
  assert.throws(() => act(s, { type: 'end' }, 0), /over/);
});

test('options: points to win 8 / 10 / 12', () => {
  assert.equal(hex.setup(P(2), { target: '8' }, { first: 0 }).target, 8);
  assert.equal(hex.setup(P(2), { target: '12' }, { first: 1 }).target, 12);
  assert.equal(hex.setup(P(2), {}, { first: 0 }).target, 10);
});

// ---------- computer players: complete legal games (copied from bots.test.mjs) ----------
function playOut(g, nPlayers, opts = {}, maxSteps = 20000) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  let s = g.setup(players, opts, { now: 0, first: 0 });
  let now = 0;
  const apply = (a, seat) => {
    const ranges = g.randomFor?.(s, a, seat);
    s = g.apply(s, a, seat, { now, rand: ranges?.length ? randFor(ranges) : null });
  };
  for (let step = 0; step < maxSteps; step++) {
    if (g.results(s).over) return { s, step };
    now += 1000;
    const sys = g.tick?.(s, { now: now + 1e9 });
    if (sys) { apply(sys, -1); continue; }
    let moved = false;
    for (let seat = 0; seat < nPlayers && !moved; seat++) {
      const a = g.bot(s, seat, { now });
      if (!a) continue;
      try { apply(a, seat); } catch (e) { throw new Error(`bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
    }
    if (!moved) throw new Error(`nobody can move (phase ${s.phase})`);
  }
  throw new Error('game did not finish');
}

test('computer players finish 90 games legally (2–4 players, every target)', () => {
  let capped = 0;
  let trades = 0;
  for (let k = 0; k < 90; k++) {
    const { s } = playOut(hex, 2 + (k % 3), { target: ['8', '10', '12'][k % 3] });
    assert.equal(s.phase, 'over');
    if (s.log.some((l) => l.includes('season ends'))) capped++;
    else assert.ok(H.points(s, s.winners[0], true) >= s.target);
    trades += s.log.filter((l) => l.includes(' trades ')).length;
  }
  assert.ok(capped <= 2, `${capped} games hit the round cap`);
  assert.ok(trades > 0, 'bots trade');
});
