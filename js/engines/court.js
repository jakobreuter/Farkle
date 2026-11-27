// Court Intrigue: an original hidden-role bluffing game. Pure rules, no DOM, no randomness
// (random picks are passed in by the caller as `rand` integers).
//
// Each player holds two face-down role cards ("influence") and some coins. On your turn
// you take one action. Some actions belong to a role, and you may claim any role, true or
// not. Anyone may challenge a claim: a true claimer shows the card, shuffles it back into
// the court deck, draws a fresh one, and the challenger loses a card; a caught bluffer
// loses a card instead. Some actions can be blocked by claiming a role (and blocks can be
// challenged too). Lose both cards and you're out; the last player in the court wins.

export const ROLES = ['treasurer', 'poisoner', 'physician', 'smuggler', 'spymaster'];

export const ROLE_INFO = {
  treasurer: { name: 'Treasurer', icon: '💰', power: 'Levy: take 3 coins', block: 'Blocks Petition' },
  poisoner: { name: 'Poisoner', icon: '🧪', power: 'Poison: pay 3, a rival loses a card', block: '' },
  physician: { name: 'Physician', icon: '🩺', power: 'No action', block: 'Blocks Poison' },
  smuggler: { name: 'Smuggler', icon: '🗝️', power: 'Steal 2 coins', block: 'Blocks stealing' },
  spymaster: { name: 'Spymaster', icon: '🕵️', power: 'Swap: draw 2, keep any', block: 'Blocks stealing' },
};

// role: the role claimed to take the action; blockers: roles that can block it;
// blockAny: anyone (not only the target) may block.
export const ACTIONS = {
  wages: { label: 'Wages', sub: '+1 coin', role: null, cost: 0, target: false, blockers: [] },
  petition: { label: 'Petition', sub: '+2 coins', role: null, cost: 0, target: false, blockers: ['treasurer'], blockAny: true },
  banish: { label: 'Banish', sub: 'pay 7', role: null, cost: 7, target: true, blockers: [] },
  levy: { label: 'Levy', sub: '+3 coins', role: 'treasurer', cost: 0, target: false, blockers: [] },
  poison: { label: 'Poison', sub: 'pay 3', role: 'poisoner', cost: 3, target: true, blockers: ['physician'] },
  steal: { label: 'Steal', sub: 'take 2', role: 'smuggler', cost: 0, target: true, blockers: ['smuggler', 'spymaster'] },
  swap: { label: 'Swap', sub: 'court deck', role: 'spymaster', cost: 0, target: false, blockers: [] },
};
export const ACTION_ORDER = ['wages', 'petition', 'banish', 'levy', 'poison', 'steal', 'swap'];

export const LOSE_MS = 20000; // time to pick which card to reveal
export const SWAP_MS = 30000; // time to pick which cards to keep
export const MUST_BANISH = 10;

export function newGame(players, first = 0, { reactMs = 8000 } = {}) {
  return {
    players: players.map((p) => ({ pid: p.pid, name: p.name, coins: 2, cards: [] })),
    deck: ROLES.flatMap((r) => [r, r, r]),
    phase: 'deal', // deal | turn | react | lose | swapDraw | swap | over
    current: first,
    turn: 0,
    quiet: 0, // turns since anyone lost a card (bots play safer when the table stalls)
    reactMs,
    pending: null, // { act, actor, target, role, stage, block, passed, until }
    lose: null, // { seat, until, next }
    swap: null, // { seat, options, keep, until }
    winner: null,
    fx: { n: 0 }, // last notable event, for the view's banners
    log: ['A new court convenes.'],
  };
}

export const faceDown = (p) => p.cards.filter((c) => !c.up).length;
export const isIn = (s, i) => !!s.players[i] && faceDown(s.players[i]) > 0;
export const alive = (s) => s.players.map((p, i) => (faceDown(p) > 0 ? i : -1)).filter((i) => i >= 0);

export function nextAlive(s, seat) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (seat + k) % n;
    if (isIn(s, i)) return i;
  }
  return seat;
}

const nm = (s, i) => s.players[i].name;
const roleName = (r) => `${ROLE_INFO[r].icon} ${ROLE_INFO[r].name}`;
function addLog(s, msg) { s.log = [...s.log, msg].slice(-40); }
function fx(s, kind, extra = {}) { s.fx = { n: (s.fx?.n || 0) + 1, kind, ...extra }; }

