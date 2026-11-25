import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from '../js/engines/yacht.js';
import * as S from '../js/engines/streak.js';
import * as D from '../js/engines/draw.js';
import { GAMES, GAME_LIST } from '../js/games/index.js';
import { cryptoInts, deriveInts, randomHex } from '../js/rng.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));

test('yacht scoring', () => {
  const s = (c, d) => Y.scoreFor(c, d);
  assert.equal(s('threes', [3, 3, 1, 3, 6]), 9);
  assert.equal(s('three', [2, 2, 2, 5, 6]), 17);
  assert.equal(s('three', [2, 2, 3, 5, 6]), 0);
  assert.equal(s('four', [4, 4, 4, 4, 1]), 17);
  assert.equal(s('full', [2, 2, 3, 3, 3]), 25);
  assert.equal(s('full', [2, 2, 3, 3, 4]), 0);
  assert.equal(s('small', [1, 2, 3, 4, 6]), 30);
  assert.equal(s('small', [3, 4, 5, 6, 6]), 30);
  assert.equal(s('small', [1, 2, 3, 5, 6]), 0);
  assert.equal(s('large', [2, 3, 4, 5, 6]), 40);
  assert.equal(s('large', [1, 2, 3, 4, 6]), 0);
  assert.equal(s('yacht', [5, 5, 5, 5, 5]), 50);
  assert.equal(s('chance', [1, 2, 3, 4, 5]), 15);
  assert.deepEqual(Y.totals({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, chance: 20 }), { upper: 63, bonus: 35, lower: 20, total: 118 });
});

test('yacht turn flow: 3 rolls, hold, score, game end', () => {
  let s = Y.newGame(P(2));
  assert.equal(Y.diceToRoll(s), 5);
  assert.throws(() => Y.applyAction(s, { type: 'score', cat: 'chance' })); // must roll first
  s = Y.applyAction(s, { type: 'roll' }, [6, 6, 1, 2, 3]);
  s = Y.applyAction(s, { type: 'hold', index: 0 });
  s = Y.applyAction(s, { type: 'hold', index: 1 });
  assert.equal(Y.diceToRoll(s), 3);
  s = Y.applyAction(s, { type: 'roll' }, [6, 4, 4]);
  assert.deepEqual(s.dice, [6, 6, 6, 4, 4]);
  s = Y.applyAction(s, { type: 'roll' }, [6, 4, 4]);
  assert.equal(Y.diceToRoll(s), 0);
  s = Y.applyAction(s, { type: 'score', cat: 'full' });
  assert.equal(s.players[0].card.full, 25);
  assert.equal(s.current, 1);
  assert.throws(() => Y.applyAction(Y.applyAction(s, { type: 'roll' }, [1, 1, 1, 1, 1]), { type: 'score', cat: 'nope' }));
  // play out the rest quickly
  for (let t = 0; t < 25; t++) {
    s = Y.applyAction(s, { type: 'roll' }, [1, 2, 3, 4, 5]);
    const p = s.players[s.current];
    const cat = Y.CATS.find((k) => p.card[k] == null);
    s = Y.applyAction(s, { type: 'score', cat });
  }
  assert.equal(s.phase, 'over');
  assert.ok(s.winners.length >= 1);
});

test('lucky streak: bust, bank, streak bonus, reshuffle', () => {
  let s = S.newGame(P(2), 100);
  assert.equal(s.deck.length, 44);
  const flip = (card) => S.applyAction(s, { type: 'flip' }, [s.deck.indexOf(card)], 0);
  s = flip(7);
  s = flip(S.STAR);
  assert.equal(S.rowTotal(s.row), 17);
  s = flip(7);
  assert.equal(s.phase, 'bust');
  s = S.applyAction(s, { type: 'next' });
  assert.equal(s.current, 1);
  assert.equal(s.players[0].score, 0);
  assert.equal(s.discard.length, 3);
  // banking
  s = flip(10);
  s = S.applyAction(s, { type: 'stop' });
  assert.equal(s.players[1].score, 10);
  // streak: six different numbers
  for (const c of [1, 2, 3, 4, 5]) s = flip(c);
  assert.equal(s.phase, 'turn');
  s = flip(6);
  assert.equal(s.phase, 'streak');
  assert.equal(s.players[0].score, 21 + S.STREAK_BONUS);
  s = S.applyAction(s, { type: 'next' });
  // reshuffle when the deck runs out
  s.discard.push(...s.deck);
  s.deck = [];
  const n = S.drawSize(s);
  s = S.applyAction(s, { type: 'flip' }, [0], 0);
  assert.equal(s.deck.length, n - 1);
});

