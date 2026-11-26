import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/engines/life.js';
import life from '../js/games/life.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));

// apply through the plugin, giving it exactly the random ints randomFor asks for
function act(s, a, seat, rand, now = 0) {
  const ranges = life.randomFor(s, a, seat);
  const r = ranges?.length ? (rand || ranges.map(() => 0)) : null;
  if (r) r.forEach((v, i) => assert.ok(v >= 0 && v < ranges[i], `rand ${v} out of range ${ranges[i]}`));
  return life.apply(s, a, seat, { now, rand: r });
}
const settle = (s) => {
  for (let k = 0; k < 5; k++) {
    const t = life.tick(s, { now: 1e12 });
    if (!t) return s;
    s = act(s, t, -1);
  }
  return s;
};

test('board: 60–75 spaces, every path reaches retirement, forks are stops', () => {
  assert.ok(L.BOARD.length >= 60 && L.BOARD.length <= 75, `board has ${L.BOARD.length}`);
  const forks = L.BOARD.filter((s) => s.next.length > 1);
  assert.equal(forks.length, 2);
  for (const f of forks) assert.equal(f.t, 'stop');
  assert.deepEqual(L.BOARD[L.RETIRE_ID].next, []);
  for (const a of [0, 1]) for (const b of [0, 1]) {
    const p = { pos: 0, route: { fork1: a, fork2: b } };
    let n = 0;
    while (p.pos !== L.RETIRE_ID && n++ < 200) p.pos = L.nextSpace(p, p.pos);
    assert.equal(p.pos, L.RETIRE_ID);
    assert.ok(n > 45 && n < 60, `path length ${n}`);
  }
  // fits the 322px wide drawing grid and no two tiles overlap
  const keys = new Set(L.BOARD.map((s) => `${s.col},${s.row}`));
  assert.equal(keys.size, L.BOARD.length);
  assert.ok(L.BOARD.every((s) => s.col >= 0 && s.col <= 5));
});

test('spin walks, halts at the crossroads, choices are actions with permissions', () => {
  let s = life.setup(P(2), {}, { now: 0, first: 0 });
  assert.throws(() => act(s, { type: 'spin' }, 1)); // not your turn
  s = act(s, { type: 'spin' }, 0, [9]); // spin 10, but the crossroads (5 away) halts us
  assert.equal(s.phase, 'move');
  assert.equal(s.move.path.length, 5);
  assert.equal(L.BOARD[s.players[0].pos].stop, 'fork1');
  assert.equal(life.tick(s, { now: 0 }), null); // still animating
  assert.throws(() => act(s, { type: 'arrive' }, 0)); // system only
  s = settle(s);
  assert.equal(s.phase, 'choose');
  assert.equal(s.pending.kind, 'fork1');
  assert.throws(() => act(s, { type: 'choose', i: 0 }, 1));
  assert.throws(() => act(s, { type: 'choose', i: 7 }, 0));
  // start working → immediately pick a basic job
  s = act(s, { type: 'choose', i: 1 }, 0, [0, 0]);
  assert.equal(s.pending.kind, 'career');
  assert.equal(s.pending.options.length, 2);
  s = act(s, { type: 'choose', i: 1 }, 0);
  assert.equal(s.players[0].career.name, L.BASIC_CAREERS[1].name);
  s = settle(s);
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'turn');
  // P1 goes to college: 2 loans
  s = settle(act(s, { type: 'spin' }, 1, [6]));
  s = act(s, { type: 'choose', i: 0 }, 1);
  assert.equal(s.players[1].college, true);
  assert.equal(s.players[1].loans, L.STUDENT_LOANS);
  s = settle(s);
  // P0 walks into the work lane: first space is a payday
  const cash = s.players[0].cash;
  s = settle(act(s, { type: 'spin' }, 0, [0]));
  assert.equal(L.BOARD[s.players[0].pos].t, 'payday');
  assert.equal(s.players[0].cash, cash + s.players[0].career.salary);
});

test('paydays pay when passed; negative cash takes loans; net worth', () => {
  const p = { cash: 5000, loans: 0, house: null, partner: false, kids: 0 };
  const s = life.setup(P(2), {}, { now: 0, first: 0 });
  s.players[0] = { ...s.players[0], pos: L.BOARD.find((x) => x.stop === 'fork1').id, career: { name: 'X', icon: 'x', salary: 50000 }, route: { fork1: 1 } };
  s.players[0].cash = 0;
  // the space after the payday is a cash event in the work lane
  let t = act(s, { type: 'spin' }, 0, [1]);
  assert.equal(L.BOARD[t.move.path[0]].t, 'payday');
  assert.equal(L.BOARD[t.move.path[1]].pool, 'life');
  t = act(t, { type: 'arrive' }, -1, [8]); // 'The water heater gives up' −8k
  assert.equal(t.players[0].cash, 50000 - 8000);
  // loans
  const q = structuredClone(t);
  q.players[0].cash = 1000;
  q.phase = 'move';
  q.players[0].pos = L.BOARD.find((x) => x.pool === 'risk' && x.t === 'cash').id;
  q.move = { no: 9, seat: 0, value: 1, from: 0, path: [q.players[0].pos] };
  const r = act(q, { type: 'arrive' }, -1, [1]); // sailboat −30k
  assert.equal(r.players[0].loans, 3);
  assert.equal(r.players[0].cash, 1000 - 30000 + 30000);
  Object.assign(p, { cash: 50000, loans: 2, house: { worth: 100000 }, partner: true, kids: 2 });
  assert.equal(L.netWorth(p), 50000 + 100000 + 20000 + 30000 - 24000);
});

