import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/engines/faces.js';

const P = [{ pid: 'a', name: 'A' }, { pid: 'b', name: 'B' }];

test('characters are unique and every question splits the board', () => {
  assert.equal(S.N, 24);
  const sig = S.CHARACTERS.map((c) => S.QUESTIONS.map((q) => +q.test(c)).join(''));
  assert.equal(new Set(sig).size, 24, 'every face is distinguishable by questions');
  for (const q of S.QUESTIONS) {
    const yes = S.CHARACTERS.filter(q.test).length;
    assert.ok(yes > 0 && yes < 24, q.id);
  }
});

test('ask answers truthfully, passes the turn; autoflip; right and wrong guesses', () => {
  let s = S.newGame(P);
  s = S.applyAction(s, { type: 'deal' }, -1, [0, 1]); // A has Ava, B has Ben (glasses)
  s = S.applyAction(s, { type: 'ask', q: 'glasses' }, 0);
  assert.equal(s.asks[0].yes, true);
  assert.equal(s.current, 1);
  assert.throws(() => S.applyAction(s, { type: 'ask', q: 'hat' }, 0)); // not A's turn
  s = S.applyAction(s, { type: 'autoflip' }, 0);
  const up = S.CHARACTERS.filter((c, i) => !s.players[0].down[i]);
  assert.ok(up.every((c) => c.flags.includes('g')));
  s = S.applyAction(s, { type: 'flip', index: 5 }, 1); // flipping is allowed any time
  assert.equal(s.players[1].down[5], true);
  s = S.applyAction(s, { type: 'ask', q: 'long' }, 1); // Ava has long hair
  assert.equal(s.asks[1].yes, true);
  const wrong = S.applyAction(s, { type: 'guess', index: 2 }, 0);
  assert.deepEqual(wrong.winners, [1]);
  const right = S.applyAction(s, { type: 'guess', index: 1 }, 0);
  assert.deepEqual(right.winners, [0]);
  assert.equal(right.phase, 'over');
});
