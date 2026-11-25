// Yacht: the classic public-domain five-dice category game.
// Up to three rolls per turn (hold any dice between rolls), then score in one
// unused category. 13 turns each; highest total wins.

export const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER = ['three', 'four', 'full', 'small', 'large', 'yacht', 'chance'];
export const CATS = [...UPPER, ...LOWER];
export const LABELS = {
  ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
  three: '3 of a kind', four: '4 of a kind', full: 'Full house', small: 'Small straight',
  large: 'Large straight', yacht: 'Yacht', chance: 'Chance',
};
export const HELP = {
  ones: 'Sum of 1s', twos: 'Sum of 2s', threes: 'Sum of 3s', fours: 'Sum of 4s', fives: 'Sum of 5s', sixes: 'Sum of 6s',
  three: 'Sum of all dice', four: 'Sum of all dice', full: '25 points', small: 'Four in a row · 30',
  large: 'Five in a row · 40', yacht: 'All five the same · 50', chance: 'Sum of all dice',
};
export const BONUS_AT = 63;
export const BONUS = 35;

export function scoreFor(cat, dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of dice) c[v]++;
  const sum = dice.reduce((a, b) => a + b, 0);
  const has = (f) => c[f] > 0;
  const run = (a, b) => { for (let f = a; f <= b; f++) if (!has(f)) return false; return true; };
  const ui = UPPER.indexOf(cat);
  if (ui >= 0) return c[ui + 1] * (ui + 1);
  switch (cat) {
    case 'three': return c.some((n) => n >= 3) ? sum : 0;
    case 'four': return c.some((n) => n >= 4) ? sum : 0;
    case 'full': {
      const counts = c.filter((n) => n > 0).sort();
      return (counts.length === 2 && counts[0] === 2 && counts[1] === 3) || counts[0] === 5 ? 25 : 0;
    }
    case 'small': return run(1, 4) || run(2, 5) || run(3, 6) ? 30 : 0;
    case 'large': return run(1, 5) || run(2, 6) ? 40 : 0;
    case 'yacht': return c.some((n) => n === 5) ? 50 : 0;
    case 'chance': return sum;
    default: throw new Error('bad category');
  }
}

export function totals(card) {
  const upper = UPPER.reduce((a, k) => a + (card[k] ?? 0), 0);
  const bonus = upper >= BONUS_AT ? BONUS : 0;
  const lower = LOWER.reduce((a, k) => a + (card[k] ?? 0), 0);
  return { upper, bonus, lower, total: upper + bonus + lower };
}

export function newGame(players, first = 0) {
  return {
    players: players.map((p) => ({ ...p, card: {} })),
    current: first,
    first,
    dice: [1, 2, 3, 4, 5],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    rollNo: 0,
    lastRoll: null,
    turn: 1,
    phase: 'play', // play | over
    winners: null,
    event: null,
    log: ['New game of Yacht.'],
  };
}

export function diceToRoll(s) {
  if (s.phase !== 'play' || s.rollsLeft <= 0) return 0;
  return s.rollsLeft === 3 ? 5 : s.held.filter((x) => !x).length;
}

function addLog(s, msg) { s.log = [...s.log, msg].slice(-40); }

export function applyAction(state, a, values) {
  const s = structuredClone(state);
  s.event = null;
  const p = s.players[s.current];
  switch (a.type) {
    case 'roll': {
      const n = diceToRoll(s);
      if (!n) throw new Error('no rolls left');
      if (!values || values.length !== n) throw new Error('bad values');
      if (s.rollsLeft === 3) s.held = [false, false, false, false, false];
      const idx = [0, 1, 2, 3, 4].filter((i) => !s.held[i]);
      idx.forEach((di, k) => { s.dice[di] = values[k]; });
      s.rollsLeft--;
      s.rollNo++;
      s.lastRoll = { indices: idx };
      return s;
    }
    case 'hold': {
      if (s.phase !== 'play' || s.rollsLeft === 3 || s.rollsLeft === 0) throw new Error('cannot hold now');
      const i = Number(a.index);
      if (!(i >= 0 && i < 5)) throw new Error('bad die');
      s.held[i] = !s.held[i];
      return s;
    }
    case 'score': {
      if (s.phase !== 'play' || s.rollsLeft === 3) throw new Error('roll first');
      if (!CATS.includes(a.cat) || p.card[a.cat] != null) throw new Error('category used');
      const pts = scoreFor(a.cat, s.dice);
      p.card[a.cat] = pts;
      s.event = a.cat === 'yacht' && pts ? 'yacht' : 'score';
      addLog(s, `${p.name} scored ${pts} in ${LABELS[a.cat]}.`);
      // next player
      s.rollsLeft = 3;
      s.held = [false, false, false, false, false];
      const n = s.players.length;
      const next = (s.current + 1) % n;
      const done = s.players.every((pl) => CATS.every((k) => pl.card[k] != null));
      if (done) {
        const t = s.players.map((pl) => totals(pl.card).total);
        const top = Math.max(...t);
        s.winners = t.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
        s.phase = 'over';
        addLog(s, s.winners.length > 1 ? 'Game over — it’s a tie!' : `Game over — ${s.players[s.winners[0]].name} wins!`);
      } else {
        s.current = next;
        if (next === s.first) s.turn++;
      }
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}