/** "claims 💰 Treasurer: levy 3 coins" — what the actor is doing, without their name */
export function claimText(s, p = s.pending) {
  if (!p) return '';
  const t = p.target != null ? nm(s, p.target) : '';
  switch (p.act) {
    case 'wages': return 'takes Wages: +1 coin';
    case 'petition': return 'petitions the crown: +2 coins';
    case 'banish': return `pays 7 to banish ${t}`;
    case 'levy': return `claims ${roleName('treasurer')}: levy 3 coins`;
    case 'poison': return `claims ${roleName('poisoner')}: poison ${t}`;
    case 'steal': return `claims ${roleName('smuggler')}: steal from ${t}`;
    case 'swap': return `claims ${roleName('spymaster')}: swap cards`;
    default: return '';
  }
}

/** seats that may block the pending action */
export function blockerSeats(s) {
  const p = s.pending;
  if (!p) return [];
  const A = ACTIONS[p.act];
  if (!A.blockers.length) return [];
  if (A.blockAny) return alive(s).filter((i) => i !== p.actor);
  return p.target != null && isIn(s, p.target) ? [p.target] : [];
}

/** seats that may challenge in the current window */
export function challengerSeats(s, stage = s.pending?.stage) {
  const p = s.pending;
  if (!p) return [];
  if (stage === 'act') return p.role ? alive(s).filter((i) => i !== p.actor) : [];
  if (stage === 'blockChal') return alive(s).filter((i) => i !== p.block.seat);
  return [];
}

/** everyone who gets a say in the current reaction window */
export function eligible(s, stage = s.pending?.stage) {
  const set = new Set(challengerSeats(s, stage));
  if (stage === 'act' || stage === 'block') for (const i of blockerSeats(s)) set.add(i);
  return [...set].sort((a, b) => a - b);
}

/** seats that still have to answer the open window */
export const waitingOn = (s) => (s.phase === 'react' ? eligible(s).filter((i) => !s.pending.passed.includes(i)) : []);

export function canChallenge(s, seat) {
  if (s.phase !== 'react' || s.pending.passed.includes(seat)) return false;
  return challengerSeats(s).includes(seat);
}

export function canBlock(s, seat, role) {
  if (s.phase !== 'react' || s.pending.passed.includes(seat)) return false;
  const st = s.pending.stage;
  if (st !== 'act' && st !== 'block') return false;
  if (role != null && !ACTIONS[s.pending.act].blockers.includes(role)) return false;
  return blockerSeats(s).includes(seat);
}

/** may this seat take this action right now? (returns an error message, or '' if fine) */
export function actionError(s, seat, act, target) {
  if (s.phase !== 'turn') return 'not time for an action';
  if (seat !== s.current) return 'not your turn';
  const A = ACTIONS[act];
  if (!A) return 'unknown action';
  const me = s.players[seat];
  if (me.coins >= MUST_BANISH && act !== 'banish') return 'with 10+ coins you must banish';
  if (me.coins < A.cost) return 'not enough coins';
  if (A.target) {
    if (!Number.isInteger(target) || target === seat || !isIn(s, target)) return 'pick a rival who is still in';
    if (act === 'steal' && s.players[target].coins < 1) return 'they have no coins';
  }
  return '';
}

// ---------- flow ----------

function checkOver(s) {
  const left = alive(s);
  if (left.length > 1) return false;
  s.phase = 'over';
  s.winner = left[0] ?? null;
  s.pending = null;
  s.lose = null;
  s.swap = null;
  if (s.winner != null) {
    s.current = s.winner;
    addLog(s, `${nm(s, s.winner)} rules the court!`);
  }
  return true;
}

function endTurn(s) {
  if (checkOver(s)) return;
  s.pending = null;
  s.lose = null;
  s.swap = null;
  s.phase = 'turn';
  s.current = nextAlive(s, s.current);
  s.turn += 1;
  s.quiet = (s.quiet || 0) + 1;
}

function openWindow(s, stage, now) {
  s.pending.stage = stage;
  s.pending.passed = [];
  if (!eligible(s, stage).length) return closeWindow(s, now);
  s.phase = 'react';
  s.pending.until = now + s.reactMs;
}

function closeWindow(s, now) {
  const p = s.pending;
  if (p.stage === 'blockChal') {
    addLog(s, `${nm(s, p.block.seat)}’s block stands.`);
    fx(s, 'blocked', { seat: p.block.seat, role: p.block.role });
    return endTurn(s);
  }
  return resolveAction(s, now);
}

