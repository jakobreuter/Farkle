// Pure Farkle rules engine. No randomness lives here: dice values are passed in
// with every "roll" action, so the same code runs identically for both players.

export const SCORING_RULES = [
  ['Single 1', 100],
  ['Single 5', 50],
  ['Three 1s', 1000],
  ['Three 2s / 3s / 4s / 5s / 6s', '200 / 300 / 400 / 500 / 600'],
  ['Four of a kind', 1000],
  ['Five of a kind', 2000],
  ['Six of a kind', 3000],
  ['Straight 1–6', 1500],
  ['Three pairs', 1500],
  ['Four of a kind + a pair', 1500],
  ['Two triplets', 2500],
];

function countsOf(values) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) c[v]++;
  return c;
}

const memo = new Map();

// Best score that uses ALL of the given dice, or -Infinity if some die can't score.
function bestAll(c) {
  let total = 0;
  for (let f = 1; f <= 6; f++) total += c[f];
  if (total === 0) return 0;
  const key = c.join(',');
  if (memo.has(key)) return memo.get(key);

  let best = -Infinity;
  const take = (pts, face, k) => {
    if (c[face] < k) return;
    const n = c.slice();
    n[face] -= k;
    const r = bestAll(n);
    if (r > -Infinity) best = Math.max(best, pts + r);
  };

  if (total === 6) {
    const faces = [1, 2, 3, 4, 5, 6].filter((f) => c[f] > 0);
    if (faces.length === 6) best = Math.max(best, 1500); // straight
    if (faces.length === 3 && faces.every((f) => c[f] === 2)) best = Math.max(best, 1500); // three pairs
    if (faces.length === 2 && faces.some((f) => c[f] === 4)) best = Math.max(best, 1500); // 4 + pair
    if (faces.length === 2 && faces.every((f) => c[f] === 3)) best = Math.max(best, 2500); // two triplets
  }
  for (let f = 1; f <= 6; f++) {
    take(3000, f, 6);
    take(2000, f, 5);
    take(1000, f, 4);
    take(f === 1 ? 1000 : f * 100, f, 3);
  }
  take(100, 1, 1);
  take(50, 5, 1);

  memo.set(key, best);
  return best;
}

/** Score for a set of dice where every die must contribute. 0 = not a valid scoring set. */
export function scoreDice(values) {
  if (!values.length) return 0;
  const r = bestAll(countsOf(values));
  return r > 0 ? r : 0;
}

/** Does this roll contain at least one scoring combination? */
export function hasScore(values) {
  const c = countsOf(values);
  if (c[1] || c[5]) return true;
  for (let f = 1; f <= 6; f++) if (c[f] >= 3) return true;
  if (values.length === 6) {
    const faces = [1, 2, 3, 4, 5, 6].filter((f) => c[f] > 0);
    if (faces.length === 6) return true;
    if (faces.length === 3 && faces.every((f) => c[f] === 2)) return true;
  }
  return false;
}

export function newGame(names, target = 10000, firstPlayer = 0) {
  return {
    players: names.map((name) => ({ name, score: 0 })),
    current: firstPlayer,
    firstPlayer,
    turnPoints: 0,
    dice: [1, 2, 3, 4, 5, 6].map((v) => ({ value: v, kept: false })),
    selected: [],
    phase: 'start', // start | select | farkle | over
    rollNo: 0,
    lastRoll: null,
    event: null,
    finalRound: null,
    winners: null,
    target,
    log: [`New game — first to ${target.toLocaleString()} wins.`],
  };
}

export function freeIndices(state) {
  return state.dice.map((d, i) => (d.kept ? -1 : i)).filter((i) => i >= 0);
}

export function selectionScore(state) {
  return scoreDice(state.selected.map((i) => state.dice[i].value));
}

/** How many dice the next roll needs, or 0 if rolling isn't allowed now. */
export function diceToRoll(state) {
  if (state.phase === 'start') return 6;
  if (state.phase !== 'select') return 0;
  if (selectionScore(state) <= 0) return 0;
  const left = freeIndices(state).length - state.selected.length;
  return left === 0 ? 6 : left; // hot dice
}

