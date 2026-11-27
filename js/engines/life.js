// Life Path 2.0 — an original life-journey board game (pure rules, no DOM).
//
// Setup (one system step, random via randomFor): the board layout for this game (length, which
// mid-life fork appears, an optional Adventure Coast, shuffled space order), the starting house
// market and the shuffled decks.
// Then each player in turn chooses a path — one of three dealt jobs, or college + a dream job — and
// (if secret goals are on) keeps one of two secret goal cards.
// On your turn you may play one action card, then spin 1–10 and walk from 18 to 65:
//   Payday (salary + side hustles, passed or landed; land with a house to sell it), Life card
//   (a random event — often a decision: invest, travel, start a hustle, insure, study…), Action
//   (draw an action card), Job offer, Family, House (buy/sell at the moving market price), Stops.
// Cash below zero takes automatic loans (10k, repaid 12k each). Houses follow a market that moves
// every round. When everyone has retired the life stories (and secret goals) are revealed one by
// one; final worth = cash + house value + family − loans + secret-goal bonus.

export const K = 1000;
export const LOAN = 10 * K;
export const LOAN_REPAY = 12 * K;
export const STUDENT_LOANS = 3;
export const PARTNER_BONUS = 20 * K;
export const KID_BONUS = 15 * K;
export const PET_BONUS = 6 * K;
export const MAX_KIDS = 4;
export const MAX_PETS = 3;
export const HAND_MAX = 3;
export const RETIRE_BONUS = [40 * K, 30 * K, 20 * K, 10 * K, 10 * K, 10 * K];
export const AGE_START = 18;
export const AGE_END = 65;

export const SPIN_MS = 1900;
export const HOP_MS = 220;
export const SHOW_MS = 2700;
export const CHOICE_SHOW_MS = 2100;
export const DEAL_SHOW_MS = 2200;
export const FINALE_FIRST_MS = 1200;
export const FINALE_STEP_MS = 3800;
export const FINALE_HOLD_MS = 3000;

// ---------- options ----------
export const OPTIONS = [
  { key: 'length', label: 'Game length', default: 'normal', choices: [['short', 'Short (~10 min)'], ['normal', 'Normal (~15 min)'], ['epic', 'Epic (~25 min)']] },
  { key: 'cash', label: 'Starting cash', default: 'normal', choices: [['low', 'Low ($5k)'], ['normal', 'Normal ($10k)'], ['high', 'High ($30k)']] },
  { key: 'chaos', label: 'Chaos level', default: 'normal', choices: [['calm', 'Calm'], ['normal', 'Normal'], ['wild', 'Wild']] },
  { key: 'actions', label: 'Action cards', default: 'on', choices: [['on', 'On'], ['off', 'Off']] },
  { key: 'goals', label: 'Secret goals', default: 'on', choices: [['on', 'On'], ['off', 'Off']] },
];
const START_CASH = { low: 5 * K, normal: 10 * K, high: 30 * K };
const CHAOS = { calm: 0.6, normal: 1, wild: 1.6 };
export function normOpts(o = {}) {
  const pick = (k, allowed, d) => (allowed.includes(String(o[k])) ? String(o[k]) : d);
  return {
    length: pick('length', ['short', 'normal', 'epic'], 'normal'),
    cash: pick('cash', ['low', 'normal', 'high'], 'normal'),
    chaos: pick('chaos', ['calm', 'normal', 'wild'], 'normal'),
    actions: pick('actions', ['on', 'off'], 'on') === 'on',
    goals: pick('goals', ['on', 'off'], 'on') === 'on',
  };
}
/** scale an amount (in k) by the chaos level */
export const sc = (s, k) => Math.round(k * CHAOS[s.opts.chaos]) * K;

// ---------- deterministic PRNG for the setup shuffle (seeded from randomFor) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

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
  job('Teacher', '📚', 45, 'Shapes young minds, grades until midnight.'),
  job('Journalist', '📰', 47, 'Chases the story, finds the coffee.'),
  job('Nurse', '💉', 50, 'Calm in every storm.'),
  job('Marine Biologist', '🐬', 51, 'Talks to dolphins. Professionally.'),
  job('Architect', '📐', 55, 'Draws buildings that actually stand up.'),
  job('Game Designer', '🎮', 57, 'Gets paid to play. Sort of.'),
  job('Engineer', '⚙️', 60, 'If it’s broken, you’ll fix it.'),
  job('Veterinarian', '🐾', 63, 'Every patient is a good boy.'),
  job('Software Dev', '💻', 65, 'Turns coffee into code.'),
  job('Pilot', '✈️', 69, 'An office with the best view.'),
  job('Pharmacist', '💊', 72, 'Reads every doctor’s handwriting.'),
  job('Surgeon', '🩺', 77, 'Steady hands, very long shifts.'),
];

// house market: four kinds of home, each with its own price index (100 = list price)
export const MARKET_TYPES = [
  { key: 'condo', icon: '🏢', name: 'Condos' },
  { key: 'cabin', icon: '🛖', name: 'Cabins' },
  { key: 'family', icon: '🏡', name: 'Family homes' },
  { key: 'luxury', icon: '🏰', name: 'Luxury' },
];
const home = (name, icon, type, base, flavor) => ({ name, icon, type, base: base * K, flavor });
export const HOUSES = [
  home('Cozy Studio', '🏢', 'condo', 45, 'One room, big dreams.'),
  home('Downtown Loft', '🌆', 'condo', 120, 'Exposed brick and city lights.'),
  home('Tiny Cabin', '🛖', 'cabin', 50, 'Woodstove included. Wi-Fi not.'),
  home('Houseboat', '⛵', 'cabin', 60, 'Gently rocks you to sleep.'),
  home('Beach Shack', '🏖️', 'cabin', 75, 'Sand in everything, forever.'),
  home('Fixer-Upper Farmhouse', '🚜', 'family', 70, 'Needs love. Lots of love.'),
  home('Lakeside Bungalow', '🏡', 'family', 95, 'Sunsets over the dock.'),
  home('Townhouse', '🏘️', 'family', 110, 'Friendly neighbors on both sides.'),
  home('Treehouse Villa', '🌲', 'luxury', 140, 'A grown-up’s childhood dream.'),
  home('Hilltop Manor', '🏰', 'luxury', 220, 'Has a room nobody has found yet.'),
];
// index change per round: slight upward drift, so buying early tends to pay — but not always
const MARKET_STEPS = [-15, -10, -5, 0, 5, 10, 15, 20];
const MARKET_MIN = 50;
const MARKET_MAX = 250;

// ---------- life cards ----------
// plain event: { e, t, x, v (cash k), raise?, trip?, d? (a disaster — insurance cancels it) }
// decision:    { e, t, x, opts: [{ label, note, eff }] }
//   eff: { cash, gamble: { p, win }, raise, hustle, insure, trip, pet, action }
const ev = (e, t, x, v, more = {}) => ({ e, t, x, v, ...more });
const dec = (e, t, x, opts) => ({ e, t, x, opts });
const op = (label, eff = {}) => ({ label, eff });
const PASS = (label = 'No thanks') => op(label, {});

