// Color Rows: a roll-and-write dice game. Pure rules, no DOM.
//
// Every player has a sheet with four coloured rows of eleven numbers (two run 2→12,
// two run 12→2) plus a lock box, and a penalty track. Each round the active player
// rolls two white dice and one die per unlocked colour. Then, all at once:
//   • everyone may mark the white sum in any row;
//   • the active player may also mark one white+colour combination in that colour's row.
// Marks go left to right (skipped boxes are lost). The last number of a row may only be
// marked once the row already has 5+ marks; doing so locks that colour for everyone.
// An active player who marks nothing takes a penalty (−5).
// The game ends when two rows are locked or someone has four penalties.

export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const COLOR_NAMES = ['Red', 'Yellow', 'Green', 'Blue'];
export const ASC = [true, true, false, false];
export const LAST = 10; // index of the last number box
export const MIN_TO_LOCK = 5;
export const PENALTY = 5;
export const MAX_PEN = 4;
export const LOCKS_TO_END = 2;
export const VARIANTS = ['classic', 'mixed', 'bonus'];

export const tri = (m) => (m * (m + 1)) / 2;
export const ways = (n) => 6 - Math.abs(7 - n); // chances (of 36) of rolling n with two dice

export function baseNums(c) {
  const up = Array.from({ length: 11 }, (_, i) => i + 2);
  return ASC[c] ? up : up.reverse();
}

export function newGame(players, { variant = 'classic', timer = 0, first = 0 } = {}) {
  return {
    players: players.map((p) => ({ pid: p.pid, name: p.name, rows: [[], [], [], []], pen: 0 })),
    variant: VARIANTS.includes(variant) ? variant : 'classic',
    timer: [20, 30].includes(Number(timer)) ? Number(timer) : 0,
    active: first,
    phase: 'deal', // deal | roll | mark | over
    layout: null, // [{ nums: [11], stars: [indices] }] × 4
    locked: [false, false, false, false],
    dice: null, // { w: [a, b], c: [r, y, g, b] (null when locked) }
    rollNo: 0,
    round: 0,
    subs: null, // per seat: null (not yet) or an array of marks [{ row, n }]
    deadline: 0,
    last: null, // summary of the previous round
    event: null,
    winners: null,
  };
}

/** ranges needed by the deal (none for classic) */
export function dealRanges(variant) {
  if (variant === 'mixed') return Array(20).fill(2);
  if (variant === 'bonus') return Array(4).fill([8, 7]).flat();
  return null;
}

export function makeLayout(variant, rand) {
  return COLORS.map((_, c) => {
    const nums = baseNums(c);
    const stars = [];
    if (variant === 'mixed') {
      // "nudged" rows: each neighbouring pair of the first ten boxes may swap; the end box stays put
      for (let k = 0; k < 5; k++) {
        if (rand[c * 5 + k]) [nums[2 * k], nums[2 * k + 1]] = [nums[2 * k + 1], nums[2 * k]];
      }
    } else if (variant === 'bonus') {
      // two ★ boxes per row, somewhere in boxes 2..9
      const pool = [1, 2, 3, 4, 5, 6, 7, 8];
      stars.push(pool.splice(rand[c * 2] % pool.length, 1)[0]);
      stars.push(pool.splice(rand[c * 2 + 1] % pool.length, 1)[0]);
      stars.sort((a, b) => a - b);
    }
    return { nums, stars };
  });
}

/** marks counted in a row: boxes + ★ bonuses + the lock bonus */
export function rowCount(layoutRow, marks) {
  let n = marks.length;
  for (const i of marks) if (layoutRow.stars.includes(i)) n++;
  if (marks.includes(LAST)) n++;
  return n;
}

export function scoreOf(s, p) {
  const rows = p.rows.map((m, c) => tri(rowCount(s.layout ? s.layout[c] : { stars: [] }, m)));
  return { rows, pen: p.pen * PENALTY, total: rows.reduce((a, b) => a + b, 0) - p.pen * PENALTY };
}

export const nextPos = (marks) => (marks.length ? marks[marks.length - 1] + 1 : 0);

/** can this box be marked on these rows (rows as they are before the mark)? */
export function canMark(s, rows, c, idx) {
  if (s.locked[c] || idx < 0 || idx > LAST) return false;
  if (idx < nextPos(rows[c])) return false;
  if (idx === LAST && rowCount(s.layout[c], rows[c]) < MIN_TO_LOCK) return false;
  return true;
}

