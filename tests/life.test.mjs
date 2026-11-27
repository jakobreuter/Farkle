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
// run system actions until a player has to act
const settle = (s) => {
  for (let k = 0; k < 20; k++) {
    if (s.phase === 'finale' || s.phase === 'over') return s;
    const t = life.tick(s, { now: 1e12 });
    if (!t) return s;
    s = act(s, t, -1);
  }
  return s;
};
// everyone takes the first dealt job (or college for seats in `college`)
function startAll(s, college = []) {
  s = settle(s);
  while (s.phase === 'pick') {
    const seat = s.current;
    if (college.includes(seat)) { s = act(s, { type: 'choose', i: 3 }, seat); s = act(s, { type: 'choose', i: 0 }, seat); } else s = act(s, { type: 'choose', i: 0 }, seat);
    s = settle(s);
  }
  return s;
}

test('board: 60–75 spaces, both lanes reach retirement, ages 18→65, zones in order', () => {
  assert.ok(L.BOARD.length >= 60 && L.BOARD.length <= 75, `board has ${L.BOARD.length}`);
  assert.equal(L.ageAt(0), 18);
  assert.equal(L.ageAt(L.RETIRE_ID), 65);
  for (const lane of [0, 1]) for (const fork of [0, 1]) {
    const p = { pos: 0, route: { lane, fork } };
    let n = 0; let age = 18; const zones = [];
    while (p.pos !== L.RETIRE_ID && n++ < 200) {
      p.pos = L.nextSpace(p, p.pos);
      assert.ok(L.ageAt(p.pos) >= age); age = L.ageAt(p.pos);
      const z = L.BOARD[p.pos].zone; if (zones[zones.length - 1] !== z) zones.push(z);
    }
    assert.equal(p.pos, L.RETIRE_ID);
    assert.equal(n, L.DIST[L.RETIRE_ID]);
    assert.deepEqual(zones, ['campus', 'city', 'suburbs', 'golden']);
  }
  const keys = new Set(L.BOARD.map((s) => `${s.col},${s.row}`));
  assert.equal(keys.size, L.BOARD.length);
  // the campus lane ends at Graduation, the only fork with a choice is the mid-life Fork
  assert.ok(L.BOARD.some((s) => s.stop === 'grad' && s.lane === 0));
  assert.deepEqual(L.BOARD.filter((s) => s.t === 'stop').map((s) => s.stop), ['grad', 'wedding', 'fork', 'rethink']);
});

test('everyone chooses a path before the first spin: three dealt jobs or college', () => {
  let s = life.setup(P(3), {}, { now: 0, first: 1 });
  assert.equal(s.phase, 'deal');
  assert.equal(life.bot(s, 1, { now: 0 }), null);
  assert.deepEqual(life.randomFor(s, { type: 'deal' }, -1), [12, 11, 10, 12, 11, 10]);
  assert.throws(() => act(s, { type: 'deal' }, 1)); // system only
  s = act(s, { type: 'deal' }, -1, [0, 0, 0, 11, 0, 0]);
  assert.equal(s.phase, 'pick');
  assert.equal(s.current, 1);
  assert.deepEqual(s.pending.jobs.map((j) => j.name), ['Barista', 'Bike Courier', 'Shop Clerk']);
  assert.equal(s.pending.dreams[0].name, 'Surgeon');
  assert.throws(() => act(s, { type: 'spin' }, 1)); // no spinning before everyone has a path
  assert.throws(() => act(s, { type: 'choose', i: 0 }, 0)); // not P0's pick
  assert.throws(() => act(s, { type: 'choose', i: 5 }, 1));
  // P1: college → dream step → back → college → Surgeon
  s = act(s, { type: 'choose', i: 3 }, 1);
  assert.equal(s.pending.step, 'dream');
  s = act(s, { type: 'choose', i: 3 }, 1);
  assert.equal(s.pending.step, 'path');
  s = act(s, { type: 'choose', i: 3 }, 1);
  s = act(s, { type: 'choose', i: 0 }, 1);
  const p1 = s.players[1];
  assert.equal(p1.career.name, 'Surgeon');
  assert.ok(p1.college && p1.student);
  assert.equal(p1.loans, L.STUDENT_LOANS);
  assert.equal(p1.route.lane, 0);
  assert.equal(s.phase, 'show'); // revealed to everyone
  assert.equal(s.event.kind, 'path');
  // next player in order (2), then 0; then the first chooser spins first
  s = settle(s);
  assert.equal(s.current, 2);
  s = act(s, { type: 'choose', i: 2 }, 2);
  assert.equal(s.players[2].career.name, L.BASIC_CAREERS.find((j) => j.name === s.players[2].career.name).name);
  assert.equal(s.players[2].route.lane, 1);
  s = settle(s);
  assert.equal(s.current, 0);
  s = settle(act(s, { type: 'choose', i: 1 }, 0));
  assert.equal(s.phase, 'turn');
  assert.equal(s.current, 1);
  assert.ok(s.players.every((p) => p.picked && p.career));
});

