import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/engines/close.js';
import G from '../js/games/close.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

function dealt(n = 3, opts = {}, now = 1000) {
  let s = G.setup(P(n), opts, { now: 0, first: 0 });
  const a = G.tick(s, { now });
  assert.deepEqual(a, { type: 'deal' });
  s = G.apply(s, a, -1, { now, rand: randFor(G.randomFor(s, a, -1)) });
  return s;
}
// force a known question so tests are deterministic
const withQ = (s, idx) => { const t = structuredClone(s); t.qs[t.qn] = idx; return t; };
const idxOf = (answer, year) => C.BANK.findIndex((b) => b[1] === answer && (b[5] === 'y') === !!year);

test('question bank: 200+ unique, well-formed questions', () => {
  assert.ok(C.BANK.length >= 200, `only ${C.BANK.length}`);
  assert.equal(new Set(C.BANK.map((b) => b[0])).size, C.BANK.length, 'no duplicate questions');
  for (const b of C.BANK) {
    const [q, a, unit, fact, d] = b;
    assert.ok(typeof q === 'string' && q.endsWith('?'), q);
    assert.ok(Number.isInteger(a) && a >= 0 && a <= C.MAX_GUESS, q);
    assert.equal(typeof unit, 'string');
    assert.ok(typeof fact === 'string' && fact.length > 8, q);
    assert.ok([1, 2, 3].includes(d), q);
  }
});

test('deal picks the right number of questions, never repeating', () => {
  for (const n of [7, 10, 15]) {
    for (let k = 0; k < 50; k++) {
      const s = dealt(3, { questions: n });
      assert.equal(s.qs.length, n);
      assert.equal(new Set(s.qs).size, n);
      assert.ok(s.qs.every((i) => i >= 0 && i < C.BANK.length));
      assert.equal(s.phase, 'guess');
    }
  }
  // boundary randomness
  let s = G.setup(P(2), {}, { now: 0 });
  const top = G.randomFor(s, { type: 'deal' }, -1).map((r) => r - 1);
  s = G.apply(s, { type: 'deal' }, -1, { now: 0, rand: top });
  assert.equal(new Set(s.qs).size, 10);
  assert.throws(() => G.apply(s, { type: 'deal' }, -1, { now: 0, rand: top }));
});

test('odds: middle 2:1, outside up to 5:1, too-high 6:1', () => {
  assert.deepEqual([0, 1].map((i) => C.oddsFor(i, 2)), [2, 2]);
  assert.deepEqual([0, 1, 2].map((i) => C.oddsFor(i, 3)), [3, 2, 3]);
  assert.deepEqual([...Array(8).keys()].map((i) => C.oddsFor(i, 8)), [5, 4, 3, 2, 2, 3, 4, 5]);
  assert.deepEqual([...Array(7).keys()].map((i) => C.oddsFor(i, 7)), [5, 4, 3, 2, 3, 4, 5]);
  const slots = C.makeSlots([30, 10, 30, null, 20]);
  assert.equal(slots[0].odds, C.HIGH_ODDS);
  assert.deepEqual(slots.slice(1).map((x) => x.v), [10, 20, 30]);
  assert.deepEqual(slots[3].who, [0, 2], 'same guess = one shared slot');
});

test('winning slot is the closest guess without going over', () => {
  const slots = C.makeSlots([100, 50, 200]);
  assert.equal(C.winningSlot(slots, 10), 0, 'all too high');
  assert.equal(C.winningSlot(slots, 50), 1, 'exact counts');
  assert.equal(C.winningSlot(slots, 99), 1);
  assert.equal(C.winningSlot(slots, 150), 2);
  assert.equal(C.winningSlot(slots, 5000), 3);
});

