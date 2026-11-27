// Gem Traders — an original engine-building gem market game (pure rules, no DOM).
//
// Five gem colours (ruby, sapphire, jade, amethyst, pearl) plus wild gold.
// Development cards in three tiers: each has a gem cost, a permanent bonus colour
// (a one-gem discount on later buys) and 0–5 prestige points.
// On your turn do ONE of:
//   • take up to 3 gems of different colours
//   • take 2 gems of one colour (only if 4+ of it are left in the supply)
//   • reserve a face-up card or the top of a deck (max 3 reserved) and gain 1 gold
//   • buy a face-up or reserved card: cost minus your bonuses, gold covers any gem
// Hold at most 10 gems — return extras of your choice.
// Patrons visit automatically (+3) once your card bonuses meet their requirement.
// Reaching the target finishes the round; most points wins (tie: fewer cards).

export const COLORS = ['ruby', 'sapphire', 'jade', 'amethyst', 'pearl'];
export const GEM_NAMES = ['Ruby', 'Sapphire', 'Jade', 'Amethyst', 'Pearl', 'Gold'];
export const GOLD = 5;
export const MAX_GEMS = 10;
export const MAX_RESERVE = 3;
export const MARKET = 4;
export const PATRON_PTS = 3;
export const GOLD_SUPPLY = 5;
export const MAX_ROUNDS = 80; // safety net: the market can never stall a game forever
export const supplyFor = (n) => (n <= 2 ? 5 : n === 3 ? 6 : 7);

// ---------- cards (generated from original templates) ----------
// [cost parts (other colours unless own), points, own-colour cost?]
const TEMPLATES = [
  [[[2, 1], 0], [[1, 1, 1], 0], [[3], 0], [[2, 2], 0], [[1, 1, 1, 1], 0], [[2, 1, 1], 0], [[2, 2, 1], 1], [[4], 1]],
  [[[3, 2, 2], 1], [[3, 3, 1], 1], [[4, 2, 1], 2], [[5, 2], 2], [[5], 2], [[6], 3, true]],
  [[[3, 3, 3, 4], 3], [[7], 4], [[5, 4, 2], 4], [[7, 3], 5]],
];
export const CARDS = [];
TEMPLATES.forEach((list, tier) => {
  list.forEach(([parts, pts, own], t) => {
    for (let c = 0; c < 5; c++) {
      const others = [1, 2, 3, 4].map((k) => (c + k) % 5);
      const cost = [0, 0, 0, 0, 0];
      parts.forEach((n, j) => { cost[own ? c : others[(t + j + tier) % 4]] += n; });
      CARDS.push({ id: CARDS.length, tier, color: c, cost, pts });
    }
  });
});
export const TIER_SIZE = TEMPLATES.map((l) => l.length * 5);

// ---------- patrons ----------
const PATRON_NAMES = [
  'Lady Marisol', 'Old Brannoch', 'The Silk Widow', 'Captain Ysolde', 'Master Quill',
  'Duke Halloran', 'Sister Amaryth', 'The Salt Baron', 'Madam Okonkwo', 'Prince Tavi',
  'Countess Vell', 'The Lamplighter', 'Elder Ruun', 'Admiral Kestrel', 'The Twin Sages',
  'Baroness Iolu', 'Grand Vizier Omar', 'The Moth Queen', 'Sir Pellam', 'Abbess Odile',
];
export const PATRONS = [];
for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
  const req = [0, 0, 0, 0, 0]; req[a] = 4; req[b] = 4; PATRONS.push({ req });
}
for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) for (let c = b + 1; c < 5; c++) {
  const req = [0, 0, 0, 0, 0]; req[a] = 3; req[b] = 3; req[c] = 3; PATRONS.push({ req });
}
PATRONS.forEach((p, i) => { p.id = i; p.name = PATRON_NAMES[i]; });

// ---------- helpers ----------
export const total = (gems) => gems.reduce((a, b) => a + b, 0);
export function bonuses(p) {
  const b = [0, 0, 0, 0, 0];
  for (const id of p.cards) b[CARDS[id].color]++;
  return b;
}
export const patronCount = (s) => (s.opts.patrons ? s.players.length + 1 : 0);

