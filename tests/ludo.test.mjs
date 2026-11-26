import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/engines/ludo.js';
import ludo from '../js/games/ludo.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const roll = (s, v, now = 0) => L.applyAction(s, { type: 'roll' }, [v], now);
const move = (s, t) => L.applyAction(s, { type: 'move', token: t });
const withTokens = (s, seat, tokens) => { const c = structuredClone(s); c.players[seat].tokens = tokens; return c; };

test('board geometry: 52-square loop of adjacent cells, home columns lead to the centre', () => {
  assert.equal(L.TRACK.length, 52);
  assert.equal(new Set(L.TRACK.map(String)).size, 52);
  for (let i = 0; i < 52; i++) {
    const [a, b] = [L.TRACK[i], L.TRACK[(i + 1) % 52]];
    // neighbours share an edge, except the four inner corners of the cross, which touch diagonally
    assert.equal(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])), 1, `squares ${i} and ${i + 1} touch`);
  }
  for (let ci = 0; ci < 4; ci++) {
    const last = L.cellOf(ci, 50);
    const lane = L.cellOf(ci, 51);
    assert.equal(Math.abs(last[0] - lane[0]) + Math.abs(last[1] - lane[1]), 1, 'lane starts next to the last loop square');
    const end = L.cellOf(ci, 55);
    assert.ok(Math.abs(end[0] - 7) + Math.abs(end[1] - 7) === 2, 'lane ends next to the centre');
    const start = L.cellOf(ci, 0);
    const [br, bc] = L.BASE_CORNER[ci];
    assert.ok(Math.abs(start[0] - (br + 2.5)) <= 4.5 && Math.abs(start[1] - (bc + 2.5)) <= 4.5, 'start square beside own base');
  }
  assert.equal(L.cellOf(0, -1), null);
  assert.equal(L.cellOf(0, 56), null);
});

test('2 players sit opposite; option sets play-until', () => {
  const s = ludo.setup(P(2), { until: 'all' }, { now: 0, first: 1 });
  assert.deepEqual(s.players.map((p) => p.color), [0, 2]);
  assert.equal(s.until, 'all');
  assert.equal(s.current, 1);
  assert.deepEqual(ludo.setup(P(4), {}, { now: 0, first: 0 }).players.map((p) => p.color), [0, 1, 2, 3]);
});

test('need a 6 to come out; no move passes after a pause via tick', () => {
  let s = L.newGame(P(2));
  s = roll(s, 3, 1000);
  assert.equal(s.phase, 'pass');
  assert.equal(s.event, 'nomove');
  assert.equal(ludo.tick(s, { now: 1000 }), null);
  const a = ludo.tick(s, { now: 1000 + L.PASS_MS });
  assert.deepEqual(a, { type: 'pass' });
  assert.throws(() => ludo.apply(s, a, 0, { now: 0 }), 'players cannot pass by themselves');
  s = ludo.apply(s, a, -1, { now: 5000 });
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'roll');
});

test('a 6 brings a token out (auto when all in base) and gives another roll', () => {
  let s = L.newGame(P(2));
  s = roll(s, 6, 0);
  assert.equal(s.phase, 'move');
  assert.deepEqual(s.legal, [0, 1, 2, 3]);
  assert.equal(s.auto, 0, 'all base tokens are the same move');
  const a = ludo.tick(s, { now: L.AUTO_MS });
  assert.deepEqual(a, { type: 'move', token: 0 });
  assert.throws(() => ludo.apply(s, { type: 'move', token: 1 }, -1, { now: 0 }), /system/);
  s = ludo.apply(s, a, -1, { now: L.AUTO_MS });
  assert.equal(s.players[0].tokens[0], 0);
  assert.equal(s.phase, 'roll');
  assert.equal(s.current, 0, 'bonus roll');
  assert.equal(s.bonus, 'six');
  s = roll(s, 4);
  assert.equal(s.auto, 0, 'only one token can move');
  s = move(s, 0);
  assert.equal(s.players[0].tokens[0], 4);
  assert.equal(s.current, 1);
});

test('two different choices are not automatic; illegal tokens rejected', () => {
  let s = withTokens(L.newGame(P(2)), 0, [5, -1, -1, -1]);
  s = roll(s, 6);
  assert.deepEqual(s.legal, [0, 1, 2, 3]);
  assert.equal(s.auto, null);
  assert.equal(ludo.tick(s, { now: 1e12 }), null);
  s = withTokens(L.newGame(P(2)), 0, [5, -1, -1, 56]);
  s = roll(s, 2);
  assert.throws(() => move(s, 1));
  assert.throws(() => move(s, 3));
  assert.throws(() => ludo.apply(s, { type: 'move', token: 0 }, 1, { now: 0 }), /not your turn/);
});

