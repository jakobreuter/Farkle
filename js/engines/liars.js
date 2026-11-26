// Liar's Dice: the traditional bluffing dice game. Pure rules, no DOM, no randomness
// (dice values are passed in by the caller).
//
// Everyone rolls their dice in secret. Players take turns raising a bid ("four 5s" =
// at least four dice showing 5 among ALL dice on the table), or calling "Liar!" on the
// previous bid. On a call every cup is lifted: if the bid holds, the caller loses a
// die, otherwise the bidder does. The loser starts the next round. Last player with
// dice wins. Optionally 1s are wild (count as every face, and nobody may bid on 1s).

export const REVEAL_MS = 6500;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** "four 5s", "one 6" */
export function bidText(b) {
  if (!b) return '';
  return `${WORDS[b.q] ?? b.q} ${b.f}${b.q === 1 ? '' : 's'}`;
}

export function newGame(players, first = 0, { wild = true, start = 5 } = {}) {
  return {
    players: players.map((p) => ({ pid: p.pid, name: p.name, dice: [], n: start })),
    wild: !!wild,
    start,
    phase: 'roll', // roll | bid | reveal | over
    round: 0,
    starter: first,
    current: first,
    bid: null, // { q, f, seat }
    bids: [], // this round's bids, oldest first
    reveal: null, // { bid, caller, bidder, count, met, loser, out }
    revealUntil: 0,
    out: [], // seats in the order they were knocked out
    winner: null,
    log: ['New game of Liar’s Dice.'],
  };
}

export const alive = (s) => s.players.map((p, i) => (p.n > 0 ? i : -1)).filter((i) => i >= 0);
export const totalDice = (s) => s.players.reduce((a, p) => a + p.n, 0);
export const minFace = (s) => (s.wild ? 2 : 1);

/** next seat after `seat` that still has dice */
export function nextAlive(s, seat) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (seat + k) % n;
    if (s.players[i].n > 0) return i;
  }
  return seat;
}

/** does a die showing v count toward face f? */
export const counts = (s, v, f) => v === f || (s.wild && v === 1 && f !== 1);

export function countFace(s, f) {
  let c = 0;
  for (const p of s.players) for (const v of p.dice) if (counts(s, v, f)) c++;
  return c;
}

/** is bid b a legal next bid given the current bid? */
export function isRaise(s, b) {
  if (!b || !Number.isInteger(b.q) || !Number.isInteger(b.f)) return false;
  if (b.f < minFace(s) || b.f > 6 || b.q < 1 || b.q > totalDice(s)) return false;
  const c = s.bid;
  if (!c) return true;
  return b.q > c.q || (b.q === c.q && b.f > c.f);
}

/** the smallest legal quantity for face f (or null if none) */
export function minQty(s, f) {
  const c = s.bid;
  const q = !c ? 1 : f > c.f ? c.q : c.q + 1;
  return q <= totalDice(s) ? q : null;
}

function addLog(s, msg) { s.log = [...s.log, msg].slice(-30); }

/**
 * seat: -1 for system actions ('roll', 'next'); otherwise the acting player.
 * values: for 'roll', one die value (1-6) per die in play, in seat order.
 */
export function applyAction(state, a, seat, { now = 0, values = null } = {}) {
  const s = structuredClone(state);
  const sys = a.type === 'roll' || a.type === 'next';
  if (sys !== (seat === -1)) throw new Error('not allowed');
  switch (a.type) {
    case 'roll': {
      if (s.phase !== 'roll') throw new Error('not time to roll');
      const need = totalDice(s);
      if (!values || values.length !== need || values.some((v) => !Number.isInteger(v) || v < 1 || v > 6)) throw new Error('bad dice');
      let k = 0;
      for (const p of s.players) p.dice = values.slice(k, (k += p.n));
      s.round += 1;
      s.phase = 'bid';
      s.current = s.players[s.starter].n > 0 ? s.starter : nextAlive(s, s.starter);
      s.bid = null;
      s.bids = [];
      s.reveal = null;
      return s;
    }
    case 'bid': {
      if (s.phase !== 'bid') throw new Error('no bidding now');
      if (seat !== s.current) throw new Error('not your turn');
      const b = { q: Number(a.q), f: Number(a.f) };
      if (!isRaise(s, b)) throw new Error('bid must be higher');
      s.bid = { ...b, seat };
      s.bids = [...s.bids, s.bid];
      s.current = nextAlive(s, seat);
      addLog(s, `${s.players[seat].name} bids ${bidText(b)}.`);
      return s;
    }
    case 'liar': {
      if (s.phase !== 'bid') throw new Error('no bidding now');
      if (seat !== s.current) throw new Error('not your turn');
      if (!s.bid) throw new Error('nothing to call yet');
      const count = countFace(s, s.bid.f);
      const met = count >= s.bid.q;
      const loser = met ? seat : s.bid.seat;
      s.reveal = { bid: s.bid, caller: seat, bidder: s.bid.seat, count, met, loser, out: s.players[loser].n === 1 };
      s.phase = 'reveal';
      s.revealUntil = now + REVEAL_MS;
      addLog(s, `${s.players[seat].name} calls Liar! There ${count === 1 ? 'was' : 'were'} ${count} — ${s.players[loser].name} loses a die.`);
      return s;
    }
    case 'next': {
      if (s.phase !== 'reveal') throw new Error('nothing to finish');
      const { loser } = s.reveal;
      const p = s.players[loser];
      p.n -= 1;
      if (p.n === 0) s.out = [...s.out, loser];
      const left = alive(s);
      if (left.length <= 1) {
        s.phase = 'over';
        s.winner = left[0] ?? null;
        s.current = s.winner ?? 0;
        addLog(s, `${s.players[s.winner].name} wins!`);
        return s;
      }
      s.starter = p.n > 0 ? loser : nextAlive(s, loser);
      s.phase = 'roll';
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

// ---------- probability helpers (used by the computer player) ----------

/** P(X >= k) for X ~ Binomial(n, p) */
export function atLeast(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let term = (1 - p) ** n; // P(X=0)
  let cdf = 0;
  for (let i = 0; i < k; i++) {
    cdf += term;
    term = term * ((n - i) / (i + 1)) * (p / (1 - p));
  }
  return Math.max(0, 1 - cdf);
}

/** chance that "at least q dice show f" is true, from one player's point of view */
export function chanceFor(s, seat, q, f) {
  const mine = s.players[seat].dice;
  const have = mine.filter((v) => counts(s, v, f)).length;
  const unknown = totalDice(s) - mine.length;
  const p = s.wild && f !== 1 ? 1 / 3 : 1 / 6;
  return atLeast(q - have, unknown, p);
}
