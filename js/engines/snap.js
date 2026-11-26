// Symbol Snap — an original real-time symbol-matching race.
//
// The deck is built from the finite projective plane of order 7: 57 points (symbols)
// and 57 lines (cards) with 8 points each, so any two cards share exactly ONE symbol.
// Everyone holds one face-up card; the top card of the center pile is revealed and
// the first player to tap the symbol their card shares with it wins that card (it
// becomes their new card, +1). A wrong tap locks you out for a moment. Most cards
// won when the pile runs out wins.

export const ORDER = 7;
export const PER_CARD = ORDER + 1; // 8
export const DECK_SIZE = ORDER * ORDER + ORDER + 1; // 57
export const LOCK_MS = 2000;
export const REVEAL_MS = 1700;

// 57 distinct, easy-to-tell-apart emoji (single code points, no flags / skin tones).
export const SYMBOLS = [
  ['🍎', 'apple'], ['🍌', 'banana'], ['🍇', 'grapes'], ['🍉', 'watermelon'], ['🍓', 'strawberry'],
  ['🥕', 'carrot'], ['🌽', 'corn'], ['🍄', 'mushroom'], ['🌵', 'cactus'], ['🌻', 'sunflower'],
  ['🌲', 'pine tree'], ['🍁', 'maple leaf'], ['🌙', 'moon'], ['⭐', 'star'], ['🔥', 'fire'],
  ['💧', 'droplet'], ['⛄', 'snowman'], ['⚡', 'lightning'], ['🌈', 'rainbow'], ['🐙', 'octopus'],
  ['🐢', 'turtle'], ['🐘', 'elephant'], ['🦒', 'giraffe'], ['🐧', 'penguin'], ['🦉', 'owl'],
  ['🐸', 'frog'], ['🐝', 'bee'], ['🦋', 'butterfly'], ['🐟', 'fish'], ['🦀', 'crab'],
  ['🐌', 'snail'], ['🦊', 'fox'], ['🐷', 'pig'], ['🦄', 'unicorn'], ['🐞', 'ladybug'],
  ['🚗', 'car'], ['🚀', 'rocket'], ['🚲', 'bicycle'], ['⛵', 'sailboat'], ['🎈', 'balloon'],
  ['🎁', 'gift'], ['🎸', 'guitar'], ['⚽', 'soccer ball'], ['🎲', 'die'], ['🔑', 'key'],
  ['🔔', 'bell'], ['💡', 'light bulb'], ['⏰', 'alarm clock'], ['🎩', 'top hat'], ['👑', 'crown'],
  ['🍕', 'pizza'], ['🍩', 'donut'], ['🧀', 'cheese'], ['☔', 'umbrella'], ['⚓', 'anchor'],
  ['💎', 'gem'], ['🦖', 'dinosaur'],
];

/** CARDS[i] = 8 symbol ids. Lines of PG(2,7). */
export const CARDS = (() => {
  const n = ORDER;
  const pt = (x, y) => x * n + y; // affine points 0..48
  const inf = (m) => n * n + m; // point at infinity for slope m: 49..55
  const vinf = n * n + n; // vertical point at infinity: 56
  const cards = [];
  for (let m = 0; m < n; m++) {
    for (let b = 0; b < n; b++) {
      const c = [];
      for (let x = 0; x < n; x++) c.push(pt(x, (m * x + b) % n));
      c.push(inf(m));
      cards.push(c);
    }
  }
  for (let x = 0; x < n; x++) {
    const c = [];
    for (let y = 0; y < n; y++) c.push(pt(x, y));
    c.push(vinf);
    cards.push(c);
  }
  const line = [];
  for (let m = 0; m < n; m++) line.push(inf(m));
  line.push(vinf);
  cards.push(line);
  return cards;
})();

/** The one symbol two cards share. */
export function common(a, b) {
  const B = CARDS[b];
  return CARDS[a].find((x) => B.includes(x));
}

const addLog = (s, t) => { s.log.push(t); if (s.log.length > 40) s.log.shift(); };

export function newGame(players, pileOpt = 25) {
  return {
    phase: 'deal',
    pileOpt: pileOpt === 'all' ? 'all' : Number(pileOpt) || 25,
    players: players.map((p) => ({ pid: p.pid, name: p.name, score: 0, card: null })),
    pile: [],
    center: null,
    round: 0,
    roundAt: 0,
    lockUntil: players.map(() => 0),
    last: null, // { seat, symbol, card } of the most recent win (shown during 'reveal')
    autoAt: 0,
    winners: null,
    log: [],
  };
}

/** Fisher–Yates ranges for the deal: [57, 56, ..., 2]. */
export const dealRanges = () => Array.from({ length: DECK_SIZE - 1 }, (_, i) => DECK_SIZE - i);