function resolveAction(s, now) {
  const p = s.pending;
  const me = s.players[p.actor];
  const t = p.target != null ? s.players[p.target] : null;
  switch (p.act) {
    case 'wages': me.coins += 1; break;
    case 'petition': me.coins += 2; addLog(s, `${me.name} takes 2 coins.`); break;
    case 'levy': me.coins += 3; addLog(s, `${me.name} levies 3 coins.`); break;
    case 'steal': {
      if (!isIn(s, p.target)) break;
      const k = Math.min(2, t.coins);
      t.coins -= k;
      me.coins += k;
      addLog(s, `${me.name} steals ${k} from ${t.name}.`);
      fx(s, 'steal', { seat: p.actor, target: p.target, k });
      break;
    }
    case 'poison':
    case 'banish':
      if (!isIn(s, p.target)) break;
      addLog(s, `${t.name} ${p.act === 'poison' ? 'is poisoned' : 'is banished'} and loses a card.`);
      return loseCard(s, p.target, now, 'end');
    case 'swap':
      s.phase = 'swapDraw';
      return undefined;
    default:
  }
  return endTurn(s);
}

function reveal(s, seat, idx) {
  const p = s.players[seat];
  p.cards[idx].up = true;
  s.quiet = 0;
  const out = faceDown(p) === 0;
  addLog(s, `${p.name} reveals ${roleName(p.cards[idx].r)}${out ? ' and is out of the court' : ''}.`);
  fx(s, out ? 'out' : 'lose', { seat, role: p.cards[idx].r });
}

/** seat loses a card (chooses which if they hold two), then the flow continues with `next` */
function loseCard(s, seat, now, next) {
  const p = s.players[seat];
  const down = p.cards.map((c, i) => (c.up ? -1 : i)).filter((i) => i >= 0);
  if (down.length === 0) return continueWith(s, next, now);
  if (down.length === 1) {
    reveal(s, seat, down[0]);
    return continueWith(s, next, now);
  }
  s.phase = 'lose';
  s.lose = { seat, until: now + LOSE_MS, next };
  return undefined;
}

function continueWith(s, next, now) {
  s.lose = null;
  if (checkOver(s)) return;
  if (next === 'resolve') {
    if (!isIn(s, s.pending.actor)) return endTurn(s);
    return resolveAction(s, now);
  }
  if (next === 'block') return openWindow(s, 'block', now);
  return endTurn(s);
}

/** the random range a challenge needs (one pick from the deck after the shown card goes back in) */
export const challengeRange = (s) => s.deck.length + 1;

/**
 * seat: -1 for system actions ('deal', 'timeout', 'draw'); otherwise the acting player.
 * rand: integers from the caller, see randomFor in the plugin.
 */
