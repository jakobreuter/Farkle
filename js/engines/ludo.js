// Ludo — the traditional cross-and-circle race game (public domain).
//
// Board: a 15×15 cross. 52 squares loop around the centre; each colour enters
// the loop on its own start square, goes once around (51 steps), turns up its
// own coloured home column (5 squares) and finishes in the centre.
//
// Token progress (per colour, relative to its start square):
//   -1        in base
//   0..50     on the loop (0 = start square)
//   51..55    home column
//   56        home (finished)
//
// Rules implemented:
//   • roll a 6 to bring a token out onto your start square
//   • a 6 gives another roll; three 6s in a row forfeits the turn
//   • landing on an opponent on a non-safe loop square sends it back to base,
//     and gives you a bonus roll
//   • safe squares: the four start squares and four star squares
//   • exact roll needed to reach home
//   • no legal move → the turn passes after a short pause
//   • exactly one distinct move → it's made automatically after a short pause
//   • optional "back step": on a roll of 1, a token on the loop (not on its own
//     start square) may instead move BACK one square — it can capture too

export const COLORS = ['red', 'green', 'yellow', 'blue'];
export const COLOR_NAMES = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };
export const LOOP = 52;
export const LAST_LOOP = 50; // last loop square before turning into the home column
export const HOME = 56;
export const STARTS = [0, 13, 26, 39]; // loop index of each colour's start square
export const STARS = [8, 21, 34, 47]; // loop index of the star squares
export const SAFE = new Set([...STARTS, ...STARS]);
export const AUTO_MS = 2100; // pause before a forced move is made for you
export const PASS_MS = 2600; // pause on "No moves" before the turn passes

// ---------- geometry ----------

// The 52 loop squares as [row, col], starting at red's start square, clockwise.
export const TRACK = (() => {
  const t = [];
  const run = (r0, c0, dr, dc, n) => { for (let k = 0; k < n; k++) t.push([r0 + dr * k, c0 + dc * k]); };
  run(6, 1, 0, 1, 5); // → along row 6
  run(5, 6, -1, 0, 6); // ↑ col 6
  run(0, 7, 0, 1, 1);
  run(0, 8, 1, 0, 6); // ↓ col 8
  run(6, 9, 0, 1, 6); // → row 6
  run(7, 14, 1, 0, 1);
  run(8, 14, 0, -1, 6); // ← row 8
  run(9, 8, 1, 0, 6); // ↓ col 8
  run(14, 7, 0, -1, 1);
  run(14, 6, -1, 0, 6); // ↑ col 6
  run(8, 5, 0, -1, 6); // ← row 8
  run(7, 0, -1, 0, 1);
  run(6, 0, 0, 1, 1);
  return t;
})();

// Home column squares (progress 51..55) for each colour index.
export const HOME_COL = [
  [1, 2, 3, 4, 5].map((c) => [7, c]), // red: row 7, left → centre
  [1, 2, 3, 4, 5].map((r) => [r, 7]), // green: col 7, top → centre
  [13, 12, 11, 10, 9].map((c) => [7, c]), // yellow: row 7, right → centre
  [13, 12, 11, 10, 9].map((r) => [r, 7]), // blue: col 7, bottom → centre
];

// Top-left corner of each colour's 6×6 base.
export const BASE_CORNER = [[0, 0], [0, 9], [9, 9], [9, 0]];

/** Loop index of a token of colour `ci` at progress p (only for 0..50). */
export const loopIndex = (ci, p) => (p + STARTS[ci]) % LOOP;

/** [row, col] cell of a token, or null for base/home. */
export function cellOf(ci, p) {
  if (p < 0 || p >= HOME) return null;
  if (p <= LAST_LOOP) return TRACK[loopIndex(ci, p)];
  return HOME_COL[ci][p - LAST_LOOP - 1];
}

// ---------- game ----------

/** Colours used for n players (2 players sit opposite each other). */
export function colorsFor(n) {
  if (n === 2) return [0, 2];
  return [0, 1, 2, 3].slice(0, n);
}

export function newGame(players, { until = 'first', first = 0, backStep = true } = {}) {
  const cols = colorsFor(players.length);
  return {
    players: players.map((p, i) => ({ pid: p.pid, name: p.name, color: cols[i], tokens: [-1, -1, -1, -1], place: null })),
    current: first,
    phase: 'roll', // roll | move | pass | over
    die: null,
    rollNo: 0,
    moveNo: 0,
    sixes: 0,
    legal: [], // tokens that can move forward
    backs: [], // tokens that may step back 1 instead (back-step rule, roll of 1)
    auto: null,
    autoAt: 0,
    backStep: !!backStep,
    until: until === 'all' ? 'all' : 'first',
    finished: [],
    lastMove: null,
    bonus: null, // 'six' | 'capture' when the current player is rolling again
    event: null,
    winners: null,
    log: ['New game of Ludo.'],
  };
}

