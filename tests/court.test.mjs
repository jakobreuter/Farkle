import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/engines/court.js';
import G from '../js/games/court.js';

const P = [{ pid: 'a', name: 'Ann' }, { pid: 'b', name: 'Ben' }, { pid: 'c', name: 'Cat' }];

/** a dealt game with chosen hands (deck = whatever is left) */
function dealt(hands, { coins, reactMs = 5000, first = 0 } = {}) {
  let s = C.newGame(P.slice(0, hands.length), first, { reactMs });
  s.phase = 'turn';
  s.players.forEach((p, i) => {
    p.cards = hands[i].map((r) => ({ r, up: false }));
    for (const r of hands[i]) s.deck.splice(s.deck.indexOf(r), 1);
    if (coins) p.coins = coins[i];
  });
  return s;
}
const A = (s, a, seat, now = 0, rand = null) => C.applyAction(s, a, seat, { now, rand });

test('setup, option and dealing through randomFor', () => {
  const s0 = G.setup(P, { react: 12 }, { now: 0, first: 4 });
  assert.equal(s0.reactMs, 12000);
  assert.equal(s0.current, 1);
  assert.equal(G.setup(P, {}, { first: 0 }).reactMs, 8000);
  assert.equal(s0.phase, 'deal');
  assert.deepEqual(G.tick(s0, { now: 0 }), { type: 'deal' });
  assert.deepEqual(G.randomFor(s0, { type: 'deal' }, -1), [15, 14, 13, 12, 11, 10]);
  assert.throws(() => G.apply(s0, { type: 'deal' }, 0, { now: 0, rand: [0, 0, 0, 0, 0, 0] }));
  const s1 = G.apply(s0, { type: 'deal' }, -1, { now: 0, rand: [0, 0, 0, 0, 0, 0] });
  assert.equal(s1.phase, 'turn');
  assert.deepEqual(s1.players.map((p) => p.cards.map((c) => c.r)), [['treasurer', 'poisoner'], ['treasurer', 'poisoner'], ['treasurer', 'poisoner']]);
  assert.equal(s1.deck.length, 9);
  assert.ok(s1.players.every((p) => p.coins === 2));
});

test('wages resolve at once; turn order; permissions', () => {
  let s = dealt([['treasurer', 'physician'], ['smuggler', 'spymaster'], ['poisoner', 'physician']]);
  assert.throws(() => A(s, { type: 'act', act: 'wages' }, 1));
  s = A(s, { type: 'act', act: 'wages' }, 0);
  assert.equal(s.players[0].coins, 3);
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'turn');
  assert.throws(() => A(s, { type: 'act', act: 'poison', target: 0 }, 1)); // only 2 coins
  assert.throws(() => A(s, { type: 'act', act: 'steal', target: 1 }, 1)); // not yourself
  assert.throws(() => A(s, { type: 'pass' }, 0)); // nothing to answer
});

test('an unchallenged levy pays 3 after everyone passes or the timer ends', () => {
  let s = dealt([['spymaster', 'physician'], ['smuggler', 'spymaster'], ['poisoner', 'physician']]);
  s = A(s, { type: 'act', act: 'levy' }, 0, 1000); // a bluff
  assert.equal(s.phase, 'react');
  assert.equal(s.pending.until, 6000);
  assert.deepEqual(C.eligible(s), [1, 2]);
  assert.throws(() => A(s, { type: 'challenge' }, 0)); // not your own claim
  assert.throws(() => A(s, { type: 'block', role: 'treasurer' }, 1)); // levy can't be blocked
  assert.equal(G.tick(s, { now: 5999 }), null);
  assert.deepEqual(G.tick(s, { now: 6000 }), { type: 'timeout', at: 6000 });
  assert.throws(() => A(s, { type: 'timeout', at: 5000 }, -1, 6000)); // stale timer
  const t = A(s, G.tick(s, { now: 1e12 }), -1, 6000);
  assert.equal(t.players[0].coins, 5);
  assert.equal(t.current, 1);
  s = A(s, { type: 'pass' }, 1, 1500);
  assert.throws(() => A(s, { type: 'pass' }, 1, 1600));
  s = A(s, { type: 'pass' }, 2, 1700);
  assert.equal(s.players[0].coins, 5);
  assert.equal(s.phase, 'turn');
});