test('three 6s in a row forfeits the turn', () => {
  let s = withTokens(L.newGame(P(2)), 0, [10, 20, -1, -1]);
  s = move(roll(s, 6), 0);
  s = move(roll(s, 6), 0);
  assert.equal(s.sixes, 2);
  s = roll(s, 6);
  assert.equal(s.phase, 'pass');
  assert.equal(s.event, 'three6');
  s = L.applyAction(s, { type: 'pass' });
  assert.equal(s.current, 1);
  assert.equal(s.sixes, 0);
});

test('capture sends the opponent home and gives a bonus roll; safe squares protect', () => {
  // red (seat 0) at progress 10 = loop 10; yellow (seat 1, colour 2) token on loop 13? that is green start (safe)
  let s = L.newGame(P(2));
  // yellow progress p has loop index (p + 26) % 52; put it on loop 14 → p = 40
  s = withTokens(s, 1, [40, -1, -1, -1]);
  s = withTokens(s, 0, [10, -1, -1, -1]);
  s = move(roll(s, 4), 0);
  assert.equal(s.players[0].tokens[0], 14);
  assert.equal(s.players[1].tokens[0], -1, 'captured');
  assert.equal(s.event, 'capture');
  assert.equal(s.current, 0);
  assert.equal(s.phase, 'roll');
  assert.equal(s.bonus, 'capture');
  assert.deepEqual(s.lastMove.captured, [{ seat: 1, token: 0, from: 40 }]);
  // on a star (loop 8) nobody can be captured
  s = withTokens(L.newGame(P(2)), 1, [(8 - 26 + 52) % 52, -1, -1, -1]);
  s = withTokens(s, 0, [5, -1, -1, -1]);
  s = move(roll(s, 3), 0);
  assert.equal(s.players[1].tokens[0], 34);
  assert.equal(s.current, 1, 'no bonus');
  // on an opponent's start square: safe as well
  s = withTokens(L.newGame(P(2)), 1, [0, -1, -1, -1]); // yellow start = loop 26
  s = withTokens(s, 0, [24, -1, -1, -1]);
  s = move(roll(s, 2), 0);
  assert.equal(s.players[1].tokens[0], 0);
});

test('exact roll to reach home; finishing wins (first mode) or plays on (all mode)', () => {
  let s = withTokens(L.newGame(P(2)), 0, [54, 56, 56, 56]);
  s = roll(s, 3);
  assert.equal(s.phase, 'pass', 'overshoot is not allowed');
  s = withTokens(L.newGame(P(2)), 0, [54, 56, 56, 56]);
  s = move(roll(s, 2), 0);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [0]);
  let r = ludo.results(s);
  assert.equal(r.over, true);
  assert.deepEqual(r.rows.map((x) => [x.score, x.win]), [[4, true], [0, false]]);

  s = withTokens(L.newGame(P(3), { until: 'all' }), 0, [54, 56, 56, 56]);
  s = withTokens(s, 2, [30, 56, 56, 56]);
  s = move(roll(s, 2), 0);
  assert.equal(s.phase, 'roll');
  assert.equal(s.current, 1);
  assert.equal(s.players[0].place, 1);
  s = L.applyAction(roll(s, 1), { type: 'pass' }); // P1 can't move
  assert.equal(s.current, 2);
  s = withTokens(s, 2, [55, 56, 56, 56]);
  s = move(roll(s, 1), 0);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.players.map((p) => p.place), [1, 3, 2]);
  r = ludo.results(s);
  assert.deepEqual(r.rows.map((x) => x.score), [2, 0, 1]);
  assert.deepEqual(s.winners, [0]);
});

test('finished players are skipped in all-places mode', () => {
  let s = withTokens(L.newGame(P(3), { until: 'all' }), 1, [55, 56, 56, 56]);
  s.current = 1;
  s = move(roll(s, 1), 0);
  assert.equal(s.players[1].place, 1);
  assert.equal(s.current, 2);
  s = L.applyAction(roll(s, 2), { type: 'pass' });
  assert.equal(s.current, 0);
  s = L.applyAction(roll(s, 2), { type: 'pass' });
  assert.equal(s.current, 2, 'seat 1 is done');
});

