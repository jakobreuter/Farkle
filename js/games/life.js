import * as L from '../engines/life.js';
import { h, esc, banner, turnPill } from '../ui.js';

const COLORS = ['#e8453c', '#2f8fe0', '#f4c430', '#9b59d0', '#18b8a0', '#f08a24'];
const TILE = 44;
const CELL = 52;
const AISLE = 10;
const ROWH = 56;
const BW = CELL * 6 + AISLE; // 322
const ZONE_BG = { campus: 'rgba(120,175,255,.17)', city: 'rgba(196,150,255,.17)', suburbs: 'rgba(150,235,140,.15)', golden: 'rgba(255,170,90,.2)' };
const ZONE_ART = { campus: '🏫', city: '🌆', suburbs: '🌳', golden: '⛱️' };

// vertical layout: zone bands with a header (and lane captions) above their rows
const ROW_Y = [];
const ZONE_BOX = {};
{
  let y = 8;
  for (let r = 0; r < L.ROWS; r++) {
    const z = L.ZONES.find((zz) => zz.rows[0] === r);
    if (z) { ZONE_BOX[z.key] = { top: y }; y += 24 + (z.lanes ? 14 : 0); }
    ROW_Y[r] = y + ROWH / 2;
    y += ROWH;
    const ze = L.ZONES.find((zz) => zz.rows[1] === r);
    if (ze) { ZONE_BOX[ze.key].bottom = y + 2; y += 12; }
  }
  ROW_Y.total = y;
}
const cx = (col) => col * CELL + CELL / 2 + (col >= 3 ? AISLE : col > 2 ? AISLE / 2 : 0);
const cy = (row) => ROW_Y[row];
const BH = ROW_Y.total;
const OFFSETS = {
  1: [[0, 2]],
  2: [[-10, 2], [10, 2]],
  3: [[-11, -6], [11, -6], [0, 10]],
  4: [[-11, -7], [11, -7], [-11, 10], [11, 10]],
  5: [[-13, -8], [0, -8], [13, -8], [-7, 10], [7, 10]],
  6: [[-13, -8], [0, -8], [13, -8], [-13, 10], [0, 10], [13, 10]],
};
const zoneAges = (key) => {
  const ages = L.BOARD.filter((s) => s.zone === key && s.t !== 'start').map((s) => L.ageAt(s.id));
  return [Math.min(...ages), Math.max(...ages)];
};

const SPACE_HELP = [
  ['payday', 'collect your salary — also when you just pass by'],
  ['cash', 'flip a life card: windfalls, mishaps, raises'],
  ['career', 'two job offers — take one or keep yours'],
  ['family', 'kids if you married, pets if you stayed footloose'],
  ['house', 'buy one of three homes, or skip'],
  ['stop', 'you always stop here: Graduation, Wedding, the Fork, Second act'],
  ['retire', 'the finish — earlier retirees get a bigger farewell gift'],
];

const rulesHTML = () => `
  <ol>
    <li><b>Choose your path</b> before the first spin: take one of three dealt jobs (paid right away) or <b>go to college</b> and pick a dream job from three degree careers. College pays more, but only after <b>Graduation</b>, and costs ${L.STUDENT_LOANS} student loans.</li>
    <li><b>Spin</b> 1–10 and walk from age ${L.AGE_START} to ${L.AGE_END} through Campus, the Big City, the Suburbs and the Golden Years. Stop spaces halt you even with steps left.</li>
    <li>At the <b>Fork</b>: Steady Street (more paydays) or the Wild Ride (big gambles).</li>
    <li>Cash below zero takes automatic loans of ${L.fmt(L.LOAN)}; each costs ${L.fmt(L.LOAN_REPAY)} at the end.</li>
    <li><b>Final worth</b> = cash + home value + family (partner ${L.fmt(L.PARTNER_BONUS)}, each kid ${L.fmt(L.KID_BONUS)}, each pet ${L.fmt(L.PET_BONUS)}) − loans. Retirement gifts go ${L.RETIRE_BONUS.slice(0, 3).map(L.fmt).join(', ')}… by order.</li>
    <li>When everyone has retired, the life stories are revealed — the richest life wins!</li>
  </ol>
  <table>${SPACE_HELP.map(([t, d]) => `<tr><td>${L.TYPES[t].icon} ${L.TYPES[t].name}</td><td style="text-align:left;font-weight:400">${d}</td></tr>`).join('')}</table>`;

const initial = (p) => esc((p.name || '?').trim().charAt(0).toUpperCase() || '?');
const famText = (p) => [p.partner ? '❤️' : '', p.kids ? '👶'.repeat(Math.min(p.kids, 4)) : '', ['', '🐶', '🐶🐱', '🐶🐱🦜'][p.pets] || ''].join('');
const famDots = (p) => (p.partner ? '<i class="lp-dp"></i>' : '') + '<i class="lp-dk"></i>'.repeat(p.kids) + '<i class="lp-dpet"></i>'.repeat(p.pets);

