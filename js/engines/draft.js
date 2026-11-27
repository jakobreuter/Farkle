// Snack Draft: a pick-one-pass-the-rest card drafting game. Pure rules, no DOM and no
// randomness of its own (the deck shuffle comes in as `rand`, one int per Fisher–Yates step).
//
// Each round everyone gets a hand. All players secretly pick one card at the same time;
// when everyone has picked, the picks are revealed onto each player's table and the rest
// of every hand is passed (left in odd rounds, right in even ones). When the hands are
// empty the round is scored. Cupcakes and Fortune cookies stay on the table until the end
// of the game and score then.

export const REVEAL_MS = 1500;
export const ROUND_MS = 7500;
export const FINAL_MS = 9000;

/** every card type. `n` = copies in a fresh deck. Bites come in three sizes (1/2/3). */
export const TYPES = {
  popcorn: { name: 'Popcorn', emoji: '🍿', n: 14, short: '3 = 10', rule: 'Every set of 3 scores 10.' },
  pretzel: { name: 'Pretzel', emoji: '🥨', n: 14, short: '2 = 5', rule: 'Every pair scores 5.' },
  taco: { name: 'Taco', emoji: '🌮', n: 14, short: '1·3·5·8·12', rule: '1/2/3/4/5 tacos score 1/3/5/8/12 (+3 per taco after 5).' },
  soda: { name: 'Soda', emoji: '🥤', n: 13, short: 'most: 6', rule: 'Most sodas this round: 6. Second most: 3. Ties split the prize (rounded down); a tie for most means no second prize.' },
  bites: { name: 'Bites', emoji: '🍔', n: 16, short: '1–3 pts', rule: 'Corn dog 🌭 1, Burger 🍔 2, Pizza 🍕 3 points.' },
  hotsauce: { name: 'Hot Sauce', emoji: '🌶️', n: 7, short: 'bite ×3', rule: 'The next Bite you take scores triple. Unused sauce scores 0.' },
  donut: { name: 'Donut', emoji: '🍩', n: 10, short: '+1/kind', rule: '1 point for each different kind of card on your table this round (itself included).' },
  broccoli: { name: 'Broccoli', emoji: '🥦', n: 11, short: '3+ = +4 ea', rule: '−2 each… but with 3 or more, every broccoli scores +4 instead!' },
  pickle: { name: 'Pickle', emoji: '🥒', n: 10, short: 'lone = 5', rule: 'Exactly one pickle scores 5. Two or more score just 1 each.' },
  leftovers: { name: 'Leftovers', emoji: '🥡', n: 8, short: 'copy last', rule: 'Becomes a copy of the card you took just before it this round (nothing if it is your first).' },
  cupcake: { name: 'Cupcake', emoji: '🧁', n: 12, short: 'end: most', rule: 'Kept until the end. Most cupcakes: +8. Fewest: −4 (not with 2 players). Ties share.' },
  fortune: { name: 'Fortune Cookie', card: 'Fortune', emoji: '🥠', n: 11, short: 'end: set', rule: 'Kept until the end. 1/2/3/4/5 cookies score 2/5/9/14/20 (+6 per cookie after 5).' },
};
export const TYPE_IDS = Object.keys(TYPES);
export const BITES = { bite1: { name: 'Corn Dog', emoji: '🌭', v: 1, n: 5 }, bite2: { name: 'Burger', emoji: '🍔', v: 2, n: 7 }, bite3: { name: 'Pizza', emoji: '🍕', v: 3, n: 4 } };
export const CLASSIC = ['popcorn', 'pretzel', 'taco', 'soda', 'bites', 'hotsauce', 'donut', 'cupcake'];
export const END_TYPES = ['cupcake', 'fortune'];
export const MENU_SIZE = 8;

export const handSize = (n) => ({ 2: 10, 3: 9, 4: 8, 5: 7 }[n] ?? 7);
/** card key -> type id ('bite2' -> 'bites') */
export const typeOf = (k) => (k in BITES ? 'bites' : k);
export const cardName = (k) => (BITES[k] ? BITES[k].name : TYPES[k]?.name ?? k);
/** shorter name for the face of a card */
export const cardLabel = (k) => TYPES[k]?.card ?? cardName(k);
export const cardEmoji = (k) => (BITES[k] ? BITES[k].emoji : TYPES[k]?.emoji ?? '?');

