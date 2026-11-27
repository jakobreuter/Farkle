// Life Path — an original life-journey board game (pure rules, no DOM).
//
// Before anyone spins, each player chooses a path: take one of three dealt jobs (paid from day one)
// or go to college and pick a dream job from three degree careers (better pay, but it only starts
// after Graduation — and you take student loans).
// Then spin 1–10 and walk from age 18 to retirement at 65 through four zones of life:
//   🎓 Campus / First jobs → 🏙️ Big City → 🏡 Suburbs (safe or wild street) → 🌅 Golden Years.
// Spaces: Payday (salary when you pass or land), Life card (a random life event), Job offer,
// Family (kids — or pets if you stayed single), House (buy one of three), Stops (always halt
// and decide: Graduation, Wedding, the Fork, Second Act) and Retirement.
// Cash below zero takes automatic loans of 10k (repaid 12k each at the end).
// Final worth = cash + house value + family bonus − loans. When everyone has retired, each life
// story is revealed one by one, then the richest life wins.

export const K = 1000;
export const START_CASH = 10 * K;
export const LOAN = 10 * K;
export const LOAN_REPAY = 12 * K;
export const STUDENT_LOANS = 3;
export const PARTNER_BONUS = 20 * K;
export const KID_BONUS = 15 * K;
export const PET_BONUS = 6 * K;
export const MAX_KIDS = 4;
export const MAX_PETS = 3;
export const RETIRE_BONUS = [40 * K, 30 * K, 20 * K, 10 * K, 10 * K, 10 * K];
export const AGE_START = 18;
export const AGE_END = 65;

export const SPIN_MS = 1900; // spinner animation (slows down with ticks)
export const HOP_MS = 240; // per space hopped
export const SHOW_MS = 2700; // life card flip + count + reading
export const CHOICE_SHOW_MS = 2000; // a chosen card revealed to all
export const DEAL_SHOW_MS = 2400; // the chosen path revealed to all
export const FINALE_FIRST_MS = 1200;
export const FINALE_STEP_MS = 3400;
export const FINALE_HOLD_MS = 3000;

// ---------- cards ----------
const job = (name, icon, salary, flavor) => ({ name, icon, salary: salary * K, flavor });
export const BASIC_CAREERS = [
  job('Barista', '☕', 30, 'Latte-art master of the morning rush.'),
  job('Bike Courier', '🚲', 32, 'Faster than traffic, slower than hills.'),
  job('Shop Clerk', '🛒', 35, 'Knows where every single item is.'),
  job('Line Cook', '🍳', 40, 'Flips pancakes three at a time.'),
  job('Mail Carrier', '📮', 40, 'Rain, snow or barking dogs — it gets through.'),
  job('Pastry Chef', '🧁', 42, 'Runs on butter and applause.'),
  job('Hairstylist', '✂️', 45, 'Hears every secret in town.'),
  job('Bus Driver', '🚌', 45, 'Everyone waves. Everyone.'),
  job('Landscaper', '🌳', 48, 'Turns muddy yards into paradise.'),
  job('Firefighter', '🚒', 52, 'Rescues cats from trees and people from fires.'),
  job('Electrician', '⚡', 55, 'Sparks fly — in a good way.'),
  job('Plumber', '🔧', 58, 'Hero of every 3 a.m. emergency.'),
];
export const DEGREE_CAREERS = [
  job('Teacher', '📚', 50, 'Shapes young minds, grades until midnight.'),
  job('Journalist', '📰', 52, 'Chases the story, finds the coffee.'),
  job('Nurse', '💉', 55, 'Calm in every storm.'),
  job('Marine Biologist', '🐬', 56, 'Talks to dolphins. Professionally.'),
  job('Architect', '📐', 60, 'Draws buildings that actually stand up.'),
  job('Game Designer', '🎮', 62, 'Gets paid to play. Sort of.'),
  job('Engineer', '⚙️', 65, 'If it’s broken, you’ll fix it.'),
  job('Veterinarian', '🐾', 68, 'Every patient is a good boy.'),
  job('Software Dev', '💻', 70, 'Turns coffee into code.'),
  job('Pilot', '✈️', 74, 'An office with the best view.'),
  job('Pharmacist', '💊', 77, 'Reads every doctor’s handwriting.'),
  job('Surgeon', '🩺', 82, 'Steady hands, very long shifts.'),
];

const home = (name, icon, price, worth, flavor) => ({ name, icon, price: price * K, worth: worth * K, flavor });
export const HOUSES = [
  home('Cozy Studio', '🏢', 40, 55, 'One room, big dreams.'),
  home('Tiny Cabin', '🛖', 50, 62, 'Woodstove included. Wi-Fi not.'),
  home('Houseboat', '⛵', 60, 50, 'Gently rocks you to sleep.'),
  home('Fixer-Upper Farmhouse', '🚜', 70, 115, 'Needs love. Lots of love.'),
  home('Beach Shack', '🏖️', 80, 75, 'Sand in everything, forever.'),
  home('Lakeside Bungalow', '🏡', 90, 125, 'Sunsets over the dock.'),
  home('Townhouse', '🏘️', 110, 140, 'Friendly neighbors on both sides.'),
  home('Treehouse Villa', '🌲', 130, 180, 'A grown-up’s childhood dream.'),
  home('Downtown Loft', '🌆', 150, 170, 'Exposed brick and city lights.'),
  home('Hilltop Manor', '🏰', 240, 300, 'Has a room nobody has found yet.'),
];