test('a full round: guesses, bets, payouts and bonus', () => {
  let s = withQ(dealt(3), idxOf(1912, true)); // Titanic
  assert.throws(() => G.apply(s, { type: 'guess', value: 1900 }, -1, { now: 1 }), /players only/);
  assert.throws(() => G.apply(s, { type: 'guess', value: 1.5 }, 0, { now: 1 }), /whole/);
  assert.throws(() => G.apply(s, { type: 'guess', value: -3 }, 0, { now: 1 }), /whole/);
  s = G.apply(s, { type: 'guess', q: 0, value: 1900 }, 0, { now: 1 });
  assert.throws(() => G.apply(s, { type: 'guess', value: 1901 }, 0, { now: 1 }), /already/);
  assert.throws(() => G.apply(s, { type: 'bet', bets: [] }, 1, { now: 1 }), /not betting/);
  s = G.apply(s, { type: 'guess', value: 1920 }, 1, { now: 2 });
  s = G.apply(s, { type: 'guess', value: 1850 }, 2, { now: 3 });
  assert.equal(s.phase, 'bet');
  assert.deepEqual(s.slots.map((x) => x.v), [null, 1850, 1900, 1920]);
  // P0 bets 2 chips on own guess (1900, odds 2) + free on too-high; P1 bets on 1920; P2 bets 3 on 1850 & 1900
  assert.throws(() => G.apply(s, { type: 'bet', bets: [{ slot: 2, extra: 9 }] }, 0, { now: 4 }), /chips/);
  assert.throws(() => G.apply(s, { type: 'bet', bets: [{ slot: 7, extra: 0 }] }, 0, { now: 4 }), /slot/);
  assert.throws(() => G.apply(s, { type: 'bet', bets: [{ slot: 1 }, { slot: 1 }, { slot: 1 }] }, 0, { now: 4 }), /two/);
  s = G.apply(s, { type: 'bet', bets: [{ slot: 2, extra: 2 }, { slot: 0, extra: 0 }] }, 0, { now: 4 });
  s = G.apply(s, { type: 'bet', bets: [{ slot: 3, extra: 1 }, { slot: 3, extra: 0 }] }, 1, { now: 5 });
  s = G.apply(s, { type: 'bet', bets: [{ slot: 1, extra: 3 }, { slot: 2, extra: 0 }] }, 2, { now: 6 });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.last.win, 2);
  const o = s.slots[2].odds;
  assert.equal(s.players[0].chips, 5 + o * 3 + C.BONUS); // win with 2 extra, lose free chip, bonus
  assert.equal(s.players[1].chips, 5 - 1);
  assert.equal(s.players[2].chips, 5 - 3 + o * 1);
  assert.equal(G.tick(s, { now: s.autoAt - 1 }), null);
  s = G.apply(s, G.tick(s, { now: s.autoAt }), -1, { now: s.autoAt });
  assert.equal(s.phase, 'guess');
  assert.equal(s.qn, 1);
});

test('all too high pays and bullseye bonus', () => {
  let s = withQ(dealt(2), idxOf(88, false) >= 0 ? C.BANK.findIndex((b) => b[0].includes('keys are on a standard piano')) : 0);
  assert.equal(C.question(s.qs[0]).a, 88);
  s = G.apply(s, { type: 'guess', value: 100 }, 0, { now: 1 });
  s = G.apply(s, { type: 'guess', value: 90 }, 1, { now: 1 });
  s = G.apply(s, { type: 'bet', bets: [{ slot: 0, extra: 1 }] }, 0, { now: 1 });
  s = G.apply(s, { type: 'bet', bets: [{ slot: 1, extra: 5 }] }, 1, { now: 1 });
  assert.equal(s.last.win, 0);
  assert.equal(s.players[0].chips, 5 + C.HIGH_ODDS * 2);
  assert.equal(s.players[1].chips, 0);
  assert.ok(s.last.bonus.every((b) => b === 0));

  let t = withQ(dealt(2), C.BANK.findIndex((b) => b[0].includes('keys are on a standard piano')));
  t = G.apply(t, { type: 'guess', value: 88 }, 0, { now: 1 });
  t = G.apply(t, { type: 'guess', value: 80 }, 1, { now: 1 });
  t = G.apply(t, { type: 'bet', bets: [] }, 0, { now: 1 });
  t = G.apply(t, { type: 'bet', bets: [] }, 1, { now: 1 });
  assert.equal(t.players[0].chips, 5 + C.BULLSEYE);
  assert.equal(t.players[1].chips, 5);
});

test('timers: missing guesses/bets time out, nobody guessing skips betting', () => {
  let s = dealt(3, { timer: 30 }, 1000);
  assert.equal(s.deadline, 1000 + 30000);
  assert.equal(G.tick(s, { now: s.deadline }), null, 'grace period');
  s = G.apply(s, { type: 'guess', value: 5 }, 1, { now: 2000 });
  const to = G.tick(s, { now: s.deadline + C.GRACE_MS });
  assert.deepEqual(to, { type: 'timeout', q: 0, phase: 'guess' });
  assert.throws(() => G.apply(s, to, 0, { now: 1 }), /system/);
  s = G.apply(s, to, -1, { now: s.deadline + C.GRACE_MS });
  assert.equal(s.phase, 'bet');
  assert.equal(s.slots.length, 2);
  s = G.apply(s, { type: 'bet', bets: [{ slot: 1, extra: 0 }] }, 0, { now: 1 });
  const to2 = G.tick(s, { now: s.deadline + C.GRACE_MS });
  assert.equal(to2.phase, 'bet');
  s = G.apply(s, to2, -1, { now: s.deadline + C.GRACE_MS });
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.bets[1], []);
  // stale timeout is rejected
  assert.throws(() => G.apply(s, to2, -1, { now: 1 }), /stale/);

  let e = dealt(2, {}, 0);
  e = G.apply(e, G.tick(e, { now: 1e9 }), -1, { now: 1e9 });
  assert.equal(e.phase, 'reveal', 'no guesses: straight to the answer');
  assert.ok(e.players.every((p) => p.chips === C.START_CHIPS));
});