/** Gems paid for a card ([6], gold last) or null if unaffordable. */
export function payment(p, card, bonus = bonuses(p)) {
  const pay = [0, 0, 0, 0, 0, 0];
  let short = 0;
  for (let c = 0; c < 5; c++) {
    const need = Math.max(0, card.cost[c] - bonus[c]);
    const use = Math.min(need, p.gems[c]);
    pay[c] = use;
    short += need - use;
  }
  if (short > p.gems[GOLD]) return null;
  pay[GOLD] = short;
  return pay;
}
/** How many more gems (after gold) the player needs for a card. */
export function shortfall(p, card, bonus = bonuses(p)) {
  let short = 0;
  for (let c = 0; c < 5; c++) short += Math.max(0, card.cost[c] - bonus[c] - p.gems[c]);
  return Math.max(0, short - p.gems[GOLD]);
}

/** Card the action refers to: { id, where:'market'|'reserve'|'deck', tier, slot, idx } or null. */
export function cardRef(s, seat, a) {
  const p = s.players[seat];
  if (Number.isInteger(a.reserve)) {
    const r = p.reserved[a.reserve];
    return r ? { id: r.id, where: 'reserve', idx: a.reserve } : null;
  }
  if (!Number.isInteger(a.tier) || a.tier < 0 || a.tier > 2) return null;
  if (a.deck) return s.decks[a.tier].length ? { id: null, where: 'deck', tier: a.tier } : null;
  if (!Number.isInteger(a.slot) || a.slot < 0 || a.slot >= MARKET) return null;
  const id = s.market[a.tier][a.slot];
  return id == null ? null : { id, where: 'market', tier: a.tier, slot: a.slot };
}

export function canReserve(s, seat) {
  const p = s.players[seat];
  if (p.reserved.length >= MAX_RESERVE) return false;
  return s.market.some((row) => row.some((x) => x != null)) || s.decks.some((d) => d.length);
}
export function affordable(s, seat) {
  const p = s.players[seat];
  const bonus = bonuses(p);
  const out = [];
  s.market.forEach((row, tier) => row.forEach((id, slot) => { if (id != null && payment(p, CARDS[id], bonus)) out.push({ tier, slot, id }); }));
  p.reserved.forEach((r, idx) => { if (payment(p, CARDS[r.id], bonus)) out.push({ reserve: idx, id: r.id }); });
  return out;
}
/** Passing is only allowed when nothing useful can be done (guards against gem deadlocks). */
export function canPass(s, seat) {
  if (s.phase !== 'turn' || s.current !== seat) return false;
  const p = s.players[seat];
  if (affordable(s, seat).length || canReserve(s, seat)) return false;
  const colored = s.supply.slice(0, 5).some((n) => n > 0);
  return !colored || total(p.gems) >= MAX_GEMS;
}

export function newGame(players, opts = {}, first = 0) {
  const n = players.length;
  const sup = supplyFor(n);
  return {
    players: players.map((p) => ({ pid: p.pid, name: p.name, gems: [0, 0, 0, 0, 0, 0], cards: [], reserved: [], patrons: [], pts: 0 })),
    supply: [sup, sup, sup, sup, sup, GOLD_SUPPLY],
    decks: TIER_SIZE.map((_, t) => CARDS.filter((c) => c.tier === t).map((c) => c.id)),
    market: [[null, null, null, null], [null, null, null, null], [null, null, null, null]],
    patrons: [],
    opts: { target: Number(opts.target) || 15, patrons: opts.patrons !== false && opts.patrons !== 'off' },
    first: first % n,
    current: first % n,
    round: 1,
    phase: 'deal', // deal | turn | return | over
    finalRound: false,
    passes: 0,
    seq: 0,
    last: null,
    winners: null,
    log: [],
  };
}

function addLog(s, msg) { s.log = [...s.log, msg].slice(-40); }
const gemList = (g) => g.map((n, c) => (n ? `${n} ${GEM_NAMES[c].toLowerCase()}` : '')).filter(Boolean).join(', ');

/** Number of random ints an action needs: [ranges]. */
export function randomNeeds(s, a, seat) {
  if (a.type === 'deal') {
    if (s.phase !== 'deal') return null;
    const r = [];
    for (let t = 0; t < 3; t++) for (let k = 0; k < MARKET; k++) r.push(s.decks[t].length - k);
    for (let k = 0; k < patronCount(s); k++) r.push(PATRONS.length - k);
    return r;
  }
  if ((a.type === 'buy' || a.type === 'reserve') && s.phase === 'turn' && seat === s.current) {
    const ref = cardRef(s, seat, a);
    if (!ref || ref.where === 'reserve') return null;
    const len = s.decks[ref.tier].length;
    return len ? [len] : null;
  }
  return null;
}

