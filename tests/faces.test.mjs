import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/engines/faces.js';

const P = [{ pid: 'a', name: 'A' }, { pid: 'b', name: 'B' }];

for (const [name, deck] of Object.entries(S.DECKS)) {
  test(`${name} deck: 24 faces, all distinguishable by the list questions`, () => {
    assert.equal(deck.length, 24);
    const sig = deck.map((c) => S.QUESTIONS.map((q) => +q.test(c)).join(''));
    const dupes = deck.filter((c, i) => sig.indexOf(sig[i]) !== i).map((c) => c.name);
    assert.deepEqual(dupes, [], 'every face is distinguishable by questions');
    assert.equal(new Set(deck.map((c) => c.name)).size, 24);
  });
}

test('out-loud mode: no app questions, End turn passes the turn', () => {
  let s = S.newGame(P, 0, { mode: 'loud', deck: 'famous' });
  s = S.applyAction(s, { type: 'deal' }, -1, [0, 1]);
  assert.throws(() => S.applyAction(s, { type: 'ask', q: 'hat' }, 0));
  s = S.applyAction(s, { type: 'pass' }, 0);
  assert.equal(s.current, 1);
  assert.throws(() => S.applyAction(s, { type: 'pass' }, 0));
  const g = S.applyAction(s, { type: 'guess', index: 0 }, 1);
  assert.deepEqual(g.winners, [1]); // A's secret was index 0
});

test('ask answers truthfully, passes the turn; autoflip; right and wrong guesses', () => {
  let s = S.newGame(P, 0, { mode: 'list' });
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
