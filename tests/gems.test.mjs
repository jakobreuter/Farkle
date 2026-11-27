import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/engines/gems.js';
import g from '../js/games/gems.js';

const P2 = [{ pid: 'a', name: 'A' }, { pid: 'b', name: 'B' }];
const P3 = [...P2, { pid: 'c', name: 'C' }];
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));
const zeros = (ranges) => ranges.map(() => 0);

function dealt(players = P2, opts = { target: 15, patrons: 'on' }) {
  let s = g.setup(players, opts, { now: 0, first: 0 });
  const a = g.tick(s, { now: 0 });
  assert.deepEqual(a, { type: 'deal' });
  s = g.apply(s, a, -1, { now: 0, rand: zeros(g.randomFor(s, a, -1)) });
  return s;
}
const act = (s, a, seat, rand) => g.apply(s, a, seat, { now: 0, rand: rand ?? (() => { const r = g.randomFor(s, a, seat); return r ? zeros(r) : null; })() });

test('card set and patrons are well-formed', () => {
  assert.equal(G.CARDS.length, 90);
  assert.deepEqual(G.TIER_SIZE, [40, 30, 20]);
  for (const c of G.CARDS) {
    assert.ok(c.cost.reduce((a, b) => a + b, 0) >= 3);
    assert.ok(c.pts >= 0 && c.pts <= 5);
  }
  for (let col = 0; col < 5; col++) assert.equal(G.CARDS.filter((c) => c.color === col).length, 18);
  assert.equal(G.PATRONS.length, 20);
  assert.equal(new Set(G.PATRONS.map((p) => p.name)).size, 20);
});

test('setup: supply scales with players; deal fills the market and patrons', () => {
  const s2 = dealt(P2);
  assert.deepEqual(s2.supply, [5, 5, 5, 5, 5, 5]);
  assert.equal(s2.patrons.length, 3);
  assert.ok(s2.market.every((row) => row.every((id) => id != null)));
  assert.equal(s2.decks[0].length, 36);
  const s4 = dealt([...P3, { pid: 'd', name: 'D' }]);
  assert.equal(s4.supply[0], 7);
  assert.equal(s4.patrons.length, 5);
  const off = dealt(P3, { target: 21, patrons: 'off' });
  assert.equal(off.patrons.length, 0);
  assert.equal(off.opts.target, 21);
  assert.equal(off.supply[0], 6);
  // only the system may deal; players can't act during the deal
  const raw = g.setup(P2, {}, { now: 0, first: 0 });
  assert.throws(() => g.apply(raw, { type: 'deal' }, 0, { rand: zeros(g.randomFor(raw, { type: 'deal' }, -1)) }));
  assert.throws(() => g.apply(raw, { type: 'take', gems: [0] }, 0, { rand: null }));
});

test('taking gems: different colours, two of a kind needs 4+, turn passes', () => {
  let s = dealt();
  assert.throws(() => act(s, { type: 'take', gems: [0, 1] }, 1), /turn/);
  assert.throws(() => act(s, { type: 'take', gems: [0, 0] }, 0), /different/);
  assert.throws(() => act(s, { type: 'take', gems: [0, 1, 2, 3] }, 0));
  assert.throws(() => act(s, { type: 'take', gems: [5] }, 0)); // no taking gold
  s = act(s, { type: 'take', gems: [0, 1, 2] }, 0);
  assert.deepEqual(s.players[0].gems, [1, 1, 1, 0, 0, 0]);
  assert.deepEqual(s.supply.slice(0, 3), [4, 4, 4]);
  assert.equal(s.current, 1);
  s = act(s, { type: 'take2', color: 0 }, 1);
  assert.equal(s.players[1].gems[0], 2);
  assert.equal(s.supply[0], 2);
  assert.throws(() => act(s, { type: 'take2', color: 0 }, 0), /4\+/);
  assert.equal(s.round, 2);
});

test('10-gem limit: return phase lets you pick which gems go back', () => {
  let s = dealt();
  s.players[0].gems = [3, 2, 2, 1, 1, 0];
  s.supply = [2, 3, 3, 4, 4, 5];
  s = act(s, { type: 'take', gems: [0, 1, 4] }, 0);
  assert.equal(s.phase, 'return');
  assert.equal(s.current, 0);
  assert.throws(() => act(s, { type: 'take', gems: [2] }, 0));
  assert.throws(() => act(s, { type: 'return', gems: [0] }, 0), /exactly 2/);
  assert.throws(() => act(s, { type: 'return', gems: [5, 5] }, 0), /do not have/);
  assert.throws(() => act(s, { type: 'return', gems: [0, 0] }, 1));
  s = act(s, { type: 'return', gems: [3, 4] }, 0);
  assert.deepEqual(s.players[0].gems, [4, 3, 2, 0, 1, 0]);
  assert.equal(G.total(s.players[0].gems), 10);
  assert.equal(s.phase, 'turn');
  assert.equal(s.current, 1);
});

