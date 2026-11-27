import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/engines/spy.js';
import G from '../js/games/spy.js';

const mk = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));
const zeros = (ranges) => ranges.map(() => 0);

function dealt(n, opts = {}, first = 0, rand = zeros) {
  const s0 = G.setup(mk(n), opts, { now: 0, first });
  const a = G.tick(s0, { now: 0 });
  assert.deepEqual(a, { type: 'deal' });
  return G.apply(s0, a, -1, { now: 0, rand: rand(G.randomFor(s0, a, -1)) });
}
const cardsOf = (s, k) => s.key.map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0);
const guesser = (s, team = s.team) => S.guessers(s, team)[0];
const clue = (s, num, word = 'zzzq') => G.apply(s, { type: 'clue', word, num }, s.spy[s.team], { now: 1 });
const guess = (s, i, seat = guesser(s)) => G.apply(s, { type: 'guess', i }, seat, { now: 1 });

test('word list: 400+ unique, lowercase single words', () => {
  assert.ok(S.WORDS.length >= 400, `only ${S.WORDS.length} words`);
  assert.equal(new Set(S.WORDS).size, S.WORDS.length);
  for (const w of S.WORDS) assert.match(w, /^[a-z]{2,10}$/);
});

test('key generation: 25 distinct words, 9/8/7/1 split, starter gets 9', () => {
  for (let k = 0; k < 200; k++) {
    const s = dealt(4 + (k % 7), {}, k, randFor);
    assert.equal(s.words.length, 25);
    assert.equal(new Set(s.words).size, 25);
    assert.ok(s.words.every((w) => S.WORDS.includes(w)));
    const st = S.TEAM_KEY[s.starter];
    const ot = S.TEAM_KEY[1 - s.starter];
    assert.equal(S.total(s, st), 9);
    assert.equal(S.total(s, ot), 8);
    assert.equal(S.total(s, 'n'), 7);
    assert.equal(S.total(s, 'x'), 1);
    assert.equal(s.team, s.starter);
    assert.equal(s.phase, 'clue');
    assert.ok(s.rev.every((r) => r === null));
  }
  // deterministic from rand, and only the system can deal
  const s0 = G.setup(mk(4), {}, { now: 0, first: 0 });
  const r = randFor(G.randomFor(s0, { type: 'deal' }, -1));
  assert.deepEqual(G.apply(s0, { type: 'deal' }, -1, { now: 0, rand: r }), G.apply(s0, { type: 'deal' }, -1, { now: 0, rand: r }));
  assert.throws(() => G.apply(s0, { type: 'deal' }, 0, { now: 0, rand: r }));
  assert.throws(() => G.apply(s0, { type: 'deal' }, -1, { now: 0, rand: r.slice(1) }));
  assert.equal(G.randomFor(s0, { type: 'deal' }, 0), null);
});

