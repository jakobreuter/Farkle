// Monster Rumble — an original dice-battle game for 2–6 players.
//
// Every monster starts with 10 ❤️ health (max 12), 0 ⭐ stars and 0 ⚡ energy.
// One spot on the board, Thunder Peak, can hold one monster.
//
// Turn: roll 6 dice (faces 1, 2, 3, ⚡, ❤️, 👊). Keep any dice and reroll the
// rest, up to 2 rerolls. Then the dice resolve:
//   • three of a kind of a number = that many ⭐ (+1 ⭐ per extra matching die)
//   • each ⚡ = 1 energy
//   • each ❤️ heals 1 — but not while you're on the Peak
//   • each 👊 deals 1 damage: from the Peak you hit every other monster; off
//     the Peak you hit whoever is on it, and they may then flee (you take it)
//   • if the Peak is empty after that, you climb it
// Taking the Peak = +1 ⭐. Starting your turn on the Peak = +2 ⭐.
// Then (power cards on) buy cards from a 3-card market with ⚡, or pay 2 ⚡ to
// sweep it. First to the star goal, or the last monster standing, wins.
//
// Randomness: dice faces and market draws only, all through rand[] (ints the
// host supplies). drawRanges() says exactly how many draws an action needs.

export const FACES = ['1', '2', '3', 'E', 'H', 'A']; // index = die value 0..5
export const FACE_ICON = ['1', '2', '3', '⚡', '❤️', '👊'];
export const ONE = 0, TWO = 1, THREE = 2, EN = 3, HEART = 4, CLAW = 5;
export const START_HP = 10;
export const BASE_MAX_HP = 12;
export const BASE_DICE = 6;
export const BASE_REROLLS = 2;
export const SWEEP_COST = 2;
export const AUTO_MS = 2400; // after the last roll, the dice resolve on their own
export const FLEE_MS = 15000; // time to decide flee/stay before staying is assumed
export const PEAK = 'Thunder Peak';

export const MONSTERS = [
  { emoji: '🦖', name: 'Chompo' },
  { emoji: '🐙', name: 'Inkwell' },
  { emoji: '🦍', name: 'Bongo' },
  { emoji: '🐲', name: 'Sizzle' },
  { emoji: '👾', name: 'Glorp' },
  { emoji: '🤖', name: 'Bolt-9' },
];

