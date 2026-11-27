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
  for (let k = 0; k < 20; k++) {
    if (s.phase === 'finale' || s.phase === 'over') return s;
    const t = life.tick(s, { now: 1e12 });
    if (!t) return s;
    s = act(s, t, -1, t.type === 'setup' ? [12345] : null);
  }
  return s;
};
// everyone takes the first dealt job (or college for seats in `college`) and the first goal
function startAll(s, college = []) {
  s = settle(s);
  while (s.phase === 'pick') {
    const seat = s.current;
    if (college.includes(seat)) { s = act(s, { type: 'choose', i: 3 }, seat); s = act(s, { type: 'choose', i: 0 }, seat); } else s = act(s, { type: 'choose', i: 0 }, seat);
    if (s.phase === 'pick') s = act(s, { type: 'choose', i: 0 }, seat); // goal
    s = settle(s);
  }
  return s;
}
// put the current player on a space as if they just walked there
const put = (s, id, seat = s.current) => { s = structuredClone(s); s.current = seat; s.players[seat].pos = id; s.phase = 'move'; s.move = { no: 77, seat, value: 1, steps: 1, from: id, path: [id] }; return s; };
const find = (s, f) => L.boardOf(s).spaces.find(f).id;
const poolIdx = (pool, title) => { const i = L.POOLS[pool].findIndex((c) => c.t === title); assert.ok(i >= 0, title); return i; };
// draw a given card from a pool deck (index into the remaining deck)
const deckIdx = (s, pool, title) => s.decks[pool].indexOf(poolIdx(pool, title));

test('options are normalised; setup builds this game’s board, market and decks via randomFor', () => {
  let s = life.setup(P(3), { length: 'short', cash: 'high', chaos: 'wild', actions: 'off', goals: 'off' }, { now: 0, first: 0 });
  assert.deepEqual(s.opts, { length: 'short', cash: 'high', chaos: 'wild', actions: false, goals: false });
  assert.equal(s.players[0].cash, 30000);
  assert.equal(s.phase, 'setup');
  assert.deepEqual(life.randomFor(s, { type: 'setup' }, -1), [2 ** 31]);
  assert.throws(() => act(s, { type: 'setup' }, 0)); // system only
  s = act(s, { type: 'setup' }, -1, [42]);
  assert.equal(s.phase, 'deal');
  assert.equal(s.layout.length, 'short');
  assert.equal(s.layout.coast, false);
  const b = L.boardOf(s);
  assert.ok(!b.spaces.some((x) => x.t === 'action'), 'no action spaces when cards are off');
  assert.deepEqual(life.randomFor(s, { type: 'deal' }, -1).length, 6, 'no goal draws when goals are off');
  assert.ok(Object.values(s.market).every((m) => m.v >= 85 && m.v <= 115));
  // different seeds → different layouts (order of spaces at least)
  const t = act(life.setup(P(3), { length: 'short' }, { now: 0, first: 0 }), { type: 'setup' }, -1, [777]);
  const sig = (st) => L.boardOf(st).spaces.map((x) => x.t).join();
  assert.notEqual(sig(s), sig(t));
  assert.equal(normalSize('short') < normalSize('normal'), true);
  assert.equal(normalSize('normal') < normalSize('epic'), true);
  function normalSize(len) { return L.buildBoard({ length: len, fork: 'A', coast: len === 'epic', seed: 1, actions: true }).spaces.length; }
});

test('every layout: both lanes reach retirement, ages 18→65, 60–100 spaces for normal/epic', () => {
  for (const length of ['short', 'normal', 'epic']) for (const fork of ['A', 'B']) for (const coast of [false, true]) for (const seed of [1, 99]) {
    const b = L.buildBoard({ length, fork, coast: coast && length !== 'short', seed, actions: true });
    assert.equal(L.ageAt(b, 0), 18);
    assert.equal(L.ageAt(b, b.retire), 65);
    for (const lane of [0, 1]) for (const fk of [0, 1]) {
      const p = { pos: 0, route: { lane, fork: fk } };
      let n = 0;
      while (p.pos !== b.retire && n++ < 300) p.pos = L.nextSpace(b, p, p.pos);
      assert.equal(p.pos, b.retire);
      assert.equal(n, b.dist[b.retire]);
    }
    assert.equal(new Set(b.spaces.map((x) => `${x.col},${x.row}`)).size, b.spaces.length);
    assert.deepEqual(b.spaces.filter((x) => x.t === 'stop').map((x) => x.stop), ['grad', 'wedding', 'fork', 'rethink']);
  }
});