test('challenge a true claim: claimer swaps the shown card, challenger loses one (and chooses)', () => {
  let s = dealt([['treasurer', 'physician'], ['smuggler', 'spymaster'], ['poisoner', 'physician']]);
  s = A(s, { type: 'act', act: 'levy' }, 0, 0);
  assert.deepEqual(G.randomFor(s, { type: 'challenge' }, 1), [s.deck.length + 1]);
  assert.throws(() => A(s, { type: 'challenge' }, 1, 100, null)); // needs the shuffle
  const deckBefore = s.deck.length;
  s = A(s, { type: 'challenge' }, 1, 100, [deckBefore]); // draws the shown Treasurer straight back
  assert.equal(s.fx.kind, 'proved');
  assert.equal(s.phase, 'lose');
  assert.equal(s.lose.seat, 1);
  assert.equal(s.deck.length, deckBefore);
  assert.throws(() => A(s, { type: 'reveal', idx: 0 }, 0));
  s = A(s, { type: 'reveal', idx: 1 }, 1, 200);
  assert.equal(s.players[1].cards[1].up, true);
  assert.equal(s.players[0].coins, 5); // levy still happens
  assert.equal(s.current, 1);
});

test('challenge a bluff: bluffer loses a card, action fails; one-card loser reveals automatically', () => {
  let s = dealt([['spymaster', 'physician'], ['smuggler', 'spymaster'], ['poisoner', 'physician']]);
  s.players[0].cards[1].up = true;
  s = A(s, { type: 'act', act: 'levy' }, 0, 0);
  s = A(s, { type: 'challenge' }, 2, 100, [0]);
  assert.equal(s.fx.kind, 'out');
  assert.equal(s.players[0].coins, 2);
  assert.equal(C.isIn(s, 0), false);
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'turn');
});

test('petition can be blocked by anyone as Treasurer; block can be challenged', () => {
  let s = dealt([['spymaster', 'physician'], ['treasurer', 'spymaster'], ['poisoner', 'physician']]);
  s = A(s, { type: 'act', act: 'petition' }, 0, 0);
  assert.deepEqual(C.eligible(s), [1, 2]);
  assert.throws(() => A(s, { type: 'challenge' }, 1)); // no role claimed
  assert.throws(() => A(s, { type: 'block', role: 'physician' }, 2));
  let b = A(s, { type: 'block', role: 'treasurer' }, 2, 100); // Cat bluffs a Treasurer
  assert.equal(b.pending.stage, 'blockChal');
  assert.deepEqual(C.eligible(b), [0, 1]);
  // nobody challenges: the block stands
  let t = A(b, G.tick(b, { now: 1e12 }), -1, 99999);
  assert.equal(t.players[0].coins, 2);
  assert.equal(t.current, 1);
  // Ann challenges the bluff: Cat loses a card, petition goes through
  t = A(b, { type: 'challenge' }, 0, 200, [0]);
  assert.equal(t.phase, 'lose');
  t = A(t, { type: 'reveal', idx: 0 }, 2, 300);
  assert.equal(t.players[0].coins, 4);
  // Ben blocks truthfully and Ann challenges: Ann loses, block stands
  b = A(s, { type: 'block', role: 'treasurer' }, 1, 100);
  t = A(b, { type: 'challenge' }, 0, 200, [3]);
  assert.equal(t.fx.kind, 'proved');
  t = A(t, { type: 'reveal', idx: 0 }, 0, 300);
  assert.equal(t.players[0].coins, 2);
  assert.equal(t.phase, 'turn');
});