test('college pays only after graduation; workers are paid from day one', () => {
  let s = startAll(life.setup(P(2), {}, { now: 0, first: 0 }), [0]);
  const student = s.players[0];
  assert.ok(student.student);
  // the student walks the campus lane (no paydays) and is halted at Graduation by a 10
  s = act(s, { type: 'spin' }, 0, [9]);
  assert.equal(L.BOARD[s.players[0].pos].stop, 'grad');
  s = settle(s);
  assert.equal(s.players[0].student, false);
  assert.equal(s.event.title, 'Graduation!');
  // the worker's first space is a payday
  const cash = s.players[1].cash;
  s = settle(act(s, { type: 'spin' }, 1, [0]));
  assert.equal(L.BOARD[s.players[1].pos].t, 'payday');
  assert.equal(s.players[1].cash, cash + s.players[1].career.salary);
  // a student landing on a payday gets nothing (forced for the test)
  const t = structuredClone(s);
  t.current = 0;
  t.players[0].student = true;
  t.players[0].pos = L.BOARD.find((x) => x.t === 'payday' && x.zone === 'city').id;
  t.phase = 'move';
  t.move = { no: 99, seat: 0, value: 1, from: 0, path: [t.players[0].pos] };
  const c0 = t.players[0].cash;
  assert.equal(act(t, { type: 'arrive' }, -1).players[0].cash, c0);
});

test('life cards: cash, raises, loans; family; wedding; fork; houses', () => {
  let s = startAll(life.setup(P(2), {}, { now: 0, first: 0 }));
  const put = (st, id) => { st = structuredClone(st); st.current = 0; st.players[0].pos = id; st.phase = 'move'; st.move = { no: 50, seat: 0, value: 1, from: id, path: [id] }; return st; };
  const cityCash = L.BOARD.find((x) => x.t === 'cash' && x.pool === 'city').id;
  // 'Promotion!' raises salary
  const promo = L.EVENTS.city.findIndex((e) => e[1] === 'Promotion!');
  const sal = s.players[0].career.salary;
  let t = act(put(s, cityCash), { type: 'arrive' }, -1, [promo]);
  assert.equal(t.players[0].career.salary, sal + 10 * L.K);
  assert.equal(t.event.raise, 10 * L.K);
  assert.ok(t.players[0].story.some((m) => /Salary/.test(m.t)));
  // a big loss takes loans
  const riskCash = L.BOARD.find((x) => x.t === 'cash' && x.pool === 'risk').id;
  const sink = L.EVENTS.risk.findIndex((e) => e[1] === 'Balloon tours');
  const r = put(s, riskCash); r.players[0].cash = 5000;
  t = act(r, { type: 'arrive' }, -1, [sink]);
  assert.equal(t.players[0].loans, 3);
  assert.equal(t.players[0].cash, 5000 - 35000 + 30000);
  // wedding stop
  const wed = L.BOARD.find((x) => x.stop === 'wedding').id;
  t = act(put(s, wed), { type: 'arrive' }, -1);
  assert.equal(t.pending.kind, 'wedding');
  assert.equal(t.event.kind, 'wait');
  const married = act(t, { type: 'choose', i: 0 }, 0);
  assert.ok(married.players[0].partner);
  const single = act(t, { type: 'choose', i: 1 }, 0);
  assert.ok(single.players[0].single && !single.players[0].partner);
  // family: kids if married, pets if single
  const fam = L.BOARD.find((x) => x.t === 'family').id;
  assert.equal(act(put(married, fam), { type: 'arrive' }, -1, [5]).players[0].kids, 1);
  assert.equal(act(put(married, fam), { type: 'arrive' }, -1, [0]).players[0].kids, 2); // twins
  assert.equal(act(put(single, fam), { type: 'arrive' }, -1, [5]).players[0].pets, 1);
  // fork
  const fork = L.BOARD.find((x) => x.stop === 'fork').id;
  t = act(act(put(s, fork), { type: 'arrive' }, -1), { type: 'choose', i: 1 }, 0);
  assert.equal(t.players[0].route.fork, 1);
  assert.equal(L.BOARD[L.walk(t.players[0], 1)[0]].pool, 'risk');
  // houses: 3 cards + skip, loans when short
  const hid = L.BOARD.find((x) => x.t === 'house').id;
  const hs = put(s, hid); hs.players[0].cash = 20000;
  t = act(hs, { type: 'arrive' }, -1, [9, 0, 0]);
  assert.equal(t.pending.options.length, 4);
  const manor = t.pending.options.findIndex((o) => o.name === 'Hilltop Manor');
  const bought = act(t, { type: 'choose', i: manor }, 0);
  assert.equal(bought.players[0].house.name, 'Hilltop Manor');
  assert.equal(bought.players[0].loans, 22);
  const bi = L.botChoice(t, 0);
  assert.ok(t.pending.options[bi].skip || t.pending.options[bi].price <= 20000 + 3 * L.LOAN);
  // net worth
  const p = { cash: 50000, loans: 2, house: { worth: 100000 }, partner: true, kids: 2, pets: 1 };
  assert.equal(L.netWorth(p), 50000 + 100000 + 20000 + 30000 + 6000 - 24000);
});

