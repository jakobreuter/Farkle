// Spy Words: a team word-association game. Pure rules, no DOM, no randomness
// (every random choice is passed in by the caller as uniform ints).
//
// 25 words lie on the table. A secret key says which belong to Red, which to Blue,
// which are neutral and which one is the trap. Each team has a Spymaster who sees the
// key and gives one-word clues plus a number; their teammates guess by tapping words.
// Guessing goes on while it's right, up to number + 1 words. A neutral or enemy word
// ends the turn, the trap loses the game on the spot. First team to uncover all its
// words wins.
//
// With 2–3 players (or when the host picks it) everyone plays together as one team
// against a turn limit, and after each of their turns the app uncovers one rival word.

export const RIVAL_MS = 1500; // pause before the app flips a rival word (co-op)
export const END_MS = 2800; // whole key shown before the game-over popup

export const TEAM_NAMES = ['Red', 'Blue'];
export const TEAM_KEY = ['r', 'b'];
export const INF = -1; // clue number "∞"

// Everyday, family-friendly, guessable nouns (one word each).
const RAW = `
apple anchor angel ant arm arrow atlas attic axe baby badge bag bakery ball balloon bamboo banana band bank bark barn
barrel baseball basket bat bath battery beach beak beam bean bear beard bed bee beetle bell belt bench berry bicycle
bird blanket block board boat bone book boot bottle bow bowl box bread brick bridge broom brush bubble bucket bug
bulb bus bush butter butterfly button cabin cable cactus cake camel camera camp candle candy cannon canoe cap captain
car card carpet carrot castle cat cave chain chair chalk cheese chef cherry chess chest chicken chimney chip circle
circus city clay cliff clock cloud clown coach coast coat coconut coffee coin comb comet compass cookie copper coral
corn cotton couch court cow crab crane crayon cream crown crystal cup curtain cushion dance desert desk diamond dice
dinosaur doctor dog doll dolphin door dot dragon drawer dream dress drill drum duck dust eagle ear earth egg elbow
elephant engine eraser eye fairy fan farm feather fence field file finger fire fish flag flame flash flower flute
fog foot forest fork fossil fountain fox frame frog frost fruit garden gate gem ghost giant gift giraffe glass globe
glove glue goal goat gold golf goose grape grass guitar hammer hand harbor harp hat hawk heart helmet hero hill hive
hole honey hook horn horse hose hotel house ice igloo ink iron island jacket jam jar jeans jelly jet jewel judge
juice jungle kangaroo kettle key king kitchen kite kitten knee knife knight knot koala ladder lake lamp lantern laser
leaf lemon letter library light lighthouse lime line lion lizard lock log magnet mail map marble market mask match
maze meadow medal melon mermaid metal meteor milk mill mirror mitten model mole money monkey monster moon moose
motor mountain mouse mouth mud mug museum music nail necklace needle nest net night ninja noodle nose note nurse nut
oak oar ocean octopus office oil onion orange orbit organ otter oven owl paint palace pan panda paper parade park
parrot party pasta paw peach peanut pear pearl pebble pen pencil penguin pepper piano picnic pie pig pillow pilot pin
pine pipe pirate pizza planet plant plate pocket poem pole police pond pony pool popcorn port post pot potato powder
prince princess puddle pumpkin puppet puppy puzzle pyramid queen quilt rabbit race radio raft rain rainbow ranch
rocket rock roof root rope rose ruler sail salad salt sand satellite saw scale scarf school scissors scout screen
seal seed shadow shark sheep shell ship shirt shoe shop shovel signal silver singer skate ski skirt sky sled slide
slipper snail snake snow soap sock sofa soldier soup space spider spine sponge spoon spring square squirrel stable
stage stair stamp star statue steam stick stone storm stove straw stream string submarine sugar suit sun swan
sweater swing sword table tail tank tape taxi tea teacher teeth telescope tent theater thread thumb ticket tiger tire
toast toe tomato tooth torch tower town toy track tractor train treasure tree triangle trophy truck trumpet
tunnel turkey turtle umbrella unicorn valley van vase violin volcano wagon wall wallet wand watch water wave web
whale wheat wheel whistle wind window wing winter wire witch wizard wolf wood wool worm yacht yard yarn yogurt zebra
zipper zoo
`;
export const WORDS = RAW.split(/\s+/).filter(Boolean).filter((w, i, a) => a.indexOf(w) === i);