test('poison: costs 3, only the target may block (Physician); double loss possible', () => {
  let s = dealt([['poisoner', 'physician'], ['smuggler', 'spymaster'], ['treasurer', 'physician']], { coins: [5, 2, 2] });
  s = A(s, { type: 'act', act: 'poison', target: 1 }, 0, 0);
  assert.equal(s.players[0].coins, 2);
  assert.deepEqual(C.blockerSeats(s), [1]);
  assert.equal(C.canBlock(s, 2, 'physician'), false);
  // Ben challenges and is wrong: loses one, then may still block
  let t = A(s, { type: 'challenge' }, 1, 100, [0]);
  t = A(t, { type: 'reveal', idx: 0 }, 1, 200);
  assert.equal(t.phase, 'react');
  assert.equal(t.pending.stage, 'block');
  assert.deepEqual(C.eligible(t), [1]);
  // he lets it go -> loses the last card
  t = A(t, { type: 'pass' }, 1, 300);
  assert.equal(C.isIn(t, 1), false);
  assert.equal(t.current, 2);
  // or Ben bluffs a Physician block, Cat challenges, Ben loses both
  t = A(s, { type: 'block', role: 'physician' }, 1, 100);
  t = A(t, { type: 'challenge' }, 2, 200, [0]);
  t = A(t, { type: 'reveal', idx: 1 }, 1, 300);
  assert.equal(C.isIn(t, 1), false);
});

test('steal takes up to 2; blockable by Smuggler or Spymaster', () => {
  let s = dealt([['smuggler', 'physician'], ['treasurer', 'spymaster'], ['treasurer', 'physician']], { coins: [2, 1, 0] });
  assert.throws(() => A(s, { type: 'act', act: 'steal', target: 2 }, 0)); // nothing to take
  s = A(s, { type: 'act', act: 'steal', target: 1 }, 0, 0);
  assert.deepEqual(C.eligible(s), [1, 2]); // both may challenge, only Ben may block
  let t = A(s, G.tick(s, { now: 1e12 }), -1, 99999);
  assert.deepEqual(t.players.map((p) => p.coins), [3, 0, 0]);
  t = A(s, { type: 'block', role: 'spymaster' }, 1, 10);
  t = A(t, { type: 'pass' }, 0, 20);
  t = A(t, { type: 'pass' }, 2, 30);
  assert.deepEqual(t.players.map((p) => p.coins), [2, 1, 0]);
});

test('banish: 7 coins, unstoppable; 10+ coins forces it', () => {
  let s = dealt([['smuggler', 'physician'], ['treasurer', 'spymaster']], { coins: [10, 1] });
  assert.throws(() => A(s, { type: 'act', act: 'levy' }, 0));
  s = A(s, { type: 'act', act: 'banish', target: 1 }, 0, 0);
  assert.equal(s.phase, 'lose');
  assert.equal(s.players[0].coins, 3);
  s = A(s, G.tick(s, { now: 1e12 }), -1, C.LOSE_MS); // auto-reveals the first hidden card
  assert.equal(s.players[1].cards[0].up, true);
  assert.equal(s.current, 1);
});

test('spymaster swap: draw 2 via a system step, keep the same number', () => {
  let s = dealt([['spymaster', 'physician'], ['treasurer', 'smuggler']]);
  s = A(s, { type: 'act', act: 'swap' }, 0, 0);
  s = A(s, G.tick(s, { now: 1e12 }), -1, 99999);
  assert.equal(s.phase, 'swapDraw');
  assert.deepEqual(G.tick(s, { now: 0 }), { type: 'draw' });
  const n = s.deck.length;
  assert.deepEqual(G.randomFor(s, { type: 'draw' }, -1), [n, n - 1]);
  s = A(s, { type: 'draw' }, -1, 100, [0, 0]);
  assert.equal(s.swap.options.length, 4);
  assert.deepEqual(s.swap.options.slice(0, 2), ['spymaster', 'physician']);
  assert.throws(() => A(s, { type: 'keep', idx: [2] }, 0));
  assert.throws(() => A(s, { type: 'keep', idx: [2, 2] }, 0));
  assert.throws(() => A(s, { type: 'keep', idx: [2, 3] }, 1));
  const opts = s.swap.options;
  const t = A(s, { type: 'keep', idx: [2, 3] }, 0, 200);
  assert.deepEqual(t.players[0].cards.map((c) => c.r), [opts[2], opts[3]]);
  assert.equal(t.deck.length, n);
  assert.equal(t.current, 1);
  // all role counts are preserved
  const all = [...t.deck, ...t.players.flatMap((p) => p.cards.map((c) => c.r))].sort();
  assert.deepEqual(all, C.ROLES.flatMap((r) => [r, r, r]).sort());
});