const whiteSum = (s) => s.dice.w[0] + s.dice.w[1];
function colorSums(s, c) {
  const d = s.dice.c[c];
  if (d == null || s.locked[c]) return [];
  return [...new Set([s.dice.w[0] + d, s.dice.w[1] + d])];
}

const withMark = (rows, c, idx) => rows.map((m, k) => (k === c ? [...m, idx] : m));

/**
 * Every legal set of marks for this seat this roll (including the empty one).
 * Each plan is an ordered list [{ row, n }]: the white mark first, then the colour mark.
 */
export function plans(s, seat) {
  if (s.phase !== 'mark' || !s.subs || s.subs[seat] != null) return [];
  const rows = s.players[seat].rows;
  const out = [[]];
  const seen = new Set(['']);
  const add = (p) => {
    const k = p.map((m) => `${m.row}:${m.n}`).sort().join(',');
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  };
  const ws = whiteSum(s);
  const whites = [];
  for (let c = 0; c < 4; c++) {
    const idx = s.layout[c].nums.indexOf(ws);
    if (canMark(s, rows, c, idx)) whites.push({ row: c, n: ws, idx });
  }
  const colorOpts = (r) => {
    const res = [];
    for (let c = 0; c < 4; c++) {
      for (const n of colorSums(s, c)) {
        const idx = s.layout[c].nums.indexOf(n);
        if (canMark(s, r, c, idx)) res.push({ row: c, n });
      }
    }
    return res;
  };
  for (const w of whites) add([{ row: w.row, n: w.n }]);
  if (seat === s.active) {
    for (const m of colorOpts(rows)) add([m]);
    for (const w of whites) {
      for (const m of colorOpts(withMark(rows, w.row, w.idx))) add([{ row: w.row, n: w.n }, m]);
    }
  }
  return out;
}

/** checks a submitted list of marks and returns the player's new rows (throws if illegal) */
export function checkMarks(s, seat, marks) {
  if (!Array.isArray(marks)) throw new Error('bad marks');
  const max = seat === s.active ? 2 : 1;
  if (marks.length > max) throw new Error('too many marks');
  let rows = s.players[seat].rows;
  const ws = whiteSum(s);
  marks.forEach((m, i) => {
    const c = Number(m?.row);
    const n = Number(m?.n);
    if (!Number.isInteger(c) || c < 0 || c > 3) throw new Error('bad row');
    const isWhite = n === ws;
    const isColor = seat === s.active && colorSums(s, c).includes(n);
    // with two marks the first is the white sum and the second the colour combination
    const ok = marks.length === 2 ? (i === 0 ? isWhite : isColor) : (isWhite || isColor);
    if (!ok) throw new Error('that number was not rolled for you');
    const idx = s.layout[c].nums.indexOf(n);
    if (!canMark(s, rows, c, idx)) throw new Error('that box cannot be marked');
    rows = withMark(rows, c, idx);
  });
  return rows;
}

function startRoll(s, now) {
  s.phase = 'roll';
  s.dice = s.dice ? { w: s.dice.w, c: s.dice.c.map((v, c) => (s.locked[c] ? null : v)) } : { w: [1, 1], c: [1, 1, 1, 1] };
  s.subs = null;
  s.deadline = s.timer ? now + s.timer * 1000 : 0;
}

export function rollRanges(s) {
  return Array(2 + s.locked.filter((x) => !x).length).fill(6);
}

export function totals(s) { return s.players.map((p) => scoreOf(s, p).total); }

function resolve(s, now) {
  const newLocks = [];
  const summary = [];
  s.players.forEach((p, seat) => {
    const marks = s.subs[seat] || [];
    let rows = p.rows;
    for (const m of marks) {
      const idx = s.layout[m.row].nums.indexOf(m.n);
      rows = withMark(rows, m.row, idx);
      if (idx === LAST && !newLocks.includes(m.row)) newLocks.push(m.row);
    }
    p.rows = rows;
    const pen = seat === s.active && marks.length === 0;
    if (pen) p.pen++;
    summary.push({ marks, pen });
  });
  for (const c of newLocks) s.locked[c] = true;
  s.last = { round: s.round, active: s.active, marks: summary, locks: newLocks };
  s.event = newLocks.length ? 'lock' : summary.some((x) => x.pen) ? 'penalty' : null;
  const nLocked = s.locked.filter(Boolean).length;
  if (nLocked >= LOCKS_TO_END || s.players.some((p) => p.pen >= MAX_PEN)) {
    s.phase = 'over';
    s.subs = null;
    s.deadline = 0;
    const t = totals(s);
    const best = Math.max(...t);
    s.winners = t.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
    return;
  }
  s.active = (s.active + 1) % s.players.length;
  s.round++;
  startRoll(s, now);
}

