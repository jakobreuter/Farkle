// Draw: take turns sketching a word while everyone else guesses.
// The drawer picks one of three words; guessers score more the faster they get it,
// and the drawer scores for every correct guess.

import { WORDS } from '../words.js';

export const CHOOSE_MS = 20000;
export const REVEAL_MS = 5000;
export const DRAWER_PTS = 20;

export const normalize = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

export function newGame(players, { rounds = 2, drawTime = 80 } = {}, first = 0) {
  return {
    players: players.map((p) => ({ ...p, score: 0 })),
    rounds,
    drawTime,
    first,
    turnIdx: 0,
    turnNo: 0,
    drawer: first,
    phase: 'start', // start | choose | draw | reveal | over
    choices: [],
    word: null,
    used: [],
    deadline: 0,
    drawStart: 0,
    guessed: {},
    chat: [],
    winners: null,
    log: ['New game of Draw.'],
  };
}

function pool(s) {
  const used = new Set(s.used);
  return WORDS.map((_, i) => i).filter((i) => !used.has(i));
}

/** Random ranges needed to start a turn: pick 3 different words from the unused pool. */
export function chooseRanges(s) {
  const n = pool(s).length;
  return [n, n - 1, n - 2];
}

function addChat(s, entry) { s.chat = [...s.chat, entry].slice(-40); }
function addLog(s, msg) { s.log = [...s.log, msg].slice(-40); }

export function guessersLeft(s) {
  return s.players.map((_, i) => i).filter((i) => i !== s.drawer && s.guessed[i] == null);
}

export function applyAction(state, a, seat, now, rand) {
  const s = structuredClone(state);
  const n = s.players.length;
  switch (a.type) {
    case 'newTurn': {
      if (s.phase !== 'start') throw new Error('not now');
      const p = pool(s);
      const picks = [];
      for (const r of rand) picks.push(p.splice(r, 1)[0]);
      s.choices = picks;
      s.turnNo++;
      s.drawer = (s.first + s.turnIdx) % n;
      s.phase = 'choose';
      s.word = null;
      s.guessed = {};
      s.deadline = now + CHOOSE_MS;
      return s;
    }
    case 'choose': {
      if (s.phase !== 'choose') throw new Error('not now');
      if (seat !== s.drawer && seat !== -1) throw new Error('not the drawer');
      const i = Number(a.index) || 0;
      const wi = s.choices[Math.max(0, Math.min(2, i))];
      s.word = WORDS[wi];
      s.used.push(wi);
      s.phase = 'draw';
      s.drawStart = now;
      s.deadline = now + s.drawTime * 1000;
      addChat(s, { sys: `${s.players[s.drawer].name} is drawing!` });
      return s;
    }
    case 'guess': {
      if (s.phase !== 'draw' || seat === s.drawer || seat < 0 || s.guessed[seat] != null) throw new Error('cannot guess');
      const text = String(a.text || '').slice(0, 60).trim();
      if (!text) throw new Error('empty');
      if (normalize(text) === normalize(s.word)) {
        const frac = Math.max(0, (s.deadline - now) / (s.drawTime * 1000));
        const pts = Math.max(10, Math.round((50 + 50 * frac) / 5) * 5);
        s.guessed[seat] = pts;
        s.players[seat].score += pts;
        s.players[s.drawer].score += DRAWER_PTS;
        addChat(s, { seat, ok: true, pts });
        if (!guessersLeft(s).length) {
          s.phase = 'reveal';
          s.deadline = now + REVEAL_MS;
        }
      } else {
        addChat(s, { seat, text });
      }
      return s;
    }
    case 'reveal': {
      if (s.phase !== 'draw') throw new Error('not now');
      s.phase = 'reveal';
      s.deadline = now + REVEAL_MS;
      return s;
    }
    case 'next': {
      if (s.phase !== 'reveal') throw new Error('not now');
      const got = Object.keys(s.guessed).length;
      addLog(s, `“${s.word}” — ${got ? `${got} got it` : 'nobody got it'} (drawn by ${s.players[s.drawer].name}).`);
      s.turnIdx++;
      s.choices = [];
      if (s.turnIdx >= n * s.rounds) {
        const top = Math.max(...s.players.map((p) => p.score));
        s.winners = s.players.map((p, i) => (p.score === top ? i : -1)).filter((i) => i >= 0);
        s.phase = 'over';
        addLog(s, s.winners.length > 1 ? 'Game over — it’s a tie!' : `Game over — ${s.players[s.winners[0]].name} wins!`);
      } else {
        s.phase = 'start';
      }
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

/** System actions driven by the clock (run on the host). */
export function tick(s, now) {
  if (s.phase === 'start') return { type: 'newTurn' };
  if (s.phase === 'choose' && now >= s.deadline) return { type: 'choose', index: 0 };
  if (s.phase === 'draw' && now >= s.deadline) return { type: 'reveal' };
  if (s.phase === 'reveal' && now >= s.deadline) return { type: 'next' };
  return null;
}

/** "_ _ _ _" hint for guessers; reveals a couple of letters as time runs down. */
export function hint(word, frac) {
  const letters = [...word];
  const idx = letters.map((c, i) => (/[a-z]/i.test(c) ? i : -1)).filter((i) => i >= 0);
  const show = new Set();
  if (frac > 0.5 && idx.length > 3) show.add(idx[0]);
  if (frac > 0.75 && idx.length > 5) show.add(idx[Math.floor(idx.length / 2)]);
  return letters.map((c, i) => (/[a-z]/i.test(c) ? (show.has(i) ? c : '_') : c === ' ' ? ' ' : c)).join(' ');
}