// kind: 'keep' = permanent power, 'now' = one-time snack (used up at once)
export const CARDS = {
  arm: { name: 'Extra Arm', icon: '🦾', cost: 5, kind: 'keep', text: 'Roll 1 extra die every turn.' },
  scales: { name: 'Plated Scales', icon: '🛡️', cost: 6, kind: 'keep', text: 'Take 1 less damage from every attack.' },
  fists: { name: 'Spiked Knuckles', icon: '🥊', cost: 5, kind: 'keep', text: 'Your 👊 attacks deal +1 damage.' },
  belly: { name: 'Bottomless Belly', icon: '🍖', cost: 3, kind: 'keep', text: 'When your ❤️ heal you, heal 1 more.' },
  battery: { name: 'Static Fur', icon: '🔋', cost: 3, kind: 'keep', text: 'Roll any ⚡? Gain 1 more ⚡.' },
  leech: { name: 'Zap Leech', icon: '🪱', cost: 4, kind: 'keep', text: 'Steal 1 ⚡ from each monster your 👊 damage.' },
  hoard: { name: 'Shiny Hoard', icon: '💎', cost: 4, kind: 'keep', text: 'Score ⭐ from numbers? Gain 1 more ⭐.' },
  tail: { name: 'Lucky Tail', icon: '🍀', cost: 4, kind: 'keep', text: 'One more reroll every turn.' },
  heart: { name: 'Giant Heart', icon: '💗', cost: 4, kind: 'keep', text: 'Max health +2. Heal 2 right away.' },
  throne: { name: 'Peak Throne', icon: '👑', cost: 3, kind: 'keep', text: 'Start your turn on the Peak: +1 more ⭐.' },
  smoke: { name: 'Smoke Bomb', icon: '💨', cost: 3, kind: 'keep', text: 'When you flee the Peak, heal 2.' },
  fry: { name: 'Small Fry', icon: '🐟', cost: 3, kind: 'keep', text: 'Three 1s score 2 more ⭐.' },
  haggle: { name: 'Haggler', icon: '🏷️', cost: 3, kind: 'keep', text: 'Power cards cost you 1 ⚡ less.' },
  sun: { name: 'Sunbather', icon: '☀️', cost: 2, kind: 'keep', text: 'End your turn with 0 ⚡? Gain 1 ⚡.' },
  moss: { name: 'Moss Skin', icon: '🌿', cost: 4, kind: 'keep', text: 'Start your turn off the Peak: heal 1.' },
  trumpet: { name: 'Grand Entrance', icon: '🎺', cost: 3, kind: 'keep', text: 'Take the Peak: +1 more ⭐ and +1 ⚡.' },
  berserk: { name: 'Berserk', icon: '😤', cost: 3, kind: 'keep', text: 'Roll three or more 👊? Gain 1 ⭐.' },
  spring: { name: 'Hot Spring', icon: '♨️', cost: 4, kind: 'keep', text: 'Your ❤️ heal you even on the Peak.' },
  piggy: { name: 'Piggy Bank', icon: '🐷', cost: 4, kind: 'keep', text: 'End your turn with 6+ ⚡? Gain 1 ⭐.' },
  gasp: { name: 'Last Gasp', icon: '🫀', cost: 5, kind: 'keep', text: 'Once: when knocked out, stay in with 2 ❤️. Then discard.' },
  crowd: { name: 'Hype Crowd', icon: '📣', cost: 3, kind: 'keep', text: 'Deal 3+ 👊 damage in one roll? Gain 1 ⭐.' },
  picnic: { name: 'Picnic Basket', icon: '🧺', cost: 3, kind: 'now', text: 'Heal 3.' },
  feast: { name: 'Monster Feast', icon: '🍗', cost: 5, kind: 'now', text: 'Heal 5.' },
  tower: { name: 'Smash a Tower', icon: '🏢', cost: 4, kind: 'now', text: 'Gain 2 ⭐.' },
  castle: { name: 'Topple a Castle', icon: '🏰', cost: 6, kind: 'now', text: 'Gain 3 ⭐.' },
  moon: { name: 'Bite the Moon', icon: '🌙', cost: 8, kind: 'now', text: 'Gain 4 ⭐.' },
  storm: { name: 'Lightning Storm', icon: '🌩️', cost: 5, kind: 'now', text: 'Deal 2 damage to every other monster.' },
  meteor: { name: 'Meteor', icon: '☄️', cost: 4, kind: 'now', text: 'Deal 3 damage to the monster on the Peak (not you).' },
  fireworks: { name: 'Fireworks', icon: '🎆', cost: 3, kind: 'now', text: 'Gain 1 ⭐. Every other monster loses 1 ⭐.' },
  pickpocket: { name: 'Pickpocket', icon: '🧤', cost: 2, kind: 'now', text: 'Take 1 ⚡ from every other monster.' },
  shove: { name: 'Shoulder Shove', icon: '🤼', cost: 4, kind: 'now', text: 'Push the Peak monster off and climb it yourself.' },
  shower: { name: 'Star Shower', icon: '🌠', cost: 3, kind: 'now', text: 'Gain 1 ⭐ and heal 2.' },
};
export const CARD_IDS = Object.keys(CARDS);

// ---------- helpers ----------

export const has = (p, id) => p.cards.includes(id);
export const maxHp = (p) => BASE_MAX_HP + (has(p, 'heart') ? 2 : 0);
export const diceCount = (p) => BASE_DICE + (has(p, 'arm') ? 1 : 0);
export const rerolls = (p) => BASE_REROLLS + (has(p, 'tail') ? 1 : 0);
export const costFor = (p, id) => Math.max(0, CARDS[id].cost - (has(p, 'haggle') ? 1 : 0));
export const aliveSeats = (s) => s.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);

function addLog(s, msg) { s.log = [...s.log, msg].slice(-40); }
const nm = (s, i) => s.players[i].name;