test('last player standing wins', () => {
  let s = dealt([['smuggler', 'physician'], ['treasurer', 'spymaster']], { coins: [7, 1] });
  s.players[1].cards[0].up = true;
  s = A(s, { type: 'act', act: 'banish', target: 1 }, 0, 0);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
  const r = G.results(s);
  assert.equal(r.over, true);
  assert.deepEqual(r.rows.map((x) => x.win), [true, false]);
  assert.throws(() => A(s, { type: 'act', act: 'wages' }, 1));
});

test('bot reasoning: challenges impossible claims, blocks with real cards', () => {
  // Ben holds two Treasurers and one is revealed elsewhere: Ann can't have one
  let s = dealt([['spymaster', 'physician'], ['treasurer', 'treasurer'], ['treasurer', 'physician']]);
  s.players[2].cards[0].up = true;
  s = A(s, { type: 'act', act: 'levy' }, 0, 0);
  assert.equal(C.chanceHolds(s, 1, 0, 'treasurer'), 0);
  assert.deepEqual(C.botAction(s, 1), { type: 'challenge' });
  let t = dealt([['poisoner', 'smuggler'], ['physician', 'spymaster'], ['treasurer', 'smuggler']], { coins: [3, 2, 2] });
  t = A(t, { type: 'act', act: 'poison', target: 1 }, 0, 0);
  assert.deepEqual(C.botAction(t, 1), { type: 'block', role: 'physician' });
  assert.equal(C.botAction(t, 0), null);
});

// ---------- computer play-outs ----------
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

// same as tests/bots.test.mjs
function playOut(g, nPlayers, maxSteps = 20000, { realTimers = false } = {}) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  const opts = {};
  for (const o of g.options || []) opts[o.key] = o.default;
  let s = g.setup(players, opts, { now: 0, first: 0 });
  let now = 0;
  const apply = (a, seat) => {
    const ranges = g.randomFor?.(s, a, seat);
    s = g.apply(s, a, seat, { now, rand: ranges?.length ? randFor(ranges) : null });
  };
  const stats = { challenges: 0, blocks: 0 };
  for (let step = 0; step < maxSteps; step++) {
    if (g.results(s).over) return { s, step, stats };
    now += 1000;
    const sys = g.tick?.(s, { now: realTimers ? now : now + 1e9 });
    if (sys) { apply(sys, -1); continue; }
    let moved = false;
    for (let seat = 0; seat < nPlayers && !moved; seat++) {
      const a = g.bot(s, seat, { now });
      if (!a) continue;
      if (a.type === 'challenge') stats.challenges++;
      if (a.type === 'block') stats.blocks++;
      try { apply(a, seat); } catch (e) { throw new Error(`${g.id}: bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
    }
    if (!moved && !g.realtime && !realTimers) throw new Error(`${g.id}: nobody can move (phase ${s.phase})`);
  }
  throw new Error(`${g.id}: game did not finish`);
}

test('computer players finish Court Intrigue legally (timers expire instantly, as in bots.test)', () => {
  for (let k = 0; k < 60; k++) playOut(G, 2 + (k % 5));
});

test('computer players finish with real reaction windows (they challenge and block)', () => {
  const tot = { challenges: 0, blocks: 0 };
  const wins = Array(6).fill(0);
  for (let k = 0; k < 120; k++) {
    const { s, stats } = playOut(G, 2 + (k % 5), 20000, { realTimers: true });
    tot.challenges += stats.challenges;
    tot.blocks += stats.blocks;
    wins[s.winner]++;
    // card conservation
    const all = [...s.deck, ...s.players.flatMap((p) => p.cards.map((c) => c.r))].sort();
    assert.deepEqual(all, C.ROLES.flatMap((r) => [r, r, r]).sort());
  }
  assert.ok(tot.challenges > 50, `challenges ${tot.challenges}`);
  assert.ok(tot.blocks > 50, `blocks ${tot.blocks}`);
});