// life cards: [emoji, title, second-person story, cash k, salary raise k]
export const EVENTS = {
  campus: [
    ['📚', 'Textbook shock', 'You buy one textbook. It costs more than your bike.', -3],
    ['🍕', 'Pizza economics', 'You discover pizza works as breakfast, lunch and dinner.', -1],
    ['🏆', 'Scholarship!', 'Your essay on why llamas are underrated wins a scholarship.', 6],
    ['🎸', 'Campus band', 'Your garage band plays the spring fair… and people pay!', 2],
    ['💻', 'Laptop vs. cocoa', 'You spill hot cocoa on your laptop the night before finals.', -4],
    ['🧠', 'Trivia champions', 'Your team wins the campus trivia league — with a cash prize!', 3],
    ['🛶', 'Spring break', 'You rent a canoe with friends and capsize gloriously.', -2],
    ['🧪', 'Lab assistant', 'A professor pays you to label 4,000 test tubes.', 3],
    ['🚲', 'Bike thief', 'Your bike vanishes. Only the lock remains, still locked.', -2],
    ['🎭', 'Improv night', 'You join the improv club and win the comedy cup.', 2],
  ],
  early: [
    ['🛋️', 'First apartment', 'You furnish your first place entirely from curbside finds.', 2],
    ['🚗', 'Clunker car', 'Your first car honks like a goose. The mechanic agrees.', -4],
    ['⭐', 'Employee of the month', 'Your photo goes on the wall — with a bonus!', 5],
    ['🐈', 'Shop cat', 'You adopt the stray cat that lives behind work.', -1],
    ['🎤', 'Karaoke legend', 'You win a karaoke contest with a power ballad.', 3],
    ['🧾', 'Sneaky bill', 'A forgotten gym membership has been charging you for months.', -3],
    ['🪴', 'Side hustle', 'You sell hand-painted plant pots online. Sold out!', 6],
    ['📱', 'Phone overboard', 'You take one dock selfie too many. Splash.', -2],
    ['🎟️', 'Raffle win', 'You win a lawnmower in a raffle and sell it the same day.', 4],
    ['📈', 'Raise!', 'Your boss notices you actually read the emails.', 0, 5],
  ],
  city: [
    ['🚚', 'Taco truck', 'You start a weekend taco truck… and it’s a hit!', 12],
    ['🏔️', 'Backpacking trip', 'You hike mountains for two weeks with a very heavy backpack.', -6],
    ['🐶', 'Puppy chaos', 'Your new puppy eats a cushion. And a shoe. And the other shoe.', -3],
    ['🏃', 'First marathon', 'You finish a marathon and your sponsors pay up.', 4],
    ['🦷', 'Dentist visit', 'A surprise filling. Floss more, they say.', -4],
    ['🎨', 'Art fair', 'You sell a painting of your cat for a shocking amount.', 8],
    ['🚿', 'Leaky pipes', 'Your shower becomes a fountain at 3 a.m.', -5],
    ['📈', 'Promotion!', 'You lead a project that goes brilliantly.', 0, 10],
    ['🎰', 'Lucky card', 'The scratch card in your birthday card actually wins!', 10],
    ['🎂', 'Surprise party', 'You throw a party for a friend. The cake alone…', -3],
    ['🍅', 'Rooftop garden', 'Your rooftop tomatoes win a city prize.', 3],
    ['🚕', 'Fender bender', 'You gently tap a parked car. Very expensive tap.', -6],
  ],
  safe: [
    ['🏦', 'Savings interest', 'Your sensible savings account quietly grows.', 5],
    ['✂️', 'Coupon master', 'You save so much with coupons the manager knows your name.', 3],
    ['⏰', 'Overtime', 'You pick up extra shifts before the holidays.', 6],
    ['🧥', 'Coat pocket', 'You find an old savings bond in a winter coat.', 4],
    ['🌧️', 'Leaky roof', 'A rainstorm reveals your roof’s secret skylight.', -4],
    ['🌙', 'Night class', 'You take a night class and earn a raise.', 0, 5],
    ['🛞', 'New tires', 'All four tires decide to retire at once.', -3],
    ['🍋', 'Bake sale', 'Your lemon bars become a school bake-sale legend.', 2],
  ],
  risk: [
    ['🚀', 'Moonshot', 'You invest in a friend’s startup… and it goes to the moon!', 60],
    ['⛵', 'Vintage sailboat', 'You buy a vintage sailboat. It sinks on its first trip.', -30],
    ['🧦', 'Sock invention', 'You invent self-folding socks. A company buys the patent!', 70],
    ['💈', 'Hot tip', 'Your barber’s stock tip turns out to be… just a haircut.', -25],
    ['🎯', 'Fairground streak', 'You win every county-fair game, even the impossible one.', 35],
    ['🍞', 'Smart toaster', 'Your smart-toaster startup burns. Literally.', -25],
    ['👟', 'Rare sneakers', 'Your old sneakers turn out to be a rare collector’s pair.', 45],
    ['🎈', 'Balloon tours', 'Your hot-air balloon tour business floats away.', -35],
    ['🎬', 'Viral extra', 'You’re an extra in a blockbuster and your scene goes viral.', 30],
    ['🐎', 'Racehorse', 'You buy a share of a racehorse. It prefers napping.', -20],
  ],
  golden: [
    ['🛳️', 'Dream cruise', 'You finally take the round-the-world cruise.', -10],
    ['🏌️', 'Hole in one', 'You hit a hole in one at the charity tournament!', 8],
    ['🍪', 'Grandkids visit', 'Visitors arrive and somehow the fridge is empty.', -3],
    ['🎻', 'Late talent', 'You take up violin. Neighbors pay you to practice elsewhere.', 2],
    ['🏺', 'Attic treasure', 'The ugly vase from the attic is a priceless antique!', 15],
    ['🦵', 'Knee trouble', 'Your knee files a formal complaint.', -8],
    ['📖', 'Your memoir', 'You write a memoir. Book clubs love it.', 10],
    ['🚐', 'Camper van', 'You buy a camper van and visit every national park.', -7],
    ['🐕', 'Rescue dog', 'You adopt an elderly rescue dog named Biscuit.', -1],
    ['🧑‍🏫', 'Mentor', 'A young company hires you as a part-time mentor.', 6],
  ],
};