test('start: path + secret goal per player; goals hidden in pending only for the chooser', () => {
  let s = settle(life.setup(P(3), {}, { now: 0, first: 1 }));
  assert.equal(s.phase, 'pick');
  assert.equal(s.current, 1);
  assert.equal(s.pending.goals.length, 2);
  assert.throws(() => act(s, { type: 'spin' }, 1));
  assert.throws(() => act(s, { type: 'choose', i: 0 }, 0));
  s = act(s, { type: 'choose', i: 3 }, 1); // college
  s = act(s, { type: 'choose', i: 0 }, 1); // dream job
  assert.equal(s.pending.step, 'goal');
  assert.ok(s.players[1].student && s.players[1].loans === L.STUDENT_LOANS);
  assert.throws(() => act(s, { type: 'choose', i: 2 }, 1));
  const g = s.pending.goals[1];
  s = act(s, { type: 'choose', i: 1 }, 1);
  assert.equal(s.players[1].goal, g);
  assert.equal(s.event.kind, 'path');
  assert.ok(!JSON.stringify(s.event).includes(g), 'the reveal does not mention the goal');
  s = settle(s);
  assert.equal(s.current, 2);
  s = startAll(s);
  assert.equal(s.phase, 'turn');
  assert.equal(s.current, 1);
  assert.ok(s.players.every((p) => p.goal && p.career));
  // goals off → no goal step
  let t = settle(life.setup(P(2), { goals: 'off' }, { now: 0, first: 0 }));
  t = act(t, { type: 'choose', i: 0 }, 0);
  assert.equal(t.phase, 'show');
});

test('decisions: invest (gamble), hustle pays every payday, night school raise, insurance cancels a disaster', () => {
  let s = startAll(life.setup(P(2), {}, { now: 0, first: 0 }));
  const lifeSp = find(s, (x) => x.t === 'cash' && x.pool === 'city');
  // startup pitch → invest → win (roll 0 < 50)
  let t = act(put(s, lifeSp, 0), { type: 'arrive' }, -1, [deckIdx(s, 'city', 'Startup pitch')]);
  assert.equal(t.phase, 'choose');
  assert.equal(t.pending.kind, 'decision');
  assert.deepEqual(life.randomFor(t, { type: 'choose', i: 0 }, 0), [100]);
  assert.equal(life.randomFor(t, { type: 'choose', i: 1 }, 0), null);
  const c0 = t.players[0].cash + 100000;
  t.players[0].cash = c0;
  const win = act(t, { type: 'choose', i: 0 }, 0, [0]);
  assert.equal(win.players[0].cash, c0 - 20000 + 60000);
  assert.equal(win.players[0].st.gWins, 1);
  const lose = act(t, { type: 'choose', i: 0 }, 0, [99]);
  assert.equal(lose.players[0].cash, c0 - 20000);
  const pass = act(t, { type: 'choose', i: 1 }, 0);
  assert.equal(pass.players[0].cash, c0);
  // food truck → hustle; a payday later pays salary + hustle
  t = act(put(s, lifeSp, 0), { type: 'arrive' }, -1, [deckIdx(s, 'city', 'Food truck dream')]);
  t.players[0].cash = 50000;
  t = act(t, { type: 'choose', i: 0 }, 0);
  assert.equal(t.players[0].hustle, 8000);
  t = settle(t);
  const pay = find(t, (x) => x.t === 'payday' && x.zone === 'city');
  const before = t.players[0].cash;
  t = act(put(t, pay, 0), { type: 'arrive' }, -1);
  assert.equal(t.players[0].cash, before + t.players[0].career.salary + 8000);
  // night school raise
  t = act(put(s, lifeSp, 0), { type: 'arrive' }, -1, [deckIdx(s, 'city', 'Night school')]);
  const sal = t.players[0].career.salary;
  t = act(t, { type: 'choose', i: 0 }, 0);
  assert.equal(t.players[0].career.salary, sal + 10000);
  assert.equal(t.players[0].st.raises, 1);
  // insurance, then a disaster is cancelled once
  t = act(put(s, lifeSp, 0), { type: 'arrive' }, -1, [deckIdx(s, 'city', 'Insurance agent')]);
  t.players[0].cash = 50000;
  t = settle(act(t, { type: 'choose', i: 0 }, 0));
  assert.equal(t.players[0].insured, true);
  const cash = t.players[0].cash;
  let u = act(put(t, lifeSp, 0), { type: 'arrive' }, -1, [deckIdx(t, 'city', 'Burst pipe')]);
  assert.equal(u.players[0].cash, cash);
  assert.equal(u.players[0].insured, false);
  u = settle(u);
  u = act(put(u, lifeSp, 0), { type: 'arrive' }, -1, [deckIdx(u, 'city', 'Fender bender')]);
  assert.equal(u.players[0].cash, cash - 8000);
  // a drawn card leaves the deck until it is reshuffled
  assert.ok(!u.decks.city.includes(poolIdx('city', 'Fender bender')));
});