export function applyAction(state, a, seat, { now = 0, rand = null } = {}) {
  const s = structuredClone(state);
  const sys = a.type === 'deal' || a.type === 'timeout' || a.type === 'draw';
  if (sys !== (seat === -1)) throw new Error('not allowed');
  if (s.phase === 'over') throw new Error('game over');
  switch (a.type) {
    case 'deal': {
      if (s.phase !== 'deal') throw new Error('already dealt');
      const n = s.players.length;
      if (!rand || rand.length !== n * 2) throw new Error('bad deal');
      for (let k = 0; k < n * 2; k++) {
        const r = rand[k];
        if (!Number.isInteger(r) || r < 0 || r >= s.deck.length) throw new Error('bad deal');
        s.players[k % n].cards.push({ r: s.deck.splice(r, 1)[0], up: false });
      }
      s.phase = 'turn';
      addLog(s, `${nm(s, s.current)} goes first.`);
      return s;
    }

    case 'act': {
      const act = String(a.act);
      const target = a.target == null ? null : Number(a.target);
      const err = actionError(s, seat, act, target);
      if (err) throw new Error(err);
      const A = ACTIONS[act];
      s.players[seat].coins -= A.cost;
      s.pending = { act, actor: seat, target: A.target ? target : null, role: A.role, stage: null, block: null, passed: [], until: 0 };
      addLog(s, `${nm(s, seat)} ${claimText(s)}.`);
      fx(s, 'act', { seat, act });
      if (!A.role && !A.blockers.length) {
        resolveAction(s, now);
        return s;
      }
      openWindow(s, 'act', now);
      return s;
    }

    case 'pass': {
      if (s.phase !== 'react') throw new Error('nothing to answer');
      if (!eligible(s).includes(seat) || s.pending.passed.includes(seat)) throw new Error('not yours to answer');
      s.pending.passed = [...s.pending.passed, seat];
      if (!waitingOn(s).length) closeWindow(s, now);
      return s;
    }

    case 'timeout': {
      // system step from the host's tick; `at` names the timer it was meant for, so a
      // stale timeout can never cut short a newer window
      const at = a.at;
      if (s.phase === 'react' && at === s.pending.until) {
        closeWindow(s, now);
        return s;
      }
      if (s.phase === 'lose' && at === s.lose.until) {
        const p = s.players[s.lose.seat];
        reveal(s, s.lose.seat, p.cards.findIndex((c) => !c.up));
        continueWith(s, s.lose.next, now);
        return s;
      }
      if (s.phase === 'swap' && at === s.swap.until) {
        keepCards(s, s.swap.options.map((_, i) => i).slice(0, s.swap.keep));
        return s;
      }
      throw new Error('nothing has timed out');
    }

    case 'challenge': {
      if (!canChallenge(s, seat)) throw new Error('you can’t challenge now');
      const p = s.pending;
      const stage = p.stage;
      const claimer = stage === 'act' ? p.actor : p.block.seat;
      const role = stage === 'act' ? p.role : p.block.role;
      const cl = s.players[claimer];
      const idx = cl.cards.findIndex((c) => !c.up && c.r === role);
      s.phase = 'resolving';
      if (idx >= 0) {
        const range = s.deck.length + 1;
        const r = rand?.[0];
        if (!Number.isInteger(r) || r < 0 || r >= range) throw new Error('no shuffle');
        s.deck.push(role);
        cl.cards[idx] = { r: s.deck.splice(r, 1)[0], up: false };
        addLog(s, `${nm(s, seat)} challenges — ${cl.name} shows ${roleName(role)}! ${nm(s, seat)} loses a card; ${cl.name} draws a fresh one.`);
        fx(s, 'proved', { seat: claimer, by: seat, role });
        loseCard(s, seat, now, stage === 'act' ? 'block' : 'end');
      } else {
        addLog(s, `${nm(s, seat)} challenges — ${cl.name} was bluffing about ${roleName(role)}!`);
        fx(s, 'caught', { seat: claimer, by: seat, role });
        if (stage === 'blockChal') p.block = { ...p.block, failed: true };
        loseCard(s, claimer, now, stage === 'act' ? 'end' : 'resolve');
      }
      return s;
    }

    case 'block': {
      const role = String(a.role);
      if (!canBlock(s, seat, role)) throw new Error('you can’t block that');
      s.pending.block = { seat, role };
      addLog(s, `${nm(s, seat)} blocks, claiming ${roleName(role)}.`);
      fx(s, 'block', { seat, role });
      openWindow(s, 'blockChal', now);
      return s;
    }

    case 'reveal': {
      if (s.phase !== 'lose' || seat !== s.lose.seat) throw new Error('not yours to reveal');
      const idx = Number(a.idx);
      const c = s.players[seat].cards[idx];
      if (!c || c.up) throw new Error('pick a hidden card');
      reveal(s, seat, idx);
      continueWith(s, s.lose.next, now);
      return s;
    }

    case 'draw': {
      if (s.phase !== 'swapDraw') throw new Error('nothing to draw');
      const n = s.deck.length;
      if (!rand || rand.length !== 2 || !Number.isInteger(rand[0]) || !Number.isInteger(rand[1])
        || rand[0] < 0 || rand[0] >= n || rand[1] < 0 || rand[1] >= n - 1) throw new Error('bad draw');
      const d1 = s.deck.splice(rand[0], 1)[0];
      const d2 = s.deck.splice(rand[1], 1)[0];
      const seatA = s.pending.actor;
      const mine = s.players[seatA].cards.filter((c) => !c.up).map((c) => c.r);
      s.swap = { seat: seatA, options: [...mine, d1, d2], keep: mine.length, until: now + SWAP_MS };
      s.phase = 'swap';
      return s;
    }

    case 'keep': {
      if (s.phase !== 'swap' || seat !== s.swap.seat) throw new Error('not your swap');
      const idx = Array.isArray(a.idx) ? a.idx.map(Number) : [];
      const ok = idx.length === s.swap.keep && new Set(idx).size === idx.length
        && idx.every((i) => Number.isInteger(i) && i >= 0 && i < s.swap.options.length);
      if (!ok) throw new Error(`keep exactly ${s.swap.keep}`);
      keepCards(s, idx);
      return s;
    }

    default:
      throw new Error('unknown action');
  }
}