function addLog(s, msg) { s.log = [...s.log, msg].slice(-40); }

export const homeCount = (p) => p.tokens.filter((t) => t === HOME).length;

/** Where token t of player `seat` would land with `die`, or null if it can't move. */
export function destOf(s, seat, t, die = s.die) {
  const p = s.players[seat].tokens[t];
  if (p === HOME) return null;
  if (p < 0) return die === 6 ? 0 : null;
  const d = p + die;
  return d <= HOME ? d : null;
}

/** Tokens of the current player that may move with the current die. */
export function legalTokens(s, seat = s.current, die = s.die) {
  if (die == null) return [];
  return [0, 1, 2, 3].filter((t) => destOf(s, seat, t, die) != null);
}

/** Tokens that may step back one square: back-step on, a roll of 1, on the loop but not on the start square. */
export function backTokens(s, seat = s.current, die = s.die) {
  if (!s.backStep || die !== 1) return [];
  return [0, 1, 2, 3].filter((t) => { const p = s.players[seat].tokens[t]; return p >= 1 && p <= LAST_LOOP; });
}

/** Opponent tokens [{seat, token}] that would be sent home by a token of `seat` landing on progress d. */
export function capturesAt(s, seat, d) {
  if (d < 0 || d > LAST_LOOP) return [];
  const ci = s.players[seat].color;
  const li = loopIndex(ci, d);
  if (SAFE.has(li)) return [];
  const out = [];
  s.players.forEach((pl, j) => {
    if (j === seat) return;
    pl.tokens.forEach((q, k) => {
      if (q >= 0 && q <= LAST_LOOP && loopIndex(pl.color, q) === li) out.push({ seat: j, token: k });
    });
  });
  return out;
}

function nextSeat(s, from) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    if (s.players[j].place == null) return j;
  }
  return from;
}

function endTurn(s) {
  s.current = nextSeat(s, s.current);
  s.phase = 'roll';
  s.sixes = 0;
  s.legal = [];
  s.backs = [];
  s.auto = null;
  s.bonus = null;
}

function finishGame(s) {
  s.phase = 'over';
  s.legal = [];
  s.backs = [];
  s.auto = null;
  s.winners = s.players.map((p, i) => (p.place === 1 ? i : -1)).filter((i) => i >= 0);
  addLog(s, `Game over — ${s.players[s.winners[0]].name} wins!`);
}

/**
 * a: {type:'roll'} (values: [1..6]) | {type:'move', token} | {type:'pass'} (system)
 */
