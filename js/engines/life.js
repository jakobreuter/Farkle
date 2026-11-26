// Life Path — an original life-journey board game (pure rules, no DOM).
//
// Spin 1–10 and walk a winding road from Start to Retirement. Along the way:
//   • Payday    — collect your salary every time you PASS or LAND on one
//   • Cash      — a light-hearted life event (+/− money)
//   • Career    — pick one of two job cards (or keep yours)
//   • Family    — find a partner, then kids; family is worth a bonus at the end
//   • House     — buy one of three homes (or skip); its resale value counts at the end
//   • Stops     — the pawn always halts here and you must decide (route forks, graduation…)
// Cash below zero automatically takes loans of 10k (each repaid as 12k at the end).
// Final worth = cash + house resale + family bonus + retirement bonus − 12k per loan.
// Everyone plays until all have retired; the richest life wins.

export const K = 1000;
export const START_CASH = 10 * K;
export const LOAN = 10 * K;
export const LOAN_REPAY = 12 * K;
export const STUDENT_LOANS = 2;
export const PARTNER_BONUS = 20 * K;
export const KID_BONUS = 15 * K;
export const MAX_KIDS = 4;
export const RETIRE_BONUS = [40 * K, 30 * K, 20 * K, 10 * K, 10 * K, 10 * K];

export const SPIN_MS = 1100; // spinner animation
export const HOP_MS = 260; // per space hopped
export const SHOW_MS = 2300; // reading time for an event
export const CHOICE_SHOW_MS = 1500; // after a decision

// ---------- cards ----------
export const BASIC_CAREERS = [
  { name: 'Bike Courier', icon: '🚲', salary: 30 * K },
  { name: 'Shop Clerk', icon: '🛒', salary: 35 * K },
  { name: 'Line Cook', icon: '🍳', salary: 40 * K },
  { name: 'Mail Carrier', icon: '📮', salary: 40 * K },
  { name: 'Hairstylist', icon: '✂️', salary: 45 * K },
  { name: 'Bus Driver', icon: '🚌', salary: 45 * K },
  { name: 'Landscaper', icon: '🌳', salary: 50 * K },
  { name: 'Electrician', icon: '⚡', salary: 55 * K },
  { name: 'Plumber', icon: '🔧', salary: 60 * K },
];
export const DEGREE_CAREERS = [
  { name: 'Teacher', icon: '📚', salary: 50 * K },
  { name: 'Journalist', icon: '📰', salary: 55 * K },
  { name: 'Marine Biologist', icon: '🐬', salary: 60 * K },
  { name: 'Architect', icon: '📐', salary: 65 * K },
  { name: 'Engineer', icon: '⚙️', salary: 70 * K },
  { name: 'Veterinarian', icon: '🐾', salary: 75 * K },
  { name: 'Software Dev', icon: '💻', salary: 80 * K },
  { name: 'Pharmacist', icon: '💊', salary: 85 * K },
  { name: 'Surgeon', icon: '🩺', salary: 95 * K },
];
export const ALL_CAREERS = [...BASIC_CAREERS, ...DEGREE_CAREERS];

export const HOUSES = [
  { name: 'Cozy Studio', icon: '🏢', price: 40 * K, worth: 55 * K },
  { name: 'Tiny Cabin', icon: '🛖', price: 50 * K, worth: 60 * K },
  { name: 'Houseboat', icon: '⛵', price: 60 * K, worth: 50 * K },
  { name: 'Fixer-Upper Farmhouse', icon: '🚜', price: 70 * K, worth: 115 * K },
  { name: 'Beach Shack', icon: '🏖️', price: 80 * K, worth: 75 * K },
  { name: 'Lakeside Bungalow', icon: '🏡', price: 90 * K, worth: 125 * K },
  { name: 'Townhouse', icon: '🏘️', price: 110 * K, worth: 140 * K },
  { name: 'Treehouse Villa', icon: '🌲', price: 130 * K, worth: 180 * K },
  { name: 'Downtown Loft', icon: '🌆', price: 150 * K, worth: 170 * K },
  { name: 'Hilltop Manor', icon: '🏰', price: 240 * K, worth: 300 * K },
];