export function counts(dice) {
  const c = [0, 0, 0, 0, 0, 0];
  for (const f of dice) c[f]++;
  return c;
}

/** What the current dice would give if resolved now (for the view and the bot). */
export function preview(s) {
  const p = s.players[s.current];
  const c = counts(s.dice);
  let stars = 0;
  for (let f = ONE; f <= THREE; f++) {
    if (c[f] >= 3) stars += f + 1 + (c[f] - 3) + (f === ONE && has(p, 'fry') ? 2 : 0);
  }
  if (stars > 0 && has(p, 'hoard')) stars++;
  if (c[CLAW] >= 3 && has(p, 'berserk')) stars++;
  const energy = c[EN] + (c[EN] > 0 && has(p, 'battery') ? 1 : 0);
  const canHeal = s.peak !== s.current || has(p, 'spring');
  const heal = canHeal && c[HEART] > 0 ? Math.min(c[HEART] + (has(p, 'belly') ? 1 : 0), maxHp(p) - p.hp) : 0;
  const dmg = c[CLAW] > 0 ? c[CLAW] + (has(p, 'fists') ? 1 : 0) : 0;
  const targets = dmg ? (s.peak === s.current ? aliveSeats(s).filter((i) => i !== s.current) : s.peak != null ? [s.peak] : []) : [];
  return { stars, energy, heal, dmg, targets, c };
}

/** Number of draws (and their ranges) an action needs from the market pool. */
export function drawRanges(s, a, seat) {
  if (!s.cardsOn || s.phase === 'over') return null;
  const n = s.pool.length;
  const seq = (k) => Array.from({ length: Math.min(k, n) }, (_, i) => n - i);
  if (a.type === 'deal') return seat === -1 && s.needDeal ? seq(s.market.filter((x) => x == null).length) : null;
  if (seat !== s.current || s.phase !== 'buy') return null;
  if (a.type === 'buy') {
    const id = s.market[Number(a.slot)];
    const p = s.players[seat];
    return id && costFor(p, id) <= p.energy ? seq(1) : null;
  }
  if (a.type === 'sweep') return s.players[seat].energy >= SWEEP_COST ? seq(3) : null;
  return null;
}

// ---------- setup ----------

export function newGame(players, { target = 20, cards = true, first = 0 } = {}) {
  const s = {
    players: players.map((p, i) => ({
      pid: p.pid, name: p.name, mon: i % MONSTERS.length,
      hp: START_HP, stars: 0, energy: 0, cards: [], alive: true,
    })),
    target: target === 15 ? 15 : 20,
    cardsOn: !!cards,
    current: first,
    peak: null,
    phase: 'roll', // roll | flee | buy | over
    dice: [],
    keep: [],
    rollsLeft: 0,
    rolled: false,
    rollNo: 0,
    lastRoll: null,
    autoAt: null,
    fleeSeat: null,
    fleeAt: null,
    market: [null, null, null],
    pool: cards ? [...CARD_IDS] : [],
    needDeal: !!cards,
    swept: 0,
    fx: [],
    fxNo: 0,
    turnNo: 1,
    winners: null,
    log: ['The monsters arrive! Nobody holds Thunder Peak yet.'],
  };
  resetDice(s);
  return s;
}

function resetDice(s) {
  const p = s.players[s.current];
  const n = diceCount(p);
  s.dice = Array.from({ length: n }, (_, i) => i % 6);
  s.keep = Array(n).fill(false);
  s.rollsLeft = 1 + rerolls(p);
  s.rolled = false;
  s.autoAt = null;
  s.swept = 0;
}

// ---------- effects ----------

function gain(s, seat, k, n, fx) {
  if (!n) return;
  const p = s.players[seat];
  if (k === 'stars') { const v = Math.max(0, p.stars + n); n = v - p.stars; p.stars = v; }
  if (k === 'energy') { const v = Math.max(0, p.energy + n); n = v - p.energy; p.energy = v; }
  if (k === 'hp') { const v = Math.min(maxHp(p), p.hp + n); n = v - p.hp; p.hp = v; }
  if (n) fx.push({ t: k, seat, n });
}

