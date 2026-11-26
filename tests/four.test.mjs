import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/engines/four.js';
import g from '../js/games/four.js';

const P = [{ pid: 'a', name: 'A' }, { pid: 'b', name: 'B' }];
const drop = (s, ...cols) => cols.reduce((x, c) => S.applyAction(x, { type: 'drop', col: c }, x.current, 0), s);

test('discs fall to the lowest empty cell; turns alternate; full columns are illegal', () => {
  let s = S.newGame(P, 0);
  s = drop(s, 3, 3, 3);
  assert.deepEqual(s.cols[3], [0, 1, 0]);
  assert.equal(s.current, 1);
  assert.deepEqual(s.last, { col: 3, row: 2, seat: 0 });
  assert.throws(() => S.applyAction(s, { type: 'drop', col: 0 }, 0)); // not A's turn
  s = drop(s, 3, 3, 3);
  assert.throws(() => S.applyAction(s, { type: 'drop', col: 3 }, s.current), /full/);
  assert.throws(() => S.applyAction(s, { type: 'drop', col: 7 }, s.current));
  assert.throws(() => S.applyAction(s, { type: 'drop', col: -1 }, s.current));
});

test('wins across, up, and both diagonals are detected and highlighted', () => {
  let s = drop(S.newGame(P, 0), 0, 0, 1, 1, 2, 2, 3);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [0]);
  assert.deepEqual(s.line, [[0, 0], [1, 0], [2, 0], [3, 0]]);

  s = drop(S.newGame(P, 1), 4, 5, 4, 5, 4, 5, 4); // B starts, stacks column 4
  assert.deepEqual(s.winners, [1]);
  assert.equal(s.line.length, 4);
  assert.ok(s.line.every(([c]) => c === 4));

  // rising diagonal for A: (0,0) (1,1) (2,2) (3,3)
  s = drop(S.newGame(P, 0), 0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3);
  assert.deepEqual(s.winners, [0]);
  assert.deepEqual(s.line, [[0, 0], [1, 1], [2, 2], [3, 3]]);

  // falling diagonal for A: (6,0) (5,1) (4,2) (3,3)
  s = drop(S.newGame(P, 0), 6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3);
  assert.deepEqual(s.winners, [0]);
  assert.equal(s.line.length, 4);
  assert.throws(() => S.applyAction(s, { type: 'drop', col: 0 }, s.current)); // game over
});

test('a full board with no four is a draw', () => {
  // columns 0-5 stack in pairs (AABBAA / BBAABB), column 6 alternates: no line of four
  let s = S.newGame(P, 0, { bestOf: 1 });
  const seq = [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 2, 3, 2, 3, 3, 2, 3, 2, 2, 3, 2, 3, 4, 5, 4, 5, 5, 4, 5, 4, 4, 5, 4, 5, 6, 6, 6, 6, 6, 6];
  for (const c of seq) {
    s = S.applyAction(s, { type: 'drop', col: c }, s.current, 0);
    if (s.phase !== 'play') break;
  }
  assert.equal(s.moves, 42);
  assert.equal(s.phase, 'over');
  assert.equal(s.gameWinner, -1);
  assert.deepEqual(s.winners, []);
});

test('best of 3: loser starts the next game, match ends at two wins', () => {
  let s = S.newGame(P, 0, { bestOf: 3 });
  assert.equal(s.need, 2);
  s = drop(s, 0, 6, 1, 6, 2, 6, 3); // A wins game 1
  assert.equal(s.phase, 'gameover');
  assert.equal(s.players[0].wins, 1);
  assert.throws(() => S.applyAction(s, { type: 'next' }, 0)); // system only
  assert.equal(g.tick(s, { now: s.autoAt - 1 }), null);
  const a = g.tick(s, { now: s.autoAt });
  assert.deepEqual(a, { type: 'next' });
  s = g.apply(s, a, -1, { now: s.autoAt });
  assert.equal(s.gameNo, 2);
  assert.equal(s.current, 1); // B lost, B starts
  assert.equal(s.moves, 0);
  s = drop(s, 0, 6, 1, 6, 2, 6, 3); // B wins game 2
  assert.equal(s.players[1].wins, 1);
  s = g.apply(s, { type: 'next' }, -1, { now: 0 });
  assert.equal(s.current, 0); // A lost, A starts
  s = drop(s, 0, 6, 1, 6, 2, 6, 3); // A wins game 3
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [0]);
  const r = g.results(s);
  assert.equal(r.over, true);
  assert.deepEqual(r.rows.map((x) => [x.score, x.win]), [[2, true], [1, false]]);
  assert.equal(g.tick(s, { now: 1e12 }), null);
});

test('bot takes a win, blocks a win, prefers the centre, is fast', () => {
  let s = drop(S.newGame(P, 0), 0, 6, 1, 6, 2); // A threatens col 3; B to move
  assert.equal(S.bestMove(s, 1), 3); // block
  s = drop(S.newGame(P, 0), 0, 6, 1, 6, 2, 5); // A to move, can win at 3
  assert.equal(S.bestMove(s, 0), 3);
  assert.equal(S.bestMove(S.newGame(P, 0), 0), 3);
  assert.equal(g.bot(S.newGame(P, 0), 1, { now: 0 }), null); // not its turn
  // timing over a varied middlegame
  s = drop(S.newGame(P, 0), 3, 3, 2, 4, 4, 2, 1, 5);
  const t = Date.now();
  S.bestMove(s, s.current, { budgetMs: 1e9 });
  assert.ok(Date.now() - t < 150, 'search is quick');
});

// --- play-out harness (as in tests/bots.test.mjs) ---
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));
function playOut(game, opts, maxSteps = 5000) {
  const players = [0, 1].map((i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  let s = game.setup(players, opts, { now: 0, first: Math.floor(Math.random() * 2) });
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
    for (let seat = 0; seat < 2 && !moved; seat++) {
      const a = game.bot(s, seat, { now });
      if (!a) continue;
      try { apply(a, seat); } catch (e) { throw new Error(`bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
    }
    if (!moved) throw new Error(`nobody can move (phase ${s.phase})`);
  }
  throw new Error('game did not finish');
}

test('computer players finish 60 matches legally', () => {
  const tally = { win: 0, draw: 0 };
  for (let k = 0; k < 60; k++) {
    const { s } = playOut(g, { bestOf: [1, 3, 5][k % 3] });
    assert.equal(s.phase, 'over');
    if (s.winners.length) {
      tally.win++;
      assert.ok(s.players[s.winners[0]].wins >= Math.min(s.need, 1));
    } else tally.draw++;
    assert.ok(s.history.length <= s.maxGames);
  }
  assert.equal(tally.win + tally.draw, 60);
});

test('bot vs random mover: bot almost always wins', () => {
  let botWins = 0;
  for (let k = 0; k < 20; k++) {
    let s = S.newGame(P, k % 2);
    while (s.phase === 'play') {
      const col = s.current === 0 ? S.bestMove(s, 0, { tie: Math.random() }) : S.legalCols(s)[Math.floor(Math.random() * S.legalCols(s).length)];
      s = S.applyAction(s, { type: 'drop', col }, s.current, 0);
    }
    if (s.gameWinner === 0) botWins++;
  }
  assert.ok(botWins >= 19, `bot won ${botWins}/20`);
});
