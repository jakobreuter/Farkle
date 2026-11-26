import * as L from '../engines/life.js';
import { h, esc, scoreboard, banner, turnPill } from '../ui.js';

const COLORS = ['#e8453c', '#2f8fe0', '#f4c430', '#9b59d0', '#18b8a0', '#f08a24'];
const TILE = 44;
const CELL = 52;
const AISLE = 10;
const ROWH = 56;
const CAP = 16; // room for lane captions
const BW = CELL * 6 + AISLE; // 322
const capsBefore = (row) => (row >= 1 ? CAP : 0) + (row >= 6 ? CAP : 0);
const cx = (col) => col * CELL + CELL / 2 + (col >= 3 ? AISLE : 0);
const cy = (row) => 8 + row * ROWH + ROWH / 2 + capsBefore(row);
const BH = cy(L.ROWS - 1) + ROWH / 2 + 6;
const OFFSETS = {
  1: [[0, 3]],
  2: [[-10, 3], [10, 3]],
  3: [[-11, -6], [11, -6], [0, 10]],
  4: [[-11, -7], [11, -7], [-11, 10], [11, 10]],
  5: [[-13, -8], [0, -8], [13, -8], [-7, 10], [7, 10]],
  6: [[-13, -8], [0, -8], [13, -8], [-13, 10], [0, 10], [13, 10]],
};

const SPACE_HELP = [
  ['payday', 'collect your salary — also when you just pass by'],
  ['cash', 'a life event: win or lose some cash'],
  ['career', 'pick one of two job offers (or keep yours)'],
  ['family', 'find a partner, then kids (family bonus at the end)'],
  ['house', 'buy one of three homes, or skip'],
  ['stop', 'you always stop here and must decide'],
  ['retire', 'the finish — earlier retirees get a bigger farewell gift'],
];

const rulesHTML = () => `
  <ol>
    <li><b>Spin</b> (1–10) and walk your pawn along the road. Stop spaces ✋ halt you even if you have steps left.</li>
    <li>At the <b>Crossroads</b> choose <b>College</b> (${L.STUDENT_LOANS} student loans, better-paid jobs at graduation) or <b>Start working</b> (pick a job now, earn sooner).</li>
    <li>Later the road forks again: the <b>Safe route</b> has more paydays, the <b>Risky route</b> has big wins and big losses.</li>
    <li>If your cash drops below zero you automatically take loans of ${L.fmt(L.LOAN)}; each costs ${L.fmt(L.LOAN_REPAY)} at the end.</li>
    <li>Retirement gifts: ${L.RETIRE_BONUS.slice(0, 4).map(L.fmt).join(', ')}… by retirement order. Retired players are skipped until everyone retires.</li>
    <li><b>Final worth</b> = cash + house resale value + family bonus (partner ${L.fmt(L.PARTNER_BONUS)}, each kid ${L.fmt(L.KID_BONUS)}) − loans. Richest life wins!</li>
  </ol>
  <table>${SPACE_HELP.map(([t, d]) => `<tr><td>${L.TYPES[t].icon} ${L.TYPES[t].name}</td><td style="text-align:left;font-weight:400">${d}</td></tr>`).join('')}</table>`;

const famDots = (p) => (p.partner ? '<i class="lp-dp"></i>' : '') + '<i class="lp-dk"></i>'.repeat(p.kids);
const famText = (p) => (p.partner ? '❤️' : '') + (p.kids ? `👶${p.kids > 1 ? '×' + p.kids : ''}` : '');

