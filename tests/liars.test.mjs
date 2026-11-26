import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/engines/liars.js';
import G from '../js/games/liars.js';

const P = [{ pid: 'a', name: 'A' }, { pid: 'b', name: 'B' }, { pid: 'c', name: 'C' }];

function rolled(dice, opts = {}, first = 0) {
  let s = L.newGame(P.slice(0, dice.length), first, opts);
  s.players.forEach((p, i) => { p.n = dice[i].length; });
  s = L.applyAction(s, { type: 'roll' }, -1, { values: dice.flat() });
  return s;
}

test('setup reads options; roll asks for one d6 per die and deals in seat order', () => {
  const s0 = G.setup(P, { wild: 'off', start: '3' }, { now: 0, first: 4 });
  assert.equal(s0.wild, false);
  assert.equal(s0.start, 3);
  assert.equal(s0.starter, 1);
  assert.deepEqual(G.randomFor(s0, { type: 'roll' }, -1), Array(9).fill(6));
  assert.equal(G.randomFor(s0, { type: 'roll' }, 0), null);
  assert.deepEqual(G.tick(s0, { now: 0 }), { type: 'roll' });
  assert.throws(() => G.apply(s0, { type: 'roll' }, 0, { now: 0, rand: Array(9).fill(0) }));
  const s1 = G.apply(s0, { type: 'roll' }, -1, { now: 0, rand: [0, 1, 2, 3, 4, 5, 0, 1, 2] });
  assert.deepEqual(s1.players.map((p) => p.dice), [[1, 2, 3], [4, 5, 6], [1, 2, 3]]);
  assert.equal(s1.phase, 'bid');
  assert.equal(s1.current, 1);
  assert.equal(s1.round, 1);
  const d = G.setup(P, {}, { now: 0, first: 0 });
  assert.equal(d.wild, true);
  assert.equal(d.start, 5);
});

test('bids must rise; turn order and permissions; no 1s when wild', () => {
  let s = rolled([[2, 2, 3], [4, 5, 6], [1, 1, 6]]);
  assert.throws(() => L.applyAction(s, { type: 'bid', q: 1, f: 2 }, 1)); // not B's turn
  assert.throws(() => L.applyAction(s, { type: 'liar' }, 0)); // nothing to call
  assert.throws(() => L.applyAction(s, { type: 'bid', q: 1, f: 1 }, 0)); // 1s are wild
  assert.throws(() => L.applyAction(s, { type: 'bid', q: 10, f: 3 }, 0)); // more than on the table
  s = L.applyAction(s, { type: 'bid', q: 2, f: 3 }, 0);
  assert.equal(s.current, 1);
  assert.throws(() => L.applyAction(s, { type: 'bid', q: 2, f: 3 }, 1));
  assert.throws(() => L.applyAction(s, { type: 'bid', q: 2, f: 2 }, 1));
  assert.throws(() => L.applyAction(s, { type: 'bid', q: 1, f: 6 }, 1));
  s = L.applyAction(s, { type: 'bid', q: 2, f: 6 }, 1); // same count, higher face
  s = L.applyAction(s, { type: 'bid', q: 3, f: 2 }, 2); // more dice, any face
  assert.equal(s.current, 0);
  assert.equal(L.minQty(s, 2), 4);
  assert.equal(L.minQty(s, 5), 3);
  assert.equal(L.bidText({ q: 4, f: 5 }), 'four 5s');
  assert.equal(L.bidText({ q: 1, f: 6 }), 'one 6');
});

test('without wilds, 1s are a normal (lowest) face', () => {
  let s = rolled([[1, 1], [1, 6]], { wild: false });
  s = L.applyAction(s, { type: 'bid', q: 3, f: 1 }, 0);
  assert.equal(L.countFace(s, 1), 3);
  assert.equal(L.countFace(s, 6), 1);
  s = L.applyAction(s, { type: 'liar' }, 1);
  assert.equal(s.reveal.met, true);
  assert.equal(s.reveal.loser, 1); // caller was wrong
});

