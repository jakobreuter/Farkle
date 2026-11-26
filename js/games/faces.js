import * as S from '../engines/faces.js';
import { h, esc, banner, turnPill } from '../ui.js';

const SKIN = ['#f6d2b5', '#e7b48f', '#bf8358', '#8a5a3b'];
const HAIR = { black: '#23201f', brown: '#6b4226', blond: '#e8c15a', red: '#c4512b', gray: '#a9a9ad', none: '#6b4226' };
const EYES = { blue: '#3b82c4', green: '#3f9a52', brown: '#5b3a24' };
const BG = ['#ffe0e0', '#e0f0ff', '#e6f7e1', '#fff2cc', '#efe3ff', '#ffe6f2'];
const HATS = ['#c92a2a', '#1864ab', '#2b8a3e', '#5f3dc4', '#e8590c'];

/** Original cartoon portrait drawn from a character's traits. */
export function faceSVG(c, i) {
  const has = (f) => c.flags.includes(f);
  const skin = SKIN[c.skin];
  const hair = HAIR[c.hair];
  const parts = [];
  parts.push(`<rect width="100" height="100" rx="12" fill="${BG[i % BG.length]}"/>`);
  if (c.style === 'long') parts.push(`<path d="M22 46 Q22 18 50 16 Q78 18 78 46 L82 92 L18 92 Z" fill="${hair}"/>`);
  parts.push(`<ellipse cx="23" cy="56" rx="5" ry="7" fill="${skin}"/><ellipse cx="77" cy="56" rx="5" ry="7" fill="${skin}"/>`);
  parts.push(`<rect x="42" y="74" width="16" height="14" fill="${skin}"/><path d="M24 100 Q26 84 50 84 Q74 84 76 100 Z" fill="${BG[(i + 3) % BG.length]}" stroke="#0002"/>`);
  parts.push(`<ellipse cx="50" cy="52" rx="26" ry="29" fill="${skin}"/>`);
  if (has('b')) parts.push(`<path d="M25 56 Q27 86 50 87 Q73 86 75 56 Q70 74 50 75 Q30 74 25 56 Z" fill="${hair}"/>`);
  if (c.style === 'short') parts.push(`<path d="M24 46 Q24 21 50 20 Q76 21 76 46 Q70 32 50 31 Q30 32 24 46 Z" fill="${hair}"/>`);
  if (c.style === 'long') parts.push(`<path d="M24 48 Q26 22 50 21 Q74 22 76 48 Q66 30 50 30 Q34 30 24 48 Z" fill="${hair}"/>`);
  if (c.style === 'curly') {
    for (let k = 0; k < 9; k++) {
      const ang = Math.PI * (1.05 + (k / 8) * 0.9);
      parts.push(`<circle cx="${(50 + Math.cos(ang) * 27).toFixed(1)}" cy="${(46 + Math.sin(ang) * 25).toFixed(1)}" r="8" fill="${hair}"/>`);
    }
  }
  if (c.style === 'bun') parts.push(`<circle cx="50" cy="16" r="9" fill="${hair}"/><path d="M25 44 Q26 22 50 22 Q74 22 75 44 Q68 30 50 30 Q32 30 25 44 Z" fill="${hair}"/>`);
  if (c.hair === 'none') parts.push('<path d="M36 30 Q42 26 48 28" stroke="#fff8" stroke-width="3" fill="none" stroke-linecap="round"/>');
  if (has('h')) {
    const hc = HATS[i % HATS.length];
    parts.push(`<rect x="22" y="27" width="56" height="7" rx="3" fill="${hc}"/><path d="M30 28 Q31 10 50 10 Q69 10 70 28 Z" fill="${hc}"/><rect x="30" y="23" width="40" height="4" fill="#0003"/>`);
  }
  // brows, eyes, nose
  parts.push(`<path d="M34 41 L45 40 M55 40 L66 41" stroke="${c.hair === 'none' ? '#6b4226' : hair}" stroke-width="2.5" stroke-linecap="round"/>`);
  for (const x of [40, 60]) parts.push(`<circle cx="${x}" cy="50" r="5" fill="#fff"/><circle cx="${x}" cy="50.5" r="3" fill="${EYES[c.eyes]}"/><circle cx="${x + 1}" cy="49.5" r="1" fill="#fff"/>`);
  if (has('g')) parts.push('<g fill="none" stroke="#222" stroke-width="2"><circle cx="40" cy="50" r="8"/><circle cx="60" cy="50" r="8"/><path d="M48 50 L52 50 M32 49 L25 47 M68 49 L75 47"/></g>');
  parts.push('<path d="M50 54 L48 62 L52 62" stroke="#0005" stroke-width="1.6" fill="none" stroke-linecap="round"/>');
  if (has('f')) for (const [x, y] of [[36, 60], [39, 63], [33, 63], [64, 60], [61, 63], [67, 63]]) parts.push(`<circle cx="${x}" cy="${y}" r="1" fill="#a0522d"/>`);
  if (has('m')) parts.push(`<path d="M40 66 Q45 62 50 65 Q55 62 60 66 Q55 69 50 67 Q45 69 40 66 Z" fill="${hair}"/>`);
  parts.push(has('s')
    ? '<path d="M41 69 Q50 78 59 69 Z" fill="#fff" stroke="#7a2e2e" stroke-width="1.6" stroke-linejoin="round"/>'
    : '<path d="M43 71 Q50 74 57 71" stroke="#7a2e2e" stroke-width="2" fill="none" stroke-linecap="round"/>');
  if (has('e')) parts.push('<circle cx="22" cy="64" r="2.6" fill="#f2c200"/><circle cx="78" cy="64" r="2.6" fill="#f2c200"/>');
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${parts.join('')}</svg>`;
}

const rulesHTML = () => `
  <ol>
    <li>You each get a secret character. Find out theirs before they find yours.</li>
    <li>On your turn, <b>ask one question</b> — the answer is given automatically and truthfully — or <b>make a guess</b>.</li>
    <li>Tap faces on your board to flip them down. <b>Flip non-matching</b> does it for you after an answer.</li>
    <li>Guess right and you win. Guess wrong and you lose — so be sure!</li>
  </ol>`;

export default {
  id: 'faces',
  name: 'Secret Face',
  emoji: '🕵️',
  blurb: 'Ask yes/no questions, find their face.',
  minPlayers: 2,
  maxPlayers: 2,
  options: [],

  setup(players, _opts, { first }) { return S.newGame(players, first % 2); },
  randomFor(s, a) { return a.type === 'deal' && s.phase === 'deal' ? [S.N, S.N] : null; },
  apply(s, a, seat, { rand }) {
    if ((a.type === 'deal') !== (seat === -1)) throw new Error('not allowed');
    return S.applyAction(s, a, seat, rand);
  },
  tick(s) { return s.phase === 'deal' ? { type: 'deal' } : null; },
  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: (s.winners || []).includes(i) ? 1 : 0, win: (s.winners || []).includes(i) })),
    };
  },
  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game faces">
      <section class="table facetable">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points ups"></div></div>
        <div class="facebar">
          <div class="mine-face"></div>
          <div class="ask">
            <select class="qsel"><option value="">Ask a question…</option>${S.QUESTIONS.map((q) => `<option value="${q.id}">${esc(q.text)}</option>`).join('')}</select>
            <div class="askrow">
              <button class="btn primary" data-a="ask">Ask</button>
              <button class="btn" data-a="guessmode">Make a guess</button>
            </div>
          </div>
        </div>
        <div class="answer"></div>
        <div class="board"></div>
        <div class="boardtools"><button class="btn small" data-a="auto">Flip non-matching</button><span class="hint"></span></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <section class="card qlog-card"><h3>Questions so far</h3><ol class="qlog"></ol></section>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);
    let state = null;
    let guessMode = false;
    let picked = null;
    let lastEventKey = '';

    const mySeat = () => api.mySeat();
    const myTurn = () => state && state.phase === 'play' && state.current === mySeat();

    q('.board').innerHTML = S.CHARACTERS.map((c, i) => `<button class="fcard" data-i="${i}">${faceSVG(c, i)}<span>${esc(c.name)}</span></button>`).join('');

    q('.board').addEventListener('click', (e) => {
      const b = e.target.closest('.fcard');
      if (!b || !state || state.phase !== 'play' || mySeat() < 0) return;
      const i = Number(b.dataset.i);
      if (guessMode) {
        picked = picked === i ? null : i;
        return render();
      }
      // optimistic flip
      try { state = S.applyAction(state, { type: 'flip', index: i }, mySeat()); render(); } catch { return; }
      api.act({ type: 'flip', index: i });
    });

    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a || !state) return;
      if (a === 'ask' && myTurn() && q('.qsel').value) { api.act({ type: 'ask', q: q('.qsel').value }); q('.qsel').value = ''; }
      if (a === 'guessmode' && myTurn()) { guessMode = !guessMode; picked = null; render(); }
      if (a === 'confirm' && myTurn() && picked != null) { api.act({ type: 'guess', index: picked }); guessMode = false; picked = null; }
      if (a === 'auto' && state.players[mySeat()]?.lastQ) {
        try { state = S.applyAction(state, { type: 'autoflip' }, mySeat()); render(); } catch { return; }
        api.act({ type: 'autoflip' });
      }
    });

    function render() {
      if (!state) return;
      const seat = mySeat();
      const me = state.players[seat];
      const opp = state.players[1 - Math.max(0, seat)];
      const cur = state.players[state.current];
      q('.turn-label').textContent = state.phase === 'deal' ? 'Dealing…' : state.phase === 'over' ? 'Game over'
        : myTurn() ? (guessMode ? 'Tap a face to guess' : 'Your turn') : `${cur.name}’s turn`;
      q('.ups').textContent = me ? `You ${S.facesUp(me)} · ${opp.name} ${S.facesUp(opp)} left` : '';

      if (me && me.secret != null) {
        const c = S.CHARACTERS[me.secret];
        q('.mine-face').innerHTML = `<div class="mf">${faceSVG(c, me.secret)}</div><div><div class="muted small">Your secret face</div><b>${esc(c.name)}</b></div>`;
      }
      const sel = q('.qsel');
      sel.disabled = !myTurn() || guessMode;
      const [askBtn, guessBtn] = el.querySelectorAll('.askrow .btn');
      askBtn.disabled = !myTurn() || guessMode;
      guessBtn.disabled = !myTurn();
      guessBtn.textContent = guessMode ? 'Cancel guess' : 'Make a guess';

      // latest answer, big and clear
      const last = state.asks[state.asks.length - 1];
      const ans = q('.answer');
      if (guessMode) {
        ans.innerHTML = picked != null
          ? `<span>Guess <b>${esc(S.CHARACTERS[picked].name)}</b>? Wrong guess loses!</span><button class="btn primary small" data-a="confirm">Guess ${esc(S.CHARACTERS[picked].name)}</button>`
          : '<span>Tap the face you think it is.</span>';
      } else if (last) {
        const who = last.seat === seat ? 'You' : state.players[last.seat].name;
        ans.innerHTML = `<span>${esc(who)} asked: ${esc(S.Q[last.q].text)}</span><b class="${last.yes ? 'yes' : 'no'}">${last.yes ? 'YES' : 'NO'}</b>`;
      } else {
        ans.innerHTML = '<span>Ask a question to start narrowing it down.</span>';
      }

      const faces = el.querySelectorAll('.board .fcard');
      faces.forEach((b, i) => {
        b.classList.toggle('down', !!me?.down[i]);
        b.classList.toggle('picked', guessMode && picked === i);
        b.classList.toggle('reveal', state.phase === 'over' && opp.secret === i);
      });
      const autoBtn = q('[data-a=auto]');
      autoBtn.disabled = !me?.lastQ || state.phase !== 'play';
      q('.boardtools .hint').textContent = me?.lastQ ? `Your last answer: ${S.Q[me.lastQ.q].text} ${me.lastQ.yes ? 'Yes' : 'No'}` : 'Tap faces to flip them down.';
      q('.qlog').innerHTML = state.asks.slice().reverse().map((x) => `<li><b>${esc(x.seat === seat ? 'You' : state.players[x.seat].name)}:</b> ${esc(S.Q[x.q].text)} <span class="${x.yes ? 'yes' : 'no'}">${x.yes ? 'Yes' : 'No'}</span></li>`).join('') || '<li class="muted">No questions yet.</li>';
    }

    return {
      update(next) {
        const old = state;
        state = next;
        if (!myTurn()) { guessMode = false; picked = null; }
        render();
        const ev = next.event;
        const key = ev ? `${next.asks.length}:${ev.kind}` : '';
        if (old && ev && key !== lastEventKey) {
          lastEventKey = key;
          if (ev.kind === 'ask') banner(q('.banner'), ev.yes ? 'YES' : 'NO', ev.yes ? 'bank' : 'farkle', 1200);
          if (ev.kind === 'guess') banner(q('.banner'), ev.right ? 'CORRECT!' : 'WRONG!', ev.right ? 'hot' : 'farkle', 1800);
        }
        if (old && old.current !== next.current && next.phase === 'play') {
          turnPill(q('.turn-banner'), next.current === mySeat() ? 'Your turn' : `${next.players[next.current].name}’s turn`, 1300);
        }
      },
      refresh: render,
      destroy() { el.remove(); },
    };
  },
};