test('action cards: draw (hand max 3), play on others, Lawyer Up blocks, once per turn, hidden in hand', () => {
  let s = startAll(life.setup(P(3), {}, { now: 0, first: 0 }));
  const actSp = find(s, (x) => x.t === 'action');
  let t = act(put(s, actSp, 0), { type: 'arrive' }, -1, [s.adeck.indexOf('lawsuit')]);
  assert.deepEqual(t.players[0].hand, ['lawsuit']);
  assert.equal(t.event.secret, 'lawsuit');
  t = settle(t);
  t.current = 0; t.phase = 'turn';
  t.players[1].cash = 100000;
  assert.throws(() => act(t, { type: 'play', card: 0, target: 0 }, 0)); // not on yourself
  assert.throws(() => act(t, { type: 'play', card: 0, target: 1 }, 1)); // not your turn
  let u = act(t, { type: 'play', card: 0, target: 1 }, 0);
  assert.equal(u.players[1].cash, 60000);
  assert.equal(u.players[0].cash, t.players[0].cash + 40000);
  assert.equal(u.players[0].st.plays, 1);
  assert.equal(u.phase, 'show');
  u = settle(u);
  assert.equal(u.phase, 'turn', 'back to the same player’s turn');
  assert.equal(u.current, 0);
  u.players[0].hand = ['audit'];
  assert.throws(() => act(u, { type: 'play', card: 0, target: 1 }, 0), /not now/); // one card per turn
  // shield blocks automatically and is used up
  t.players[2].hand = ['shield'];
  const v = act(t, { type: 'play', card: 0, target: 2 }, 0);
  assert.equal(v.players[2].cash, t.players[2].cash);
  assert.deepEqual(v.players[2].hand, []);
  assert.deepEqual(v.players[0].hand, []);
  assert.equal(v.event.kind, 'block');
  // headhunter: their next payday goes to you
  t.players[0].hand = ['headhunt'];
  let w = settle(act(t, { type: 'play', card: 0, target: 1 }, 0));
  const pay = find(w, (x) => x.t === 'payday' && x.zone === 'city');
  const c0 = w.players[0].cash; const c1 = w.players[1].cash;
  w = act(put(w, pay, 1), { type: 'arrive' }, -1);
  assert.equal(w.players[0].cash, c0 + w.players[1].career.salary);
  assert.equal(w.players[1].cash, c1);
  assert.equal(w.players[1].poachedBy, -1);
  // hand max 3
  t.players[0].hand = ['shield', 'shield', 'audit'];
  const full = act(put(t, actSp, 0), { type: 'arrive' }, -1);
  assert.equal(full.players[0].hand.length, 3);
  // shields are never played directly; cards off → no plays
  t.players[0].hand = ['shield'];
  assert.throws(() => act(t, { type: 'play', card: 0 }, 0));
  const off = startAll(life.setup(P(2), { actions: 'off' }, { now: 0, first: 0 }));
  off.players[0].hand = ['windfall'];
  assert.throws(() => act(off, { type: 'play', card: 0 }, 0));
});