// [text, amount in k]
export const EVENTS = {
  young: [
    ['Grandma’s birthday card had cash in it.', 2],
    ['Cracked your phone doing a cartwheel.', -1],
    ['Won the town pie-eating contest.', 3],
    ['Festival tickets. Worth every penny.', -2],
    ['Sold your old comic book stash.', 2],
    ['Your first car needs a new muffler.', -3],
  ],
  study: [
    ['Textbooks cost HOW much?!', -3],
    ['Scholarship for your essay on llamas.', 5],
    ['The late-night pizza fund runs dry.', -2],
    ['Tutoring side gig pays off.', 3],
    ['Laptop meets a mug of cocoa.', -4],
    ['Campus trivia champions!', 2],
  ],
  life: [
    ['Employee of the month bonus!', 6],
    ['The car makes a brand new noise.', -4],
    ['Sold a painting at the street fair.', 8],
    ['Surprise trip to the dentist.', -5],
    ['Garage sale goldmine.', 4],
    ['Raccoons moved into the attic.', -6],
    ['Won the neighborhood raffle!', 10],
    ['A parade of parking tickets.', -3],
    ['The water heater gives up.', -8],
    ['Your weekend side hustle takes off.', 7],
    ['Tax refund arrives early.', 5],
    ['Treated everyone to karaoke night.', -4],
  ],
  safe: [
    ['Savings account interest.', 4],
    ['Coupon champion of the year.', 3],
    ['Overtime shift pays double.', 6],
    ['Small fender bender.', -3],
    ['Gym membership you never use.', -2],
    ['Found an old savings bond.', 5],
  ],
  risk: [
    ['Your friend’s food-truck empire booms — you invested early!', 60],
    ['Bought a vintage sailboat. It sank.', -30],
    ['Patent for self-folding socks sells!', 80],
    ['Your barber’s stock tip was… wrong.', -25],
    ['Hot streak at the county fair games.', 40],
    ['The smart-toaster startup fizzles.', -20],
    ['Rare sneakers resell for a fortune.', 50],
    ['Hot-air balloon tour business pops.', -35],
  ],
};

// ---------- board ----------
// Laid out on a 6-column grid (cols 0–2 | aisle | cols 3–5), rows going down.
// Fork lanes run side by side: left lane cols 0–2, right lane cols 3–5.
export const TYPES = {
  start: { icon: '🚩', tag: 'START', name: 'Start' },
  payday: { icon: '💵', tag: 'PAY', name: 'Payday' },
  cash: { icon: '🎲', tag: 'EVENT', name: 'Life event' },
  career: { icon: '💼', tag: 'JOB', name: 'Career' },
  family: { icon: '❤️', tag: 'FAMILY', name: 'Family' },
  house: { icon: '🏠', tag: 'HOME', name: 'House' },
  stop: { icon: '✋', tag: 'STOP', name: 'Stop' },
  retire: { icon: '🏖️', tag: 'RETIRE', name: 'Retirement' },
};

export const BOARD = [];
export const LANES = []; // {label, col0, row0, rows} for drawing lane captions

function lay(cells, cols, row, dir, extra = {}) {
  // serpentine over the given columns starting at `row`, `dir` = 1 (left→right) or −1
  const ids = [];
  let i = 0;
  let r = row;
  let d = dir;
  while (i < cells.length) {
    const order = d === 1 ? cols : [...cols].reverse();
    for (const c of order) {
      if (i >= cells.length) break;
      const [t, more] = Array.isArray(cells[i]) ? cells[i] : [cells[i], {}];
      const sp = { id: BOARD.length, t, col: c, row: r, next: [], ...extra, ...more };
      if (BOARD.length && ids.length) BOARD[ids[ids.length - 1]].next.push(sp.id);
      BOARD.push(sp);
      ids.push(sp.id);
      i++;
    }
    r++;
    d = -d;
  }
  return ids;
}
const link = (a, b) => BOARD[a].next.push(b);
const L3 = [0, 1, 2];
const R3 = [3, 4, 5];
const ALL6 = [0, 1, 2, 3, 4, 5];

