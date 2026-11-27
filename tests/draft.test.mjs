import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/engines/draft.js';
import G from '../js/games/draft.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const zeros = (ranges) => ranges.map(() => 0);
const rnd = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));
const T = (...ks) => ks.reduce((t, k) => D.place(t, k), []);
const score = (...ks) => D.scoreTables([T(...ks)])[0];

function act(s, a, seat, now = 0, randFn = rnd) {
  const r = G.randomFor(s, a, seat);
  return G.apply(s, a, seat, { now, rand: r ? randFn(r) : null });
}

test('setup: options, classic menu skips the menu draw; random menu draws 8 types', () => {
  const c = G.setup(P(3), { menu: 'classic', rounds: '2' }, { now: 0, first: 0 });
  assert.deepEqual(c.menu, D.CLASSIC);
  assert.equal(c.rounds, 2);
  assert.equal(c.phase, 'deal');
  assert.equal(c.hand, 9);
  const r = G.setup(P(4), {}, { now: 0, first: 0 });
  assert.equal(r.rounds, 3);
  assert.equal(r.menu, null);
  assert.deepEqual(G.tick(r, { now: 0 }), { type: 'menu' });
  assert.deepEqual(G.randomFor(r, { type: 'menu' }, -1), D.MENU_RANGES);
  assert.equal(G.randomFor(r, { type: 'menu' }, 0), null);
  assert.throws(() => G.apply(r, { type: 'menu' }, 1, { now: 0, rand: zeros(D.MENU_RANGES) }));
  for (let k = 0; k < 300; k++) {
    const s = act(r, { type: 'menu' }, -1);
    assert.equal(s.menu.length, 8);
    assert.equal(new Set(s.menu).size, 8);
    if (s.menu.includes('hotsauce')) assert.ok(s.menu.includes('bites'));
    assert.ok(s.menu.some((t) => D.END_TYPES.includes(t)));
    assert.ok(D.buildDeck(s.menu).length >= 6 * 7);
  }
  assert.deepEqual([2, 3, 4, 5, 6].map(D.handSize), [10, 9, 8, 7, 7]);
});

test('deal gives everyone a hand from one shuffled deck', () => {
  let s = G.setup(P(3), { menu: 'classic' }, { now: 0 });
  const ranges = G.randomFor(s, { type: 'deal' }, -1);
  assert.equal(ranges.length, D.buildDeck(D.CLASSIC).length - 1);
  assert.throws(() => G.apply(s, { type: 'deal' }, -1, { now: 0, rand: null }));
  s = act(s, { type: 'deal' }, -1, 0, zeros);
  assert.equal(s.phase, 'pick');
  assert.equal(s.round, 1);
  const deck = D.buildDeck(D.CLASSIC);
  assert.deepEqual(s.players.map((p) => p.hand), [deck.slice(0, 9), deck.slice(9, 18), deck.slice(18, 27)]);
});