function drawInto(s, tier, slot, r) {
  const d = s.decks[tier];
  if (!d.length) { s.market[tier][slot] = null; return; }
  if (!(Number.isInteger(r) && r >= 0 && r < d.length)) throw new Error('bad draw');
  s.market[tier][slot] = d.splice(r, 1)[0];
}

function finish(s, why) {
  s.phase = 'over';
  const best = Math.max(...s.players.map((p) => p.pts));
  const top = s.players.map((p, i) => i).filter((i) => s.players[i].pts === best);
  const fewest = Math.min(...top.map((i) => s.players[i].cards.length));
  s.winners = top.filter((i) => s.players[i].cards.length === fewest);
  if (why) addLog(s, why);
  addLog(s, s.winners.length > 1 ? 'Game over — a shared victory!' : `Game over — ${s.players[s.winners[0]].name} wins with ${best} points!`);
}

function endTurn(s) {
  const p = s.players[s.current];
  if (s.opts.patrons) {
    const b = bonuses(p);
    const idx = s.patrons.findIndex((id) => PATRONS[id].req.every((n, c) => b[c] >= n));
    if (idx >= 0) {
      const id = s.patrons.splice(idx, 1)[0];
      p.patrons.push(id);
      p.pts += PATRON_PTS;
      s.last.patron = id;
      addLog(s, `👑 ${PATRONS[id].name} visits ${p.name} (+${PATRON_PTS}).`);
    }
  }
  if (!s.finalRound && p.pts >= s.opts.target) {
    s.finalRound = true;
    s.last.final = true;
    addLog(s, `${p.name} reached ${s.opts.target} points — finishing this round.`);
  }
  const n = s.players.length;
  if (s.passes >= n) { finish(s, 'Nobody can make a move — the market closes.'); return; }
  const next = (s.current + 1) % n;
  if (next === s.first) {
    if (s.finalRound) { finish(s); return; }
    s.round++;
    if (s.round > MAX_ROUNDS) { finish(s, 'The market closes for the season.'); return; }
  }
  s.current = next;
  s.phase = 'turn';
}

/** After taking/reserving: too many gems → return phase, else the turn ends. */
function afterGain(s) {
  if (total(s.players[s.current].gems) > MAX_GEMS) s.phase = 'return';
  else endTurn(s);
}

/**
 * Actions:
 *  {type:'deal'} (system, rand) · {type:'take', gems:[c,...]} · {type:'take2', color}
 *  {type:'reserve', tier, slot} | {type:'reserve', tier, deck:true} (rand)
 *  {type:'buy', tier, slot} (rand) | {type:'buy', reserve: idx}
 *  {type:'return', gems:[c,...]} · {type:'pass'}
 */
