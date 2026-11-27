import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/engines/rows.js';
import rows from '../js/games/rows.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

function start(n = 3, opts = { timer: 'off' }) {
  let s = rows.setup(P(n), opts, { now: 0, first: 0 });
  const a = rows.tick(s, { now: 0 });
  assert.deepEqual(a, { type: 'deal' });
  const ranges = rows.randomFor(s, a, -1);
  s = rows.apply(s, a, -1, { now: 0, rand: ranges ? randFor(ranges) : null });
  return s;
}
// roll with chosen faces: white a, b and colours (only unlocked ones, in order)
function rollAs(s, faces, seat = s.active) {
  const ranges = rows.randomFor(s, { type: 'roll' }, seat);
  assert.equal(ranges.length, faces.length);
  return rows.apply(s, { type: 'roll' }, seat, { now: 1000, rand: faces.map((f) => f - 1) });
}
const done = (s, seat, marks = []) => rows.apply(s, { type: 'done', marks }, seat, { now: 2000 });

test('setup and deal: four rows, two ascending and two descending', () => {
  const s = start();
  assert.equal(s.phase, 'roll');
  assert.deepEqual(s.layout[0].nums, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(s.layout[2].nums, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  assert.equal(rows.randomFor(s, { type: 'roll' }, 1), null, 'only the active player rolls');
  assert.deepEqual(rows.randomFor(s, { type: 'roll' }, 0), [6, 6, 6, 6, 6, 6]);
  assert.throws(() => rows.apply(s, { type: 'roll' }, 1, { now: 0, rand: [0, 0, 0, 0, 0, 0] }));
});

test('mixed and bonus variants deal from the random ints', () => {
  for (let k = 0; k < 30; k++) {
    const m = start(2, { timer: 'off', variant: 'mixed' });
    m.layout.forEach((row, c) => {
      assert.deepEqual([...row.nums].sort((a, b) => a - b), R.baseNums(0));
      assert.equal(row.nums[10], R.ASC[c] ? 12 : 2, 'end number stays');
      for (let i = 0; i < 10; i++) assert.ok(Math.abs(row.nums[i] - R.baseNums(c)[i]) <= 1, 'nudged at most one place');
    });
    const b = start(2, { timer: 'off', variant: 'bonus' });
    b.layout.forEach((row) => {
      assert.equal(row.stars.length, 2);
      assert.notEqual(row.stars[0], row.stars[1]);
      assert.ok(row.stars.every((i) => i >= 1 && i <= 8));
    });
  }
  assert.equal(R.dealRanges('classic'), null);
});

test('white sum for everyone, colour combos only for the active player', () => {
  let s = start(3);
  s = rollAs(s, [3, 4, 6, 1, 2, 5]); // white 7; red 6 → 9/10, yellow 1 → 4/5, green 2 → 5/6, blue 5 → 8/9
  assert.equal(s.phase, 'mark');
  const p1 = R.plans(s, 1).map((p) => p.map((m) => `${m.row}:${m.n}`).join(','));
  assert.deepEqual(p1.sort(), ['', '0:7', '1:7', '2:7', '3:7']);
  assert.throws(() => done(s, 1, [{ row: 0, n: 9 }]), 'non-active cannot use a colour die');
  assert.throws(() => done(s, 1, [{ row: 0, n: 7 }, { row: 1, n: 7 }]), 'one mark only');
  const p0 = R.plans(s, 0);
  assert.ok(p0.some((p) => p.length === 2 && p[0].n === 7 && p[0].row === 0 && p[1].row === 0 && p[1].n === 9));
  assert.ok(!p0.some((p) => p.length === 2 && p[0].row === 0 && p[0].n === 7 && p[1].row === 0 && p[1].n === 4), 'no wrong colour');
  assert.throws(() => done(s, 0, [{ row: 1, n: 9 }]), '9 is not a yellow combination');
  s = done(s, 0, [{ row: 0, n: 7 }, { row: 0, n: 10 }]);
  assert.throws(() => done(s, 0, []), 'only once');
  s = done(s, 1, [{ row: 2, n: 7 }]);
  assert.equal(s.phase, 'mark');
  assert.deepEqual(s.players[0].rows[0], [], 'marks are hidden until everyone is done');
  s = done(s, 2, []);
  assert.equal(s.phase, 'roll');
  assert.equal(s.active, 1);
  assert.deepEqual(s.players[0].rows[0], [5, 8]);
  assert.deepEqual(s.players[1].rows[2], [5]);
  assert.equal(s.players[2].pen, 0, 'passing is free for non-active players');
  assert.equal(R.scoreOf(s, s.players[0]).total, 3);
});

test('left to right: boxes before your last mark are gone', () => {
  let s = start(2);
  s.players[1].rows[0] = [6]; // red 8 marked
  s = rollAs(s, [3, 4, 1, 1, 1, 1]); // white 7
  assert.ok(!R.plans(s, 1).some((p) => p.some((m) => m.row === 0)), 'red 7 is behind the 8');
  assert.throws(() => done(s, 1, [{ row: 0, n: 7 }]));
  assert.ok(R.plans(s, 1).some((p) => p.some((m) => m.row === 2 && m.n === 7)));
});

test('active player who marks nothing takes a penalty; four penalties end the game', () => {
  let s = start(2);
  for (let r = 0; r < 7; r++) {
    s = rollAs(s, [1, 1, 1, 1, 1, 1]);
    s = done(s, 0, []);
    s = done(s, 1, []);
  }
  assert.equal(s.players[0].pen, 4);
  assert.equal(s.players[1].pen, 3);
  assert.equal(s.phase, 'over');
  assert.equal(R.scoreOf(s, s.players[0]).total, -20);
  assert.deepEqual(s.winners, [1]);
  assert.equal(rows.results(s).over, true);
});

test('locking needs 5 marks, adds the lock mark, and removes the colour die; two locks end it', () => {
  let s = start(2);
  s.players[0].rows[0] = [0, 1, 2, 3]; // red 2..5: only 4 marks
  s.players[1].rows[0] = [0, 1, 2, 3, 4]; // 5 marks
  s.players[1].rows[3] = [0, 1, 2, 3, 4, 5]; // blue 12..7
  s = rollAs(s, [6, 6, 1, 1, 1, 1]); // white 12
  assert.ok(!R.plans(s, 0).some((p) => p.some((m) => m.row === 0 && m.n === 12)), 'needs 5 marks');
  // the white mark can be the fifth that allows a colour lock in the same row
  s.dice.c[0] = 6;
  const okPlans = R.plans(s, 0).filter((p) => p.length === 2 && p[0].row === 0);
  assert.ok(okPlans.some((p) => p[0].n === 12) === false, 'white 12 cannot lock the red row with 4 marks');
  s = done(s, 0, []);
  s = done(s, 1, [{ row: 0, n: 12 }]);
  assert.equal(s.locked[0], true);
  assert.equal(s.event, 'lock');
  assert.equal(R.rowCount(s.layout[0], s.players[1].rows[0]), 7, '6 boxes + lock');
  assert.equal(R.scoreOf(s, s.players[1]).rows[0], 28);
  assert.deepEqual(rows.randomFor(s, { type: 'roll' }, s.active), [6, 6, 6, 6, 6], 'red die gone');
  s = rollAs(s, [1, 1, 3, 3, 3]); // white 2; yellow, green, blue dice 3
  assert.ok(!R.plans(s, 0).some((p) => p.some((m) => m.row === 0)), 'locked row cannot be marked');
  // player 1 (active) closes blue: 6 marks, white 1+1 = 2
  s = done(s, 0, []);
  s = done(s, 1, [{ row: 3, n: 2 }]);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.locked, [true, false, false, true]);
  assert.deepEqual(s.winners, [1]);
});

test('star boxes count as an extra mark', () => {
  const s = start(2, { timer: 'off', variant: 'bonus' });
  const row = s.layout[0];
  assert.equal(R.rowCount(row, [row.stars[0]]), 2);
  assert.equal(R.rowCount(row, [row.stars[0], row.stars[1], 10]), 6);
});

test('timer: tick rolls for an idle player and passes everyone who has not answered', () => {
  let s = rows.setup(P(3), { timer: '20' }, { now: 0, first: 0 });
  s = rows.apply(s, { type: 'deal' }, -1, { now: 0, rand: null });
  assert.equal(s.deadline, 20000);
  assert.equal(rows.tick(s, { now: 19999 }), null);
  const a = rows.tick(s, { now: 20000 });
  assert.deepEqual(a, { type: 'roll' });
  s = rows.apply(s, a, -1, { now: 20000, rand: randFor(rows.randomFor(s, a, -1)) });
  assert.equal(s.phase, 'mark');
  assert.equal(s.deadline, 40000);
  s = done(s, 1, []);
  assert.deepEqual(rows.tick(s, { now: 40000 }), { type: 'timeout' });
  assert.throws(() => rows.apply(s, { type: 'timeout' }, 0, { now: 40000 }), 'players cannot time out others');
  s = rows.apply(s, { type: 'timeout' }, -1, { now: 40000 });
  assert.equal(s.phase, 'roll');
  assert.equal(s.players[0].pen, 1, 'idle active player is penalised');
  // with the timer off nothing happens on its own
  const off = start(2);
  assert.equal(rows.tick(off, { now: 1e12 }), null);
});

test('stale Done for an earlier roll is rejected', () => {
  let s = start(2);
  s = rollAs(s, [1, 2, 3, 4, 5, 6]);
  assert.throws(() => rows.apply(s, { type: 'done', marks: [], rollNo: 0 }, 1, { now: 0 }));
});

// ---- bot play-outs (same harness as tests/bots.test.mjs) ----
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
    const sys = g.tick?.(s, { now });
    if (sys) { apply(sys, -1); continue; }
    let moved = false;
    for (let seat = 0; seat < nPlayers && !moved; seat++) {
      const a = g.bot(s, seat, { now });
      if (!a) continue;
      try { apply(a, seat); } catch (e) { throw new Error(`bot ${seat} chose an illegal move ${JSON.stringify(a)}: ${e.message}`); }
      moved = true;
    }
    if (!moved) throw new Error(`nobody can move (phase ${s.phase})`);
  }
  throw new Error('game did not finish');
}

