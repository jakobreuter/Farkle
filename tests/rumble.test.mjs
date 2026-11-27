import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/engines/rumble.js';
import rumble from '../js/games/rumble.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const F = { 1: R.ONE, 2: R.TWO, 3: R.THREE, E: R.EN, H: R.HEART, A: R.CLAW };
const faces = (str) => [...str].map((c) => F[c]);
const act = (s, a, seat, rand = null, now = 0) => R.applyAction(s, a, seat, rand, now);
/** roll a full hand for the current player and resolve it */
function turn(s, str, now = 0) {
  s = act(s, { type: 'roll' }, s.current, faces(str), now);
  return act(s, { type: 'resolve' }, s.current, null, now);
}
const noCards = (n = 2, target = 20) => R.newGame(P(n), { cards: false, target });

test('setup: health, options, monsters, market dealt via tick', () => {
  const s = rumble.setup(P(3), { stars: 15, cards: 'on' }, { now: 0, first: 1 });
  assert.equal(s.target, 15);
  assert.equal(s.current, 1);
  assert.ok(s.players.every((p) => p.hp === 10 && p.stars === 0 && p.energy === 0));
  assert.deepEqual(s.players.map((p) => p.mon), [0, 1, 2]);
  assert.equal(s.dice.length, 6);
  assert.equal(s.rollsLeft, 3);
  assert.equal(R.CARD_IDS.length >= 30, true);
  const a = rumble.tick(s, { now: 0 });
  assert.deepEqual(a, { type: 'deal' });
  const ranges = rumble.randomFor(s, a, -1);
  assert.deepEqual(ranges, [R.CARD_IDS.length, R.CARD_IDS.length - 1, R.CARD_IDS.length - 2]);
  const d = rumble.apply(s, a, -1, { now: 0, rand: [0, 0, 0] });
  assert.deepEqual(d.market, R.CARD_IDS.slice(0, 3));
  assert.equal(d.pool.length, R.CARD_IDS.length - 3);
  assert.equal(rumble.tick(d, { now: 0 }), null);
  assert.throws(() => rumble.apply(s, a, 0, { now: 0, rand: [0, 0, 0] }), 'players cannot deal');
  const off = rumble.setup(P(2), { stars: 20, cards: 'off' }, { now: 0, first: 0 });
  assert.equal(off.cardsOn, false);
  assert.equal(rumble.tick(off, { now: 0 }), null);
});

test('scoring: triples, extra dice, energy, hearts', () => {
  let s = noCards();
  s.players[0].hp = 5;
  s = turn(s, '3333EH');
  const p = s.players[0];
  assert.equal(p.stars, 4 + 1, '3+1 stars for four 3s, +1 for taking the empty Peak');
  assert.equal(p.energy, 1);
  assert.equal(p.hp, 6, 'healed off the Peak (heals before climbing)');
  assert.equal(s.peak, 0, 'empty Peak is taken');
  assert.equal(s.current, 1, 'cards off: turn passes at once');
  let t = noCards();
  t = turn(t, '111222');
  assert.equal(t.players[0].stars, 1 + 2 + 1);
  let u = noCards();
  u = turn(u, '1122EE');
  assert.equal(u.players[0].stars, 1, 'pairs score nothing (only the Peak star)');
});

test('attacks: from below hits the Peak, from the Peak hits everyone; flee or stay', () => {
  let s = noCards(3);
  s = turn(s, '1223EE'); // P0 climbs
  assert.equal(s.peak, 0);
  s = turn(s, 'AAA12E'); // P1 hits P0 for 3
  assert.equal(s.players[0].hp, 7);
  assert.equal(s.phase, 'flee');
  assert.equal(s.fleeSeat, 0);
  assert.throws(() => act(s, { type: 'flee', go: true }, 1), 'only the Peak monster decides');
  assert.equal(rumble.tick(s, { now: s.fleeAt - 1 }), null, 'system waits for the timer');
  const fled = act(s, { type: 'flee', go: true }, 0);
  assert.equal(fled.peak, 1);
  assert.equal(fled.players[1].stars, 1);
  assert.equal(fled.current, 2);
  const stayed = act(s, { type: 'flee', go: true }, -1, null, s.fleeAt);
  assert.equal(stayed.peak, 0, 'timeout means stay');
  assert.deepEqual(rumble.tick(s, { now: s.fleeAt }), { type: 'flee', go: false });
  // P2 off the Peak; P0 holds it. P2 heals 1 (up to 11 — max is 12), then P0's turn: +2 stars, hits everyone
  let t = turn(stayed, '1123EH');
  assert.equal(t.current, 0);
  assert.equal(t.players[0].stars, 1 + 2);
  t = turn(t, 'AAHH12');
  assert.equal(t.players[0].hp, 7, 'no healing on the Peak');
  assert.equal(t.players[1].hp, 8);
  assert.equal(t.players[2].hp, 9, 'P2 had healed to 11');
  assert.equal(t.phase, 'roll', 'no flee for monsters hit by the Peak');
});

