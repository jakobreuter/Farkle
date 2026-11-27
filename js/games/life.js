import * as L from '../engines/life.js';
import { h, esc, banner, turnPill } from '../ui.js';

const COLORS = ['#e8453c', '#2f8fe0', '#f4c430', '#9b59d0', '#18b8a0', '#f08a24'];
const TILE = 44;
const CELL = 52;
const AISLE = 10;
const ROWH = 56;
const BW = CELL * 6 + AISLE; // 322
const ZONE_BG = { campus: 'rgba(120,175,255,.17)', city: 'rgba(196,150,255,.17)', mid: 'rgba(150,235,140,.15)', coast: 'rgba(90,220,230,.17)', golden: 'rgba(255,170,90,.2)' };
const ZONE_ART = { campus: '🏫', city: '🌆', mid: '🌳', coast: '🌴', golden: '⛱️' };
const OFFSETS = {
  1: [[0, 2]],
  2: [[-10, 2], [10, 2]],
  3: [[-11, -6], [11, -6], [0, 10]],
  4: [[-11, -7], [11, -7], [-11, 10], [11, 10]],
  5: [[-13, -8], [0, -8], [13, -8], [-7, 10], [7, 10]],
  6: [[-13, -8], [0, -8], [13, -8], [-13, 10], [0, 10], [13, 10]],
};

/** pixel geometry for a board: zone bands with a header (and lane captions) above their rows */
function geometry(b) {
  const rowY = [];
  const box = {};
  let y = 8;
  for (let r = 0; r < b.rows; r++) {
    const z = b.zones.find((zz) => zz.rows[0] === r);
    if (z) { box[z.key] = { top: y }; y += 24 + (z.lanes ? 14 : 0); }
    rowY[r] = y + ROWH / 2;
    y += ROWH;
    const ze = b.zones.find((zz) => zz.rows[1] === r);
    if (ze) { box[ze.key].bottom = y + 2; y += 12; }
  }
  return { rowY, box, height: y };
}
const cx = (col) => col * CELL + CELL / 2 + (col >= 3 ? AISLE : col > 2 ? AISLE / 2 : 0);

const SPACE_HELP = [
  ['payday', 'salary + side hustles (also when you pass). Land here with a home to sell it'],
  ['cash', 'a life card — often a decision: invest, travel, study, start a hustle, insure…'],
  ['action', 'draw a secret action card (hold up to 3)'],
  ['career', 'two job offers — take one or keep yours'],
  ['family', 'kids if you married, pets if you stayed footloose'],
  ['house', 'buy one of three homes at today’s market price, or sell yours'],
  ['stop', 'you always stop: Graduation, Wedding, the Fork, Second act'],
  ['retire', 'the finish — earlier retirees get a bigger farewell gift'],
];
const ACTION_HELP = Object.values(L.ACTIONS).map((a) => `${a.icon} <b>${a.name}</b>`).join(' · ');

const rulesHTML = () => `
  <ol>
    <li><b>Choose your path</b>: one of three dealt jobs (paid right away) or <b>college</b> + a dream job (pays more, but only after <b>Graduation</b>; ${L.STUDENT_LOANS} student loans). With secret goals on, keep one of two <b>goal cards</b> — only you can see it.</li>
    <li>On your turn you may play <b>one action card</b>, then <b>spin</b> 1–10. Stop spaces halt you even with steps left. Every game shuffles the decks and the board, and the mid-life fork and the Adventure Coast change.</li>
    <li><b>Life cards</b> are often decisions: invest (a gamble), travel, night school (a raise), a side hustle (extra money every payday), insurance (cancels your next disaster)…</li>
    <li><b>Houses</b> follow a market that moves every round (see the ticker). Buy low, sell high: sell on a house space or when you land on a payday.</li>
    <li><b>Action cards</b>: ${ACTION_HELP}. Lawyer Up blocks the next card played on you automatically.</li>
    <li>Cash below zero takes automatic loans of ${L.fmt(L.LOAN)} (${L.fmt(L.LOAN_REPAY)} each at the end).</li>
    <li><b>Final worth</b> = cash + home value + family (partner ${L.fmt(L.PARTNER_BONUS)}, kid ${L.fmt(L.KID_BONUS)}, pet ${L.fmt(L.PET_BONUS)}) − loans + your <b>secret goal bonus</b>. The life stories are revealed one by one at the end — richest life wins!</li>
  </ol>
  <table>${SPACE_HELP.map(([t, d]) => `<tr><td>${L.TYPES[t].icon} ${L.TYPES[t].name}</td><td style="text-align:left;font-weight:400">${d}</td></tr>`).join('')}</table>
  <table>${Object.entries(L.GOALS).map(([, g]) => `<tr><td>${g.icon} ${g.name}</td><td style="text-align:left;font-weight:400">${g.text} <b>${g.bonus}</b></td></tr>`).join('')}</table>`;

const initial = (p) => esc((p.name || '?').trim().charAt(0).toUpperCase() || '?');
const famText = (p) => [p.partner ? '❤️' : '', p.kids ? '👶'.repeat(Math.min(p.kids, 4)) : '', ['', '🐶', '🐶🐱', '🐶🐱🦜'][p.pets] || ''].join('');
const famDots = (p) => (p.partner ? '<i class="lp-dp"></i>' : '') + '<i class="lp-dk"></i>'.repeat(p.kids) + '<i class="lp-dpet"></i>'.repeat(p.pets);

function effNote(s, eff) {
  const out = [];
  if (eff.cash) out.push(eff.cash < 0 ? `−$${-eff.cash}k` : `+${L.fmt(L.sc(s, eff.cash))}`);
  if (eff.gamble) out.push(`${eff.gamble.p}% chance of +${L.fmt(L.sc(s, eff.gamble.win))}`);
  if (eff.raise) out.push(`salary +$${eff.raise}k`);
  if (eff.hustle) out.push(`+$${eff.hustle}k every payday`);
  if (eff.insure) out.push('covers your next disaster');
  if (eff.trip) out.push('✈️ a trip');
  if (eff.pet) out.push('🐾 a pet');
  if (eff.action) out.push('🎴 an action card');
  return out.join(' · ') || 'nothing changes';
}