test('reserve: gold, refill from deck, blind reserve, max three', () => {
  let s = dealt();
  const id = s.market[1][2];
  const deckLen = s.decks[1].length;
  assert.deepEqual(g.randomFor(s, { type: 'reserve', tier: 1, slot: 2 }, 0), [deckLen]);
  s = act(s, { type: 'reserve', tier: 1, slot: 2 }, 0);
  assert.deepEqual(s.players[0].reserved, [{ id, blind: false }]);
  assert.equal(s.players[0].gems[G.GOLD], 1);
  assert.equal(s.supply[G.GOLD], 4);
  assert.notEqual(s.market[1][2], null);
  assert.equal(s.decks[1].length, deckLen - 1);
  s = act(s, { type: 'take', gems: [0] }, 1);
  s = act(s, { type: 'reserve', tier: 2, deck: true }, 0);
  assert.equal(s.players[0].reserved[1].blind, true);
  s = act(s, { type: 'take', gems: [0] }, 1);
  s = act(s, { type: 'reserve', tier: 0, slot: 0 }, 0);
  s = act(s, { type: 'take', gems: [1] }, 1);
  assert.throws(() => act(s, { type: 'reserve', tier: 0, slot: 1 }, 0), /at most 3/);
  assert.equal(s.players[0].gems[G.GOLD], 3);
});

test('buying: bonuses discount, gold covers the gap, card refills', () => {
  let s = dealt();
  // craft: a tier-2 card costing two colours; player owns 2 bonus cards of colour A,
  // holds the rest of A and all but one of colour B, and one gold to cover the gap
  const target = G.CARDS.find((c) => c.tier === 1 && c.cost.filter((n) => n >= 2).length >= 2);
  assert.ok(target, 'need a sample card');
  const [A, B] = [0, 1, 2, 3, 4].filter((c) => target.cost[c] >= 2);
  s.market[1][0] = target.id;
  s.decks[1] = s.decks[1].filter((x) => x !== target.id);
  s.players[0].cards = G.CARDS.filter((c) => c.tier === 0 && c.color === A).slice(0, 2).map((c) => c.id);
  const gems = [...target.cost, 1];
  gems[A] -= 2;
  gems[B] -= 1;
  s.players[0].gems = gems.slice();
  s.supply = s.supply.map((n, c) => n - gems[c]);
  const expect = gems.slice();
  assert.deepEqual(G.payment(s.players[0], target), expect);
  s = act(s, { type: 'buy', tier: 1, slot: 0 }, 0);
  assert.deepEqual(s.players[0].gems, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.supply, [5, 5, 5, 5, 5, 5]); // every gem paid went back
  assert.ok(s.players[0].cards.includes(target.id));
  assert.equal(s.players[0].pts, target.pts);
  assert.notEqual(s.market[1][0], target.id);
  // unaffordable
  s = act(s, { type: 'take', gems: [0] }, 1);
  assert.throws(() => act(s, { type: 'buy', tier: 2, slot: 0 }, 0), /afford/);
});

test('buying a reserved card and patrons visiting automatically', () => {
  let s = dealt(P2);
  const pat = s.patrons[0];
  const req = G.PATRONS[pat].req;
  // give player 0 exactly the bonuses the patron wants, minus one card of the first colour
  const cards = [];
  req.forEach((n, col) => { cards.push(...G.CARDS.filter((c) => c.color === col && c.tier === 0).slice(0, n).map((c) => c.id)); });
  const firstCol = req.findIndex((n) => n > 0);
  const last = cards.find((id) => G.CARDS[id].color === firstCol);
  s.players[0].cards = cards.filter((id) => id !== last);
  s.players[0].reserved = [{ id: last, blind: false }];
  s.players[0].gems = [...G.CARDS[last].cost, 0];
  for (const row of s.market) for (let k = 0; k < 4; k++) if (cards.includes(row[k])) row[k] = null;
  s = act(s, { type: 'buy', reserve: 0 }, 0);
  assert.equal(s.players[0].reserved.length, 0);
  assert.deepEqual(s.players[0].patrons, [pat]);
  assert.ok(!s.patrons.includes(pat));
  assert.equal(s.last.patron, pat);
  assert.equal(s.players[0].pts, G.PATRON_PTS + cards.reduce((a, id) => a + G.CARDS[id].pts, 0));
});