// ---------- board ----------
export const TYPES = {
  start: { icon: '🚩', tag: 'START', name: 'Start' },
  payday: { icon: '💵', tag: 'PAYDAY', name: 'Payday' },
  cash: { icon: '✨', tag: 'LIFE', name: 'Life card' },
  career: { icon: '💼', tag: 'JOB', name: 'Job offer' },
  family: { icon: '👶', tag: 'FAMILY', name: 'Family' },
  house: { icon: '🏠', tag: 'HOUSE', name: 'House' },
  stop: { icon: '✋', tag: 'STOP', name: 'Stop' },
  retire: { icon: '🌅', tag: 'RETIRE', name: 'Retirement' },
};
export const STOPS = {
  grad: { icon: '🎓', tag: 'GRAD', title: 'Graduation', text: 'Caps in the air! Your dream job starts paying.' },
  wedding: { icon: '💍', tag: 'WEDDING', title: 'Wedding bells', text: 'Settle down with a sweetheart, or stay footloose?' },
  fork: { icon: '🔀', tag: 'FORK', title: 'Fork in the road', text: 'Steady Street or the Wild Ride?' },
  rethink: { icon: '🔄', tag: '2ND ACT', title: 'Second act', text: 'Fresh start in a new career, or stay put?' },
};

export const ZONES = [
  { key: 'campus', name: 'Campus & First Jobs', icon: '🎓', rows: [1, 3], lanes: ['🎓 Campus', '🛠️ First jobs'] },
  { key: 'city', name: 'Big City', icon: '🏙️', rows: [4, 6] },
  { key: 'suburbs', name: 'Suburbs', icon: '🏡', rows: [7, 9], lanes: ['🛡️ Steady Street', '🎢 Wild Ride'] },
  { key: 'golden', name: 'Golden Years', icon: '🌅', rows: [10, 12] },
];

