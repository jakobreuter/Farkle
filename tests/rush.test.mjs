import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/engines/rush.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const find = (pred, not = []) => R.CARDS.find((c) => pred(c) && !not.includes(c.id)).id;
const act = (s, a, seat, rand) => R.applyAction(s, a, seat, { now: 0, rand });

// put specific cards in a hand (taking them out of the deck)
function give(s, seat, ids) {
  for (const id of ids) {
    s.deck = s.deck.filter((x) => x !== id);
    s.players[seat].hand.push(id);
  }
}
function started(n = 2) {
  let s = R.newGame(P(n));
  s = act(s, { type: 'deal' }, -1, R.drawRanges(s, 5 * n).map(() => 0));
  for (const p of s.players) assert.equal(p.hand.length, 5);
  s = act(s, { type: 'draw' }, -1, R.drawRanges(s, 2).map(() => 0));
  assert.equal(s.phase, 'play');
  assert.equal(s.plays, 3);
  return s;
}

test('deck has 72 cards and setup deals 5 each', () => {
  assert.equal(R.CARDS.length, 72);
  const s = started(3);
  assert.equal(s.deck.length, 72 - 15 - 2);
  assert.equal(s.players[0].hand.length, 7);
});

test('bank, place, plays limit, end turn and discard down to 7', () => {
  let s = started();
  const money = find((c) => c.type === 'money' && c.value === 5);
  const prop = find((c) => c.district === 'docks');
  give(s, 0, [money, prop]);
  s = act(s, { type: 'bank', card: money }, 0);
  assert.equal(R.bankTotal(s.players[0]), 5);
  assert.throws(() => act(s, { type: 'bank', card: prop }, 0)); // properties can't be banked
  s = act(s, { type: 'place', card: prop }, 0);
  assert.equal(R.count(s.players[0], 'docks'), 1);
  assert.equal(s.plays, 1);
  assert.throws(() => act(s, { type: 'bank', card: money }, 1)); // not your turn
  const extra = s.players[0].hand.length - R.HAND_MAX;
  s = act(s, { type: 'end' }, 0);
  if (extra > 0) {
    assert.equal(s.phase, 'discard');
    s = act(s, { type: 'discard', cards: s.players[0].hand.slice(0, extra) }, 0);
  }
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'draw');
});

test('rent: payer chooses cards, shield blocks, timeout auto-pays', () => {
  let s = started(3);
  const docks = R.CARDS.filter((c) => c.district === 'docks').map((c) => c.id);
  const rent = find((c) => c.action === 'rentday');
  give(s, 0, [...docks, rent]);
  s = act(s, { type: 'place', card: docks[0] }, 0);
  s = act(s, { type: 'place', card: docks[1] }, 0);
  assert.ok(R.isComplete(s.players[0], 'docks'));
  assert.equal(R.rentFor(s.players[0], 'docks'), 3);
  // give the others something to pay with / a shield
  const m2 = find((c) => c.type === 'money' && c.value === 2);
  const m4 = find((c) => c.type === 'money' && c.value === 4);
  const shield = find((c) => c.action === 'shield');
  s.deck = s.deck.filter((x) => ![m2, m4, shield].includes(x));
  s.players[1].bank.push(m2, m4);
  s.players[2].hand.push(shield);
  s = act(s, { type: 'play', card: rent, district: 'docks' }, 0, null);
  assert.equal(s.phase, 'respond');
  assert.throws(() => act(s, { type: 'respond', r: { type: 'pay', cards: [m2] } }, 1)); // 2 < 3
  s = act(s, { type: 'respond', r: { type: 'pay', cards: [m4] } }, 1);
  assert.equal(R.bankTotal(s.players[0]), 4);
  s = act(s, { type: 'respond', r: { type: 'shield' } }, 2);
  assert.equal(s.phase, 'play');
  assert.equal(s.discard.includes(shield), true);

  // tax with timeout → auto-pay smallest covering card
  const tax = find((c) => c.action === 'tax');
  s.deck = s.deck.filter((x) => x !== tax);
  s.players[0].hand.push(tax);
  s.plays = 1;
  s = act(s, { type: 'play', card: tax, target: 1 }, 0);
  assert.equal(R.tick(s, 0), null);
  assert.deepEqual(R.tick(s, R.RESPOND_MS + 1), { type: 'timeout' });
  s = act(s, { type: 'timeout' }, -1);
  assert.equal(s.players[1].bank.length, 0); // paid the 2 they had (all they had)
  assert.equal(R.bankTotal(s.players[0]), 6);
});