const N_CARDS = 25;

export function newGame(players, first = 0, { mode = 'auto', teams = 'alt', limit = 9 } = {}) {
  const n = players.length;
  const coop = mode === 'coop' || n < 4;
  return {
    mode: coop ? 'coop' : 'teams',
    teamsOpt: ['alt', 'halves', 'shuffle'].includes(teams) ? teams : 'alt',
    limit: coop ? limit : 0,
    first,
    players: players.map((p) => ({ pid: p.pid, name: p.name, team: 0 })),
    spy: [null, null], // seat of each team's Spymaster
    words: [],
    key: [], // 'r' | 'b' | 'n' | 'x' per card
    rev: [], // null | { by: seat (-1 = the app) } per card
    phase: 'deal', // deal | clue | guess | rival | end | over
    team: 0, // whose turn
    starter: 0,
    clue: null, // { word, num, team, by }
    guesses: 0, // made this turn
    maxGuesses: 0,
    turn: 0, // completed turns
    clues: [], // [{ team, word, num, picks: [card] }]
    rivalAt: 0,
    endUntil: 0,
    winner: null, // team index (teams mode) or 0 = the team won / null (co-op)
    reason: '', // all | trap | time
    lastPick: null, // { i, by } most recent reveal
    log: [],
  };
}

const addLog = (s, msg) => { s.log = [...s.log, msg].slice(-40); };
export const isCoop = (s) => s.mode === 'coop';
export const teamOf = (s, seat) => (seat >= 0 && seat < s.players.length ? s.players[seat].team : null);
export const isSpy = (s, seat) => seat >= 0 && (s.spy[0] === seat || s.spy[1] === seat);
export const members = (s, team) => s.players.map((p, i) => (p.team === team ? i : -1)).filter((i) => i >= 0);
export const guessers = (s, team) => members(s, team).filter((i) => s.spy[team] !== i);
export const canGuess = (s, seat) => s.phase === 'guess' && teamOf(s, seat) === s.team && s.spy[s.team] !== seat;
export const total = (s, k) => s.key.filter((x) => x === k).length;
export const left = (s, k) => s.key.filter((x, i) => x === k && !s.rev[i]).length;
export const teamLeft = (s, team) => left(s, TEAM_KEY[team]);
/** how many guesses a clue number allows (0 and ∞ = no limit) */
export const allowed = (num) => (num >= 1 ? num + 1 : N_CARDS);
export const numText = (num) => (num === INF ? '∞' : String(num));

/** random ints the deal needs */
export function dealRanges(s) {
  const r = [];
  for (let k = 0; k < N_CARDS; k++) r.push(WORDS.length - k); // pick 25 distinct words
  for (let i = N_CARDS - 1; i >= 1; i--) r.push(i + 1); // shuffle the key
  if (!isCoop(s)) {
    r.push(2); // which team starts (and gets 9 words)
    if (s.teamsOpt === 'shuffle') for (let i = s.players.length - 1; i >= 1; i--) r.push(i + 1);
  }
  return r;
}

const norm = (w) => String(w || '').trim().toLowerCase();
const stem = (w) => w.replace(/(es|s)$/, '');