const D = {
  startup: dec('🚀', 'Startup pitch', 'Your friend’s startup needs investors. Put in $20k?', [op('Invest $20k', { cash: -20, gamble: { p: 50, win: 60 } }), PASS('Play it safe')]),
  foodtruck: dec('🚚', 'Food truck dream', 'A used taco truck is for sale. Start a weekend side hustle?', [op('Buy it ($15k)', { cash: -15, hustle: 8 }), PASS()]),
  crafts: dec('🧶', 'Craft shop', 'Your knitted cactus cozies are a hit with friends. Sell them online?', [op('Open shop ($4k)', { cash: -4, hustle: 4 }), PASS()]),
  insure: dec('☂️', 'Insurance agent', 'A cheerful agent offers a policy that cancels your next disaster.', [op('Buy policy ($5k)', { cash: -5, insure: 1 }), PASS('Live dangerously')]),
  night: dec('🌙', 'Night school', 'Evening classes could earn you a raise. Give up your evenings?', [op('Enroll ($12k)', { cash: -12, raise: 10 }), PASS('Netflix instead')]),
  backpack: dec('🎒', 'Backpacking trip', 'Friends are hiking across the mountains for two weeks. Join them?', [op('Go! ($6k)', { cash: -6, trip: 1 }), PASS('Stay home')]),
  cruise: dec('🛳️', 'Island cruise', 'A last-minute deal on an island-hopping cruise!', [op('Book it ($14k)', { cash: -14, trip: 1 }), PASS()]),
  roadtrip: dec('🚐', 'Road trip', 'A cross-country road trip with snacks and questionable music?', [op('Hit the road ($3k)', { cash: -3, trip: 1 }), PASS()]),
  puppy: dec('🐶', 'Shelter puppy', 'A scruffy puppy at the shelter looks right at you.', [op('Adopt ($3k)', { cash: -3, pet: 1 }), PASS('Just visit')]),
  poker: dec('🃏', 'Poker night', 'Your neighbors play for real money on Thursdays.', [op('Buy in ($5k)', { cash: -5, gamble: { p: 50, win: 12 } }), PASS('Bring snacks only')]),
  raffle: dec('🎟️', 'Big raffle', 'A charity raffle: one ticket, one shot at the grand prize.', [op('Ticket ($1k)', { cash: -1, gamble: { p: 20, win: 15 } }), PASS()]),
  tutor: dec('✏️', 'Tutoring gig', 'Kids need help with math. Tutor on weekends?', [op('Start tutoring', { hustle: 2 }), PASS()]),
  favor: dec('🕶️', 'A shady favor', 'A stranger in sunglasses offers you “a favor, no questions asked.”', [op('Pay $4k', { cash: -4, action: 1 }), PASS('Walk away fast')]),
  coin: dec('🪙', 'MoonBean coin', 'Your cousin swears the MoonBean coin is going to the moon.', [op('Invest $15k', { cash: -15, gamble: { p: 40, win: 55 } }), PASS('Hard pass')]),
  angel: dec('👼', 'Angel investor', 'A robot-lawnmower company wants a big check.', [op('Invest $30k', { cash: -30, gamble: { p: 50, win: 80 } }), PASS()]),
  casino: dec('🎰', 'Casino night', 'Bright lights, one roulette spin. Red or black?', [op('Bet $8k', { cash: -8, gamble: { p: 50, win: 18 } }), PASS()]),
  blog: dec('📸', 'Travel blog', 'Your vacation photos go viral. Start a travel blog?', [op('Start it ($3k)', { cash: -3, hustle: 4 }), PASS()]),
  safari: dec('🦒', 'Safari', 'See giraffes up close on a two-week safari?', [op('Go ($12k)', { cash: -12, trip: 1 }), PASS()]),
  volcano: dec('🌋', 'Volcano hike', 'Hike to the rim of a (sleepy) volcano?', [op('Hike ($4k)', { cash: -4, trip: 1 }), PASS('Too hot')]),
  surf: dec('🏄', 'Surf school', 'A week of surf lessons on the coast?', [op('Hang ten ($3k)', { cash: -3, trip: 1 }), PASS()]),
  mba: dec('🎓', 'Evening MBA', 'An evening MBA could fast-track your career.', [op('Enroll ($20k)', { cash: -20, raise: 15 }), PASS()]),
  consult: dec('💼', 'Consulting', 'A client wants you on weekends as a consultant.', [op('Set up ($6k)', { cash: -6, hustle: 6 }), PASS()]),
  pool: dec('🏈', 'Office pool', 'The office sports pool is collecting money.', [op('Join ($2k)', { cash: -2, gamble: { p: 25, win: 10 } }), PASS()]),
  conference: dec('🎤', 'Conference abroad', 'Your boss offers a conference trip — you pay the hotel.', [op('Go ($4k)', { cash: -4, trip: 1, action: 1 }), PASS()]),
  garden: dec('🍅', 'Market garden', 'Sell your tomatoes at the farmers’ market?', [op('Set up ($3k)', { cash: -3, hustle: 3 }), PASS()]),
  camping: dec('🏕️', 'Family camping', 'A week in the woods with everyone (and the mosquitoes).', [op('Go ($3k)', { cash: -3, trip: 1 }), PASS()]),
  mentor: dec('🧑‍🏫', 'Mentor wanted', 'A young company wants you as a part-time mentor.', [op('Say yes', { hustle: 4 }), PASS('Enjoy the quiet')]),
  worldcruise: dec('🌍', 'Round-the-world cruise', 'You’ve dreamed about this one forever.', [op('Sail ($15k)', { cash: -15, trip: 1 }), PASS()]),
  camper: dec('🚐', 'Camper van', 'Buy a camper van and visit every national park?', [op('Buy it ($10k)', { cash: -10, trip: 1 }), PASS()]),
};

export const POOLS = {
  campus: [
    ev('📚', 'Textbook shock', 'You buy one textbook. It costs more than your bike.', -3),
    ev('🏆', 'Scholarship!', 'Your essay on why llamas are underrated wins a scholarship.', 6),
    ev('🎸', 'Campus band', 'Your garage band plays the spring fair… and people pay!', 2),
    ev('💻', 'Laptop vs. cocoa', 'You spill hot cocoa on your laptop the night before finals.', -4, { d: 1 }),
    ev('🧠', 'Trivia champions', 'Your team wins the campus trivia league — with a cash prize!', 3),
    ev('🚲', 'Bike thief', 'Your bike vanishes. Only the lock remains, still locked.', -2, { d: 1 }),
    D.roadtrip, D.tutor, D.raffle, D.favor,
  ],
  early: [
    ev('🚗', 'Clunker car', 'Your first car honks like a goose. The mechanic agrees.', -4, { d: 1 }),
    ev('⭐', 'Employee of the month', 'Your photo goes on the wall — with a bonus!', 5),
    ev('🎤', 'Karaoke legend', 'You win a karaoke contest with a power ballad.', 3),
    ev('🧾', 'Sneaky bill', 'A forgotten gym membership has been charging you for months.', -3),
    ev('📈', 'Raise!', 'Your boss notices you actually read the emails.', 0, { raise: 5 }),
    D.crafts, D.insure, D.backpack, D.puppy, D.night, D.tutor, D.favor,
  ],
  city: [
    ev('🏃', 'First marathon', 'You finish a marathon and your sponsors pay up.', 4),
    ev('🦷', 'Dentist visit', 'A surprise filling. Floss more, they say.', -4, { d: 1 }),
    ev('🎨', 'Art fair', 'You sell a painting of your cat for a shocking amount.', 8),
    ev('🚿', 'Burst pipe', 'Your shower becomes a fountain at 3 a.m.', -6, { d: 1 }),
    ev('📈', 'Promotion!', 'You lead a project that goes brilliantly.', 0, { raise: 10 }),
    ev('🍀', 'Lucky card', 'The scratch card in your birthday card actually wins!', 10),
    ev('🚕', 'Fender bender', 'You gently tap a parked car. Very expensive tap.', -8, { d: 1 }),
    D.startup, D.foodtruck, D.cruise, D.insure, D.poker, D.night, D.crafts, D.puppy, D.favor,
  ],
  safe: [
    ev('🏦', 'Savings interest', 'Your sensible savings account quietly grows.', 5),
    ev('⏰', 'Overtime', 'You pick up extra shifts before the holidays.', 6),
    ev('🧥', 'Coat pocket', 'You find an old savings bond in a winter coat.', 4),
    ev('🌧️', 'Leaky roof', 'A rainstorm reveals your roof’s secret skylight.', -6, { d: 1 }),
    D.night, D.insure, D.garden, D.camping, D.puppy, D.consult, D.raffle,
  ],
  risk: [
    ev('🧦', 'Sock invention', 'You invent self-folding socks. A company buys the patent!', 50),
    ev('⛵', 'Vintage sailboat', 'You buy a vintage sailboat. It sinks on its first trip.', -25, { d: 1 }),
    ev('👟', 'Rare sneakers', 'Your old sneakers turn out to be a rare collector’s pair.', 30),
    ev('🎈', 'Balloon tours', 'Your hot-air balloon tour business floats away.', -25, { d: 1 }),
    D.coin, D.angel, D.casino, D.startup, D.poker, D.foodtruck, D.favor,
  ],
  travel: [
    ev('🧳', 'Lost luggage', 'Your suitcase takes its own vacation.', -3, { d: 1 }),
    ev('🐚', 'Rare shell', 'A collector buys the shell you found on the beach.', 5, { trip: 1 }),
    ev('📷', 'Photo contest', 'Your sunset photo wins a magazine contest!', 8),
    ev('✈️', 'Missed flight', 'You sprint through the airport… and watch the plane leave.', -5, { d: 1 }),
    D.safari, D.volcano, D.surf, D.blog, D.cruise, D.backpack,
  ],
  office: [
    ev('📈', 'Big promotion', 'The corner office is yours.', 0, { raise: 10 }),
    ev('💰', 'Year-end bonus', 'Record year! Everyone gets a bonus.', 12),
    ev('🖨️', 'Printer fire', 'The printer finally does it. Your desk is collateral damage.', -4, { d: 1 }),
    ev('🏅', 'Award night', 'You win “Most Likely to Fix the Coffee Machine”.', 6),
    D.mba, D.consult, D.pool, D.conference, D.insure,
  ],
  golden: [
    ev('🏌️', 'Hole in one', 'You hit a hole in one at the charity tournament!', 8),
    ev('🍪', 'Grandkids visit', 'Visitors arrive and somehow the fridge is empty.', -3),
    ev('🏺', 'Attic treasure', 'The ugly vase from the attic is a priceless antique!', 15),
    ev('🦵', 'Knee trouble', 'Your knee files a formal complaint.', -8, { d: 1 }),
    ev('📖', 'Your memoir', 'You write a memoir. Book clubs love it.', 10),
    ev('🏚️', 'Roof cave-in', 'A storm brings half the roof into the living room.', -12, { d: 1 }),
    D.worldcruise, D.camper, D.mentor, D.insure, D.casino, D.garden, D.puppy,
  ],
};

