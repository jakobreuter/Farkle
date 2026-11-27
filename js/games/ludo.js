import * as L from '../engines/ludo.js';
import { createDie, ROLL_MS } from '../dice.js';
import { h, scoreboard, banner, turnPill } from '../ui.js';

const HOP_MS = 170;
const HEX = { red: '#d8383a', green: '#2f9a4e', yellow: '#e9b51f', blue: '#2e6bd3' };
const ORD = ['', '1st', '2nd', '3rd', '4th'];

const rulesHTML = () => `
  <ol>
    <li>Each player has <b>4 tokens</b> in their base. Race them once around the board, up your coloured home column and into the centre.</li>
    <li>Tap the die to roll. Roll a <b>6</b> to bring a token out onto your start square.</li>
    <li>After rolling, the tokens that can move <b>glow</b> — tap one. If only one move is possible it’s made for you; if none, the turn passes.</li>
    <li>A <b>6</b> earns another roll — but <b>three 6s in a row</b> loses the turn.</li>
    <li>Land on an opponent to send it back to its base and earn a <b>bonus roll</b>. Tokens on a start square or a <b>★ star</b> are safe.</li>
    <li><b>Back step</b> (lobby option, on by default): on a roll of <b>1</b> you may move a token on the track <b>back one square</b> instead of forward — tap it, then pick ◀ or ▶. Not from your own start square, base or home column. A back step can capture too.</li>
    <li>You need the <b>exact</b> roll to reach home. First to bring all four home wins (or play on for every place).</li>
  </ol>`;

// cell-centre coordinates (in cell units) of base spots and home triangles
const BASE_SPOTS = [[2, 2], [2, 4], [4, 2], [4, 4]];
const HOME_SPOT = [[7.5, 6.55], [6.55, 7.5], [7.5, 8.45], [8.45, 7.5]];