{
  const main0 = lay(['start', 'cash', 'cash', 'cash', 'cash', ['stop', { stop: 'fork1' }]], ALL6, 0, 1, { pool: 'young' });
  const college = lay(['cash', 'cash', 'family', 'cash', 'cash', 'cash', 'family', 'cash', ['stop', { stop: 'grad' }]], L3, 1, -1, { pool: 'study', lane: 'college' });
  const work = lay(['payday', 'cash', 'cash', 'family', 'payday', 'cash', 'career', 'cash', 'payday'], R3, 1, -1, { pool: 'life', lane: 'work' });
  const fork1 = main0[main0.length - 1];
  link(fork1, college[0]);
  link(fork1, work[0]);
  const main1 = lay(['payday', 'family', 'cash', 'house', 'cash', 'payday', 'family', 'cash', 'house', 'cash', 'career', ['stop', { stop: 'fork2' }]], ALL6, 4, 1, { pool: 'life' });
  link(college[college.length - 1], main1[0]);
  link(work[work.length - 1], main1[0]);
  const safe = lay(['payday', 'cash', 'family', 'cash', 'payday', 'house', 'cash', 'cash', 'payday'], L3, 6, 1, { pool: 'safe', lane: 'safe' });
  const risky = lay(['cash', 'payday', 'cash', 'cash', 'family', 'cash', 'payday', 'house', 'cash'], R3, 6, 1, { pool: 'risk', lane: 'risky' });
  const fork2 = main1[main1.length - 1];
  link(fork2, safe[0]);
  link(fork2, risky[0]);
  const main2 = lay(['payday', 'family', 'cash', 'house', 'cash', ['stop', { stop: 'rethink' }], 'payday', 'cash', 'family', 'cash', 'house', 'cash', 'payday', 'cash', 'family', 'cash', 'cash', 'retire'], ALL6, 9, -1, { pool: 'life' });
  link(safe[safe.length - 1], main2[0]);
  link(risky[risky.length - 1], main2[0]);
  LANES.push(
    { label: '🎓 College', col0: 0, row: 1 },
    { label: '🛠️ Start working', col0: 3, row: 1 },
    { label: '🛡️ Safe route', col0: 0, row: 6 },
    { label: '🎢 Risky route', col0: 3, row: 6 },
  );
}
export const ROWS = Math.max(...BOARD.map((s) => s.row)) + 1;
export const RETIRE_ID = BOARD.find((s) => s.t === 'retire').id;

export const STOPS = {
  fork1: { title: 'Crossroads', text: 'College or straight to work?' },
  grad: { title: 'Graduation day', text: 'Pick your first degree job.' },
  fork2: { title: 'Fork in the road', text: 'Play it safe, or take a gamble?' },
  rethink: { title: 'Midlife rethink', text: 'Change careers, or stay put?' },
};

export const isStop = (sp) => sp.t === 'stop' || sp.t === 'retire';

// ---------- helpers ----------
export const fmt = (n) => {
  const v = Math.round(n / K);
  return `${v < 0 ? '−' : ''}$${Math.abs(v)}k`;
};
export const signed = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));

export function familyBonus(p) {
  return (p.partner ? PARTNER_BONUS : 0) + p.kids * KID_BONUS;
}
export function netWorth(p) {
  return p.cash + (p.house ? p.house.worth : 0) + familyBonus(p) - p.loans * LOAN_REPAY;
}

function addLog(s, msg) { s.log = [...s.log, msg].slice(-50); }

function addCash(p, amt) {
  p.cash += amt;
  let took = 0;
  while (p.cash < 0) { p.cash += LOAN; p.loans++; took++; }
  return took;
}