test('house market: moves each round via randomFor; buy at market price, sell at a payday', () => {
  let s = startAll(life.setup(P(2), {}, { now: 0, first: 0 }));
  // finishing player 1's turn wraps the round → market draw
  let t = structuredClone(s); t.current = 1; t.phase = 'show'; t.autoAt = 0;
  assert.equal(life.randomFor(t, { type: 'next' }, -1).length, L.MARKET_TYPES.length);
  const v0 = t.market.condo.v;
  t = act(t, { type: 'next' }, -1, [7, 0, 3, 3]); // condo +20, cabin −15
  assert.equal(t.market.condo.v, v0 + 20);
  assert.equal(t.market.condo.d, 20);
  assert.equal(t.round, 1);
  t.current = 0; t.phase = 'show';
  assert.equal(life.randomFor(t, { type: 'next' }, -1), null, 'no market move mid-round');
  // buy
  const hid = find(s, (x) => x.t === 'house');
  let u = act(put(s, hid, 0), { type: 'arrive' }, -1, [0, 0, 0]); // Cozy Studio, Downtown Loft, Tiny Cabin
  const studio = u.pending.options.findIndex((o) => o.name === 'Cozy Studio');
  const price = L.houseValue(u, { i: 0 });
  assert.equal(u.pending.options[studio].price, price);
  u.players[0].cash = 100000;
  u = settle(act(u, { type: 'choose', i: studio }, 0));
  assert.equal(u.players[0].house.paid, price);
  assert.equal(u.players[0].cash, 100000 - price);
  // the market rises; landing on a payday offers a sale
  u.market.condo.v = 200;
  const pay = find(u, (x) => x.t === 'payday' && x.zone === 'city');
  u = act(put(u, pay, 0), { type: 'arrive' }, -1);
  assert.equal(u.pending.kind, 'sell');
  const cash = u.players[0].cash;
  const sold = act(u, { type: 'choose', i: 1 }, 0);
  assert.equal(sold.players[0].house, null);
  assert.equal(sold.players[0].cash, cash + 90000);
  assert.equal(L.netWorth(sold, sold.players[0]), L.netWorth(u, u.players[0]));
});

test('chaos scales events and cards; goals score at the end', () => {
  const mk = (chaos) => startAll(life.setup(P(2), { chaos }, { now: 0, first: 0 }));
  const lifeSp = (s) => find(s, (x) => x.t === 'cash' && x.pool === 'city');
  const gain = (chaos) => { const s = mk(chaos); const t = act(put(s, lifeSp(s), 0), { type: 'arrive' }, -1, [deckIdx(s, 'city', 'Art fair')]); return t.players[0].cash - s.players[0].cash; };
  assert.equal(gain('normal'), 8000);
  assert.ok(gain('calm') < 8000 && gain('wild') > 8000);
  // goals
  const s = mk('normal');
  const p = s.players[0];
  p.goal = 'globe'; p.st.trips = 3;
  assert.deepEqual(L.goalStatus(s, 0), { done: true, bonus: 60000, prog: '3/3' });
  p.st.trips = 2;
  assert.equal(L.goalStatus(s, 0).done, false);
  p.goal = 'thrifty';
  assert.equal(L.goalStatus(s, 0).bonus, 30000);
  p.st.bankLoans = 1;
  assert.equal(L.goalStatus(s, 0).bonus, 0);
  p.goal = 'tycoon'; p.cash = 999999;
  assert.equal(L.finalWorth(s, 0), L.netWorth(s, p) + 60000);
  const off = startAll(life.setup(P(2), { goals: 'off' }, { now: 0, first: 0 }));
  assert.equal(L.finalWorth(off, 0), L.netWorth(off, off.players[0]));
  assert.ok(!L.goalKeys(startAll(life.setup(P(2), { actions: 'off' }, { now: 0, first: 0 }))).includes('shark'));
});