/** why a clue isn't allowed, or '' if it's fine */
export function clueProblem(s, word) {
  const w = norm(word);
  if (!w) return 'Type a clue first.';
  if (/\s/.test(w)) return 'Just one word, please.';
  if (w.length > 24) return 'That clue is too long.';
  if (!/^\p{L}[\p{L}'-]*$/u.test(w)) return 'Letters only, please.';
  for (let i = 0; i < s.words.length; i++) {
    if (s.rev[i]) continue;
    const b = s.words[i];
    if (w === b || stem(w) === stem(b) || (b.length >= 4 && w.includes(b))) return `Too close to “${b.toUpperCase()}” on the table.`;
  }
  return '';
}

function finish(s, winner, reason, now) {
  s.phase = 'end';
  s.winner = winner;
  s.reason = reason;
  s.clue = null;
  s.endUntil = now + END_MS;
}

function endTurn(s, now) {
  s.turn++;
  s.clue = null;
  s.guesses = 0;
  s.maxGuesses = 0;
  if (isCoop(s)) {
    if (s.turn >= s.limit) {
      addLog(s, 'Out of turns!');
      finish(s, null, 'time', now);
      return;
    }
    if (left(s, 'b') > 0) {
      s.phase = 'rival';
      s.rivalAt = now + RIVAL_MS;
      return;
    }
    s.phase = 'clue';
    return;
  }
  s.team = 1 - s.team;
  s.phase = 'clue';
}

export function applyAction(s0, a, seat, { now = 0, rand = null } = {}) {
  if (!a || typeof a !== 'object') throw new Error('bad action');
  const s = structuredClone(s0);
  const n = s.players.length;
  switch (a.type) {
    case 'deal': {
      if (seat !== -1 || s.phase !== 'deal') throw new Error('not now');
      const need = dealRanges(s);
      if (!Array.isArray(rand) || rand.length !== need.length) throw new Error('no randomness');
      rand.forEach((v, k) => { if (!Number.isInteger(v) || v < 0 || v >= need[k]) throw new Error('bad randomness'); });
      let p = 0;
      const idx = WORDS.map((_, i) => i);
      for (let k = 0; k < N_CARDS; k++) {
        const j = k + rand[p++];
        [idx[k], idx[j]] = [idx[j], idx[k]];
      }
      s.words = idx.slice(0, N_CARDS).map((i) => WORDS[i]);
      const coop = isCoop(s);
      const keyIdx = [];
      for (let i = N_CARDS - 1; i >= 1; i--) keyIdx.push(rand[p++]);
      s.starter = coop ? 0 : rand[p++];
      const other = TEAM_KEY[1 - s.starter];
      const key = [...Array(9).fill(TEAM_KEY[s.starter]), ...Array(8).fill(other), ...Array(7).fill('n'), 'x'];
      let q = 0;
      for (let i = N_CARDS - 1; i >= 1; i--) {
        const j = keyIdx[q++];
        [key[i], key[j]] = [key[j], key[i]];
      }
      s.key = key;
      s.rev = Array(N_CARDS).fill(null);
      if (coop) {
        s.players.forEach((pl) => { pl.team = 0; });
        s.spy = [s.first % n, null];
      } else {
        let order = s.players.map((_, i) => i); // join order
        if (s.teamsOpt === 'shuffle') {
          for (let i = n - 1; i >= 1; i--) {
            const j = rand[p++];
            [order[i], order[j]] = [order[j], order[i]];
          }
        }
        let red; let blue;
        if (s.teamsOpt === 'halves') {
          const h = Math.ceil(n / 2);
          red = order.slice(0, h);
          blue = order.slice(h);
        } else {
          red = order.filter((_, k) => k % 2 === 0);
          blue = order.filter((_, k) => k % 2 === 1);
        }
        if (s.teamsOpt !== 'shuffle') { red.sort((x, y) => x - y); blue.sort((x, y) => x - y); }
        // seats alternate Red, Blue, Red, Blue… (so seat 0 is Red and seat 1 is Blue)
        const seats = [];
        for (let k = 0; k < Math.max(red.length, blue.length); k++) {
          if (k < red.length) seats.push({ ...s.players[red[k]], team: 0 });
          if (k < blue.length) seats.push({ ...s.players[blue[k]], team: 1 });
        }
        s.players = seats;
        // the Spymaster rotates through each team from game to game
        s.spy = [0, 1].map((t) => { const m = members(s, t); return m[s.first % m.length]; });
      }
      s.team = s.starter;
      s.phase = 'clue';
      s.turn = 0;
      addLog(s, coop
        ? `Co-op game: ${s.players[s.spy[0]].name} is the Spymaster. Find 9 words in ${s.limit} turns!`
        : `${s.players[s.spy[0]].name} leads Red, ${s.players[s.spy[1]].name} leads Blue. ${TEAM_NAMES[s.starter]} starts.`);
      return s;
    }

    case 'clue': {
      if (s.phase !== 'clue') throw new Error('not time for a clue');
      if (seat < 0 || s.spy[s.team] !== seat) throw new Error('only the Spymaster gives clues');
      const num = a.num;
      if (!Number.isInteger(num) || num < INF || num > 9) throw new Error('bad number');
      const why = clueProblem(s, a.word);
      if (why) throw new Error(why);
      const word = norm(a.word);
      s.clue = { word, num, team: s.team, by: seat };
      s.guesses = 0;
      s.maxGuesses = allowed(num);
      s.phase = 'guess';
      s.clues = [...s.clues, { team: s.team, word, num, picks: [] }].slice(-40);
      addLog(s, `${s.players[seat].name}: “${word.toUpperCase()}” ${numText(num)}`);
      return s;
    }

    case 'guess': {
      if (!canGuess(s, seat)) throw new Error('you can’t guess now');
      const i = a.i;
      if (!Number.isInteger(i) || i < 0 || i >= N_CARDS) throw new Error('bad card');
      if (s.rev[i]) throw new Error('already revealed');
      s.rev[i] = { by: seat };
      s.lastPick = { i, by: seat };
      s.guesses++;
      s.clues[s.clues.length - 1].picks.push(i);
      const k = s.key[i];
      const team = s.team;
      const nm = s.players[seat].name;
      const w = s.words[i].toUpperCase();
      if (k === 'x') {
        addLog(s, `${nm} found the trap (${w})!`);
        finish(s, isCoop(s) ? null : 1 - team, 'trap', now);
        return s;
      }
      if (k === TEAM_KEY[team]) {
        addLog(s, `${nm}: ${w} ✓`);
        if (teamLeft(s, team) === 0) { finish(s, team, 'all', now); return s; }
        if (s.guesses >= s.maxGuesses) endTurn(s, now);
        return s;
      }
      if (k === 'n') addLog(s, `${nm}: ${w} — neutral.`);
      else addLog(s, `${nm}: ${w} — ${isCoop(s) ? 'a rival word' : `a ${TEAM_NAMES[1 - team]} word`}!`);
      if (!isCoop(s) && k !== 'n' && teamLeft(s, 1 - team) === 0) { finish(s, 1 - team, 'all', now); return s; }
      endTurn(s, now);
      return s;
    }

    case 'end': {
      if (!canGuess(s, seat)) throw new Error('you can’t do that now');
      if (s.guesses < 1) throw new Error('make at least one guess first');
      addLog(s, `${s.players[seat].name} ended the guessing.`);
      endTurn(s, now);
      return s;
    }

    case 'rival': {
      if (seat !== -1 || s.phase !== 'rival') throw new Error('not now');
      const open = s.key.map((k, i) => (k === 'b' && !s.rev[i] ? i : -1)).filter((i) => i >= 0);
      if (open.length) {
        const r = rand?.[0];
        if (!Number.isInteger(r) || r < 0 || r >= open.length) throw new Error('no randomness');
        const i = open[r];
        s.rev[i] = { by: -1 };
        s.lastPick = { i, by: -1 };
        addLog(s, `The rival team uncovered ${s.words[i].toUpperCase()}.`);
      }
      s.phase = 'clue';
      return s;
    }

    case 'takeover': {
      // a teammate takes over as Spymaster (e.g. theirs left the game)
      const t = teamOf(s, seat);
      if (!['clue', 'guess', 'rival'].includes(s.phase) || t == null || s.spy[t] === seat) throw new Error('not now');
      s.spy[t] = seat;
      addLog(s, `${s.players[seat].name} is now the ${isCoop(s) ? '' : `${TEAM_NAMES[t]} `}Spymaster.`);
      return s;
    }

    case 'finish': {
      if (seat !== -1 || s.phase !== 'end') throw new Error('not now');
      s.phase = 'over';
      return s;
    }

    default:
      throw new Error('unknown action');
  }
}