/** next space id when leaving `id` (uses the player's chosen route at forks) */
export function nextSpace(p, id) {
  const sp = BOARD[id];
  if (!sp.next.length) return null;
  if (sp.next.length === 1) return sp.next[0];
  const r = p.route[sp.stop];
  if (r == null) return null;
  return sp.next[r];
}

/** the path a spin of `n` walks (ids after the start), halting at stop spaces */
export function walk(p, n) {
  const path = [];
  let at = p.pos;
  for (let k = 0; k < n; k++) {
    const nx = nextSpace(p, at);
    if (nx == null) break;
    path.push(nx);
    at = nx;
    if (isStop(BOARD[nx])) break;
  }
  return path;
}

/** pick k distinct indexes from n using rand values r[i] in [0, n−i) */
function pickDistinct(n, k, r) {
  const pool = Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let i = 0; i < k; i++) {
    const v = r[i];
    if (!(Number.isInteger(v) && v >= 0 && v < pool.length)) throw new Error('bad draw');
    out.push(pool.splice(v, 1)[0]);
  }
  return out;
}

export function careerPool(p, kind) {
  return p.college || kind === 'grad' ? DEGREE_CAREERS : BASIC_CAREERS;
}

export function newGame(players, first = 0) {
  return {
    players: players.map((pl) => ({
      pid: pl.pid, name: pl.name, pos: 0, cash: START_CASH, loans: 0, career: null, college: false,
      partner: false, kids: 0, house: null, retired: false, rank: 0, route: {},
    })),
    current: first,
    phase: 'turn', // turn | move | choose | show | over
    pending: null, // { kind: 'fork1'|'fork2'|'career'|'house', title, text, options: [...] }
    move: null, // { no, seat, value, from, path }
    event: null, // { no, seat, icon, title, text, delta }
    moveNo: 0,
    eventNo: 0,
    retired: 0,
    autoAt: 0,
    winners: null,
    log: ['Life Path begins — spin to set off!'],
  };
}

function setEvent(s, seat, icon, title, text, delta) {
  s.eventNo++;
  s.event = { no: s.eventNo, seat, icon, title, text, delta };
}

/** ranges of random ints the arrival on the current space needs */
export function arriveRanges(s) {
  const p = s.players[s.current];
  const sp = BOARD[p.pos];
  if (sp.t === 'cash') return [EVENTS[sp.pool].length];
  if (sp.t === 'family') return [10];
  if (sp.t === 'career') { const n = careerPool(p).length; return [n, n - 1]; }
  if (sp.t === 'stop' && (sp.stop === 'grad' || sp.stop === 'rethink')) {
    const n = careerPool(p, sp.stop).length;
    return [n, n - 1];
  }
  if (sp.t === 'house') return [HOUSES.length, HOUSES.length - 1, HOUSES.length - 2];
  return null;
}

/** ranges needed by a choice (choosing "work" at the first fork draws two job cards) */
export function chooseRanges(s, i) {
  if (s.phase === 'choose' && s.pending?.kind === 'fork1' && i === 1) {
    return [BASIC_CAREERS.length, BASIC_CAREERS.length - 1];
  }
  return null;
}

function careerChoice(s, p, kind, r, title, text) {
  const pool = careerPool(p, kind);
  const opts = pickDistinct(pool.length, 2, r).map((i) => ({ ...pool[i] }));
  if (p.career) opts.push({ keep: true, ...p.career });
  s.pending = { kind: 'career', title, text, options: opts };
  s.phase = 'choose';
}

function show(s, now, ms = SHOW_MS) {
  s.phase = 'show';
  s.pending = null;
  s.autoAt = now + ms;
}