export default {
  id: 'life',
  name: 'Life Path',
  emoji: '🛣️',
  blurb: 'Spin through college, jobs, kids and houses to retirement.',
  minPlayers: 2,
  maxPlayers: 6,
  options: [],

  setup(players, _opts, { first }) {
    return L.newGame(players, first % players.length);
  },

  randomFor(s, a, seat) {
    if (a.type === 'spin' && seat === s.current && s.phase === 'turn') return [10];
    if (a.type === 'arrive' && seat === -1 && s.phase === 'move') return L.arriveRanges(s);
    if (a.type === 'choose' && seat === s.current && s.phase === 'choose') return L.chooseRanges(s, a.i);
    return null;
  },

  apply(s, a, seat, { now, rand }) {
    if (a.type === 'arrive' || a.type === 'next') {
      if (seat !== -1) throw new Error('system only');
      return L.applyAction(s, a, rand, now);
    }
    if (seat !== s.current) throw new Error('not your turn');
    if (a.type === 'spin') return L.applyAction(s, a, rand, now);
    if (a.type === 'choose') return L.applyAction(s, { type: 'choose', i: a.i }, rand, now);
    throw new Error('unknown action');
  },

  tick(s, { now }) {
    if (s.phase === 'move' && now >= s.autoAt) return { type: 'arrive' };
    if (s.phase === 'show' && now >= s.autoAt) return { type: 'next' };
    return null;
  },

  botDelay: 1300,
  bot(s, seat) {
    if (s.current !== seat) return null;
    if (s.phase === 'turn') return { type: 'spin' };
    if (s.phase === 'choose') return { type: 'choose', i: L.botChoice(s, seat) };
    return null;
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: L.netWorth(p), win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game life">
      <section class="scoreboard"></section>
      <section class="table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points">Cash <strong>$0k</strong></div></div>
        <div class="sel-line lp-status"></div>
        <div class="lp-stage">
          <div class="lp-viewport"><div class="lp-board" style="width:${BW}px;height:${BH}px"></div></div>
          <div class="lp-pop hidden"></div>
        </div>
        <div class="lp-dock">
          <div class="lp-wheel"><div class="lp-pointer"></div><svg class="lp-wheel-svg" viewBox="-50 -50 100 100"></svg></div>
          <button class="btn primary big lp-spin">Spin</button>
        </div>
        <div class="hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <div class="lp-sheet-bg hidden"><div class="lp-sheet"></div></div>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const board = q('.lp-board');
    const viewport = q('.lp-viewport');
    const pop = q('.lp-pop');
    const sheetBg = q('.lp-sheet-bg');
    const sheet = q('.lp-sheet');
    const wheelSvg = q('.lp-wheel-svg');
    const spinBtn = q('.lp-spin');

    let state = null;
    let waiting = 0; // sent an action, waiting for the host
    let animSeat = -1; // pawn currently hopping
    let animUntil = 0;
    let wheelRot = 0;
    let lastMoveNo = null;
    let lastEventNo = null;
    let sheetKey = '';
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

    // ---------- static board ----------
    const road = [];
    for (const sp of L.BOARD) {
      for (const n of sp.next) {
        const a = sp; const b = L.BOARD[n];
        const x1 = cx(a.col); const y1 = cy(a.row); const x2 = cx(b.col); const y2 = cy(b.row);
        const far = Math.abs(a.col - b.col) > 1;
        const d = far ? `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}` : `M${x1} ${y1} L${x2} ${y2}`;
        road.push(d);
      }
    }
    const lanes = L.LANES.map((ln) => {
      const x = (cx(ln.col0) + cx(ln.col0 + 2)) / 2;
      const y = cy(ln.row) - ROWH / 2 - 2;
      return `<text x="${x}" y="${y}" class="lp-cap">${ln.label}</text>`;
    }).join('');
    board.innerHTML = `<svg class="lp-road" width="${BW}" height="${BH}" viewBox="0 0 ${BW} ${BH}">
        ${road.map((d) => `<path d="${d}" class="lp-road-base"/>`).join('')}
        ${road.map((d) => `<path d="${d}" class="lp-road-line"/>`).join('')}
        ${lanes}
      </svg>
      ${L.BOARD.map((sp) => {
        const T = L.TYPES[sp.t];
        const tag = sp.t === 'stop' ? L.STOPS[sp.stop].title.split(' ')[0].toUpperCase() : (sp.t === 'cash' && sp.pool === 'risk' ? 'GAMBLE' : T.tag);
        const icon = sp.t === 'cash' && sp.pool === 'risk' ? '🎰' : sp.t === 'stop' && sp.stop === 'grad' ? '🎓' : T.icon;
        return `<div class="lp-tile t-${sp.t} ${sp.pool === 'risk' ? 'risk' : ''}" data-id="${sp.id}" style="left:${cx(sp.col) - TILE / 2}px;top:${cy(sp.row) - TILE / 2}px"><span class="lp-ic">${icon}</span><span class="lp-tg">${tag}</span></div>`;
      }).join('')}
      <div class="lp-pawns"></div>`;
    const pawnLayer = q('.lp-pawns');

    // wheel
    wheelSvg.innerHTML = Array.from({ length: 10 }, (_, k) => {
      const a0 = (k * 36 - 90) * Math.PI / 180; const a1 = ((k + 1) * 36 - 90) * Math.PI / 180;
      const am = ((k + 0.5) * 36 - 90) * Math.PI / 180;
      const p = (a, r) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
      const fill = ['#e8453c', '#f4c430', '#2f8fe0', '#18b8a0', '#9b59d0'][k % 5];
      const tx = Math.cos(am) * 33; const ty = Math.sin(am) * 33;
      return `<path d="M0 0 L${p(a0, 48)} A48 48 0 0 1 ${p(a1, 48)} Z" fill="${fill}" stroke="#fffaf0" stroke-width="1.5"/>
        <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${(k + 0.5) * 36} ${tx.toFixed(1)} ${ty.toFixed(1)})" class="lp-wn">${k + 1}</text>`;
    }).join('') + '<circle r="9" fill="#fffaf0" stroke="#5a3a1f" stroke-width="2"/>';

    function spinWheel(value, animate) {
      const center = (value - 0.5) * 36;
      const target = (360 - center) % 360;
      const cur = ((wheelRot % 360) + 360) % 360;
      let delta = (target - cur + 360) % 360;
      if (animate) delta += 360 * 3;
      wheelRot += delta;
      wheelSvg.style.transition = animate ? `transform ${L.SPIN_MS}ms cubic-bezier(.15,.7,.2,1)` : 'none';
      wheelSvg.style.transform = `rotate(${wheelRot}deg)`;
    }

    // ---------- pawns ----------
    function ensurePawns() {
      if (pawnLayer.children.length === state.players.length) return;
      pawnLayer.innerHTML = state.players.map((p, i) => `<div class="lp-pawn" style="--pc:${COLORS[i % COLORS.length]}"><b>${esc((p.name || '?').trim().charAt(0).toUpperCase() || '?')}</b><span class="lp-fam"></span></div>`).join('');
    }
    function placePawn(i, id, off, hop) {
      const pw = pawnLayer.children[i];
      const sp = L.BOARD[id];
      pw.style.transform = `translate(${cx(sp.col) + off[0]}px, ${cy(sp.row) + off[1]}px)`;
      if (hop) { pw.classList.remove('hop'); void pw.offsetWidth; pw.classList.add('hop'); }
    }
    function layoutPawns() {
      ensurePawns();
      const groups = new Map();
      state.players.forEach((p, i) => {
        if (i === animSeat) return;
        if (!groups.has(p.pos)) groups.set(p.pos, []);
        groups.get(p.pos).push(i);
      });
      for (const [pos, list] of groups) {
        const offs = OFFSETS[Math.min(6, list.length)];
        list.forEach((i, k) => placePawn(i, pos, offs[k]));
      }
      state.players.forEach((p, i) => {
        const pw = pawnLayer.children[i];
        pw.classList.toggle('cur', i === state.current && state.phase !== 'over');
        pw.classList.toggle('retired', p.retired);
        pw.classList.toggle('moving', i === animSeat);
        pw.querySelector('.lp-fam').innerHTML = famDots(p);
      });
    }
    function scrollTo(id, smooth = true) {
      const sp = L.BOARD[id];
      const top = cy(sp.row) - viewport.clientHeight / 2;
      viewport.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }

    function animateMove(mv) {
      const seat = mv.seat;
      animSeat = seat;
      animUntil = Date.now() + L.SPIN_MS + L.HOP_MS * mv.path.length;
      ensurePawns();
      placePawn(seat, mv.from, [0, 3]);
      pawnLayer.children[seat].classList.add('moving');
      spinWheel(mv.value, true);
      scrollTo(mv.from);
      mv.path.forEach((id, k) => later(() => {
        placePawn(seat, id, [0, 3], true);
        if (k % 2 === 0 || k === mv.path.length - 1) scrollTo(id);
      }, L.SPIN_MS + L.HOP_MS * k));
      later(() => { animSeat = -1; render(); }, L.SPIN_MS + L.HOP_MS * mv.path.length + 30);
    }

    // ---------- popup ----------
    function showPop(ev) {
      if (!ev) return;
      const who = state.players[ev.seat];
      const d = ev.delta ? `<div class="lp-pop-d ${ev.delta > 0 ? 'up' : 'down'}">${L.signed(ev.delta)}</div>` : '';
      pop.innerHTML = `<div class="lp-pop-ic">${ev.icon}</div><div class="lp-pop-t">${esc(ev.title)}</div>
        <div class="lp-pop-who" style="color:${COLORS[ev.seat % COLORS.length]}">${esc(who?.name || '')}</div>
        <div class="lp-pop-x">${esc(ev.text)}</div>${d}`;
      pop.classList.remove('hidden', 'in');
      void pop.offsetWidth;
      pop.classList.add('in');
      clearTimeout(pop._t);
      pop._t = setTimeout(() => pop.classList.add('hidden'), Math.max(1400, (state.phase === 'show' ? state.autoAt - api.hostNow() : 1800) - 150));
    }

    // ---------- choice sheet ----------
    function closeSheet() { sheetBg.classList.add('hidden'); sheet.innerHTML = ''; sheetKey = ''; }
    function openSheet() {
      const pd = state.pending;
      const p = state.players[state.current];
      const key = `${state.eventNo}:${pd.kind}`;
      if (key === sheetKey) return;
      sheetKey = key;
      let opts = '';
      if (pd.kind === 'fork1' || pd.kind === 'fork2') {
        opts = pd.options.map((o, i) => `<button class="lp-opt lp-route" data-i="${i}"><span class="lp-oi">${o.icon}</span><span class="lp-on"><b>${esc(o.name)}</b><small>${esc(o.note)}</small></span></button>`).join('');
      } else if (pd.kind === 'career') {
        opts = pd.options.map((o, i) => `<button class="lp-opt ${o.keep ? 'keep' : ''}" data-i="${i}"><span class="lp-oi">${o.icon}</span><span class="lp-on"><b>${o.keep ? 'Keep: ' : ''}${esc(o.name)}</b><small>${L.fmt(o.salary)} per payday</small></span><span class="lp-ov">${L.fmt(o.salary)}</span></button>`).join('');
      } else if (pd.kind === 'house') {
        const back = p.house ? p.house.price : 0;
        opts = pd.options.map((o, i) => {
          if (o.skip) return `<button class="lp-opt keep" data-i="${i}"><span class="lp-oi">🚪</span><span class="lp-on"><b>${p.house ? `Keep the ${esc(p.house.name)}` : 'Not now'}</b><small>${p.house ? `worth ${L.fmt(p.house.worth)} at retirement` : 'keep renting for now'}</small></span></button>`;
          const short = Math.max(0, o.price - back - p.cash);
          const loans = Math.ceil(short / L.LOAN);
          const tag = loans ? `<em class="lp-loan">${loans} loan${loans > 1 ? 's' : ''}</em>` : '<em class="lp-ok">affordable</em>';
          const trend = o.worth >= o.price ? 'up' : 'down';
          return `<button class="lp-opt" data-i="${i}"><span class="lp-oi">${o.icon}</span><span class="lp-on"><b>${esc(o.name)}</b><small>resale <span class="${trend}">${L.fmt(o.worth)}</span> · ${tag}</small></span><span class="lp-ov">${L.fmt(o.price)}</span></button>`;
        }).join('');
      }
      sheet.innerHTML = `<h3>${esc(pd.title)}</h3><p class="lp-sub">${esc(pd.text)}</p><div class="lp-opts">${opts}</div>
        <p class="lp-mine">You: ${L.fmt(p.cash)} cash${p.loans ? ` · ${p.loans} loan${p.loans > 1 ? 's' : ''}` : ''}${p.career ? ` · ${p.career.icon} ${esc(p.career.name)}` : ''}</p>`;
      const fresh = sheetBg.classList.contains('hidden');
      sheetBg.classList.remove('hidden');
      if (fresh) { sheet.classList.remove('pop'); void sheet.offsetWidth; sheet.classList.add('pop'); }
    }
    sheet.addEventListener('click', (e) => {
      const b = e.target.closest('.lp-opt');
      if (!b || !state || state.phase !== 'choose' || state.current !== api.mySeat() || waiting) return;
      waiting = Date.now();
      api.act({ type: 'choose', i: Number(b.dataset.i) });
      closeSheet();
      sheetKey = `${state.eventNo}:${state.pending.kind}`; // don't reopen the same sheet
      render();
      later(() => { if (waiting && Date.now() - waiting > 7900) { waiting = 0; sheetKey = ''; render(); } }, 8000);
    });

    spinBtn.addEventListener('click', () => {
      if (!state || state.phase !== 'turn' || state.current !== api.mySeat() || waiting) return;
      waiting = Date.now();
      render();
      api.act({ type: 'spin' });
      later(() => { if (waiting && Date.now() - waiting > 7900) { waiting = 0; render(); } }, 8000);
    });

    // ---------- render ----------
    function render() {
      if (!state) return;
      const me = api.mySeat();
      const cur = state.players[state.current];
      const mine = state.current === me;
      scoreboard(q('.scoreboard'), state.players.map((p, i) => ({
        name: p.name,
        score: L.fmt(p.cash),
        active: i === state.current && state.phase !== 'over',
        me: i === me,
        away: !api.isAlive(p.pid),
        sub: p.retired ? `🏖️ Retired #${p.rank} ${famText(p)}` : `${p.career ? `${p.career.icon} ${p.career.name}` : p.college ? '🎓 Student' : 'No job yet'} ${famText(p)}${p.house ? ' 🏠' : ''}${p.loans ? ` · ${p.loans}L` : ''}`,
      })));
      [...q('.scoreboard').children].forEach((c, i) => c.style.setProperty('--pc', COLORS[i % COLORS.length]));

      q('.turn-label').textContent = state.phase === 'over' ? 'Everyone has retired' : (mine ? 'Your turn' : `${cur.name}’s turn`);
      q('.turn-points strong').textContent = L.fmt(cur.cash);
      const salary = cur.career ? `${cur.career.icon} ${cur.career.name} ${L.fmt(cur.career.salary)}` : cur.college ? '🎓 Student' : 'No job yet';
      q('.lp-status').textContent = state.phase === 'over' ? 'Final worth = cash + house + family − loans'
        : `${salary}${cur.loans ? ` · ${cur.loans} loan${cur.loans > 1 ? 's' : ''}` : ''}${cur.house ? ` · ${cur.house.icon} ${cur.house.name}` : ''}`;

      // tiles: highlight current player's space
      board.querySelectorAll('.lp-tile.here').forEach((t) => t.classList.remove('here'));
      if (state.phase !== 'over' && animSeat < 0) board.querySelector(`.lp-tile[data-id="${cur.pos}"]`)?.classList.add('here');
      layoutPawns();

      const animating = Date.now() < animUntil;
      spinBtn.disabled = !(mine && state.phase === 'turn' && !waiting);
      spinBtn.textContent = state.phase === 'move' ? `Spun ${state.move?.value ?? ''}` : 'Spin';
      if (state.phase === 'move' && animating) spinBtn.textContent = 'Spinning…';

      let hint = '';
      if (state.phase === 'turn') hint = mine ? 'Spin the wheel to move!' : api.isAlive(cur.pid) ? `Waiting for ${cur.name} to spin…` : `Waiting for ${cur.name} to come back…`;
      else if (state.phase === 'move') hint = `${mine ? 'You' : cur.name} spun a ${state.move.value}${state.move.path.length < state.move.value ? ' — stopped early!' : '…'}`;
      else if (state.phase === 'choose') hint = mine ? (animating ? '' : 'Make your choice.') : `${cur.name} is deciding: ${state.pending.title.toLowerCase()}…`;
      else if (state.phase === 'show' && state.event) hint = `${state.event.icon} ${state.event.title}${state.event.delta ? ' ' + L.signed(state.event.delta) : ''}`;
      else if (state.phase === 'over') {
        const w = (state.winners || []).map((i) => state.players[i].name).join(' & ');
        hint = `${w} wins with ${L.fmt(L.netWorth(state.players[state.winners?.[0] ?? 0]))}!`;
      }
      q('.hint').textContent = hint;

      if (state.phase === 'choose' && mine && !waiting && !animating) openSheet();
      else if (!(state.phase === 'choose' && mine)) { if (!sheetBg.classList.contains('hidden')) closeSheet(); }
    }

    return {
      update(next, prev) {
        const old = state;
        state = next;
        if (!old || next.moveNo !== old.moveNo || next.eventNo !== old.eventNo || next.phase !== old.phase) waiting = 0;
        ensurePawns();
        const newMove = next.move && next.move.no !== lastMoveNo;
        if (lastMoveNo === null) {
          // first render: no animations
          lastMoveNo = next.move?.no ?? 0;
          lastEventNo = next.event?.no ?? 0;
          if (next.move) spinWheel(next.move.value, false);
          render();
          scrollTo(next.players[next.current].pos, false);
          return;
        }
        if (newMove) {
          lastMoveNo = next.move.no;
          animateMove(next.move);
        }
        if (next.event && next.event.no !== lastEventNo) {
          lastEventNo = next.event.no;
          const mineChoice = next.phase === 'choose' && next.current === api.mySeat();
          const delay = Math.max(0, animUntil - Date.now());
          if (!mineChoice) later(() => showPop(next.event), delay);
        }
        render();
        if (animSeat < 0 && Date.now() >= animUntil && old && old.current !== next.current) scrollTo(next.players[next.current].pos);
        if (old && old.current !== next.current && next.phase !== 'over') {
          const nm = next.players[next.current].name;
          turnPill(q('.turn-banner'), next.current === api.mySeat() ? 'Your turn' : `${nm}’s turn`, 250);
        }
        if (old && old.phase !== 'over' && next.phase === 'over') {
          later(() => banner(q('.banner'), 'ALL RETIRED!', 'bank', 2200), 300);
        }
        // the sheet waits for the hop animation to finish
        if (next.phase === 'choose' && next.current === api.mySeat()) later(() => render(), Math.max(0, animUntil - Date.now()) + 40);
      },
      refresh: () => render(),
      destroy() { for (const t of timers) clearTimeout(t); clearTimeout(pop._t); el.remove(); },
    };
  },
};