export default {
  id: 'ludo',
  name: 'Ludo',
  emoji: '🏁',
  blurb: 'Roll, race and bump rivals home.',
  minPlayers: 2,
  maxPlayers: 4,
  options: [
    { key: 'until', label: 'Play until', default: 'first', choices: [['first', 'First player finishes'], ['all', 'All places decided']] },
    { key: 'back', label: 'Back step', default: 'one', choices: [['one', 'On a roll of 1'], ['off', 'Off']] },
  ],

  setup(players, opts, { first }) {
    return L.newGame(players, { until: opts?.until, backStep: opts?.back !== 'off', first: first % players.length });
  },

  randomFor(s, a, seat) {
    if (a.type !== 'roll' || seat !== s.current || s.phase !== 'roll') return null;
    return [6];
  },

  apply(s, a, seat, { now, rand }) {
    if (s.phase === 'over') throw new Error('game over');
    if (seat === -1) {
      if (a.type === 'pass' && s.phase === 'pass') return L.applyAction(s, a, null, now);
      if (a.type === 'move' && s.phase === 'move' && s.auto != null && Number(a.token) === s.auto) return L.applyAction(s, a, null, now);
      throw new Error('system action not allowed');
    }
    if (seat !== s.current) throw new Error('not your turn');
    if (a.type === 'roll') {
      if (!rand) throw new Error('no dice');
      return L.applyAction(s, a, [rand[0] + 1], now);
    }
    if (a.type === 'move') return L.applyAction(s, { type: 'move', token: a.token, back: !!a.back }, null, now);
    throw new Error('unknown action');
  },

  tick(s, { now }) {
    if (now < s.autoAt) return null;
    if (s.phase === 'pass') return { type: 'pass' };
    if (s.phase === 'move' && s.auto != null) return { type: 'move', token: s.auto };
    return null;
  },

  botDelay: 1300,
  bot(s, seat) {
    if (s.current !== seat) return null;
    if (s.phase === 'roll') return { type: 'roll' };
    if (s.phase === 'move' && s.auto == null) {
      const m = L.botMove(s);
      if (!m) return null;
      return m.back ? { type: 'move', token: m.token, back: true } : { type: 'move', token: m.token };
    }
    return null; // forced moves and passes happen on their own (tick)
  },

  results(s) {
    const n = s.players.length;
    const all = s.until === 'all';
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({
        name: all && p.place ? `${ORD[p.place]} · ${p.name}` : p.name,
        // first-to-finish: tokens home; all places: standing points (1st = players−1 … last = 0)
        score: all && p.place ? n - p.place : L.homeCount(p),
        win: (s.winners || []).includes(i),
      })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game ludo">
      <section class="scoreboard ludo-scores"></section>
      <section class="table ludo-table">
        <div class="turn-info"><div class="turn-label"><i class="ludo-dot"></i><span></span></div><div class="turn-points">Rolled <strong>–</strong></div></div>
        <div class="ludo-board"><div class="ludo-pieces"></div></div>
        <div class="sel-line"></div>
        <div class="ludo-dock">
          <div class="ludo-diebox"></div>
          <button class="btn primary big" data-a="roll">Roll</button>
          <div class="ludo-pick hidden"><button class="btn big ludo-pbtn" data-d="back">◀ Back 1</button><button class="btn primary big ludo-pbtn" data-d="fwd">Fwd 1 ▶</button></div>
        </div>
        <div class="hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const board = q('.ludo-board');
    const layer = q('.ludo-pieces');
    buildBoard(board, layer);

    const die = createDie(0, () => tryRoll());
    q('.ludo-diebox').appendChild(die.el);
    q('.ludo-dock [data-a="roll"]').addEventListener('click', () => tryRoll());

    let state = null;
    let rollingUntil = 0;
    let rollRequested = 0;
    let moveRequested = 0;
    let uiTimer = null;
    let anim = null; // { timers, over: Map(key -> progress) }
    let picking = null; // token waiting for ◀ / ▶
    const pieces = new Map(); // "seat:token" -> element

    const mySeat = () => api.mySeat();
    const myTurn = () => state && state.phase !== 'over' && state.current === mySeat();
    const rolling = () => Date.now() < rollingUntil;
    const busy = () => rolling() || !!anim;

    function tryRoll() {
      if (!myTurn() || state.phase !== 'roll' || busy() || rollRequested) return;
      rollRequested = Date.now();
      die.shake(true);
      render();
      api.act({ type: 'roll' });
      setTimeout(() => { if (rollRequested && Date.now() - rollRequested > 7900) { rollRequested = 0; die.shake(false); render(); } }, 8000);
    }

    layer.addEventListener('click', (e) => {
      const pc = e.target.closest('.ludo-pc.can');
      if (!pc || !myTurn() || state.phase !== 'move' || busy() || moveRequested) return;
      const t = Number(pc.dataset.t);
      if (!state.legal.includes(t) && !(state.backs || []).includes(t)) return;
      if ((state.backs || []).includes(t)) { picking = picking === t ? null : t; render(); return; }
      sendMove(t, false);
    });

    function sendMove(t, back) {
      picking = null;
      moveRequested = Date.now();
      api.act(back ? { type: 'move', token: t, back: true } : { type: 'move', token: t });
      render();
      setTimeout(() => { if (moveRequested && Date.now() - moveRequested > 7900) { moveRequested = 0; render(); } }, 8000);
    }

    q('.ludo-pick').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || picking == null || !myTurn() || state.phase !== 'move' || busy() || moveRequested) return;
      const back = b.dataset.d === 'back';
      if (!(back ? state.backs : state.legal).includes(picking)) return;
      sendMove(picking, back);
    });
    // tapping anywhere else closes the chooser
    el.addEventListener('click', (e) => {
      if (picking != null && !e.target.closest('.ludo-pick, .ludo-pc.can')) { picking = null; render(); }
    });

    function renderPick() {
      const pk = q('.ludo-pick');
      const ok = picking != null && myTurn() && state.phase === 'move' && !busy() && !moveRequested && (state.backs || []).includes(picking);
      q('.ludo-dock [data-a="roll"]').classList.toggle('hidden', ok);
      pk.classList.toggle('hidden', !ok);
      if (!ok) { picking = null; return; }
      layer.querySelectorAll('.ludo-pc.picked').forEach((e) => e.classList.remove('picked'));
      pieces.get(`${state.current}:${picking}`)?.classList.add('picked');
    }

    function pieceEl(seat, t, color) {
      const k = `${seat}:${t}`;
      let pc = pieces.get(k);
      if (!pc) {
        pc = h(`<div class="ludo-pc ludo-${color}" data-s="${seat}" data-t="${t}" role="button"><b class="ludo-n"></b></div>`);
        layer.appendChild(pc);
        pieces.set(k, pc);
      }
      return pc;
    }

    function shownProgress(seat, t) {
      const k = `${seat}:${t}`;
      if (anim && anim.over.has(k)) return anim.over.get(k);
      return state.players[seat].tokens[t];
    }

    function renderPieces() {
      const showGlow = myTurn() && state.phase === 'move' && !busy() && !moveRequested;
      const legal = new Set(state.phase === 'move' && !busy() ? [...state.legal, ...(state.backs || [])] : []);
      // group tokens that share a spot
      const groups = new Map();
      state.players.forEach((pl, seat) => {
        pl.tokens.forEach((_, t) => {
          const p = shownProgress(seat, t);
          let key;
          let xy;
          if (p < 0) { key = `b${seat}:${t}`; const [br, bc] = L.BASE_CORNER[pl.color]; const [sr, sc] = BASE_SPOTS[t]; xy = [br + sr, bc + sc]; }
          else if (p >= L.HOME) { key = `h${pl.color}`; xy = HOME_SPOT[pl.color]; }
          else { const [r, c] = L.cellOf(pl.color, p); key = `c${r},${c}`; xy = [r + 0.5, c + 0.5]; }
          if (!groups.has(key)) groups.set(key, { xy, items: [] });
          groups.get(key).items.push({ seat, t, color: pl.color, p });
        });
      });
      for (const { xy, items } of groups.values()) {
        const seats = [...new Set(items.map((i) => i.seat))];
        seats.forEach((seat, si) => {
          const mine = items.filter((i) => i.seat === seat);
          const curSeat = seat === state.current;
          // the token on top of a stack is a legal one, if any
          mine.sort((a, b) => (curSeat && legal.has(b.t) ? 1 : 0) - (curSeat && legal.has(a.t) ? 1 : 0));
          let [y, x] = xy;
          let k = 1;
          if (seats.length > 1) {
            const ang = (si / seats.length) * Math.PI * 2 - Math.PI * 3 / 4;
            x += Math.cos(ang) * 0.24; y += Math.sin(ang) * 0.24; k = 0.72;
          }
          mine.forEach((it, idx) => {
            const pc = pieceEl(it.seat, it.t, L.COLORS[it.color]);
            pc.style.setProperty('--x', x);
            pc.style.setProperty('--y', y);
            pc.style.setProperty('--k', k);
            pc.classList.toggle('ludo-under', idx > 0);
            pc.querySelector('.ludo-n').textContent = idx === 0 && mine.length > 1 ? mine.length : '';
            const can = idx === 0 && curSeat && legal.has(it.t);
            pc.classList.toggle('can', can && showGlow);
            pc.classList.toggle('ludo-maybe', can && !showGlow); // legal, shown softly to watchers
            pc.classList.toggle('done', it.p >= L.HOME);
          });
        });
      }
    }

    function render() {
      if (!state) return;
      const me = mySeat();
      const sb = q('.ludo-scores');
      sb.style.gridTemplateColumns = `repeat(${state.players.length}, minmax(0, 1fr))`;
      scoreboard(sb, state.players.map((p, i) => ({
        name: p.name,
        score: `${L.homeCount(p)}/4`,
        active: i === state.current && state.phase !== 'over',
        me: i === me,
        away: !api.isAlive(p.pid),
        sub: p.place ? `${ORD[p.place]} place` : `${L.COLOR_NAMES[L.COLORS[p.color]]} · home`,
      })));
      [...sb.children].forEach((c, i) => c.style.setProperty('--pc', HEX[L.COLORS[state.players[i].color]]));

      const cur = state.players[state.current];
      const color = L.COLORS[cur.color];
      q('.turn-label span').textContent = state.phase === 'over' ? 'Game over' : myTurn() ? 'Your turn' : `${cur.name}’s turn`;
      q('.ludo-dot').style.background = state.phase === 'over' ? 'transparent' : HEX[color];
      q('.turn-points strong').textContent = state.die && !rolling() ? state.die : '–';
      q('.ludo-diebox').style.setProperty('--ring', HEX[color]);

      let sel = '';
      const sl = q('.sel-line');
      sl.classList.remove('bad');
      if (state.phase !== 'over' && !rolling()) {
        if (state.phase === 'pass') {
          sel = state.event === 'three6' || state.sixes >= 3 ? 'Three 6s in a row — turn lost' : 'No moves — turn passes';
          sl.classList.add('bad');
        } else if (state.phase === 'move') {
          const nb = new Set((state.backs || []).map((t) => cur.tokens[t])).size;
          sel = state.auto != null ? 'Only one move — moving…'
            : nb ? 'Rolled 1 — step forward or back'
              : `${new Set(state.legal.map((t) => cur.tokens[t])).size} possible moves`;
        } else if (state.phase === 'roll' && state.bonus) {
          sel = state.bonus === 'capture' ? 'Capture! Bonus roll' : 'Rolled a 6 — roll again!';
        }
      }
      sl.textContent = sel;

      const btn = q('.ludo-dock [data-a="roll"]');
      const canRoll = myTurn() && state.phase === 'roll' && !busy() && !rollRequested;
      btn.disabled = !canRoll;
      btn.textContent = state.phase === 'roll' && myTurn() && state.bonus ? 'Roll again' : 'Roll';
      die.el.classList.toggle('clickable', canRoll);
      die.el.classList.toggle('dim', state.phase === 'roll' && !rollRequested && !canRoll);
      die.el.classList.toggle('ludo-ready', canRoll);

      let hint = '';
      if (state.phase === 'over') hint = '';
      else if (!myTurn()) hint = !api.isAlive(cur.pid) ? `Waiting for ${cur.name} to come back…` : `Waiting for ${cur.name}…`;
      else if (rolling() || anim) hint = '';
      else if (state.phase === 'roll') hint = cur.tokens.every((t) => t < 0) ? 'Tap the die — you need a 6 to come out.' : 'Tap the die to roll.';
      else if (state.phase === 'move') {
        hint = state.auto != null ? '' : picking != null ? 'Choose ◀ back or ▶ forward.'
          : (state.backs || []).length ? 'Tap a glowing token, then ◀ back or ▶ forward.' : 'Tap a glowing token to move it.';
      }
      q('.hint').textContent = hint;

      renderPieces();
      layer.querySelectorAll('.ludo-pc.picked').forEach((e) => e.classList.remove('picked'));
      renderPick();
    }

    function stopAnim() {
      if (!anim) return;
      anim.timers.forEach(clearTimeout);
      anim = null;
      layer.querySelectorAll('.ludo-hop, .ludo-sent').forEach((p) => p.classList.remove('ludo-hop', 'ludo-sent'));
    }

    // hop a token square by square, then send any captured tokens back to base
    function animateMove(next) {
      stopAnim();
      const m = next.lastMove;
      const k = `${m.seat}:${m.token}`;
      const steps = m.from < 0 || m.back ? [m.to] : Array.from({ length: m.to - m.from }, (_, i) => m.from + 1 + i);
      anim = { timers: [], over: new Map([[k, m.from]]) };
      for (const c of m.captured) anim.over.set(`${c.seat}:${c.token}`, c.from);
      const a = anim;
      steps.forEach((p, i) => {
        a.timers.push(setTimeout(() => {
          a.over.set(k, p);
          render();
          const pc = pieces.get(k);
          if (pc) { pc.classList.remove('ludo-hop'); void pc.offsetWidth; pc.classList.add('ludo-hop'); }
        }, i * HOP_MS));
      });
      const land = steps.length * HOP_MS;
      a.timers.push(setTimeout(() => {
        for (const c of m.captured) {
          const ck = `${c.seat}:${c.token}`;
          a.over.delete(ck);
          pieces.get(ck)?.classList.add('ludo-sent');
        }
        render();
      }, land));
      a.timers.push(setTimeout(() => {
        if (anim !== a) return;
        stopAnim();
        render();
      }, land + (m.captured.length ? 650 : 60)));
      return land;
    }

    return {
      update(next) {
        const old = state;
        state = next;
        if (!old || next.rollNo !== old.rollNo) { rollRequested = 0; die.shake(false); }
        if (!old || next.moveNo !== old.moveNo) moveRequested = 0;
        if (!old || next.rollNo !== old.rollNo || next.moveNo !== old.moveNo || next.current !== old.current) picking = null;
        let delay = 0;
        if (old && next.rollNo === old.rollNo + 1 && next.die) {
          stopAnim();
          rollingUntil = Date.now() + ROLL_MS;
          die.roll(next.die);
          clearTimeout(uiTimer);
          uiTimer = setTimeout(render, ROLL_MS + 40);
          delay = ROLL_MS;
        } else if (next.die) {
          die.set(next.die);
        }
        if (old && next.moveNo === old.moveNo + 1 && next.lastMove) delay = animateMove(next);
        else if (old && next.moveNo !== old.moveNo) stopAnim();
        render();
        if (old) {
          const ev = next.event;
          const ban = q('.banner');
          if (ev === 'capture') setTimeout(() => banner(ban, 'CAPTURED!', 'farkle'), delay);
          else if (ev === 'finish') setTimeout(() => banner(ban, next.phase === 'over' ? 'WINNER!' : 'ALL HOME!', 'hot'), delay);
          else if (ev === 'three6' && old.event !== 'three6') setTimeout(() => banner(ban, 'THREE 6s!', 'farkle'), delay);
          if (old.current !== next.current && next.phase !== 'over') {
            const nm = next.players[next.current].name;
            turnPill(q('.turn-banner'), next.current === mySeat() ? 'Your turn' : `${nm}’s turn`, Math.max(250, delay));
          }
        }
      },
      refresh: render,
      destroy() { stopAnim(); clearTimeout(uiTimer); el.remove(); },
    };
  },
};