export function applyAction(state, a, seat, rand) {
  if (!a || typeof a.type !== 'string') throw new Error('bad action');
  const s = structuredClone(state);
  if (a.type === 'deal') {
    if (seat !== -1 || s.phase !== 'deal') throw new Error('not now');
    const need = randomNeeds(s, a, seat);
    if (!Array.isArray(rand) || rand.length < need.length) throw new Error('missing random');
    let k = 0;
    for (let t = 0; t < 3; t++) for (let slot = 0; slot < MARKET; slot++) drawInto(s, t, slot, rand[k++]);
    const pool = PATRONS.map((p) => p.id);
    for (let j = 0; j < patronCount(s); j++) {
      const r = rand[k++];
      if (!(Number.isInteger(r) && r >= 0 && r < pool.length)) throw new Error('bad draw');
      s.patrons.push(pool.splice(r, 1)[0]);
    }
    s.phase = 'turn';
    s.seq++;
    s.last = { kind: 'deal' };
    addLog(s, `New game — first to ${s.opts.target} points ends the round.`);
    return s;
  }
  if (seat < 0 || seat !== s.current) throw new Error('not your turn');
  const p = s.players[seat];

  if (a.type === 'return') {
    if (s.phase !== 'return') throw new Error('not now');
    const excess = total(p.gems) - MAX_GEMS;
    if (!Array.isArray(a.gems) || a.gems.length !== excess) throw new Error(`return exactly ${excess}`);
    const back = [0, 0, 0, 0, 0, 0];
    for (const c of a.gems) {
      if (!Number.isInteger(c) || c < 0 || c > 5) throw new Error('bad gem');
      back[c]++;
    }
    for (let c = 0; c < 6; c++) {
      if (back[c] > p.gems[c]) throw new Error('you do not have those gems');
    }
    for (let c = 0; c < 6; c++) { p.gems[c] -= back[c]; s.supply[c] += back[c]; }
    s.last.returned = back;
    s.seq++;
    addLog(s, `${p.name} returned ${gemList(back)}.`);
    endTurn(s);
    return s;
  }
  if (s.phase !== 'turn') throw new Error('not now');

  switch (a.type) {
    case 'take': {
      const g = a.gems;
      if (!Array.isArray(g) || g.length < 1 || g.length > 3) throw new Error('take 1–3 gems');
      if (new Set(g).size !== g.length) throw new Error('gems must be different colours');
      const got = [0, 0, 0, 0, 0, 0];
      for (const c of g) {
        if (!Number.isInteger(c) || c < 0 || c > 4) throw new Error('bad gem');
        if (s.supply[c] < 1) throw new Error(`no ${COLORS[c]} left`);
        got[c] = 1;
      }
      for (const c of g) { s.supply[c]--; p.gems[c]++; }
      s.passes = 0;
      s.seq++;
      s.last = { seat, kind: 'take', gems: got };
      addLog(s, `${p.name} took ${gemList(got)}.`);
      afterGain(s);
      return s;
    }
    case 'take2': {
      const c = a.color;
      if (!Number.isInteger(c) || c < 0 || c > 4) throw new Error('bad gem');
      if (s.supply[c] < 4) throw new Error('need 4+ in the supply to take two');
      s.supply[c] -= 2;
      p.gems[c] += 2;
      const got = [0, 0, 0, 0, 0, 0]; got[c] = 2;
      s.passes = 0;
      s.seq++;
      s.last = { seat, kind: 'take', gems: got };
      addLog(s, `${p.name} took 2 ${COLORS[c]}.`);
      afterGain(s);
      return s;
    }
    case 'reserve': {
      if (p.reserved.length >= MAX_RESERVE) throw new Error(`you can reserve at most ${MAX_RESERVE}`);
      const ref = cardRef(s, seat, a);
      if (!ref || ref.where === 'reserve') throw new Error('no such card');
      let id;
      if (ref.where === 'deck') {
        const r = rand?.[0];
        const d = s.decks[ref.tier];
        if (!(Number.isInteger(r) && r >= 0 && r < d.length)) throw new Error('bad draw');
        id = d.splice(r, 1)[0];
        p.reserved.push({ id, blind: true });
      } else {
        id = ref.id;
        if (s.decks[ref.tier].length && !Array.isArray(rand)) throw new Error('missing random');
        drawInto(s, ref.tier, ref.slot, rand?.[0]);
        p.reserved.push({ id, blind: false });
      }
      const gold = s.supply[GOLD] > 0 ? 1 : 0;
      s.supply[GOLD] -= gold;
      p.gems[GOLD] += gold;
      s.passes = 0;
      s.seq++;
      s.last = { seat, kind: 'reserve', id: ref.where === 'deck' ? null : id, tier: ref.tier, slot: ref.slot ?? null, blind: ref.where === 'deck', gold };
      addLog(s, `${p.name} reserved a ${ref.where === 'deck' ? 'hidden ' : ''}tier ${ref.tier + 1} card${gold ? ' and took a gold' : ''}.`);
      afterGain(s);
      return s;
    }
    case 'buy': {
      const ref = cardRef(s, seat, a);
      if (!ref || ref.where === 'deck') throw new Error('no such card');
      const card = CARDS[ref.id];
      const pay = payment(p, card);
      if (!pay) throw new Error('you cannot afford that card');
      for (let c = 0; c < 6; c++) { p.gems[c] -= pay[c]; s.supply[c] += pay[c]; }
      if (ref.where === 'reserve') p.reserved.splice(ref.idx, 1);
      else {
        if (s.decks[ref.tier].length && !Array.isArray(rand)) throw new Error('missing random');
        drawInto(s, ref.tier, ref.slot, rand?.[0]);
      }
      p.cards.push(ref.id);
      p.pts += card.pts;
      s.passes = 0;
      s.seq++;
      s.last = { seat, kind: 'buy', id: ref.id, tier: card.tier, slot: ref.slot ?? null, fromReserve: ref.where === 'reserve', paid: pay };
      addLog(s, `${p.name} bought a ${COLORS[card.color]} card${card.pts ? ` (+${card.pts})` : ''}${total(pay) ? ` for ${gemList(pay)}` : ' for free'}.`);
      endTurn(s);
      return s;
    }
    case 'pass': {
      if (!canPass(s, seat)) throw new Error('you still have a move');
      s.passes++;
      s.seq++;
      s.last = { seat, kind: 'pass' };
      addLog(s, `${p.name} passed.`);
      endTurn(s);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

// ---------- computer player ----------

function cardValue(s, seat, card, bonus) {
  const p = s.players[seat];
  let v = card.pts * 4;
  const early = p.cards.length < 9 ? 1 : 0.5;
  // bonus colour helps with other visible cards
  let helps = 0;
  for (const row of s.market) for (const id of row) {
    if (id == null || id === card.id) continue;
    if (CARDS[id].cost[card.color] > bonus[card.color]) helps += CARDS[id].tier === 0 ? 0.25 : 0.45;
  }
  for (const r of p.reserved) if (CARDS[r.id].cost[card.color] > bonus[card.color]) helps += 0.8;
  v += Math.min(helps, 3) * early * 1.4;
  // patron progress
  if (s.opts.patrons) {
    for (const id of s.patrons) {
      const req = PATRONS[id].req;
      if (req[card.color] > bonus[card.color]) {
        const missing = req.reduce((a, n, c) => a + Math.max(0, n - bonus[c]), 0);
        v += missing <= 2 ? 4 : missing <= 4 ? 1.6 : 0.6;
      }
    }
  }
  return v;
}

function cardsOnOffer(s, seat) {
  const out = [];
  s.market.forEach((row, tier) => row.forEach((id, slot) => { if (id != null) out.push({ id, act: { tier, slot }, reserved: false }); }));
  s.players[seat].reserved.forEach((r, idx) => out.push({ id: r.id, act: { reserve: idx }, reserved: true }));
  return out;
}

function pickTarget(s, seat, bonus, exclude = null) {
  const p = s.players[seat];
  let best = null;
  for (const o of cardsOnOffer(s, seat)) {
    if (o.id === exclude) continue;
    const card = CARDS[o.id];
    let short = 0;
    let blocked = 0;
    for (let c = 0; c < 5; c++) {
      const need = Math.max(0, card.cost[c] - bonus[c] - p.gems[c]);
      short += need;
      if (need > s.supply[c]) blocked += need - s.supply[c];
    }
    short = Math.max(0, short - p.gems[GOLD]);
    const score = (cardValue(s, seat, card, bonus) + (o.reserved ? 2 : 0) + 1) / (1 + short + blocked * 2);
    if (!best || score > best.score) best = { ...o, card, score, short };
  }
  return best;
}

function needVector(p, card, bonus) {
  return [0, 1, 2, 3, 4].map((c) => Math.max(0, card.cost[c] - bonus[c] - p.gems[c]));
}

function chooseReturn(s, seat) {
  const p = s.players[seat];
  const bonus = bonuses(p);
  const excess = total(p.gems) - MAX_GEMS;
  const tgt = pickTarget(s, seat, bonus);
  const keep = [0, 0, 0, 0, 0, 0];
  if (tgt) for (let c = 0; c < 5; c++) keep[c] = Math.max(0, tgt.card.cost[c] - bonus[c]);
  const g = p.gems.slice();
  const out = [];
  for (let k = 0; k < excess; k++) {
    let pick = -1;
    let bestSur = -Infinity;
    for (let c = 0; c < 6; c++) {
      if (!g[c]) continue;
      const sur = (c === GOLD ? -3 : 0) + g[c] - keep[c];
      if (sur > bestSur) { bestSur = sur; pick = c; }
    }
    g[pick]--;
    out.push(pick);
  }
  return { type: 'return', gems: out };
}

export function botAction(s, seat, rnd = Math.random) {
  if (s.current !== seat) return null;
  if (s.phase === 'return') return chooseReturn(s, seat);
  if (s.phase !== 'turn') return null;
  const p = s.players[seat];
  const bonus = bonuses(p);
  const held = total(p.gems);
  const room = MAX_GEMS - held;

  // 1) buy the best affordable card
  const buys = affordable(s, seat);
  if (buys.length) {
    let best = null;
    for (const b of buys) {
      const card = CARDS[b.id];
      let v = cardValue(s, seat, card, bonus) - total(payment(p, card, bonus)) * 0.25 - payment(p, card, bonus)[GOLD] * 0.4;
      if (p.pts + card.pts >= s.opts.target) v += 100 + card.pts;
      if (Number.isInteger(b.reserve)) v += 1.5;
      if (!best || v > best.v) best = { b, v };
    }
    const b = best.b;
    return Number.isInteger(b.reserve) ? { type: 'buy', reserve: b.reserve } : { type: 'buy', tier: b.tier, slot: b.slot };
  }

  const tgt = pickTarget(s, seat, bonus);
  const reserveOk = canReserve(s, seat);
  const reserveBest = () => {
    let best = null;
    s.market.forEach((row, tier) => row.forEach((id, slot) => {
      if (id == null) return;
      const card = CARDS[id];
      const v = cardValue(s, seat, card, bonus) / (1 + shortfall(p, card, bonus) * 0.5);
      if (!best || v > best.v) best = { tier, slot, v };
    }));
    if (best) return { type: 'reserve', tier: best.tier, slot: best.slot };
    const t = [2, 1, 0].find((x) => s.decks[x].length);
    return { type: 'reserve', tier: t, deck: true };
  };

  // 2) occasionally reserve a valuable card (gaining gold)
  if (reserveOk && s.supply[GOLD] > 0 && room > 0 && p.reserved.length < 2 && rnd() < 0.12) {
    const r = reserveBest();
    if (r.slot != null && CARDS[s.market[r.tier][r.slot]].tier > 0) return r;
  }

  // 3) take gems toward the target card
  if (tgt) {
    const need = needVector(p, tgt.card, bonus);
    const wanted = [0, 1, 2, 3, 4].filter((c) => need[c] > 0 && s.supply[c] > 0).sort((a, b) => need[b] - need[a]);
    if (wanted.length && room > 0) {
      const only = wanted.length === 1 && need[wanted[0]] >= 2 && s.supply[wanted[0]] >= 4 && room >= 2;
      if (only) return { type: 'take2', color: wanted[0] };
      const pick = wanted.slice(0, Math.min(3, room));
      if (pick.length < Math.min(3, room)) {
        // top up with colours that help a second card
        const alt = pickTarget(s, seat, bonus, tgt.id);
        const altNeed = alt ? needVector(p, alt.card, bonus) : [0, 0, 0, 0, 0];
        const fill = [0, 1, 2, 3, 4].filter((c) => !pick.includes(c) && s.supply[c] > 0)
          .sort((a, b) => altNeed[b] - altNeed[a] || s.supply[b] - s.supply[a]);
        for (const c of fill) {
          if (pick.length >= Math.min(3, room)) break;
          if (altNeed[c] > 0 || room - pick.length > 3) pick.push(c);
        }
      }
      return { type: 'take', gems: pick };
    }
    if (wanted.length && room <= 0) {
      // full hand: swap through a reservation (gold) or take what we need and return extras
      if (reserveOk && s.supply[GOLD] > 0) return reserveBest();
      return { type: 'take', gems: wanted.slice(0, 3) };
    }
  }
  // 4) nothing to collect for: reserve, take anything, or pass
  if (reserveOk && (s.supply[GOLD] > 0 || room <= 0)) return reserveBest();
  const avail = [0, 1, 2, 3, 4].filter((c) => s.supply[c] > 0).sort((a, b) => s.supply[b] - s.supply[a]);
  if (avail.length && room > 0) return { type: 'take', gems: avail.slice(0, Math.min(3, room)) };
  if (canPass(s, seat)) return { type: 'pass' };
  if (reserveOk) return reserveBest();
  return { type: 'take', gems: avail.slice(0, 1) };
}