function keepCards(s, idx) {
  const { seat, options } = s.swap;
  const p = s.players[seat];
  const kept = idx.map((i) => options[i]);
  let k = 0;
  p.cards = p.cards.map((c) => (c.up ? c : { r: kept[k++], up: false }));
  options.forEach((r, i) => { if (!idx.includes(i)) s.deck.push(r); });
  addLog(s, `${p.name} swaps with the court deck.`);
  endTurn(s);
}

// ---------- computer player ----------

/** small deterministic pseudo-random number in [0,1) — no Math.random in the rules */
function rnd(s, seat, salt) {
  let x = (s.turn * 7919 + seat * 104729 + (s.fx?.n || 0) * 31337 + salt * 9973 + s.log.length * 613) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return (x % 10007) / 10007;
}

const VALUE = { treasurer: 5, poisoner: 4.5, smuggler: 3.6, physician: 3.2, spymaster: 2.6 };

/** copies of a role this seat can see (revealed anywhere + its own hidden cards) */
export function visibleCount(s, seat, role) {
  let c = 0;
  s.players.forEach((p, i) => p.cards.forEach((x) => { if (x.r === role && (x.up || i === seat)) c++; }));
  return c;
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** chance, from `seat`'s point of view, that `claimer` really holds `role` */
export function chanceHolds(s, seat, claimer, role) {
  const left = 3 - visibleCount(s, seat, role);
  if (left <= 0) return 0;
  let unknown = s.deck.length;
  s.players.forEach((p, i) => { if (i !== seat) unknown += faceDown(p); });
  const k = faceDown(s.players[claimer]);
  if (unknown <= 0) return 0;
  return 1 - choose(unknown - left, k) / choose(unknown, k);
}

const strength = (s, i) => faceDown(s.players[i]) * 10 + s.players[i].coins;
function strongest(s, seat, filter = () => true) {
  let best = null;
  for (const i of alive(s)) {
    if (i === seat || !filter(i)) continue;
    if (best == null || strength(s, i) > strength(s, best)) best = i;
  }
  return best;
}

function botTurn(s, seat) {
  const me = s.players[seat];
  const hand = me.cards.filter((c) => !c.up).map((c) => c.r);
  const has = (r) => hand.includes(r);
  const ok = (act, target) => !actionError(s, seat, act, target);
  const strong = strongest(s, seat);
  const quiet = s.quiet || 0;
  const stalled = quiet > 2 * s.players.length + 4;
  if (me.coins >= MUST_BANISH) return { type: 'act', act: 'banish', target: strong };
  if (me.coins >= 7 && (stalled || rnd(s, seat, 1) < 0.9)) return { type: 'act', act: 'banish', target: strong };
  // a long stalemate: save up for a Banish, which nobody can stop
  if (quiet > 5 * s.players.length + 8) return { type: 'act', act: has('treasurer') ? 'levy' : 'wages' };
  if (has('poisoner') && ok('poison', strong) && rnd(s, seat, 11) < (stalled ? 0.2 : 1)) return { type: 'act', act: 'poison', target: strong };
  const rich = strongest(s, seat, (i) => s.players[i].coins >= 2);
  if (has('treasurer')) return { type: 'act', act: 'levy' };
  if (has('smuggler') && rich != null && rnd(s, seat, 9) < (stalled ? 0.15 : 0.7)) return { type: 'act', act: 'steal', target: rich };
  if (stalled && rnd(s, seat, 10) < 0.7) return { type: 'act', act: 'wages' };

  // bluff sometimes, preferring the role the table can least disprove
  if (rnd(s, seat, 2) < 0.3) {
    const opts = [];
    if (visibleCount(s, seat, 'treasurer') < 2) opts.push({ w: 3 - visibleCount(s, seat, 'treasurer'), a: { type: 'act', act: 'levy' } });
    if (rich != null && visibleCount(s, seat, 'smuggler') < 2) opts.push({ w: 2 - visibleCount(s, seat, 'smuggler') * 0.5, a: { type: 'act', act: 'steal', target: rich } });
    if (ok('poison', strong) && visibleCount(s, seat, 'poisoner') < 2) opts.push({ w: 1.5, a: { type: 'act', act: 'poison', target: strong } });
    if (opts.length) {
      const tot = opts.reduce((x, o) => x + o.w, 0);
      let r = rnd(s, seat, 3) * tot;
      for (const o of opts) { r -= o.w; if (r <= 0) return o.a; }
      return opts[opts.length - 1].a;
    }
  }
  if (has('spymaster') && !has('physician') && rnd(s, seat, 4) < 0.6) return { type: 'act', act: 'swap' };
  // petition is safe when the Treasurers are mostly accounted for
  const tv = visibleCount(s, seat, 'treasurer');
  if (rnd(s, seat, 5) < 0.45 + tv * 0.18) return { type: 'act', act: 'petition' };
  return { type: 'act', act: 'wages' };
}

function botReact(s, seat) {
  const p = s.pending;
  const me = s.players[seat];
  const lives = faceDown(me);
  const hand = me.cards.filter((c) => !c.up).map((c) => c.r);
  const st = p.stage;
  if (st === 'blockChal') {
    if (!canChallenge(s, seat)) return { type: 'pass' };
    const pHas = chanceHolds(s, seat, p.block.seat, p.block.role);
    let thr = seat === p.actor ? (p.act === 'poison' ? 0.32 : 0.24) : 0.08;
    if (lives === 1) thr *= 0.6;
    if (pHas < thr || pHas === 0) return { type: 'challenge' };
    return { type: 'pass' };
  }
  const A = ACTIONS[p.act];
  const iCanBlock = canBlock(s, seat);
  const trueBlock = iCanBlock ? A.blockers.find((r) => hand.includes(r)) : null;
  const targeted = p.target === seat;

  if (trueBlock && (p.act !== 'petition' || rnd(s, seat, 6) < 0.8)) return { type: 'block', role: trueBlock };

  if (st === 'act' && canChallenge(s, seat)) {
    const pHas = chanceHolds(s, seat, p.actor, p.role);
    let thr = 0.18;
    if (targeted && p.act === 'poison') thr = lives === 1 ? 0.45 : 0.3;
    else if (targeted) thr = 0.24;
    else if (lives === 1) thr = 0.08;
    if (p.act === 'levy' && s.players[p.actor].coins >= 5) thr += 0.1;
    if (pHas === 0 || (pHas < thr && rnd(s, seat, 7) < 0.85)) return { type: 'challenge' };
  }

  if (iCanBlock) {
    // bluff a block
    const pick = A.blockers.slice().sort((a, b) => visibleCount(s, seat, a) - visibleCount(s, seat, b))[0];
    if (visibleCount(s, seat, pick) < 3) {
      let chance = 0;
      if (p.act === 'poison' && targeted) chance = lives === 1 ? 0.9 : 0.4;
      else if (p.act === 'steal' && targeted) chance = me.coins >= 2 ? 0.25 : 0.05;
      else if (p.act === 'petition') chance = strength(s, p.actor) >= strength(s, seat) ? 0.1 : 0.03;
      if (rnd(s, seat, 8) < chance) return { type: 'block', role: pick };
    }
  }
  return { type: 'pass' };
}

/** pick a hand of `k` roles from options, favouring strong and varied cards; returns indices */
function bestKeep(options, k) {
  const chosen = [];
  for (let n = 0; n < k; n++) {
    let best = -1;
    let bv = -Infinity;
    options.forEach((r, i) => {
      if (chosen.includes(i)) return;
      const dup = chosen.some((j) => options[j] === r) ? 2.5 : 0;
      const v = VALUE[r] - dup;
      if (v > bv) { bv = v; best = i; }
    });
    chosen.push(best);
  }
  return chosen;
}

/** one legal action for a computer player in `seat`, or null if it has nothing to do */
export function botAction(s, seat) {
  if (!isIn(s, seat)) return null;
  switch (s.phase) {
    case 'turn':
      return s.current === seat ? botTurn(s, seat) : null;
    case 'react':
      return waitingOn(s).includes(seat) ? botReact(s, seat) : null;
    case 'lose': {
      if (s.lose.seat !== seat) return null;
      const cards = s.players[seat].cards;
      let idx = -1;
      cards.forEach((c, i) => { if (!c.up && (idx < 0 || VALUE[c.r] < VALUE[cards[idx].r])) idx = i; });
      return { type: 'reveal', idx };
    }
    case 'swap':
      return s.swap.seat === seat ? { type: 'keep', idx: bestKeep(s.swap.options, s.swap.keep) } : null;
    default:
      return null;
  }
}