/** Deal damage (armour applies). Returns damage actually taken. */
function hurt(s, seat, dmg, fx) {
  const p = s.players[seat];
  if (!p.alive) return 0;
  const d = Math.max(0, dmg - (has(p, 'scales') ? 1 : 0));
  if (!d) return 0;
  p.hp -= d;
  fx.push({ t: 'dmg', seat, n: d });
  if (p.hp <= 0 && has(p, 'gasp')) {
    p.hp = 2;
    p.cards = p.cards.filter((c) => c !== 'gasp');
    s.pool.push('gasp');
    fx.push({ t: 'gasp', seat });
    addLog(s, `${nm(s, seat)} gasps and hangs on with 2 health!`);
  }
  return d;
}

function knockouts(s, fx) {
  s.players.forEach((p, i) => {
    if (!p.alive || p.hp > 0) return;
    p.alive = false;
    p.hp = 0;
    if (s.cardsOn) s.pool.push(...p.cards);
    p.cards = [];
    if (s.peak === i) s.peak = null;
    fx.push({ t: 'ko', seat: i });
    addLog(s, `${nm(s, i)} is knocked out!`);
  });
}

function enterPeak(s, seat, fx) {
  s.peak = seat;
  fx.push({ t: 'peak', seat });
  addLog(s, `${nm(s, seat)} takes ${PEAK}!`);
  gain(s, seat, 'stars', 1, fx);
  if (has(s.players[seat], 'trumpet')) { gain(s, seat, 'stars', 1, fx); gain(s, seat, 'energy', 1, fx); }
}

function checkWin(s) {
  if (s.phase === 'over') return true;
  const alive = aliveSeats(s);
  let winners = null;
  if (alive.length <= 1) winners = alive;
  else {
    const top = alive.filter((i) => s.players[i].stars >= s.target);
    if (top.length) {
      const best = Math.max(...top.map((i) => s.players[i].stars));
      winners = top.filter((i) => s.players[i].stars === best);
    }
  }
  if (!winners) return false;
  s.phase = 'over';
  s.winners = winners;
  s.fleeSeat = null;
  s.autoAt = null;
  addLog(s, winners.length === 1
    ? `${nm(s, winners[0])} wins ${alive.length <= 1 ? 'as the last monster standing' : `with ${s.players[winners[0]].stars} stars`}!`
    : 'It’s a tie!');
  return true;
}

function draw(s, r) {
  if (!s.pool.length) return null;
  const i = Number(r);
  if (!(i >= 0 && i < s.pool.length)) throw new Error('bad draw');
  return s.pool.splice(i, 1)[0];
}

function checkRand(s, a, seat, rand) {
  const need = drawRanges(s, a, seat) || [];
  const got = rand || [];
  if (got.length !== need.length) throw new Error('bad draws');
  got.forEach((v, i) => { if (!(v >= 0 && v < need[i])) throw new Error('bad draw'); });
}

function afterResolve(s, now, fx) {
  if (s.peak == null && s.players[s.current].alive) enterPeak(s, s.current, fx);
  if (checkWin(s)) return;
  if (s.cardsOn) { s.phase = 'buy'; return; }
  endTurn(s, now, fx);
}

function endTurn(s, now, fx) {
  const cur = s.current;
  const p = s.players[cur];
  if (p.alive) {
    if (has(p, 'sun') && p.energy === 0) gain(s, cur, 'energy', 1, fx);
    if (has(p, 'piggy') && p.energy >= 6) gain(s, cur, 'stars', 1, fx);
  }
  if (checkWin(s)) return;
  const n = s.players.length;
  let next = cur;
  for (let k = 1; k <= n; k++) { const c = (cur + k) % n; if (s.players[c].alive) { next = c; break; } }
  s.current = next;
  s.turnNo++;
  s.phase = 'roll';
  s.fleeSeat = null;
  s.fleeAt = null;
  resetDice(s);
  const np = s.players[next];
  if (s.peak === next) {
    gain(s, next, 'stars', 2 + (has(np, 'throne') ? 1 : 0), fx);
    addLog(s, `${np.name} starts the turn on ${PEAK}.`);
  } else if (has(np, 'moss')) gain(s, next, 'hp', 1, fx);
  checkWin(s);
}