function reveal(s, now) {
  s.center = s.pile.pop();
  s.round++;
  s.roundAt = now;
  s.phase = 'play';
  s.last = null;
}

export function applyAction(state, a, seat, { now = 0, rand = null } = {}) {
  const s = structuredClone(state);
  switch (a.type) {
    case 'deal': {
      if (seat !== -1) throw new Error('system only');
      if (s.phase !== 'deal') throw new Error('already dealt');
      const ranges = dealRanges();
      if (!rand || rand.length !== ranges.length) throw new Error('need random numbers');
      const deck = Array.from({ length: DECK_SIZE }, (_, i) => i);
      for (let i = 0; i < ranges.length; i++) {
        const top = DECK_SIZE - 1 - i;
        const j = Math.floor(rand[i]) % (top + 1);
        [deck[top], deck[j]] = [deck[j], deck[top]];
      }
      s.players.forEach((p) => { p.card = deck.pop(); });
      const avail = deck.length;
      const size = s.pileOpt === 'all' ? avail : Math.min(avail, s.pileOpt);
      s.pile = deck.slice(avail - size); // top of the pile is the END of the array
      reveal(s, now);
      addLog(s, `Dealt — ${size} cards in the pile.`);
      return s;
    }
    case 'claim': {
      if (seat < 0 || seat >= s.players.length) throw new Error('not a player');
      if (s.phase !== 'play') throw new Error('no card to claim');
      if (a.round !== s.round) throw new Error('too late — that card is gone');
      if (now < (s.lockUntil[seat] || 0)) throw new Error('locked out');
      const p = s.players[seat];
      const sym = Number(a.symbol);
      if (!CARDS[s.center].includes(sym) && !CARDS[p.card].includes(sym)) throw new Error('not on the cards');
      const match = common(p.card, s.center);
      if (sym !== match) {
        s.lockUntil[seat] = now + LOCK_MS;
        return s;
      }
      p.score++;
      s.last = { seat, symbol: sym, card: s.center, old: p.card };
      p.card = s.center;
      s.phase = 'reveal';
      s.autoAt = now + REVEAL_MS;
      addLog(s, `${p.name} matched ${SYMBOLS[sym][0]} (${p.score}).`);
      return s;
    }
    case 'next': {
      if (seat !== -1) throw new Error('system only');
      if (s.phase !== 'reveal') throw new Error('nothing to do');
      if (!s.pile.length) {
        s.phase = 'over';
        const best = Math.max(...s.players.map((x) => x.score));
        s.winners = s.players.map((x, i) => (x.score === best ? i : -1)).filter((i) => i >= 0);
        addLog(s, `Pile empty — ${s.winners.map((i) => s.players[i].name).join(' & ')} ${s.winners.length > 1 ? 'tie' : 'wins'} with ${best}.`);
        return s;
      }
      reveal(s, now);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

// ---------- deterministic helpers (bot timing, card layout) ----------

/** Small integer hash (deterministic). */
export function hash(...xs) {
  let h = 2166136261;
  for (const x of xs) {
    h ^= x + 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** How long a computer player "looks" before it finds the match: 2.5–6 s. */
export const botThinkMs = (round, seat) => 2500 + (hash(round, seat, 7) % 3501);

/**
 * Where each symbol of a card sits, as fractions of the card diameter (center = 0.5, 0.5).
 * One symbol in the middle, seven on a ring; order, ring offset, size and rotation all
 * derive from the card id so every client draws the same card the same way.
 * Returns [{ sym, x, y, size, rot }] where size is a font scale (~0.8–1.3).
 */
export function layout(cardId) {
  const syms = CARDS[cardId].slice();
  // deterministic shuffle of which symbol goes where
  for (let i = syms.length - 1; i > 0; i--) {
    const j = hash(cardId, i, 1) % (i + 1);
    [syms[i], syms[j]] = [syms[j], syms[i]];
  }
  const ring = 7;
  const off = ((hash(cardId, 2) % 360) * Math.PI) / 180;
  return syms.map((sym, k) => {
    const size = 0.8 + (hash(cardId, k, 3) % 50) / 100; // 0.80..1.29
    const rot = (hash(cardId, k, 4) % 81) - 40; // -40..40 deg
    if (k === 0) return { sym, x: 0.5, y: 0.5, size: size + 0.1, rot };
    const ang = off + ((k - 1) * 2 * Math.PI) / ring + (((hash(cardId, k, 5) % 7) - 3) * Math.PI) / 180;
    const r = 0.325 + ((hash(cardId, k, 6) % 3) - 1) * 0.012;
    return { sym, x: 0.5 + r * Math.cos(ang), y: 0.5 + r * Math.sin(ang), size, rot };
  });
}
