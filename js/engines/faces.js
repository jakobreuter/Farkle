// Secret Face — an original two-player deduction game.
// Each player is secretly dealt one of 24 characters. On your turn either ask one
// yes/no question about the other player's character, or make a guess. A right
// guess wins; a wrong guess loses. Flip faces down on your own board to keep track.
// Questions are asked out loud (mode 'loud', then End turn) or picked from a list
// and answered by the app (mode 'list').

const F = (name, hair, style, eyes, flags, skin) => ({ name, hair, style, eyes, skin, flags });
// hair: black | brown | blond | red | gray | none · style: short | long | curly | bun | none
// flags: g glasses, h hat, b beard, m mustache, e earrings, f freckles, s smiling, t tie
export const CLASSIC = [
  F('Ava', 'brown', 'long', 'blue', 'es', 0),
  F('Ben', 'black', 'short', 'brown', 'gb', 2),
  F('Cleo', 'red', 'curly', 'green', 'fse', 0),
  F('Dev', 'black', 'short', 'brown', 'mh', 3),
  F('Eli', 'blond', 'short', 'blue', 'gs', 1),
  F('Faye', 'gray', 'bun', 'brown', 'ges', 1),
  F('Gus', 'none', 'none', 'brown', 'bmg', 2),
  F('Hana', 'black', 'long', 'brown', 'hs', 1),
  F('Ivan', 'brown', 'short', 'green', 'b', 0),
  F('Jade', 'blond', 'long', 'green', 'ef', 0),
  F('Kai', 'brown', 'curly', 'brown', 's', 3),
  F('Lena', 'red', 'long', 'blue', 'gs', 0),
  F('Milo', 'blond', 'curly', 'blue', 'hf', 1),
  F('Nora', 'black', 'bun', 'green', 'e', 2),
  F('Omar', 'black', 'short', 'brown', 'bms', 3),
  F('Pia', 'brown', 'bun', 'blue', 'f', 1),
  F('Quinn', 'gray', 'short', 'blue', 'hg', 0),
  F('Rosa', 'black', 'curly', 'brown', 'esg', 3),
  F('Theo', 'red', 'short', 'brown', 'mf', 0),
  F('Uma', 'blond', 'bun', 'brown', 'sh', 2),
  F('Vic', 'none', 'none', 'blue', 's', 1),
  F('Wes', 'brown', 'short', 'blue', 'hb', 2),
  F('Yuki', 'black', 'long', 'green', 'g', 1),
  F('Zane', 'gray', 'short', 'green', 'bms', 3),
];

// Well-known people, drawn as friendly cartoons with their signature look.
export const FAMOUS = [
  F('Donald Trump', 'blond', 'short', 'blue', 't', 0),
  F('Barack Obama', 'black', 'short', 'brown', 'st', 2),
  F('Joe Biden', 'gray', 'short', 'blue', 'gst', 0),
  F('Taylor Swift', 'blond', 'long', 'blue', 's', 0),
  F('Elon Musk', 'brown', 'short', 'green', '', 0),
  F('Oprah Winfrey', 'black', 'long', 'brown', 'es', 2),
  F('Albert Einstein', 'gray', 'curly', 'brown', 'm', 0),
  F('Abraham Lincoln', 'black', 'short', 'brown', 'bh', 0),
  F('Marilyn Monroe', 'blond', 'short', 'blue', 'es', 0),
  F('Michael Jordan', 'none', 'none', 'brown', 's', 3),
  F('Beyoncé', 'blond', 'long', 'brown', 'es', 2),
  F('Lionel Messi', 'brown', 'short', 'brown', 'b', 0),
  F('Serena Williams', 'black', 'bun', 'brown', 'e', 3),
  F('Bill Gates', 'brown', 'short', 'blue', 'gs', 0),
  F('Queen Elizabeth', 'gray', 'curly', 'blue', 'hes', 0),
  F('Dolly Parton', 'blond', 'curly', 'blue', 'es', 0),
  F('Elvis Presley', 'black', 'short', 'blue', '', 0),
  F('Shakespeare', 'none', 'none', 'brown', 'bme', 0),
  F('Frida Kahlo', 'black', 'bun', 'brown', 'eh', 1),
  F('MLK Jr.', 'black', 'short', 'brown', 'mt', 3),
  F('Gandhi', 'none', 'none', 'brown', 'gs', 2),
  F('Keanu Reeves', 'black', 'long', 'brown', 'b', 1),
  F('Lady Gaga', 'blond', 'bun', 'blue', 'eg', 0),
  F('Mister Rogers', 'gray', 'short', 'brown', 'st', 0),
];

export const DECKS = { classic: CLASSIC, famous: FAMOUS };
export const CHARACTERS = CLASSIC; // default deck
export const N = 24;
export const deckOf = (s) => DECKS[s.deck] || CLASSIC;

