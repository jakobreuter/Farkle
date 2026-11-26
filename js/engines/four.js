// Four in a Row — the classic two-player connection game (public domain).
// 7 columns × 6 rows. Players take turns dropping a disc into a column; it falls to the
// lowest empty cell. Connect four in a line (across, up, or diagonally) to win the game.
// A full board is a draw. Matches: single game, best of 3 or best of 5. The loser of a
// game starts the next one; after a draw the other player starts. Draws don't count
// towards the match, but a match is capped at 2·need+1 games (then most wins takes it).

export const COLS = 7;
export const ROWS = 6;
export const NEXT_MS = 3600; // pause between games of a match

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function newGame(players, first = 0, { bestOf = 1 } = {}) {
  const bo = [1, 3, 5].includes(Number(bestOf)) ? Number(bestOf) : 1;
  return {
    players: players.slice(0, 2).map((p) => ({ pid: p.pid, name: p.name, wins: 0 })),
    bestOf: bo,
    need: Math.ceil(bo / 2),
    maxGames: bo === 1 ? 1 : bo + 2,
    gameNo: 1,
    draws: 0,
    starter: first % 2,
    current: first % 2,
    cols: Array.from({ length: COLS }, () => []), // cols[c] = seats, bottom first
    moves: 0,
    last: null, // { col, row, seat }
    line: null, // winning four [[col,row] × 4]
    phase: 'play', // play | gameover | over
    gameWinner: null, // seat | -1 (draw), for the finished game
    winners: null, // match winners
    autoAt: 0,
    history: [], // per finished game: seat or -1
  };
}

export const at = (s, c, r) => (r < s.cols[c].length ? s.cols[c][r] : -1);
export const canDrop = (s, c) => Number.isInteger(c) && c >= 0 && c < COLS && s.cols[c].length < ROWS;
export const legalCols = (s) => [...Array(COLS).keys()].filter((c) => canDrop(s, c));

/** The four (or more, trimmed to four) cells through (c, r) owned by `seat`, or null. */
export function lineThrough(s, c, r, seat) {
  for (const [dc, dr] of DIRS) {
    const cells = [[c, r]];
    for (const sign of [1, -1]) {
      let x = c + dc * sign;
      let y = r + dr * sign;
      while (x >= 0 && x < COLS && y >= 0 && y < ROWS && at(s, x, y) === seat) {
        if (sign > 0) cells.push([x, y]); else cells.unshift([x, y]);
        x += dc * sign;
        y += dr * sign;
      }
    }
    if (cells.length >= 4) {
      // keep the four centred on the played disc where possible
      const i = cells.findIndex(([x, y]) => x === c && y === r);
      const start = Math.max(0, Math.min(cells.length - 4, i - 1));
      return cells.slice(start, start + 4);
    }
  }
  return null;
}