test('rerolls: keep dice, two rerolls, auto resolve after the last', () => {
  let s = noCards();
  s = act(s, { type: 'roll' }, 0, faces('123EHA'));
  assert.throws(() => act(s, { type: 'roll' }, 1, [0]), /not your turn/);
  s = act(s, { type: 'keep', index: 0 }, 0);
  s = act(s, { type: 'keep', index: 1 }, 0);
  assert.deepEqual(rumble.randomFor(s, { type: 'roll' }, 0), [6, 6, 6, 6]);
  s = act(s, { type: 'roll' }, 0, [0, 0, 0, 0]);
  assert.deepEqual(s.dice, faces('121111'));
  s = act(s, { type: 'roll' }, 0, [1, 1, 1, 1], 1000);
  assert.equal(s.rollsLeft, 0);
  assert.throws(() => act(s, { type: 'roll' }, 0, [0, 0, 0, 0]));
  assert.throws(() => act(s, { type: 'keep', index: 2 }, 0));
  assert.equal(rumble.tick(s, { now: 1000 }), null);
  const a = rumble.tick(s, { now: 1000 + R.AUTO_MS });
  assert.deepEqual(a, { type: 'resolve' });
  s = rumble.apply(s, a, -1, { now: 1000 + R.AUTO_MS });
  assert.equal(s.players[0].stars, 2 + 2 + 1, 'five 2s = 4 stars... (2 + 2 extra) + Peak');
});

test('knock outs, last monster standing, and star win', () => {
  let s = noCards(2);
  s = turn(s, '1223EE');
  s.players[0].hp = 2;
  s = turn(s, 'AAA12E');
  assert.equal(s.players[0].alive, false);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [1]);
  assert.deepEqual(rumble.results(s).rows.map((r) => r.win), [false, true]);

  let t = noCards(3, 15);
  t.players[0].stars = 13;
  t = turn(t, '333EEH'); // 3 stars + Peak
  assert.equal(t.phase, 'over');
  assert.deepEqual(t.winners, [0]);

  // a KO in a 3 player game: the Peak empties and the attacker climbs
  let u = noCards(3);
  u = turn(u, '1223EE');
  u.players[0].hp = 1;
  u = turn(u, 'A1223E');
  assert.equal(u.players[0].alive, false);
  assert.equal(u.peak, 1);
  assert.equal(u.phase, 'roll');
  assert.equal(u.current, 2);
  u = turn(u, '1223EE');
  assert.equal(u.current, 1, 'knocked-out monsters are skipped');
});

