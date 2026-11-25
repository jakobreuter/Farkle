import * as D from '../engines/draw.js';
import { WORDS } from '../words.js';
import { h, esc, scoreboard, turnPill } from '../ui.js';

const COLORS = ['#1f1f1f', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#9c36b5', '#8d5a2b', '#ffffff'];
const SIZES = [3, 7, 16];

const rulesHTML = () => `
  <ol>
    <li>Players take turns drawing. The drawer picks one of three words.</li>
    <li>Everyone else types guesses. Faster correct guesses score more (up to 100).</li>
    <li>The drawer gets ${D.DRAWER_PTS} for each player who guesses it.</li>
    <li>A couple of letters are revealed as time runs out.</li>
  </ol>`;

export default {
  id: 'draw',
  name: 'Draw',
  emoji: '🎨',
  blurb: 'Sketch it, guess it.',
  minPlayers: 2,
  maxPlayers: 10,
  options: [
    { key: 'rounds', label: 'Rounds', default: 2, choices: [[1, '1'], [2, '2'], [3, '3']] },
    { key: 'drawTime', label: 'Draw time', default: 80, choices: [[60, '60 s'], [80, '80 s'], [120, '120 s']] },
  ],

  setup(players, opts, { first }) {
    return D.newGame(players, { rounds: Number(opts.rounds) || 2, drawTime: Number(opts.drawTime) || 80 }, first % players.length);
  },

  randomFor(s, a) {
    return a.type === 'newTurn' && s.phase === 'start' ? D.chooseRanges(s) : null;
  },

  apply(s, a, seat, { now, rand }) {
    const system = ['newTurn', 'reveal', 'next'].includes(a.type) || (a.type === 'choose' && seat === -1);
    if (system && seat !== -1) throw new Error('system only');
    return D.applyAction(s, a, seat, now, rand);
  },

  tick(s, { now }) { return D.tick(s, now); },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.score, win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game draw">
      <section class="scoreboard"></section>
      <section class="table drawtable">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points timer"></div></div>
        <div class="wordline"></div>
        <div class="timebar"><span></span></div>
        <div class="canvas-wrap">
          <canvas></canvas>
          <div class="canvas-overlay hidden"></div>
        </div>
        <div class="slot">
          <div class="tools hidden">
            <div class="colors">${COLORS.map((c, i) => `<button class="sw${i === 0 ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="color"></button>`).join('')}</div>
            <div class="sizes">${SIZES.map((w, i) => `<button class="sz${i === 1 ? ' on' : ''}" data-w="${w}" aria-label="size"><i style="width:${Math.min(w + 4, 20)}px;height:${Math.min(w + 4, 20)}px"></i></button>`).join('')}
              <button class="btn small icon" data-tool="undo" aria-label="Undo">↶</button>
              <button class="btn small icon" data-tool="clear" aria-label="Clear">🗑</button></div>
          </div>
          <form class="guess hidden" autocomplete="off">
            <input maxlength="60" placeholder="Type your guess…" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" />
            <button class="btn primary">Guess</button>
          </form>
          <div class="slot-msg hidden"></div>
        </div>
        <ol class="chat"></ol>
        <div class="turn-banner"></div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const canvas = q('canvas');
    const ctx = canvas.getContext('2d');
    const overlay = q('.canvas-overlay');

    let state = null;
    let color = COLORS[0];
    let size = SIZES[1];
    // strokes for the current turn: [{id, c, w, p:[[x,y]...]}]
    let strokes = [];
    let strokeTurn = 0;
    let cur = null; // stroke being drawn by me
    let pending = []; // points not yet sent
    let flushTimer = null;
    let secTimer = null;

    const mySeat = () => api.mySeat();
    const amDrawer = () => state && state.drawer === mySeat() && state.phase === 'draw';

    // ---- canvas ----
    function fit() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      redraw();
    }
    function line(s, from, to) {
      const W = canvas.width;
      const H = canvas.height;
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w * (W / 600);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from[0] * W, from[1] * H);
      ctx.lineTo(to[0] * W, to[1] * H);
      ctx.stroke();
    }
    function drawStroke(s, startAt = 0) {
      const p = s.p;
      if (p.length === 1 && startAt === 0) return line(s, p[0], [p[0][0] + 0.0001, p[0][1]]);
      for (let i = Math.max(1, startAt); i < p.length; i++) line(s, p[i - 1], p[i]);
    }
    function redraw() {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const s of strokes) drawStroke(s);
    }
    const resizeObs = new ResizeObserver(fit);
    resizeObs.observe(canvas);

    function resetStrokes(turn) {
      strokes = [];
      strokeTurn = turn;
      redraw();
    }

    function addPoints(id, c, w, pts) {
      let s = strokes.find((x) => x.id === id);
      if (!s) { s = { id, c, w, p: [] }; strokes.push(s); }
      const start = s.p.length;
      s.p.push(...pts);
      drawStroke(s, start);
    }

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]
        .map((v) => Math.round(v * 1000) / 1000);
    };
    function flush() {
      if (!pending.length || !cur) return;
      api.gameEvent({ k: 's', turn: state.turnNo, id: cur.id, c: cur.c, w: cur.w, p: pending }, false);
      pending = [];
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (!amDrawer()) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      cur = { id: `${api.me}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, c: color, w: color === '#ffffff' ? Math.max(size, 16) : size };
      const p = pos(e);
      addPoints(cur.id, cur.c, cur.w, [p]);
      pending = [p];
      clearInterval(flushTimer);
      flushTimer = setInterval(flush, 60);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!cur) return;
      e.preventDefault();
      const p = pos(e);
      addPoints(cur.id, cur.c, cur.w, [p]);
      pending.push(p);
    });
    const end = () => {
      if (!cur) return;
      flush();
      clearInterval(flushTimer);
      cur = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    q('.tools').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !amDrawer()) return;
      if (b.dataset.c) {
        color = b.dataset.c;
        el.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b));
      } else if (b.dataset.w) {
        size = Number(b.dataset.w);
        el.querySelectorAll('.sz').forEach((x) => x.classList.toggle('on', x === b));
      } else if (b.dataset.tool === 'clear') {
        resetStrokes(state.turnNo);
        api.gameEvent({ k: 'clear', turn: state.turnNo }, false);
      } else if (b.dataset.tool === 'undo') {
        const mine = strokes.filter((s) => s.id.startsWith(`${api.me}-`)).pop();
        if (!mine) return;
        strokes = strokes.filter((s) => s !== mine);
        redraw();
        api.gameEvent({ k: 'undo', turn: state.turnNo, id: mine.id }, false);
      }
    });

    q('.guess').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = q('.guess input');
      const text = input.value.trim();
      if (!text || !state || state.phase !== 'draw') return;
      api.act({ type: 'guess', text });
      input.value = '';
    });

    overlay.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b && state.phase === 'choose' && state.drawer === mySeat()) api.act({ type: 'choose', index: Number(b.dataset.i) });
    });

    // ---- rendering ----
    function remaining() {
      return Math.max(0, state.deadline - api.hostNow());
    }

    function render() {
      if (!state) return;
      const me = mySeat();
      const drawer = state.players[state.drawer];
      scoreboard(q('.scoreboard'), state.players.map((p, i) => ({
        name: p.name,
        score: p.score,
        active: i === state.drawer && state.phase !== 'over' && state.phase !== 'start',
        me: i === me,
        away: !api.isAlive(p.pid),
        sub: i === state.drawer && state.phase !== 'over' ? '✏️ drawing' : state.guessed[i] != null ? `✓ +${state.guessed[i]}` : '',
      })));

      const round = Math.min(state.rounds, Math.floor(state.turnIdx / state.players.length) + 1);
      const isMe = state.drawer === me;
      let label = '';
      let word = '';
      if (state.phase === 'over') label = 'Game over';
      else if (state.phase === 'choose') label = isMe ? 'Pick a word to draw' : `${drawer.name} is picking a word…`;
      else if (state.phase === 'draw') label = isMe ? 'Your turn to draw!' : `${drawer.name} is drawing`;
      else if (state.phase === 'reveal') label = 'Time’s up!';
      else label = 'Next turn…';
      if (state.phase === 'draw') {
        const frac = 1 - remaining() / (state.drawTime * 1000);
        word = isMe || state.guessed[me] != null ? state.word : D.hint(state.word, frac);
      } else if (state.phase === 'reveal') {
        word = `The word was: ${state.word}`;
      }
      q('.turn-label').textContent = label;
      q('.wordline').textContent = word;
      q('.wordline').classList.toggle('secret', state.phase === 'draw' && !isMe && state.guessed[me] == null);
      const secs = state.phase === 'draw' || state.phase === 'choose' ? Math.ceil(remaining() / 1000) : '';
      q('.timer').textContent = state.phase === 'over' ? '' : `Round ${round}/${state.rounds}${secs !== '' ? ` · ${secs}s` : ''}`;
      const total = state.phase === 'choose' ? D.CHOOSE_MS : state.drawTime * 1000;
      q('.timebar span').style.width = state.phase === 'draw' || state.phase === 'choose' ? `${(remaining() / total) * 100}%` : '0%';

      // overlay on the canvas
      if (state.phase === 'choose') {
        overlay.classList.remove('hidden');
        overlay.innerHTML = isMe
          ? `<div class="choose"><p>Choose a word</p>${state.choices.map((wi, i) => `<button class="btn primary" data-i="${i}">${esc(WORDS[wi])}</button>`).join('')}</div>`
          : `<div class="choose"><p>${esc(drawer.name)} is picking a word…</p></div>`;
      } else if (state.phase === 'reveal') {
        overlay.classList.remove('hidden');
        const got = state.players.map((p, i) => (state.guessed[i] != null ? `${esc(p.name)} +${state.guessed[i]}` : null)).filter(Boolean);
        overlay.innerHTML = `<div class="choose"><p>The word was</p><h3>${esc(state.word)}</h3><p class="small">${got.length ? got.join(' · ') : 'Nobody got it'}</p></div>`;
      } else if (state.phase === 'start') {
        overlay.classList.remove('hidden');
        overlay.innerHTML = '<div class="choose"><p>Next turn…</p></div>';
      } else {
        overlay.classList.add('hidden');
        overlay.innerHTML = '';
      }

      // bottom slot: tools for the drawer, guess box for everyone else
      const drawing = state.phase === 'draw';
      q('.tools').classList.toggle('hidden', !(drawing && isMe));
      const canGuess = drawing && !isMe && me >= 0 && state.guessed[me] == null;
      const guessForm = q('.guess');
      guessForm.classList.toggle('hidden', !canGuess);
      const msg = q('.slot-msg');
      let m = '';
      if (drawing && !isMe && state.guessed[me] != null) m = `You got it! +${state.guessed[me]}`;
      else if (!drawing && state.phase !== 'over') m = isMe && state.phase === 'choose' ? 'Pick a word above' : '';
      else if (me < 0) m = 'Watching this game';
      msg.textContent = m;
      msg.classList.toggle('hidden', !m || canGuess || (drawing && isMe));
      canvas.classList.toggle('can-draw', drawing && isMe);

      // chat
      const chat = q('.chat');
      const atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 8;
      chat.innerHTML = state.chat.map((c) => {
        if (c.sys) return `<li class="sys">${esc(c.sys)}</li>`;
        const nm = esc(state.players[c.seat]?.name || '?');
        return c.ok ? `<li class="ok"><b>${nm}</b> guessed it! +${c.pts}</li>` : `<li><b>${nm}:</b> ${esc(c.text)}</li>`;
      }).join('');
      if (atBottom) chat.scrollTop = chat.scrollHeight;
    }

    secTimer = setInterval(() => { if (state && (state.phase === 'draw' || state.phase === 'choose')) render(); }, 500);

    return {
      update(next) {
        const old = state;
        state = next;
        if (next.turnNo !== strokeTurn) resetStrokes(next.turnNo);
        render();
        if (old && old.drawer !== next.drawer && next.phase === 'choose') {
          turnPill(q('.turn-banner'), next.drawer === mySeat() ? 'Your turn to draw' : `${next.players[next.drawer].name} draws next`, 0);
        }
      },
      onEvent(m, from) {
        if (!state || m.turn !== state.turnNo || from !== state.players[state.drawer]?.pid) return;
        if (m.k === 's' && Array.isArray(m.p)) addPoints(m.id, m.c, m.w, m.p.slice(0, 500));
        else if (m.k === 'clear') resetStrokes(state.turnNo);
        else if (m.k === 'undo') { strokes = strokes.filter((s) => s.id !== m.id); redraw(); }
      },
      syncItems() { return state ? { turn: state.turnNo, strokes } : null; },
      onSync(items) {
        if (!state || !items || items.turn !== state.turnNo || !Array.isArray(items.strokes)) return;
        strokes = items.strokes;
        strokeTurn = items.turn;
        redraw();
      },
      refresh: render,
      destroy() { clearInterval(secTimer); clearInterval(flushTimer); resizeObs.disconnect(); el.remove(); },
    };
  },
};