test('draw: choose, guess scoring, turn rotation, game end', () => {
  let s = D.newGame(P(3), { rounds: 1, drawTime: 60 });
  assert.deepEqual(D.tick(s, 0), { type: 'newTurn' });
  s = D.applyAction(s, { type: 'newTurn' }, -1, 0, [0, 0, 0]);
  assert.equal(s.phase, 'choose');
  assert.equal(new Set(s.choices).size, 3);
  assert.throws(() => D.applyAction(s, { type: 'choose', index: 1 }, 1, 0)); // not the drawer
  s = D.applyAction(s, { type: 'choose', index: 1 }, 0, 1000);
  assert.equal(s.phase, 'draw');
  const word = s.word;
  s = D.applyAction(s, { type: 'guess', text: 'definitely wrong' }, 1, 2000);
  assert.equal(s.chat.at(-1).text, 'definitely wrong');
  s = D.applyAction(s, { type: 'guess', text: word.toUpperCase() + '!' }, 1, 1000);
  assert.ok(s.guessed[1] >= 95);
  assert.equal(s.players[0].score, D.DRAWER_PTS);
  assert.throws(() => D.applyAction(s, { type: 'guess', text: word }, 1, 3000)); // already guessed
  assert.throws(() => D.applyAction(s, { type: 'guess', text: word }, 0, 3000)); // drawer can't guess
  s = D.applyAction(s, { type: 'guess', text: word }, 2, 50000);
  assert.equal(s.phase, 'reveal'); // everyone got it
  s = D.applyAction(s, { type: 'next' }, -1, 60000);
  assert.equal(s.phase, 'start');
  for (let t = 0; t < 2; t++) {
    s = D.applyAction(s, { type: 'newTurn' }, -1, 0, D.chooseRanges(s).map(() => 0));
    s = D.applyAction(s, { type: 'choose', index: 0 }, -1, 0);
    s = D.applyAction(s, { type: 'reveal' }, -1, 0);
    s = D.applyAction(s, { type: 'next' }, -1, 0);
  }
  assert.equal(s.phase, 'over');
  assert.equal(new Set(s.used).size, 3); // no repeated words
  assert.equal(D.hint('hot dog', 0), '_ _ _   _ _ _');
});

test('every game plugin sets up and reports results', () => {
  for (const g of GAME_LIST) {
    const opts = {};
    for (const o of g.options || []) opts[o.key] = o.default;
    const s = g.setup(P(Math.max(2, g.minPlayers)), opts, { now: 0, first: 0 });
    assert.equal(s.players.length, Math.max(2, g.minPlayers));
    assert.equal(g.results(s).over, false, g.id);
    assert.ok(GAMES[g.id]);
  }
});

test('uniform integers for arbitrary ranges', async () => {
  const counts = Array(7).fill(0);
  for (const v of cryptoInts(Array(70000).fill(7))) counts[v]++;
  const e = 10000;
  const chi = counts.reduce((a, x) => a + (x - e) ** 2 / e, 0);
  assert.ok(chi < 30, `chi=${chi}`);
  const h = randomHex(), g = randomHex();
  assert.deepEqual(await deriveInts(h, g, 'x', [44, 43, 6]), await deriveInts(h, g, 'x', [44, 43, 6]));
  const v = await deriveInts(h, g, 'y', [44, 1]);
  assert.ok(v[0] >= 0 && v[0] < 44 && v[1] === 0);
});
