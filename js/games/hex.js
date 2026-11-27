import * as H from '../engines/hex.js';
import { createDie, ROLL_MS } from '../dice.js';
import { h, esc, scoreboard, banner, turnPill } from '../ui.js';

const U = 100; // svg units per hex radius
const { RES_ICON, RES_NAME, COST, DEV, PLAYER_COLORS: PC } = H;
const TILE_FILL = [
  ['#3f9a4a', '#25693a'], // timber
  ['#d9774a', '#a24a2a'], // clay
  ['#b9e07a', '#7fb24a'], // wool
  ['#f2cf5b', '#d4a22c'], // grain
  ['#a9aeb6', '#6f747d'], // ore
  ['#f1e2b0', '#d8c287'], // dunes
];
const TILE_ICON = [...RES_ICON, '🏜️'];
const costHTML = (c) => c.map((n, r) => (n ? `<span class="hex-cost">${n > 1 ? n : ''}${RES_ICON[r]}</span>` : '')).join('');
const cardsHTML = (hd) => hd.map((n, r) => (n ? `${n}${RES_ICON[r]}` : '')).filter(Boolean).join(' ') || '—';

const rulesHTML = () => `
  <ol>
    <li><b>The island</b> has 19 tiles: 🌲 Timber, 🧱 Clay, 🐑 Wool, 🌾 Grain, 🪨 Ore and the 🏜️ Dunes. Each tile has a number — the dots show how often it comes up.</li>
    <li><b>Settling:</b> in turn order each player places a <b>village</b> on a corner and a <b>road</b> beside it, then again in reverse order. Your second village collects one of each resource around it.</li>
    <li><b>Your turn:</b> roll the dice. Every village on a tile with that number collects 1 of its resource, a city collects 2 (the storm’s tile gives nothing).</li>
    <li><b>Rolled a 7?</b> A storm ⛈️ — anyone holding more than 7 cards discards half. Then move the storm to a new tile and take a random card from a player next to it.</li>
    <li><b>Build</b> (tap 🔨): Road ${costHTML(COST.road)}, Village ${costHTML(COST.village)}, City ${costHTML(COST.city)} (upgrades a village), Discovery card ${costHTML(COST.dev)}. Villages need a road leading to them and can’t sit next to another village.</li>
    <li><b>Trade</b> (tap 🤝): with the bank at 4:1, at 3:1 or 2:1 if you have a village on a harbor, or offer a swap to the other players.</li>
    <li><b>Discovery cards</b> (one per turn, not on the turn you bought it): ${DEV.K.icon} ${DEV.K.name} (move the storm), ${DEV.R.icon} ${DEV.R.name} (2 free roads), ${DEV.P.icon} ${DEV.P.name} (2 resources), ${DEV.M.icon} ${DEV.M.name} (take everyone’s resource of one kind), ${DEV.V.icon} ${DEV.V.name} (+1 secret point).</li>
    <li><b>Points:</b> village 1, city 2. <b>Grand Road</b> (longest trail, 5+) and <b>Strongest Guard</b> (most Watchmen played, 3+) are worth 2 each. First to the target on their turn wins.</li>
  </ol>`;

export default {
  id: 'hex',
  name: 'Hexlands',
  emoji: '🏝️',
  blurb: 'Settle an island, trade and build roads.',
  minPlayers: 2,
  maxPlayers: 4,
  options: [
    { key: 'target', label: 'Points to win', default: '10', choices: [['8', '8 · quick'], ['10', '10 · classic'], ['12', '12 · long']] },
  ],

  setup(players, opts, { first }) {
    return H.newGame(players, { target: Number(opts?.target) || 10, first: first % players.length });
  },

  randomFor: (s, a, seat) => H.randomFor(s, a, seat),

  apply(s, a, seat, { now, rand }) {
    return H.apply(s, a, seat, { now, rand });
  },

  tick(s) {
    return s.phase === 'deal' ? { type: 'deal' } : null;
  },

  botDelay: 1100,
  bot(s, seat, { now } = {}) {
    return H.botAction(s, seat, now ?? 0);
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: H.points(s, i, true), win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,
  createView,
};

// ---------- static board art ----------

function hexPoints(x, y, k) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return `${(x + Math.cos(a) * k * U).toFixed(1)},${(y + Math.sin(a) * k * U).toFixed(1)}`;
  }).join(' ');
}
const P = (v) => [H.VERTS[v].x * U, H.VERTS[v].y * U];

function boardArt(s) {
  const defs = TILE_FILL.map(([a, b], i) => `<radialGradient id="hexg${i}" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`).join('');
  const beach = H.TILES.map((t) => `<polygon points="${hexPoints(t.x * U, t.y * U, 1.06)}"/>`).join('');
  const tiles = H.TILES.map((t, i) => {
    const x = t.x * U;
    const y = t.y * U;
    const r = s.res[i];
    const n = s.num[i];
    const red = n === 6 || n === 8;
    const dots = H.pip(n);
    const pips = Array.from({ length: dots }, (_, k) => `<circle cx="${(x + (k - (dots - 1) / 2) * 7).toFixed(1)}" cy="${y + 37}" r="2.6"/>`).join('');
    return `<g class="hex-tile hex-r${r}" data-t="${i}">
      <polygon class="hex-poly" points="${hexPoints(x, y, 0.95)}" fill="url(#hexg${r})"/>
      <polygon class="hex-glow" points="${hexPoints(x, y, 0.86)}"/>
      <text class="hex-ico" x="${x}" y="${y - 34}">${TILE_ICON[r]}</text>
      ${n ? `<g class="hex-tok${red ? ' hex-red' : ''}"><circle cx="${x}" cy="${y + 20}" r="29"/><text x="${x}" y="${y + 29}">${n}</text><g class="hex-pips">${pips}</g></g>` : ''}
    </g>`;
  }).join('');
  const harbors = H.HARBOR_EDGES.map((e, hi) => {
    const { a, b, tiles: [ti] } = H.EDGES[e];
    const [ax, ay] = P(a);
    const [bx, by] = P(b);
    const tx = H.TILES[ti].x * U;
    const ty = H.TILES[ti].y * U;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const hx = tx + (mx - tx) * 1.62;
    const hy = ty + (my - ty) * 1.62;
    const t = s.harbors[hi];
    const label = t < 0 ? '<text class="hex-h3" x="0" y="8">3:1</text>' : `<text class="hex-hi" x="0" y="-1">${RES_ICON[t]}</text><text class="hex-h2" x="0" y="19">2:1</text>`;
    return `<g class="hex-harbor"><line x1="${hx}" y1="${hy}" x2="${ax}" y2="${ay}"/><line x1="${hx}" y1="${hy}" x2="${bx}" y2="${by}"/>
      <g transform="translate(${hx.toFixed(1)},${hy.toFixed(1)})"><circle r="27"/>${label}</g></g>`;
  }).join('');
  return `<defs>${defs}</defs><g class="hex-beach">${beach}</g>${harbors}<g class="hex-tiles">${tiles}</g>`;
}