test('paying with property moves it to the creditor’s table', () => {
  let s = started();
  const canal = find((c) => c.district === 'canal');
  const tax = find((c) => c.action === 'tax');
  s.deck = s.deck.filter((x) => ![canal, tax].includes(x));
  s.players[1].props.canal = [canal];
  s.players[0].hand.push(tax);
  s = act(s, { type: 'play', card: tax, target: 1 }, 0);
  s = act(s, { type: 'respond', r: { type: 'pay', cards: [canal] } }, 1); // all they have
  assert.deepEqual(s.players[0].props.canal, [canal]);
  assert.equal(s.players[1].props.canal, undefined);
});

test('swipe, swap, takeover and complete-set protection', () => {
  let s = started();
  const rails = R.CARDS.filter((c) => c.district === 'railway').map((c) => c.id);
  const orch = R.CARDS.filter((c) => c.district === 'orchard').map((c) => c.id);
  const old = R.CARDS.filter((c) => c.district === 'oldtown').map((c) => c.id);
  const [swipe, swap, takeover] = ['swipe', 'swap', 'takeover'].map((a) => find((c) => c.action === a));
  for (const id of [...rails, ...orch, ...old, swipe, swap, takeover]) s.deck = s.deck.filter((x) => x !== id);
  s.players[1].props = { railway: [rails[0]], orchard: [...orch] };
  s.players[0].props = { oldtown: [old[0]] };
  s.players[0].hand.push(swipe, swap, takeover);
  assert.throws(() => act(s, { type: 'play', card: swipe, target: 1, take: orch[0] }, 0)); // complete set
  s = act(s, { type: 'play', card: swipe, target: 1, take: rails[0] }, 0);
  s = act(s, { type: 'respond', r: { type: 'accept' } }, 1);
  assert.deepEqual(s.players[0].props.railway, [rails[0]]);
  s = act(s, { type: 'play', card: takeover, target: 1, district: 'orchard' }, 0);
  s = act(s, { type: 'respond', r: { type: 'accept' } }, 1);
  assert.equal(R.count(s.players[0], 'orchard'), 3);
  assert.equal(R.completeSets(s.players[0]), 1);
  assert.equal(s.plays, 1);
  // swap needs one of mine and one of theirs, both loose
  s.players[1].props.hilltop = [find((c) => c.district === 'hilltop')];
  const theirs = s.players[1].props.hilltop[0];
  s = act(s, { type: 'play', card: swap, target: 1, take: theirs, give: old[0] }, 0);
  s = act(s, { type: 'respond', r: { type: 'accept' } }, 1);
  assert.deepEqual(s.players[0].props.hilltop, [theirs]);
  assert.deepEqual(s.players[1].props.oldtown, [old[0]]);
});

test('wild goes where you choose; three complete sets wins', () => {
  let s = started();
  const wild = find((c) => c.type === 'wild');
  const docks = R.CARDS.filter((c) => c.district === 'docks').map((c) => c.id);
  const beacon = R.CARDS.filter((c) => c.district === 'beacon').map((c) => c.id);
  const bazaar = R.CARDS.filter((c) => c.district === 'bazaar').map((c) => c.id);
  for (const id of [wild, ...docks, ...beacon, ...bazaar]) s.deck = s.deck.filter((x) => x !== id);
  s.players[0].props = { docks: [...docks], beacon: [...beacon], bazaar: bazaar.slice(0, 2) };
  s.players[0].hand.push(wild);
  assert.throws(() => act(s, { type: 'place', card: wild }, 0)); // needs a district
  assert.throws(() => act(s, { type: 'place', card: wild, district: 'docks' }, 0)); // already complete
  s = act(s, { type: 'place', card: wild, district: 'bazaar' }, 0);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [0]);
});

test('windfall draws two and reshuffles the discard pile when the deck runs out', () => {
  let s = started();
  const wf = find((c) => c.action === 'windfall');
  s.deck = s.deck.filter((x) => x !== wf);
  s.players[0].hand.push(wf);
  s.discard.push(...s.deck.splice(0, s.deck.length - 1)); // leave 1 card in the deck
  const before = s.players[0].hand.length;
  const ranges = R.randomNeeds(s, { type: 'play', card: wf }, 0);
  assert.equal(ranges.length, 2);
  s = act(s, { type: 'play', card: wf }, 0, ranges.map(() => 0));
  assert.equal(s.players[0].hand.length, before - 1 + 2);
});

test('auto-pay prefers one covering bank card, then cheapest cards', () => {
  const m = (v) => R.CARDS.filter((c) => c.type === 'money' && c.value === v).map((c) => c.id);
  const p = { bank: [m(1)[0], m(1)[1], m(5)[0]], props: {} };
  assert.deepEqual(R.autoPay(p, 4), [m(5)[0]]);
  assert.deepEqual(R.autoPay(p, 2).sort(), [m(1)[0], m(1)[1]].sort());
});