function useSnack(s, seat, id, fx) {
  const others = aliveSeats(s).filter((i) => i !== seat);
  switch (id) {
    case 'picnic': gain(s, seat, 'hp', 3, fx); break;
    case 'feast': gain(s, seat, 'hp', 5, fx); break;
    case 'tower': gain(s, seat, 'stars', 2, fx); break;
    case 'castle': gain(s, seat, 'stars', 3, fx); break;
    case 'moon': gain(s, seat, 'stars', 4, fx); break;
    case 'storm': others.forEach((i) => hurt(s, i, 2, fx)); break;
    case 'meteor': if (s.peak != null && s.peak !== seat) hurt(s, s.peak, 3, fx); break;
    case 'fireworks': gain(s, seat, 'stars', 1, fx); others.forEach((i) => gain(s, i, 'stars', -1, fx)); break;
    case 'pickpocket': others.forEach((i) => { if (s.players[i].energy > 0) { gain(s, i, 'energy', -1, fx); gain(s, seat, 'energy', 1, fx); } }); break;
    case 'shower': gain(s, seat, 'stars', 1, fx); gain(s, seat, 'hp', 2, fx); break;
    case 'shove':
      if (s.peak !== seat) {
        if (s.peak != null) { fx.push({ t: 'shoved', seat: s.peak }); addLog(s, `${nm(s, seat)} shoves ${nm(s, s.peak)} off the Peak!`); }
        enterPeak(s, seat, fx);
      }
      break;
    default: break;
  }
}

// ---------- actions ----------