test('houses: buying takes loans when short; upgrade sells back the old one', () => {
  let s = life.setup(P(2), {}, { now: 0, first: 0 });
  const hid = L.BOARD.find((x) => x.t === 'house').id;
  s.players[0] = { ...s.players[0], pos: hid, cash: 20000, route: { fork1: 1 } };
  s.phase = 'move';
  s.move = { no: 1, seat: 0, value: 1, from: hid - 1, path: [hid] };
  s = act(s, { type: 'arrive' }, -1, [9, 0, 0]); // Hilltop Manor, Cozy Studio, Tiny Cabin
  assert.equal(s.pending.kind, 'house');
  assert.equal(s.pending.options.length, 4);
  assert.ok(s.pending.options[3].skip);
  const manor = s.pending.options.findIndex((o) => o.name === 'Hilltop Manor');
  const t = act(s, { type: 'choose', i: manor }, 0);
  assert.equal(t.players[0].house.name, 'Hilltop Manor');
  assert.equal(t.players[0].loans, 22);
  assert.ok(t.players[0].cash >= 0);
  // the bot does not overreach
  const bi = L.botChoice(s, 0);
  const o = s.pending.options[bi];
  assert.ok(o.skip || o.price <= 20000 + 3 * L.LOAN);
});

test('retirement order bonus; retired players are skipped; game ends when all retire', () => {
  let s = life.setup(P(3), {}, { now: 0, first: 0 });
  for (const p of s.players) { p.pos = L.RETIRE_ID - 1; p.route = { fork1: 0, fork2: 0 }; }
  s.players[2].pos = L.RETIRE_ID - 6;
  s = settle(act(s, { type: 'spin' }, 0, [4])); // overshoot is fine: retirement halts you
  assert.equal(s.players[0].retired, true);
  assert.equal(s.players[0].cash, L.START_CASH + L.RETIRE_BONUS[0]);
  assert.equal(s.current, 1);
  s = settle(act(s, { type: 'spin' }, 1, [0]));
  assert.equal(s.players[1].retired, true);
  assert.equal(s.players[1].cash, L.START_CASH + L.RETIRE_BONUS[1]);
  assert.equal(s.current, 2);
  s.players[2].cash = 0;
  s = settle(act(s, { type: 'spin' }, 2, [0], 0));
  if (s.phase === 'choose') s = settle(act(s, { type: 'choose', i: L.botChoice(s, 2) }, 2));
  assert.equal(s.current, 2, 'retired players are skipped');
  assert.equal(s.phase, 'turn');
  s = settle(act(s, { type: 'spin' }, 2, [9]));
  assert.equal(s.phase, 'over');
  assert.equal(life.results(s).over, true);
  assert.equal(s.players[2].rank, 3);
});

test('bot never chooses an illegal action', () => {
  const s = life.setup(P(2), {}, { now: 0, first: 0 });
  assert.deepEqual(life.bot(s, 0, { now: 0 }), { type: 'spin' });
  assert.equal(life.bot(s, 1, { now: 0 }), null);
});

// ---------- bot play-outs (same harness as tests/bots.test.mjs) ----------
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

function playOut(g, nPlayers, maxSteps = 20000) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}${Math.random().toString(36).slice(2, 6)}`, name: `Bot${i}` }));
  const opts = {};
  for (const o of g.options || []) opts[o.key] = o.default;
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
      try { apply(a, seat); } catch (e) { throw new Error(`${g.id}: bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
    }
    if (!moved) throw new Error(`${g.id}: nobody can move (phase ${s.phase})`);
  }
  throw new Error(`${g.id}: game did not finish`);
}

test('computer players finish 60 games of Life Path legally (2–6 players)', () => {
  let college = 0; let work = 0; let collegeWins = 0; let wins = 0;
  const scores = [];
  for (let k = 0; k < 60; k++) {
    const n = 2 + (k % 5);
    const { s } = playOut(life, n);
    const res = life.results(s);
    assert.equal(res.rows.length, n);
    assert.ok(res.rows.some((r) => r.win));
    assert.ok(s.players.every((p) => p.retired && p.pos === L.RETIRE_ID && p.cash >= 0));
    assert.ok(JSON.stringify(s).length < 20000, 'state stays small');
    s.players.forEach((p, i) => {
      if (p.college) college++; else work++;
      if (res.rows[i].win) { wins++; if (p.college) collegeWins++; }
      scores.push(res.rows[i].score);
    });
  }
  assert.ok(college > 20 && work > 20, `college ${college} / work ${work}`);
  console.log(`  college ${college} (won ${collegeWins}) / work ${work} (won ${wins - collegeWins}); avg worth ${L.fmt(scores.reduce((a, b) => a + b, 0) / scores.length)}`);
});