// ---------- action cards ----------
export const ACTIONS = {
  lawsuit: { icon: '⚖️', name: 'Lawsuit', attack: true, n: 4, text: (s) => `Sue a player for ${fmt(sc(s, 40))}.` },
  headhunt: { icon: '🕴️', name: 'Headhunter', attack: true, n: 3, text: () => 'Their next payday goes to you.' },
  timeshare: { icon: '🏝️', name: 'Timeshare Pitch', attack: true, n: 3, text: (s) => `They must buy a useless timeshare: ${fmt(sc(s, 30))}.` },
  audit: { icon: '🧾', name: 'Surprise Audit', attack: true, n: 3, text: (s) => `They pay ${Math.round(20 * CHAOS[s.opts.chaos])}% of their cash in back taxes.` },
  shield: { icon: '🛡️', name: 'Lawyer Up', n: 4, text: () => 'Keep it: blocks the next card played on you.' },
  windfall: { icon: '🍀', name: 'Lucky Break', n: 3, text: (s) => `Collect ${fmt(sc(s, 25))} right now.` },
  boost: { icon: '🏎️', name: 'Fast Lane', n: 2, text: () => 'Your next spin moves 3 extra spaces.' },
};
export const ACTION_DECK = Object.entries(ACTIONS).flatMap(([k, a]) => Array(a.n).fill(k));

// ---------- secret goals ----------
// each: check(p, s) → { done, bonus, prog }
export const GOALS = {
  tycoon: { icon: '💰', name: 'Tycoon', text: 'Retire with the most cash of anyone.', bonus: '+$60k' },
  family: { icon: '👨‍👩‍👧', name: 'Full House', text: 'Have 3+ kids and pets.', bonus: '+$20k each' },
  homeowner: { icon: '🏡', name: 'Homeowner', text: 'Own a home worth $150k+ at the end.', bonus: '+$70k' },
  globe: { icon: '✈️', name: 'Globetrotter', text: 'Take 3+ trips.', bonus: '+$20k per trip' },
  scholar: { icon: '🎓', name: 'Scholar', text: 'Go to college and earn a raise (or more).', bonus: '+$60k' },
  risk: { icon: '🎲', name: 'Risk Taker', text: 'Win at least one gamble.', bonus: '+$35k per win' },
  hustler: { icon: '🧰', name: 'Hustler', text: 'Start a side hustle (or several).', bonus: '+$30k each' },
  thrifty: { icon: '🐷', name: 'Penny-Wise', text: 'Never take a bank loan (student loans don’t count).', bonus: '+$30k' },
  shark: { icon: '🦈', name: 'Card Shark', text: 'Land 2+ action cards on other players.', bonus: '+$25k each' },
  star: { icon: '🌟', name: 'Career Star', text: 'Retire with a salary of $85k+.', bonus: '+$60k' },
  early: { icon: '🐦', name: 'Early Bird', text: 'Be the first to retire.', bonus: '+$50k' },
};
export const goalKeys = (s) => Object.keys(GOALS).filter((k) => k !== 'shark' || s.opts.actions);

export function goalStatus(s, i) {
  const p = s.players[i];
  const g = p.goal;
  if (!g) return null;
  const st = p.st;
  const n = (have, need, per, fixed) => ({ done: have >= need, bonus: have >= need ? (per ? per * have : fixed) * K : 0, prog: `${Math.min(have, need)}/${need}` });
  switch (g) {
    case 'tycoon': {
      const top = Math.max(...s.players.map((q) => q.cash));
      return { done: p.cash >= top, bonus: p.cash >= top ? 60 * K : 0, prog: p.cash >= top ? 'richest now' : 'not the richest' };
    }
    case 'family': return n(p.kids + p.pets, 3, 20);
    case 'homeowner': { const v = p.house ? houseValue(s, p.house) : 0; return { done: v >= 150 * K, bonus: v >= 150 * K ? 70 * K : 0, prog: p.house ? fmt(v) : 'no home' }; }
    case 'globe': return n(st.trips, 3, 20);
    case 'scholar': return p.college ? n(st.raises, 1, 0, 60) : { done: false, bonus: 0, prog: 'no degree' };
    case 'risk': return n(st.gWins, 1, 35);
    case 'hustler': return n(st.hustles, 1, 30);
    case 'thrifty': return { done: st.bankLoans === 0, bonus: st.bankLoans === 0 ? 30 * K : 0, prog: st.bankLoans ? 'took a loan' : 'no loans yet' };
    case 'shark': return n(st.plays, 2, 25);
    case 'star': { const sal = p.career?.salary || 0; return { done: sal >= 85 * K, bonus: sal >= 85 * K ? 60 * K : 0, prog: fmt(sal) }; }
    case 'early': return { done: p.rank === 1, bonus: p.rank === 1 ? 50 * K : 0, prog: p.rank ? (p.rank === 1 ? 'first!' : 'too late') : 'not yet' };
    default: return null;
  }
}

// ---------- board ----------
export const TYPES = {
  start: { icon: '🚩', tag: 'START', name: 'Start' },
  payday: { icon: '💵', tag: 'PAYDAY', name: 'Payday' },
  cash: { icon: '✨', tag: 'LIFE', name: 'Life card' },
  action: { icon: '🎴', tag: 'ACTION', name: 'Action card' },
  career: { icon: '💼', tag: 'JOB', name: 'Job offer' },
  family: { icon: '👶', tag: 'FAMILY', name: 'Family' },
  house: { icon: '🏠', tag: 'HOUSE', name: 'House' },
  stop: { icon: '✋', tag: 'STOP', name: 'Stop' },
  retire: { icon: '🌅', tag: 'RETIRE', name: 'Retirement' },
};
export const STOPS = {
  grad: { icon: '🎓', tag: 'GRAD', title: 'Graduation', text: 'Caps in the air! Your dream job starts paying.' },
  wedding: { icon: '💍', tag: 'WEDDING', title: 'Wedding bells', text: 'Settle down with a sweetheart, or stay footloose?' },
  fork: { icon: '🔀', tag: 'FORK', title: 'Fork in the road', text: 'Which way will your life go?' },
  rethink: { icon: '🔄', tag: '2ND ACT', title: 'Second act', text: 'Fresh start in a new career, or stay put?' },
};
export const FORKS = {
  A: [{ key: 'safe', icon: '🛡️', name: 'Steady Street', pool: 'safe', note: 'More paydays · gentle surprises' }, { key: 'wild', icon: '🎢', name: 'Wild Ride', pool: 'risk', note: 'Big gambles · huge wins and losses' }],
  B: [{ key: 'scenic', icon: '🗺️', name: 'Scenic Route', pool: 'travel', note: 'Trips and adventures' }, { key: 'fast', icon: '🏢', name: 'Fast Track', pool: 'office', note: 'Raises, bonuses, office life' }],
};

const ROWS_BY_LENGTH = {
  short: { campus: 2, city: 2, mid: 2, coast: 0, golden: 2 },
  normal: { campus: 3, city: 3, mid: 3, coast: 2, golden: 3 },
  epic: { campus: 3, city: 4, mid: 3, coast: 2, golden: 4 },
};
// a segment's spaces: fixed counts, the rest life cards, shuffled
function cells(n, counts, r, withActions) {
  const list = [];
  for (const [t, c] of Object.entries(counts)) for (let i = 0; i < c; i++) list.push(t === 'action' && !withActions ? 'cash' : t);
  while (list.length < n) list.push('cash');
  return shuffle(list.slice(0, n), r);
}