test('teams: alternate / halves / shuffle; seats alternate Red, Blue; spymaster rotates', () => {
  let s = dealt(6, { teams: 'alt' }, 0);
  assert.deepEqual(s.players.map((p) => p.pid), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
  assert.deepEqual(s.players.map((p) => p.team), [0, 1, 0, 1, 0, 1]);
  assert.deepEqual(s.spy, [0, 1]);
  s = dealt(6, { teams: 'alt' }, 1);
  assert.deepEqual(s.spy, [2, 3]);
  s = dealt(5, { teams: 'halves' }, 0);
  // red: p0 p1 p2, blue: p3 p4 -> seats R B R B R
  assert.deepEqual(s.players.map((p) => p.pid), ['p0', 'p3', 'p1', 'p4', 'p2']);
  assert.deepEqual(s.players.map((p) => p.team), [0, 1, 0, 1, 0]);
  const seen = new Set();
  for (let k = 0; k < 40; k++) {
    s = dealt(4, { teams: 'shuffle' }, 0, randFor);
    assert.deepEqual(s.players.map((p) => p.team), [0, 1, 0, 1]);
    assert.equal(new Set(s.players.map((p) => p.pid)).size, 4);
    seen.add(s.players.map((p) => p.pid).join());
  }
  assert.ok(seen.size > 1);
  // with 4+ players spymasters differ by game number
  const spies = new Set([0, 1, 2, 3].map((f) => dealt(8, {}, f).spy.join()));
  assert.equal(spies.size, 4);
});

test('turn flow and permissions', () => {
  let s = dealt(4);
  const t = s.team;
  const g = guesser(s);
  assert.throws(() => G.apply(s, { type: 'clue', word: 'zzzq', num: 2 }, g, { now: 1 })); // not the spymaster
  assert.throws(() => G.apply(s, { type: 'clue', word: 'zzzq', num: 2 }, s.spy[1 - t], { now: 1 })); // other team
  assert.throws(() => guess(s, 0)); // no clue yet
  assert.throws(() => clue(s, 10));
  assert.throws(() => clue(s, -2));
  assert.throws(() => clue(s, 2, 'two words'));
  assert.throws(() => clue(s, 2, s.words[3])); // a word on the table
  assert.throws(() => clue(s, 2, `${s.words[3]}s`));
  assert.throws(() => clue(s, 2, ''));
  s = clue(s, 2, 'Zzzq');
  assert.equal(s.phase, 'guess');
  assert.equal(s.clue.word, 'zzzq');
  assert.equal(s.maxGuesses, 3);
  assert.throws(() => guess(s, cardsOf(s, S.TEAM_KEY[t])[0], s.spy[t])); // spymaster can't guess
  assert.throws(() => guess(s, cardsOf(s, S.TEAM_KEY[t])[0], guesser(s, 1 - t))); // other team can't
  assert.throws(() => G.apply(s, { type: 'end' }, g, { now: 1 })); // must guess first
  const mine = cardsOf(s, S.TEAM_KEY[t]);
  s = guess(s, mine[0]);
  assert.equal(s.phase, 'guess');
  assert.equal(s.team, t);
  assert.throws(() => guess(s, mine[0])); // already revealed (a second tap)
  s = G.apply(s, { type: 'end' }, g, { now: 1 });
  assert.equal(s.phase, 'clue');
  assert.equal(s.team, 1 - t);
  assert.equal(s.turn, 1);
  // neutral ends the turn
  s = clue(s, 1);
  s = guess(s, cardsOf(s, 'n')[0]);
  assert.equal(s.team, t);
  assert.equal(s.phase, 'clue');
  // enemy word ends the turn and counts for them
  s = clue(s, 3);
  const before = S.teamLeft(s, 1 - t);
  s = guess(s, cardsOf(s, S.TEAM_KEY[1 - t])[0]);
  assert.equal(S.teamLeft(s, 1 - t), before - 1);
  assert.equal(s.team, 1 - t);
  assert.deepEqual(s.clues.map((c) => c.picks.length), [1, 1, 1]);
});

test('guess limits: number + 1, and 0 / ∞ mean no limit', () => {
  let s = dealt(4);
  const t = s.team;
  const mine = cardsOf(s, S.TEAM_KEY[t]);
  s = clue(s, 1);
  s = guess(s, mine[0]);
  assert.equal(s.phase, 'guess');
  s = guess(s, mine[1]); // the +1 bonus guess
  assert.equal(s.phase, 'clue');
  assert.equal(s.team, 1 - t);
  for (const num of [0, S.INF]) {
    let u = dealt(4);
    const tt = u.team;
    const m = cardsOf(u, S.TEAM_KEY[tt]);
    u = clue(u, num);
    for (let k = 0; k < 8; k++) u = guess(u, m[k]);
    assert.equal(u.phase, 'guess');
    assert.equal(u.team, tt);
  }
});

test('trap loses at once; the key is shown, then the game is over', () => {
  let s = dealt(5);
  const t = s.team;
  s = clue(s, 2);
  s = G.apply(s, { type: 'guess', i: cardsOf(s, 'x')[0] }, guesser(s), { now: 5000 });
  assert.equal(s.phase, 'end');
  assert.equal(s.winner, 1 - t);
  assert.equal(s.reason, 'trap');
  assert.equal(G.results(s).over, false);
  assert.equal(G.tick(s, { now: 5000 + S.END_MS - 1 }), null);
  const a = G.tick(s, { now: 5000 + S.END_MS });
  assert.deepEqual(a, { type: 'finish' });
  assert.throws(() => G.apply(s, a, 0, { now: 0 }));
  s = G.apply(s, a, -1, { now: 9000 });
  const r = G.results(s);
  assert.equal(r.over, true);
  assert.deepEqual(r.rows.map((x) => x.win), [t === 1, t === 0]);
  assert.equal(r.rows[0].name, 'Red team');
  assert.throws(() => clue(s, 1));
});

test('win: uncovering all your words — or the enemy uncovering your last one', () => {
  let s = dealt(4);
  const t = s.team;
  const mine = cardsOf(s, S.TEAM_KEY[t]);
  s = clue(s, 9);
  for (const i of mine) s = guess(s, i);
  assert.equal(s.phase, 'end');
  assert.equal(s.winner, t);
  assert.equal(s.reason, 'all');
  s = G.apply(s, { type: 'finish' }, -1, { now: 0 });
  const r = G.results(s);
  assert.equal(r.rows[t].win, true);
  assert.equal(r.rows[t].score, 9);
  assert.equal(r.rows[1 - t].win, false);
  assert.equal(r.title, `${S.TEAM_NAMES[t]} team wins!`);

  // the other team reveals its 8th word by mistake while the starter guesses
  let u = dealt(4);
  const st = u.team;
  const theirs = cardsOf(u, S.TEAM_KEY[1 - st]);
  for (const i of theirs.slice(0, 7)) u.rev[i] = { by: 1 }; // pretend they found 7 already
  u = clue(u, 2);
  u = guess(u, theirs[7]);
  assert.equal(u.phase, 'end');
  assert.equal(u.winner, 1 - st);
});

test('co-op: 2–3 players (or by option), one team, rival flips, turn limit', () => {
  for (const n of [2, 3]) {
    const s = dealt(n, {}, 1);
    assert.equal(s.mode, 'coop');
    assert.ok(s.players.every((p) => p.team === 0));
    assert.equal(s.spy[0], 1 % n);
    assert.equal(s.spy[1], null);
    assert.equal(S.total(s, 'r'), 9);
    assert.equal(S.total(s, 'b'), 8);
    assert.equal(s.limit, 9);
  }
  assert.equal(dealt(6, { mode: 'coop', limit: 7 }).mode, 'coop');
  assert.equal(dealt(6, { mode: 'coop', limit: 7 }).limit, 7);
  assert.equal(dealt(4).mode, 'teams');

  let s = dealt(3, { limit: 7 }, 0);
  assert.equal(s.spy[0], 0);
  assert.throws(() => G.apply(s, { type: 'clue', word: 'zzzq', num: 1 }, 1, { now: 0 }));
  s = clue(s, 1);
  const mine = cardsOf(s, 'r');
  s = guess(s, mine[0], 2);
  s = G.apply(s, { type: 'end' }, 1, { now: 1000 }); // either guesser
  assert.equal(s.phase, 'rival');
  assert.equal(s.turn, 1);
  assert.equal(G.tick(s, { now: 1000 + S.RIVAL_MS - 1 }), null);
  const a = G.tick(s, { now: 1000 + S.RIVAL_MS });
  assert.deepEqual(a, { type: 'rival' });
  assert.deepEqual(G.randomFor(s, a, -1), [8]);
  assert.throws(() => G.apply(s, a, 0, { now: 0, rand: [0] }));
  s = G.apply(s, a, -1, { now: 0, rand: [3] });
  assert.equal(S.left(s, 'b'), 7);
  assert.equal(s.rev[cardsOf(s, 'b')[3]].by, -1);
  assert.equal(s.phase, 'clue');
  assert.equal(s.team, 0);
  // burn the remaining turns with neutral/rival guesses
  for (let k = 1; k < 7; k++) {
    s = clue(s, 1);
    const wrong = s.key.findIndex((x, i) => (x === 'n' || x === 'b') && !s.rev[i]);
    s = guess(s, wrong, 1);
    if (s.phase === 'rival') s = G.apply(s, { type: 'rival' }, -1, { now: 0, rand: randFor(G.randomFor(s, { type: 'rival' }, -1) || []) });
  }
  assert.equal(s.phase, 'end');
  assert.equal(s.reason, 'time');
  s = G.apply(s, { type: 'finish' }, -1, { now: 0 });
  const r = G.results(s);
  assert.equal(r.over, true);
  assert.equal(r.rows.filter((x) => x.win).length, 1);
  assert.equal(r.rows.findIndex((x) => x.win), 3); // "The clock" — never lines up with a player
  assert.equal(r.rows[3].name, 'The clock');

  // co-op win
  let w = dealt(2);
  w = clue(w, 9);
  for (const i of cardsOf(w, 'r')) w = guess(w, i, 1);
  assert.equal(w.phase, 'end');
  assert.equal(w.winner, 0);
  w = G.apply(w, { type: 'finish' }, -1, { now: 0 });
  assert.deepEqual(G.results(w).rows.map((x) => x.win), [true]);

  // co-op trap
  let x = dealt(2);
  x = clue(x, 2);
  x = guess(x, cardsOf(x, 'x')[0], 1);
  assert.equal(x.reason, 'trap');
  assert.equal(x.winner, null);
});

test('takeover: a teammate can become Spymaster', () => {
  let s = dealt(4);
  const t = s.team;
  const g = guesser(s);
  s = G.apply(s, { type: 'takeover' }, g, { now: 0 });
  assert.equal(s.spy[t], g);
  assert.throws(() => G.apply(s, { type: 'takeover' }, g, { now: 0 }));
  s = G.apply(s, { type: 'clue', word: 'zzzq', num: 1 }, g, { now: 0 });
  assert.equal(s.phase, 'guess');
});

test('apply never mutates its input', () => {
  const s = dealt(4);
  const copy = JSON.stringify(s);
  const t = clue(s, 2);
  guess(t, 0 + cardsOf(t, 'n')[0]);
  assert.equal(JSON.stringify(s), copy);
});

// Random legal play-outs (a stand-in for computer players, which this game doesn't have):
// spymasters give random legal clues, guessers tap random words or stop. Games must finish.
function randomMove(s, seat) {
  if (s.phase === 'clue' && s.spy[s.team] === seat) {
    return { type: 'clue', word: `qx${'abcdefghij'[Math.floor(Math.random() * 10)]}z`, num: Math.floor(Math.random() * 11) - 1 };
  }
  if (S.canGuess(s, seat)) {
    if (s.guesses > 0 && Math.random() < 0.25) return { type: 'end' };
    const open = s.rev.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
    // mostly guess right, like a decent team
    const mine = open.filter((i) => s.key[i] === S.TEAM_KEY[s.team]);
    const pool = mine.length && Math.random() < 0.7 ? mine : open;
    return { type: 'guess', i: pool[Math.floor(Math.random() * pool.length)] };
  }
  return null;
}

function playOut(nPlayers, opts, maxSteps = 5000) {
  const players = mk(nPlayers);
  let s = G.setup(players, opts, { now: 0, first: Math.floor(Math.random() * nPlayers) });
  let now = 0;
  const apply = (a, seat) => {
    const ranges = G.randomFor(s, a, seat);
    s = G.apply(s, a, seat, { now, rand: ranges?.length ? randFor(ranges) : null });
  };
  for (let step = 0; step < maxSteps; step++) {
    if (G.results(s).over) return { s, step };
    now += 1000;
    const sys = G.tick(s, { now: now + 1e9 });
    if (sys) { apply(sys, -1); continue; }
    let moved = false;
    const order = s.players.map((_, i) => i).sort(() => Math.random() - 0.5);
    for (const seat of order) {
      const a = randomMove(s, seat);
      if (!a) continue;
      try { apply(a, seat); } catch (e) { throw new Error(`illegal move ${JSON.stringify(a)} by ${seat}: ${e.message}`); }
      moved = true;
      break;
    }
    if (!moved) throw new Error(`nobody can move (phase ${s.phase})`);
  }
  throw new Error('game did not finish');
}

test('random play-outs always finish legally (teams and co-op)', () => {
  const reasons = {};
  for (let k = 0; k < 300; k++) {
    const n = 2 + (k % 9);
    const opts = { teams: ['alt', 'halves', 'shuffle'][k % 3], mode: k % 7 === 0 ? 'coop' : 'auto', limit: [7, 9, 11][k % 3] };
    const { s } = playOut(n, opts);
    reasons[`${s.mode}:${s.reason}`] = (reasons[`${s.mode}:${s.reason}`] || 0) + 1;
    const r = G.results(s);
    assert.ok(r.rows.filter((x) => x.win).length === 1);
  }
  for (const k of ['teams:all', 'teams:trap', 'coop:time', 'coop:trap']) assert.ok(reasons[k] > 0, `never saw ${k}`);
});