test('reaching the target finishes the round; tie goes to fewer cards', () => {
  let s = dealt(P3);
  s.players[1].pts = 14;
  // let player 1 buy a pointed card they can surely afford
  const id = s.market[2][0];
  s.players[1].gems = [...G.CARDS[id].cost, 0];
  s = act(s, { type: 'take', gems: [0] }, 0);
  s = act(s, { type: 'buy', tier: 2, slot: 0 }, 1);
  assert.ok(s.finalRound);
  assert.equal(s.phase, 'turn');
  assert.equal(s.current, 2);
  s.players[2].pts = s.players[1].pts;
  s.players[2].cards = [];
  s = act(s, { type: 'take', gems: [1] }, 2);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [2]); // same points, fewer cards
  assert.equal(g.results(s).over, true);
  assert.deepEqual(g.results(s).rows.map((r) => r.win), [false, false, true]);
});

test('passing only when stuck; everyone passing ends the game', () => {
  let s = dealt(P2, { patrons: 'off' });
  assert.throws(() => act(s, { type: 'pass' }, 0), /still have a move/);
  // starve the game: nothing in the supply, full reserves, no affordable cards
  for (const p of s.players) { p.reserved = [{ id: 85, blind: false }, { id: 86, blind: false }, { id: 87, blind: false }]; }
  s.supply = [0, 0, 0, 0, 0, 5];
  assert.ok(G.canPass(s, 0));
  assert.deepEqual(g.bot(s, 0, { now: 0 }), { type: 'pass' });
  s = act(s, { type: 'pass' }, 0);
  assert.equal(s.phase, 'turn');
  s = act(s, { type: 'pass' }, 1);
  assert.equal(s.phase, 'over');
});

test('randomFor asks for nothing on illegal or deterministic actions', () => {
  const s = dealt();
  assert.equal(g.randomFor(s, { type: 'buy', tier: 0, slot: 0 }, 1), null); // not their turn
  assert.equal(g.randomFor(s, { type: 'take', gems: [0] }, 0), null);
  assert.equal(g.randomFor(s, { type: 'buy', reserve: 0 }, 0), null);
});

// ---------- bot play-outs (as in tests/bots.test.mjs) ----------
function playOut(game, nPlayers, opts, maxSteps = 20000) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  let s = game.setup(players, opts, { now: 0, first: 0 });
  let now = 0;
  const apply = (a, seat) => {
    const ranges = game.randomFor?.(s, a, seat);
    s = game.apply(s, a, seat, { now, rand: ranges?.length ? randFor(ranges) : null });
  };
  for (let step = 0; step < maxSteps; step++) {
    if (game.results(s).over) return { s, step };
    now += 1000;
    const sys = game.tick?.(s, { now: now + 1e9 });
    if (sys) { apply(sys, -1); continue; }
    let moved = false;
    for (let seat = 0; seat < nPlayers && !moved; seat++) {
      const a = game.bot(s, seat, { now });
      if (!a) continue;
      try { apply(a, seat); } catch (e) { throw new Error(`bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
    }
    if (!moved) throw new Error(`nobody can move (phase ${s.phase})`);
  }
  throw new Error('game did not finish');
}

test('computer players finish 120 games legally (2–4 players, all options)', () => {
  let rounds = 0;
  let natural = 0;
  for (let k = 0; k < 120; k++) {
    const n = 2 + (k % 3);
    const opts = { target: k % 4 === 3 ? 21 : 15, patrons: k % 5 === 4 ? 'off' : 'on' };
    const { s } = playOut(g, n, opts);
    assert.equal(s.phase, 'over');
    assert.ok(s.winners.length >= 1);
    rounds += s.round;
    if (s.players.some((p) => p.pts >= s.opts.target)) natural++;
    // conservation of gems
    const sup = G.supplyFor(n);
    for (let c = 0; c < 6; c++) {
      const held = s.players.reduce((a, p) => a + p.gems[c], 0);
      assert.equal(held + s.supply[c], c === 5 ? G.GOLD_SUPPLY : sup);
    }
    for (const p of s.players) assert.ok(G.total(p.gems) <= G.MAX_GEMS && p.reserved.length <= 3);
  }
  assert.ok(natural >= 110, `most games should end by reaching the target (${natural}/120)`);
  assert.ok(rounds / 120 < 45);
});