const BOARDS = new Map();
/** the board for a layout {length, fork, coast, seed, actions} (pure, memoized) */
export function buildBoard(layout) {
  const key = JSON.stringify(layout);
  if (BOARDS.has(key)) return BOARDS.get(key);
  const R = ROWS_BY_LENGTH[layout.length];
  const r = rng(layout.seed);
  const acts = layout.actions;
  const spaces = [];
  const zones = [];
  let row = 0;
  const lay = (types, cols, row0, dir, extra) => {
    const ids = [];
    let i = 0; let rr = row0; let d = dir;
    while (i < types.length) {
      const order = d === 1 ? cols : [...cols].reverse();
      for (const c of order) {
        if (i >= types.length) break;
        const [t, more] = Array.isArray(types[i]) ? types[i] : [types[i], {}];
        const sp = { id: spaces.length, t, col: c, row: rr, next: [], ...extra, ...more };
        if (ids.length) spaces[ids[ids.length - 1]].next.push(sp.id);
        spaces.push(sp);
        ids.push(sp.id);
        i++;
      }
      rr++; d = -d;
    }
    return ids;
  };
  const L3 = [0, 1, 2]; const R3 = [3, 4, 5]; const ALL = [0, 1, 2, 3, 4, 5];
  const stop = (k) => ['stop', { stop: k }];
  const link = (a, b) => spaces[a].next.push(b);

  const [start] = lay(['start'], [2.5], 0, 1, { zone: 'campus', fork: 'lane' });
  row = 1;
  // campus & first jobs
  const nl = R.campus * 3;
  const campus = lay([...cells(nl - 1, { action: 1, family: 0 }, r, acts), stop('grad')], L3, row, 1, { pool: 'campus', zone: 'campus', lane: 0 });
  const work = lay(cells(nl, { payday: Math.round(nl / 3), career: 1, action: 1 }, r, acts), R3, row, -1, { pool: 'early', zone: 'campus', lane: 1 });
  link(start, campus[0]); link(start, work[0]);
  zones.push({ key: 'campus', name: 'Campus & First Jobs', icon: '🎓', rows: [row, row + R.campus - 1], lanes: ['🎓 Campus', '🛠️ First jobs'] });
  row += R.campus;
  // big city: wedding early, fork at the end
  const nc = R.city * 6;
  const cityCells = cells(nc - 2, { payday: Math.round(nc / 4), house: 2, family: R.city, career: 1, action: Math.max(1, R.city - 1) }, r, acts);
  cityCells.splice(2, 0, stop('wedding'));
  const city = lay([...cityCells, ['stop', { stop: 'fork', fork: 'fork' }]], ALL, row, 1, { pool: 'city', zone: 'city' });
  link(campus[campus.length - 1], city[0]); link(work[work.length - 1], city[0]);
  zones.push({ key: 'city', name: 'Big City', icon: '🏙️', rows: [row, row + R.city - 1] });
  row += R.city;
  // mid-life fork (two variants)
  const [fa, fb] = FORKS[layout.fork];
  const nm = R.mid * 3;
  const dirMid = city.length % 12 === 0 ? 1 : -1;
  const laneA = lay(cells(nm, { payday: fa.key === 'safe' ? Math.ceil(nm / 3) : Math.round(nm / 4), family: 1, house: 1, action: fa.key === 'safe' ? 0 : 1 }, r, acts), L3, row, dirMid, { pool: fa.pool, zone: 'mid', lane: 0 });
  const laneB = lay(cells(nm, { payday: Math.round(nm / 4) + (fb.key === 'fast' ? 1 : 0), family: 1, house: 1, action: 1 }, r, acts), R3, row, dirMid, { pool: fb.pool, zone: 'mid', lane: 1 });
  const fork = city[city.length - 1];
  link(fork, laneA[0]); link(fork, laneB[0]);
  zones.push({ key: 'mid', name: layout.fork === 'A' ? 'Suburbs' : 'Crossroads Years', icon: layout.fork === 'A' ? '🏡' : '🧭', rows: [row, row + R.mid - 1], lanes: [`${fa.icon} ${fa.name}`, `${fb.icon} ${fb.name}`] });
  row += R.mid;
  let prevEnds = [laneA[laneA.length - 1], laneB[laneB.length - 1]];
  // optional adventure coast
  if (layout.coast && R.coast) {
    const nco = R.coast * 6;
    const coast = lay(cells(nco, { payday: Math.round(nco / 4), house: 1, action: 1 }, r, acts), ALL, row, 1, { pool: 'travel', zone: 'coast' });
    for (const e of prevEnds) link(e, coast[0]);
    prevEnds = [coast[coast.length - 1]];
    zones.push({ key: 'coast', name: 'Adventure Coast', icon: '🏝️', rows: [row, row + R.coast - 1] });
    row += R.coast;
  }
  // golden years: second act early, retirement at the end
  const ng = R.golden * 6;
  const gCells = cells(ng - 2, { payday: Math.round(ng / 4), house: 1, family: R.golden, action: 1 }, r, acts);
  gCells.splice(2, 0, stop('rethink'));
  const golden = lay([...gCells, 'retire'], ALL, row, 1, { pool: 'golden', zone: 'golden' });
  for (const e of prevEnds) link(e, golden[0]);
  zones.push({ key: 'golden', name: 'Golden Years', icon: '🌅', rows: [row, row + R.golden - 1] });
  row += R.golden;

  const retire = golden[golden.length - 1];
  const dist = spaces.map(() => -1);
  dist[0] = 0;
  const q = [0];
  while (q.length) { const id = q.shift(); for (const n of spaces[id].next) if (dist[n] < 0) { dist[n] = dist[id] + 1; q.push(n); } }
  const b = { spaces, zones, rows: row, retire, dist, layout };
  BOARDS.set(key, b);
  return b;
}
export const DEFAULT_LAYOUT = { length: 'normal', fork: 'A', coast: false, seed: 1, actions: true };
export const boardOf = (s) => buildBoard(s.layout || { ...DEFAULT_LAYOUT, length: s.opts?.length || 'normal', actions: s.opts ? s.opts.actions : true });
export const ageAt = (b, id) => AGE_START + Math.round((b.dist[id] * (AGE_END - AGE_START)) / b.dist[b.retire]);
export const isStop = (sp) => sp.t === 'stop' || sp.t === 'retire';
export const spaceIcon = (sp) => (sp.t === 'stop' ? STOPS[sp.stop].icon : sp.t === 'cash' && sp.pool === 'risk' ? '🎰' : sp.t === 'cash' && sp.pool === 'travel' ? '🧭' : TYPES[sp.t].icon);
export const spaceTag = (sp) => (sp.t === 'stop' ? STOPS[sp.stop].tag : sp.t === 'cash' && sp.pool === 'risk' ? 'GAMBLE' : sp.t === 'cash' && sp.pool === 'travel' ? 'TRAVEL' : TYPES[sp.t].tag);

// ---------- helpers ----------
export const fmt = (n) => {
  const v = Math.round(n / K);
  return `${v < 0 ? '−' : ''}$${Math.abs(v)}k`;
};
export const signed = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
const an = (w) => (/^[AEIOU]/i.test(w) ? 'an' : 'a');

export const houseValue = (s, h) => Math.round((HOUSES[h.i].base * s.market[HOUSES[h.i].type].v) / 100 / K) * K;
export function familyBonus(p) {
  return (p.partner ? PARTNER_BONUS : 0) + p.kids * KID_BONUS + p.pets * PET_BONUS;
}
/** visible net worth (no secret-goal bonus) */
export function netWorth(s, p) {
  return p.cash + (p.house ? houseValue(s, p.house) : 0) + familyBonus(p) - p.loans * LOAN_REPAY;
}
export function finalWorth(s, i) {
  return netWorth(s, s.players[i]) + (s.opts.goals ? goalStatus(s, i)?.bonus || 0 : 0);
}
export function stage(p) {
  if (p.retired) return { icon: '🌅', name: 'Retired' };
  if (p.student) return { icon: '🎓', name: 'Student' };
  if (p.house && (p.partner || p.pets)) return { icon: '🏡', name: 'Settled' };
  if (p.career) return { icon: '💼', name: 'Working' };
  return { icon: '🧒', name: 'Starting out' };
}

function addLog(s, msg) { s.log = [...s.log, msg].slice(-60); }
function addStory(s, p, e, t) { p.story = [...p.story, { a: ageAt(boardOf(s), p.pos), e, t }].slice(-24); }
function addCash(p, amt) {
  p.cash += amt;
  let took = 0;
  while (p.cash < 0) { p.cash += LOAN; p.loans++; p.st.bankLoans++; took++; }
  return took;
}
const loanNote = (took) => (took ? ` (${took} loan${took > 1 ? 's' : ''} taken)` : '');

export function nextSpace(b, p, id) {
  const sp = b.spaces[id];
  if (!sp.next.length) return null;
  if (sp.next.length === 1) return sp.next[0];
  const r = p.route[sp.fork];
  return r == null ? null : sp.next[r];
}
export function walk(b, p, n) {
  const path = [];
  let at = p.pos;
  for (let k = 0; k < n; k++) {
    const nx = nextSpace(b, p, at);
    if (nx == null) break;
    path.push(nx);
    at = nx;
    if (isStop(b.spaces[nx])) break;
  }
  return path;
}
/** what's coming up in the next few spaces: [{icon, label}] (distinct, in order) */
export function upcoming(s, p, n = 10, max = 4) {
  const b = boardOf(s);
  const out = [];
  const seen = new Set();
  let at = p.pos;
  for (let k = 0; k < n && out.length < max; k++) {
    at = nextSpace(b, p, at);
    if (at == null) break;
    const t = b.spaces[at];
    let item;
    if (t.t === 'stop') item = { icon: STOPS[t.stop].icon, label: STOPS[t.stop].title };
    else if (t.t === 'payday') item = { icon: '💵', label: 'Payday' };
    else if (t.t === 'house') item = { icon: '🏠', label: 'Houses' };
    else if (t.t === 'career') item = { icon: '💼', label: 'Job offer' };
    else if (t.t === 'action') item = { icon: '🎴', label: 'Action card' };
    else if (t.t === 'family') item = p.partner ? { icon: '👶', label: 'Family' } : { icon: '🐾', label: 'Pets' };
    else if (t.t === 'retire') item = { icon: '🌅', label: 'Retirement' };
    else if (t.pool === 'risk') item = { icon: '🎰', label: 'Gambles' };
    else if (t.pool === 'travel') item = { icon: '🧭', label: 'Adventures' };
    if (item && !seen.has(item.label)) { seen.add(item.label); out.push(item); }
  }
  return out;
}

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

export function newGame(players, first = 0, options = {}) {
  const opts = normOpts(options);
  return {
    opts,
    players: players.map((pl) => ({
      pid: pl.pid, name: pl.name, pos: 0, cash: START_CASH[opts.cash], loans: 0, career: null, college: false, student: false,
      partner: false, single: false, kids: 0, pets: 0, house: null, retired: false, rank: 0, route: {},
      story: [], best: null, low: START_CASH[opts.cash], picked: false,
      goal: null, goalOffer: null, hand: [], hustle: 0, insured: false, boost: 0, poachedBy: -1,
      st: { trips: 0, raises: 0, gWins: 0, hustles: 0, plays: 0, bankLoans: 0 },
    })),
    first,
    started: false,
    current: first,
    phase: 'setup', // setup | deal | pick | turn | move | choose | show | finale | over
    layout: null,
    market: null, // { type: { v, d } }
    round: 0,
    decks: null, // { pool: [remaining card indices] }
    adeck: null, // remaining action cards
    pending: null,
    move: null,
    event: null,
    played: false,
    resume: null,
    moveNo: 0,
    eventNo: 0,
    dealNo: 0,
    retired: 0,
    autoAt: 0,
    finale: null,
    winners: null,
    log: ['Life Path begins — everyone chooses a path!'],
  };
}

