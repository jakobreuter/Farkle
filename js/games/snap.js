import * as S from '../engines/snap.js';
import { h, scoreboard } from '../ui.js';

const rulesHTML = () => `
  <ol>
    <li>There are ${S.DECK_SIZE} round cards with ${S.PER_CARD} pictures each. <b>Any two cards share exactly one picture.</b></li>
    <li>Everyone gets one face-up card. The rest form the center pile, and its top card is turned up.</li>
    <li>Find the picture that’s on <b>your card and the center card</b> and tap it (on either card). First one wins the center card: it becomes your new card, +1.</li>
    <li>Tap the wrong picture and you’re frozen for ${S.LOCK_MS / 1000} seconds.</li>
    <li>When the pile runs out, whoever won the most cards wins.</li>
  </ol>`;

const symHTML = (it, center) => {
  const [e, name] = S.SYMBOLS[it.sym];
  return `<button class="snap-sym${center ? ' mid' : ''}" data-sym="${it.sym}" aria-label="${name}"
    style="left:${(it.x * 100).toFixed(2)}%;top:${(it.y * 100).toFixed(2)}%;--sz:${it.size.toFixed(2)};--rot:${it.rot}deg"><span>${e}</span></button>`;
};

export default {
  id: 'snap',
  name: 'Symbol Snap',
  emoji: '👀',
  blurb: 'Spot the shared picture first!',
  minPlayers: 2,
  maxPlayers: 8,
  options: [
    { key: 'pile', label: 'Pile size', default: 25, choices: [[15, '15 cards'], [25, '25 cards'], ['all', 'Whole deck']] },
  ],

  setup(players, opts) {
    return S.newGame(players, opts.pile ?? 25);
  },

  randomFor(s, a, seat) {
    return a.type === 'deal' && seat === -1 && s.phase === 'deal' ? S.dealRanges() : null;
  },

  apply(s, a, seat, ctx) {
    if (a.type === 'claim') {
      if (seat < 0) throw new Error('players only');
      return S.applyAction(s, a, seat, ctx);
    }
    if (a.type === 'deal' || a.type === 'next') {
      if (seat !== -1) throw new Error('system only');
      return S.applyAction(s, a, seat, ctx);
    }
    throw new Error('unknown action');
  },

  tick(s, { now }) {
    if (s.phase === 'deal') return { type: 'deal' };
    if (s.phase === 'reveal' && now >= s.autoAt) return { type: 'next' };
    return null;
  },

  realtime: true, // bots wait a few seconds per card, so "no bot moved this step" is normal
  botDelay: 250,
  bot(s, seat, { now } = {}) {
    if (s.phase !== 'play' || !s.players[seat]) return null;
    const t = now ?? Date.now();
    if (t < s.roundAt + S.botThinkMs(s.round, seat)) return null;
    if (t < (s.lockUntil[seat] || 0)) return null;
    return { type: 'claim', round: s.round, symbol: S.common(s.players[seat].card, s.center) };
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.score, win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game snap">
      <section class="scoreboard"></section>
      <section class="table snap-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points">Pile: <strong>0</strong></div></div>
        <div class="snap-slot snap-center-slot"><span class="snap-tag">Center</span><div class="snap-disc snap-center"></div></div>
        <div class="snap-callout"><span></span></div>
        <div class="snap-slot snap-mine-slot"><span class="snap-tag">Yours</span><div class="snap-disc snap-mine"></div>
          <div class="snap-lock"><b>Wrong!</b><span>2s</span></div>
          <div class="snap-watch">You’re watching</div></div>
        <div class="hint"></div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);
    let state = null;
    let localLock = 0; // local-clock lock so a wrong tap freezes instantly
    let sentRound = -1;
    let sentAt = 0;
    let timer = null;
    const drawn = { center: -1, mine: -1 };

    const mySeat = () => api.mySeat();
    const me = () => (state && mySeat() >= 0 ? state.players[mySeat()] : null);
    const hostLocked = () => state && mySeat() >= 0 && api.hostNow() < (state.lockUntil[mySeat()] || 0);
    const lockLeft = () => Math.max(localLock - Date.now(), state && mySeat() >= 0 ? (state.lockUntil[mySeat()] || 0) - api.hostNow() : 0);

    function drawCard(which, id) {
      const disc = q(which === 'center' ? '.snap-center' : '.snap-mine');
      if (drawn[which] === id) return;
      drawn[which] = id;
      if (id == null) { disc.innerHTML = ''; disc.classList.add('empty'); return; }
      disc.classList.remove('empty');
      disc.innerHTML = S.layout(id).map((it, k) => symHTML(it, k === 0)).join('');
      disc.classList.remove('snap-in');
      void disc.offsetWidth;
      disc.classList.add('snap-in');
    }

    function tap(e) {
      const b = e.target.closest('.snap-sym');
      if (!b || !state || state.phase !== 'play') return;
      const p = me();
      if (!p || (sentRound === state.round && Date.now() - sentAt < 1200)) return;
      e.preventDefault();
      if (lockLeft() > 0) return;
      const sym = Number(b.dataset.sym);
      const match = S.common(p.card, state.center);
      if (sym !== match) {
        localLock = Date.now() + S.LOCK_MS;
        b.classList.remove('snap-miss'); void b.offsetWidth; b.classList.add('snap-miss');
      } else {
        sentRound = state.round; // don't spam the host with the same right claim
        sentAt = Date.now();
        el.querySelectorAll(`.snap-sym[data-sym="${sym}"]`).forEach((x) => x.classList.add('snap-pending'));
      }
      api.act({ type: 'claim', round: state.round, symbol: sym });
      render();
    }
    q('.snap-table').addEventListener('pointerdown', tap);

    function render() {
      if (!state) return;
      const s = state;
      const seat = mySeat();
      const p = me();
      const reveal = s.phase === 'reveal' && s.last;
      const over = s.phase === 'over';

      scoreboard(q('.scoreboard'), s.players.map((x, i) => ({
        name: x.name,
        score: x.score,
        active: reveal ? s.last.seat === i : over && (s.winners || []).includes(i),
        me: i === seat,
        away: !api.isAlive(x.pid),
        sub: x.score === 1 ? '1 card' : `${x.score} cards`,
      })));

      q('.turn-label').textContent = s.phase === 'deal' ? 'Shuffling…' : over ? 'Pile empty!' : `Card ${s.round}`;
      q('.turn-points strong').textContent = String(s.pile.length);

      // center: during the reveal it's the card just won (the winner already holds it)
      drawCard('center', s.center);
      const myShown = p ? (reveal && s.last.seat === seat ? s.last.old : p.card) : null;
      drawCard('mine', myShown);
      q('.snap-mine-slot').classList.toggle('spectate', !p);

      el.querySelectorAll('.snap-sym').forEach((b) => {
        const sym = Number(b.dataset.sym);
        const hit = !!reveal && sym === s.last.symbol && (b.closest('.snap-center') || s.last.seat === seat);
        b.classList.toggle('snap-hit', hit);
        if (s.phase !== 'play') b.classList.remove('snap-pending');
      });
      q('.snap-table').classList.toggle('revealing', !!reveal);

      // callout line (fixed height)
      const call = q('.snap-callout');
      let text = '';
      let kind = '';
      if (reveal) {
        const w = s.last.seat === seat ? 'You' : s.players[s.last.seat].name;
        text = `${w} got it! ${S.SYMBOLS[s.last.symbol][0]}`;
        kind = s.last.seat === seat ? 'win' : 'got';
      } else if (over) {
        const ws = (s.winners || []).map((i) => (i === seat ? 'You' : s.players[i].name));
        text = ws.length > 1 ? `Tie: ${ws.join(' & ')}` : `${ws[0]} ${ws[0] === 'You' ? 'win' : 'wins'}! 🏆`;
        kind = 'win';
      } else if (s.phase === 'play') {
        text = p ? 'Find the match!' : 'Find the match…';
      }
      const key = `${kind}|${text}`;
      if (call.dataset.key !== key) {
        call.dataset.key = key;
        call.className = `snap-callout ${kind}`;
        call.firstElementChild.textContent = text;
        if (kind) { void call.offsetWidth; call.classList.add('pop'); }
      }

      // lockout
      const left = s.phase === 'play' && p ? lockLeft() : 0;
      const lock = q('.snap-lock');
      lock.classList.toggle('on', left > 0);
      if (left > 0) lock.lastElementChild.textContent = `${Math.ceil(left / 1000)}s`;

      let hint = '';
      if (!p) hint = 'Tap nothing — just enjoy the race.';
      else if (s.phase === 'deal') hint = 'Dealing the cards…';
      else if (over) hint = `You won ${p.score} card${p.score === 1 ? '' : 's'}.`;
      else if (left > 0) hint = 'Frozen for a moment — keep looking!';
      else if (s.phase === 'play') hint = 'Tap the picture that’s on both cards.';
      else hint = 'Next card coming…';
      q('.hint').textContent = hint;

      clearTimeout(timer);
      if (left > 0) timer = setTimeout(render, Math.min(250, left + 20));
    }

    return {
      update(s, prev) {
        state = s;
        if (!prev || prev.round !== s.round) { sentRound = -1; localLock = 0; }
        // a wrong tap the host rejected locally-but-not-remotely shouldn't freeze longer than the host says
        if (!hostLocked() && localLock && Date.now() > localLock) localLock = 0;
        render();
      },
      refresh() { render(); },
      destroy() { clearTimeout(timer); el.remove(); },
    };
  },
};