test('simultaneous picks: any order, once each, then reveal and pass left/right', () => {
  let s = G.setup(P(3), { menu: 'classic' }, { now: 0 });
  s = act(s, { type: 'deal' }, -1);
  const hands = s.players.map((p) => [...p.hand]);
  assert.throws(() => G.apply(s, { type: 'pick', i: 0 }, -1, { now: 0 })); // system can't pick
  assert.throws(() => G.apply(s, { type: 'pick', i: 99 }, 1, { now: 0 }));
  assert.throws(() => G.apply(s, { type: 'pick', i: 0, k: 'nope' }, 1, { now: 0 }));
  assert.throws(() => G.apply(s, { type: 'pass' }, 0, { now: 0 }));
  s = G.apply(s, { type: 'pick', i: 2, k: hands[2][2] }, 2, { now: 0 });
  assert.throws(() => G.apply(s, { type: 'pick', i: 0 }, 2, { now: 0 })); // already picked
  assert.deepEqual(D.waitingFor(s), [0, 1]);
  assert.equal(G.bot(s, 2, { now: 0 }), null);
  s = G.apply(s, { type: 'pick', i: 0 }, 0, { now: 0 });
  assert.equal(s.phase, 'pick');
  s = G.apply(s, { type: 'pick', i: 1 }, 1, { now: 100 });
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.reveal.cards.map((c) => c.k), [hands[0][0], hands[1][1], hands[2][2]]);
  assert.equal(s.players[0].table.length, 1);
  assert.equal(G.tick(s, { now: 100 }), null);
  assert.deepEqual(G.tick(s, { now: 100 + D.REVEAL_MS }), { type: 'pass' });
  const before = s.players.map((p) => [...p.hand]);
  s = G.apply(s, { type: 'pass' }, -1, { now: 2000 });
  // round 1 passes left: seat 1 now holds seat 0's leftovers
  assert.deepEqual(s.players.map((p) => p.hand), [before[2], before[0], before[1]]);
  assert.equal(s.phase, 'pick');
  assert.equal(s.players[0].hand.length, 8);
  assert.equal(D.passDir(2), -1);
});

test('scoring: sets, pairs, tacos, bites with hot sauce, broccoli, pickles, donuts, leftovers', () => {
  assert.equal(score('popcorn', 'popcorn').popcorn, 0);
  assert.equal(score('popcorn', 'popcorn', 'popcorn', 'popcorn').popcorn, 10);
  assert.equal(score('pretzel', 'pretzel', 'pretzel').pretzel, 5);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => score(...Array(n).fill('taco')).taco), [1, 3, 5, 8, 12, 15, 18]);
  assert.equal(score('bite3', 'hotsauce', 'bite2', 'bite1').bites, 3 + 6 + 1);
  assert.equal(score('hotsauce', 'hotsauce', 'bite3', 'bite3').bites, 18);
  assert.equal(score('hotsauce').hotsauce, 0);
  assert.equal(score('broccoli', 'broccoli').broccoli, -4);
  assert.equal(score('broccoli', 'broccoli', 'broccoli').broccoli, 12);
  assert.equal(score('pickle').pickle, 5);
  assert.equal(score('pickle', 'pickle').pickle, 2);
  assert.equal(score('donut', 'taco', 'bite1', 'bite2').donut, 3);
  assert.equal(score('donut', 'donut').donut, 2);
  // leftovers copy the previous card (and can pick up hot sauce); first-card leftovers score 0
  assert.equal(score('popcorn', 'popcorn', 'leftovers').popcorn, 10);
  assert.equal(score('hotsauce', 'leftovers', 'bite3', 'bite3').bites, 18);
  assert.deepEqual(score('leftovers'), { leftovers: 0 });
  assert.equal(score('leftovers', 'donut').donut, 1);
  assert.deepEqual(score('leftovers', 'leftovers'), { leftovers: 0 });
});

test('soda majority and end-of-game desserts', () => {
  const s = D.scoreTables([T('soda', 'soda'), T('soda'), T(), T('soda')]);
  assert.deepEqual(s.map((o) => o.soda), [6, 1, undefined, 1]); // second place splits 3
  const tie = D.scoreTables([T('soda'), T('soda'), T('soda', 'taco')]);
  assert.deepEqual(tie.map((o) => o.soda), [2, 2, 2]);
  const menu = ['cupcake', 'fortune'];
  const e = D.scoreEnd([T('cupcake', 'cupcake', 'fortune'), T('cupcake'), T()], menu);
  assert.deepEqual(e, [{ cupcake: 8, fortune: 2 }, { cupcake: 0 }, { cupcake: -4 }]);
  const two = D.scoreEnd([T('cupcake'), T()], menu);
  assert.deepEqual(two, [{ cupcake: 8 }, {}]); // no penalty with 2 players
  const f = D.scoreEnd([T(...Array(6).fill('fortune'))], menu);
  assert.equal(f[0].fortune, 26);
  assert.deepEqual(D.scoreEnd([T('cupcake')], ['fortune']), [{}]);
});