test('teaser shows what is ahead', () => {
  const s = startAll(life.setup(P(2), {}, { now: 0, first: 0 }));
  const up = L.upcoming(s.players[0]);
  assert.ok(up.length >= 1 && up.length <= 4);
  assert.ok(up.some((u) => u.label === 'Payday'));
});

test('retirement → finale reveals each life one by one → then over', () => {
  let s = startAll(life.setup(P(3), {}, { now: 0, first: 0 }));
  for (const p of s.players) { p.pos = L.RETIRE_ID - 1; p.route.fork = 0; }
  s = settle(act(s, { type: 'spin' }, 0, [4]));
  assert.equal(s.players[0].rank, 1);
  assert.equal(s.current, 1);
  s = settle(act(s, { type: 'spin' }, 1, [0]));
  s = act(s, { type: 'spin' }, 2, [0]);
  s = act(s, { type: 'arrive' }, -1, null, 1000);
  s = act(s, { type: 'next' }, -1, null, 5000);
  assert.equal(s.phase, 'finale');
  assert.equal(life.results(s).over, false, 'game-over popup must wait for the recap');
  assert.equal(s.finale.revealed, 0);
  assert.equal(s.finale.titles.length, 3);
  assert.equal(new Set(s.finale.titles.map((t) => t.title)).size, 3);
  // lowest worth first, richest last
  const w = s.finale.order.map((i) => L.netWorth(s.players[i]));
  assert.deepEqual(w, [...w].sort((a, b) => a - b));
  assert.equal(life.tick(s, { now: 5000 }), null);
  let now = 5000;
  for (let k = 1; k <= 3; k++) {
    now = s.autoAt;
    assert.deepEqual(life.tick(s, { now: now - 1 }), null);
    s = act(s, life.tick(s, { now }), -1, null, now);
    assert.equal(s.finale.revealed, k);
    assert.equal(life.results(s).over, false);
  }
  assert.deepEqual(life.tick(s, { now: s.autoAt }), { type: 'end' });
  assert.ok(s.autoAt - now >= L.FINALE_HOLD_MS);
  s = act(s, { type: 'end' }, -1, null, s.autoAt);
  const res = life.results(s);
  assert.equal(res.over, true);
  assert.equal(s.finale.titles[s.finale.order[2]].title, 'The Tycoon');
  assert.ok(res.rows.find((r, i) => i === s.finale.order[2]).win);
});

test('bot: never acts out of turn, picks sensibly', () => {
  let s = settle(life.setup(P(2), {}, { now: 0, first: 0 }));
  assert.equal(life.bot(s, 1, { now: 0 }), null);
  const a = life.bot(s, 0, { now: 0 });
  assert.equal(a.type, 'choose');
  s.pending.jobs = [L.BASIC_CAREERS[0], L.BASIC_CAREERS[1], L.BASIC_CAREERS[2]];
  s.pending.dreams = [L.DEGREE_CAREERS[11], L.DEGREE_CAREERS[0], L.DEGREE_CAREERS[1]];
  assert.equal(L.botChoice(s, 0), 3); // dream pays far more → college
  s.pending.dreams = [L.DEGREE_CAREERS[0], L.DEGREE_CAREERS[1], L.DEGREE_CAREERS[2]];
  s.pending.jobs = [L.BASIC_CAREERS[11], L.BASIC_CAREERS[1], L.BASIC_CAREERS[2]];
  assert.equal(L.botChoice(s, 0), 0); // best job is good enough
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

test('computer players finish 80 games of Life Path legally (2–6 players)', () => {
  let college = 0; let work = 0;
  for (let k = 0; k < 80; k++) {
    const n = 2 + (k % 5);
    const { s } = playOut(life, n);
    const res = life.results(s);
    assert.equal(res.rows.length, n);
    assert.ok(res.rows.some((r) => r.win));
    assert.equal(s.finale.revealed, n);
    assert.ok(s.players.every((p) => p.retired && p.pos === L.RETIRE_ID && p.cash >= 0 && !p.student && p.career));
    assert.ok(JSON.stringify(s).length < 20000, 'state stays small');
    s.players.forEach((p) => { if (p.college) college++; else work++; });
  }
  assert.ok(college > 40 && work > 40, `college ${college} / work ${work}`);
});