test('game ends after the last question with most chips winning', () => {
  let s = dealt(2, { questions: 7 }, 0);
  let now = 0;
  for (let k = 0; k < 7; k++) {
    const a = C.question(s.qs[s.qn]).a;
    s = G.apply(s, { type: 'guess', value: a }, 0, { now });
    s = G.apply(s, { type: 'guess', value: a + 1 }, 1, { now });
    s = G.apply(s, { type: 'bet', bets: [{ slot: 1, extra: 0 }, { slot: 1, extra: 0 }] }, 0, { now });
    s = G.apply(s, { type: 'bet', bets: [{ slot: 2, extra: 0 }] }, 1, { now });
    now = s.autoAt;
    assert.equal(G.results(s).over, false);
    s = G.apply(s, G.tick(s, { now }), -1, { now });
  }
  assert.equal(s.phase, 'over');
  const r = G.results(s);
  assert.ok(r.over);
  assert.deepEqual(r.rows.map((x) => x.win), [true, false]);
});

test('bot estimates are noisy but sensible, and never illegal', () => {
  let exact = 0;
  let n = 0;
  for (let k = 0; k < 300; k++) {
    const s = dealt(4);
    for (let seat = 0; seat < 4; seat++) {
      const q = C.question(s.qs[0]);
      const e = C.botEstimate(s, seat);
      assert.ok(Number.isInteger(e) && e >= 0);
      if (q.year) assert.ok(Math.abs(e - q.a) <= 2.5 * 55 + 1);
      else assert.ok(e <= q.a * 5 + 10 && e >= q.a / 5 - 10, `${q.q} ${e}`);
      if (e === q.a) exact++;
      n++;
      assert.equal(e, C.botEstimate(s, seat), 'stable');
    }
  }
  assert.ok(exact < n * 0.5, `bots too perfect: ${exact}/${n}`);
});

// ---- play-out (copied from tests/bots.test.mjs; real clock steps so bots get to act) ----
function playOut(g, nPlayers, opts = {}, maxSteps = 20000, fastTimers = false) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  const o = {};
  for (const x of g.options || []) o[x.key] = opts[x.key] ?? x.default;
  let s = g.setup(players, o, { now: 0, first: 0 });
  let now = 0;
  const apply = (a, seat) => {
    const ranges = g.randomFor?.(s, a, seat);
    s = g.apply(s, a, seat, { now, rand: ranges?.length ? randFor(ranges) : null });
  };
  let botMoves = 0;
  for (let step = 0; step < maxSteps; step++) {
    if (g.results(s).over) return { s, step, botMoves };
    now += 1000;
    const sys = g.tick?.(s, { now: fastTimers ? now + 1e9 : now });
    if (sys) { apply(sys, -1); continue; }
    let moved = false;
    for (let seat = 0; seat < nPlayers && !moved; seat++) {
      const a = g.bot(s, seat, { now });
      if (!a) continue;
      try { apply(a, seat); } catch (e) { throw new Error(`${g.id}: bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
      botMoves++;
    }
    if (!moved && !g.realtime) throw new Error(`${g.id}: nobody can move (phase ${s.phase})`);
  }
  throw new Error(`${g.id}: game did not finish`);
}

test('computer players finish 60 full games legally (2–8 players, all settings)', () => {
  let wins = 0;
  for (let k = 0; k < 60; k++) {
    const n = 2 + (k % 7);
    const opts = { questions: [7, 10, 15][k % 3], timer: [30, 45, 60][k % 3] };
    const { s, botMoves } = playOut(G, n, opts);
    assert.equal(s.phase, 'over');
    assert.equal(botMoves, opts.questions * n * 2, 'every bot guessed and bet every round');
    assert.ok(s.players.every((p) => Number.isInteger(p.chips) && p.chips >= 0));
    if (s.winners.length) wins++;
  }
  assert.equal(wins, 60);
});

test('games also finish when every timer expires at once (like the shared harness)', () => {
  for (let k = 0; k < 20; k++) {
    const { s } = playOut(G, 2 + (k % 3), {}, 20000, true);
    assert.equal(s.phase, 'over');
  }
});