test('desserts carry over rounds; full game ends in over with totals', () => {
  let s = G.setup(P(2), { menu: 'classic', rounds: 2 }, { now: 0 });
  let now = 0;
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 500) {
    now += 1000;
    const sys = G.tick(s, { now: now + 1e9 });
    if (sys) { s = act(s, sys, -1, now); continue; }
    for (let seat = 0; seat < 2; seat++) if (s.players[seat].pick == null) s = G.apply(s, { type: 'pick', i: 0 }, seat, { now });
  }
  assert.equal(s.phase, 'over');
  assert.equal(s.round, 2);
  const r = G.results(s);
  assert.ok(r.over);
  assert.ok(r.rows.some((x) => x.win));
  s.players.forEach((p, i) => {
    assert.equal(p.total, p.rounds.reduce((a, b) => a + b, 0) + D.sum(s.final[i]));
    assert.ok(p.keep.every((e) => e.k === 'cupcake'));
  });
  assert.ok(!G.results(G.setup(P(2), {}, { now: 0 })).over);
});

test('bot takes the obvious points and completes sets', () => {
  let s = G.setup(P(2), { menu: 'classic' }, { now: 0 });
  s = act(s, { type: 'deal' }, -1);
  s.players[0].table = T('popcorn', 'popcorn');
  s.players[0].hand = ['bite1', 'popcorn', 'pretzel'];
  assert.deepEqual(G.bot(s, 0, { now: 0 }), { type: 'pick', i: 1, k: 'popcorn' });
  s.players[0].table = T('hotsauce');
  s.players[0].hand = ['bite1', 'taco', 'bite3'];
  assert.equal(G.bot(s, 0, { now: 0 }).k, 'bite3');
});

// ---- computer play-outs (same harness as tests/bots.test.mjs) ----
function playOut(g, nPlayers, opts, maxSteps = 20000) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  let s = g.setup(players, opts, { now: 0, first: 0 });
  let now = 0;
  const apply = (a, seat) => {
    const ranges = g.randomFor?.(s, a, seat);
    s = g.apply(s, a, seat, { now, rand: ranges?.length ? rnd(ranges) : null });
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
    if (!moved && !g.realtime) throw new Error(`nobody can move (phase ${s.phase})`);
  }
  throw new Error('game did not finish');
}

test('computer players finish 120 games legally (2–6 players, all options)', () => {
  const wins = {};
  for (let k = 0; k < 120; k++) {
    const n = 2 + (k % 5);
    const opts = { menu: k % 3 === 0 ? 'classic' : 'random', rounds: k % 4 === 0 ? 2 : 3 };
    const { s } = playOut(G, n, opts);
    assert.equal(s.phase, 'over');
    assert.equal(s.round, opts.rounds);
    s.players.forEach((p) => assert.equal(p.hand.length, 0));
    for (const i of D.winners(s)) wins[i] = (wins[i] || 0) + 1;
  }
  assert.ok(Object.keys(wins).length > 1);
});

test('the bot beats a random picker most of the time', () => {
  let botWins = 0;
  const N = 60;
  for (let k = 0; k < N; k++) {
    let s = G.setup(P(2), { menu: 'random' }, { now: 0 });
    let guard = 0;
    while (s.phase !== 'over' && guard++ < 1000) {
      const sys = G.tick(s, { now: 1e12 });
      if (sys) { s = act(s, sys, -1, 0); continue; }
      if (s.players[0].pick == null) s = G.apply(s, G.bot(s, 0, { now: 0 }), 0, { now: 0 });
      else s = G.apply(s, { type: 'pick', i: Math.floor(Math.random() * s.players[1].hand.length) }, 1, { now: 0 });
    }
    if (s.players[0].total > s.players[1].total) botWins++;
  }
  assert.ok(botWins > N * 0.7, `bot won only ${botWins}/${N}`);
});