export function applyAction(state, a, seat, rand, now = 0) {
  const s = structuredClone(state);
  const fx = [];
  const done = () => { if (fx.length) { s.fx = fx; s.fxNo++; } return s; };
  if (s.phase === 'over') throw new Error('game over');

  if (a.type === 'deal') {
    if (seat !== -1 || !s.needDeal) throw new Error('no deal now');
    checkRand(s, a, seat, rand);
    let k = 0;
    s.market = s.market.map((c) => (c == null && k < rand.length ? draw(s, rand[k++]) : c));
    s.needDeal = false;
    return s;
  }

  if (a.type === 'flee') {
    if (s.phase !== 'flee') throw new Error('nothing to flee from');
    if (seat !== s.fleeSeat && seat !== -1) throw new Error('not your choice'); // system: timer ran out (tick)
    const holder = s.fleeSeat;
    const go = seat === -1 ? false : !!a.go;
    s.fleeSeat = null;
    s.fleeAt = null;
    if (go) {
      s.peak = null;
      fx.push({ t: 'flee', seat: holder });
      addLog(s, `${nm(s, holder)} flees ${PEAK}!`);
      if (has(s.players[holder], 'smoke')) gain(s, holder, 'hp', 2, fx);
    } else {
      fx.push({ t: 'stay', seat: holder });
      addLog(s, `${nm(s, holder)} stays on ${PEAK}.`);
    }
    afterResolve(s, now, fx);
    return done();
  }

  // everything else: the current player (system may auto-resolve)
  if (a.type === 'resolve' && seat === -1) {
    if (s.phase !== 'roll' || !s.rolled || s.rollsLeft > 0) throw new Error('not yet'); // tick waits AUTO_MS
  } else if (seat !== s.current) throw new Error('not your turn');
  const p = s.players[s.current];

  switch (a.type) {
    case 'roll': {
      if (s.phase !== 'roll' || s.rollsLeft <= 0) throw new Error('no rolls left');
      if (!s.rolled) s.keep = s.keep.map(() => false);
      const idx = s.dice.map((_, i) => i).filter((i) => !s.keep[i]);
      if (!idx.length) throw new Error('all dice kept');
      if (!rand || rand.length !== idx.length) throw new Error('bad dice');
      idx.forEach((di, k) => {
        const v = Number(rand[k]);
        if (!(v >= 0 && v < 6)) throw new Error('bad die');
        s.dice[di] = v;
      });
      s.rollsLeft--;
      s.rolled = true;
      s.rollNo++;
      s.lastRoll = { indices: idx };
      s.autoAt = s.rollsLeft === 0 ? now + AUTO_MS : null;
      return s;
    }
    case 'keep': {
      if (s.phase !== 'roll' || !s.rolled || s.rollsLeft <= 0) throw new Error('cannot keep now');
      const i = Number(a.index);
      if (!(Number.isInteger(i) && i >= 0 && i < s.dice.length)) throw new Error('bad die');
      s.keep[i] = !s.keep[i];
      return s;
    }
    case 'resolve': {
      if (s.phase !== 'roll' || !s.rolled) throw new Error('roll first');
      const cur = s.current;
      const pv = preview(s);
      const parts = [];
      if (pv.stars) parts.push(`${pv.stars}⭐`);
      if (pv.energy) parts.push(`${pv.energy}⚡`);
      if (pv.heal) parts.push(`${pv.heal}❤️`);
      if (pv.dmg && pv.targets.length) parts.push(`${pv.dmg}👊`);
      addLog(s, `${p.name} rolls ${parts.length ? parts.join(' ') : 'nothing useful'}.`);
      gain(s, cur, 'stars', pv.stars, fx);
      gain(s, cur, 'energy', pv.energy, fx);
      gain(s, cur, 'hp', pv.heal, fx);
      s.autoAt = null;
      s.keep = s.keep.map(() => false);
      let dealt = 0;
      const holder = s.peak;
      for (const t of pv.targets) {
        const d = hurt(s, t, pv.dmg, fx);
        dealt += d;
        if (d > 0 && has(p, 'leech') && s.players[t].energy > 0) { gain(s, t, 'energy', -1, fx); gain(s, cur, 'energy', 1, fx); }
      }
      if (dealt >= 3 && has(p, 'crowd')) gain(s, cur, 'stars', 1, fx);
      knockouts(s, fx);
      if (checkWin(s)) return done();
      // hit the Peak monster from below: it may flee
      if (pv.dmg && holder != null && holder !== cur && s.peak === holder) {
        s.phase = 'flee';
        s.fleeSeat = holder;
        s.fleeAt = now + FLEE_MS;
        return done();
      }
      afterResolve(s, now, fx);
      return done();
    }
    case 'buy': {
      if (s.phase !== 'buy') throw new Error('not shopping now');
      const slot = Number(a.slot);
      const id = s.market[slot];
      if (!id) throw new Error('no card there');
      const cost = costFor(p, id);
      if (p.energy < cost) throw new Error('not enough energy');
      checkRand(s, a, seat, rand);
      p.energy -= cost;
      s.market[slot] = rand && rand.length ? draw(s, rand[0]) : null;
      fx.push({ t: 'buy', seat: s.current, id });
      addLog(s, `${p.name} buys ${CARDS[id].name}.`);
      if (CARDS[id].kind === 'keep') {
        p.cards.push(id);
        if (id === 'heart') gain(s, s.current, 'hp', 2, fx);
      } else {
        useSnack(s, s.current, id, fx);
        s.pool.push(id);
      }
      knockouts(s, fx);
      checkWin(s);
      return done();
    }
    case 'sweep': {
      if (s.phase !== 'buy') throw new Error('not shopping now');
      if (p.energy < SWEEP_COST) throw new Error('not enough energy');
      checkRand(s, a, seat, rand);
      p.energy -= SWEEP_COST;
      const old = s.market.filter(Boolean);
      const fresh = (rand || []).map((r) => draw(s, r));
      s.market = [0, 1, 2].map((i) => fresh[i] ?? null);
      s.pool.push(...old);
      s.swept++;
      fx.push({ t: 'sweep', seat: s.current });
      addLog(s, `${p.name} sweeps the power shop.`);
      return done();
    }
    case 'end': {
      if (s.phase !== 'buy') throw new Error('not now');
      endTurn(s, now, fx);
      return done();
    }
    default:
      throw new Error('unknown action');
  }
}

// ---------- computer player ----------