test('randomFor / apply permissions', () => {
  const s = ludo.setup(P(2), {}, { now: 0, first: 0 });
  assert.deepEqual(ludo.randomFor(s, { type: 'roll' }, 0), [6]);
  assert.equal(ludo.randomFor(s, { type: 'roll' }, 1), null);
  assert.throws(() => ludo.apply(s, { type: 'roll' }, 1, { now: 0, rand: [2] }));
  assert.throws(() => ludo.apply(s, { type: 'roll' }, -1, { now: 0, rand: [2] }));
  const n = ludo.apply(s, { type: 'roll' }, 0, { now: 0, rand: [5] });
  assert.equal(n.die, 6);
  assert.equal(s.die, null, 'input not mutated');
});

test('bot priorities: capture > come out > safety/home > furthest unexposed', () => {
  const base = L.newGame(P(2));
  // capture beats coming out on a 6
  let s = withTokens(base, 1, [40, -1, -1, -1]); // yellow on loop 14
  s = withTokens(s, 0, [8, -1, -1, -1]);
  s = roll(s, 6);
  assert.equal(L.botMove(s), 0);
  // come out on a 6
  s = withTokens(withTokens(base, 1, [-1, -1, -1, -1]), 0, [20, -1, -1, -1]);
  s = roll(s, 6);
  assert.equal(L.botMove(s), 1);
  // move into the home column / home
  s = withTokens(base, 0, [48, 30, -1, -1]);
  s = roll(s, 4);
  assert.equal(L.botMove(s), 0);
  s = withTokens(base, 0, [53, 30, -1, -1]);
  s = roll(s, 3);
  assert.equal(L.botMove(s), 0);
  // furthest token that won't be exposed: token 1 (30→32) would sit 2 ahead of an opponent
  s = withTokens(base, 1, [4, -1, -1, -1]); // yellow loop 30
  s = withTokens(s, 0, [10, 30, -1, -1]); // red loop 10 & 30
  s = roll(s, 2); // 30 → 32 = loop 32 (yellow at 30 threatens); 10 → 12 safe-ish
  assert.equal(L.botMove(s), 0);
  s = roll(withTokens(withTokens(base, 1, [-1, -1, -1, -1]), 0, [10, 30, -1, -1]), 2);
  assert.equal(L.botMove(s), 1, 'no threats: furthest');
});

// ---------- full games between computer players ----------
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

function playOut(g, nPlayers, opts = {}, maxSteps = 20000) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  const o = {};
  for (const x of g.options || []) o[x.key] = x.default;
  Object.assign(o, opts);
  let s = g.setup(players, o, { now: 0, first: 0 });
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
      try { apply(a, seat); } catch (e) { throw new Error(`${g.id}: bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
    }
    if (!moved) throw new Error(`${g.id}: nobody can move (phase ${s.phase})`);
  }
  throw new Error(`${g.id}: game did not finish`);
}

test('computer players finish 120 games of Ludo legally (2–4 players, both modes)', () => {
  let steps = 0;
  let maxStep = 0;
  for (let k = 0; k < 120; k++) {
    const n = 2 + (k % 3);
    const until = k % 2 ? 'all' : 'first';
    const { s, step } = playOut(ludo, n, { until });
    steps += step;
    maxStep = Math.max(maxStep, step);
    const r = ludo.results(s);
    assert.equal(r.rows.filter((x) => x.win).length, 1);
    const places = s.players.map((p) => p.place).sort();
    assert.deepEqual(places, Array.from({ length: n }, (_, i) => i + 1));
    if (until === 'all') assert.ok(s.players.filter((p) => L.homeCount(p) === 4).length >= n - 1);
    for (const p of s.players) for (const t of p.tokens) assert.ok(t >= -1 && t <= 56);
  }
  assert.ok(steps > 0);
  assert.ok(maxStep < 20000);
});

test('bot beats a random mover most of the time', () => {
  let wins = 0;
  const games = 60;
  for (let k = 0; k < games; k++) {
    let s = L.newGame(P(2));
    for (let step = 0; step < 20000 && s.phase !== 'over'; step++) {
      if (s.phase === 'roll') s = roll(s, 1 + Math.floor(Math.random() * 6));
      else if (s.phase === 'pass') s = L.applyAction(s, { type: 'pass' });
      else {
        const t = s.current === 0 ? L.botMove(s) : s.legal[Math.floor(Math.random() * s.legal.length)];
        s = move(s, t);
      }
    }
    assert.equal(s.phase, 'over');
    if (s.winners[0] === 0) wins++;
  }
  assert.ok(wins > games * 0.55, `bot won ${wins}/${games}`);
});
