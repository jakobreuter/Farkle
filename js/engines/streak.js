// Lucky Streak — an original press-your-luck card game.
//
// Deck: numbers 1–10 (four of each) plus four ★ stars (44 cards).
// On your turn, flip cards one at a time into your row:
//   • a number you already have in your row → BUST, the turn scores 0
//   • ★ is worth 10 and never busts
//   • six different numbers in your row → LUCKY STREAK: +25 bonus, banked automatically
// Stop whenever you like to bank your row's total.
// First to the target triggers a final round; highest score wins.

export const STAR = 0; // card value for ★
export const STREAK_SIZE = 6;
export const STREAK_BONUS = 25;
export const STAR_VALUE = 10;

export function freshDeck() {
  const d = [];
  for (let n = 1; n <= 10; n++) for (let k = 0; k < 4; k++) d.push(n);
  for (let k = 0; k < 4; k++) d.push(STAR);
  return d;
}

export const cardValue = (c) => (c === STAR ? STAR_VALUE : c);
export const rowTotal = (row) => row.reduce((a, c) => a + cardValue(c), 0);
export const distinctNumbers = (row) => new Set(row.filter((c) => c !== STAR)).size;

export function newGame(players, target = 200, first = 0) {
  return {
    players: players.map((p) => ({ ...p, score: 0 })),
    current: first,
    row: [],
    deck: freshDeck(),
    discard: [],
    phase: 'turn', // turn | bust | streak | over
    flipNo: 0,
    lastCard: null,
    event: null,
    finalRound: null,
    winners: null,
    target,
    autoAt: 0,
    log: [`New game — first to ${target} wins.`],
  };
}

function addLog(s, msg) { s.log = [...s.log, msg].slice(-40); }

/** How many cards the next flip draws from (after reshuffling the discard pile if needed). */
export function drawSize(s) {
  return s.deck.length || s.discard.length;
}

function endTurn(s) {
  const p = s.players[s.current];
  s.discard.push(...s.row);
  s.row = [];
  if (!s.finalRound && p.score >= s.target) {
    s.finalRound = { trigger: s.current };
    addLog(s, `${p.name} reached ${s.target}! Everyone else gets one last turn.`);
  }
  const next = (s.current + 1) % s.players.length;
  if (s.finalRound && next === s.finalRound.trigger) {
    const top = Math.max(...s.players.map((pl) => pl.score));
    s.winners = s.players.map((pl, i) => (pl.score === top ? i : -1)).filter((i) => i >= 0);
    s.phase = 'over';
    addLog(s, s.winners.length > 1 ? 'Game over — it’s a tie!' : `Game over — ${s.players[s.winners[0]].name} wins!`);
    return;
  }
  s.current = next;
  s.phase = 'turn';
}

/** a: {type:'flip'} (needs rand: [index into the draw pile]) | {type:'stop'} | {type:'next'} (system) */
export function applyAction(state, a, rand, now = 0, pauseMs = 2200) {
  const s = structuredClone(state);
  s.event = null;
  const p = s.players[s.current];
  switch (a.type) {
    case 'flip': {
      if (s.phase !== 'turn') throw new Error('not now');
      if (!s.deck.length) {
        s.deck = s.discard;
        s.discard = [];
        addLog(s, 'Deck reshuffled.');
      }
      const idx = rand?.[0];
      if (!(Number.isInteger(idx) && idx >= 0 && idx < s.deck.length)) throw new Error('bad draw');
      const card = s.deck.splice(idx, 1)[0];
      s.flipNo++;
      s.lastCard = card;
      if (card !== STAR && s.row.includes(card)) {
        s.row.push(card);
        s.phase = 'bust';
        s.event = 'bust';
        s.autoAt = now + pauseMs;
        addLog(s, `💥 ${p.name} flipped a second ${card} and busted.`);
        return s;
      }
      s.row.push(card);
      if (distinctNumbers(s.row) >= STREAK_SIZE) {
        const pts = rowTotal(s.row) + STREAK_BONUS;
        p.score += pts;
        s.phase = 'streak';
        s.event = 'streak';
        s.autoAt = now + pauseMs;
        addLog(s, `🍀 Lucky streak! ${p.name} banks ${pts} (incl. +${STREAK_BONUS}).`);
      }
      return s;
    }
    case 'stop': {
      if (s.phase !== 'turn' || !s.row.length) throw new Error('flip at least once');
      const pts = rowTotal(s.row);
      p.score += pts;
      s.event = 'bank';
      addLog(s, `${p.name} banked ${pts} → ${p.score}.`);
      endTurn(s);
      return s;
    }
    case 'next': {
      if (s.phase !== 'bust' && s.phase !== 'streak') throw new Error('nothing to do');
      endTurn(s);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}
