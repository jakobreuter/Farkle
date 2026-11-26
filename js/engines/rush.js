// Property Rush — an original set-collecting card game for 2–5 players.
//
// Goal: be the first with 3 complete property sets (different districts).
// Turn: draw 2 (5 if your hand is empty), then play up to 3 cards:
//   • bank a money or action card (it counts as money)
//   • place a property in its district (a Wild goes in any district you choose)
//   • play an action (rent, collect, swipe, swap, takeover, windfall)
// Players you target may block with a Shield. Payment comes from your bank and
// table (never your hand); you choose what to hand over, no change is given.
// End your turn with at most 7 cards in hand.

export const DISTRICTS = {
  docks: { name: 'Docks', color: '#1c4e80', size: 2, rent: [1, 3], value: 4 },
  beacon: { name: 'Beacon Point', color: '#0c8f91', size: 2, rent: [2, 5], value: 4 },
  orchard: { name: 'Orchard Lane', color: '#3f9a3f', size: 3, rent: [1, 2, 4], value: 3 },
  bazaar: { name: 'Bazaar', color: '#ea8a0c', size: 3, rent: [1, 3, 5], value: 2 },
  oldtown: { name: 'Old Town', color: '#8d5a2b', size: 3, rent: [1, 2, 3], value: 1 },
  canal: { name: 'Canal Row', color: '#c2255c', size: 3, rent: [2, 4, 7], value: 3 },
  hilltop: { name: 'Hilltop', color: '#7b2fb0', size: 4, rent: [1, 2, 4, 6], value: 2 },
  railway: { name: 'Railway', color: '#495057', size: 4, rent: [1, 2, 3, 4], value: 2 },
};
export const DISTRICT_IDS = Object.keys(DISTRICTS);

export const ACTIONS = {
  windfall: { name: 'Windfall', icon: '🎁', value: 1, count: 6, short: 'Draw 2 cards', text: 'Draw 2 cards.' },
  rentday: { name: 'Rent Day', icon: '🏠', value: 1, count: 5, short: 'Everyone pays you rent', text: 'Every other player pays you rent for one of your districts.' },
  tax: { name: 'Tax Collector', icon: '🧾', value: 3, count: 3, short: 'Take 4 from 1 player', text: 'One player pays you 4.' },
  party: { name: 'Block Party', icon: '🎉', value: 2, count: 2, short: 'Take 2 from everyone', text: 'Every other player pays you 2.' },
  swipe: { name: 'Swipe', icon: '🫳', value: 3, count: 3, short: 'Steal 1 property', text: 'Take a property from a player (not from a complete set).' },
  swap: { name: 'Swap', icon: '🔁', value: 3, count: 3, short: 'Trade 1 property', text: 'Trade one of your properties for one of theirs (neither from a complete set).' },
  takeover: { name: 'Takeover', icon: '🏴', value: 5, count: 1, short: 'Steal a full set', text: 'Take a complete set from a player.' },
  shield: { name: 'Shield', icon: '🛡️', value: 4, count: 3, short: 'Block an action', text: 'Block an action played against you.' },
};

export const WIN_SETS = 3;
export const HAND_MAX = 7;
export const RESPOND_MS = 45000;
const MONEY = [[1, 6], [2, 5], [3, 3], [4, 3], [5, 2], [10, 1]];

// The deck: card id = index into CARDS.
export const CARDS = (() => {
  const c = [];
  for (const [v, n] of MONEY) for (let k = 0; k < n; k++) c.push({ type: 'money', value: v });
  for (const d of DISTRICT_IDS) for (let k = 0; k < DISTRICTS[d].size; k++) c.push({ type: 'prop', district: d, value: DISTRICTS[d].value });
  for (let k = 0; k < 2; k++) c.push({ type: 'wild', value: 0 });
  for (const [a, def] of Object.entries(ACTIONS)) for (let k = 0; k < def.count; k++) c.push({ type: 'action', action: a, value: def.value });
  return c.map((x, id) => ({ ...x, id }));
})();