test('power cards: buy, refill, cost, keep effects, snacks, sweep', () => {
  let s = R.newGame(P(2), { cards: true });
  s = act(s, { type: 'deal' }, -1, [R.CARD_IDS.indexOf('arm'), 0, 0]);
  assert.equal(s.market[0], 'arm');
  s = turn(s, 'EEEEEE');
  assert.equal(s.phase, 'buy');
  assert.equal(s.players[0].energy, 6);
  assert.equal(rumble.randomFor(s, { type: 'buy', slot: 0 }, 1), null, 'not your turn');
  const ranges = rumble.randomFor(s, { type: 'buy', slot: 0 }, 0);
  assert.deepEqual(ranges, [s.pool.length]);
  assert.throws(() => act(s, { type: 'buy', slot: 0 }, 0, null), 'refill draw is required');
  s = act(s, { type: 'buy', slot: 0 }, 0, [0]);
  assert.deepEqual(s.players[0].cards, ['arm']);
  assert.equal(s.players[0].energy, 1);
  assert.ok(s.market[0] && s.market[0] !== 'arm');
  assert.throws(() => act(s, { type: 'sweep' }, 0, [0, 0, 0]), 'sweep needs 2 energy');
  s = act(s, { type: 'end' }, 0);
  s = turn(s, 'EEEEEE');
  s = act(s, { type: 'end' }, 1);
  assert.equal(s.dice.length, 7, 'Extra Arm adds a die');
  assert.deepEqual(rumble.randomFor(s, { type: 'roll' }, 0), Array(7).fill(6));

  // sweep: three fresh cards, old ones back in the pool
  let w = R.newGame(P(2), { cards: true });
  w = act(w, { type: 'deal' }, -1, [0, 0, 0]);
  w = turn(w, 'EEE123');
  const old = [...w.market];
  const pool = w.pool.length;
  w = act(w, { type: 'sweep' }, 0, [0, 0, 0]);
  assert.equal(w.players[0].energy, 1);
  assert.ok(w.market.every((id) => !old.includes(id)));
  assert.equal(w.pool.length, pool);

  // snack + armour + extra damage + steal
  let x = R.newGame(P(2), { cards: true });
  x = act(x, { type: 'deal' }, -1, [0, 0, 0]);
  x.market = ['storm', 'tower', 'picnic'];
  x.players[0].energy = 20;
  x.players[1].cards = ['scales'];
  x = turn(x, '1223EH');
  x = act(x, { type: 'buy', slot: 0 }, 0, [0]);
  assert.equal(x.players[1].hp, 9, 'storm 2 minus scales 1');
  assert.ok(x.pool.includes('storm'), 'snacks go back to the pool');
  x = act(x, { type: 'buy', slot: 1 }, 0, [0]);
  assert.equal(x.players[0].stars, 1 + 2);
  x.players[0].cards.push('fists', 'leech');
  x.players[1].energy = 3;
  x = act(x, { type: 'end' }, 0);
  x = turn(x, '1223EE');
  x = act(x, { type: 'end' }, 1);
  x = turn(x, 'AA1223'); // from the Peak: 2 + 1 = 3, minus armour = 2, steal 1
  assert.equal(x.players[1].hp, 7);
  assert.equal(x.players[1].energy, 4);

  // last gasp saves once
  let g = noCards(2);
  g = turn(g, '1223EE');
  g.players[0].hp = 2; g.players[0].cards = ['gasp'];
  g = turn(g, 'AAAA12');
  assert.equal(g.players[0].alive, true);
  assert.equal(g.players[0].hp, 2);
  assert.deepEqual(g.players[0].cards, []);
});

test('shove takes the Peak; system cannot act for players', () => {
  let s = R.newGame(P(2), { cards: true });
  s = act(s, { type: 'deal' }, -1, [0, 0, 0]);
  s = turn(s, '1223EE');
  s = act(s, { type: 'end' }, 0);
  s.market[1] = 'shove';
  s.players[1].energy = 4;
  s = turn(s, '11223H');
  s = act(s, { type: 'buy', slot: 1 }, 1, [0]);
  assert.equal(s.peak, 1);
  assert.throws(() => rumble.apply(s, { type: 'end' }, -1, { now: 0 }));
  assert.throws(() => rumble.apply(s, { type: 'end' }, 0, { now: 0 }));
});

test('bot flees when low, stays when healthy', () => {
  let s = noCards(2);
  s = turn(s, '1223EE');
  s.players[0].hp = 8;
  const hit = turn(s, 'AAAA12');
  assert.equal(hit.players[0].hp, 4);
  assert.deepEqual(rumble.bot(hit, 0, { now: 0 }), { type: 'flee', go: true });
  assert.equal(rumble.bot(hit, 1, { now: 0 }), null);
  const light = turn(s, 'A11223');
  assert.deepEqual(rumble.bot(light, 0, { now: 0 }), { type: 'flee', go: false });
});

// ---------- computer play-outs (as in tests/bots.test.mjs) ----------
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

function playOut(g, nPlayers, opts, { expire = true, maxSteps = 20000 } = {}) {
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
    const sys = g.tick?.(s, { now: expire ? now + 1e9 : now });
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

test('computer players finish 240 games legally (2–6 players, all options)', () => {
  const stats = { games: 0, ko: 0, stars: 0, fled: 0, bought: 0, steps: 0 };
  for (let k = 0; k < 240; k++) {
    const n = 2 + (k % 5);
    const opts = { stars: k % 3 ? 20 : 15, cards: k % 4 === 3 ? 'off' : 'on' };
    const { s, step } = playOut(rumble, n, opts, { expire: k % 2 === 0 });
    stats.games++;
    stats.steps += step;
    const alive = s.players.filter((p) => p.alive).length;
    if (alive === 1) stats.ko++; else stats.stars++;
    stats.fled += s.log.filter((l) => l.includes('flees')).length;
    stats.bought += s.log.filter((l) => l.includes(' buys ')).length;
    assert.equal(s.phase, 'over');
    assert.ok(s.winners.length >= 1);
    for (const p of s.players) assert.ok(p.hp <= R.maxHp(p) && p.stars >= 0 && p.energy >= 0);
  }
  assert.ok(stats.ko > 0 && stats.stars > 0, `both ways to win happen (${JSON.stringify(stats)})`);
  assert.ok(stats.fled > 0 && stats.bought > 0);
  console.log('rumble play-outs', stats);
});