function botWantKeep(s, seat) {
  const p = s.players[seat];
  const onPeak = s.peak === seat;
  const c = counts(s.dice);
  const hurtBad = p.hp <= 6;
  const holder = s.peak != null && !onPeak ? s.players[s.peak] : null;
  return s.dice.map((f) => {
    if (f === CLAW) {
      if (onPeak) return true;
      if (!holder) return false;
      return !hurtBad || holder.hp <= c[CLAW] + 1;
    }
    if (f === HEART) return !onPeak && p.hp < maxHp(p) && (hurtBad || p.hp <= 8);
    if (f === EN) return s.cardsOn;
    const need = s.target - p.stars;
    if (c[f] >= 3) return true;
    if (c[f] === 2) return f === THREE || need <= f + 1 || s.rollsLeft >= 2;
    return false;
  });
}

function cardValue(s, seat, id) {
  const p = s.players[seat];
  const others = aliveSeats(s).filter((i) => i !== seat);
  const onPeak = s.peak === seat;
  const room = maxHp(p) - p.hp;
  const starGain = { tower: 2, castle: 3, moon: 4, shower: 1, fireworks: 1 }[id] || 0;
  if (starGain && p.stars + starGain >= s.target) return 100;
  switch (id) {
    case 'picnic': return room >= 3 ? (p.hp <= 6 ? 6 : 3) : 0;
    case 'feast': return room >= 5 ? (p.hp <= 5 ? 7 : 3) : 0;
    case 'tower': return 3;
    case 'castle': return 4;
    case 'moon': return 4;
    case 'shower': return 3;
    case 'fireworks': return 2;
    case 'storm': return others.some((i) => s.players[i].hp <= 2) ? 8 : others.length >= 2 ? 4 : 2;
    case 'meteor': return s.peak != null && !onPeak ? (s.players[s.peak].hp <= 3 ? 8 : 3) : -1;
    case 'pickpocket': return others.filter((i) => s.players[i].energy > 0).length >= 2 ? 2 : 0;
    case 'shove': return onPeak ? -1 : p.hp >= 7 ? 5 : -1;
    case 'arm': return 6;
    case 'scales': return 6;
    case 'fists': return 5;
    case 'tail': return 5;
    case 'gasp': return 4;
    case 'heart': return 4;
    case 'hoard': return 3;
    case 'throne': return 3;
    case 'moss': return 3;
    case 'trumpet': return 3;
    case 'battery': return 3;
    case 'leech': return 3;
    case 'spring': return 3;
    case 'haggle': return 2;
    case 'berserk': return 2;
    case 'crowd': return 2;
    case 'belly': return 2;
    case 'smoke': return 2;
    case 'piggy': return 2;
    case 'fry': return 1;
    case 'sun': return 1;
    default: return 0;
  }
}

export function botAction(s, seat) {
  if (s.phase === 'over') return null;
  if (s.phase === 'flee') {
    if (s.fleeSeat !== seat) return null;
    const p = s.players[seat];
    const crowd = aliveSeats(s).length;
    const closeToWin = p.stars + 2 >= s.target && p.hp >= 4;
    return { type: 'flee', go: !closeToWin && p.hp <= (crowd >= 4 ? 6 : 5) };
  }
  if (s.current !== seat) return null;
  const p = s.players[seat];
  if (s.phase === 'roll') {
    if (!s.rolled) return { type: 'roll' };
    if (s.rollsLeft <= 0) return { type: 'resolve' };
    const want = botWantKeep(s, seat);
    const i = want.findIndex((w, k) => w !== s.keep[k]);
    if (i >= 0) return { type: 'keep', index: i };
    if (want.some((w) => !w)) return { type: 'roll' };
    return { type: 'resolve' };
  }
  if (s.phase === 'buy') {
    let best = -1;
    let bestV = 1;
    s.market.forEach((id, slot) => {
      if (!id || costFor(p, id) > p.energy) return;
      const v = cardValue(s, seat, id);
      if (v > bestV || (v === bestV && best >= 0 && costFor(p, id) < costFor(p, s.market[best]))) { best = slot; bestV = v; }
    });
    if (best >= 0) return { type: 'buy', slot: best };
    const marketBest = Math.max(0, ...s.market.filter(Boolean).map((id) => cardValue(s, seat, id)));
    if (!s.swept && p.energy >= 8 && marketBest < 3 && s.pool.length >= 3) return { type: 'sweep' };
    return { type: 'end' };
  }
  return null;
}