export const card = (id) => CARDS[id];
export const valueOf = (id) => CARDS[id].value;
export const cardName = (id) => {
  const c = CARDS[id];
  if (c.type === 'money') return `${c.value}`;
  if (c.type === 'prop') return DISTRICTS[c.district].name;
  if (c.type === 'wild') return 'Wild property';
  return ACTIONS[c.action].name;
};

// ---------- queries ----------
export const count = (p, d) => (p.props[d] || []).length;
export const isComplete = (p, d) => count(p, d) >= DISTRICTS[d].size;
export const completeSets = (p) => DISTRICT_IDS.filter((d) => isComplete(p, d)).length;
export const rentFor = (p, d) => { const n = Math.min(count(p, d), DISTRICTS[d].size); return n ? DISTRICTS[d].rent[n - 1] : 0; };
export const bankTotal = (p) => p.bank.reduce((a, id) => a + valueOf(id), 0);
export const tableCards = (p) => DISTRICT_IDS.flatMap((d) => p.props[d] || []);
export const assets = (p) => [...p.bank, ...tableCards(p)];
export const assetValue = (p) => assets(p).reduce((a, id) => a + valueOf(id), 0);
export const districtOf = (p, id) => DISTRICT_IDS.find((d) => (p.props[d] || []).includes(id));
/** Properties a Swipe/Swap can take (not part of a complete set). */
export const loose = (p) => DISTRICT_IDS.filter((d) => !isComplete(p, d)).flatMap((d) => p.props[d] || []);

export function newGame(players, first = 0) {
  return {
    players: players.map((p) => ({ ...p, hand: [], bank: [], props: {} })),
    deck: CARDS.map((c) => c.id),
    discard: [],
    current: first,
    plays: 0,
    phase: 'deal', // deal | draw | play | respond | discard | over
    pending: null,
    winners: null,
    event: null,
    actionNo: 0,
    log: ['New game of Property Rush.'],
  };
}

// ---------- drawing (random index into the draw pile, reshuffling the discard pile when empty) ----------
export function drawRanges(s, n) {
  let d = s.deck.length;
  let disc = s.discard.length;
  const r = [];
  for (let k = 0; k < n; k++) {
    if (!d) { d = disc; disc = 0; }
    if (!d) break;
    r.push(d);
    d--;
  }
  return r;
}

function drawInto(s, hand, rand) {
  for (const idx of rand) {
    if (!s.deck.length) {
      s.deck = s.discard;
      s.discard = [];
    }
    if (!s.deck.length) break;
    if (!(idx >= 0 && idx < s.deck.length)) throw new Error('bad draw');
    hand.unshift(s.deck.splice(idx, 1)[0]); // newest cards at the front of the hand
  }
}

/** Random ranges an action needs (null = none). */
export function randomNeeds(s, a, seat) {
  if (a.type === 'deal' && s.phase === 'deal') return drawRanges(s, 5 * s.players.length);
  if (a.type === 'draw' && s.phase === 'draw') return drawRanges(s, s.players[s.current].hand.length ? 2 : 5);
  if (a.type === 'play' && s.phase === 'play' && seat === s.current) {
    const id = Number(a.card);
    if (s.players[seat].hand.includes(id) && CARDS[id].action === 'windfall' && s.plays > 0) return drawRanges(s, 2);
  }
  return null;
}

// ---------- helpers ----------
function addLog(s, msg) { s.log = [...s.log, msg].slice(-50); }
const nm = (s, i) => s.players[i].name;
const removeFrom = (arr, id) => { const i = arr.indexOf(id); if (i < 0) throw new Error('card not there'); arr.splice(i, 1); };

function moveProp(from, to, id) {
  const d = districtOf(from, id);
  if (!d) throw new Error('not on table');
  removeFrom(from.props[d], id);
  if (!from.props[d].length) delete from.props[d];
  (to.props[d] ||= []).push(id);
}