test('liar: wild 1s count, true bid costs the caller, bluff costs the bidder; loser starts', () => {
  // 5s on the table: A has 5,1 ; B has 5 ; C has 2 -> four 5s with wilds
  let s = rolled([[5, 1], [5, 3], [2, 2]]);
  s = L.applyAction(s, { type: 'bid', q: 3, f: 5 }, 0);
  s = L.applyAction(s, { type: 'liar' }, 1, { now: 1000 });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal.count, 3);
  assert.equal(s.reveal.met, true);
  assert.equal(s.reveal.loser, 1);
  assert.equal(G.tick(s, { now: 1000 + L.REVEAL_MS - 1 }), null);
  assert.deepEqual(G.tick(s, { now: 1000 + L.REVEAL_MS }), { type: 'next' });
  assert.throws(() => L.applyAction(s, { type: 'next' }, 0));
  s = L.applyAction(s, { type: 'next' }, -1);
  assert.equal(s.players[1].n, 1);
  assert.equal(s.phase, 'roll');
  s = L.applyAction(s, { type: 'roll' }, -1, { values: [6, 6, 6, 2, 2] });
  assert.equal(s.current, 1); // the loser opens
  s = L.applyAction(s, { type: 'bid', q: 2, f: 3 }, 1);
  s = L.applyAction(s, { type: 'liar' }, 2);
  assert.equal(s.reveal.met, false);
  assert.equal(s.reveal.loser, 1);
  assert.equal(s.reveal.out, true);
  s = L.applyAction(s, { type: 'next' }, -1);
  assert.equal(s.players[1].n, 0);
  assert.deepEqual(s.out, [1]);
  assert.equal(s.starter, 2); // B is out, so the next player starts
  s = L.applyAction(s, { type: 'roll' }, -1, { values: [6, 6, 2, 2] });
  assert.deepEqual(s.players[1].dice, []);
  assert.equal(s.current, 2);
  s = L.applyAction(s, { type: 'bid', q: 1, f: 2 }, 2);
  assert.equal(s.current, 0); // B skipped
});

test('last player with dice wins', () => {
  let s = rolled([[3], [4]]);
  s = L.applyAction(s, { type: 'bid', q: 2, f: 3 }, 0);
  s = L.applyAction(s, { type: 'liar' }, 1);
  s = L.applyAction(s, { type: 'next' }, -1);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 1);
  const r = G.results(s);
  assert.equal(r.over, true);
  assert.deepEqual(r.rows.map((x) => x.win), [false, true]);
});

test('probability helper', () => {
  assert.equal(L.atLeast(0, 5, 0.5), 1);
  assert.equal(L.atLeast(6, 5, 0.5), 0);
  assert.ok(Math.abs(L.atLeast(1, 2, 0.5) - 0.75) < 1e-9);
  assert.ok(Math.abs(L.atLeast(5, 5, 1 / 6) - (1 / 6) ** 5) < 1e-12);
});

test('bot calls an impossible bid and raises a sure one', () => {
  let s = rolled([[2, 3], [4, 4]], { wild: false });
  s = L.applyAction(s, { type: 'bid', q: 4, f: 6 }, 0); // B holds no 6s, A only has 2 dice
  assert.deepEqual(G.bot(s, 1, { now: 0 }), { type: 'liar' });
  assert.equal(G.bot(s, 0, { now: 0 }), null);
  let t = rolled([[2, 3], [4, 4, 4]], { wild: false });
  t = L.applyAction(t, { type: 'bid', q: 2, f: 4 }, 0);
  const a = G.bot(t, 1, { now: 0 });
  assert.equal(a.type, 'bid');
  assert.ok(L.isRaise(t, a));
});

// ---- play-out harness (same shape as tests/bots.test.mjs) ----
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

function playOut(g, nPlayers, opts, maxSteps = 20000) {
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

test('computer players finish 240 games legally (2-6 players, all options)', () => {
  const wins = [0, 0, 0, 0, 0, 0];
  let calls = 0;
  let rounds = 0;
  for (let k = 0; k < 240; k++) {
    const n = 2 + (k % 5);
    const opts = { wild: k % 2 ? 'off' : 'on', start: k % 3 === 0 ? 3 : 5 };
    const { s } = playOut(G, n, opts);
    assert.equal(s.phase, 'over');
    assert.equal(s.players.filter((p) => p.n > 0).length, 1);
    assert.equal(s.out.length, n - 1);
    wins[s.winner]++;
    rounds += s.round;
    calls += s.log.filter((x) => x.includes('calls Liar')).length;
  }
  assert.ok(rounds > 0 && calls > 0);
});