export function applyAction(state, a, seat, now = 0) {
  const s = structuredClone(state);
  switch (a.type) {
    case 'drop': {
      if (s.phase !== 'play') throw new Error('not now');
      if (seat !== s.current) throw new Error('not your turn');
      const c = Number(a.col);
      if (!canDrop(s, c)) throw new Error('column is full');
      const r = s.cols[c].length;
      s.cols[c].push(seat);
      s.moves += 1;
      s.last = { col: c, row: r, seat };
      const line = lineThrough(s, c, r, seat);
      if (line || s.moves >= COLS * ROWS) {
        s.line = line;
        s.gameWinner = line ? seat : -1;
        s.history = [...s.history, s.gameWinner];
        if (line) s.players[seat].wins += 1; else s.draws += 1;
        const played = s.history.length;
        const [w0, w1] = s.players.map((p) => p.wins);
        if (w0 >= s.need || w1 >= s.need || played >= s.maxGames) {
          s.phase = 'over';
          s.winners = w0 === w1 ? [] : [w0 > w1 ? 0 : 1];
        } else {
          s.phase = 'gameover';
          s.autoAt = now + NEXT_MS;
        }
      } else {
        s.current = 1 - seat;
      }
      return s;
    }
    case 'next': {
      if (seat !== -1) throw new Error('system only');
      if (s.phase !== 'gameover') throw new Error('not now');
      // the loser starts the next game; after a draw, the other player starts
      s.starter = s.gameWinner >= 0 ? 1 - s.gameWinner : 1 - s.starter;
      s.current = s.starter;
      s.cols = Array.from({ length: COLS }, () => []);
      s.moves = 0;
      s.last = null;
      s.line = null;
      s.gameWinner = null;
      s.gameNo += 1;
      s.phase = 'play';
      s.autoAt = 0;
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

// ---------------------------------------------------------------------------
// Computer player: negamax with alpha-beta pruning on a flat board.
// Cell index = c * ROWS + r (r = 0 at the bottom). Values 0 empty, 1 / 2 players.

const ORDER = [3, 2, 4, 1, 5, 0, 6]; // centre first: better pruning, better play
const WINDOWS = [];
for (let c = 0; c < COLS; c++) {
  for (let r = 0; r < ROWS; r++) {
    for (const [dc, dr] of DIRS) {
      const ec = c + dc * 3;
      const er = r + dr * 3;
      if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
      WINDOWS.push([0, 1, 2, 3].map((k) => (c + dc * k) * ROWS + (r + dr * k)));
    }
  }
}
const WIN = 1e6;

function winsAt(b, c, r, p) {
  for (const [dc, dr] of DIRS) {
    let n = 1;
    for (const sign of [1, -1]) {
      let x = c + dc * sign;
      let y = r + dr * sign;
      while (x >= 0 && x < COLS && y >= 0 && y < ROWS && b[x * ROWS + y] === p) { n++; x += dc * sign; y += dr * sign; }
    }
    if (n >= 4) return true;
  }
  return false;
}

// static score from the point of view of player p
function evaluate(b, p) {
  const o = 3 - p;
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    const v = b[3 * ROWS + r];
    if (v === p) score += 4; else if (v === o) score -= 4;
  }
  for (let i = 0; i < WINDOWS.length; i++) {
    const w = WINDOWS[i];
    let mine = 0;
    let theirs = 0;
    for (let k = 0; k < 4; k++) {
      const v = b[w[k]];
      if (v === p) mine++; else if (v === o) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) score += 12; else if (mine === 2) score += 3;
    else if (theirs === 3) score -= 14; else if (theirs === 2) score -= 3;
  }
  return score;
}

/**
 * Pick a column for `seat`. Immediate win, then forced block, then alpha-beta search
 * (iterative deepening up to maxDepth, stopping early if the time budget runs out).
 * `tie` (0..1) breaks ties between equally good moves.
 */
export function bestMove(s, seat, { maxDepth = 6, budgetMs = 100, tie = 0.5 } = {}) {
  const b = new Int8Array(COLS * ROWS);
  const h = new Int8Array(COLS);
  for (let c = 0; c < COLS; c++) {
    h[c] = s.cols[c].length;
    s.cols[c].forEach((v, r) => { b[c * ROWS + r] = v + 1; });
  }
  const me = seat + 1;
  const opp = 3 - me;
  const legal = ORDER.filter((c) => h[c] < ROWS);
  if (legal.length === 1) return legal[0];
  for (const c of legal) if (winsAt(b, c, h[c], me)) return c;
  const blocks = legal.filter((c) => winsAt(b, c, h[c], opp));
  if (blocks.length) return blocks[0];

  const t0 = Date.now();
  let nodes = 0;
  let aborted = false;
  const empty = COLS * ROWS - s.moves;

  function negamax(p, depth, alpha, beta, left) {
    if ((++nodes & 1023) === 0 && Date.now() - t0 > budgetMs) aborted = true;
    if (aborted) return 0;
    if (left === 0) return 0; // draw
    if (depth === 0) return evaluate(b, p);
    // win in one?
    for (let i = 0; i < 7; i++) {
      const c = ORDER[i];
      if (h[c] < ROWS && winsAt(b, c, h[c], p)) return WIN + depth;
    }
    let best = -Infinity;
    for (let i = 0; i < 7; i++) {
      const c = ORDER[i];
      if (h[c] >= ROWS) continue;
      const idx = c * ROWS + h[c];
      b[idx] = p; h[c]++;
      const v = -negamax(3 - p, depth - 1, -beta, -alpha, left - 1);
      h[c]--; b[idx] = 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // don't hand the opponent a win by playing under their winning cell
  const safe = legal.filter((c) => !(h[c] + 1 < ROWS && winsAt(b, c, h[c] + 1, opp)));
  const roots = safe.length ? safe : legal;
  let choice = roots[0];
  for (let depth = 2; depth <= Math.min(maxDepth, empty); depth++) {
    const scores = [];
    let alpha = -Infinity;
    for (const c of roots) {
      const idx = c * ROWS + h[c];
      b[idx] = me; h[c]++;
      // full window at the root so ties are real ties
      const v = -negamax(opp, depth - 1, -Infinity, -alpha + 1, empty - 1);
      h[c]--; b[idx] = 0;
      if (aborted) break;
      scores.push([c, v]);
      if (v > alpha) alpha = v;
    }
    if (aborted) break;
    const top = Math.max(...scores.map((x) => x[1]));
    const ties = scores.filter((x) => x[1] === top).map((x) => x[0]);
    choice = ties[Math.min(ties.length - 1, Math.floor(tie * ties.length))];
    if (top >= WIN) break; // found a forced win
  }
  return choice;
}