function setEvent(s, seat, kind, icon, title, text, delta = 0, extra = {}) {
  s.eventNo++;
  s.event = { no: s.eventNo, seat, kind, icon, title, text, delta, ...extra };
}

const deckLen = (s, pool) => s.decks[pool].length || POOLS[pool].length;
const adeckLen = (s) => s.adeck.length || ACTION_DECK.length;
const wrapsRound = (s) => {
  if (s.phase !== 'show' || s.resume || !s.started || s.players.every((p) => p.retired)) return false;
  let n = s.current;
  do n = (n + 1) % s.players.length; while (s.players[n].retired);
  return n <= s.current;
};

/** random ints the next system action needs */
export function systemRanges(s) {
  if (s.phase === 'setup') return [2 ** 31];
  if (s.phase === 'deal') {
    const b = BASIC_CAREERS.length; const d = DEGREE_CAREERS.length; const g = goalKeys(s).length;
    return [b, b - 1, b - 2, d, d - 1, d - 2, ...(s.opts.goals ? [g, g - 1] : [])];
  }
  if (s.phase === 'show') return wrapsRound(s) ? MARKET_TYPES.map(() => MARKET_STEPS.length) : null;
  if (s.phase !== 'move') return null;
  const p = s.players[s.current];
  const sp = boardOf(s).spaces[p.pos];
  if (sp.t === 'cash') return [deckLen(s, sp.pool)];
  if (sp.t === 'action') return p.hand.length < HAND_MAX ? [adeckLen(s)] : null;
  if (sp.t === 'family') return [10];
  if (sp.t === 'career' || (sp.t === 'stop' && sp.stop === 'rethink')) { const n = careerPool(p).length; return [n, n - 1]; }
  if (sp.t === 'house') return [HOUSES.length, HOUSES.length - 1, HOUSES.length - 2];
  return null;
}
/** random ints a player's choice needs (a gamble, or an action card from a decision) */
export function chooseRanges(s, i) {
  if (s.phase !== 'choose' || s.pending?.kind !== 'decision') return null;
  const o = s.pending.options[i];
  if (!o) return null;
  const r = [];
  if (o.eff.gamble) r.push(100);
  if (o.eff.action && s.opts.actions && s.players[s.current].hand.length < HAND_MAX) r.push(adeckLen(s));
  return r.length ? r : null;
}

function show(s, now, ms = SHOW_MS) {
  s.phase = 'show';
  s.pending = null;
  s.autoAt = now + ms;
  for (const p of s.players) p.low = Math.min(p.low, netWorth(s, p));
}
function drawAction(s, p, r) {
  if (!s.adeck.length) s.adeck = [...ACTION_DECK];
  if (!(Number.isInteger(r) && r >= 0 && r < s.adeck.length)) throw new Error('bad draw');
  const c = s.adeck.splice(r, 1)[0];
  p.hand = [...p.hand, c];
  return c;
}
/** pay a player's salary (or send it to a headhunter) + side hustles; returns what they got */
function payday(s, p) {
  let got = 0;
  let note = '';
  const sal = p.career && !p.student ? p.career.salary : 0;
  if (sal && p.poachedBy >= 0) {
    const thief = s.players[p.poachedBy];
    addCash(thief, sal);
    note = ` ${thief.name}’s headhunter took this paycheck!`;
    p.poachedBy = -1;
  } else if (sal) { addCash(p, sal); got += sal; }
  if (p.hustle) { addCash(p, p.hustle); got += p.hustle; }
  return { got, note };
}

function careerChoice(s, p, rand, title, text) {
  const pool = careerPool(p);
  const opts = pickDistinct(pool.length, 2, rand).map((i) => ({ ...pool[i] }));
  if (p.career) opts.push({ keep: true, ...p.career });
  s.pending = { kind: 'career', title, text, options: opts };
  s.phase = 'choose';
}

function applyEffect(s, p, eff, rand = [], seat) {
  const out = [];
  let delta = 0;
  let ri = 0;
  if (eff.cash) { const amt = eff.cash < 0 ? eff.cash * K : sc(s, eff.cash); const took = addCash(p, amt); delta += amt; if (took) out.push(loanNote(took).trim()); }
  if (eff.gamble) {
    const roll = rand[ri++];
    if (!(Number.isInteger(roll) && roll >= 0 && roll < 100)) throw new Error('missing roll');
    if (roll < eff.gamble.p) { const w = sc(s, eff.gamble.win); addCash(p, w); delta += w; p.st.gWins++; out.push(`It pays off: +${fmt(w)}!`); if (!p.best || w > p.best.v) p.best = { e: '🎲', t: 'A gamble paid off', v: w }; addStory(s, p, '🎲', `Won a gamble ${signed(w)}`); } else out.push('It flops. The money is gone.');
  }
  if (eff.raise && p.career) { p.career = { ...p.career, salary: p.career.salary + eff.raise * K }; p.st.raises++; out.push(`Salary +${fmt(eff.raise * K)} → ${fmt(p.career.salary)}.`); addStory(s, p, '📈', `Raise to ${fmt(p.career.salary)}`); }
  if (eff.hustle) { p.hustle += eff.hustle * K; p.st.hustles++; out.push(`+${fmt(eff.hustle * K)} every payday.`); addStory(s, p, '🧰', `Started a side hustle (+${fmt(eff.hustle * K)}/payday)`); }
  if (eff.insure) { p.insured = true; out.push('Your next disaster is covered.'); }
  if (eff.trip) { p.st.trips++; addStory(s, p, '✈️', `Trip #${p.st.trips}`); }
  if (eff.pet && p.pets < MAX_PETS) { p.pets++; addStory(s, p, '🐾', 'Adopted a pet'); }
  if (eff.action && s.opts.actions && p.hand.length < HAND_MAX) { const c = drawAction(s, p, rand[ri++]); out.push('You pocket a secret action card.'); }
  return { delta, text: out.join(' ') };
}

