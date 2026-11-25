import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDice, hasScore, newGame, applyAction, diceToRoll, canBank, belowEntry } from '../js/engines/farkle.js';
import { cryptoDice, deriveDice, randomHex, sha256Hex, cryptoInts, deriveInts } from '../js/rng.js';

test('scoring combinations', () => {
  const cases = [
    [[1], 100], [[5], 50], [[1, 5], 150], [[1, 1, 1], 1000], [[2, 2, 2], 200],
    [[6, 6, 6], 600], [[3, 3, 3, 3], 1000], [[4, 4, 4, 4, 4], 2000], [[2, 2, 2, 2, 2, 2], 3000],
    [[1, 2, 3, 4, 5, 6], 1500], [[2, 2, 3, 3, 6, 6], 1500], [[3, 3, 3, 3, 2, 2], 1500],
    [[2, 2, 2, 3, 3, 3], 2500], [[1, 1, 1, 1], 1100], [[5, 5, 5, 1], 600],
    [[2], 0], [[1, 2], 0], [[2, 2, 2, 3], 0], [[], 0],
  ];
  for (const [dice, pts] of cases) assert.equal(scoreDice(dice), pts, dice.join(','));
});

test('farkle detection', () => {
  assert.equal(hasScore([2, 3, 4, 6, 6, 2]), false);
  assert.equal(hasScore([2, 3, 4, 6, 6, 5]), true);
  assert.equal(hasScore([2, 2, 3, 3, 4, 4]), true);
  assert.equal(hasScore([2, 2, 2]), true);
  assert.equal(hasScore([3, 4]), false);
});

test('turn flow: keep, roll, bank, farkle, hot dice', () => {
  let s = newGame(['A', 'B'], 1000);
  assert.equal(diceToRoll(s), 6);
  s = applyAction(s, { type: 'roll', values: [1, 5, 2, 3, 4, 6] });
  assert.equal(s.phase, 'select');
  s = applyAction(s, { type: 'toggle', index: 0 });
  assert.equal(diceToRoll(s), 0); // must set aside first
  s = applyAction(s, { type: 'setAside' });
  assert.equal(diceToRoll(s), 5);
  s = applyAction(s, { type: 'roll', values: [2, 3, 4, 6, 6] }); // farkle
  assert.equal(s.phase, 'farkle');
  assert.equal(s.turnPoints, 0);
  s = applyAction(s, { type: 'pass' });
  assert.equal(s.current, 1);

  // hot dice
  s = applyAction(s, { type: 'roll', values: [1, 1, 1, 5, 5, 5] });
  for (let i = 0; i < 6; i++) s = applyAction(s, { type: 'toggle', index: i });
  s = applyAction(s, { type: 'setAside' });
  assert.equal(diceToRoll(s), 6);
  s = applyAction(s, { type: 'roll', values: [1, 2, 3, 4, 6, 6] });
  assert.equal(s.turnPoints, 2500);
  s = applyAction(s, { type: 'toggle', index: 0 });
  assert.ok(!canBank(s)); // grayed out until set aside
  s = applyAction(s, { type: 'setAside' });
  s = applyAction(s, { type: 'bank' });
  assert.equal(s.players[1].score, 2600);
  // B reached target -> A gets a last turn
  assert.equal(s.current, 0);
  assert.ok(s.finalRound);
  s = applyAction(s, { type: 'roll', values: [2, 2, 3, 3, 4, 6] });
  s = applyAction(s, { type: 'pass' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [1]);
});

test('set aside without rolling, then roll or bank', () => {
  let s = newGame(['A', 'B']);
  s = applyAction(s, { type: 'roll', values: [1, 5, 2, 3, 4, 6] });
  assert.equal(diceToRoll(s), 0); // nothing kept yet
  assert.throws(() => applyAction(s, { type: 'setAside' }));
  s = applyAction(s, { type: 'toggle', index: 0 });
  s = applyAction(s, { type: 'setAside' });
  assert.equal(s.turnPoints, 100);
  assert.ok(s.dice[0].kept);
  assert.equal(diceToRoll(s), 5);
  assert.ok(!canBank(s)); // only 100 so far, first bank needs 500
  // can still set aside more dice from the same roll
  s = applyAction(s, { type: 'toggle', index: 1 });
  s = applyAction(s, { type: 'setAside' });
  assert.equal(s.turnPoints, 150);
  assert.equal(diceToRoll(s), 4);
  s = applyAction(s, { type: 'toggle', index: 2 }); // a 2 doesn't score
  assert.equal(diceToRoll(s), 0);
  assert.ok(!canBank(s));
  s = applyAction(s, { type: 'toggle', index: 2 });
  s = applyAction(s, { type: 'roll', values: [5, 2, 3, 4] });
  assert.equal(s.asideThisRoll, false);
  assert.equal(diceToRoll(s), 0);
  s = applyAction(s, { type: 'toggle', index: 2 }); // the new 5
  s = applyAction(s, { type: 'setAside' });
  assert.equal(s.turnPoints, 200);
  // first bank needs 500+
  assert.ok(belowEntry(s));
  assert.ok(!canBank(s));
  assert.throws(() => applyAction(s, { type: 'bank' }));
  s = applyAction(s, { type: 'roll', values: [1, 1, 1] });
  s = applyAction(s, { type: 'toggle', index: 3 });
  s = applyAction(s, { type: 'toggle', index: 4 });
  s = applyAction(s, { type: 'toggle', index: 5 });
  s = applyAction(s, { type: 'setAside' });
  assert.ok(canBank(s));
  s = applyAction(s, { type: 'bank' });
  assert.equal(s.players[0].score, 1200);
});

test('after getting on the board, small banks are fine', () => {
  let s = newGame(['A', 'B']);
  s.players[0].score = 600;
  s = applyAction(s, { type: 'roll', values: [5, 2, 3, 4, 6, 6] });
  s = applyAction(s, { type: 'toggle', index: 0 });
  s = applyAction(s, { type: 'setAside' });
  assert.ok(canBank(s));
});

test('illegal actions are rejected', () => {
  const s = newGame(['A', 'B']);
  assert.throws(() => applyAction(s, { type: 'bank' }));
  assert.throws(() => applyAction(s, { type: 'roll', values: [1, 2, 3] }));
  assert.throws(() => applyAction(s, { type: 'roll', values: [1, 2, 3, 4, 5, 7] }));
});

function chiSquare(values) {
  const c = [0, 0, 0, 0, 0, 0];
  for (const v of values) c[v - 1]++;
  const e = values.length / 6;
  return { chi: c.reduce((a, x) => a + (x - e) ** 2 / e, 0), counts: c };
}

test('crypto dice are uniform (chi-square, 5 dof)', () => {
  const { chi, counts } = chiSquare(cryptoDice(600000));
  assert.ok(chi < 25, `chi=${chi} counts=${counts}`); // p ≈ 0.0001 threshold
});

test('jointly derived dice are deterministic and uniform', async () => {
  const h = randomHex(), g = randomHex();
  assert.deepEqual(await deriveDice(h, g, 'x', 6), await deriveDice(h, g, 'x', 6));
  assert.notDeepEqual(await deriveDice(h, g, 'x', 6).then(String), await deriveDice(h, randomHex(), 'x', 6).then(String));
  const all = [];
  for (let i = 0; i < 20000; i++) all.push(...(await deriveDice(h, g, String(i), 6)));
  const { chi, counts } = chiSquare(all);
  assert.ok(chi < 25, `chi=${chi} counts=${counts}`);
  assert.equal((await sha256Hex('abc')).slice(0, 8), 'ba7816bf');
});