function jobCard(o, i, extra = '') {
  return `<button class="lp-jc ${extra}" data-i="${i}">
    <span class="lp-jc-in"><span class="lp-jc-back"><b>LIFE</b><i>✦</i></span>
    <span class="lp-jc-face"><span class="lp-jc-e">${o.icon}</span><b class="lp-jc-n">${esc(o.name)}</b><span class="lp-jc-s">${L.fmt(o.salary)}<small>/payday</small></span><span class="lp-jc-f">${esc(o.flavor)}</span></span></span>
  </button>`;
}
function goalCard(key, i, extra = '') {
  const g = L.GOALS[key];
  return `<button class="lp-jc lp-gc ${extra}" data-i="${i}">
    <span class="lp-jc-in"><span class="lp-jc-back"><b>GOAL</b><i>🎯</i></span>
    <span class="lp-jc-face"><span class="lp-jc-e">${g.icon}</span><b class="lp-jc-n">${esc(g.name)}</b><span class="lp-jc-f">${esc(g.text)}</span><span class="lp-jc-s">${esc(g.bonus)}</span></span></span>
  </button>`;
}

export default {
  id: 'life',
  name: 'Life Path',
  emoji: '🛣️',
  blurb: 'Pick a path, chase a secret goal, spin through life.',
  minPlayers: 2,
  maxPlayers: 6,
  options: L.OPTIONS,

  setup(players, opts, { first }) {
    return L.newGame(players, first % players.length, opts);
  },

  randomFor(s, a, seat) {
    if (a.type === 'spin' && seat === s.current && s.phase === 'turn') return [10];
    if (['setup', 'deal', 'arrive', 'next'].includes(a.type) && seat === -1) return L.systemRanges(s);
    if (a.type === 'choose' && seat === s.current) return L.chooseRanges(s, a.i);
    return null;
  },

  apply(s, a, seat, { now, rand }) {
    if (['setup', 'deal', 'arrive', 'next', 'reveal', 'end'].includes(a.type)) {
      if (seat !== -1) throw new Error('system only');
      return L.applyAction(s, a, rand, now);
    }
    if (seat !== s.current) throw new Error('not your turn');
    if (a.type === 'spin') return L.applyAction(s, a, rand, now);
    if (a.type === 'choose') return L.applyAction(s, { type: 'choose', i: a.i }, rand, now);
    if (a.type === 'play') return L.applyAction(s, { type: 'play', card: a.card, target: a.target }, null, now);
    throw new Error('unknown action');
  },

  tick(s, { now }) {
    return L.due(s, now);
  },

  botDelay: 1300,
  bot(s, seat) {
    if (s.current !== seat) return null;
    if (s.phase === 'turn') return L.botPlay(s, seat) || { type: 'spin' };
    if (s.phase === 'choose' || s.phase === 'pick') return { type: 'choose', i: L.botChoice(s, seat) };
    return null;
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: s.finale ? s.finale.worth[i] : L.netWorth(s, p), win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game life">
      <section class="lp-lives"></section>
      <section class="table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points"><span class="lp-tpl">Cash</span> <strong>$0k</strong></div></div>
        <div class="lp-teaser"></div>
        <div class="lp-market"></div>
        <div class="lp-stage">
          <div class="lp-viewport"><div class="lp-board"></div></div>
          <div class="lp-card hidden"></div>
          <div class="lp-finale hidden"></div>
        </div>
        <div class="lp-dock">
          <div class="lp-wheel"><div class="lp-pointer"></div><svg class="lp-wheel-svg" viewBox="-50 -50 100 100"></svg><div class="lp-hub"></div></div>
          <div class="lp-side"><button class="btn primary big lp-spin">SPIN</button><div class="lp-mybar"></div></div>
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
    const market = q('.lp-market');
    const mybar = q('.lp-mybar');

    let state = null;
    let B = null; // current board
    let G = null; // its geometry
    let boardKey = '';
    let waiting = 0;
    let animSeat = -1;
    let animUntil = 0;
    let wheelRot = 0;
    let lastMoveNo = null;
    let lastEventNo = null;
    let sheetKey = '';
    let cardMode = '';
    let finaleShown = '';
    let tlSeat = -1;
    let playing = null; // { card } while choosing a target
    let barKey = '';
    let marketKey = '';
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const rafs = new Set();
    const color = (i) => COLORS[i % COLORS.length];
    const cy = (row) => G.rowY[row];
    const age = (id) => L.ageAt(B, id);

    // ---------- board (rebuilt when this game's layout arrives) ----------
    function buildBoardDom() {
      B = L.boardOf(state);
      G = geometry(B);
      const road = [];
      for (const sp of B.spaces) {
        for (const n of sp.next) {
          const b = B.spaces[n];
          const x1 = cx(sp.col); const y1 = cy(sp.row); const x2 = cx(b.col); const y2 = cy(b.row);
          const far = Math.abs(sp.col - b.col) > 1;
          road.push(far ? `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}` : `M${x1} ${y1} L${x2} ${y2}`);
        }
      }
      const zones = B.zones.map((z) => {
        const bx = G.box[z.key];
        const ages = B.spaces.filter((s) => s.zone === z.key && s.t !== 'start').map((s) => age(s.id));
        const lanes = z.lanes ? z.lanes.map((lb, k) => `<text x="${(cx(k * 3) + cx(k * 3 + 2)) / 2}" y="${bx.top + 34}" class="lp-lane">${lb}</text>`).join('') : '';
        return [`<rect x="2" y="${bx.top}" width="${BW - 4}" height="${bx.bottom - bx.top}" rx="14" fill="${ZONE_BG[z.key]}" class="lp-zone"/>
          <text x="${BW - 8}" y="${bx.bottom - 8}" class="lp-art">${ZONE_ART[z.key]}</text>`,
        `<text x="12" y="${bx.top + 17}" class="lp-zt">${z.icon} ${z.name.toUpperCase()}</text>
          <text x="${BW - 12}" y="${bx.top + 17}" class="lp-za">age ${Math.min(...ages)}–${Math.max(...ages)}</text>${lanes}`];
      });
      board.style.width = `${BW}px`;
      board.style.height = `${G.height}px`;
      board.innerHTML = `<svg class="lp-road" width="${BW}" height="${G.height}" viewBox="0 0 ${BW} ${G.height}">
          ${zones.map((z) => z[0]).join('')}
          ${road.map((d) => `<path d="${d}" class="lp-road-base"/>`).join('')}
          ${road.map((d) => `<path d="${d}" class="lp-road-line"/>`).join('')}
          ${zones.map((z) => z[1]).join('')}
        </svg>
        ${B.spaces.map((sp) => `<div class="lp-tile t-${sp.t} ${sp.pool === 'risk' ? 'risk' : ''} ${sp.pool === 'travel' && sp.t === 'cash' ? 'trav' : ''} ${sp.stop ? 's-' + sp.stop : ''}" data-id="${sp.id}" style="left:${cx(sp.col) - TILE / 2}px;top:${cy(sp.row) - TILE / 2}px"><span class="lp-ic">${L.spaceIcon(sp)}</span><span class="lp-tg">${L.spaceTag(sp)}</span></div>`).join('')}
        <div class="lp-pawns"></div>`;
    }
    const pawnLayer = () => board.querySelector('.lp-pawns');
    const tileEl = (id) => board.querySelector(`.lp-tile[data-id="${id}"]`);

    // ---------- wheel ----------
    const WEDGE = ['#e8453c', '#f4c430', '#2f8fe0', '#18b8a0', '#9b59d0'];
    wheelSvg.innerHTML = Array.from({ length: 10 }, (_, k) => {
      const a0 = (k * 36 - 90) * Math.PI / 180; const a1 = ((k + 1) * 36 - 90) * Math.PI / 180;
      const am = ((k + 0.5) * 36 - 90) * Math.PI / 180;
      const pt = (a, r) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
      const tx = (Math.cos(am) * 35).toFixed(1); const ty = (Math.sin(am) * 35).toFixed(1);
      const [dx, dy] = pt(a0, 45).split(' ');
      return `<path d="M0 0 L${pt(a0, 48)} A48 48 0 0 1 ${pt(a1, 48)} Z" fill="${WEDGE[k % 5]}" stroke="#fffaf0" stroke-width="1.2"/>
        <circle cx="${dx}" cy="${dy}" r="1.6" fill="#fffaf0"/>
        <text x="${tx}" y="${ty}" transform="rotate(${(k + 0.5) * 36} ${tx} ${ty})" class="lp-wn">${k + 1}</text>`;
    }).join('') + '<circle r="48" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1"/>';
    const setWheel = (deg) => { wheelSvg.style.transform = `rotate(${deg}deg)`; };
    function spinWheel(value, animate, shown = value) {
      for (const r of rafs) cancelAnimationFrame(r);
      rafs.clear();
      const center = (value - 0.5) * 36;
      const target = (360 - center) % 360;
      const cur = ((wheelRot % 360) + 360) % 360;
      let delta = (target - cur + 360) % 360;
      if (!animate) { wheelRot += delta; setWheel(wheelRot); hub.textContent = shown; return; }
      delta += 360 * 4;
      const start = wheelRot;
      wheelRot += delta;
      const T = L.SPIN_MS - 120;
      const t0 = performance.now();
      let lastWedge = Math.floor(start / 36);
      hub.textContent = '';
      hub.classList.remove('pop');
      const step = (t) => {
        const x = Math.min(1, (t - t0) / T);
        const rot = start + delta * (1 - Math.pow(1 - x, 4));
        setWheel(rot);
        const w = Math.floor(rot / 36);
        if (w !== lastWedge) { lastWedge = w; pointer.classList.remove('tick'); void pointer.offsetWidth; pointer.classList.add('tick'); }
        if (x < 1) { const r = requestAnimationFrame(step); rafs.add(r); } else {
          hub.textContent = shown;
          hub.classList.remove('pop'); void hub.offsetWidth; hub.classList.add('pop');
        }
      };
      const r = requestAnimationFrame(step);
      rafs.add(r);
    }

    // ---------- pawns ----------
    function ensurePawns() {
      const layer = pawnLayer();
      if (layer.children.length === state.players.length) return;
      layer.innerHTML = state.players.map((p, i) => `<div class="lp-pawn" style="--pc:${color(i)}"><b></b><span class="lp-fam"></span></div>`).join('');
    }
    function placePawn(i, id, off, hop) {
      const pw = pawnLayer().children[i];
      const sp = B.spaces[id];
      pw.style.transform = `translate(${cx(sp.col) + off[0]}px, ${cy(sp.row) + off[1]}px)`;
      pw.querySelector('b').textContent = age(id);
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
        const pw = pawnLayer().children[i];
        pw.classList.toggle('cur', i === state.current && !['finale', 'over'].includes(state.phase));
        pw.classList.toggle('moving', i === animSeat);
        pw.querySelector('.lp-fam').innerHTML = famDots(p);
      });
    }
    function scrollToSpace(id, smooth = true) {
      const top = cy(B.spaces[id].row) - viewport.clientHeight / 2;
      viewport.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }
    function animateMove(mv) {
      const seat = mv.seat;
      animSeat = seat;
      animUntil = Date.now() + L.SPIN_MS + L.HOP_MS * mv.path.length;
      ensurePawns();
      placePawn(seat, mv.from, [0, 2]);
      spinWheel(mv.value, true, mv.steps > mv.value ? `${mv.value}+${mv.steps - mv.value}` : mv.value);
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
    function countTo(elm, to, ms = 900, signedFmt = true) {
      const t0 = performance.now();
      const step = (t) => {
        const x = Math.min(1, (t - t0) / ms);
        const v = Math.round((to * (1 - Math.pow(1 - x, 3))) / 1000) * 1000;
        elm.textContent = signedFmt ? L.signed(v) : L.fmt(v);
        if (x < 1) { const r = requestAnimationFrame(step); rafs.add(r); }
      };
      const r = requestAnimationFrame(step);
      rafs.add(r);
    }
    function hideCard() { card.classList.add('hidden'); cardMode = ''; clearTimeout(card._t); }
    function showEventCard(ev) {
      if (!ev || !state) return;
      const who = state.players[ev.seat];
      const me = api.mySeat();
      let text = ev.text;
      let big = `<div class="lp-c-e">${ev.icon}</div>`;
      if (ev.secret && ev.seat === me) { const A = L.ACTIONS[ev.secret]; text = `You draw ${A.icon} ${A.name}: ${A.text(state)}`; big = `<div class="lp-c-e">${A.icon}</div>`; }
      if (ev.card && ev.card.salary) big = `<div class="lp-c-job"><span>${ev.card.icon}</span><b>${esc(ev.card.name)}</b><em>${L.fmt(ev.card.salary)}/payday</em></div>`;
      else if (ev.card && ev.card.price) big = `<div class="lp-c-job"><span>${ev.card.icon}</span><b>${esc(ev.card.name)}</b><em>${L.fmt(ev.card.price)}</em></div>`;
      const tgt = ev.target != null ? `<div class="lp-c-vs"><span class="lp-av" style="--pc:${color(ev.seat)}">${initial(who)}</span> ➜ <span class="lp-av" style="--pc:${color(ev.target)}">${initial(state.players[ev.target])}</span></div>` : '';
      const d = ev.delta ? `<div class="lp-c-d ${ev.delta > 0 ? 'up' : 'down'}">&nbsp;</div>` : '';
      const raise = ev.raise ? `<div class="lp-c-r">Salary +${L.fmt(ev.raise)}!</div>` : '';
      card.innerHTML = `<div class="lp-c-in"><div class="lp-c-back"><b>LIFE</b><i>✦ ✦ ✦</i></div>
        <div class="lp-c-face k-${ev.kind}">
          <div class="lp-c-who"><span class="lp-av" style="--pc:${color(ev.seat)}">${initial(who)}</span>${esc(who.name)} · age ${age(who.pos)}</div>
          ${big}${tgt}<div class="lp-c-t">${esc(ev.title)}</div><div class="lp-c-x">${esc(text)}</div>${raise}${d}
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
    function showWaitCard(key, icon, title, text, backs = 3) {
      if (cardMode === `wait:${key}`) return;
      cardMode = `wait:${key}`;
      clearTimeout(card._t);
      card.className = 'lp-card wait';
      card.innerHTML = `<div class="lp-c-in"><div class="lp-c-face k-wait"><div class="lp-c-e">${icon}</div><div class="lp-c-t">${esc(title)}</div><div class="lp-c-x">${esc(text)}</div>
        <div class="lp-c-backs">${'<i></i>'.repeat(backs)}</div></div></div>`;
    }

    // ---------- sheets: choices and action cards ----------
    function closeSheet() { sheetBg.classList.add('hidden'); sheet.innerHTML = ''; sheetKey = ''; playing = null; }
    function sheetFrame(key, html) {
      if (key === sheetKey) return;
      sheetKey = key;
      const p = state.players[api.mySeat()];
      sheet.innerHTML = `${html}<p class="lp-mine"><span class="lp-av" style="--pc:${color(api.mySeat())}">${initial(p)}</span> ${L.fmt(p.cash)} cash${p.loans ? ` · ${p.loans} loan${p.loans > 1 ? 's' : ''}` : ''}${p.career ? ` · ${p.career.icon} ${esc(p.career.name)} ${L.fmt(p.career.salary)}` : ''}</p>`;
      const fresh = sheetBg.classList.contains('hidden');
      sheetBg.classList.remove('hidden');
      if (fresh) { sheet.classList.remove('pop'); void sheet.offsetWidth; sheet.classList.add('pop'); }
      sheet.querySelectorAll('.lp-jc.down').forEach((c, i) => later(() => c.classList.remove('down'), 260 + i * 230));
    }
    const opt = (icon, i, body, val = '', cls = '') => `<button class="lp-opt ${cls}" data-i="${i}"><span class="lp-oi">${icon}</span><span class="lp-on">${body}</span>${val ? `<span class="lp-ov">${val}</span>` : ''}</button>`;
    function openChoiceSheet() {
      const pd = state.pending;
      const p = state.players[state.current];
      if (state.phase === 'pick') {
        const step = pd.step;
        let html;
        if (step === 'goal') {
          html = `<h3>🎯 Pick your secret goal</h3><p class="lp-sub">Keep one. Nobody else sees it until the finale — achieve it for a big bonus.</p>
            <div class="lp-jcs two">${pd.goals.map((g, i) => goalCard(g, i, 'down')).join('')}</div>`;
        } else {
          const dream = step === 'dream';
          const list = dream ? pd.dreams : pd.jobs;
          html = `<h3>${dream ? '🎓 Pick your dream job' : '✨ Choose your path'}</h3>
            <p class="lp-sub">${dream ? `Pays more — but only after Graduation. ${L.STUDENT_LOANS} student loans.` : 'Start working now (paid from day one) — or go to college.'}</p>
            <div class="lp-jcs">${list.map((o, i) => jobCard(o, i, 'down')).join('')}</div>
            ${dream ? '<button class="lp-alt ghost" data-i="3">← Back to the job offers</button>'
              : '<button class="lp-alt" data-i="3"><span>🎓</span><span><b>Go to college</b><small>Dream job later · higher salary · student loans</small></span></button>'}`;
        }
        return sheetFrame(`pick:${state.dealNo}:${step}`, html);
      }
      let body = '';
      if (pd.kind === 'career') {
        body = `<div class="lp-jcs">${pd.options.map((o, i) => jobCard(o, i, `down ${o.keep ? 'keep' : ''}`)).join('')}</div>`;
      } else if (pd.kind === 'decision') {
        body = `<div class="lp-dec-e">${pd.icon}</div><div class="lp-opts">${pd.options.map((o, i) => opt(Object.keys(o.eff).length ? '👉' : '🙅', i, `<b>${esc(o.label)}</b><small>${effNote(state, o.eff)}</small>`, '', Object.keys(o.eff).length ? '' : 'keep')).join('')}</div>`;
      } else if (pd.kind === 'house') {
        const back = p.house ? L.houseValue(state, p.house) : 0;
        body = `<div class="lp-opts">${pd.options.map((o, i) => {
          if (o.skip) return opt('🚪', i, `<b>${p.house ? 'Keep my home' : 'Not now'}</b><small>${p.house ? 'it counts at market value at the end' : 'keep renting for now'}</small>`, '', 'keep');
          if (o.sell) return opt('🪧', i, `<b>Sell my ${esc(L.HOUSES[p.house.i].name)}</b><small>paid ${L.fmt(p.house.paid)} · ${o.price >= p.house.paid ? 'profit' : 'loss'} ${L.signed(o.price - p.house.paid)}</small>`, L.fmt(o.price), 'lp-route');
          const loans = Math.ceil(Math.max(0, o.price - back - p.cash) / L.LOAN);
          const m = state.market[o.type];
          const tag = loans ? `<em class="lp-loan">${loans} loan${loans > 1 ? 's' : ''}</em>` : '<em class="lp-ok">affordable</em>';
          return opt(o.icon, i, `<b>${esc(o.name)}</b><small>market ${m.v} <span class="${m.d >= 0 ? 'up' : 'down'}">${m.d > 0 ? '▲' : m.d < 0 ? '▼' : '•'}</span> · ${tag}</small>`, L.fmt(o.price));
        }).join('')}</div>`;
      } else {
        body = `<div class="lp-opts">${pd.options.map((o, i) => opt(o.icon, i, `<b>${esc(o.name)}</b><small>${esc(o.note)}</small>`, '', 'lp-route')).join('')}</div>`;
      }
      sheetFrame(`ch:${state.eventNo}`, `<h3>${esc(pd.title)}</h3><p class="lp-sub">${esc(pd.text)}</p>${body}`);
    }
    function openPlaySheet(k) {
      const me = api.mySeat();
      const key = state.players[me].hand[k];
      if (!key) return;
      const A = L.ACTIONS[key];
      playing = { card: k };
      let body;
      if (A.attack) {
        body = `<p class="lp-sub">Pick a player:</p><div class="lp-opts">${state.players.map((p, i) => (i === me ? '' : opt(`<span class="lp-av" style="--pc:${color(i)}">${initial(p)}</span>`, i, `<b>${esc(p.name)}</b><small>${p.career ? `${p.career.icon} ${esc(p.career.name)} ${L.fmt(p.career.salary)}` : ''}${p.retired ? ' · retired' : ''}</small>`, L.fmt(p.cash), 'lp-tgt'))).join('')}</div>`;
      } else body = `<div class="lp-opts">${opt(A.icon, 'self', `<b>Play it now</b><small>${esc(A.text(state))}</small>`)}</div>`;
      sheetKey = '';
      sheetFrame(`play:${k}:${key}`, `<h3>${A.icon} ${A.name}</h3><p class="lp-sub">${esc(A.text(state))}</p>${body}<button class="lp-alt ghost" data-x="1">Keep it for later</button>`);
    }
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { closeSheet(); render(); return; }
      const b = e.target.closest('[data-i]');
      if (!b || !state || waiting || state.current !== api.mySeat()) return;
      if (b.classList.contains('down')) return;
      if (playing) {
        if (state.phase !== 'turn') return;
        const a = { type: 'play', card: playing.card };
        if (b.dataset.i !== 'self') a.target = Number(b.dataset.i);
        waiting = Date.now();
        api.act(a);
        closeSheet();
        render();
        later(() => { if (waiting && Date.now() - waiting > 7900) { waiting = 0; render(); } }, 8000);
        return;
      }
      if (!['choose', 'pick'].includes(state.phase)) return;
      waiting = Date.now();
      api.act({ type: 'choose', i: Number(b.dataset.i) });
      const i = Number(b.dataset.i);
      const keepOpen = state.phase === 'pick' && (i === 3 || (state.opts.goals && state.pending.step !== 'goal'));
      if (!keepOpen) { closeSheet(); sheetKey = state.phase === 'pick' ? `pick:${state.dealNo}:${state.pending.step}` : `ch:${state.eventNo}`; }
      render();
      later(() => { if (waiting && Date.now() - waiting > 7900) { waiting = 0; sheetKey = ''; render(); } }, 8000);
    });
    sheetBg.addEventListener('click', (e) => { if (e.target === sheetBg && playing) { closeSheet(); render(); } });

    const doSpin = () => {
      if (!state || state.phase !== 'turn' || state.current !== api.mySeat() || waiting) return;
      waiting = Date.now();
      render();
      api.act({ type: 'spin' });
      later(() => { if (waiting && Date.now() - waiting > 7900) { waiting = 0; render(); } }, 8000);
    };
    spinBtn.addEventListener('click', doSpin);
    q('.lp-wheel').addEventListener('click', doSpin);
    mybar.addEventListener('click', (e) => {
      const c = e.target.closest('.lp-hc');
      if (!c || !state) return;
      const me = api.mySeat();
      const k = Number(c.dataset.k);
      const key = state.players[me]?.hand[k];
      if (!key) return;
      if (key === 'shield' || !(state.phase === 'turn' && state.current === me && !state.played && !waiting)) {
        api.toast?.(key === 'shield' ? '🛡️ Lawyer Up works by itself: it blocks the next card played on you.' : 'Play action cards on your turn, before you spin.');
        return;
      }
      openPlaySheet(k);
    });

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
      const me = api.mySeat();
      const st = L.stage(p);
      const hv = p.house ? L.houseValue(state, p.house) : 0;
      const rows = [
        ['💵 Cash', L.fmt(p.cash)],
        [`${p.house ? L.HOUSES[p.house.i].icon : '🏠'} Home`, p.house ? `${esc(L.HOUSES[p.house.i].name)} · ${L.fmt(hv)}` : '—'],
        ['❤️ Family', L.familyBonus(p) ? `${famText(p)} · ${L.fmt(L.familyBonus(p))}` : '—'],
        ['🏦 Loans', p.loans ? `${p.loans} · −${L.fmt(p.loans * L.LOAN_REPAY)}` : '—'],
        ['🧰 Hustles', p.hustle ? `+${L.fmt(p.hustle)}/payday` : '—'],
        ['☂️ Insured', p.insured ? 'yes' : '—'],
      ];
      let goal = '';
      if (state.opts.goals && p.goal) {
        if (tlSeat === me || state.phase === 'over' || state.phase === 'finale') {
          const g = L.GOALS[p.goal]; const gs = L.goalStatus(state, tlSeat);
          goal = `<div class="lp-tl-goal">🎯 <b>${g.icon} ${g.name}</b> — ${esc(g.text)} <em>${esc(gs.prog)} · ${g.bonus}</em></div>`;
        } else goal = '<div class="lp-tl-goal">🎯 Secret goal: <b>face down</b></div>';
      }
      const hand = state.opts.actions ? `<div class="lp-tl-goal">🎴 Action cards: <b>${tlSeat === me ? (p.hand.map((k) => `${L.ACTIONS[k].icon} ${L.ACTIONS[k].name}`).join(', ') || 'none') : `${p.hand.length} hidden`}</b></div>` : '';
      tl.innerHTML = `<button class="lp-tl-x" aria-label="Close">✕</button>
        <div class="lp-tl-h"><span class="lp-av big" style="--pc:${color(tlSeat)}">${initial(p)}</span><div><b>${esc(p.name)}</b><small>${st.icon} ${st.name} · age ${age(p.pos)}${p.career ? ` · ${p.career.icon} ${esc(p.career.name)} ${L.fmt(p.career.salary)}` : ''}</small></div></div>
        ${goal}${hand}
        <table class="lp-tl-w">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}<tr class="tot"><td>Net worth</td><td>${L.fmt(L.netWorth(state, p))}</td></tr></table>
        <ol class="lp-tl-list">${p.story.length ? p.story.map((m) => `<li><span class="lp-tl-a">${m.a}</span><span class="lp-tl-e">${m.e}</span><span>${esc(m.t)}</span></li>`).join('') : '<li><span class="lp-tl-a">18</span><span class="lp-tl-e">🌱</span><span>The story is just beginning…</span></li>'}</ol>`;
    }
    function renderLives() {
      const me = api.mySeat();
      if (lives.children.length !== state.players.length) {
        lives.innerHTML = state.players.map((p, i) => `<div class="lp-life" data-i="${i}" style="--pc:${color(i)}">
          <div class="lp-lh"><span class="lp-av"></span><span class="lp-nm"></span><span class="lp-chips"></span><span class="lp-cash"></span></div>
          <div class="lp-ln lp-st"></div><div class="lp-ln lp-job"></div><div class="lp-ln lp-hf"></div><div class="lp-ln lp-ms"></div></div>`).join('');
        lives.classList.toggle('few', state.players.length <= 2);
      }
      state.players.forEach((p, i) => {
        const c = lives.children[i];
        const st = L.stage(p);
        c.classList.toggle('active', i === state.current && !['finale', 'over'].includes(state.phase));
        c.classList.toggle('away', !api.isAlive(p.pid));
        c.classList.toggle('me', i === me);
        c.querySelector('.lp-av').textContent = (p.name || '?').trim().charAt(0).toUpperCase() || '?';
        c.querySelector('.lp-nm').textContent = p.name;
        const goalChip = state.opts.goals && p.goal ? (i === me || state.phase === 'over' ? `<i class="lp-chip">${L.GOALS[p.goal].icon}</i>` : '<i class="lp-chip down">🎯</i>') : '';
        const handChip = state.opts.actions && p.hand.length ? `<i class="lp-chip">🎴${p.hand.length}</i>` : '';
        const chips = goalChip + handChip + (p.insured ? '<i class="lp-chip">☂️</i>' : '');
        const ch = c.querySelector('.lp-chips');
        if (ch.innerHTML !== chips) ch.innerHTML = chips;
        c.querySelector('.lp-cash').textContent = L.fmt(p.cash);
        c.querySelector('.lp-st').textContent = `${st.icon} ${st.name} · age ${age(p.pos)}`;
        c.querySelector('.lp-job').innerHTML = p.career ? `${p.career.icon} ${esc(p.career.name)} <b>${L.fmt(p.career.salary)}</b>${p.student ? ' <em>⏳</em>' : ''}${p.hustle ? ` <em>+${L.fmt(p.hustle)}</em>` : ''}` : '<span class="lp-dim">Choosing a path…</span>';
        const hf = `${p.house ? L.HOUSES[p.house.i].icon + ' ' : ''}${famText(p)}${p.loans ? ` <span class="lp-dim">· ${p.loans} loan${p.loans > 1 ? 's' : ''}</span>` : ''}`;
        c.querySelector('.lp-hf').innerHTML = hf || '<span class="lp-dim">no home · no family yet</span>';
        const m = p.story[p.story.length - 1];
        c.querySelector('.lp-ms').textContent = m ? `Age ${m.a} — ${m.t}` : 'Age 18 — Life begins';
      });
      if (tlSeat >= 0) renderTimeline();
    }
    function renderMarket() {
      if (!state.market) { if (marketKey !== 'none') { marketKey = 'none'; market.innerHTML = '<span class="lp-mk-t">🏠 Market opens soon…</span>'; } return; }
      const key = JSON.stringify(state.market);
      if (key === marketKey) return;
      const fresh = marketKey !== '' && marketKey !== 'none';
      marketKey = key;
      market.innerHTML = `<span class="lp-mk-t">🏠 Market</span>${L.MARKET_TYPES.map((t) => {
        const m = state.market[t.key];
        const cls = m.d > 0 ? 'up' : m.d < 0 ? 'down' : '';
        return `<span class="lp-mk ${cls} ${fresh && m.d ? 'flash' : ''}">${t.icon}<b>${m.v}</b>${m.d > 0 ? `▲${m.d}` : m.d < 0 ? `▼${-m.d}` : ''}</span>`;
      }).join('')}`;
    }
    function renderBar() {
      const me = api.mySeat();
      const p = state.players[me];
      if (!p) { if (barKey !== 'x') { barKey = 'x'; mybar.innerHTML = ''; } return; }
      const canPlay = state.phase === 'turn' && state.current === me && !state.played && !waiting;
      const gs = state.opts.goals && p.goal ? L.goalStatus(state, me) : null;
      const key = JSON.stringify([p.goal, gs, p.hand, canPlay]);
      if (key === barKey) return;
      barKey = key;
      const goal = gs ? `<div class="lp-goal"><span>${L.GOALS[p.goal].icon}</span><span><b>${L.GOALS[p.goal].name}</b><small>${esc(gs.prog)}${gs.done ? ' ✅' : ''}</small></span></div>` : state.opts.goals ? '<div class="lp-goal dim"><span>🎯</span><span><b>Goal</b><small>not chosen yet</small></span></div>' : '';
      const hand = state.opts.actions ? `<div class="lp-hand">${[0, 1, 2].map((k) => {
        const c = p.hand[k];
        if (!c) return '<span class="lp-hc empty"></span>';
        const A = L.ACTIONS[c];
        return `<button class="lp-hc ${canPlay && c !== 'shield' ? 'live' : ''}" data-k="${k}"><span>${A.icon}</span><small>${esc(A.name)}</small></button>`;
      }).join('')}</div>` : '';
      mybar.innerHTML = goal + hand;
    }

    // ---------- finale ----------
    function recap(i) {
      const p = state.players[i];
      const lines = [
        p.career ? `${p.career.icon} ${esc(p.career.name)} · ${L.fmt(p.career.salary)}${p.hustle ? ` + hustles ${L.fmt(p.hustle)}` : ''}` : '',
        p.house ? `${L.HOUSES[p.house.i].icon} ${esc(L.HOUSES[p.house.i].name)} (${L.fmt(L.houseValue(state, p.house))})` : '🏠 Renter for life',
        famText(p) ? `${famText(p)} family bonus ${L.fmt(L.familyBonus(p))}` : '🧍 Solo adventurer',
        p.st.trips ? `✈️ ${p.st.trips} trip${p.st.trips > 1 ? 's' : ''}` : '',
        p.best ? `${p.best.e} Best moment: ${esc(p.best.t)} ${L.signed(p.best.v)}` : '',
        p.loans ? `🏦 ${p.loans} loans (−${L.fmt(p.loans * L.LOAN_REPAY)})` : '🏦 Debt-free!',
      ].filter(Boolean);
      const g = state.finale.goals[i];
      const goal = g && p.goal ? `<div class="lp-fg ${g.done ? 'ok' : 'no'}">🎯 ${L.GOALS[p.goal].icon} ${L.GOALS[p.goal].name}: ${g.done ? `✅ +${L.fmt(g.bonus)}` : '❌ missed'}</div>` : '';
      return { lines, goal };
    }
    function renderFinale() {
      const f = state.finale;
      if (!f) { finale.classList.add('hidden'); return; }
      finale.classList.remove('hidden');
      const over = state.phase === 'over';
      const key = `${f.revealed}:${over}`;
      if (key === finaleShown) return;
      const fresh = !finaleShown.startsWith(`${f.revealed}:`);
      finaleShown = key;
      const shown = f.order.slice(0, f.revealed);
      const latest = shown[shown.length - 1];
      const items = shown.map((i) => {
        const p = state.players[i];
        const t = f.titles[i];
        const { lines, goal } = recap(i);
        const win = over && (state.winners || []).includes(i);
        const big = i === latest && !over;
        return `<div class="lp-fi ${big ? 'big' : ''} ${win ? 'win' : ''}" style="--pc:${color(i)}">
          <div class="lp-fi-h"><span class="lp-av">${initial(p)}</span><span class="lp-fi-n"><b>${esc(p.name)}</b><em>${t.icon} ${t.title}</em></span><span class="lp-fi-w" data-w="${f.worth[i]}">${L.fmt(f.worth[i])}</span>${win ? '<span class="lp-crown">👑</span>' : ''}</div>
          ${big ? `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>${goal}` : goal ? `<div class="lp-fg-mini">${goal}</div>` : ''}</div>`;
      }).reverse().join('');
      const left = f.order.length - f.revealed;
      finale.innerHTML = `<div class="lp-fh">🌅 Life stories${left ? ` <small>${left} to go…</small>` : over ? ' <small>the end</small>' : ''}</div>${items || '<div class="lp-fwait">Everyone has retired… gathering the photo albums 📸</div>'}`;
      if (fresh && latest != null && !over) {
        const w = finale.querySelector('.lp-fi.big .lp-fi-w');
        if (w) countTo(w, Number(w.dataset.w), 1500, false);
      }
      finale.scrollTop = 0;
    }

    // ---------- render ----------
    function teaser(cur) {
      if (['finale', 'over'].includes(state.phase)) return '🌅 Everyone made it to retirement';
      if (!state.started) return '✨ Every life starts with a choice…';
      if (state.phase === 'move' && Date.now() < animUntil) return `🎡 ${state.current === api.mySeat() ? 'You spin' : `${cur.name} spins`}…`;
      if (state.phase === 'turn') {
        const up = L.upcoming(state, cur);
        return up.length ? `Ahead: ${up.map((u) => `${u.icon} ${u.label}`).join(' · ')}` : '🌅 Retirement is close!';
      }
      const z = B.zones.find((zz) => zz.key === B.spaces[cur.pos].zone);
      return `${z.icon} ${z.name} · age ${age(cur.pos)}`;
    }

    function render() {
      if (!state) return;
      const me = api.mySeat();
      const cur = state.players[state.current];
      const mine = state.current === me;
      const ended = ['finale', 'over'].includes(state.phase);
      renderLives();
      renderMarket();
      renderBar();
      const picking = !state.started;
      q('.turn-label').textContent = ended ? 'Life stories' : picking ? (mine && state.phase === 'pick' ? 'Choose your path' : `${cur.name} chooses a path`) : (mine ? 'Your turn' : `${cur.name}’s turn`);
      q('.lp-tpl').textContent = state.phase === 'over' ? 'Top worth' : ended ? 'Revealed' : 'Cash';
      q('.turn-points strong').textContent = state.phase === 'over' ? L.fmt(Math.max(...state.finale.worth)) : ended ? `${state.finale.revealed}/${state.players.length}` : L.fmt(cur.cash);
      q('.lp-teaser').textContent = teaser(cur);

      board.querySelectorAll('.lp-tile.here').forEach((t) => t.classList.remove('here'));
      if (!ended && animSeat < 0 && state.started) tileEl(cur.pos)?.classList.add('here');
      layoutPawns();

      const animating = Date.now() < animUntil;
      spinBtn.disabled = !(mine && state.phase === 'turn' && !waiting);
      q('.lp-wheel').classList.toggle('ready', mine && state.phase === 'turn' && !waiting);
      spinBtn.textContent = state.phase === 'move' && animating ? '…' : 'SPIN';

      let hint = '';
      if (state.phase === 'setup' || state.phase === 'deal' || state.phase === 'pick') hint = mine && state.phase === 'pick' ? (state.pending.step === 'goal' ? 'Keep one secret goal card.' : 'Pick a job card — or go to college.') : `${cur.name} is choosing a path…`;
      else if (state.phase === 'turn') {
        const canPlay = state.opts.actions && !state.played && cur.hand.some((c) => c !== 'shield');
        hint = mine ? (canPlay ? 'Play an action card — or just SPIN!' : 'Tap SPIN — what will life bring?') : api.isAlive(cur.pid) ? `Waiting for ${cur.name} to spin…` : `Waiting for ${cur.name} to come back…`;
      } else if (state.phase === 'move') hint = animating ? `${mine ? 'You' : cur.name} spun… ` : `${mine ? 'You' : cur.name} spun a ${state.move.value}${state.move.steps > state.move.value ? ` +${state.move.steps - state.move.value}` : ''}${state.move.path.length < state.move.steps ? ' — stopped early!' : '!'}`;
      else if (state.phase === 'choose') {
        const what = { career: 'a career', house: 'about a home', wedding: 'between love and freedom', fork: 'a road', decision: `“${state.pending.title}”`, sell: 'whether to sell' }[state.pending.kind] || 'something';
        hint = mine ? (animating ? '' : 'Make your choice.') : `${cur.name} is deciding ${what}…`;
      } else if (state.phase === 'show' && state.event) hint = `${state.event.icon} ${state.event.title}${state.event.delta ? ' ' + L.signed(state.event.delta) : ''}`;
      else if (state.phase === 'finale') hint = state.finale.revealed ? `${state.players[state.finale.order[state.finale.revealed - 1]].name}’s life story` : 'Gathering the life stories…';
      else if (state.phase === 'over') {
        const w = (state.winners || []).map((i) => state.players[i].name).join(' & ');
        hint = `${w} lived the richest life: ${L.fmt(Math.max(...state.finale.worth))}!`;
      }
      q('.hint').textContent = hint;

      const choosing = state.phase === 'pick' || state.phase === 'choose';
      if (playing && !(state.phase === 'turn' && mine && !state.played)) closeSheet();
      if (choosing && mine && !animating && (!waiting || sheetKey)) openChoiceSheet();
      else if (!(choosing && mine) && !playing && !sheetBg.classList.contains('hidden')) closeSheet();
      if (choosing && !mine && !animating) {
        if (state.phase === 'pick') showWaitCard(`pick${state.dealNo}`, '🤔', `${cur.name} is choosing a path`, state.opts.goals ? 'A job or college… and a secret goal.' : 'Three job cards… or college?');
        else showWaitCard(`ch${state.eventNo}`, state.event?.icon || '🤔', state.event?.title || 'Deciding…', `${cur.name} is deciding ${({ career: 'on a career', house: 'about a home', wedding: 'between love and freedom', fork: 'which road to take', decision: 'what to do', sell: 'whether to sell' })[state.pending.kind] || ''}…`, state.pending.kind === 'decision' ? 2 : 3);
      } else if (cardMode.startsWith('wait') && !choosing) hideCard();

      renderFinale();
      el.classList.toggle('lp-ended', ended);
    }

    return {
      update(next) {
        const old = state;
        state = next;
        if (!old || next.moveNo !== old.moveNo || next.eventNo !== old.eventNo || next.phase !== old.phase || next.pending?.step !== old.pending?.step) waiting = 0;
        const key = JSON.stringify(next.layout || next.opts?.length);
        if (key !== boardKey) { boardKey = key; buildBoardDom(); }
        ensurePawns();
        if (lastMoveNo === null) {
          lastMoveNo = next.move?.no ?? 0;
          lastEventNo = next.event?.no ?? 0;
          if (next.move) spinWheel(next.move.value, false);
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
        if (old && old.round !== next.round) market.classList.remove('pulse'), void market.offsetWidth, market.classList.add('pulse');
        if (old && old.phase !== 'finale' && next.phase === 'finale') { hideCard(); banner(q('.banner'), 'ALL RETIRED!', 'bank', 1600); }
        if (['pick', 'choose'].includes(next.phase)) later(() => render(), Math.max(0, animUntil - Date.now()) + 40);
      },
      refresh: () => render(),
      destroy() { for (const t of timers) clearTimeout(t); for (const r of rafs) cancelAnimationFrame(r); clearTimeout(card._t); el.remove(); },
    };
  },
};