export function canBank(state) {
  return state.phase === 'select' && selectionScore(state) > 0;
}

function addLog(s, msg) {
  s.log = [...s.log, msg].slice(-40);
}

function endTurn(s) {
  const p = s.players[s.current];
  if (!s.finalRound && p.score >= s.target) {
    s.finalRound = { trigger: s.current };
    addLog(s, `${p.name} reached ${s.target.toLocaleString()}! Everyone else gets one last turn.`);
  }
  const next = (s.current + 1) % s.players.length;
  s.turnPoints = 0;
  s.selected = [];
  s.dice = s.dice.map((d) => ({ ...d, kept: false }));
  if (s.finalRound && next === s.finalRound.trigger) {
    const top = Math.max(...s.players.map((pl) => pl.score));
    s.winners = s.players.map((pl, i) => (pl.score === top ? i : -1)).filter((i) => i >= 0);
    s.phase = 'over';
    addLog(s, s.winners.length > 1 ? 'Game over — it’s a tie!' : `Game over — ${s.players[s.winners[0]].name} wins!`);
    return;
  }
  s.current = next;
  s.phase = 'start';
}

/**
 * Apply an action and return a NEW state, or throw if the action is illegal.
 * Actions: {type:'toggle', index} | {type:'roll', values} | {type:'bank'} | {type:'pass'}
 */
export function applyAction(state, action) {
  const s = structuredClone(state);
  s.event = null;
  const name = s.players[s.current].name;

  switch (action.type) {
    case 'toggle': {
      if (s.phase !== 'select') throw new Error('Not selecting now');
      const i = action.index;
      if (!(i >= 0 && i < 6) || s.dice[i].kept) throw new Error('Bad die');
      s.selected = s.selected.includes(i) ? s.selected.filter((x) => x !== i) : [...s.selected, i].sort();
      return s;
    }
    case 'roll': {
      const n = diceToRoll(s);
      if (!n) throw new Error('Cannot roll now');
      const values = action.values;
      if (!Array.isArray(values) || values.length !== n || !values.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)) {
        throw new Error('Bad roll values');
      }
      if (s.phase === 'select') {
        const pts = selectionScore(s);
        s.turnPoints += pts;
        for (const i of s.selected) s.dice[i].kept = true;
        addLog(s, `${name} set aside ${s.selected.map((i) => s.dice[i].value).join(' ')} for ${pts}.`);
        s.selected = [];
        if (s.dice.every((d) => d.kept)) {
          s.dice = s.dice.map((d) => ({ ...d, kept: false }));
          s.event = 'hot';
          addLog(s, `🔥 Hot dice! ${name} rolls all six again.`);
        }
      }
      const idx = freeIndices(s);
      idx.forEach((di, k) => (s.dice[di].value = values[k]));
      s.rollNo++;
      s.lastRoll = { indices: idx, values: values.slice(), proof: action.proof || null };
      if (!hasScore(values)) {
        addLog(s, `💥 Farkle! ${name} rolled ${values.join(' ')} and loses ${s.turnPoints} points.`);
        s.turnPoints = 0;
        s.phase = 'farkle';
        s.event = 'farkle';
      } else {
        s.phase = 'select';
      }
      return s;
    }
    case 'bank': {
      if (!canBank(s)) throw new Error('Cannot bank now');
      const pts = selectionScore(s);
      s.turnPoints += pts;
      s.players[s.current].score += s.turnPoints;
      addLog(s, `${name} banked ${s.turnPoints.toLocaleString()} → ${s.players[s.current].score.toLocaleString()}.`);
      s.event = 'bank';
      endTurn(s);
      return s;
    }
    case 'pass': {
      if (s.phase !== 'farkle') throw new Error('Nothing to pass');
      endTurn(s);
      return s;
    }
    default:
      throw new Error('Unknown action');
  }
}