function arrive(s, rand, now) {
  const seat = s.current;
  const p = s.players[seat];
  const b = boardOf(s);
  const sp = b.spaces[p.pos];
  const mv = s.move;
  let paid = 0;
  let notes = '';
  for (const id of (mv?.path || []).slice(0, -1)) {
    if (b.spaces[id].t !== 'payday') continue;
    const r = payday(s, p);
    paid += r.got; notes += r.note;
  }
  const payNote = (paid ? ` Plus ${fmt(paid)} from paydays on the way.` : '') + notes;
  const need = systemRanges(s);
  if (need && !(rand && rand.length >= need.length)) throw new Error('missing draw');

  switch (sp.t) {
    case 'payday': {
      const r = payday(s, p);
      const parts = p.career && !p.student ? `Your ${p.career.name} paycheck${p.hustle ? ' and side hustles' : ''} land: ${fmt(r.got)}.` : 'No paycheck yet.';
      setEvent(s, seat, 'payday', '💵', 'Payday!', `${parts}${r.note}${payNote}`, r.got + paid);
      addLog(s, `💵 ${p.name} collects ${fmt(r.got + paid)}.`);
      if (p.house) {
        const v = houseValue(s, p.house);
        s.pending = { kind: 'sell', title: 'Sell your home?', text: `The ${HOUSES[p.house.i].name} would sell for ${fmt(v)} today (${MARKET_TYPES.find((m) => m.key === HOUSES[p.house.i].type).name} at ${s.market[HOUSES[p.house.i].type].v}).`, options: [{ key: 'keep', icon: '🔑', name: 'Keep it', note: 'It counts at market value at the end' }, { key: 'sell', icon: '🪧', name: `Sell for ${fmt(v)}`, note: 'Cash in now; you can buy again later' }] };
        s.phase = 'choose';
        return;
      }
      return show(s, now);
    }
    case 'cash': {
      const deck = s.decks[sp.pool].length ? s.decks[sp.pool] : (s.decks[sp.pool] = POOLS[sp.pool].map((_, i) => i));
      const di = rand[0];
      if (!(Number.isInteger(di) && di >= 0 && di < deck.length)) throw new Error('bad draw');
      const card = POOLS[sp.pool][deck.splice(di, 1)[0]];
      if (card.opts) {
        s.pending = { kind: 'decision', title: card.t, text: card.x, icon: card.e, options: card.opts.map((o) => ({ ...o })) };
        s.phase = 'choose';
        setEvent(s, seat, 'wait', card.e, card.t, `${p.name} has a decision to make…${payNote}`, paid);
        return;
      }
      let amt = card.v < 0 ? sc(s, card.v) : sc(s, card.v);
      let extra = '';
      if (card.d && p.insured) { p.insured = false; extra = ' Your insurance covers it! ☂️'; amt = 0; }
      const took = addCash(p, amt);
      if (card.raise && p.career) { p.career = { ...p.career, salary: p.career.salary + card.raise * K }; p.st.raises++; extra += ` Salary +${fmt(card.raise * K)} → ${fmt(p.career.salary)}.`; addStory(s, p, card.e, `${card.t} Salary ${fmt(p.career.salary)}`); }
      if (card.trip) p.st.trips++;
      if (Math.abs(amt) >= 20 * K) addStory(s, p, card.e, `${card.t} ${signed(amt)}`);
      if (amt > 0 && (!p.best || amt > p.best.v)) p.best = { e: card.e, t: card.t, v: amt };
      setEvent(s, seat, sp.pool === 'risk' ? 'gamble' : 'life', card.e, card.t, `${card.x}${extra}${loanNote(took)}${payNote}`, amt + paid, card.raise ? { raise: card.raise * K } : {});
      addLog(s, `${card.e} ${p.name}: ${card.t} ${card.raise ? `+${fmt(card.raise * K)} salary` : signed(amt)}`);
      return show(s, now);
    }
    case 'action': {
      if (!s.opts.actions || p.hand.length >= HAND_MAX) {
        setEvent(s, seat, 'life', '🎴', 'Hands full', `You can’t hold more than ${HAND_MAX} action cards.${payNote}`, paid);
        return show(s, now);
      }
      const c = drawAction(s, p, rand[0]);
      setEvent(s, seat, 'action', '🎴', 'Action card!', `${p.name} draws a secret action card.${payNote}`, paid, { secret: c });
      addLog(s, `🎴 ${p.name} draws an action card.`);
      return show(s, now);
    }
    case 'family': {
      if (p.partner && p.kids < MAX_KIDS) {
        const twins = rand[0] === 0 && p.kids <= MAX_KIDS - 2;
        p.kids += twins ? 2 : 1;
        addCash(p, 2 * K);
        setEvent(s, seat, 'family', twins ? '👶👶' : '👶', twins ? 'Twins!' : 'Baby on board!', `${twins ? 'Two tiny humans join' : 'A tiny human joins'} your family. Friends shower you with ${fmt(2 * K)} in gifts.${payNote}`, 2 * K + paid);
        addStory(s, p, twins ? '👶👶' : '👶', twins ? 'Welcomed twins' : `Welcomed baby #${p.kids}`);
        addLog(s, `👶 ${p.name} welcomes ${twins ? 'twins' : 'a baby'}.`);
      } else if (!p.partner && p.pets < MAX_PETS) {
        p.pets++;
        const pet = ['🐶', '🐱', '🦜'][Math.min(2, p.pets - 1)];
        const took = addCash(p, -2 * K);
        setEvent(s, seat, 'family', pet, 'New best friend', `You adopt a ${['scruffy dog', 'grumpy cat', 'chatty parrot'][Math.min(2, p.pets - 1)]}. Vet bills ${fmt(2 * K)}, endless joy.${loanNote(took)}${payNote}`, -2 * K + paid);
        addStory(s, p, pet, 'Adopted a pet');
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
      const opts = pickDistinct(HOUSES.length, 3, rand).map((i) => ({ i, ...HOUSES[i], price: houseValue(s, { i }) })).sort((a, b2) => a.price - b2.price);
      if (p.house) opts.push({ sell: true, price: houseValue(s, p.house) });
      opts.push({ skip: true });
      s.pending = { kind: 'house', title: 'House hunting', text: p.house ? `You own the ${HOUSES[p.house.i].name} (worth ${fmt(houseValue(s, p.house))} today). Upgrade, sell or keep?` : 'Prices follow the market. Short on cash? The bank lends the rest.', options: opts };
      s.phase = 'choose';
      setEvent(s, seat, 'wait', '🏠', 'House hunting', `${p.name} tours some homes…${payNote}`, paid);
      return;
    }
    case 'stop': {
      const st = STOPS[sp.stop];
      if (sp.stop === 'grad') {
        p.student = false;
        setEvent(s, seat, 'milestone', '🎓', 'Graduation!', `Caps in the air! You’re officially ${an(p.career.name)} ${p.career.name}. Paychecks of ${fmt(p.career.salary)} start now.`, paid);
        addStory(s, p, '🎓', `Graduated — now ${an(p.career.name)} ${p.career.name}`);
        addLog(s, `🎓 ${p.name} graduates.`);
        return show(s, now);
      }
      if (sp.stop === 'wedding') {
        s.pending = { kind: 'wedding', title: st.title, text: st.text, options: [
          { key: 'wed', icon: '💍', name: 'Tie the knot', note: `Partner (+${fmt(PARTNER_BONUS)} at the end) · kids ahead · party ${fmt(8 * K)}` },
          { key: 'solo', icon: '🧳', name: 'Stay footloose', note: `A trip + ${fmt(12 * K)} from your travel blog · pets, not kids` },
        ] };
      } else if (sp.stop === 'fork') {
        s.pending = { kind: 'fork', title: st.title, text: st.text, options: FORKS[s.layout.fork].map((f) => ({ ...f })) };
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
      addStory(s, p, '🌅', `Retired (${ord.toLowerCase()} to go)`);
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
  if (pd.step === 'goal') {
    const g = pd.goals[i];
    if (!g || i > 1) throw new Error('bad choice');
    p.goal = g;
    return finishPick(s, now);
  }
  if (pd.step === 'path') {
    if (i === 3) { pd.step = 'dream'; return; }
    const o = pd.jobs[i];
    if (!o) throw new Error('bad choice');
    p.career = { name: o.name, icon: o.icon, salary: o.salary, flavor: o.flavor };
    p.route.lane = 1;
    pd.chosen = { kind: 'job', card: { ...p.career } };
    addStory(s, p, o.icon, `Started working as ${an(o.name)} ${o.name}`);
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
    pd.chosen = { kind: 'college', card: { ...p.career } };
    addStory(s, p, '🎓', `Went to college to become ${an(o.name)} ${o.name}`);
    addLog(s, `🎓 ${p.name} goes to college (dream: ${o.name}).`);
  }
  if (s.opts.goals) { pd.step = 'goal'; return; }
  finishPick(s, now);
}
function finishPick(s, now) {
  const seat = s.current;
  const p = s.players[seat];
  const ch = s.pending.chosen;
  if (ch.kind === 'job') setEvent(s, seat, 'path', ch.card.icon, 'Hired!', `You start out as ${an(ch.card.name)} ${ch.card.name}. ${ch.card.flavor}`, 0, { card: ch.card });
  else setEvent(s, seat, 'path', '🎓', 'Off to college!', `You enroll dreaming of becoming ${an(ch.card.name)} ${ch.card.name}. Student loans: ${STUDENT_LOANS} (${fmt(STUDENT_LOANS * LOAN_REPAY)} to repay).`, 0, { card: ch.card, college: true });
  p.picked = true;
  p.goalOffer = null;
  s.phase = 'show';
  s.pending = null;
  s.autoAt = now + DEAL_SHOW_MS;
}

function choose(s, i, rand, now) {
  const seat = s.current;
  const p = s.players[seat];
  const pd = s.pending;
  const o = pd?.options?.[i];
  if (!o || !Number.isInteger(i)) throw new Error('bad choice');
  switch (pd.kind) {
    case 'decision': {
      if (!Object.keys(o.eff).length) {
        setEvent(s, seat, 'milestone', pd.icon, pd.title, `You pass. ${o.label === 'No thanks' ? 'Maybe next time.' : o.label + '.'}`, 0);
        return show(s, now, CHOICE_SHOW_MS);
      }
      const r = applyEffect(s, p, o.eff, rand || [], seat);
      const kind = o.eff.gamble ? 'gamble' : 'milestone';
      setEvent(s, seat, kind, pd.icon, pd.title, `${o.label}. ${r.text}`.trim(), r.delta);
      addLog(s, `${pd.icon} ${p.name}: ${pd.title} — ${o.label}${r.delta ? ` (${signed(r.delta)})` : ''}`);
      return show(s, now, o.eff.gamble ? SHOW_MS : CHOICE_SHOW_MS);
    }
    case 'wedding': {
      if (o.key === 'wed') {
        p.partner = true;
        const took = addCash(p, -8 * K);
        setEvent(s, seat, 'milestone', '💍', 'Just married!', `You say “I do” under a shower of confetti. The party costs ${fmt(8 * K)}.${loanNote(took)}`, -8 * K);
        addStory(s, p, '💍', 'Got married');
        addLog(s, `💍 ${p.name} gets married.`);
      } else {
        p.single = true;
        p.st.trips++;
        addCash(p, 12 * K);
        setEvent(s, seat, 'milestone', '🧳', 'Footloose!', `You travel the world and your travel blog pays ${fmt(12 * K)}.`, 12 * K);
        addStory(s, p, '🧳', 'Chose the footloose life');
        addLog(s, `🧳 ${p.name} stays footloose.`);
      }
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'fork': {
      p.route.fork = i;
      setEvent(s, seat, 'milestone', o.icon, o.name, `You take the ${o.name}. ${o.note}.`, 0);
      addStory(s, p, o.icon, `Took the ${o.name}`);
      addLog(s, `${o.icon} ${p.name} takes the ${o.name}.`);
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'career': {
      if (o.keep) {
        setEvent(s, seat, 'milestone', p.career.icon, 'Staying put', `You stay ${an(p.career.name)} ${p.career.name}. Loyalty!`, 0, { card: { ...p.career } });
      } else {
        p.career = { name: o.name, icon: o.icon, salary: o.salary, flavor: o.flavor };
        setEvent(s, seat, 'milestone', o.icon, 'New job!', `You become ${an(o.name)} ${o.name}. ${o.flavor}`, 0, { card: { ...p.career } });
        addStory(s, p, o.icon, `Became ${an(o.name)} ${o.name} (${fmt(o.salary)})`);
        addLog(s, `${o.icon} ${p.name} becomes ${an(o.name)} ${o.name} (${fmt(o.salary)}).`);
      }
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'sell': {
      if (o.key === 'sell') sellHouse(s, p, seat);
      else setEvent(s, seat, 'milestone', '🔑', 'Keeping it', `You keep the ${HOUSES[p.house.i].name}.`, 0);
      return show(s, now, CHOICE_SHOW_MS);
    }
    case 'house': {
      if (o.skip) {
        setEvent(s, seat, 'milestone', '🚪', 'Not today', p.house ? `You stay in your ${HOUSES[p.house.i].name}.` : 'You keep renting. Your landlord sends a thank-you card.', 0);
        return show(s, now, CHOICE_SHOW_MS);
      }
      if (o.sell) { sellHouse(s, p, seat); return show(s, now, CHOICE_SHOW_MS); }
      const back = p.house ? houseValue(s, p.house) : 0;
      const price = houseValue(s, { i: o.i });
      const took = addCash(p, back - price);
      p.house = { i: o.i, paid: price };
      setEvent(s, seat, 'milestone', o.icon, 'Home sweet home!', `${back ? `You sell your old place for ${fmt(back)} and ` : 'You '}get the keys to the ${o.name}. ${o.flavor}${loanNote(took)}`, back - price, { card: { name: o.name, icon: o.icon, price } });
      addStory(s, p, o.icon, `Bought the ${o.name} for ${fmt(price)}`);
      addLog(s, `${o.icon} ${p.name} buys the ${o.name} (${fmt(price)}).`);
      return show(s, now, CHOICE_SHOW_MS);
    }
    default:
      throw new Error('bad choice');
  }
}
function sellHouse(s, p, seat) {
  const h = HOUSES[p.house.i];
  const v = houseValue(s, p.house);
  const gain = v - p.house.paid;
  addCash(p, v);
  setEvent(s, seat, 'milestone', '🪧', 'Sold!', `You sell the ${h.name} for ${fmt(v)} (${gain >= 0 ? 'profit' : 'loss'} ${signed(gain)} on what you paid).`, v);
  addStory(s, p, '🪧', `Sold the ${h.name} (${signed(gain)})`);
  addLog(s, `🪧 ${p.name} sells the ${h.name} for ${fmt(v)}.`);
  p.house = null;
}

/** play an action card from the hand (on your turn, before spinning) */
function play(s, seat, a, now) {
  const p = s.players[seat];
  if (!s.opts.actions) throw new Error('action cards are off');
  if (s.phase !== 'turn' || s.played) throw new Error('not now');
  const idx = a.card;
  const key = p.hand[idx];
  if (!key) throw new Error('no such card');
  const A = ACTIONS[key];
  if (key === 'shield') throw new Error('Lawyer Up is played automatically');
  const t = A.attack ? s.players[a.target] : null;
  if (A.attack && (!t || a.target === seat)) throw new Error('pick another player');
  p.hand = p.hand.filter((_, k) => k !== idx);
  s.played = true;
  s.resume = 'turn';
  if (A.attack) {
    const si = t.hand.indexOf('shield');
    if (si >= 0) {
      t.hand = t.hand.filter((_, k) => k !== si);
      setEvent(s, seat, 'block', '🛡️', 'Blocked!', `${p.name} plays ${A.icon} ${A.name} on ${t.name}… but ${t.name}’s lawyer shuts it down!`, 0, { target: a.target, card: key });
      addLog(s, `🛡️ ${t.name} blocks ${p.name}’s ${A.name}.`);
      return show(s, now);
    }
    p.st.plays++;
    let amt = 0; let text = '';
    if (key === 'lawsuit') { amt = sc(s, 40); addCash(t, -amt); addCash(p, amt); text = `${p.name} sues ${t.name} over a dented mailbox and wins ${fmt(amt)}!`; }
    if (key === 'headhunt') { t.poachedBy = seat; text = `${p.name} hires a headhunter: ${t.name}’s next paycheck goes to ${p.name}!`; }
    if (key === 'timeshare') { amt = sc(s, 30); addCash(t, -amt); text = `${p.name} sends a pushy salesman: ${t.name} buys a timeshare at Lake Mosquito for ${fmt(amt)}.`; addStory(s, t, '🏝️', 'Got talked into a timeshare'); amt = 0; }
    if (key === 'audit') { const pct = Math.round(20 * CHAOS[s.opts.chaos]); const tax = Math.round((Math.max(0, t.cash) * pct) / 100 / K) * K; addCash(t, -tax); text = `${p.name} tips off the tax office: ${t.name} pays ${fmt(tax)} in back taxes.`; }
    setEvent(s, seat, 'action', A.icon, A.name, text, amt, { target: a.target, card: key });
    addLog(s, `${A.icon} ${p.name} plays ${A.name} on ${t.name}.`);
    return show(s, now);
  }
  if (key === 'windfall') { const amt = sc(s, 25); addCash(p, amt); setEvent(s, seat, 'action', A.icon, A.name, `${p.name} finds a winning lottery ticket in an old jacket!`, amt, { card: key }); }
  if (key === 'boost') { p.boost = 3; setEvent(s, seat, 'action', A.icon, A.name, `${p.name} takes the fast lane: +3 spaces on the next spin!`, 0, { card: key }); }
  addLog(s, `${A.icon} ${p.name} plays ${A.name}.`);
  return show(s, now, CHOICE_SHOW_MS);
}

// ---------- finale ----------
export function lifeTitles(s) {
  const players = s.players;
  const n = players.length;
  const worth = players.map((_, i) => finalWorth(s, i));
  const byWorth = players.map((_, i) => i).sort((a, b) => worth[b] - worth[a]);
  const place = (i) => byWorth.indexOf(i);
  const rules = [
    ['💰', 'The Tycoon', (p, i) => place(i) === 0],
    ['👨‍👩‍👧‍👦', 'The Family Legend', (p) => p.kids >= 3],
    ['🔥', 'The Comeback Kid', (p, i) => p.low < 0 && place(i) < Math.ceil(n / 2)],
    ['✈️', 'The Globetrotter', (p) => p.st.trips >= 3],
    ['🎢', 'The Adventurer', (p) => p.st.gWins >= 2 || p.route.fork === 1],
    ['🦈', 'The Card Shark', (p) => p.st.plays >= 3],
    ['🏰', 'The Property Mogul', (p) => p.house && houseValue(s, p.house) >= 150 * K],
    ['🧰', 'The Hustler', (p) => p.st.hustles >= 2],
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

function endTurn(s, now, rand) {
  s.pending = null;
  s.played = false;
  if (s.players.every((p) => p.retired)) {
    const worth = s.players.map((_, i) => finalWorth(s, i));
    s.phase = 'finale';
    s.finale = {
      order: s.players.map((_, i) => i).sort((a, b) => worth[a] - worth[b] || b - a),
      titles: lifeTitles(s),
      goals: s.players.map((_, i) => (s.opts.goals ? goalStatus(s, i) : null)),
      worth,
      revealed: 0,
    };
    s.autoAt = now + FINALE_FIRST_MS;
    addLog(s, 'Everyone has retired — time for the life stories!');
    return;
  }
  const wrap = wrapsRound(s);
  let n = s.current;
  do n = (n + 1) % s.players.length; while (s.players[n].retired);
  if (wrap) moveMarket(s, rand);
  s.current = n;
  s.phase = 'turn';
}
function moveMarket(s, rand) {
  if (!(rand && rand.length >= MARKET_TYPES.length)) throw new Error('missing market draw');
  const m = CHAOS[s.opts.chaos];
  s.round++;
  MARKET_TYPES.forEach((t, k) => {
    const r = rand[k];
    if (!(Number.isInteger(r) && r >= 0 && r < MARKET_STEPS.length)) throw new Error('bad market draw');
    const d = Math.round(MARKET_STEPS[r] * m);
    const v = Math.max(MARKET_MIN, Math.min(MARKET_MAX, s.market[t.key].v + d));
    s.market[t.key] = { v, d: v - s.market[t.key].v };
  });
}

function setup(s, rand) {
  const seed = rand?.[0];
  if (!(Number.isInteger(seed) && seed >= 0)) throw new Error('bad seed');
  const r = rng(seed);
  const len = s.opts.length;
  s.layout = { length: len, fork: r() < 0.5 ? 'A' : 'B', coast: len === 'epic' || (len === 'normal' && r() < 0.5), seed: Math.floor(r() * 2 ** 31), actions: s.opts.actions };
  s.market = Object.fromEntries(MARKET_TYPES.map((t) => [t.key, { v: 85 + 5 * Math.floor(r() * 7), d: 0 }]));
  s.decks = Object.fromEntries(Object.keys(POOLS).map((k) => [k, POOLS[k].map((_, i) => i)]));
  s.adeck = [...ACTION_DECK];
  s.phase = 'deal';
  const b = boardOf(s);
  addLog(s, `This life: ${b.zones.map((z) => z.icon + ' ' + z.name).join(' → ')}.`);
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
 * Player actions (current player): {type:'spin'}, {type:'choose', i}, {type:'play', card, target}
 * System actions (tick): setup, deal, arrive, next, reveal, end
 */
export function applyAction(state, a, rand, now = 0) {
  const s = structuredClone(state);
  const p = s.players[s.current];
  switch (a.type) {
    case 'setup': {
      if (s.phase !== 'setup') throw new Error('not now');
      setup(s, rand);
      return s;
    }
    case 'deal': {
      if (s.phase !== 'deal') throw new Error('not now');
      const jobs = pickDistinct(BASIC_CAREERS.length, 3, rand, 0).map((i) => ({ ...BASIC_CAREERS[i] }));
      const dreams = pickDistinct(DEGREE_CAREERS.length, 3, rand, 3).map((i) => ({ ...DEGREE_CAREERS[i] }));
      const gk = goalKeys(s);
      const goals = s.opts.goals ? pickDistinct(gk.length, 2, rand, 6).map((i) => gk[i]) : [];
      s.dealNo++;
      p.goalOffer = goals;
      s.pending = { kind: 'start', step: 'path', jobs, dreams, goals };
      s.phase = 'pick';
      return s;
    }
    case 'spin': {
      if (s.phase !== 'turn') throw new Error('not now');
      const r = rand?.[0];
      if (!(Number.isInteger(r) && r >= 0 && r < 10)) throw new Error('bad spin');
      const value = r + 1;
      const steps = value + (p.boost || 0);
      p.boost = 0;
      const b = boardOf(s);
      const path = walk(b, p, steps);
      if (!path.length) throw new Error('cannot move');
      s.moveNo++;
      s.move = { no: s.moveNo, seat: s.current, value, steps, from: p.pos, path };
      p.pos = path[path.length - 1];
      s.phase = 'move';
      s.resume = null;
      s.autoAt = now + SPIN_MS + HOP_MS * path.length + 300;
      return s;
    }
    case 'play': {
      play(s, s.current, a, now);
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
      else if (s.phase === 'choose') choose(s, a.i, rand, now);
      else throw new Error('nothing to choose');
      return s;
    }
    case 'next': {
      if (s.phase !== 'show') throw new Error('nothing to finish');
      if (s.resume === 'turn') { s.resume = null; s.phase = 'turn'; return s; }
      if (!s.players.every((pl) => pl.picked)) {
        s.current = nextPicker(s);
        s.phase = 'deal';
        s.pending = null;
        return s;
      }
      if (!s.started) {
        s.started = true;
        s.current = s.first;
        s.phase = 'turn';
        addLog(s, 'Everyone has a path — let’s go!');
        return s;
      }
      endTurn(s, now, rand);
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
      const worth = s.finale.worth;
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
  if (s.phase === 'setup') return { type: 'setup' };
  if (s.phase === 'deal') return { type: 'deal' };
  if (now < s.autoAt) return null;
  if (s.phase === 'move') return { type: 'arrive' };
  if (s.phase === 'show') return { type: 'next' };
  if (s.phase === 'finale') return s.finale.revealed < s.players.length ? { type: 'reveal' } : { type: 'end' };
  return null;
}

// ---------- computer player ----------
function paydaysAhead(s, p) {
  const b = boardOf(s);
  let at = p.pos; let n = 0;
  for (let k = 0; k < 120; k++) {
    const route = { ...p.route };
    if (route.fork == null) route.fork = 0;
    at = nextSpace(b, { ...p, route }, at);
    if (at == null) break;
    if (b.spaces[at].t === 'payday') n++;
  }
  return n;
}
const GOAL_WEIGHT = { tycoon: 2, family: 1.5, homeowner: 1.5, globe: 2, scholar: 0, risk: 1, hustler: 2.5, thrifty: 1, shark: 2, star: 0, early: 1.2 };
export function botGoalScore(p, g) {
  let w = GOAL_WEIGHT[g] ?? 1;
  if (g === 'scholar') w = p.college ? 3 : -5;
  if (g === 'star') w = p.career && p.career.salary >= 70 * K ? 2.5 : p.college ? 1 : 0.2;
  if (g === 'thrifty') w = p.college ? 0.3 : 1.5;
  return w;
}
function optionValue(s, p, eff) {
  const left = paydaysAhead(s, p);
  let v = 0;
  if (eff.cash) v += eff.cash < 0 ? eff.cash * K : sc(s, eff.cash);
  if (eff.gamble) v += (eff.gamble.p / 100) * sc(s, eff.gamble.win) + (p.goal === 'risk' ? 18 * K : 0);
  if (eff.raise) v += eff.raise * K * left + (p.goal === 'scholar' ? 20 * K : 0) + (p.goal === 'star' ? 10 * K : 0);
  if (eff.hustle) v += eff.hustle * K * left + (p.goal === 'hustler' ? 25 * K : 0);
  if (eff.insure) v += 6 * K;
  if (eff.trip) v += (p.goal === 'globe' ? 22 * K : 1 * K);
  if (eff.pet) v += PET_BONUS + (p.goal === 'family' ? 18 * K : 0);
  if (eff.action) v += 8 * K;
  // loans cost 2k each, and break a Penny-Wise goal
  const short = Math.max(0, -(eff.cash || 0) * K - p.cash);
  if (short > 0) v -= Math.ceil(short / LOAN) * 2 * K + (p.goal === 'thrifty' ? 60 * K : 0);
  return v;
}
export function botChoice(s, seat) {
  const p = s.players[seat];
  const pd = s.pending;
  if (pd.kind === 'start') {
    if (pd.step === 'goal') return botGoalScore(p, pd.goals[1]) > botGoalScore(p, pd.goals[0]) ? 1 : 0;
    const bestJob = Math.max(...pd.jobs.map((o) => o.salary));
    const bestDream = Math.max(...pd.dreams.map((o) => o.salary));
    const list = pd.step === 'path' ? pd.jobs : pd.dreams;
    const wantsSchool = pd.goals.includes('scholar') || pd.goals.includes('star');
    if (pd.step === 'path' && bestDream - bestJob >= (wantsSchool ? 14 : 22) * K) return 3;
    return list.findIndex((o) => o.salary === (pd.step === 'path' ? bestJob : bestDream));
  }
  if (pd.kind === 'wedding') return p.goal === 'globe' ? 1 : 0;
  if (pd.kind === 'fork') {
    const keys = pd.options.map((o) => o.key);
    if (keys.includes('wild')) {
      const behind = netWorth(s, p) < Math.max(...s.players.map((q) => netWorth(s, q))) - 60 * K;
      return p.goal === 'risk' || behind ? 1 : 0;
    }
    return p.goal === 'globe' ? 0 : 1;
  }
  if (pd.kind === 'career') {
    let bi = 0;
    pd.options.forEach((o, i) => { if (o.salary > pd.options[bi].salary) bi = i; });
    return bi;
  }
  if (pd.kind === 'decision') {
    let bi = 0; let bv = -Infinity;
    pd.options.forEach((o, i) => { const v = optionValue(s, p, o.eff); if (v > bv) { bv = v; bi = i; } });
    return bi;
  }
  if (pd.kind === 'sell') {
    const idx = s.market[HOUSES[p.house.i].type].v;
    return idx >= 150 && p.goal !== 'homeowner' ? 1 : 0;
  }
  if (pd.kind === 'house') {
    const back = p.house ? houseValue(s, p.house) : 0;
    let bi = pd.options.findIndex((o) => o.skip);
    let best = p.house ? (p.goal === 'homeowner' && back >= 150 * K ? 1e9 : 0) : -1;
    const late = boardOf(s).spaces[p.pos].zone === 'golden';
    pd.options.forEach((o, i) => {
      if (o.skip || o.sell) return;
      const loans = Math.ceil(Math.max(0, o.price - back - p.cash) / LOAN);
      if (loans > (p.goal === 'thrifty' ? 0 : 3)) return;
      const idx = s.market[o.type].v;
      let score = (late ? 0 : 140 - idx) / 10 + o.price / (40 * K) - loans;
      if (p.goal === 'homeowner' && o.price >= 150 * K) score += 20;
      if (score > best) { best = score; bi = i; }
    });
    return bi;
  }
  return 0;
}
/** the bot's action-card play for this turn, or null */
export function botPlay(s, seat) {
  const p = s.players[seat];
  if (!s.opts.actions || s.played || !p.hand.length) return null;
  for (let k = 0; k < p.hand.length; k++) {
    const key = p.hand[k];
    if (key === 'windfall' || key === 'boost') return { type: 'play', card: k };
    if (ACTIONS[key].attack) {
      let target = -1; let best = -Infinity;
      s.players.forEach((q, i) => {
        if (i === seat) return;
        const v = key === 'headhunt' ? (q.retired || q.student ? -1 : q.career?.salary || 0) : key === 'audit' ? q.cash : netWorth(s, q);
        if (v > best) { best = v; target = i; }
      });
      if (target >= 0 && best > 0) return { type: 'play', card: k, target };
    }
  }
  return null;
}