test('computer players finish 150 games legally, every variant and size', () => {
  const stats = { lockEnd: 0, penEnd: 0, scores: [] };
  for (let k = 0; k < 150; k++) {
    const variant = R.VARIANTS[k % 3];
    const n = 2 + (k % 5);
    const timer = k % 7 === 0 ? '20' : 'off';
    const { s } = playOut(rows, n, { variant, timer });
    assert.equal(s.phase, 'over');
    const res = rows.results(s);
    assert.ok(res.rows.some((r) => r.win));
    if (s.locked.filter(Boolean).length >= 2) stats.lockEnd++; else stats.penEnd++;
    stats.scores.push(Math.max(...res.rows.map((r) => r.score)));
  }
  const avg = stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length;
  console.log(`games ended by locks: ${stats.lockEnd}, by penalties: ${stats.penEnd}, avg winning score ${avg.toFixed(1)}`);
  assert.ok(stats.lockEnd > stats.penEnd, 'bots mostly finish by locking rows');
  assert.ok(avg > 60, 'bots score reasonably');
});

test('play-out with lobby defaults and expired timers (as in bots.test.mjs) also finishes', () => {
  for (let k = 0; k < 20; k++) {
    const players = P(3).map((p, i) => ({ ...p, pid: `bot-${i}` }));
    let s = rows.setup(players, { timer: '30', variant: 'classic' }, { now: 0, first: 0 });
    let now = 0;
    for (let step = 0; step < 5000 && !rows.results(s).over; step++) {
      now += 1000;
      const sys = rows.tick(s, { now: now + 1e9 });
      const [a, seat] = sys ? [sys, -1] : [0, 1, 2].map((i) => [rows.bot(s, i, { now }), i]).find(([x]) => x) || [];
      assert.ok(a, 'someone can move');
      const r = rows.randomFor(s, a, seat);
      s = rows.apply(s, a, seat, { now, rand: r ? randFor(r) : null });
    }
    assert.ok(rows.results(s).over);
  }
});