/**
 * Choose a random menu of MENU_SIZE types from TYPE_IDS using the given ints
 * (rand[i] in [0, TYPE_IDS.length - i)). Hot Sauce is only useful with Bites, and at least
 * one end-of-game type is always on the menu.
 */
export function pickMenu(rand) {
  const pool = [...TYPE_IDS];
  const out = [];
  for (let i = 0; i < MENU_SIZE; i++) out.push(pool.splice(rand[i] % pool.length, 1)[0]);
  if (out.includes('hotsauce') && !out.includes('bites')) out[out.indexOf('hotsauce')] = 'bites';
  if (!out.some((t) => END_TYPES.includes(t))) {
    // replace the last non-essential type with an end type (cupcake unless fortune fits better)
    const j = out.findLastIndex((t) => t !== 'bites' && t !== 'hotsauce');
    out[j] = rand[0] % 2 ? 'fortune' : 'cupcake';
  }
  return TYPE_IDS.filter((t) => out.includes(t)); // stable display order
}
export const MENU_RANGES = Array.from({ length: MENU_SIZE }, (_, i) => TYPE_IDS.length - i);

/** a fresh, unshuffled deck for this menu (card keys) */
export function buildDeck(menu) {
  const deck = [];
  for (const t of menu) {
    if (t === 'bites') for (const [k, b] of Object.entries(BITES)) for (let i = 0; i < b.n; i++) deck.push(k);
    else for (let i = 0; i < TYPES[t].n; i++) deck.push(t);
  }
  return deck;
}
/** ints needed to shuffle a deck of n cards */
export const shuffleRanges = (n) => Array.from({ length: n - 1 }, (_, i) => n - i);
export function shuffle(deck, rand) {
  const d = [...deck];
  for (let i = 0; i < d.length - 1; i++) {
    const j = i + (rand[i] % (d.length - i));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function newGame(players, { menu, rounds = 3, now = 0 } = {}) {
  return {
    players: players.map((p) => ({ pid: p.pid, name: p.name, hand: [], pick: null, table: [], keep: [], rounds: [], total: 0 })),
    menu: menu ? [...menu] : null, // null = to be drawn at random by the first system action
    rounds: rounds === 2 ? 2 : 3,
    round: 0,
    hand: handSize(players.length),
    phase: menu ? 'deal' : 'menu', // menu | deal | pick | reveal | scored | over
    pickNo: 0, // picks made this round
    reveal: null, // { no, round, cards: [cardEntry per seat] }
    revealNo: 0,
    until: 0,
    summary: null, // last round's breakdown (see scoreRound)
    final: null, // end-game bonuses per seat
    startedAt: now,
  };
}

/** direction of passing: +1 = to the next seat ("left"), -1 = previous seat */
export const passDir = (round) => (round % 2 === 0 ? -1 : 1);

/**
 * Put card key k onto a table (array of entries {k, x?, used?, lo?}); returns the NEW table.
 * Leftovers copy the previous card; a Bite uses the oldest unused Hot Sauce.
 */
export function place(table, k) {
  const t = table.map((e) => ({ ...e }));
  let key = k;
  let lo = false;
  if (k === 'leftovers') {
    lo = true;
    const prev = t[t.length - 1];
    if (!prev || prev.dud) { t.push({ k: 'leftovers', dud: true }); return t; }
    key = prev.k;
  }
  const e = { k: key };
  if (lo) e.lo = true;
  if (key in BITES) {
    const s = t.find((x) => x.k === 'hotsauce' && !x.used);
    if (s) { s.used = true; e.x = 3; }
  }
  t.push(e);
  return t;
}

const count = (table, type) => table.filter((e) => !e.dud && typeOf(e.k) === type).length;
const ladder = (steps, extra) => (n) => (n <= 0 ? 0 : n < steps.length ? steps[n] : steps[steps.length - 1] + (n - steps.length + 1) * extra);
const tacoPts = ladder([0, 1, 3, 5, 8, 12], 3);
const fortunePts = ladder([0, 2, 5, 9, 14, 20], 6);

/** split `pts` among the seats in `who` (rounded down) */
function award(out, who, pts, type) {
  if (!who.length) return;
  const each = Math.floor(pts / who.length);
  for (const i of who) out[i][type] = (out[i][type] || 0) + each;
}

/** majority helper: [{most seats}, {second seats}] among counts > 0 */
function ranks(counts) {
  const vals = [...new Set(counts.filter((c) => c > 0))].sort((a, b) => b - a);
  const at = (v) => (v == null ? [] : counts.map((c, i) => (c === v ? i : -1)).filter((i) => i >= 0));
  return [at(vals[0]), at(vals[1])];
}

/** round scores for a list of tables -> [{ type: pts, ... }] per seat (end-game types excluded) */
export function scoreTables(tables) {
  const out = tables.map(() => ({}));
  tables.forEach((t, i) => {
    const o = out[i];
    const c = (type) => count(t, type);
    if (c('popcorn')) o.popcorn = Math.floor(c('popcorn') / 3) * 10;
    if (c('pretzel')) o.pretzel = Math.floor(c('pretzel') / 2) * 5;
    if (c('taco')) o.taco = tacoPts(c('taco'));
    if (c('bites')) o.bites = t.filter((e) => e.k in BITES).reduce((a, e) => a + BITES[e.k].v * (e.x || 1), 0);
    if (c('hotsauce')) o.hotsauce = 0;
    if (c('donut')) {
      const kinds = new Set(t.filter((e) => !e.dud).map((e) => typeOf(e.k))).size;
      o.donut = c('donut') * kinds;
    }
    if (c('broccoli')) o.broccoli = c('broccoli') >= 3 ? 4 * c('broccoli') : -2 * c('broccoli');
    if (c('pickle')) o.pickle = c('pickle') === 1 ? 5 : c('pickle');
    if (t.some((e) => e.dud)) o.leftovers = 0;
  });
  const sodas = tables.map((t) => count(t, 'soda'));
  if (sodas.some((x) => x > 0)) {
    const [most, second] = ranks(sodas);
    tables.forEach((t, i) => { if (sodas[i]) out[i].soda = 0; });
    award(out, most, 6, 'soda');
    if (most.length === 1) award(out, second, 3, 'soda'); // a tie for most uses up both prizes
  }
  return out;
}

/** end-of-game scores from each seat's kept cards -> [{ cupcake?, fortune? }] */
export function scoreEnd(keeps, menu) {
  const out = keeps.map(() => ({}));
  if (menu.includes('fortune')) keeps.forEach((k, i) => { const n = count(k, 'fortune'); if (n) out[i].fortune = fortunePts(n); });
  if (menu.includes('cupcake')) {
    const cups = keeps.map((k) => count(k, 'cupcake'));
    const hi = Math.max(...cups);
    const lo = Math.min(...cups);
    if (hi > 0) {
      award(out, cups.map((c, i) => (c === hi ? i : -1)).filter((i) => i >= 0), 8, 'cupcake');
      if (keeps.length > 2 && lo < hi) {
        const who = cups.map((c, i) => (c === lo ? i : -1)).filter((i) => i >= 0);
        if (who.length) {
          const each = -Math.floor(4 / who.length);
          for (const i of who) out[i].cupcake = (out[i].cupcake || 0) + each;
        }
      }
      cups.forEach((c, i) => { if (c && out[i].cupcake == null) out[i].cupcake = 0; });
    }
  }
  return out;
}

export const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

function dealRound(s, rand) {
  const deck = shuffle(buildDeck(s.menu), rand);
  s.round += 1;
  s.pickNo = 0;
  s.players.forEach((p, i) => {
    p.hand = deck.slice(i * s.hand, (i + 1) * s.hand);
    p.table = [];
    p.pick = null;
  });
  s.phase = 'pick';
  s.reveal = null;
  s.summary = null;
}

function finishRound(s, now) {
  const scores = scoreTables(s.players.map((p) => p.table));
  s.players.forEach((p, i) => {
    p.keep = [...p.keep, ...p.table.filter((e) => END_TYPES.includes(e.k))];
    const pts = sum(scores[i]);
    p.rounds = [...p.rounds, pts];
    p.total += pts;
  });
  s.summary = { round: s.round, by: scores, tables: s.players.map((p) => p.table) };
  if (s.round >= s.rounds) {
    const fin = scoreEnd(s.players.map((p) => p.keep), s.menu);
    s.players.forEach((p, i) => { p.total += sum(fin[i]); });
    s.final = fin;
    s.until = now + FINAL_MS;
  } else s.until = now + ROUND_MS;
  s.phase = 'scored';
}

/** players still to pick (seats) */
export const waitingFor = (s) => (s.phase === 'pick' ? s.players.map((p, i) => (p.pick == null ? i : -1)).filter((i) => i >= 0) : []);

/** winners (seats) by total; ties broken by most cupcakes, else shared */
export function winners(s) {
  const best = Math.max(...s.players.map((p) => p.total));
  let w = s.players.map((p, i) => (p.total === best ? i : -1)).filter((i) => i >= 0);
  if (w.length > 1) {
    const cups = w.map((i) => count(s.players[i].keep, 'cupcake'));
    const m = Math.max(...cups);
    w = w.filter((_, j) => cups[j] === m);
  }
  return w;
}

/**
 * actions:
 *  { type: 'menu' }            seat -1, phase menu (rand: MENU_RANGES)
 *  { type: 'deal' }            seat -1, phase deal (rand: shuffle ints)
 *  { type: 'pick', i, k }      any seat that hasn't picked; k must match hand[i]
 *  { type: 'pass' }            seat -1, phase reveal (after REVEAL_MS)
 *  { type: 'next' }            seat -1, phase scored (after the summary)
 */
export function applyAction(state, a, seat, { now = 0, rand = null } = {}) {
  const s = structuredClone(state);
  if (!a || typeof a !== 'object') throw new Error('bad action');
  const sys = seat === -1;
  switch (a.type) {
    case 'menu': {
      if (!sys) throw new Error('system only');
      if (s.phase !== 'menu') throw new Error('menu already chosen');
      if (!Array.isArray(rand) || rand.length < MENU_SIZE) throw new Error('need menu ints');
      s.menu = pickMenu(rand);
      s.phase = 'deal';
      return s;
    }
    case 'deal': {
      if (!sys) throw new Error('system only');
      if (s.phase !== 'deal') throw new Error('not dealing');
      const need = buildDeck(s.menu).length - 1;
      if (!Array.isArray(rand) || rand.length < need) throw new Error('need shuffle');
      dealRound(s, rand);
      return s;
    }
    case 'pick': {
      if (sys) throw new Error('player only');
      if (s.phase !== 'pick') throw new Error('not picking now');
      const p = s.players[seat];
      if (!p) throw new Error('not a player');
      if (p.pick != null) throw new Error('already picked');
      const i = a.i;
      if (!Number.isInteger(i) || i < 0 || i >= p.hand.length) throw new Error('no such card');
      if (a.k != null && p.hand[i] !== a.k) throw new Error('hand changed');
      p.pick = i;
      if (s.players.every((x) => x.pick != null)) {
        // everyone has picked: reveal
        const cards = [];
        s.players.forEach((x) => {
          const k = x.hand[x.pick];
          x.hand = x.hand.filter((_, j) => j !== x.pick);
          x.table = place(x.table, k);
          cards.push({ k, e: x.table[x.table.length - 1] });
          x.pick = null;
        });
        s.pickNo += 1;
        s.revealNo += 1;
        s.reveal = { no: s.revealNo, round: s.round, cards };
        s.phase = 'reveal';
        s.until = now + REVEAL_MS;
      }
      return s;
    }
    case 'pass': {
      if (!sys) throw new Error('system only');
      if (s.phase !== 'reveal') throw new Error('nothing to pass');
      if (s.players[0].hand.length === 0) { finishRound(s, now); return s; }
      const n = s.players.length;
      const d = passDir(s.round);
      const hands = s.players.map((p) => p.hand);
      s.players.forEach((p, i) => { p.hand = hands[(i - d + n) % n]; });
      s.phase = 'pick';
      return s;
    }
    case 'next': {
      if (!sys) throw new Error('system only');
      if (s.phase !== 'scored') throw new Error('not between rounds');
      s.phase = s.round >= s.rounds ? 'over' : 'deal';
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

export function tick(s, now) {
  if (s.phase === 'menu') return { type: 'menu' };
  if (s.phase === 'deal') return { type: 'deal' };
  if (s.phase === 'reveal' && now >= s.until) return { type: 'pass' };
  if (s.phase === 'scored' && now >= s.until) return { type: 'next' };
  return null;
}

// ---------------- bot ----------------

/** a little extra for unfinished sets, scaled by how many picks are left this round */
function potential(k, table, left, menu, s, seat) {
  const type = typeOf(k);
  const f = (need) => Math.min(1, left / need);
  const n = count(table, type) + 1; // after taking it
  switch (type) {
    case 'popcorn': return n % 3 === 1 ? 2.5 * f(5) : n % 3 === 2 ? 5 * f(3) : 0;
    case 'pretzel': return n % 2 === 1 ? 2.8 * f(3) : 0;
    case 'taco': return 1.2 * f(3);
    case 'soda': return 1.2 * f(3);
    case 'donut': return 0.8 * f(3);
    case 'hotsauce': return table.some((e) => e.k === 'hotsauce' && !e.used) ? 0.3 : 4.5 * f(3);
    case 'broccoli': return n === 1 ? 3.5 * f(6) : n === 2 ? 9 * f(3) : 0;
    case 'leftovers': {
      const prev = table[table.length - 1];
      return prev && !prev.dud ? potential(prev.k, table, left, menu, s, seat) : 0;
    }
    case 'cupcake': case 'fortune': {
      // end-of-game value: actual change in end scores, faded in as the game progresses
      const keeps = s.players.map((p, i) => [...p.keep, ...p.table.filter((e) => END_TYPES.includes(e.k)), ...(i === seat ? [{ k }] : [])]);
      const base = s.players.map((p) => [...p.keep, ...p.table.filter((e) => END_TYPES.includes(e.k))]);
      const gain = sum(scoreEnd(keeps, menu)[seat]) - sum(scoreEnd(base, menu)[seat]);
      const w = s.round / s.rounds;
      const guess = type === 'cupcake' ? 3.2 : 3.4;
      return gain * w + guess * (1 - w);
    }
    default: return 0;
  }
}

/** how much card k is worth to `seat` right now (immediate change + potential) */
export function cardValue(s, seat, k, left) {
  const tables = s.players.map((p) => p.table);
  const before = scoreTables(tables)[seat];
  const placed = place(tables[seat], k);
  const after = scoreTables(tables.map((t, i) => (i === seat ? placed : t)))[seat];
  return sum(after) - sum(before) + potential(k, tables[seat], left, s.menu, s, seat);
}

/** greedy pick with a peek at what the next player would get from the cards we pass on */
export function botPick(s, seat) {
  const p = s.players[seat];
  if (s.phase !== 'pick' || !p || p.pick != null || !p.hand.length) return null;
  const n = s.players.length;
  const nextSeat = (seat + passDir(s.round) + n) % n;
  const left = p.hand.length - 1;
  let best = null;
  const seen = new Set();
  p.hand.forEach((k, i) => {
    if (seen.has(k)) return;
    seen.add(k);
    let v = cardValue(s, seat, k, left);
    if (nextSeat !== seat && left > 0) v += 0.3 * Math.max(0, cardValue(s, nextSeat, k, left - 1));
    v += ((i * 7 + seat * 3 + s.pickNo) % 5) * 0.01; // tiny deterministic tie-break
    if (!best || v > best.v) best = { i, k, v };
  });
  return { type: 'pick', i: best.i, k: best.k };
}

/** ints the host must supply for action a (or null) */
export function randomNeeds(s, a, seat) {
  if (seat !== -1 || !a) return null;
  if (a.type === 'menu' && s.phase === 'menu') return MENU_RANGES;
  if (a.type === 'deal' && s.phase === 'deal') return shuffleRanges(buildDeck(s.menu).length);
  return null;
}