/**
 * action: { type: 'deal' } (system) | { type: 'roll' } | { type: 'done', marks } | { type: 'timeout' } (system)
 * seat: sender's seat, −1 for system actions. rand: ints from the ranges asked for.
 */
export function applyAction(state, a, seat, { now = 0, rand = null } = {}) {
  const s = structuredClone(state);
  s.event = null;
  if (s.phase === 'over') throw new Error('game over');
  switch (a?.type) {
    case 'deal': {
      if (seat !== -1 || s.phase !== 'deal') throw new Error('not now');
      const need = dealRanges(s.variant);
      if (need && (!rand || rand.length < need.length)) throw new Error('no shuffle');
      s.layout = makeLayout(s.variant, rand || []);
      startRoll(s, now);
      return s;
    }
    case 'roll': {
      if (s.phase !== 'roll') throw new Error('not time to roll');
      if (seat !== s.active && !(seat === -1 && s.timer)) throw new Error('not your roll');
      const need = rollRanges(s).length;
      if (!rand || rand.length < need) throw new Error('no dice');
      const v = rand.slice(0, need).map((x) => (x % 6) + 1);
      let k = 2;
      s.dice = { w: [v[0], v[1]], c: s.locked.map((l) => (l ? null : v[k++])) };
      s.rollNo++;
      s.phase = 'mark';
      s.subs = s.players.map(() => null);
      s.deadline = s.timer ? now + s.timer * 1000 : 0;
      return s;
    }
    case 'done': {
      if (s.phase !== 'mark') throw new Error('not time to mark');
      if (seat < 0 || seat >= s.players.length) throw new Error('not a player');
      if (s.subs[seat] != null) throw new Error('already done');
      if (a.rollNo != null && a.rollNo !== s.rollNo) throw new Error('that was for an earlier roll');
      checkMarks(s, seat, a.marks || []);
      s.subs[seat] = (a.marks || []).map((m) => ({ row: Number(m.row), n: Number(m.n) }));
      if (s.subs.every((x) => x != null)) resolve(s, now);
      return s;
    }
    case 'timeout': {
      if (seat !== -1 || s.phase !== 'mark' || !s.timer) throw new Error('not now');
      s.subs = s.subs.map((x) => x || []);
      resolve(s, now);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

// ---------------- computer player ----------------

function markValue(s, seat, rows, m) {
  const lay = s.layout[m.row];
  const idx = lay.nums.indexOf(m.n);
  const marks = rows[m.row];
  const count = rowCount(lay, marks);
  const nLocked = s.locked.filter(Boolean).length;
  const skipW = nLocked ? 0.55 : 1; // late in the game skipping hurts less
  let skip = 0;
  for (let k = nextPos(marks); k < idx; k++) skip += (ways(lay.nums[k]) / 6) * skipW;
  let v = 1 + 0.15 * count - skip;
  if (lay.stars.includes(idx)) v += 0.9;
  if (idx === LAST) {
    v += 2;
    if (nLocked + 1 >= LOCKS_TO_END) {
      // this would end the game: only if we're ahead
      const t = totals(s);
      const mine = t[seat] + count + 2 + (count + 1); // rough gain from the mark + lock
      const best = Math.max(...t.filter((_, i) => i !== seat));
      v += mine > best ? 3 : -20;
    }
  }
  return v;
}

export function botMarks(s, seat) {
  const all = plans(s, seat);
  const p = s.players[seat];
  let best = [];
  let bestV = seat === s.active ? -2.4 - p.pen * 0.8 : 0.35;
  for (const plan of all) {
    if (!plan.length) continue;
    let rows = p.rows;
    let v = 0;
    for (const m of plan) {
      v += markValue(s, seat, rows, m);
      rows = withMark(rows, m.row, s.layout[m.row].nums.indexOf(m.n));
    }
    // a second mark has to earn its place on its own
    if (plan.length === 2 && markValue(s, seat, withMark(p.rows, plan[0].row, s.layout[plan[0].row].nums.indexOf(plan[0].n)), plan[1]) < 0.2) continue;
    if (v > bestV) { bestV = v; best = plan; }
  }
  return best;
}