export const BOARD = [];
function lay(cells, cols, row, dir, extra = {}) {
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
      if (ids.length) BOARD[ids[ids.length - 1]].next.push(sp.id);
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
const stop = (k) => ['stop', { stop: k }];

{
  const [start] = lay(['start'], [2.5], 0, 1, { zone: 'campus' });
  const campus = lay(['cash', 'cash', 'cash', 'cash', 'cash', 'cash', 'cash', 'cash', stop('grad')], L3, 1, 1, { pool: 'campus', zone: 'campus', lane: 0 });
  const work = lay(['payday', 'cash', 'cash', 'payday', 'cash', 'career', 'cash', 'payday', 'cash'], R3, 1, -1, { pool: 'early', zone: 'campus', lane: 1 });
  link(start, campus[0]);
  link(start, work[0]);
  const city = lay(['payday', 'cash', stop('wedding'), 'cash', 'house', 'payday', 'cash', 'family', 'career', 'cash', 'payday', 'house', 'cash', 'family', 'cash', 'payday', 'cash', stop('fork')], ALL6, 4, 1, { pool: 'city', zone: 'city' });
  link(campus[campus.length - 1], city[0]);
  link(work[work.length - 1], city[0]);
  const safe = lay(['payday', 'cash', 'family', 'cash', 'payday', 'house', 'cash', 'family', 'payday'], L3, 7, -1, { pool: 'safe', zone: 'suburbs', lane: 0 });
  const risky = lay(['cash', 'payday', 'cash', 'family', 'cash', 'house', 'cash', 'payday', 'cash'], R3, 7, -1, { pool: 'risk', zone: 'suburbs', lane: 1 });
  const fork = city[city.length - 1];
  link(fork, safe[0]);
  link(fork, risky[0]);
  const golden = lay(['payday', 'cash', stop('rethink'), 'cash', 'family', 'house', 'payday', 'cash', 'cash', 'family', 'payday', 'cash', 'house', 'cash', 'payday', 'cash', 'cash', 'retire'], ALL6, 10, 1, { pool: 'golden', zone: 'golden' });
  link(safe[safe.length - 1], golden[0]);
  link(risky[risky.length - 1], golden[0]);
}
export const ROWS = Math.max(...BOARD.map((s) => s.row)) + 1;
export const RETIRE_ID = BOARD.find((s) => s.t === 'retire').id;
// steps from the start (both lanes of a fork have the same length)
export const DIST = (() => {
  const d = BOARD.map(() => -1);
  d[0] = 0;
  const q = [0];
  while (q.length) { const id = q.shift(); for (const n of BOARD[id].next) if (d[n] < 0) { d[n] = d[id] + 1; q.push(n); } }
  return d;
})();
export const ageAt = (id) => AGE_START + Math.round((DIST[id] * (AGE_END - AGE_START)) / DIST[RETIRE_ID]);

export const isStop = (sp) => sp.t === 'stop' || sp.t === 'retire';
export const spaceIcon = (sp) => (sp.t === 'stop' ? STOPS[sp.stop].icon : TYPES[sp.t].icon);
export const spaceTag = (sp) => (sp.t === 'stop' ? STOPS[sp.stop].tag : sp.t === 'cash' && sp.pool === 'risk' ? 'GAMBLE' : TYPES[sp.t].tag);

// ---------- helpers ----------
export const fmt = (n) => {
  const v = Math.round(n / K);
  return `${v < 0 ? '−' : ''}$${Math.abs(v)}k`;
};
export const signed = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
const an = (w) => (/^[AEIOU]/i.test(w) ? 'an' : 'a');

export function familyBonus(p) {
  return (p.partner ? PARTNER_BONUS : 0) + p.kids * KID_BONUS + p.pets * PET_BONUS;
}
export function netWorth(p) {
  return p.cash + (p.house ? p.house.worth : 0) + familyBonus(p) - p.loans * LOAN_REPAY;
}
export function stage(p) {
  if (p.retired) return { icon: '🌅', name: 'Retired' };
  if (p.student) return { icon: '🎓', name: 'Student' };
  if (p.house && (p.partner || p.pets)) return { icon: '🏡', name: 'Settled' };
  if (p.career) return { icon: '💼', name: 'Working' };
  return { icon: '🧒', name: 'Starting out' };
}

function addLog(s, msg) { s.log = [...s.log, msg].slice(-50); }
function addStory(p, e, t) { p.story = [...p.story, { a: ageAt(p.pos), e, t }].slice(-24); }

function addCash(p, amt) {
  p.cash += amt;
  let took = 0;
  while (p.cash < 0) { p.cash += LOAN; p.loans++; took++; }
  return took;
}
const loanNote = (took) => (took ? ` (${took} loan${took > 1 ? 's' : ''} taken)` : '');

/** next space id when leaving `id` (uses the player's route at forks) */
export function nextSpace(p, id) {
  const sp = BOARD[id];
  if (!sp.next.length) return null;
  if (sp.next.length === 1) return sp.next[0];
  const r = sp.t === 'start' ? p.route.lane : p.route.fork;
  return r == null ? null : sp.next[r];
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

/** what's coming up in the next few spaces: [{icon, label}] (distinct, in order) */
export function upcoming(p, n = 10, max = 4) {
  const out = [];
  const seen = new Set();
  let at = p.pos;
  for (let k = 0; k < n && out.length < max; k++) {
    const sp = BOARD[at];
    let nx;
    if (sp.next.length > 1) {
      const r = sp.t === 'start' ? p.route.lane : p.route.fork;
      if (r == null) break;
      nx = sp.next[r];
    } else nx = sp.next[0];
    if (nx == null) break;
    at = nx;
    const t = BOARD[at];
    let item;
    if (t.t === 'stop') item = { icon: STOPS[t.stop].icon, label: STOPS[t.stop].title };
    else if (t.t === 'payday') item = { icon: '💵', label: 'Payday' };
    else if (t.t === 'house') item = { icon: '🏠', label: 'Houses' };
    else if (t.t === 'career') item = { icon: '💼', label: 'Job offer' };
    else if (t.t === 'family') item = p.partner ? { icon: '👶', label: 'Family' } : { icon: '🐾', label: 'Pets' };
    else if (t.t === 'retire') item = { icon: '🌅', label: 'Retirement' };
    else if (t.pool === 'risk') item = { icon: '🎰', label: 'Gambles' };
    if (item && !seen.has(item.label)) { seen.add(item.label); out.push(item); }
  }
  return out;
}

/** pick k distinct indexes from n using rand values r[i] in [0, n−i) */
function pickDistinct(n, k, r, off = 0) {
  const pool = Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let i = 0; i < k; i++) {
    const v = r?.[off + i];
    if (!(Number.isInteger(v) && v >= 0 && v < pool.length)) throw new Error('bad draw');
    out.push(pool.splice(v, 1)[0]);
  }
  return out;
}

export const careerPool = (p) => (p.college ? DEGREE_CAREERS : BASIC_CAREERS);

export function newGame(players, first = 0) {
  return {
    players: players.map((pl) => ({
      pid: pl.pid, name: pl.name, pos: 0, cash: START_CASH, loans: 0, career: null, college: false, student: false,
      partner: false, single: false, kids: 0, pets: 0, house: null, retired: false, rank: 0, route: {},
      story: [], best: null, low: START_CASH, picked: false,
    })),
    first,
    started: false,
    current: first,
    phase: 'deal', // deal | pick | turn | move | choose | show | finale | over
    pending: null, // pick: { kind:'start', step:'path'|'dream', jobs, dreams } · choose: { kind, title, text, options }
    move: null, // { no, seat, value, from, path }
    event: null, // { no, seat, kind, icon, title, text, delta, raise }
    moveNo: 0,
    eventNo: 0,
    dealNo: 0,
    retired: 0,
    autoAt: 0,
    finale: null, // { order: [seats, lowest worth first], titles: [{icon, title}], revealed }
    winners: null,
    log: ['Life Path begins — everyone chooses a path!'],
  };
}

function setEvent(s, seat, kind, icon, title, text, delta = 0, extra = {}) {
  s.eventNo++;
  s.event = { no: s.eventNo, seat, kind, icon, title, text, delta, ...extra };
}

/** random ints the next system action needs */
export function systemRanges(s) {
  if (s.phase === 'deal') {
    const b = BASIC_CAREERS.length; const d = DEGREE_CAREERS.length;
    return [b, b - 1, b - 2, d, d - 1, d - 2];
  }
  if (s.phase !== 'move') return null;
  const p = s.players[s.current];
  const sp = BOARD[p.pos];
  if (sp.t === 'cash') return [EVENTS[sp.pool].length];
  if (sp.t === 'family') return [10];
  if (sp.t === 'career' || (sp.t === 'stop' && sp.stop === 'rethink')) { const n = careerPool(p).length; return [n, n - 1]; }
  if (sp.t === 'house') return [HOUSES.length, HOUSES.length - 1, HOUSES.length - 2];
  return null;
}

function show(s, now, ms = SHOW_MS) {
  s.phase = 'show';
  s.pending = null;
  s.autoAt = now + ms;
  for (const p of s.players) p.low = Math.min(p.low, netWorth(p));
}

function careerChoice(s, p, rand, title, text) {
  const pool = careerPool(p);
  const opts = pickDistinct(pool.length, 2, rand).map((i) => ({ ...pool[i] }));
  if (p.career) opts.push({ keep: true, ...p.career });
  s.pending = { kind: 'career', title, text, options: opts };
  s.phase = 'choose';
}

function arrive(s, rand, now) {
  const seat = s.current;
  const p = s.players[seat];
  const sp = BOARD[p.pos];
  const mv = s.move;
  let paid = 0;
  const passed = (mv?.path || []).slice(0, -1).filter((id) => BOARD[id].t === 'payday').length;
  if (passed && p.career && !p.student) { paid = passed * p.career.salary; addCash(p, paid); }
  const payNote = paid ? ` Plus ${fmt(paid)} from paydays on the way.` : '';
  const need = systemRanges(s);
  if (need && !(rand && rand.length >= need.length)) throw new Error('missing draw');

  switch (sp.t) {
    case 'payday': {
      const amt = p.career && !p.student ? p.career.salary : 0;
      addCash(p, amt);
      setEvent(s, seat, 'payday', '💵', 'Payday!', `Your ${p.career?.name || 'boss'} paycheck lands: ${fmt(amt)}.${payNote}`, amt + paid);
      addLog(s, `💵 ${p.name} collects ${fmt(amt + paid)}.`);
      return show(s, now);
    }
    case 'cash': {
      const ev = EVENTS[sp.pool][rand[0]];
      if (!ev) throw new Error('bad draw');
      const [icon, title, text, k, raise] = ev;
      const took = addCash(p, k * K);
      let extra = '';
      if (raise && p.career) {
        p.career = { ...p.career, salary: p.career.salary + raise * K };
        extra = ` Salary +${fmt(raise * K)} → ${fmt(p.career.salary)}.`;
        addStory(p, icon, `${title} Salary up to ${fmt(p.career.salary)}`);
      } else if (raise) extra = ' (A raise… for a job you don’t have yet.)';
      if (Math.abs(k) >= 20) addStory(p, icon, `${title} ${signed(k * K)}`);
      if (k > 0 && (!p.best || k * K > p.best.v)) p.best = { e: icon, t: title, v: k * K };
      setEvent(s, seat, sp.pool === 'risk' ? 'gamble' : 'life', icon, title, `${text}${extra}${loanNote(took)}${payNote}`, k * K + paid, raise ? { raise: raise * K } : {});
      addLog(s, `${icon} ${p.name}: ${title} ${raise ? `+${fmt(raise * K)} salary` : signed(k * K)}`);
      return show(s, now);
    }
    case 'family': {
      if (p.partner && p.kids < MAX_KIDS) {
        const twins = rand[0] === 0 && p.kids <= MAX_KIDS - 2;
        p.kids += twins ? 2 : 1;
        addCash(p, 2 * K);
        const t = twins ? 'Twins!' : 'Baby on board!';
        setEvent(s, seat, 'family', twins ? '👶👶' : '👶', t, `${twins ? 'Two tiny humans join' : 'A tiny human joins'} your family. Friends shower you with ${fmt(2 * K)} in gifts.${payNote}`, 2 * K + paid);
        addStory(p, twins ? '👶👶' : '👶', twins ? 'Welcomed twins' : `Welcomed baby #${p.kids}`);
        addLog(s, `👶 ${p.name} welcomes ${twins ? 'twins' : 'a baby'}.`);
      } else if (!p.partner && p.pets < MAX_PETS) {
        p.pets++;
        const pet = ['🐶', '🐱', '🦜'][p.pets - 1];
        const took = addCash(p, -2 * K);
        setEvent(s, seat, 'family', pet, 'New best friend', `You adopt a ${['scruffy dog', 'grumpy cat', 'chatty parrot'][p.pets - 1]}. Vet bills ${fmt(2 * K)}, endless joy.${loanNote(took)}${payNote}`, -2 * K + paid);
        addStory(p, pet, `Adopted a ${['dog', 'cat', 'parrot'][p.pets - 1]}`);
        addLog(s, `${pet} ${p.name} adopts a pet.`);
      } else {
        const took = addCash(p, -3 * K);
        setEvent(s, seat, 'family', '🍔', 'Family reunion', `You host the whole clan for a barbecue. Somebody brings an accordion.${loanNote(took)}${payNote}`, -3 * K + paid);
      }
      return show(s, now);
    }
    case 'career': {
      careerChoice(s, p, rand, 'Job offer', 'Two companies want you. Take one, or keep your job.');
      setEvent(s, seat, 'wait', '💼', 'Job offer', `${p.name} weighs two job offers…${payNote}`, paid);
      return;
    }
    case 'house': {
      const opts = pickDistinct(HOUSES.length, 3, rand).map((i) => ({ ...HOUSES[i] })).sort((a, b) => a.price - b.price);
      opts.push({ skip: true });
      s.pending = { kind: 'house', title: 'House hunting', text: p.house ? `Upgrade? Your ${p.house.name} sells back for ${fmt(p.house.price)}.` : 'Buy a home? If you’re short, the bank lends the rest.', options: opts };
      s.phase = 'choose';
      setEvent(s, seat, 'wait', '🏠', 'House hunting', `${p.name} tours some homes…${payNote}`, paid);
      return;
    }
    case 'stop': {
      const st = STOPS[sp.stop];
      if (sp.stop === 'grad') {
        p.student = false;
        setEvent(s, seat, 'milestone', '🎓', 'Graduation!', `Caps in the air! You’re officially ${an(p.career.name)} ${p.career.name}. Paychecks of ${fmt(p.career.salary)} start now.`, paid);
        addStory(p, '🎓', `Graduated — now ${an(p.career.name)} ${p.career.name}`);
        addLog(s, `🎓 ${p.name} graduates.`);
        return show(s, now);
      }
      if (sp.stop === 'wedding') {
        s.pending = { kind: 'wedding', title: st.title, text: st.text, options: [
          { key: 'wed', icon: '💍', name: 'Tie the knot', note: `Partner for life (+${fmt(PARTNER_BONUS)} at the end) · kids ahead · party costs ${fmt(8 * K)}` },
          { key: 'solo', icon: '🧳', name: 'Stay footloose', note: `Pocket ${fmt(15 * K)} from your travel blog · pets instead of kids` },
        ] };
      } else if (sp.stop === 'fork') {
        s.pending = { kind: 'fork', title: st.title, text: st.text, options: [
          { key: 'safe', icon: '🛡️', name: 'Steady Street', note: '3 paydays · gentle surprises' },
          { key: 'risky', icon: '🎢', name: 'Wild Ride', note: '2 paydays · huge wins and huge losses' },
        ] };
      } else {
        careerChoice(s, p, rand, st.title, st.text);
      }
      s.phase = 'choose';
      setEvent(s, seat, 'wait', st.icon, st.title, `${p.name} is deciding…${payNote}`, paid);
      return;
    }
    case 'retire': {
      const bonus = RETIRE_BONUS[Math.min(s.retired, RETIRE_BONUS.length - 1)];
      s.retired++;
      p.retired = true;
      p.rank = s.retired;
      addCash(p, bonus);
      const ord = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'][p.rank - 1] || 'Next';
      setEvent(s, seat, 'milestone', '🌅', 'Retired!', `${ord} to retire! Your farewell party comes with a ${fmt(bonus)} gift.${payNote}`, bonus + paid);
      addStory(p, '🌅', `Retired (${ord.toLowerCase()} to go)`);
      addLog(s, `🌅 ${p.name} retires (${ord.toLowerCase()}).`);
      return show(s, now);
    }
    default:
      setEvent(s, seat, 'life', '🚶', 'Quiet stretch', `A peaceful walk.${payNote}`, paid);
      return show(s, now);
  }
}

function pickPath(s, i, now) {
  const seat = s.current;
  const p = s.players[seat];
  const pd = s.pending;
  if (pd.step === 'path') {
    if (i === 3) { pd.step = 'dream'; return; }
    const o = pd.jobs[i];
    if (!o) throw new Error('bad choice');
    p.career = { name: o.name, icon: o.icon, salary: o.salary, flavor: o.flavor };
    p.route.lane = 1;
    setEvent(s, seat, 'path', o.icon, 'Hired!', `You start out as ${an(o.name)} ${o.name}. ${o.flavor}`, 0, { card: { ...p.career } });
    addStory(p, o.icon, `Started working as ${an(o.name)} ${o.name}`);
    addLog(s, `${o.icon} ${p.name} starts as ${an(o.name)} ${o.name} (${fmt(o.salary)}).`);
  } else {
    if (i === 3) { pd.step = 'path'; return; }
    const o = pd.dreams[i];
    if (!o) throw new Error('bad choice');
    p.career = { name: o.name, icon: o.icon, salary: o.salary, flavor: o.flavor };
    p.college = true;
    p.student = true;
    p.route.lane = 0;
    p.loans += STUDENT_LOANS;
    setEvent(s, seat, 'path', '🎓', 'Off to college!', `You enroll dreaming of becoming ${an(o.name)} ${o.name}. Student loans: ${STUDENT_LOANS} (${fmt(STUDENT_LOANS * LOAN_REPAY)} to repay).`, 0, { card: { ...p.career }, college: true });
    addStory(p, '🎓', `Went to college to become ${an(o.name)} ${o.name}`);
    addLog(s, `🎓 ${p.name} goes to college (dream: ${o.name}).`);
  }
  p.picked = true;
  s.phase = 'show';
  s.pending = null;
  s.autoAt = now + DEAL_SHOW_MS;
}

function choose(s, i, now) {
  const seat = s.current;
  const p = s.players[seat];
  const pd = s.pending;
  const o = pd?.options?.[i];
  if (!o || !Number.isInteger(i)) throw new Error('bad choice');
  switch (pd.kind) {
    case 'wedding': {
      if (o.key === 'wed') {
        p.partner = true;
        const took = addCash(p, -8 * K);
        setEvent(s, seat, 'milestone', '💍', 'Just married!', `You say “I do” under a shower of confetti. The party costs ${fmt(8 * K)}.${loanNote(took)}`, -8 * K);
        addStory(p, '💍', 'Got married');
        addLog(s, `💍 ${p.name} gets married.`);
      } else {
        p.single = true;
        addCash(p, 15 * K);
        setEvent(s, seat, 'milestone', '🧳', 'Footloose!', `You travel the world and your travel blog pays ${fmt(15 * K)}.`, 15 * K);
        addStory(p, '🧳', 'Chose the footloose life');
        addLog(s, `🧳 ${p.name} stays footloose.`);
      }
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'fork': {
      p.route.fork = i;
      setEvent(s, seat, 'milestone', o.icon, o.name, o.key === 'safe' ? 'You choose Steady Street. Slow and sure.' : 'You choose the Wild Ride. Buckle up!', 0);
      addStory(p, o.icon, `Took ${o.name}`);
      addLog(s, `${o.icon} ${p.name} takes ${o.name}.`);
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'career': {
      if (o.keep) {
        setEvent(s, seat, 'milestone', p.career.icon, 'Staying put', `You stay ${an(p.career.name)} ${p.career.name}. Loyalty!`, 0, { card: { ...p.career } });
      } else {
        p.career = { name: o.name, icon: o.icon, salary: o.salary, flavor: o.flavor };
        setEvent(s, seat, 'milestone', o.icon, 'New job!', `You become ${an(o.name)} ${o.name}. ${o.flavor}`, 0, { card: { ...p.career } });
        addStory(p, o.icon, `Became ${an(o.name)} ${o.name} (${fmt(o.salary)})`);
        addLog(s, `${o.icon} ${p.name} becomes ${an(o.name)} ${o.name} (${fmt(o.salary)}).`);
      }
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'house': {
      if (o.skip) {
        setEvent(s, seat, 'milestone', '🚪', 'Not today', p.house ? `You stay in your ${p.house.name}.` : 'You keep renting. Your landlord sends a thank-you card.', 0);
        return show(s, now, CHOICE_SHOW_MS);
      }
      const back = p.house ? p.house.price : 0;
      const took = addCash(p, back - o.price);
      p.house = { name: o.name, icon: o.icon, price: o.price, worth: o.worth };
      setEvent(s, seat, 'milestone', o.icon, 'Home sweet home!', `You get the keys to the ${o.name}. ${o.flavor}${loanNote(took)}`, back - o.price, { card: { ...o } });
      addStory(p, o.icon, `Bought the ${o.name}`);
      addLog(s, `${o.icon} ${p.name} buys the ${o.name} (${fmt(o.price)}).`);
      return show(s, now, CHOICE_SHOW_MS);
    }
    default:
      throw new Error('bad choice');
  }
}

// ---------- finale ----------
export function lifeTitles(players) {
  const n = players.length;
  const worth = players.map(netWorth);
  const byWorth = players.map((_, i) => i).sort((a, b) => worth[b] - worth[a]);
  const place = (i) => byWorth.indexOf(i);
  const rules = [
    ['💰', 'The Tycoon', (p, i) => place(i) === 0],
    ['👨‍👩‍👧‍👦', 'The Family Legend', (p) => p.kids >= 3],
    ['🔥', 'The Comeback Kid', (p, i) => p.low < 0 && place(i) < Math.ceil(n / 2)],
    ['🎢', 'The Adventurer', (p) => p.route.fork === 1],
    ['🏰', 'The Property Mogul', (p) => p.house && p.house.worth >= 150 * K],
    ['🧠', 'The Brainiac', (p) => p.college && p.career && p.career.salary >= 80 * K],
    ['🐾', 'The Animal Whisperer', (p) => p.pets >= 2],
    ['🐦', 'The Early Bird', (p) => p.rank === 1],
    ['🧳', 'The Free Spirit', (p) => p.single],
    ['🛡️', 'The Steady Eddie', (p) => p.route.fork === 0],
  ];
  const used = new Set();
  return players.map((p, i) => {
    for (const [icon, title, test] of rules) {
      if (!used.has(title) && test(p, i)) { used.add(title); return { icon, title }; }
    }
    return { icon: '🌻', title: 'The Happy Camper' };
  });
}

function endTurn(s, now) {
  s.pending = null;
  if (s.players.every((p) => p.retired)) {
    const worth = s.players.map(netWorth);
    s.phase = 'finale';
    s.finale = {
      order: s.players.map((_, i) => i).sort((a, b) => worth[a] - worth[b] || b - a),
      titles: lifeTitles(s.players),
      revealed: 0,
    };
    s.autoAt = now + FINALE_FIRST_MS;
    addLog(s, 'Everyone has retired — time for the life stories!');
    return;
  }
  let n = s.current;
  do n = (n + 1) % s.players.length; while (s.players[n].retired);
  s.current = n;
  s.phase = 'turn';
}

function nextPicker(s) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (s.current + k) % n;
    if (!s.players[i].picked) return i;
  }
  return -1;
}

/**
 * Player actions (by the current player): {type:'spin'} (rand [10]), {type:'choose', i}
 * System actions (tick): {type:'deal'} (rand), {type:'arrive'} (rand), {type:'next'}, {type:'reveal'}, {type:'end'}
 */
export function applyAction(state, a, rand, now = 0) {
  const s = structuredClone(state);
  const p = s.players[s.current];
  switch (a.type) {
    case 'deal': {
      if (s.phase !== 'deal') throw new Error('not now');
      const jobs = pickDistinct(BASIC_CAREERS.length, 3, rand, 0).map((i) => ({ ...BASIC_CAREERS[i] }));
      const dreams = pickDistinct(DEGREE_CAREERS.length, 3, rand, 3).map((i) => ({ ...DEGREE_CAREERS[i] }));
      s.dealNo++;
      s.pending = { kind: 'start', step: 'path', jobs, dreams };
      s.phase = 'pick';
      return s;
    }
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
      s.autoAt = now + SPIN_MS + HOP_MS * path.length + 300;
      return s;
    }
    case 'arrive': {
      if (s.phase !== 'move') throw new Error('not moving');
      arrive(s, rand, now);
      return s;
    }
    case 'choose': {
      if (!Number.isInteger(a.i)) throw new Error('bad choice');
      if (s.phase === 'pick') pickPath(s, a.i, now);
      else if (s.phase === 'choose') choose(s, a.i, now);
      else throw new Error('nothing to choose');
      return s;
    }
    case 'next': {
      if (s.phase !== 'show') throw new Error('nothing to finish');
      if (!s.players.every((pl) => pl.picked)) {
        s.current = nextPicker(s);
        s.phase = 'deal';
        s.pending = null;
        return s;
      }
      if (!s.started) {
        // everyone has chosen a path: the first chooser spins first
        s.started = true;
        s.current = s.first;
        s.phase = 'turn';
        addLog(s, 'Everyone has a path — let’s go!');
        return s;
      }
      endTurn(s, now);
      return s;
    }
    case 'reveal': {
      if (s.phase !== 'finale' || s.finale.revealed >= s.players.length) throw new Error('not now');
      s.finale.revealed++;
      s.autoAt = now + (s.finale.revealed >= s.players.length ? FINALE_HOLD_MS : FINALE_STEP_MS);
      return s;
    }
    case 'end': {
      if (s.phase !== 'finale' || s.finale.revealed < s.players.length) throw new Error('not now');
      const worth = s.players.map(netWorth);
      const top = Math.max(...worth);
      s.winners = worth.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
      s.phase = 'over';
      addLog(s, s.winners.length > 1 ? 'It’s a tie for the richest life!' : `${s.players[s.winners[0]].name} lived the richest life!`);
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

/** the system action that is due (or null) */
export function due(s, now) {
  if (s.phase === 'deal') return { type: 'deal' };
  if (now < s.autoAt) return null;
  if (s.phase === 'move') return { type: 'arrive' };
  if (s.phase === 'show') return { type: 'next' };
  if (s.phase === 'finale') return s.finale.revealed < s.players.length ? { type: 'reveal' } : { type: 'end' };
  return null;
}

// ---------- computer player ----------
export function botChoice(s, seat) {
  const p = s.players[seat];
  const pd = s.pending;
  if (pd.kind === 'start') {
    const bestJob = Math.max(...pd.jobs.map((o) => o.salary));
    const bestDream = Math.max(...pd.dreams.map((o) => o.salary));
    const list = pd.step === 'path' ? pd.jobs : pd.dreams;
    if (pd.step === 'path' && bestDream - bestJob >= 24 * K) return 3; // college is worth it
    return list.findIndex((o) => o.salary === (pd.step === 'path' ? bestJob : bestDream));
  }
  if (pd.kind === 'wedding') return 0;
  if (pd.kind === 'fork') {
    const mine = netWorth(p);
    const best = Math.max(...s.players.map(netWorth));
    return mine < best - 60 * K ? 1 : 0;
  }
  if (pd.kind === 'career') {
    let bi = 0;
    pd.options.forEach((o, i) => { if (o.salary > pd.options[bi].salary) bi = i; });
    return bi;
  }
  if (pd.kind === 'house') {
    const back = p.house ? p.house.price : 0;
    let bi = pd.options.findIndex((o) => o.skip);
    let bestGain = p.house ? p.house.worth - p.house.price : 0;
    pd.options.forEach((o, i) => {
      if (o.skip) return;
      const loans = Math.ceil(Math.max(0, o.price - back - p.cash) / LOAN);
      if (loans > 3) return;
      const gain = o.worth - o.price - loans * (LOAN_REPAY - LOAN);
      if (gain > bestGain) { bestGain = gain; bi = i; }
    });
    return bi;
  }
  return 0;
}