function arrive(s, rand, now) {
  const seat = s.current;
  const p = s.players[seat];
  const sp = BOARD[p.pos];
  const mv = s.move;
  // paydays passed on the way (not counting the landing space)
  let paid = 0;
  const passed = (mv?.path || []).slice(0, -1).filter((id) => BOARD[id].t === 'payday').length;
  if (passed && p.career) { paid = passed * p.career.salary; addCash(p, paid); }
  const payNote = paid ? ` (+ ${fmt(paid)} payday on the way)` : '';
  const need = arriveRanges(s);
  if (need && !(rand && rand.length >= need.length)) throw new Error('missing draw');

  switch (sp.t) {
    case 'payday': {
      const amt = p.career ? p.career.salary : 0;
      addCash(p, amt);
      setEvent(s, seat, '💵', 'Payday!', p.career ? `${p.career.icon} ${p.career.name} pays ${fmt(amt)}.${payNote}` : 'No job yet — nothing to collect.', amt + paid);
      addLog(s, `💵 ${p.name} collects ${fmt(amt + paid)}.`);
      return show(s, now);
    }
    case 'cash': {
      const [text, k] = EVENTS[sp.pool][rand[0]] || [];
      if (text == null) throw new Error('bad draw');
      const took = addCash(p, k * K);
      const loanNote = took ? ` Took ${took} loan${took > 1 ? 's' : ''}.` : '';
      setEvent(s, seat, k >= 0 ? '🎉' : '💸', sp.pool === 'risk' ? 'Gamble!' : 'Life happens', `${text}${loanNote}${payNote}`, k * K + paid);
      addLog(s, `${k >= 0 ? '🎉' : '💸'} ${p.name}: ${text} ${signed(k * K)}`);
      return show(s, now);
    }
    case 'family': {
      if (!p.partner) {
        p.partner = true;
        addCash(p, 5 * K);
        setEvent(s, seat, '💞', 'Love is in the air', `${p.name} finds a partner in crime! Friends chip in ${fmt(5 * K)} for the party.${payNote}`, 5 * K + paid);
        addLog(s, `💞 ${p.name} teams up with a partner.`);
      } else if (p.kids < MAX_KIDS) {
        const twins = rand[0] === 0 && p.kids <= MAX_KIDS - 2;
        p.kids += twins ? 2 : 1;
        addCash(p, 2 * K);
        setEvent(s, seat, twins ? '👶👶' : '👶', twins ? 'Twins!' : 'New arrival', `${twins ? 'Two little ones join' : 'A little one joins'} the family. Baby-shower gifts ${fmt(2 * K)}.${payNote}`, 2 * K + paid);
        addLog(s, `👶 ${p.name} welcomes ${twins ? 'twins' : 'a baby'}.`);
      } else {
        addCash(p, -3 * K);
        setEvent(s, seat, '🍔', 'Family reunion', `Hosting the whole clan for a barbecue costs ${fmt(3 * K)}.${payNote}`, -3 * K + paid);
        addLog(s, `🍔 ${p.name} hosts a family barbecue.`);
      }
      return show(s, now);
    }
    case 'career': {
      careerChoice(s, p, null, rand, 'Job offer', 'Two companies want you. Pick one, or keep your job.');
      setEvent(s, seat, '💼', 'Job offer', `${p.name} gets job offers.${payNote}`, paid);
      return;
    }
    case 'house': {
      const opts = pickDistinct(HOUSES.length, 3, rand).map((i) => ({ ...HOUSES[i] })).sort((a, b) => a.price - b.price);
      opts.push({ skip: true });
      s.pending = { kind: 'house', title: 'House hunting', text: p.house ? `Upgrade? Your ${p.house.name} sells back for ${fmt(p.house.price)}.` : 'Buy a home? Short on cash = loans.', options: opts };
      s.phase = 'choose';
      setEvent(s, seat, '🏠', 'House hunting', `${p.name} tours some homes.${payNote}`, paid);
      return;
    }
    case 'stop': {
      const st = STOPS[sp.stop];
      if (sp.stop === 'fork1') {
        s.pending = { kind: 'fork1', title: st.title, text: st.text, options: [
          { key: 'college', icon: '🎓', name: 'College', note: `Student loan (${STUDENT_LOANS} loans) · better jobs` },
          { key: 'work', icon: '🛠️', name: 'Start working', note: 'Pick a job now · paydays sooner' },
        ] };
        s.phase = 'choose';
      } else if (sp.stop === 'fork2') {
        s.pending = { kind: 'fork2', title: st.title, text: st.text, options: [
          { key: 'safe', icon: '🛡️', name: 'Safe route', note: '3 paydays · small surprises' },
          { key: 'risky', icon: '🎢', name: 'Risky route', note: '2 paydays · huge wins and losses' },
        ] };
        s.phase = 'choose';
      } else {
        careerChoice(s, p, sp.stop, rand, st.title, st.text);
      }
      setEvent(s, seat, '✋', st.title, `${st.text}${payNote}`, paid);
      return;
    }
    case 'retire': {
      const bonus = RETIRE_BONUS[Math.min(s.retired, RETIRE_BONUS.length - 1)];
      s.retired++;
      p.retired = true;
      p.rank = s.retired;
      addCash(p, bonus);
      const ord = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'][p.rank - 1] || 'Next';
      setEvent(s, seat, '🏖️', 'Retired!', `${ord} to retire — farewell party gift ${fmt(bonus)}.${payNote}`, bonus + paid);
      addLog(s, `🏖️ ${p.name} retires (${ord.toLowerCase()}) with ${fmt(bonus)} bonus.`);
      return show(s, now);
    }
    default: {
      setEvent(s, seat, '🚶', 'On the road', `Nothing happens here.${payNote}`, paid);
      return show(s, now);
    }
  }
}