function transfer(s, fromSeat, toSeat, ids) {
  const from = s.players[fromSeat];
  const to = s.players[toSeat];
  for (const id of ids) {
    if (from.bank.includes(id)) {
      removeFrom(from.bank, id);
      to.bank.push(id);
    } else {
      moveProp(from, to, id);
    }
  }
}

/** Cards an unattended player hands over: smallest bank cards first, then cheapest loose properties. */
export function autoPay(p, amount) {
  const all = assets(p);
  if (all.reduce((a, id) => a + valueOf(id), 0) <= amount) return all;
  const bank = [...p.bank].sort((a, b) => valueOf(a) - valueOf(b));
  let pick = [];
  let sum = 0;
  for (const id of bank) { if (sum >= amount) break; pick.push(id); sum += valueOf(id); }
  // a single bank card that covers it alone is better if it overpays less
  const single = bank.find((id) => valueOf(id) >= amount);
  if (single != null && (sum < amount || valueOf(single) <= sum)) return [single];
  if (sum < amount) {
    const props = [...loose(p), ...tableCards(p).filter((id) => !loose(p).includes(id))].filter((id) => valueOf(id) > 0)
      .sort((a, b) => valueOf(a) - valueOf(b));
    for (const id of props) { if (sum >= amount) break; pick.push(id); sum += valueOf(id); }
  }
  return pick;
}

function checkWin(s) {
  const n = s.players.length;
  for (let k = 0; k < n; k++) {
    const i = (s.current + k) % n;
    if (completeSets(s.players[i]) >= WIN_SETS) {
      s.phase = 'over';
      s.winners = [i];
      s.pending = null;
      s.event = { kind: 'win', seat: i };
      addLog(s, `🏆 ${nm(s, i)} completed ${WIN_SETS} sets and wins!`);
      return true;
    }
  }
  return false;
}

function finishPending(s) {
  const p = s.pending;
  if (p.targets.some((t) => !p.done[t])) return;
  s.pending = null;
  s.phase = 'play';
  checkWin(s);
}

function nextTurn(s) {
  s.current = (s.current + 1) % s.players.length;
  s.plays = 0;
  s.phase = 'draw';
}

function respondOne(s, seat, r) {
  const p = s.pending;
  const me = s.players[seat];
  const by = s.players[p.by];
  if (r.type === 'shield') {
    const sh = me.hand.find((id) => CARDS[id].action === 'shield');
    if (sh == null) throw new Error('no shield');
    removeFrom(me.hand, sh);
    s.discard.push(sh);
    p.done[seat] = 'shield';
    addLog(s, `🛡️ ${me.name} blocked it with a Shield.`);
    return;
  }
  if (p.kind === 'pay') {
    const owed = p.amounts[seat];
    let ids;
    if (r.type === 'auto') ids = autoPay(me, owed);
    else if (r.type === 'pay') {
      ids = [...new Set((r.cards || []).map(Number))];
      const mine = new Set(assets(me));
      if (!ids.every((id) => mine.has(id))) throw new Error('not your cards');
      const sum = ids.reduce((a, id) => a + valueOf(id), 0);
      if (sum < owed && ids.length < mine.size) throw new Error('not enough');
    } else throw new Error('pay or shield');
    transfer(s, seat, p.by, ids);
    const sum = ids.reduce((a, id) => a + valueOf(id), 0);
    p.done[seat] = 'paid';
    addLog(s, ids.length ? `${me.name} paid ${by.name} ${sum}${sum < owed ? ` (all they had)` : ''}.` : `${me.name} had nothing to pay.`);
    return;
  }
  if (r.type !== 'accept' && r.type !== 'auto') throw new Error('accept or shield');
  if (p.kind === 'swipe') {
    if (!loose(me).includes(p.take)) throw new Error('gone');
    transfer(s, seat, p.by, [p.take]);
    addLog(s, `${by.name} took ${cardName(p.take)} from ${me.name}.`);
  } else if (p.kind === 'swap') {
    if (!loose(me).includes(p.take) || !loose(by).includes(p.give)) throw new Error('gone');
    transfer(s, seat, p.by, [p.take]);
    transfer(s, p.by, seat, [p.give]);
    addLog(s, `${by.name} swapped ${cardName(p.give)} for ${me.name}’s ${cardName(p.take)}.`);
  } else if (p.kind === 'takeover') {
    if (!isComplete(me, p.district)) throw new Error('gone');
    transfer(s, seat, p.by, [...me.props[p.district]]);
    addLog(s, `🏴 ${by.name} took over ${me.name}’s ${DISTRICTS[p.district].name}!`);
  }
  p.done[seat] = 'accepted';
}