function villagePath(x, y, k = 1) {
  return `M${x - 15 * k},${y + 10 * k} L${x - 15 * k},${y - 5 * k} L${x},${y - 19 * k} L${x + 15 * k},${y - 5 * k} L${x + 15 * k},${y + 10 * k} Z`;
}
function cityPath(x, y) {
  return `M${x - 22},${y + 13} L${x - 22},${y - 6} L${x - 7},${y - 6} L${x - 7},${y - 16} L${x + 7},${y - 28} L${x + 21},${y - 16} L${x + 21},${y + 13} Z`;
}
function roadLine(e, cls, color) {
  const [ax, ay] = P(H.EDGES[e].a);
  const [bx, by] = P(H.EDGES[e].b);
  const f = 0.2;
  const x1 = ax + (bx - ax) * f;
  const y1 = ay + (by - ay) * f;
  const x2 = bx + (ax - bx) * f;
  const y2 = by + (ay - by) * f;
  return `<g class="${cls}"><line class="hex-rd-o" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="hex-rd-i" style="stroke:${color}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></g>`;
}

// ---------- view ----------

function createView(root, api) {
  const el = h(`<div class="game hex">
    <section class="scoreboard hex-scores"></section>
    <section class="table hex-table">
      <div class="turn-info"><div class="turn-label"><i class="hex-dot"></i><span></span></div><div class="turn-points"><span class="hex-goal"></span></div></div>
      <div class="hex-wrap">
        <div class="hex-scroll"><svg class="hex-svg" viewBox="-510 -480 1020 960" xmlns="http://www.w3.org/2000/svg"><g class="hex-art"></g><g class="hex-pieces"></g><g class="hex-marks"></g></svg></div>
        <button class="hex-zoom" aria-label="Zoom the island">🔍</button>
      </div>
      <div class="hex-news"></div>
      <div class="hex-hand"></div>
      <div class="hex-dock"><div class="hex-dicebox"></div><div class="hex-acts"></div></div>
      <div class="hint hex-hint"></div>
      <div class="banner hidden"></div>
      <div class="turn-banner"></div>
    </section>
    <div class="hex-sheet-bg hidden"><div class="hex-sheet"></div></div>
  </div>`);
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  const svg = q('.hex-svg');
  const art = q('.hex-art');
  const piecesG = q('.hex-pieces');
  const marksG = q('.hex-marks');
  const scroll = q('.hex-scroll');
  const acts = q('.hex-acts');
  const handEl = q('.hex-hand');
  const sheetBg = q('.hex-sheet-bg');
  const sheet = q('.hex-sheet');
  const dice = [createDie(0), createDie(1)];
  dice.forEach((d) => q('.hex-dicebox').appendChild(d.el));
  q('.hex-dicebox').addEventListener('click', () => { if (canRoll()) send({ type: 'roll' }); });

  let state = null;
  let artKey = '';
  let pieceKey = '';
  let markKey = '';
  let actsKey = '';
  let handKey = '';
  let sheetKey = '';
  let mode = null; // 'road' | 'village' | 'city' while choosing where to build
  let sel = null; // selected spot (vertex / edge / tile)
  let open = null; // manual sheet: 'build' | 'trade' | 'cards'
  let tab = 'bank';
  let bankGive = -1;
  let bankGet = -1;
  let offGive = [0, 0, 0, 0, 0];
  let offGet = [0, 0, 0, 0, 0];
  let offTo = null; // seats, null = everyone
  let dPick = [0, 0, 0, 0, 0];
  let cardPick = null; // { k, res: [] }
  let pending = 0;
  let rollingUntil = 0;
  let zoom = false;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  const mySeat = () => api.mySeat();
  const meP = () => state.players[mySeat()];
  const myTurn = () => state && state.phase !== 'over' && state.phase !== 'deal' && state.current === mySeat();
  const rolling = () => Date.now() < rollingUntil;
  const canRoll = () => myTurn() && state.phase === 'roll' && !pending && !rolling() && !state.offer;
  const afford = (c) => mySeat() >= 0 && c.every((n, r) => meP().hand[r] >= n);

  function send(a) {
    if (pending) return;
    pending = Date.now();
    if (a.type === 'roll') dice.forEach((d) => d.shake(true));
    api.act(a);
    render();
    later(() => { if (pending && Date.now() - pending > 7900) { pending = 0; dice.forEach((d) => d.shake(false)); render(); } }, 8000);
  }

  // what the board is asking me to tap right now
  function placing() {
    if (!myTurn() || pending || rolling()) return null;
    const me = mySeat();
    if (state.phase === 'setup') {
      return state.setup.v < 0
        ? { kind: 'v', what: 'village', list: H.legalVillages(state, me), act: (v) => ({ type: 'place', v }) }
        : { kind: 'e', what: 'road', list: H.legalRoads(state, me), act: (e) => ({ type: 'road', e }) };
    }
    if (state.phase === 'robber') return { kind: 't', what: 'storm', list: H.TILES.map((_, i) => i).filter((i) => i !== state.bandit) };
    if (state.phase !== 'main' || state.offer) return null;
    if (state.freeRoads > 0) return { kind: 'e', what: 'free', list: H.legalRoads(state, me), act: (e) => ({ type: 'road', e }) };
    if (mode === 'road') return { kind: 'e', what: 'road', list: H.legalRoads(state, me), act: (e) => ({ type: 'road', e }) };
    if (mode === 'village') return { kind: 'v', what: 'village', list: H.legalVillages(state, me), act: (v) => ({ type: 'build', what: 'village', v }) };
    if (mode === 'city') return { kind: 'v', what: 'city', list: H.legalCities(state, me), act: (v) => ({ type: 'build', what: 'city', v }) };
    return null;
  }

  // ---------- board ----------
  svg.addEventListener('click', (e) => {
    const pl = placing();
    if (!pl) return;
    const spot = e.target.closest('[data-spot]');
    let id = null;
    if (spot) id = Number(spot.dataset.spot);
    else if (pl.kind === 't') { const t = e.target.closest('.hex-tile'); if (t) id = Number(t.dataset.t); }
    if (id == null || !pl.list.includes(id)) { if (sel != null) { sel = null; render(); } return; }
    if (sel === id && pl.act) { sel = null; send(pl.act(id)); return; }
    sel = id;
    render();
  });

  q('.hex-zoom').addEventListener('click', () => {
    zoom = !zoom;
    el.classList.toggle('hex-zoomed', zoom);
    q('.hex-zoom').textContent = zoom ? '↩︎' : '🔍';
    if (zoom) focusZoom();
  });
  function focusZoom() {
    // centre the scroll on what needs tapping (or the middle)
    const pl = placing();
    let cx = 0;
    let cy = 0;
    const pts = pl ? pl.list.map((id) => spotXY(pl.kind, id)) : [];
    if (sel != null && pl) { [cx, cy] = spotXY(pl.kind, sel); } else if (pts.length) {
      cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    }
    requestAnimationFrame(() => {
      const w = svg.clientWidth;
      const hgt = svg.clientHeight;
      scroll.scrollLeft = ((cx + 510) / 1020) * w - scroll.clientWidth / 2;
      scroll.scrollTop = ((cy + 480) / 960) * hgt - scroll.clientHeight / 2;
    });
  }
  function spotXY(kind, id) {
    if (kind === 'v') return P(id);
    if (kind === 'e') { const [ax, ay] = P(H.EDGES[id].a); const [bx, by] = P(H.EDGES[id].b); return [(ax + bx) / 2, (ay + by) / 2]; }
    return [H.TILES[id].x * U, H.TILES[id].y * U];
  }

  function renderBoard() {
    const ak = `${state.res}|${state.num}|${state.harbors}`;
    if (state.res && ak !== artKey) { artKey = ak; art.innerHTML = boardArt(state); }
    if (!state.res) return;
    const pk = `${state.roads}|${state.bo}|${state.bl}|${state.bandit}`;
    if (pk !== pieceKey) {
      pieceKey = pk;
      let out = '';
      state.roads.forEach((o, e) => { if (o >= 0) out += roadLine(e, 'hex-road', PC[o]); });
      state.bo.forEach((o, v) => {
        if (o < 0) return;
        const [x, y] = P(v);
        out += `<path class="hex-bld" style="fill:${PC[o]}" d="${state.bl[v] === 2 ? cityPath(x, y) : villagePath(x, y)}"/>`;
      });
      const t = H.TILES[state.bandit];
      if (t) out += `<g class="hex-storm"><circle cx="${t.x * U}" cy="${t.y * U - 30}" r="31"/><text x="${t.x * U}" y="${t.y * U - 18}">⛈️</text></g>`;
      piecesG.innerHTML = out;
      art.querySelectorAll('.hex-tile').forEach((g) => g.classList.toggle('hex-stormed', Number(g.dataset.t) === state.bandit));
    }
    const pl = placing();
    if (pl && sel != null && !pl.list.includes(sel)) sel = null;
    const mk = pl ? `${pl.kind}|${pl.what}|${pl.list}|${sel}` : '';
    if (mk !== markKey) {
      markKey = mk;
      let out = '';
      if (pl) {
        const color = PC[mySeat()];
        for (const id of pl.list) {
          const [x, y] = spotXY(pl.kind, id);
          const on = id === sel;
          if (pl.kind === 'v') {
            out += `<g class="hex-spot${on ? ' hex-on' : ''}" data-spot="${id}"><circle class="hex-hit" cx="${x}" cy="${y}" r="46"/><circle class="hex-ring" cx="${x}" cy="${y}" r="16"/></g>`;
          } else if (pl.kind === 'e') {
            out += `<g class="hex-spot${on ? ' hex-on' : ''}" data-spot="${id}"><circle class="hex-hit" cx="${x}" cy="${y}" r="42"/><circle class="hex-ring" cx="${x}" cy="${y}" r="11"/></g>`;
          } else {
            out += `<g class="hex-spot hex-tspot${on ? ' hex-on' : ''}" data-spot="${id}"><circle class="hex-hit" cx="${x}" cy="${y}" r="70"/><circle class="hex-ring" cx="${x}" cy="${y}" r="44"/></g>`;
          }
        }
        if (sel != null) {
          const [x, y] = spotXY(pl.kind, sel);
          if (pl.kind === 'e') out += roadLine(sel, 'hex-ghost', color);
          else if (pl.kind === 'v') out += `<path class="hex-bld hex-ghost" style="fill:${color}" d="${pl.what === 'city' ? cityPath(x, y) : villagePath(x, y)}"/>`;
          else out += `<g class="hex-storm hex-ghost"><circle cx="${x}" cy="${y - 30}" r="31"/><text x="${x}" y="${y - 18}">⛈️</text></g>`;
        }
      }
      marksG.innerHTML = out;
      el.classList.toggle('hex-placing', !!pl);
    }
  }

  function flashRoll(total) {
    art.querySelectorAll('.hex-tile').forEach((g) => {
      const t = Number(g.dataset.t);
      if (state.num[t] !== total) return;
      g.classList.remove('hex-hot');
      void g.getBBox?.();
      g.classList.add('hex-hot');
      later(() => g.classList.remove('hex-hot'), 2200);
    });
  }

  // ---------- hand ----------
  function renderHand() {
    const me = mySeat();
    if (me < 0) { handEl.innerHTML = '<div class="hex-watch">Watching</div>'; handKey = ''; return; }
    const p = meP();
    const devs = p.dev.length;
    const key = `${p.hand}|${devs}`;
    if (key === handKey) return;
    const old = handKey ? handKey.split('|')[0].split(',').map(Number) : null;
    handKey = key;
    handEl.innerHTML = p.hand.map((n, r) => `<div class="hex-card hex-c${r}${n ? '' : ' hex-zero'}${old && n > old[r] ? ' hex-up' : ''}" title="${RES_NAME[r]}"><span class="hex-ci">${RES_ICON[r]}</span><b>${n}</b></div>`).join('')
      + `<button class="hex-card hex-devc${devs ? '' : ' hex-zero'}" data-open="cards"><span class="hex-ci">📜</span><b>${devs}</b></button>`;
  }
  handEl.addEventListener('click', (e) => { if (e.target.closest('[data-open]')) { open = 'cards'; cardPick = null; render(); } });

  // ---------- action dock ----------
  function renderActs() {
    const me = mySeat();
    let html = '';
    const pl = placing();
    const mine = myTurn();
    if (me < 0 || state.phase === 'over' || state.phase === 'deal') html = '';
    else if (state.phase === 'discard') html = state.discard[me] > 0 ? '<button class="btn primary" data-a="discardOpen">Discard…</button>' : '';
    else if (!mine) html = '';
    else if (state.offer) html = '<button class="btn" data-a="cancelOffer">Cancel offer</button>';
    else if (state.phase === 'roll') {
      const k = !state.devPlayed && H.playable(state, me, 'K');
      html = `<button class="btn primary big hex-rollbtn" data-a="roll"${canRoll() ? '' : ' disabled'}>Roll</button>${k ? '<button class="btn hex-tool" data-a="cards"><i>📜</i>Cards</button>' : ''}`;
    } else if (pl && state.phase === 'robber') {
      if (sel == null) html = '<span class="hex-ask">Tap a tile ⛈️</span>';
      else {
        const vs = H.stormVictims(state, sel, me);
        html = vs.length
          ? vs.map((v) => `<button class="btn primary hex-vict" data-a="steal" data-v="${v}" style="--pc:${PC[v]}"><i></i>${esc(state.players[v].name)}</button>`).join('')
          : '<button class="btn primary" data-a="storm">Send storm ✓</button>';
      }
    } else if (pl) {
      const label = { road: 'Build road', free: 'Place road', village: 'Build village', city: 'Build city' }[pl.what];
      const cancel = pl.what === 'free' ? '<button class="btn" data-a="stopRoads">Skip</button>' : state.phase === 'main' ? '<button class="btn" data-a="cancelMode">Cancel</button>' : '';
      html = `${cancel}<button class="btn primary" data-a="confirm"${sel == null ? ' disabled' : ''}>${label} ✓</button>`;
    } else if (state.phase === 'main') {
      html = `<button class="btn hex-tool" data-a="build"><i>🔨</i>Build</button><button class="btn hex-tool" data-a="trade"><i>🤝</i>Trade</button><button class="btn hex-tool" data-a="cards"><i>📜</i>Cards</button><button class="btn primary hex-tool" data-a="end"${pending ? ' disabled' : ''}><i>✅</i>End</button>`;
    }
    const key = `${html}|${pending ? 1 : 0}`;
    if (key !== actsKey) { actsKey = key; acts.innerHTML = html; }
    const showDice = state.phase !== 'setup' && state.phase !== 'deal';
    q('.hex-dicebox').classList.toggle('hex-hide', !showDice);
    q('.hex-dicebox').classList.toggle('clickable', canRoll());
    dice.forEach((d) => d.el.classList.toggle('clickable', canRoll()));
  }

  acts.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !state) return;
    const a = b.dataset.a;
    const pl = placing();
    if (a === 'roll') { if (canRoll()) send({ type: 'roll' }); return; }
    if (a === 'end') { mode = null; sel = null; send({ type: 'end' }); return; }
    if (a === 'build' || a === 'trade' || a === 'cards') { open = a; cardPick = null; render(); return; }
    if (a === 'discardOpen') { render(); return; }
    if (a === 'cancelOffer') { send({ type: 'cancel' }); return; }
    if (a === 'cancelMode') { mode = null; sel = null; render(); return; }
    if (a === 'stopRoads') { sel = null; send({ type: 'stopRoads' }); return; }
    if (a === 'confirm' && pl?.act && sel != null) { const id = sel; sel = null; send(pl.act(id)); return; }
    if (a === 'storm' && sel != null) { const t = sel; sel = null; send({ type: 'bandit', tile: t, victim: -1 }); return; }
    if (a === 'steal' && sel != null) { const t = sel; sel = null; send({ type: 'bandit', tile: t, victim: Number(b.dataset.v) }); }
  });

  // ---------- sheets ----------
  const chip = (r, inner, attrs = '', cls = '') => `<button class="hex-rchip hex-c${r} ${cls}" ${attrs}><span class="hex-ci">${RES_ICON[r]}</span>${inner}</button>`;

  function sheetFor() {
    const me = mySeat();
    if (me < 0 || !state || state.phase === 'over' || state.phase === 'deal') return null;
    const p = meP();
    if (state.phase === 'discard' && state.discard[me] > 0) {
      const need = state.discard[me];
      const n = H.sum(dPick);
      return {
        key: `disc|${p.hand}|${dPick}`,
        html: `<h3>⛈️ The storm hits!</h3><p class="hex-sub">You hold ${H.sum(p.hand)} cards — discard <b>${need}</b>. Tap to pick, tap the lower row to put back.</p>
          <div class="hex-rrow">${p.hand.map((c, r) => chip(r, `<b>${c - dPick[r]}</b>`, `data-d="+${r}"${c - dPick[r] > 0 && n < need ? '' : ' disabled'}`)).join('')}</div>
          <div class="hex-lbl">Discarding ${n}/${need}</div>
          <div class="hex-rrow hex-out">${dPick.map((c, r) => chip(r, `<b>${c}</b>`, `data-d="-${r}"${c ? '' : ' disabled'}`, c ? '' : 'hex-ghostc')).join('')}</div>
          <button class="btn primary big" data-s="discard"${n === need && !pending ? '' : ' disabled'}>Discard ${need}</button>`,
        forced: true,
      };
    }
    const o = state.offer;
    if (o && o.to.includes(me) && !o.declined.includes(me)) {
      const can = o.get.every((c, r) => p.hand[r] >= c);
      return {
        key: `inc|${o.no}|${can}|${pending}`,
        html: `<h3>🤝 ${esc(state.players[o.from].name)} offers a trade</h3>
          <div class="hex-deal"><div><span class="hex-lbl">You get</span><div class="hex-big">${cardsHTML(o.give)}</div></div><div class="hex-arrow">⇄</div><div><span class="hex-lbl">You give</span><div class="hex-big">${cardsHTML(o.get)}</div></div></div>
          <p class="hex-sub">${can ? `You have ${cardsHTML(p.hand)}` : 'You don’t have the cards they want.'}</p>
          <div class="hex-row2"><button class="btn" data-s="decline"${pending ? ' disabled' : ''}>Decline</button><button class="btn primary" data-s="accept"${can && !pending ? '' : ' disabled'}>Accept</button></div>`,
        forced: true,
      };
    }
    if (!open || !myTurn()) return null;
    if (open === 'build') {
      if (state.phase !== 'main' || state.offer || state.freeRoads) return null;
      const row = (what, icon, name, cost, ok, why) => `<button class="hex-brow" data-b="${what}"${ok ? '' : ' disabled'}><span class="hex-bi">${icon}</span><span class="hex-bn"><b>${name}</b><small>${why}</small></span><span class="hex-bc">${costHTML(cost)}</span></button>`;
      const v1 = H.countOf(state, me, 1);
      const left = { road: H.PIECES.road - H.roadCount(state, me), village: H.PIECES.village - v1, city: H.PIECES.city - H.countOf(state, me, 2) };
      const why = (k, spots, extra) => (!left[k] ? 'none left' : !afford(COST[k]) ? 'not enough resources' : !spots ? extra : `${left[k]} left`);
      const rs = H.legalRoads(state, me).length;
      const vs = H.legalVillages(state, me).length;
      const cs = H.legalCities(state, me).length;
      return {
        key: `build|${p.hand}|${rs}|${vs}|${cs}|${state.deck.length}|${pending}`,
        html: `<h3>🔨 Build</h3>
          ${row('road', '🛤️', 'Road', COST.road, left.road && afford(COST.road) && rs, why('road', rs, 'nowhere to build'))}
          ${row('village', '🏠', 'Village · 1 point', COST.village, left.village && afford(COST.village) && vs, why('village', vs, 'needs a road to a free corner'))}
          ${row('city', '🏙️', 'City · 2 points', COST.city, left.city && afford(COST.city) && cs, why('city', cs, 'upgrade a village'))}
          ${row('dev', '📜', 'Discovery card', COST.dev, state.deck.length && afford(COST.dev) && !pending, !state.deck.length ? 'none left' : !afford(COST.dev) ? 'not enough resources' : `${state.deck.length} in the deck`)}
          <button class="btn hex-close" data-s="close">Close</button>`,
      };
    }
    if (open === 'trade') {
      if (state.phase !== 'main' || state.offer || state.freeRoads) return null;
      const tabs = `<div class="hex-tabs"><button class="${tab === 'bank' ? 'on' : ''}" data-tab="bank">🏦 Bank</button><button class="${tab === 'people' ? 'on' : ''}" data-tab="people">👥 Players</button></div>`;
      if (tab === 'bank') {
        const rates = [0, 1, 2, 3, 4].map((r) => H.rateFor(state, me, r));
        const b = H.bank(state);
        if (bankGive >= 0 && p.hand[bankGive] < rates[bankGive]) bankGive = -1;
        const ok = bankGive >= 0 && bankGet >= 0 && bankGive !== bankGet && b[bankGet] > 0 && !pending;
        return {
          key: `bank|${p.hand}|${bankGive}|${bankGet}|${pending}`,
          html: `<h3>🤝 Trade</h3>${tabs}
            <div class="hex-lbl">Give (you have · rate)</div>
            <div class="hex-rrow">${p.hand.map((c, r) => chip(r, `<b>${c}</b><small>${rates[r]}:1</small>`, `data-g="${r}"${c >= rates[r] ? '' : ' disabled'}`, bankGive === r ? 'on' : '')).join('')}</div>
            <div class="hex-lbl">Get 1</div>
            <div class="hex-rrow">${[0, 1, 2, 3, 4].map((r) => chip(r, `<small>${b[r]} left</small>`, `data-w="${r}"${b[r] > 0 && r !== bankGive ? '' : ' disabled'}`, bankGet === r ? 'on' : '')).join('')}</div>
            <div class="hex-row2"><button class="btn" data-s="close">Close</button><button class="btn primary" data-s="bank"${ok ? '' : ' disabled'}>${ok ? `Trade ${rates[bankGive]}${RES_ICON[bankGive]} → 1${RES_ICON[bankGet]}` : 'Trade'}</button></div>`,
        };
      }
      const others = state.players.map((_, i) => i).filter((i) => i !== me);
      const to = offTo || others;
      offGive = offGive.map((c, r) => Math.min(c, p.hand[r]));
      const ok = H.sum(offGive) > 0 && H.sum(offGet) > 0 && to.length && state.offers < 3 && !pending;
      return {
        key: `people|${p.hand}|${offGive}|${offGet}|${to}|${state.offers}|${pending}`,
        html: `<h3>🤝 Trade</h3>${tabs}
          <div class="hex-lbl">You give <small>(tap to add)</small></div>
          <div class="hex-rrow">${offGive.map((c, r) => chip(r, `<b>${c || ''}</b><small>of ${p.hand[r]}</small>`, `data-og="${r}"${p.hand[r] > c && !offGet[r] ? '' : ' disabled'}`, c ? 'on' : '')).join('')}</div>
          <div class="hex-lbl">You want</div>
          <div class="hex-rrow">${offGet.map((c, r) => chip(r, `<b>${c || ''}</b>`, `data-ow="${r}"${!offGive[r] && c < 9 ? '' : ' disabled'}`, c ? 'on' : '')).join('')}</div>
          <div class="hex-lbl">Offer to</div>
          <div class="hex-tos">${others.map((i) => `<button class="hex-to${to.includes(i) ? ' on' : ''}" data-to="${i}" style="--pc:${PC[i]}"><i></i>${esc(state.players[i].name)}</button>`).join('')}</div>
          <div class="hex-row2"><button class="btn" data-s="reset">Clear</button><button class="btn primary" data-s="offer"${ok ? '' : ' disabled'}>${state.offers >= 3 ? 'No offers left' : 'Send offer'}</button></div>`,
      };
    }
    if (open === 'cards') {
      const groups = {};
      for (const d of p.dev) {
        groups[d.k] ||= { n: 0, ready: 0 };
        groups[d.k].n++;
        if (d.t < state.turn) groups[d.k].ready++;
      }
      const ks = Object.keys(groups).sort((a, b) => 'KRPMV'.indexOf(a) - 'KRPMV'.indexOf(b));
      const why = (k) => {
        if (k === 'V') return 'Counts automatically';
        if (!groups[k].ready) return 'New — play next turn';
        if (state.devPlayed) return 'One card per turn';
        if (state.offer || state.freeRoads) return 'Not right now';
        if (k === 'K' ? !['roll', 'main'].includes(state.phase) : state.phase !== 'main') return k === 'K' ? 'Not right now' : 'After you roll';
        if (k === 'R' && !H.legalRoads(state, me).length) return 'Nowhere to build';
        return '';
      };
      let body = ks.length ? ks.map((k) => {
        const w = why(k);
        return `<div class="hex-dev"><span class="hex-bi">${DEV[k].icon}</span><span class="hex-bn"><b>${DEV[k].name}${groups[k].n > 1 ? ` ×${groups[k].n}` : ''}</b><small>${DEV[k].text}</small></span>${k === 'V' ? `<span class="hex-note">${w}</span>` : `<button class="btn primary small" data-play="${k}"${w || pending ? ' disabled' : ''}>${w || 'Play'}</button>`}</div>`;
      }).join('') : '<p class="hex-sub">No discovery cards yet — buy one from 🔨 Build.</p>';
      if (cardPick) {
        const k = cardPick.k;
        const need = k === 'P' ? 2 : 1;
        const b = H.bank(state);
        body = `<p class="hex-sub">${DEV[k].icon} <b>${DEV[k].name}</b>: ${k === 'P' ? 'pick 2 resources from the bank' : 'pick a resource to collect from everyone'}.</p>
          <div class="hex-rrow">${[0, 1, 2, 3, 4].map((r) => {
            const n = cardPick.res.filter((x) => x === r).length;
            const okR = k === 'M' || b[r] > n;
            return chip(r, `<b>${n || ''}</b>`, `data-pick="${r}"${okR ? '' : ' disabled'}`, n ? 'on' : '');
          }).join('')}</div>
          <div class="hex-row2"><button class="btn" data-s="back">Back</button><button class="btn primary" data-s="playPick"${cardPick.res.length === need && !pending ? '' : ' disabled'}>Play ${DEV[k].name}</button></div>`;
        return { key: `pick|${k}|${cardPick.res}|${pending}`, html: `<h3>📜 Discovery cards</h3>${body}` };
      }
      return {
        key: `cards|${p.dev.map((d) => d.k + d.t)}|${state.phase}|${state.devPlayed}|${pending}|${state.turn}`,
        html: `<h3>📜 Discovery cards</h3>${body}<button class="btn hex-close" data-s="close">Close</button>`,
      };
    }
    return null;
  }

  function renderSheet() {
    const sh = sheetFor();
    if (!sh) {
      if (!sheetBg.classList.contains('hidden')) { sheetBg.classList.add('hidden'); sheet.innerHTML = ''; }
      sheetKey = '';
      if (open && (!myTurn() || state.phase === 'over')) open = null;
      return;
    }
    sheetBg.dataset.forced = sh.forced ? '1' : '';
    if (sh.key === sheetKey) return;
    sheetKey = sh.key;
    sheet.innerHTML = sh.html;
    if (sheetBg.classList.contains('hidden')) {
      sheetBg.classList.remove('hidden');
      sheet.classList.remove('hex-pop');
      void sheet.offsetWidth;
      sheet.classList.add('hex-pop');
    }
  }

  sheetBg.addEventListener('click', (e) => {
    if (e.target === sheetBg && !sheetBg.dataset.forced) { open = null; cardPick = null; render(); }
  });
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !state) return;
    const d = b.dataset;
    const p = meP();
    if (d.d) {
      const r = Number(d.d.slice(1));
      if (d.d[0] === '+') dPick[r]++; else dPick[r] = Math.max(0, dPick[r] - 1);
    } else if (d.s === 'discard') { send({ type: 'discard', cards: dPick.slice() }); return; }
    else if (d.s === 'accept' || d.s === 'decline') { send({ type: d.s }); return; }
    else if (d.s === 'close') { open = null; cardPick = null; }
    else if (d.b) {
      if (d.b === 'dev') { send({ type: 'buy' }); open = null; return; }
      mode = d.b; sel = null; open = null;
      if (zoom) later(focusZoom, 30);
    } else if (d.tab) tab = d.tab;
    else if (d.g) bankGive = Number(d.g);
    else if (d.w) bankGet = Number(d.w);
    else if (d.s === 'bank') { send({ type: 'bank', give: bankGive, get: bankGet }); }
    else if (d.og) offGive[Number(d.og)] = Math.min(p.hand[Number(d.og)], offGive[Number(d.og)] + 1);
    else if (d.ow) offGet[Number(d.ow)]++;
    else if (d.to) {
      const others = state.players.map((_, i) => i).filter((i) => i !== mySeat());
      const cur = new Set(offTo || others);
      const i = Number(d.to);
      if (cur.has(i)) cur.delete(i); else cur.add(i);
      offTo = others.filter((x) => cur.has(x));
    } else if (d.s === 'reset') { offGive = [0, 0, 0, 0, 0]; offGet = [0, 0, 0, 0, 0]; offTo = null; }
    else if (d.s === 'offer') {
      const others = state.players.map((_, i) => i).filter((i) => i !== mySeat());
      send({ type: 'offer', to: offTo || others, give: offGive.slice(), get: offGet.slice() });
      open = null;
      return;
    } else if (d.play) {
      const k = d.play;
      if (k === 'P' || k === 'M') cardPick = { k, res: [] };
      else { send({ type: 'play', card: k }); open = null; return; }
    } else if (d.pick) {
      const r = Number(d.pick);
      if (cardPick.k === 'M') cardPick.res = [r];
      else if (cardPick.res.length < 2) cardPick.res.push(r);
      else cardPick.res = [r];
    } else if (d.s === 'back') cardPick = null;
    else if (d.s === 'playPick') {
      const a = cardPick.k === 'M' ? { type: 'play', card: 'M', res: cardPick.res[0] } : { type: 'play', card: 'P', res: cardPick.res.slice() };
      cardPick = null; open = null;
      send(a);
      return;
    }
    render();
  });

  // ---------- text ----------
  function renderText() {
    const me = mySeat();
    const cur = state.players[state.current];
    const lbl = q('.turn-label span');
    let t;
    if (state.phase === 'deal') t = 'Raising the island…';
    else if (state.phase === 'over') {
      const w = (state.winners || []).map((i) => state.players[i].name);
      t = w.length === 1 ? (state.winners[0] === me ? 'You win! 🏆' : `${w[0]} wins! 🏆`) : 'Game over';
    } else if (state.phase === 'setup') t = myTurn() ? 'Settle: your turn' : `${cur.name} settles`;
    else t = myTurn() ? 'Your turn' : `${cur.name}’s turn`;
    lbl.textContent = t;
    q('.hex-dot').style.background = state.phase === 'over' ? 'transparent' : PC[state.current];
    const d = state.dice;
    q('.hex-goal').innerHTML = d && !rolling() && state.phase !== 'setup' ? `🎲 <strong>${d[0] + d[1]}</strong>` : `<span class="hex-tgt">to ${state.target}</span>`;

    // news: the latest happening
    q('.hex-news').textContent = state.log[state.log.length - 1] || '';
    if (rolling()) q('.hex-news').textContent = `${cur.name} rolls…`;

    let hint = '';
    const pl = placing();
    if (state.phase === 'over' || state.phase === 'deal') hint = '';
    else if (state.phase === 'discard') {
      const waiting = state.discard.map((n, i) => (n ? state.players[i].name : null)).filter(Boolean);
      hint = state.discard[me] > 0 ? `Discard ${state.discard[me]} cards` : `Waiting for ${waiting.join(', ')} to discard…`;
    } else if (state.offer && state.offer.from === me) {
      const o = state.offer;
      const dec = o.declined.length ? ` · ${o.declined.map((i) => state.players[i].name).join(', ')} said no` : '';
      hint = `Offer: ${cardsHTML(o.give)} for ${cardsHTML(o.get)} — waiting${dec}`;
    } else if (!myTurn()) {
      if (state.offer && state.offer.to.includes(me) && !state.offer.declined.includes(me)) hint = 'Answer the trade offer';
      else hint = !api.isAlive(cur.pid) ? `Waiting for ${cur.name} to come back…` : state.phase === 'robber' ? `${cur.name} is moving the storm…` : `Waiting for ${cur.name}…`;
    } else if (pending || rolling()) hint = '';
    else if (state.phase === 'setup') {
      const second = state.setup.i >= state.players.length;
      hint = pl.kind === 'v' ? (sel == null ? `Tap a glowing corner for your ${second ? 'second' : 'first'} village` : 'Tap again (or ✓) to settle here') : (sel == null ? 'Now tap a glowing edge for its road' : 'Tap again to build the road');
    } else if (state.phase === 'roll') hint = H.playable(state, me, 'K') && !state.devPlayed ? 'Roll the dice — or play a Watchman first' : 'Tap Roll (or the dice)';
    else if (state.phase === 'robber') hint = sel == null ? 'Tap a tile to send the storm ⛈️' : H.stormVictims(state, sel, me).length ? 'Who do you take a card from?' : 'Nobody to rob there — send it?';
    else if (pl) hint = pl.what === 'free' ? `Free road${state.freeRoads > 1 ? 's' : ''}: ${state.freeRoads} to place` : pl.list.length ? (sel == null ? `Tap a glowing spot for your ${pl.what}` : 'Tap again or ✓ to build') : 'No legal spot';
    else hint = 'Build, trade, play a card — or end your turn';
    q('.hex-hint').textContent = hint;
  }

  function renderScores() {
    const me = mySeat();
    const sb = q('.hex-scores');
    sb.style.gridTemplateColumns = `repeat(${state.players.length}, minmax(0, 1fr))`;
    const over = state.phase === 'over';
    scoreboard(sb, state.players.map((p, i) => {
      const pub = H.points(state, i);
      const all = H.points(state, i, true);
      const badges = `${state.roadHolder === i ? '🛤️' : ''}${state.armyHolder === i ? '🛡️' : ''}`;
      return {
        name: p.name,
        score: (i === me || over) && all !== pub ? `${all}` : pub,
        active: i === state.current && !over && state.phase !== 'deal',
        me: i === me,
        away: !api.isAlive(p.pid),
        sub: `🃏${H.sum(p.hand)} 📜${p.dev.length}${p.knights ? ` 🛡️${p.knights}` : ''} ${badges}`,
      };
    }));
    [...sb.children].forEach((c, i) => c.style.setProperty('--pc', PC[i]));
  }

  function render() {
    if (!state) return;
    renderScores();
    renderBoard();
    renderText();
    renderHand();
    renderActs();
    renderSheet();
  }

  function events(old, next) {
    const me = mySeat();
    const ban = q('.banner');
    let delay = 0;
    if (next.rollNo !== old.rollNo && next.dice) {
      rollingUntil = Date.now() + ROLL_MS;
      dice.forEach((d, i) => d.roll(next.dice[i]));
      delay = ROLL_MS;
      const total = next.dice[0] + next.dice[1];
      later(() => {
        render();
        if (total === 7) banner(ban, 'STORM! ⛈️', 'farkle');
        else flashRoll(total);
        if (me >= 0 && next.lastProd && H.sum(next.lastProd[me])) api.toast?.(`You collect ${cardsHTML(next.lastProd[me])}`);
      }, ROLL_MS + 40);
    }
    if (next.evNo !== old.evNo && next.ev) {
      const ev = next.ev;
      const nmOf = (i) => next.players[i].name;
      later(() => {
        if (ev.kind === 'steal') {
          if (ev.seat === me) api.toast?.(`You take ${RES_ICON[ev.res]} ${RES_NAME[ev.res]} from ${nmOf(ev.victim)}`);
          else if (ev.victim === me) api.toast?.(`${nmOf(ev.seat)} takes your ${RES_ICON[ev.res]} ${RES_NAME[ev.res]}`);
        } else if (ev.kind === 'buy' && ev.seat === me) api.toast?.(`You draw ${DEV[ev.card].icon} ${DEV[ev.card].name}`);
        else if (ev.kind === 'road') banner(ban, 'GRAND ROAD!', 'bank');
        else if (ev.kind === 'win') banner(ban, 'WINNER!', 'hot');
        else if (ev.kind === 'city' && ev.seat === me) banner(ban, 'CITY!', 'bank', 1100);
        else if (ev.kind === 'play' && ev.card === 'K' && next.armyHolder !== old.armyHolder) banner(ban, 'STRONGEST GUARD!', 'bank');
        else if (ev.kind === 'play' && ev.card === 'M') banner(ban, 'MARKET CORNER!', 'hot');
        else if (ev.kind === 'trade' && (ev.a === me || ev.b === me)) api.toast?.('Trade done 🤝');
      }, Math.max(delay, 50));
    }
    if (old.current !== next.current && next.phase !== 'over' && next.phase !== 'deal') {
      const nm = next.players[next.current].name;
      turnPill(q('.turn-banner'), next.current === me ? (next.phase === 'setup' ? 'Your turn to settle' : 'Your turn') : `${nm}’s turn`, Math.max(250, delay));
    }
  }

  return {
    update(next, prev) {
      const old = state || prev;
      state = next;
      pending = 0;
      dice.forEach((d) => d.shake(false));
      if (!old || old.current !== next.current || old.phase !== next.phase) { mode = null; sel = null; if (old && old.current !== next.current) open = null; }
      if (old && (old.roads.join() !== next.roads.join() || old.bo.join() !== next.bo.join() || old.bl.join() !== next.bl.join())) { mode = null; sel = null; }
      if (!next.discard || !(next.discard[mySeat()] > 0)) dPick = [0, 0, 0, 0, 0];
      if (old && old.offerNo !== next.offerNo) { offGive = [0, 0, 0, 0, 0]; offGet = [0, 0, 0, 0, 0]; }
      if (next.dice && !old?.dice) dice.forEach((d, i) => d.set(next.dice[i]));
      else if (next.dice && old && next.rollNo === old.rollNo) dice.forEach((d, i) => d.set(next.dice[i]));
      if (old && old.phase !== 'deal') events(old, next);
      else if (next.dice) dice.forEach((d, i) => d.set(next.dice[i]));
      render();
    },
    refresh: render,
    destroy() { timers.forEach(clearTimeout); el.remove(); },
  };
}
