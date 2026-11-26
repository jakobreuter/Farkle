import * as S from '../engines/streak.js';
import { h, scoreboard, banner, turnPill } from '../ui.js';

const FLIP_MS = 650;

const rulesHTML = () => `
  <ol>
    <li>On your turn, <b>Flip</b> cards one at a time into your row.</li>
    <li>Flip a number you already have → <b>Bust</b>: the turn scores 0.</li>
    <li><b>★</b> is worth ${S.STAR_VALUE} and can never bust you.</li>
    <li>Get <b>${S.STREAK_SIZE} different numbers</b> → <b>Lucky streak</b>: +${S.STREAK_BONUS} and your turn is banked automatically.</li>
    <li><b>Stop</b> any time to bank your row. First to the target triggers a final round.</li>
    <li>The deck has four of each number 1–10 and four ★. The strip shows what’s left.</li>
  </ol>`;

const face = (c) => (c === S.STAR ? '★' : String(c));
const cls = (c) => (c === S.STAR ? 'star' : `n${c}`);

export default {
  id: 'streak',
  name: 'Lucky Streak',
  emoji: '🍀',
  blurb: 'Flip cards, dodge doubles.',
  minPlayers: 1,
  maxPlayers: 8,
  options: [
    { key: 'target', label: 'Play to', default: 200, choices: [[200, '200'], [300, '300'], [100, '100 (quick)']] },
  ],

  setup(players, opts, { first }) {
    return S.newGame(players, Number(opts.target) || 200, first % players.length);
  },

  randomFor(s, a, seat) {
    if (a.type !== 'flip' || seat !== s.current || s.phase !== 'turn') return null;
    const n = S.drawSize(s);
    return n ? [n] : null;
  },

  apply(s, a, seat, { now, rand }) {
    if (a.type === 'next') {
      if (seat !== -1) throw new Error('system only');
      return S.applyAction(s, a);
    }
    if (seat !== s.current) throw new Error('not your turn');
    if (a.type === 'flip') return S.applyAction(s, a, rand, now);
    if (a.type === 'stop') return S.applyAction(s, a);
    throw new Error('unknown action');
  },

  tick(s, { now }) {
    return (s.phase === 'bust' || s.phase === 'streak') && now >= s.autoAt ? { type: 'next' } : null;
  },

  botDelay: 1200,
  bot(s, seat) {
    if (s.current !== seat || s.phase !== 'turn') return null;
    if (!s.row.length) return { type: 'flip' };
    // chance the next card busts us, given what's left in the draw pile
    const pile = s.deck.length ? s.deck : s.discard;
    const inRow = new Set(s.row.filter((c) => c !== S.STAR));
    const risky = pile.filter((c) => inRow.has(c)).length / Math.max(1, pile.length);
    const total = S.rowTotal(s.row);
    const need = s.target - s.players[seat].score;
    if (total >= need) return { type: 'stop' };
    if (S.distinctNumbers(s.row) === S.STREAK_SIZE - 1 && risky < 0.6) return { type: 'flip' }; // go for the bonus
    if (risky > 0.38 || total >= 30) return { type: 'stop' };
    return { type: 'flip' };
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.score, win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game streak">
      <section class="scoreboard"></section>
      <section class="table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points">Row: <strong>0</strong></div></div>
        <div class="sel-line"></div>
        <div class="cardrow"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
        <div class="controls">
          <button class="btn primary big" data-a="flip">Flip</button>
          <button class="btn big" data-a="stop">Stop</button>
        </div>
        <div class="hint"></div>
        <div class="deckinfo"><span class="decksize"></span><div class="remaining"></div></div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    let state = null;
    let waiting = 0;
    let flipUntil = 0;
    let uiTimer = null;
    let lastBanner = '';

    const mySeat = () => api.mySeat();
    const myTurn = () => state && state.phase === 'turn' && state.current === mySeat();

    q('.controls').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a || !myTurn() || waiting || Date.now() < flipUntil) return;
      if (a === 'flip') {
        waiting = Date.now();
        render();
        api.act({ type: 'flip' });
        setTimeout(() => { if (waiting && Date.now() - waiting > 7900) { waiting = 0; render(); } }, 8000);
      } else if (a === 'stop' && state.row.length) {
        api.act({ type: 'stop' });
      }
    });

    function renderRow(animateLast) {
      const row = q('.cardrow');
      const cards = state.row;
      // keep existing cards, add new ones (so earlier cards don't re-animate)
      while (row.children.length > cards.length) row.lastChild.remove();
      cards.forEach((c, i) => {
        let card = row.children[i];
        if (!card || card.dataset.c !== String(c)) {
          const fresh = h(`<div class="pcard ${cls(c)}" data-c="${c}"><span>${face(c)}</span></div>`);
          if (card) row.replaceChild(fresh, card); else row.appendChild(fresh);
          card = fresh;
          if (animateLast && i === cards.length - 1) card.classList.add('flipin');
        }
        const dupe = state.phase === 'bust' && i === cards.length - 1;
        card.classList.toggle('dupe', dupe);
        card.classList.toggle('dupe-of', state.phase === 'bust' && i < cards.length - 1 && c === cards[cards.length - 1]);
      });
      row.classList.toggle('busted', state.phase === 'bust');
    }

    function render(animateLast = false) {
      if (!state) return;
      const me = mySeat();
      scoreboard(q('.scoreboard'), state.players.map((p, i) => ({
        name: p.name,
        score: p.score,
        active: i === state.current && state.phase !== 'over',
        me: i === me,
        away: !api.isAlive(p.pid),
        pct: (p.score / state.target) * 100,
      })));
      const cur = state.players[state.current];
      const mine = state.current === me;
      q('.turn-label').textContent = state.phase === 'over' ? 'Game over'
        : (mine ? 'Your turn' : `${cur.name}’s turn`) + (state.finalRound ? ' · final round' : '');
      q('.turn-points strong').textContent = state.phase === 'bust' ? '0' : S.rowTotal(state.row);
      const distinct = S.distinctNumbers(state.row);
      q('.sel-line').textContent = state.phase === 'turn' && state.row.length
        ? `${distinct}/${S.STREAK_SIZE} different numbers` : '';
      q('.sel-line').classList.remove('bad');
      renderRow(animateLast);

      const busy = !!waiting || Date.now() < flipUntil;
      const [flipBtn, stopBtn] = el.querySelectorAll('.controls .btn');
      flipBtn.disabled = !myTurn() || busy;
      stopBtn.disabled = !myTurn() || busy || !state.row.length;
      stopBtn.textContent = myTurn() && state.row.length ? `Stop +${S.rowTotal(state.row)}` : 'Stop';

      let hint = '';
      if (state.phase === 'turn') {
        if (!myTurn()) hint = api.isAlive(cur.pid) ? `Waiting for ${cur.name}…` : `Waiting for ${cur.name} to come back…`;
        else if (!state.row.length) hint = 'Flip your first card.';
        else hint = 'Flip again, or stop to bank your row.';
      }
      q('.hint').textContent = hint;

      // what's left in the draw pile
      const left = new Map();
      for (const c of state.deck) left.set(c, (left.get(c) || 0) + 1);
      q('.decksize').textContent = `${state.deck.length} cards left`;
      const inRow = new Set(state.phase === 'turn' ? state.row : []);
      q('.remaining').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, S.STAR].map((c) => `<span class="rem ${inRow.has(c) && c !== S.STAR ? 'risk' : ''}"><b>${face(c)}</b>${left.get(c) || 0}</span>`).join('');
    }

    return {
      update(next) {
        const old = state;
        state = next;
        const flipped = old && next.flipNo === old.flipNo + 1;
        if (old && next.flipNo !== old.flipNo) waiting = 0;
        if (flipped) flipUntil = Date.now() + FLIP_MS;
        render(flipped);
        if (flipped) { clearTimeout(uiTimer); uiTimer = setTimeout(() => render(), FLIP_MS + 30); }
        const key = `${next.flipNo}:${next.event}:${next.players.map((p) => p.score).join()}`;
        if (old && next.event && key !== lastBanner) {
          lastBanner = key;
          const t = { bust: 'BUST!', streak: 'LUCKY STREAK!', bank: 'BANKED!' }[next.event];
          if (t) setTimeout(() => banner(q('.banner'), t, next.event === 'bust' ? 'farkle' : next.event === 'streak' ? 'hot' : 'bank'), flipped ? FLIP_MS : 0);
        }
        if (!old) lastBanner = key;
        if (old && old.current !== next.current && next.phase !== 'over') {
          const nm = next.players[next.current].name;
          turnPill(q('.turn-banner'), next.current === mySeat() ? 'Your turn' : `${nm}’s turn`, old.phase === 'turn' ? 1150 : 150);
        }
      },
      refresh: () => render(),
      destroy() { clearTimeout(uiTimer); el.remove(); },
    };
  },
};