const has = (c, f) => c.flags.includes(f);
export const QUESTIONS = [
  { id: 'glasses', text: 'Do they wear glasses?', test: (c) => has(c, 'g') },
  { id: 'hat', text: 'Are they wearing a hat?', test: (c) => has(c, 'h') },
  { id: 'beard', text: 'Do they have a beard?', test: (c) => has(c, 'b') },
  { id: 'mustache', text: 'Do they have a mustache?', test: (c) => has(c, 'm') },
  { id: 'earrings', text: 'Are they wearing earrings?', test: (c) => has(c, 'e') },
  { id: 'freckles', text: 'Do they have freckles?', test: (c) => has(c, 'f') },
  { id: 'smile', text: 'Are they smiling with teeth?', test: (c) => has(c, 's') },
  { id: 'tie', text: 'Are they wearing a tie?', test: (c) => has(c, 't') },
  { id: 'bald', text: 'Are they bald?', test: (c) => c.hair === 'none' },
  { id: 'black', text: 'Do they have black hair?', test: (c) => c.hair === 'black' },
  { id: 'brown', text: 'Do they have brown hair?', test: (c) => c.hair === 'brown' },
  { id: 'blond', text: 'Do they have blond hair?', test: (c) => c.hair === 'blond' },
  { id: 'red', text: 'Do they have red hair?', test: (c) => c.hair === 'red' },
  { id: 'gray', text: 'Do they have gray hair?', test: (c) => c.hair === 'gray' },
  { id: 'long', text: 'Is their hair long?', test: (c) => c.style === 'long' },
  { id: 'curly', text: 'Is their hair curly?', test: (c) => c.style === 'curly' },
  { id: 'bun', text: 'Is their hair in a bun?', test: (c) => c.style === 'bun' },
  { id: 'blueeyes', text: 'Do they have blue eyes?', test: (c) => c.eyes === 'blue' },
  { id: 'greeneyes', text: 'Do they have green eyes?', test: (c) => c.eyes === 'green' },
  { id: 'browneyes', text: 'Do they have brown eyes?', test: (c) => c.eyes === 'brown' },
];
export const Q = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

export function newGame(players, first = 0, { mode = 'loud', deck = 'classic' } = {}) {
  return {
    mode,
    deck: DECKS[deck] ? deck : 'classic',
    players: players.slice(0, 2).map((p) => ({ ...p, secret: null, down: Array(N).fill(false), lastQ: null })),
    current: first,
    phase: 'deal', // deal | play | over
    asks: [], // {seat, q, yes}
    winners: null,
    guess: null, // {seat, index, right}
    event: null,
    log: ['New game of Secret Face.'],
  };
}

const other = (seat) => 1 - seat;
const addLog = (s, m) => { s.log = [...s.log, m].slice(-40); };
export const facesUp = (p) => p.down.filter((d) => !d).length;

export function applyAction(state, a, seat, rand) {
  const s = structuredClone(state);
  s.event = null;
  switch (a.type) {
    case 'deal': {
      if (s.phase !== 'deal' || seat !== -1) throw new Error('not now');
      s.players.forEach((p, i) => { p.secret = rand[i]; });
      s.phase = 'play';
      return s;
    }
    case 'ask': {
      if (s.phase !== 'play' || seat !== s.current) throw new Error('not your turn');
      if (s.mode === 'loud') throw new Error('ask out loud, then end your turn');
      const q = Q[a.q];
      if (!q) throw new Error('unknown question');
      const yes = q.test(deckOf(s)[s.players[other(seat)].secret]);
      s.asks = [...s.asks, { seat, q: q.id, yes }].slice(-30);
      s.players[seat].lastQ = { q: q.id, yes };
      addLog(s, `${s.players[seat].name}: “${q.text}” — ${yes ? 'Yes' : 'No'}.`);
      s.event = { kind: 'ask', seat, q: q.id, yes };
      s.current = other(seat);
      return s;
    }
    case 'pass': {
      // asked out loud — hand the turn over
      if (s.phase !== 'play' || seat !== s.current || s.mode !== 'loud') throw new Error('not now');
      s.turns = (s.turns || 0) + 1;
      s.event = { kind: 'pass', seat };
      s.current = other(seat);
      return s;
    }
    case 'flip': {
      if (s.phase !== 'play' || seat < 0) throw new Error('not now');
      const i = Number(a.index);
      if (!(i >= 0 && i < N)) throw new Error('bad face');
      s.players[seat].down[i] = !s.players[seat].down[i];
      return s;
    }
    case 'autoflip': {
      // flip down every face that doesn't match my last answer
      if (s.phase !== 'play' || seat < 0) throw new Error('not now');
      const p = s.players[seat];
      if (!p.lastQ) throw new Error('ask a question first');
      const q = Q[p.lastQ.q];
      deckOf(s).forEach((c, i) => { if (q.test(c) !== p.lastQ.yes) p.down[i] = true; });
      return s;
    }
    case 'guess': {
      if (s.phase !== 'play' || seat !== s.current) throw new Error('not your turn');
      const i = Number(a.index);
      if (!(i >= 0 && i < N)) throw new Error('bad face');
      const right = s.players[other(seat)].secret === i;
      s.guess = { seat, index: i, right };
      s.phase = 'over';
      s.winners = [right ? seat : other(seat)];
      s.event = { kind: 'guess', seat, index: i, right };
      const D = deckOf(s);
      addLog(s, `${s.players[seat].name} guessed ${D[i].name} — ${right ? 'correct!' : `wrong, it was ${D[s.players[other(seat)].secret].name}.`}`);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}