function jobCard(o, i, extra = '') {
  return `<button class="lp-jc ${extra}" data-i="${i}">
    <span class="lp-jc-in"><span class="lp-jc-back"><b>LIFE</b><i>✦</i></span>
    <span class="lp-jc-face"><span class="lp-jc-e">${o.icon}</span><b class="lp-jc-n">${esc(o.name)}</b><span class="lp-jc-s">${L.fmt(o.salary)}<small>/payday</small></span><span class="lp-jc-f">${esc(o.flavor)}</span></span></span>
  </button>`;
}

export default {
  id: 'life',
  name: 'Life Path',
  emoji: '🛣️',
  blurb: 'Pick a path, spin through life, see how your story turns out.',
  minPlayers: 2,
  maxPlayers: 6,
  options: [],

  setup(players, _opts, { first }) {
    return L.newGame(players, first % players.length);
  },

  randomFor(s, a, seat) {
    if (a.type === 'spin' && seat === s.current && s.phase === 'turn') return [10];
    if ((a.type === 'deal' || a.type === 'arrive') && seat === -1) return L.systemRanges(s);
    return null;
  },

  apply(s, a, seat, { now, rand }) {
    if (['deal', 'arrive', 'next', 'reveal', 'end'].includes(a.type)) {
      if (seat !== -1) throw new Error('system only');
      return L.applyAction(s, a, rand, now);
    }
    if (seat !== s.current) throw new Error('not your turn');
    if (a.type === 'spin') return L.applyAction(s, a, rand, now);
    if (a.type === 'choose') return L.applyAction(s, { type: 'choose', i: a.i }, rand, now);
    throw new Error('unknown action');
  },

  tick(s, { now }) {
    return L.due(s, now);
  },

  botDelay: 1300,
  bot(s, seat) {
    if (s.current !== seat) return null;
    if (s.phase === 'turn') return { type: 'spin' };
    if (s.phase === 'choose' || s.phase === 'pick') return { type: 'choose', i: L.botChoice(s, seat) };
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
      <section class="lp-lives"></section>
      <section class="table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points"><span class="lp-tpl">Cash</span> <strong>$0k</strong></div></div>
        <div class="lp-teaser"></div>
        <div class="lp-stage">
          <div class="lp-viewport"><div class="lp-board" style="width:${BW}px;height:${BH}px"></div></div>
          <div class="lp-card hidden"></div>
          <div class="lp-finale hidden"></div>
        </div>
        <div class="lp-dock">
          <div class="lp-wheel"><div class="lp-pointer"></div><svg class="lp-wheel-svg" viewBox="-50 -50 100 100"></svg><div class="lp-hub"></div></div>
          <button class="btn primary big lp-spin">SPIN</button>
        </div>
        <div class="hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <div class="lp-sheet-bg hidden"><div class="lp-sheet"></div></div>
      <div class="lp-tl-bg hidden"><div class="lp-tl"></div></div>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const board = q('.lp-board');
    const viewport = q('.lp-viewport');
    const card = q('.lp-card');
    const finale = q('.lp-finale');
    const sheetBg = q('.lp-sheet-bg');
    const sheet = q('.lp-sheet');
    const tlBg = q('.lp-tl-bg');
    const tl = q('.lp-tl');
    const wheelSvg = q('.lp-wheel-svg');
    const hub = q('.lp-hub');
    const pointer = q('.lp-pointer');
    const spinBtn = q('.lp-spin');
    const lives = q('.lp-lives');

    let state = null;
    let waiting = 0;
    let animSeat = -1;
    let animUntil = 0;
    let wheelRot = 0;
    let spinRaf = 0;
    let lastMoveNo = null;
    let lastEventNo = null;
    let sheetKey = '';
    let cardMode = ''; // '' | 'event' | 'wait:<key>'
    let finaleShown = -1;
    let tlSeat = -1;
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const rafs = new Set();
    const color = (i) => COLORS[i % COLORS.length];

    // ---------- static board ----------
    const road = [];
    for (const sp of L.BOARD) {
      for (const n of sp.next) {
        const b = L.BOARD[n];
        const x1 = cx(sp.col); const y1 = cy(sp.row); const x2 = cx(b.col); const y2 = cy(b.row);
        const far = Math.abs(sp.col - b.col) > 1;
        road.push(far ? `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}` : `M${x1} ${y1} L${x2} ${y2}`);
      }
    }
    const zones = L.ZONES.map((z) => {
      const bx = ZONE_BOX[z.key];
      const [a0, a1] = zoneAges(z.key);
      const lanes = z.lanes ? z.lanes.map((lb, k) => `<text x="${(cx(k * 3) + cx(k * 3 + 2)) / 2}" y="${bx.top + 34}" class="lp-lane">${lb}</text>`).join('') : '';
      return [`<rect x="2" y="${bx.top}" width="${BW - 4}" height="${bx.bottom - bx.top}" rx="14" fill="${ZONE_BG[z.key]}" class="lp-zone"/>
        <text x="${BW - 8}" y="${bx.bottom - 8}" class="lp-art">${ZONE_ART[z.key]}</text>`, `<text x="12" y="${bx.top + 17}" class="lp-zt">${z.icon} ${z.name.toUpperCase()}</text>
        <text x="${BW - 12}" y="${bx.top + 17}" class="lp-za">age ${a0}–${a1}</text>${lanes}`];
    });
    board.innerHTML = `<svg class="lp-road" width="${BW}" height="${BH}" viewBox="0 0 ${BW} ${BH}">
        ${zones.map((z) => z[0]).join('')}
        ${road.map((d) => `<path d="${d}" class="lp-road-base"/>`).join('')}
        ${road.map((d) => `<path d="${d}" class="lp-road-line"/>`).join('')}
        ${zones.map((z) => z[1]).join('')}
      </svg>
      ${L.BOARD.map((sp) => `<div class="lp-tile t-${sp.t} ${sp.pool === 'risk' ? 'risk' : ''} ${sp.stop ? 's-' + sp.stop : ''}" data-id="${sp.id}" style="left:${cx(sp.col) - TILE / 2}px;top:${cy(sp.row) - TILE / 2}px"><span class="lp-ic">${sp.t === 'cash' && sp.pool === 'risk' ? '🎰' : L.spaceIcon(sp)}</span><span class="lp-tg">${L.spaceTag(sp)}</span></div>`).join('')}
      <div class="lp-pawns"></div>`;
    const pawnLayer = q('.lp-pawns');
    const tileEl = (id) => board.querySelector(`.lp-tile[data-id="${id}"]`);

    // ---------- wheel ----------
    const WEDGE = ['#e8453c', '#f4c430', '#2f8fe0', '#18b8a0', '#9b59d0'];
    wheelSvg.innerHTML = Array.from({ length: 10 }, (_, k) => {
      const a0 = (k * 36 - 90) * Math.PI / 180; const a1 = ((k + 1) * 36 - 90) * Math.PI / 180;
      const am = ((k + 0.5) * 36 - 90) * Math.PI / 180;
      const pt = (a, r) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
      const tx = (Math.cos(am) * 35).toFixed(1); const ty = (Math.sin(am) * 35).toFixed(1);
      return `<path d="M0 0 L${pt(a0, 48)} A48 48 0 0 1 ${pt(a1, 48)} Z" fill="${WEDGE[k % 5]}" stroke="#fffaf0" stroke-width="1.2"/>
        <circle cx="${pt(a0, 45).split(' ')[0]}" cy="${pt(a0, 45).split(' ')[1]}" r="1.6" fill="#fffaf0"/>
        <text x="${tx}" y="${ty}" transform="rotate(${(k + 0.5) * 36} ${tx} ${ty})" class="lp-wn">${k + 1}</text>`;
    }).join('') + '<circle r="48" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1"/>';
    const setWheel = (deg) => { wheelSvg.style.transform = `rotate(${deg}deg)`; };
    function spinWheel(value, animate) {
      for (const r of rafs) cancelAnimationFrame(r);
      rafs.clear();
      const center = (value - 0.5) * 36;
      const target = (360 - center) % 360;
      const cur = ((wheelRot % 360) + 360) % 360;
      let delta = (target - cur + 360) % 360;
      if (!animate) { wheelRot += delta; setWheel(wheelRot); hub.textContent = value; return; }
      delta += 360 * 4;
      const start = wheelRot;
      wheelRot += delta;
      const T = L.SPIN_MS - 120;
      const t0 = performance.now();
      let lastWedge = Math.floor(start / 36);
      hub.textContent = '';
      hub.classList.remove('pop');
      el.classList.add('lp-spinning');
      const step = (t) => {
        const x = Math.min(1, (t - t0) / T);
        const e = 1 - Math.pow(1 - x, 4);
        const rot = start + delta * e;
        setWheel(rot);
        const w = Math.floor(rot / 36);
        if (w !== lastWedge) {
          lastWedge = w;
          pointer.classList.remove('tick'); void pointer.offsetWidth; pointer.classList.add('tick');
        }
        if (x < 1) { const r = requestAnimationFrame(step); rafs.add(r); } else {
          el.classList.remove('lp-spinning');
          hub.textContent = value;
          hub.classList.remove('pop'); void hub.offsetWidth; hub.classList.add('pop');
        }
      };
      const r = requestAnimationFrame(step);
      rafs.add(r);
    }

    // ---------- pawns ----------
    function ensurePawns() {
      if (pawnLayer.children.length === state.players.length) return;
      pawnLayer.innerHTML = state.players.map((p, i) => `<div class="lp-pawn" style="--pc:${color(i)}"><b></b><span class="lp-fam"></span></div>`).join('');
    }
    function placePawn(i, id, off, hop) {
      const pw = pawnLayer.children[i];
      const sp = L.BOARD[id];
      pw.style.transform = `translate(${cx(sp.col) + off[0]}px, ${cy(sp.row) + off[1]}px)`;
      pw.querySelector('b').textContent = L.ageAt(id);
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
        // current player drawn last (on top)
        const offs = OFFSETS[Math.min(6, list.length)];
        list.forEach((i, k) => placePawn(i, pos, offs[k]));
      }
      state.players.forEach((p, i) => {
        const pw = pawnLayer.children[i];
        pw.classList.toggle('cur', i === state.current && !['finale', 'over'].includes(state.phase));
        pw.classList.toggle('moving', i === animSeat);
        pw.querySelector('.lp-fam').innerHTML = famDots(p);
      });
    }
    function scrollToSpace(id, smooth = true) {
      const top = cy(L.BOARD[id].row) - viewport.clientHeight / 2;
      viewport.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }
    function animateMove(mv) {
      const seat = mv.seat;
      animSeat = seat;
      animUntil = Date.now() + L.SPIN_MS + L.HOP_MS * mv.path.length;
      ensurePawns();
      placePawn(seat, mv.from, [0, 2]);
      spinWheel(mv.value, true);
      scrollToSpace(mv.from);
      mv.path.forEach((id, k) => later(() => {
        placePawn(seat, id, [0, 2], true);
        const t = tileEl(id); t.classList.remove('step'); void t.offsetWidth; t.classList.add('step');
        if (k % 2 === 0 || k === mv.path.length - 1) scrollToSpace(id);
      }, L.SPIN_MS + L.HOP_MS * k));
      later(() => {
        animSeat = -1;
        const t = tileEl(mv.path[mv.path.length - 1]);
        t.classList.remove('landed'); void t.offsetWidth; t.classList.add('landed');
        render();
      }, L.SPIN_MS + L.HOP_MS * mv.path.length + 20);
    }

    // ---------- life card reveal ----------
    function countTo(elm, to, ms = 900) {
      const t0 = performance.now();
      const step = (t) => {
        const x = Math.min(1, (t - t0) / ms);
        const v = Math.round((to * (1 - Math.pow(1 - x, 3))) / 1000) * 1000;
        elm.textContent = L.signed(v);
        if (x < 1) { const r = requestAnimationFrame(step); rafs.add(r); }
      };
      const r = requestAnimationFrame(step);
      rafs.add(r);
    }
    function hideCard() { card.classList.add('hidden'); cardMode = ''; clearTimeout(card._t); }
    function showEventCard(ev) {
      if (!ev || !state) return;
      const who = state.players[ev.seat];
      const d = ev.delta ? `<div class="lp-c-d ${ev.delta > 0 ? 'up' : 'down'}">&nbsp;</div>` : '<div class="lp-c-d"></div>';
      const raise = ev.raise ? `<div class="lp-c-r">Salary +${L.fmt(ev.raise)}!</div>` : '';
      const big = ev.card ? `<div class="lp-c-job"><span>${ev.card.icon}</span><b>${esc(ev.card.name)}</b><em>${ev.card.salary ? L.fmt(ev.card.salary) + '/payday' : L.fmt(ev.card.price)}</em></div>` : `<div class="lp-c-e">${ev.icon}</div>`;
      card.innerHTML = `<div class="lp-c-in"><div class="lp-c-back"><b>LIFE</b><i>✦ ✦ ✦</i></div>
        <div class="lp-c-face k-${ev.kind}">
          <div class="lp-c-who"><span class="lp-av" style="--pc:${color(ev.seat)}">${initial(who)}</span>${esc(who.name)} · age ${L.ageAt(who.pos)}</div>
          ${big}<div class="lp-c-t">${esc(ev.title)}</div><div class="lp-c-x">${esc(ev.text)}</div>${raise}${d}
        </div></div>`;
      cardMode = 'event';
      card.className = 'lp-card';
      void card.offsetWidth;
      card.classList.add('flip');
      if (ev.delta) later(() => { const de = card.querySelector('.lp-c-d'); if (de) countTo(de, ev.delta); }, 480);
      clearTimeout(card._t);
      const left = state.phase === 'show' ? state.autoAt - api.hostNow() : 2200;
      card._t = setTimeout(hideCard, Math.max(1700, left - 120));
    }
    function showWaitCard(key, icon, title, text) {
      if (cardMode === `wait:${key}`) return;
      cardMode = `wait:${key}`;
      clearTimeout(card._t);
      card.className = 'lp-card wait';
      card.innerHTML = `<div class="lp-c-in"><div class="lp-c-face k-wait"><div class="lp-c-e">${icon}</div><div class="lp-c-t">${esc(title)}</div><div class="lp-c-x">${esc(text)}</div>
        <div class="lp-c-backs"><i></i><i></i><i></i></div></div></div>`;
    }

    // ---------- choice sheet ----------
    function closeSheet() { sheetBg.classList.add('hidden'); sheet.innerHTML = ''; sheetKey = ''; }
    function openSheet() {
      const pd = state.pending;
      const p = state.players[state.current];
      const key = state.phase === 'pick' ? `pick:${state.dealNo}:${pd.step}` : `ch:${state.eventNo}`;
      if (key === sheetKey) return;
      sheetKey = key;
      let html = '';
      if (state.phase === 'pick') {
        const dream = pd.step === 'dream';
        const list = dream ? pd.dreams : pd.jobs;
        html = `<h3>${dream ? '🎓 Pick your dream job' : '✨ Choose your path'}</h3>
          <p class="lp-sub">${dream ? `Pays more — but only after Graduation. ${L.STUDENT_LOANS} student loans.` : 'Start working now (paid from day one) — or go to college.'}</p>
          <div class="lp-jcs">${list.map((o, i) => jobCard(o, i, 'down')).join('')}</div>
          ${dream ? '<button class="lp-alt ghost" data-i="3">← Back to the job offers</button>'
            : `<button class="lp-alt" data-i="3"><span>🎓</span><span><b>Go to college</b><small>Dream job later · higher salary · student loans</small></span></button>`}`;
      } else {
        const opt = (o, i, body, val = '', cls = '') => `<button class="lp-opt ${cls}" data-i="${i}"><span class="lp-oi">${o.icon || '🚪'}</span><span class="lp-on">${body}</span>${val ? `<span class="lp-ov">${val}</span>` : ''}</button>`;
        let opts = '';
        if (pd.kind === 'wedding' || pd.kind === 'fork') {
          opts = pd.options.map((o, i) => opt(o, i, `<b>${esc(o.name)}</b><small>${esc(o.note)}</small>`, '', 'lp-route')).join('');
        } else if (pd.kind === 'career') {
          html = `<h3>${esc(pd.title)}</h3><p class="lp-sub">${esc(pd.text)}</p><div class="lp-jcs">${pd.options.map((o, i) => jobCard(o, i, `down ${o.keep ? 'keep' : ''}`)).join('')}</div>`;
        } else if (pd.kind === 'house') {
          const back = p.house ? p.house.price : 0;
          opts = pd.options.map((o, i) => {
            if (o.skip) return opt({ icon: '🚪' }, i, `<b>${p.house ? `Keep the ${esc(p.house.name)}` : 'Not now'}</b><small>${p.house ? `worth ${L.fmt(p.house.worth)} at the end` : 'keep renting for now'}</small>`, '', 'keep');
            const loans = Math.ceil(Math.max(0, o.price - back - p.cash) / L.LOAN);
            const tag = loans ? `<em class="lp-loan">${loans} loan${loans > 1 ? 's' : ''}</em>` : '<em class="lp-ok">affordable</em>';
            return opt(o, i, `<b>${esc(o.name)}</b><small>worth <span class="${o.worth >= o.price ? 'up' : 'down'}">${L.fmt(o.worth)}</span> at the end · ${tag}</small>`, L.fmt(o.price));
          }).join('');
        }
        if (!html) html = `<h3>${esc(pd.title)}</h3><p class="lp-sub">${esc(pd.text)}</p><div class="lp-opts">${opts}</div>`;
      }
      sheet.innerHTML = `${html}<p class="lp-mine"><span class="lp-av" style="--pc:${color(state.current)}">${initial(p)}</span> ${L.fmt(p.cash)} cash${p.loans ? ` · ${p.loans} loan${p.loans > 1 ? 's' : ''}` : ''}${p.career ? ` · ${p.career.icon} ${esc(p.career.name)}` : ''}</p>`;
      const fresh = sheetBg.classList.contains('hidden');
      sheetBg.classList.remove('hidden');
      if (fresh) { sheet.classList.remove('pop'); void sheet.offsetWidth; sheet.classList.add('pop'); }
      // deal the cards face-down, then flip them one by one
      sheet.querySelectorAll('.lp-jc.down').forEach((c, i) => later(() => c.classList.remove('down'), 260 + i * 230));
    }
    sheet.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b || !state || !['choose', 'pick'].includes(state.phase) || state.current !== api.mySeat() || waiting) return;
      if (b.classList.contains('down')) return;
      waiting = Date.now();
      api.act({ type: 'choose', i: Number(b.dataset.i) });
      const flipStep = state.phase === 'pick' && Number(b.dataset.i) === 3;
      if (!flipStep) { closeSheet(); sheetKey = state.phase === 'pick' ? `pick:${state.dealNo}:${state.pending.step}` : `ch:${state.eventNo}`; }
      render();
      later(() => { if (waiting && Date.now() - waiting > 7900) { waiting = 0; sheetKey = ''; render(); } }, 8000);
    });

    const doSpin = () => {
      if (!state || state.phase !== 'turn' || state.current !== api.mySeat() || waiting) return;
      waiting = Date.now();
      render();
      api.act({ type: 'spin' });
      later(() => { if (waiting && Date.now() - waiting > 7900) { waiting = 0; render(); } }, 8000);
    };
    spinBtn.addEventListener('click', doSpin);
    q('.lp-wheel').addEventListener('click', doSpin);

    // ---------- life story panels + timeline ----------
    lives.addEventListener('click', (e) => {
      const c = e.target.closest('.lp-life');
      if (!c) return;
      tlSeat = Number(c.dataset.i);
      renderTimeline();
      tlBg.classList.remove('hidden');
    });
    tlBg.addEventListener('click', (e) => { if (e.target === tlBg || e.target.closest('.lp-tl-x')) { tlBg.classList.add('hidden'); tlSeat = -1; } });
    function renderTimeline() {
      if (tlSeat < 0 || !state) return;
      const p = state.players[tlSeat];
      if (!p) return;
      const st = L.stage(p);
      const rows = [
        ['💵 Cash', L.fmt(p.cash)],
        [`${p.house ? p.house.icon : '🏠'} Home`, p.house ? `${esc(p.house.name)} · ${L.fmt(p.house.worth)}` : '—'],
        ['❤️ Family', L.familyBonus(p) ? `${famText(p)} · ${L.fmt(L.familyBonus(p))}` : '—'],
        ['🏦 Loans', p.loans ? `${p.loans} · −${L.fmt(p.loans * L.LOAN_REPAY).slice(0)}` : '—'],
      ];
      tl.innerHTML = `<button class="lp-tl-x" aria-label="Close">✕</button>
        <div class="lp-tl-h"><span class="lp-av big" style="--pc:${color(tlSeat)}">${initial(p)}</span><div><b>${esc(p.name)}</b><small>${st.icon} ${st.name} · age ${L.ageAt(p.pos)}${p.career ? ` · ${p.career.icon} ${esc(p.career.name)} ${L.fmt(p.career.salary)}` : ''}</small></div></div>
        <table class="lp-tl-w">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}<tr class="tot"><td>Net worth</td><td>${L.fmt(L.netWorth(p))}</td></tr></table>
        <ol class="lp-tl-list">${p.story.length ? p.story.map((m) => `<li><span class="lp-tl-a">${m.a}</span><span class="lp-tl-e">${m.e}</span><span>${esc(m.t)}</span></li>`).join('') : '<li><span class="lp-tl-a">18</span><span class="lp-tl-e">🌱</span><span>The story is just beginning…</span></li>'}</ol>`;
    }
    function renderLives() {
      const me = api.mySeat();
      if (lives.children.length !== state.players.length) {
        lives.innerHTML = state.players.map((p, i) => `<div class="lp-life" data-i="${i}" style="--pc:${color(i)}">
          <div class="lp-lh"><span class="lp-av"></span><span class="lp-nm"></span><span class="lp-cash"></span></div>
          <div class="lp-ln lp-st"></div><div class="lp-ln lp-job"></div><div class="lp-ln lp-hf"></div><div class="lp-ln lp-ms"></div></div>`).join('');
        lives.classList.toggle('few', state.players.length <= 2);
      }
      state.players.forEach((p, i) => {
        const c = lives.children[i];
        const st = L.stage(p);
        c.classList.toggle('active', i === state.current && !['finale', 'over'].includes(state.phase));
        c.classList.toggle('away', !api.isAlive(p.pid));
        c.querySelector('.lp-av').textContent = (p.name || '?').trim().charAt(0).toUpperCase() || '?';
        c.querySelector('.lp-nm').textContent = p.name;
        c.classList.toggle('me', i === me);
        c.querySelector('.lp-cash').textContent = L.fmt(p.cash);
        c.querySelector('.lp-st').textContent = `${st.icon} ${st.name} · age ${L.ageAt(p.pos)}`;
        c.querySelector('.lp-job').innerHTML = p.career ? `${p.career.icon} ${esc(p.career.name)} <b>${L.fmt(p.career.salary)}</b>${p.student ? ' <em>⏳</em>' : ''}` : '<span class="lp-dim">Choosing a path…</span>';
        const hf = `${p.house ? p.house.icon + ' ' : ''}${famText(p)}${p.loans ? ` <span class="lp-dim">· ${p.loans} loan${p.loans > 1 ? 's' : ''}</span>` : ''}`;
        c.querySelector('.lp-hf').innerHTML = hf || '<span class="lp-dim">no home · no family yet</span>';
        const m = p.story[p.story.length - 1];
        c.querySelector('.lp-ms').textContent = m ? `Age ${m.a} — ${m.t}` : 'Age 18 — Life begins';
      });
      if (tlSeat >= 0) renderTimeline();
    }

    // ---------- finale ----------
    function recap(p, i) {
      const t = state.finale.titles[i];
      const lines = [
        p.career ? `${p.career.icon} ${esc(p.career.name)} · ${L.fmt(p.career.salary)}` : '',
        p.house ? `${p.house.icon} ${esc(p.house.name)} (${L.fmt(p.house.worth)})` : '🏠 Renter for life',
        famText(p) ? `${famText(p)} family bonus ${L.fmt(L.familyBonus(p))}` : '🧍 Solo adventurer',
        p.best ? `${p.best.e} Best moment: ${esc(p.best.t)} ${L.signed(p.best.v)}` : '',
        p.loans ? `🏦 ${p.loans} loans (−${L.fmt(p.loans * L.LOAN_REPAY)})` : '🏦 Debt-free!',
      ].filter(Boolean);
      return { t, lines };
    }
    function renderFinale() {
      const f = state.finale;
      if (!f) { finale.classList.add('hidden'); return; }
      finale.classList.remove('hidden');
      const over = state.phase === 'over';
      if (finaleShown === f.revealed && finale.dataset.over === String(over)) return;
      const fresh = finaleShown !== f.revealed;
      finaleShown = f.revealed;
      finale.dataset.over = String(over);
      const shown = f.order.slice(0, f.revealed);
      const latest = shown[shown.length - 1];
      const items = shown.map((i) => {
        const p = state.players[i];
        const { t, lines } = recap(p, i);
        const win = over && (state.winners || []).includes(i);
        const big = i === latest && !over;
        return `<div class="lp-fi ${big ? 'big' : ''} ${win ? 'win' : ''}" data-i="${i}" style="--pc:${color(i)}">
          <div class="lp-fi-h"><span class="lp-av">${initial(p)}</span><span class="lp-fi-n"><b>${esc(p.name)}</b><em>${t.icon} ${t.title}</em></span><span class="lp-fi-w" data-w="${L.netWorth(p)}">${L.fmt(L.netWorth(p))}</span>${win ? '<span class="lp-crown">👑</span>' : ''}</div>
          ${big ? `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}</div>`;
      }).reverse().join('');
      const left = f.order.length - f.revealed;
      finale.innerHTML = `<div class="lp-fh">🌅 Life stories${left ? ` <small>${left} to go…</small>` : over ? ' <small>the end</small>' : ''}</div>${items || '<div class="lp-fwait">Everyone has retired… gathering the photo albums 📸</div>'}`;
      if (fresh && latest != null && !over) {
        const w = finale.querySelector('.lp-fi.big .lp-fi-w');
        if (w) {
          const to = Number(w.dataset.w);
          const t0 = performance.now();
          const step = (t) => {
            const x = Math.min(1, (t - t0) / 1500);
            w.textContent = L.fmt(Math.round((to * (1 - Math.pow(1 - x, 3))) / 1000) * 1000);
            if (x < 1) { const r = requestAnimationFrame(step); rafs.add(r); }
          };
          const r = requestAnimationFrame(step); rafs.add(r);
        }
      }
      finale.scrollTop = 0;
    }

    // ---------- render ----------
    function teaser(cur) {
      if (['finale', 'over'].includes(state.phase)) return '🌅 Everyone made it to retirement';
      if (state.phase === 'deal' || state.phase === 'pick') return '✨ Every life starts with a choice…';
      if (state.phase === 'move' && Date.now() < animUntil) return `🎡 ${state.current === api.mySeat() ? 'You spin' : `${cur.name} spins`}…`;
      if (state.phase === 'turn') {
        const up = L.upcoming(cur);
        return up.length ? `Ahead: ${up.map((u) => `${u.icon} ${u.label}`).join(' · ')}` : '🌅 Retirement is close!';
      }
      const sp = L.BOARD[cur.pos];
      const z = L.ZONES.find((zz) => zz.key === sp.zone);
      return `${z.icon} ${z.name} · age ${L.ageAt(cur.pos)}`;
    }

    function render() {
      if (!state) return;
      const me = api.mySeat();
      const cur = state.players[state.current];
      const mine = state.current === me;
      const ended = ['finale', 'over'].includes(state.phase);
      renderLives();
      const picking = !state.started;
      q('.turn-label').textContent = ended ? 'Life stories' : picking ? (mine && state.phase !== 'show' ? 'Choose your path' : `${cur.name} chooses a path`) : (mine ? 'Your turn' : `${cur.name}’s turn`);
      q('.lp-tpl').textContent = state.phase === 'over' ? 'Top worth' : ended ? 'Revealed' : 'Cash';
      q('.turn-points strong').textContent = state.phase === 'over' ? L.fmt(Math.max(...state.players.map(L.netWorth)))
        : ended ? `${state.finale.revealed}/${state.players.length}` : L.fmt(cur.cash);
      q('.lp-teaser').textContent = teaser(cur);

      board.querySelectorAll('.lp-tile.here').forEach((t) => t.classList.remove('here'));
      if (!ended && animSeat < 0 && state.phase !== 'deal' && state.phase !== 'pick') tileEl(cur.pos)?.classList.add('here');
      layoutPawns();

      const animating = Date.now() < animUntil;
      spinBtn.disabled = !(mine && state.phase === 'turn' && !waiting);
      q('.lp-wheel').classList.toggle('ready', mine && state.phase === 'turn' && !waiting);
      spinBtn.textContent = state.phase === 'move' && animating ? '…' : 'SPIN';

      let hint = '';
      if (state.phase === 'deal' || state.phase === 'pick') hint = mine ? 'Pick a job card — or go to college.' : `${cur.name} is choosing a path…`;
      else if (state.phase === 'turn') hint = mine ? 'Tap SPIN — what will life bring?' : api.isAlive(cur.pid) ? `Waiting for ${cur.name} to spin…` : `Waiting for ${cur.name} to come back…`;
      else if (state.phase === 'move') hint = animating ? `${mine ? 'You' : cur.name} spun… ` : `${mine ? 'You' : cur.name} spun a ${state.move.value}${state.move.path.length < state.move.value ? ' — stopped early!' : '!'}`;
      else if (state.phase === 'choose') {
        const what = { career: 'a career', house: 'a home', wedding: 'a life partner… or not', fork: 'a road' }[state.pending.kind] || 'something';
        hint = mine ? (animating ? '' : 'Make your choice.') : `${cur.name} is choosing ${what}…`;
      } else if (state.phase === 'show' && state.event) hint = `${state.event.icon} ${state.event.title}${state.event.delta ? ' ' + L.signed(state.event.delta) : ''}`;
      else if (state.phase === 'finale') hint = state.finale.revealed ? `${state.players[state.finale.order[state.finale.revealed - 1]].name}’s life story` : 'Gathering the life stories…';
      else if (state.phase === 'over') {
        const w = (state.winners || []).map((i) => state.players[i].name).join(' & ');
        hint = `${w} lived the richest life: ${L.fmt(Math.max(...state.players.map(L.netWorth)))}!`;
      }
      q('.hint').textContent = hint;

      // choices: only the chooser sees the cards; everyone else gets a "thinking" card
      const choosing = state.phase === 'pick' || state.phase === 'choose';
      if (choosing && mine && !animating && (!waiting || sheetKey)) openSheet();
      else if (!(choosing && mine) && !sheetBg.classList.contains('hidden')) closeSheet();
      if (choosing && !mine && !animating) {
        if (state.phase === 'pick') showWaitCard(`pick${state.dealNo}`, '🤔', `${cur.name} is choosing a path`, 'Three job cards… or college?');
        else showWaitCard(`ch${state.eventNo}`, state.event?.icon || '🤔', state.event?.title || 'Deciding…', `${cur.name} is choosing ${({ career: 'a career', house: 'a home', wedding: 'between love and freedom', fork: 'a road' })[state.pending.kind] || ''}…`);
      } else if (cardMode.startsWith('wait') && !choosing) hideCard();
      if (state.phase === 'deal' && cardMode.startsWith('wait')) { /* keep */ }

      renderFinale();
      el.classList.toggle('lp-ended', ended);
    }

    return {
      update(next) {
        const old = state;
        state = next;
        if (!old || next.moveNo !== old.moveNo || next.eventNo !== old.eventNo || next.phase !== old.phase || next.pending?.step !== old.pending?.step) waiting = 0;
        ensurePawns();
        if (lastMoveNo === null) {
          lastMoveNo = next.move?.no ?? 0;
          lastEventNo = next.event?.no ?? 0;
          if (next.move) spinWheel(next.move.value, false);
          if (next.finale) finaleShown = -1;
          render();
          scrollToSpace(next.players[next.current].pos, false);
          return;
        }
        if (next.move && next.move.no !== lastMoveNo) {
          lastMoveNo = next.move.no;
          hideCard();
          animateMove(next.move);
        }
        if (next.event && next.event.no !== lastEventNo) {
          lastEventNo = next.event.no;
          if (next.event.kind !== 'wait') later(() => showEventCard(next.event), Math.max(0, animUntil - Date.now()));
        }
        render();
        if (old && old.current !== next.current && !['finale', 'over'].includes(next.phase)) {
          if (Date.now() >= animUntil) scrollToSpace(next.players[next.current].pos);
          const nm = next.players[next.current].name;
          if (next.phase === 'turn' || next.phase === 'deal') turnPill(q('.turn-banner'), next.current === api.mySeat() ? 'Your turn' : `${nm}’s turn`, 200);
          const c = lives.children[next.current];
          if (c) lives.scrollTo({ left: c.offsetLeft - (lives.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' });
        }
        if (old && old.phase !== 'finale' && next.phase === 'finale') { hideCard(); banner(q('.banner'), 'ALL RETIRED!', 'bank', 1600); }
        if (['pick', 'choose'].includes(next.phase)) later(() => render(), Math.max(0, animUntil - Date.now()) + 40);
      },
      refresh: () => render(),
      destroy() { for (const t of timers) clearTimeout(t); for (const r of rafs) cancelAnimationFrame(r); clearTimeout(card._t); el.remove(); },
    };
  },
};