function choose(s, i, rand, now) {
  const p = s.players[s.current];
  const pd = s.pending;
  const o = pd?.options?.[i];
  if (!o || !Number.isInteger(i)) throw new Error('bad choice');
  const seat = s.current;
  switch (pd.kind) {
    case 'fork1': {
      p.route.fork1 = i;
      if (o.key === 'college') {
        p.college = true;
        p.loans += STUDENT_LOANS;
        setEvent(s, seat, '🎓', 'Off to college!', `Student loan: ${STUDENT_LOANS} loans (${fmt(STUDENT_LOANS * LOAN_REPAY)} to repay).`, 0);
        addLog(s, `🎓 ${p.name} heads to college.`);
        return show(s, now, CHOICE_SHOW_MS);
      }
      addLog(s, `🛠️ ${p.name} starts working.`);
      if (!(rand && rand.length >= 2)) throw new Error('missing draw');
      careerChoice(s, p, 'basic', rand, 'First job', 'Pick your first job.');
      setEvent(s, seat, '🛠️', 'Start working', 'Pick your first job.', 0);
      return;
    }
    case 'fork2': {
      p.route.fork2 = i;
      setEvent(s, seat, o.icon, o.name, o.key === 'safe' ? 'Steady does it.' : 'Fortune favors the bold… sometimes.', 0);
      addLog(s, `${o.icon} ${p.name} takes the ${o.name.toLowerCase()}.`);
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'career': {
      if (o.keep) {
        setEvent(s, seat, p.career.icon, 'Staying put', `${p.name} keeps the ${p.career.name} job.`, 0);
      } else {
        p.career = { name: o.name, icon: o.icon, salary: o.salary };
        setEvent(s, seat, o.icon, 'New job!', `${p.name} is now a ${o.name} earning ${fmt(o.salary)} per payday.`, 0);
        addLog(s, `${o.icon} ${p.name} becomes a ${o.name} (${fmt(o.salary)}).`);
      }
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'house': {
      if (o.skip) {
        setEvent(s, seat, '🚪', 'Not today', `${p.name} keeps looking.`, 0);
        return show(s, now, CHOICE_SHOW_MS);
      }
      const back = p.house ? p.house.price : 0;
      const took = addCash(p, back - o.price);
      p.house = { name: o.name, icon: o.icon, price: o.price, worth: o.worth };
      const loanNote = took ? ` Took ${took} loan${took > 1 ? 's' : ''}.` : '';
      setEvent(s, seat, o.icon, 'Home sweet home', `${p.name} buys the ${o.name} for ${fmt(o.price)}.${loanNote}`, back - o.price);
      addLog(s, `${o.icon} ${p.name} buys the ${o.name} (${fmt(o.price)}).`);
      return show(s, now, CHOICE_SHOW_MS);
    }
    default:
      throw new Error('bad choice');
  }
}

function endTurn(s) {
  s.pending = null;
  if (s.players.every((p) => p.retired)) {
    s.phase = 'over';
    const scores = s.players.map(netWorth);
    const top = Math.max(...scores);
    s.winners = scores.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
    addLog(s, s.winners.length > 1 ? 'Everyone has retired — it’s a tie!' : `Everyone has retired — ${s.players[s.winners[0]].name} lived the richest life!`);
    return;
  }
  let n = s.current;
  do n = (n + 1) % s.players.length; while (s.players[n].retired);
  s.current = n;
  s.phase = 'turn';
}

/**
 * a: {type:'spin'} (rand [0..9]) | {type:'choose', i} (rand maybe) — by the current player
 *    {type:'arrive'} (rand maybe) | {type:'next'} — system
 */
export function applyAction(state, a, rand, now = 0) {
  const s = structuredClone(state);
  const p = s.players[s.current];
  switch (a.type) {
    case 'spin': {
      if (s.phase !== 'turn') throw new Error('not now');
      const r = rand?.[0];
      if (!(Number.isInteger(r) && r >= 0 && r < 10)) throw new Error('bad spin');
      const value = r + 1;
      const path = walk(p, value);
      if (!path.length) throw new Error('cannot move');
      s.moveNo++;
      s.move = { no: s.moveNo, seat: s.current, value, from: p.pos, path };
      p.pos = path[path.length - 1];
      s.phase = 'move';
      s.autoAt = now + SPIN_MS + HOP_MS * path.length + 250;
      return s;
    }
    case 'arrive': {
      if (s.phase !== 'move') throw new Error('not moving');
      arrive(s, rand, now);
      return s;
    }
    case 'choose': {
      if (s.phase !== 'choose') throw new Error('nothing to choose');
      choose(s, a.i, rand, now);
      return s;
    }
    case 'next': {
      if (s.phase !== 'show') throw new Error('nothing to finish');
      endTurn(s);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

// ---------- computer player ----------
function hashStr(str) {
  let x = 7;
  for (const ch of String(str)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return x;
}

export function botChoice(s, seat) {
  const p = s.players[seat];
  const pd = s.pending;
  if (pd.kind === 'fork1') return hashStr(p.pid + p.name) % 2 === 0 ? 0 : 1;
  if (pd.kind === 'fork2') {
    const mine = netWorth(p);
    const best = Math.max(...s.players.map(netWorth));
    return mine < best - 60 * K ? 1 : 0; // well behind → gamble
  }
  if (pd.kind === 'career') {
    let bi = 0;
    pd.options.forEach((o, i) => { if (o.salary > pd.options[bi].salary) bi = i; });
    return bi;
  }
  if (pd.kind === 'house') {
    const back = p.house ? p.house.price : 0;
    const curGain = p.house ? p.house.worth - p.house.price : 0;
    let bi = pd.options.findIndex((o) => o.skip);
    let bestGain = curGain;
    pd.options.forEach((o, i) => {
      if (o.skip) return;
      const short = Math.max(0, o.price - back - p.cash);
      const loans = Math.ceil(short / LOAN);
      if (loans > 3) return; // stay roughly affordable
      const gain = o.worth - o.price - loans * (LOAN_REPAY - LOAN);
      if (gain > bestGain) { bestGain = gain; bi = i; }
    });
    return bi;
  }
  return 0;
}