// ---------- the reducer ----------
export function applyAction(state, a, seat, { now = 0, rand = null } = {}) {
  const s = structuredClone(state);
  s.event = null;
  const n = s.players.length;
  switch (a.type) {
    case 'deal': {
      if (s.phase !== 'deal') throw new Error('not now');
      // 5 cards each, dealt round-robin
      const hands = s.players.map(() => []);
      rand.forEach((r, k) => drawInto(s, hands[k % n], [r]));
      s.players.forEach((p, i) => { p.hand = hands[i]; });
      s.phase = 'draw';
      return s;
    }
    case 'draw': {
      if (s.phase !== 'draw') throw new Error('not now');
      const p = s.players[s.current];
      drawInto(s, p.hand, rand || []);
      s.phase = 'play';
      s.plays = 3;
      return s;
    }
    case 'bank': {
      if (s.phase !== 'play' || seat !== s.current || s.plays < 1) throw new Error('not now');
      const p = s.players[seat];
      const id = Number(a.card);
      if (!p.hand.includes(id) || !['money', 'action'].includes(CARDS[id].type)) throw new Error('cannot bank that');
      removeFrom(p.hand, id);
      p.bank.push(id);
      s.plays--;
      addLog(s, `${p.name} banked ${CARDS[id].type === 'money' ? CARDS[id].value : `${cardName(id)} (${CARDS[id].value})`}.`);
      return s;
    }
    case 'place': {
      if (s.phase !== 'play' || seat !== s.current || s.plays < 1) throw new Error('not now');
      const p = s.players[seat];
      const id = Number(a.card);
      const c = CARDS[id];
      if (!p.hand.includes(id) || (c.type !== 'prop' && c.type !== 'wild')) throw new Error('not a property');
      const d = c.type === 'prop' ? c.district : a.district;
      if (!DISTRICTS[d]) throw new Error('pick a district');
      if (isComplete(p, d)) throw new Error('that set is already complete');
      removeFrom(p.hand, id);
      (p.props[d] ||= []).push(id);
      s.plays--;
      addLog(s, `${p.name} placed ${c.type === 'wild' ? `a Wild in ${DISTRICTS[d].name}` : DISTRICTS[d].name}.`);
      checkWin(s);
      return s;
    }
    case 'play': {
      if (s.phase !== 'play' || seat !== s.current || s.plays < 1) throw new Error('not now');
      const me = s.players[seat];
      const id = Number(a.card);
      const c = CARDS[id];
      if (!me.hand.includes(id) || c.type !== 'action') throw new Error('not an action');
      const act = c.action;
      const others = s.players.map((_, i) => i).filter((i) => i !== seat);
      const target = Number(a.target);
      const validTarget = others.includes(target);
      let pending = null;
      let text = '';
      switch (act) {
        case 'windfall':
          break;
        case 'rentday': {
          const d = a.district;
          if (!DISTRICTS[d] || !count(me, d)) throw new Error('you need a property there');
          const amt = rentFor(me, d);
          pending = { kind: 'pay', amounts: Object.fromEntries(others.map((i) => [i, amt])), targets: others, district: d };
          text = `${DISTRICTS[d].name} rent: ${amt}`;
          break;
        }
        case 'tax':
          if (!validTarget) throw new Error('pick a player');
          pending = { kind: 'pay', amounts: { [target]: 4 }, targets: [target] };
          text = `${nm(s, target)} pays 4`;
          break;
        case 'party':
          pending = { kind: 'pay', amounts: Object.fromEntries(others.map((i) => [i, 2])), targets: others };
          text = 'everyone pays 2';
          break;
        case 'swipe': {
          if (!validTarget || !loose(s.players[target]).includes(Number(a.take))) throw new Error('pick a property');
          pending = { kind: 'swipe', targets: [target], take: Number(a.take) };
          text = `wants ${nm(s, target)}’s ${cardName(Number(a.take))}`;
          break;
        }
        case 'swap': {
          if (!validTarget || !loose(s.players[target]).includes(Number(a.take)) || !loose(me).includes(Number(a.give))) throw new Error('pick properties');
          pending = { kind: 'swap', targets: [target], take: Number(a.take), give: Number(a.give) };
          text = `offers ${cardName(Number(a.give))} for ${nm(s, target)}’s ${cardName(Number(a.take))}`;
          break;
        }
        case 'takeover': {
          if (!validTarget || !DISTRICTS[a.district] || !isComplete(s.players[target], a.district)) throw new Error('pick a complete set');
          pending = { kind: 'takeover', targets: [target], district: a.district };
          text = `wants ${nm(s, target)}’s ${DISTRICTS[a.district].name} set`;
          break;
        }
        default:
          throw new Error('keep Shields to block actions (or bank them)');
      }
      removeFrom(me.hand, id);
      s.discard.push(id);
      s.plays--;
      s.actionNo++;
      if (act === 'windfall') {
        drawInto(s, me.hand, rand || []);
        addLog(s, `🎁 ${me.name} played Windfall and drew 2.`);
        s.event = { kind: 'action', seat, action: act, text: 'drew 2 cards' };
        return s;
      }
      addLog(s, `${ACTIONS[act].icon} ${me.name} played ${ACTIONS[act].name}: ${text}.`);
      s.event = { kind: 'action', seat, action: act, text };
      // nobody to answer (e.g. everyone's broke)? resolve immediately
      pending.targets = pending.targets.filter((t) => pending.kind !== 'pay' || assets(s.players[t]).length || s.players[t].hand.some((x) => CARDS[x].action === 'shield'));
      if (!pending.targets.length) return s;
      s.pending = { ...pending, by: seat, card: id, done: {}, deadline: now + RESPOND_MS };
      s.phase = 'respond';
      return s;
    }
    case 'respond': {
      if (s.phase !== 'respond' || !s.pending.targets.includes(seat) || s.pending.done[seat]) throw new Error('nothing to answer');
      respondOne(s, seat, a.r || {});
      finishPending(s);
      return s;
    }
    case 'timeout': {
      if (s.phase !== 'respond' || seat !== -1) throw new Error('not now');
      for (const t of s.pending.targets) {
        if (!s.pending.done[t]) {
          addLog(s, `⏱️ ${nm(s, t)} didn’t answer in time.`);
          respondOne(s, t, { type: 'auto' });
        }
      }
      finishPending(s);
      return s;
    }
    case 'end': {
      if (s.phase !== 'play' || seat !== s.current) throw new Error('not now');
      if (s.players[seat].hand.length > HAND_MAX) { s.phase = 'discard'; return s; }
      nextTurn(s);
      return s;
    }
    case 'discard': {
      if (s.phase !== 'discard' || seat !== s.current) throw new Error('not now');
      const p = s.players[seat];
      const ids = [...new Set((a.cards || []).map(Number))];
      if (ids.length !== p.hand.length - HAND_MAX || !ids.every((id) => p.hand.includes(id))) throw new Error(`discard ${p.hand.length - HAND_MAX}`);
      for (const id of ids) { removeFrom(p.hand, id); s.discard.push(id); }
      addLog(s, `${p.name} discarded ${ids.length}.`);
      nextTurn(s);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

export function tick(s, now) {
  if (s.phase === 'deal') return { type: 'deal' };
  if (s.phase === 'draw') return { type: 'draw' };
  if (s.phase === 'respond' && now >= s.pending.deadline) return { type: 'timeout' };
  return null;
}