export function applyAction(state, a, values, now = 0) {
  const s = structuredClone(state);
  s.event = null;
  const p = s.players[s.current];
  switch (a.type) {
    case 'roll': {
      if (s.phase !== 'roll') throw new Error('not time to roll');
      const v = values?.[0];
      if (!(Number.isInteger(v) && v >= 1 && v <= 6)) throw new Error('bad die');
      s.die = v;
      s.rollNo++;
      s.bonus = null;
      s.sixes = v === 6 ? s.sixes + 1 : 0;
      if (s.sixes >= 3) {
        s.phase = 'pass';
        s.event = 'three6';
        s.legal = [];
        s.auto = null;
        s.autoAt = now + PASS_MS;
        addLog(s, `${p.name} rolled three 6s in a row — turn lost.`);
        return s;
      }
      const legal = legalTokens(s);
      const backs = backTokens(s);
      if (!legal.length && !backs.length) {
        s.phase = 'pass';
        s.event = 'nomove';
        s.legal = [];
        s.auto = null;
        s.autoAt = now + PASS_MS;
        addLog(s, `${p.name} rolled ${v} — no moves.`);
        return s;
      }
      s.phase = 'move';
      s.legal = legal;
      s.backs = backs;
      // tokens on the same square are interchangeable: one distinct move → do it for them
      const spots = new Set(legal.map((t) => p.tokens[t]));
      s.auto = spots.size === 1 && !backs.length ? legal[0] : null;
      s.autoAt = now + AUTO_MS;
      return s;
    }
    case 'move': {
      if (s.phase !== 'move') throw new Error('roll first');
      const t = Number(a.token);
      const back = !!a.back;
      if (!(back ? s.backs : s.legal).includes(t)) throw new Error(back ? 'that token can’t step back' : 'that token can’t move');
      const from = p.tokens[t];
      const to = back ? from - 1 : destOf(s, s.current, t);
      const caps = capturesAt(s, s.current, to);
      p.tokens[t] = to;
      for (const c of caps) s.players[c.seat].tokens[c.token] = -1;
      s.moveNo++;
      s.lastMove = { seat: s.current, token: t, from, to, back, captured: caps.map((c) => ({ ...c, from: state.players[c.seat].tokens[c.token] })) };
      s.legal = [];
      s.backs = [];
      s.auto = null;
      if (caps.length) {
        s.event = 'capture';
        const names = [...new Set(caps.map((c) => s.players[c.seat].name))].join(' & ');
        addLog(s, `${p.name} captured ${names}${caps.length > 1 ? ` (×${caps.length})` : ''}!`);
      } else if (to === HOME) {
        s.event = 'home';
        addLog(s, `${p.name} brought a token home (${homeCount(p)}/4).`);
      } else if (from < 0) {
        s.event = 'out';
      } else if (back) {
        s.event = 'back';
        addLog(s, `${p.name} stepped back one square.`);
      }
      if (homeCount(p) === 4) {
        s.finished.push(s.current);
        p.place = s.finished.length;
        s.event = 'finish';
        addLog(s, `${p.name} has all four tokens home${s.until === 'all' ? ` — place ${p.place}` : ''}!`);
        const left = s.players.filter((pl) => pl.place == null);
        if (s.until === 'first' || left.length <= 1) {
          // rank the rest by how far along they are
          const rest = s.players.map((pl, i) => i).filter((i) => s.players[i].place == null)
            .sort((x, y) => progressOf(s.players[y]) - progressOf(s.players[x]));
          for (const i of rest) { s.finished.push(i); s.players[i].place = s.finished.length; }
          finishGame(s);
          return s;
        }
        endTurn(s);
        return s;
      }
      if (s.die === 6 || caps.length) {
        s.phase = 'roll'; // bonus roll
        s.legal = [];
        s.bonus = caps.length ? 'capture' : 'six';
      } else {
        endTurn(s);
      }
      return s;
    }
    case 'pass': {
      if (s.phase !== 'pass') throw new Error('nothing to pass');
      endTurn(s);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

/** Total steps made by a player's tokens (tie-break for unfinished players). */
export function progressOf(pl) {
  return pl.tokens.reduce((a, t) => a + (t < 0 ? 0 : t + 1), 0);
}

// ---------- computer player ----------

/** Could any opponent token reach loop square li with one roll? */
export function threatened(s, seat, li) {
  if (SAFE.has(li)) return false;
  return s.players.some((pl, j) => j !== seat && pl.place == null && pl.tokens.some((q) => {
    if (q < 0 || q > LAST_LOOP) return false;
    const d = (li - loopIndex(pl.color, q) + LOOP) % LOOP;
    return d >= 1 && d <= 6 && q + d <= LAST_LOOP;
  }));
}

/**
 * Priority: capture (forward or back step) > bring a token out on a 6 > finish
 * > pull a threatened token out of danger (forward, else back step) > move into safety
 * > advance the furthest token that won't be exposed (else the furthest).
 * Returns { token, back } or null.
 */
export function botMove(s) {
  const seat = s.current;
  const pl = s.players[seat];
  const mk = (t, back) => {
    const from = pl.tokens[t];
    const to = back ? from - 1 : destOf(s, seat, t);
    const caps = capturesAt(s, seat, to);
    const li = to <= LAST_LOOP ? loopIndex(pl.color, to) : -1;
    const safeDest = to > LAST_LOOP || SAFE.has(li);
    const fromExposed = from >= 0 && from <= LAST_LOOP && threatened(s, seat, loopIndex(pl.color, from));
    return { t, back, from, to, caps, safeDest, exposed: !safeDest && threatened(s, seat, li), fromExposed };
  };
  const fwd = s.legal.map((t) => mk(t, false));
  const bck = (s.backs || []).map((t) => mk(t, true));
  const pick = (o) => ({ token: o.t, back: o.back });
  const best = (list, score) => list.reduce((b, o) => (score(o) > score(b) ? o : b));
  if (!fwd.length && !bck.length) return null;
  const capt = [...fwd, ...bck].filter((o) => o.caps.length);
  if (capt.length) {
    // knock back whoever had come furthest
    return pick(best(capt, (o) => Math.max(...o.caps.map((c) => s.players[c.seat].tokens[c.token])) + (o.back ? 0 : 0.5)));
  }
  const out = fwd.find((o) => o.from < 0);
  if (out) return pick(out);
  const home = fwd.find((o) => o.to === HOME);
  if (home) return pick(home);
  const rescue = fwd.filter((o) => o.fromExposed && !o.exposed);
  if (rescue.length) return pick(best(rescue, (o) => o.from));
  const rescueBack = bck.filter((o) => o.fromExposed && !o.exposed);
  if (rescueBack.length) return pick(best(rescueBack, (o) => o.from));
  if (!fwd.length) return pick(best(bck, (o) => (o.exposed ? 0 : 100) + o.from));
  const safe = fwd.filter((o) => o.safeDest && o.from <= LAST_LOOP);
  if (safe.length) return pick(best(safe, (o) => o.from));
  const calm = fwd.filter((o) => !o.exposed);
  return pick(best(calm.length ? calm : fwd, (o) => o.from));
}