test('finale reveals each life (with goal results) one by one, then over', () => {
  let s = startAll(life.setup(P(3), {}, { now: 0, first: 0 }));
  const b = L.boardOf(s);
  for (const p of s.players) { p.pos = b.retire - 1; p.route.fork = 0; }
  for (let k = 0; k < 3; k++) {
    s = act(s, { type: 'spin' }, s.current, [4]);
    s = settle(s);
  }
  assert.equal(s.phase, 'finale');
  assert.equal(life.results(s).over, false, 'game-over popup waits for the recap');
  assert.equal(s.finale.goals.length, 3);
  const w = s.finale.order.map((i) => s.finale.worth[i]);
  assert.deepEqual(w, [...w].sort((a, c) => a - c));
  let now = 0;
  for (let k = 1; k <= 3; k++) {
    now = s.autoAt;
    assert.equal(life.tick(s, { now: now - 1 }), null);
    s = act(s, life.tick(s, { now }), -1, null, now);
    assert.equal(s.finale.revealed, k);
    assert.equal(life.results(s).over, false);
  }
  assert.deepEqual(life.tick(s, { now: s.autoAt }), { type: 'end' });
  s = act(s, { type: 'end' }, -1, null, s.autoAt);
  const res = life.results(s);
  assert.equal(res.over, true);
  assert.deepEqual(res.rows.map((r) => r.score), s.finale.worth);
  assert.ok(res.rows[s.finale.order[2]].win);
});

test('bot: plays attack cards on the leader, picks goal-minded decisions', () => {
  const s = startAll(life.setup(P(3), {}, { now: 0, first: 0 }));
  s.players[0].hand = ['shield', 'lawsuit'];
  s.players[2].cash = 500000;
  assert.deepEqual(life.bot(s, 0, { now: 0 }), { type: 'play', card: 1, target: 2 });
  s.players[0].hand = ['shield'];
  assert.deepEqual(life.bot(s, 0, { now: 0 }), { type: 'spin' });
  assert.equal(life.bot(s, 1, { now: 0 }), null);
  const lifeSp = find(s, (x) => x.t === 'cash' && x.pool === 'city');
  const t = act(put(s, lifeSp, 0), { type: 'arrive' }, -1, [deckIdx(s, 'city', 'Island cruise')]);
  t.players[0].cash = 100000;
  t.players[0].goal = 'globe';
  assert.equal(L.botChoice(t, 0), 0, 'a globetrotter takes the trip');
  t.players[0].goal = 'thrifty'; t.players[0].cash = 0;
  assert.equal(L.botChoice(t, 0), 1, 'penny-wise avoids a loan');
});

// ---------- bot play-outs (same harness as tests/bots.test.mjs) ----------
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));
function playOut(g, nPlayers, opts, maxSteps = 30000) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}${Math.random().toString(36).slice(2, 6)}`, name: `Bot${i}` }));
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

test('computer players finish 96 games of Life Path legally across all options (2–6 players)', () => {
  const variants = [{}, { length: 'short' }, { length: 'epic', chaos: 'wild' }, { chaos: 'calm', actions: 'off' }, { goals: 'off', cash: 'low' }, { cash: 'high', actions: 'off', goals: 'off' }];
  let college = 0; let work = 0; let plays = 0;
  for (let k = 0; k < 96; k++) {
    const n = 2 + (k % 5);
    const opts = variants[k % variants.length];
    const { s } = playOut(life, n, opts);
    const res = life.results(s);
    assert.equal(res.rows.length, n);
    assert.ok(res.rows.some((r) => r.win));
    assert.equal(s.finale.revealed, n);
    const b = L.boardOf(s);
    assert.ok(s.players.every((p) => p.retired && p.pos === b.retire && p.cash >= 0 && !p.student && p.career && p.hand.length <= 3));
    if (!s.opts.actions) assert.ok(s.players.every((p) => p.hand.length === 0 && p.st.plays === 0));
    if (!s.opts.goals) assert.ok(s.players.every((p) => !p.goal));
    assert.ok(JSON.stringify(s).length < 30000, 'state stays small');
    s.players.forEach((p) => { if (p.college) college++; else work++; plays += p.st.plays; });
  }
  assert.ok(college > 40 && work > 40, `college ${college} / work ${work}`);
  assert.ok(plays > 20, `action cards were played (${plays})`);
});