function buildBoard(board, layer) {
  const cells = [];
  const kind = new Map(); // "r,c" -> class list
  L.TRACK.forEach(([r, c], i) => {
    const cls = ['ludo-sq'];
    const si = L.STARTS.indexOf(i);
    if (si >= 0) cls.push('ludo-start', `ludo-${L.COLORS[si]}`);
    if (L.STARS.includes(i)) cls.push('ludo-star');
    kind.set(`${r},${c}`, cls);
  });
  L.HOME_COL.forEach((col, ci) => col.forEach(([r, c]) => kind.set(`${r},${c}`, ['ludo-sq', 'ludo-lane', `ludo-${L.COLORS[ci]}`])));
  for (const [key, cls] of kind) {
    const [r, c] = key.split(',').map(Number);
    const mark = cls.includes('ludo-star') ? '★' : cls.includes('ludo-start') ? '➜' : '';
    const si = L.TRACK.findIndex(([tr, tc]) => tr === r && tc === c);
    const rot = cls.includes('ludo-start') ? [0, 90, 180, 270][L.STARTS.indexOf(si)] : 0;
    cells.push(`<div class="${cls.join(' ')}" style="grid-area:${r + 1}/${c + 1}"><span style="transform:rotate(${rot}deg)">${mark}</span></div>`);
  }
  L.BASE_CORNER.forEach(([r, c], ci) => {
    cells.push(`<div class="ludo-base ludo-${L.COLORS[ci]}" style="grid-area:${r + 1}/${c + 1}/span 6/span 6"><div class="ludo-yard">${'<i></i>'.repeat(4)}</div></div>`);
  });
  cells.push('<div class="ludo-goal" style="grid-area:7/7/span 3/span 3"></div>');
  board.insertAdjacentHTML('afterbegin', cells.join(''));
  board.appendChild(layer);
}
