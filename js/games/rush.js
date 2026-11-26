import * as R from '../engines/rush.js';
import { h, esc, banner, turnPill } from '../ui.js';

const D = R.DISTRICTS;
const A = R.ACTIONS;

const rulesHTML = () => `
  <ol>
    <li>Win by completing <b>${R.WIN_SETS} property sets</b> in different districts.</li>
    <li>Your turn: draw 2 (5 if your hand is empty), then play up to <b>3 cards</b>, then tap <b>End turn</b>.</li>
    <li>Tap a card to <b>bank</b> it (money and actions count as money), <b>place</b> a property, or <b>play</b> an action.</li>
    <li>When you owe money you choose what to pay with from your bank and properties — never your hand. No change is given.</li>
    <li>A <b>Shield</b> in your hand blocks an action aimed at you. Complete sets are safe from Swipe and Swap.</li>
    <li>Hand limit at the end of your turn: ${R.HAND_MAX}.</li>
  </ol>
  <table>${Object.values(A).map((a) => `<tr><td>${a.icon} ${a.name} ×${a.count}</td><td>${esc(a.text)}</td></tr>`).join('')}</table>
  <table>${R.DISTRICT_IDS.map((d) => `<tr><td><span class="dsw" style="background:${D[d].color}"></span>${D[d].name} (${D[d].size})</td><td>rent ${D[d].rent.join(' / ')}</td></tr>`).join('')}</table>`;

// Plain text cards, built to read at a glance: colored name bar, one big fact, bank value.
function rentRows(d) {
  return d.rent.map((r, k) => {
    const full = k + 1 === d.size;
    return `<div class="rr${full ? ' full' : ''}"><span>${full ? 'Full set' : `${k + 1} card${k ? 's' : ''}`}</span><b>${r}</b></div>`;
  }).join('');
}

function cardHTML(id, extra = '', caption = '') {
  const c = R.card(id);
  const cap = caption ? `<div class="rc-cap">${esc(caption)}</div>` : '';
  const wrap = (cls, head, body, foot, style = '') => `<div class="rc ${cls} ${extra}" data-id="${id}">
    <div class="rc-head" ${style}>${head}</div><div class="rc-body">${body}</div><div class="rc-foot">${foot}</div>${cap}</div>`;
  if (c.type === 'money') return wrap('money', 'MONEY', `<div class="rc-big">${c.value}</div>`, `Bank ${c.value}`);
  if (c.type === 'prop') {
    const d = D[c.district];
    return wrap('prop', esc(d.name), `<div class="rc-sub">Rent</div>${rentRows(d)}`, `Value ${c.value}`, `style="background:${d.color}"`);
  }
  if (c.type === 'wild') return wrap('prop wild', 'WILD', '<div class="rc-icon">🌈</div><div class="rc-short">Any district</div>', 'Value 0');
  const a = A[c.action];
  return wrap('action', esc(a.name), `<div class="rc-icon">${a.icon}</div><div class="rc-short">${esc(a.short)}</div>`, `Bank ${c.value}`);
}

/** A property on someone's table, as a tappable card, captioned with where it sits. */
function tableCard(p, id, attrs, extra = '') {
  const d = R.districtOf(p, id);
  const cap = R.card(id).type === 'wild' ? `Wild in ${D[d].name}` : '';
  return `<button class="cardbtn" ${attrs}>${cardHTML(id, `mini ${extra}`, cap)}</button>`;
}

function myTableHTML(p) {
  return `<details class="sheet-table"><summary>Your table · ${R.completeSets(p)}/${R.WIN_SETS} sets · Bank ${R.bankTotal(p)}</summary>
    <div class="districts">${districtsHTML(p, true)}</div></details>`;
}

function chipHTML(id) {
  const c = R.card(id);
  if (c.type === 'prop') return `<span class="chip" style="--c:${D[c.district].color}">${esc(D[c.district].name)} · ${c.value}</span>`;
  if (c.type === 'wild') return '<span class="chip rainbowc">Wild · 0</span>';
  return `<span class="chip money">${c.type === 'money' ? '' : `${A[c.action].icon} `}${c.value}</span>`;
}

// A player's table: one labeled tile per district they have cards in.
function districtsHTML(p, compact) {
  const ds = R.DISTRICT_IDS.filter((d) => R.count(p, d));
  if (!ds.length) return `<div class="nosets">${compact ? 'No properties yet' : 'No properties yet — place some from your hand.'}</div>`;
  return ds.map((d) => {
    const n = R.count(p, d);
    const done = R.isComplete(p, d);
    const wilds = p.props[d].filter((id) => R.card(id).type === 'wild').length;
    const pips = Array.from({ length: Math.max(n, D[d].size) }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
    return `<div class="dset${done ? ' done' : ''}${compact ? ' small' : ''}" style="--c:${D[d].color}">
      <span class="dn">${esc(D[d].name)}</span>
      <span class="dl"><span class="dp">${pips}</span><b>${n}/${D[d].size}</b>${done ? '<em>✓ set</em>' : ''}</span>
      <span class="dr">Rent ${R.rentFor(p, d)}${wilds ? ` · ${wilds} wild` : ''}</span></div>`;
  }).join('');
}

export default {
  id: 'rush',
  name: 'Property Rush',
  emoji: '🏘️',
  blurb: 'Collect sets, charge rent, steal deals.',
  minPlayers: 2,
  maxPlayers: 5,
  options: [],

  setup(players, _opts, { first }) {
    return R.newGame(players, first % players.length);
  },

  randomFor(s, a, seat) { return R.randomNeeds(s, a, seat); },

  apply(s, a, seat, { now, rand }) {
    const system = ['deal', 'draw', 'timeout'].includes(a.type);
    if (system !== (seat === -1)) throw new Error(system ? 'system only' : 'player only');
    return R.applyAction(s, a, seat, { now, rand });
  },

  tick(s, { now }) { return R.tick(s, now); },

  botDelay: 1300,
  bot(s, seat) {
    const me = s.players[seat];
    const others = s.players.map((_, i) => i).filter((i) => i !== seat);
    const shieldId = me.hand.find((id) => R.card(id).action === 'shield');
    if (s.phase === 'respond') {
      const pd = s.pending;
      if (!pd.targets.includes(seat) || pd.done[seat]) return null;
      const big = pd.kind === 'takeover' || pd.kind === 'swipe' || (pd.kind === 'pay' && pd.amounts[seat] >= 4);
      if (shieldId != null && big) return { type: 'respond', r: { type: 'shield' } };
      return { type: 'respond', r: { type: pd.kind === 'pay' ? 'auto' : 'accept' } };
    }
    if (s.current !== seat) return null;
    if (s.phase === 'discard') {
      const need = me.hand.length - R.HAND_MAX;
      const order = [...me.hand].sort((a, b) => (R.card(a).type === 'prop') - (R.card(b).type === 'prop') || R.valueOf(a) - R.valueOf(b));
      return { type: 'discard', cards: order.slice(0, need) };
    }
    if (s.phase !== 'play') return null;
    if (s.plays < 1) return { type: 'end' };
    const hand = me.hand.map((id) => ({ id, c: R.card(id) }));
    const find = (f) => hand.find(({ c }) => f(c));
    // 1. properties
    const prop = find((c) => c.type === 'prop' && !R.isComplete(me, c.district));
    if (prop) return { type: 'place', card: prop.id };
    const wild = find((c) => c.type === 'wild');
    if (wild) {
      const ds = R.DISTRICT_IDS.filter((d) => !R.isComplete(me, d)).sort((a, b) => (R.DISTRICTS[a].size - R.count(me, a)) - (R.DISTRICTS[b].size - R.count(me, b)));
      if (ds.length) return { type: 'place', card: wild.id, district: ds[0] };
    }
    // 2. actions
    const act = (a) => find((c) => c.action === a);
    const rich = [...others].sort((a, b) => R.assetValue(s.players[b]) - R.assetValue(s.players[a]));
    if (act('takeover')) {
      for (const i of others) for (const d of R.DISTRICT_IDS) if (R.isComplete(s.players[i], d)) return { type: 'play', card: act('takeover').id, target: i, district: d };
    }
    if (act('swipe')) {
      let pick = null;
      for (const i of others) for (const pid of R.loose(s.players[i])) {
        const d = R.districtOf(s.players[i], pid);
        const helps = R.count(me, d);
        if (!pick || helps > pick.helps) pick = { i, pid, helps };
      }
      if (pick) return { type: 'play', card: act('swipe').id, target: pick.i, take: pick.pid };
    }
    if (act('rentday')) {
      const ds = R.DISTRICT_IDS.filter((d) => R.count(me, d)).sort((a, b) => R.rentFor(me, b) - R.rentFor(me, a));
      if (ds.length && R.rentFor(me, ds[0]) >= 2 && others.some((i) => R.assetValue(s.players[i]) > 0)) return { type: 'play', card: act('rentday').id, district: ds[0] };
    }
    if (act('tax') && R.assetValue(s.players[rich[0]]) > 0) return { type: 'play', card: act('tax').id, target: rich[0] };
    if (act('party') && others.some((i) => R.assetValue(s.players[i]) > 0)) return { type: 'play', card: act('party').id };
    if (act('windfall') && s.deck.length >= 2) return { type: 'play', card: act('windfall').id };
    // 3. bank money, then spare actions (keep Shields)
    const money = hand.filter(({ c }) => c.type === 'money').sort((a, b) => b.c.value - a.c.value)[0];
    if (money) return { type: 'bank', card: money.id };
    const spare = hand.find(({ c }) => c.type === 'action' && c.action !== 'shield');
    if (spare && R.bankTotal(me) < 8) return { type: 'bank', card: spare.id };
    return { type: 'end' };
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: R.completeSets(p), win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game rush">
      <section class="opps"></section>
      <section class="table rushtable">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points plays"></div></div>
        <div class="sel-line"></div>
        <div class="mine">
          <div class="mine-head"><span class="mysets"></span><span class="mybank"></span></div>
          <div class="districts"></div>
        </div>
        <div class="controls"><button class="btn primary big" data-a="end">End turn</button></div>
        <div class="hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <section class="hand-wrap">
        <div class="hand-title">Your hand <span class="hc"></span></div>
        <div class="hand"></div>
      </section>
      <div class="sheet-bg hidden"><div class="sheet"></div></div>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const sheetBg = q('.sheet-bg');
    const sheet = q('.sheet');

    let state = null;
    let flow = null; // {mode:'card', id, step, take} while choosing what to do with a card
    let paySel = new Set();
    let discSel = new Set();
    let waiting = false;
    let lastEventNo = -1;
    let tickTimer = null;

    const mySeat = () => api.mySeat();
    const me = () => state.players[mySeat()];
    const myTurn = () => state && state.current === mySeat() && state.phase === 'play';
    const others = () => state.players.map((_, i) => i).filter((i) => i !== mySeat());
    const send = (a) => { waiting = true; api.act(a); closeSheet(); render(); setTimeout(() => { waiting = false; render(); }, 2500); };

    function closeSheet() { flow = null; sheetBg.classList.add('hidden'); sheet.innerHTML = ''; }
    function openSheet(html) {
      const fresh = sheetBg.classList.contains('hidden');
      const top = sheet.scrollTop;
      sheet.innerHTML = html;
      sheetBg.classList.remove('hidden');
      if (fresh) { sheet.classList.remove('pop'); void sheet.offsetWidth; sheet.classList.add('pop'); } else sheet.scrollTop = top;
    }

    // ---------- card flows (my turn) ----------
    function cardSheet() {
      const id = flow.id;
      const c = R.card(id);
      const p = me();
      const noPlays = state.plays < 1;
      const head = `<div class="sheet-card">${cardHTML(id)}</div>`;
      const cancel = '<button class="btn ghost" data-do="cancel">Cancel</button>';
      const bankBtn = ['money', 'action'].includes(c.type) ? `<button class="btn" data-do="bank" ${noPlays ? 'disabled' : ''}>Bank it (+${c.value})</button>` : '';
      let body = '';
      if (noPlays) body = '<p class="muted">You’ve used your 3 plays — end your turn.</p>';
      if (c.type === 'money') return openSheet(`${head}<h3>Money</h3>${body}${bankBtn}${cancel}`);
      if (c.type === 'prop') {
        const full = R.isComplete(p, c.district);
        return openSheet(`${head}<h3>${esc(D[c.district].name)}</h3><p class="muted">You have ${R.count(p, c.district)}/${D[c.district].size}.</p>${body}
          <button class="btn primary" data-do="place" ${noPlays || full ? 'disabled' : ''}>${full ? 'Set already complete' : 'Place it'}</button>${cancel}`);
      }
      if (c.type === 'wild') {
        const opts = R.DISTRICT_IDS.filter((d) => !R.isComplete(p, d)).map((d) => `<button class="btn opt" style="--c:${D[d].color}" data-do="place" data-d="${d}" ${noPlays ? 'disabled' : ''}>${esc(D[d].name)} <small>${R.count(p, d)}/${D[d].size}</small></button>`).join('');
        return openSheet(`${head}<h3>Wild property</h3><p class="muted">Pick the district it joins (it stays there).</p>${body}<div class="optlist">${opts}</div>${cancel}`);
      }
      const a = c.action;
      let choices = '';
      if (!noPlays) {
        if (a === 'windfall' || a === 'party') choices = `<button class="btn primary" data-do="play">Play ${esc(A[a].name)}</button>`;
        else if (a === 'rentday') {
          const ds = R.DISTRICT_IDS.filter((d) => R.count(p, d));
          choices = ds.length ? `<div class="optlist">${ds.map((d) => `<button class="btn opt" style="--c:${D[d].color}" data-do="play" data-d="${d}">${esc(D[d].name)} <small>charge ${R.rentFor(p, d)} each</small></button>`).join('')}</div>`
            : '<p class="muted">You need a property on the table to charge rent.</p>';
        } else if (a === 'tax') {
          choices = `<div class="optlist">${others().map((i) => `<button class="btn opt" data-do="play" data-t="${i}">${esc(state.players[i].name)} <small>has ${R.assetValue(state.players[i])} in assets</small></button>`).join('')}</div>`;
        } else if ((a === 'swipe' || a === 'swap') && flow.take == null) {
          const mineLoose = R.loose(p);
          const rows = others().map((i) => {
            const op = state.players[i];
            const cards = R.loose(op);
            if (!cards.length) return '';
            return `<div class="pickrow"><div class="pickwho">${esc(op.name)}’s properties</div><div class="pickcards">${cards.map((pid) => tableCard(op, pid, `data-do="take" data-t="${i}" data-take="${pid}"`)).join('')}</div></div>`;
          }).join('');
          if (a === 'swap' && !mineLoose.length) choices = '<p class="muted">You need a property (not in a complete set) to offer.</p>';
          else choices = rows ? `<p class="step">${a === 'swap' ? 'Step 1 of 2 — tap the property you want' : 'Tap the property to take'}</p>${rows}<p class="muted small">Cards in complete sets are protected.</p>`
            : '<p class="muted">Nobody has a property you can take right now.</p>';
        } else if (a === 'swap' && flow.give == null) {
          const op = state.players[flow.target];
          choices = `<p class="step">Step 2 of 2 — tap what you give</p>
            <div class="trade"><div><div class="pickwho">You get</div>${cardHTML(flow.take, 'mini', R.card(flow.take).type === 'wild' ? `Wild in ${D[R.districtOf(op, flow.take)].name}` : '')}</div></div>
            <div class="pickrow"><div class="pickwho">Your properties</div><div class="pickcards">${R.loose(p).map((pid) => tableCard(p, pid, `data-do="give" data-give="${pid}"`)).join('')}</div></div>
            <button class="btn ghost" data-do="back">Back</button>`;
        } else if (a === 'swipe' || a === 'swap') {
          const op = state.players[flow.target];
          const get = cardHTML(flow.take, 'mini', R.card(flow.take).type === 'wild' ? `Wild in ${D[R.districtOf(op, flow.take)].name}` : '');
          choices = a === 'swap'
            ? `<div class="trade"><div><div class="pickwho">You give</div>${cardHTML(flow.give, 'mini')}</div><div class="arrow">⇄</div><div><div class="pickwho">You get</div>${get}</div></div>
               <p class="muted">Trade with ${esc(op.name)}.</p>
               <button class="btn primary" data-do="play" data-t="${flow.target}" data-take="${flow.take}" data-give="${flow.give}">Confirm swap</button><button class="btn ghost" data-do="back">Back</button>`
            : `<div class="trade"><div><div class="pickwho">You take from ${esc(op.name)}</div>${get}</div></div>
               <button class="btn primary" data-do="play" data-t="${flow.target}" data-take="${flow.take}">Confirm swipe</button><button class="btn ghost" data-do="back">Back</button>`;
        } else if (a === 'takeover') {
          const list = others().flatMap((i) => R.DISTRICT_IDS.filter((d) => R.isComplete(state.players[i], d)).map((d) => ({ i, d })));
          choices = list.length ? list.map(({ i, d }) => `<div class="pickrow"><div class="pickwho">${esc(state.players[i].name)}’s ${esc(D[d].name)} set</div>
              <div class="pickcards">${state.players[i].props[d].map((pid) => cardHTML(pid, 'mini')).join('')}</div>
              <button class="btn opt" style="--c:${D[d].color}" data-do="play" data-t="${i}" data-d="${d}">Take this set</button></div>`).join('')
            : '<p class="muted">Nobody has a complete set yet.</p>';
        } else if (a === 'shield') {
          choices = '<p class="muted">Keep it in your hand — you’ll be offered it when someone plays an action against you.</p>';
        }
      }
      const stepping = flow.take != null;
      openSheet(`${stepping ? '' : head}<h3>${A[a].icon} ${esc(A[a].name)}</h3><p class="muted">${esc(A[a].text)}</p>${body}${choices}${stepping ? '' : bankBtn}${cancel}${myTableHTML(p)}`);
    }

    // ---------- answering an action aimed at me ----------
    function respondSheet() {
      const pd = state.pending;
      const seat = mySeat();
      const by = state.players[pd.by];
      const p = me();
      const hasShield = p.hand.some((id) => R.card(id).action === 'shield');
      const shieldBtn = hasShield ? '<button class="btn" data-do="shield">🛡️ Use Shield</button>' : '';
      const act = A[R.card(pd.card).action];
      const secs = Math.max(0, Math.ceil((pd.deadline - api.hostNow()) / 1000));
      if (pd.kind === 'pay') {
        const owed = pd.amounts[seat];
        const all = R.assets(p);
        paySel = new Set([...paySel].filter((id) => all.includes(id)));
        const sum = [...paySel].reduce((a, id) => a + R.valueOf(id), 0);
        const total = R.assetValue(p);
        const ok = sum >= owed || paySel.size === all.length;
        const list = all.map((id) => `<button class="paychip${paySel.has(id) ? ' on' : ''}" data-do="toggle" data-id="${id}">${chipHTML(id)}</button>`).join('');
        return openSheet(`<h3>${act.icon} ${esc(by.name)} played ${esc(act.name)}</h3>
          <p class="owe">You owe <b>${owed}</b>${total < owed ? ` — you only have ${total}, so you pay everything` : ''}.</p>
          <p class="muted">Tap cards to pay with (bank and table, not your hand). No change is given.</p>
          <div class="paylist">${list || '<span class="muted">You have nothing to pay with.</span>'}</div>
          <div class="paysum">Selected: <b>${sum}</b> / ${owed}</div>
          <button class="btn primary" data-do="pay" ${ok ? '' : 'disabled'}>Pay ${sum}</button>
          <div class="row2"><button class="btn" data-do="auto">Pick for me</button>${shieldBtn}</div>
          <p class="muted small">Auto-pays in <span class="cd">${secs}</span>s</p>`);
      }
      const byP = state.players[pd.by];
      let what = '';
      if (pd.kind === 'swipe') what = `<div class="trade"><div><div class="pickwho">They take</div>${cardHTML(pd.take, 'mini')}</div></div>`;
      if (pd.kind === 'swap') what = `<div class="trade"><div><div class="pickwho">You give</div>${cardHTML(pd.take, 'mini')}</div><div class="arrow">⇄</div><div><div class="pickwho">You get</div>${cardHTML(pd.give, 'mini', R.card(pd.give).type === 'wild' ? `Wild in ${D[R.districtOf(byP, pd.give)].name}` : '')}</div></div>`;
      if (pd.kind === 'takeover') what = `<div class="pickwho">They take your whole ${esc(D[pd.district].name)} set</div><div class="pickcards">${p.props[pd.district].map((id) => cardHTML(id, 'mini')).join('')}</div>`;
      openSheet(`<h3>${act.icon} ${esc(by.name)} played ${esc(act.name)}</h3>${what}
        <button class="btn primary" data-do="accept">OK</button>${shieldBtn}<p class="muted small">Goes through automatically in <span class="cd">${secs}</span>s</p>${myTableHTML(p)}`);
    }

    function discardSheet() {
      const p = me();
      const need = p.hand.length - R.HAND_MAX;
      discSel = new Set([...discSel].filter((id) => p.hand.includes(id)));
      openSheet(`<h3>Too many cards</h3><p class="muted">Pick ${need} card${need > 1 ? 's' : ''} to discard (hand limit ${R.HAND_MAX}).</p>
        <div class="hand inset">${p.hand.map((id) => cardHTML(id, discSel.has(id) ? 'sel' : '')).join('')}</div>
        <button class="btn primary" data-do="discard" ${discSel.size === need ? '' : 'disabled'}>Discard ${discSel.size}/${need}</button>`);
    }

    sheet.addEventListener('click', (e) => {
      const card = e.target.closest('.hand.inset .rc');
      if (card && state.phase === 'discard') {
        const id = Number(card.dataset.id);
        if (discSel.has(id)) discSel.delete(id); else discSel.add(id);
        return discardSheet();
      }
      const b = e.target.closest('[data-do]');
      if (!b || b.disabled) return;
      const d = b.dataset;
      switch (d.do) {
        case 'cancel': return closeSheet();
        case 'bank': return send({ type: 'bank', card: flow.id });
        case 'place': return send({ type: 'place', card: flow.id, district: d.d });
        case 'take': flow.take = Number(d.take); flow.target = Number(d.t); flow.give = null; return cardSheet();
        case 'give': flow.give = Number(d.give); return cardSheet();
        case 'back':
          if (flow.give != null) flow.give = null; else { flow.take = null; flow.target = null; }
          return cardSheet();
        case 'play': return send({ type: 'play', card: flow.id, district: d.d, target: d.t != null ? Number(d.t) : undefined, take: d.take != null ? Number(d.take) : undefined, give: d.give != null ? Number(d.give) : undefined });
        case 'toggle': { const id = Number(d.id); if (paySel.has(id)) paySel.delete(id); else paySel.add(id); return respondSheet(); }
        case 'pay': { const cards = [...paySel]; paySel = new Set(); return send({ type: 'respond', r: { type: 'pay', cards } }); }
        case 'auto': paySel = new Set(); return send({ type: 'respond', r: { type: 'auto' } });
        case 'shield': return send({ type: 'respond', r: { type: 'shield' } });
        case 'accept': return send({ type: 'respond', r: { type: 'accept' } });
        case 'discard': { const cards = [...discSel]; discSel = new Set(); return send({ type: 'discard', cards }); }
        default:
      }
    });
    sheetBg.addEventListener('click', (e) => { if (e.target === sheetBg && flow) closeSheet(); });

    q('.hand').addEventListener('click', (e) => {
      const c = e.target.closest('.rc');
      if (!c || !myTurn() || waiting) return;
      flow = { mode: 'card', id: Number(c.dataset.id) };
      cardSheet();
    });
    q('.controls').addEventListener('click', (e) => {
      if (e.target.closest('[data-a=end]') && myTurn() && !waiting) send({ type: 'end' });
    });

    // ---------- render ----------
    let handKey = '';
    let newIds = new Set();
    function render(full = true) {
      if (!state) return;
      const seat = mySeat();
      const cur = state.players[state.current];
      // opponents
      q('.opps').innerHTML = state.players.map((p, i) => (i === seat ? '' : `
        <div class="opp${i === state.current && state.phase !== 'over' ? ' active' : ''}${api.isAlive(p.pid) ? '' : ' away'}">
          <div class="on"><span class="onm">${esc(p.name)}${api.isAlive(p.pid) ? '' : ' (away)'}</span>
            <span class="ostats">${p.hand.length} in hand · Bank ${R.bankTotal(p)} · <b>${R.completeSets(p)}/${R.WIN_SETS} sets</b></span></div>
          <div class="districts">${districtsHTML(p, true)}</div>
        </div>`)).join('');

      const mine = seat >= 0;
      const label = state.phase === 'over' ? 'Game over'
        : state.phase === 'respond' ? `${state.players[state.pending.by].name} played an action`
          : myTurn() || (state.current === seat && state.phase === 'discard') ? 'Your turn' : `${cur.name}’s turn`;
      q('.turn-label').textContent = label;
      q('.plays').innerHTML = state.phase === 'play' ? `Plays <span class="dots">${[0, 1, 2].map((k) => `<i class="${k < state.plays ? 'on' : ''}"></i>`).join('')}</span>` : '';
      q('.sel-line').textContent = state.log[state.log.length - 1] || '';

      if (mine) {
        const p = me();
        q('.mysets').textContent = `Your table · ${R.completeSets(p)}/${R.WIN_SETS} sets`;
        q('.mybank').textContent = `Bank ${R.bankTotal(p)}`;
        q('.mine .districts').innerHTML = districtsHTML(p, false);
        q('.hc').textContent = `(${p.hand.length})`;
        const tap = myTurn() && !waiting;
        const key = `${p.hand.join()}|${tap}|${[...newIds].join()}`;
        if (key !== handKey) { // rebuild only when it changes, so taps aren't lost
          handKey = key;
          q('.hand').innerHTML = p.hand.map((id) => cardHTML(id, `${tap ? 'tap' : ''}${newIds.has(id) ? ' new' : ''}`)).join('');
          if (newIds.size) q('.hand').scrollLeft = 0;
        }
      } else {
        q('.mine').innerHTML = '<p class="muted">Watching this game.</p>';
        q('.hand-wrap').classList.add('hidden');
      }
      const endBtn = q('[data-a=end]');
      endBtn.disabled = !myTurn() || waiting;
      endBtn.textContent = myTurn() && state.plays === 0 ? 'End turn ✓' : 'End turn';

      let hint = '';
      if (state.phase === 'respond') {
        const left = state.pending.targets.filter((t) => !state.pending.done[t]);
        const secs = Math.max(0, Math.ceil((state.pending.deadline - api.hostNow()) / 1000));
        hint = left.includes(seat) ? 'Your answer is needed.' : `Waiting for ${left.map((t) => state.players[t].name).join(', ')}… (<span class="cd">${secs}</span>s)`;
      } else if (state.phase === 'discard') hint = state.current === seat ? 'Discard down to 7 cards.' : `${cur.name} is discarding…`;
      else if (myTurn()) hint = state.plays ? 'Tap a card in your hand to use it.' : 'No plays left — end your turn.';
      else if (state.phase === 'play' || state.phase === 'draw') hint = api.isAlive(cur.pid) ? `Waiting for ${cur.name}…` : `Waiting for ${cur.name} to come back…`;
      q('.hint').innerHTML = hint.includes('class="cd"') ? hint : esc(hint);

      // sheets driven by game state (only on real state changes)
      if (!full) return;
      const mustRespond = state.phase === 'respond' && state.pending.targets.includes(seat) && !state.pending.done[seat];
      if (mustRespond && !waiting) respondSheet();
      else if (state.phase === 'discard' && state.current === seat && !waiting) discardSheet();
      else if (flow && myTurn() && me().hand.includes(flow.id)) cardSheet();
      else if (!sheetBg.classList.contains('hidden')) closeSheet();
    }

    // countdowns tick in place (re-rendering the sheet every second would eat taps)
    tickTimer = setInterval(() => {
      if (state?.phase !== 'respond') return;
      const secs = Math.max(0, Math.ceil((state.pending.deadline - api.hostNow()) / 1000));
      el.querySelectorAll('.cd').forEach((x) => { x.textContent = secs; });
    }, 1000);

    return {
      update(next) {
        const old = state;
        state = next;
        const seat = mySeat();
        if (seat >= 0) {
          if (next.current !== seat) newIds = new Set();
          else if (old) {
            const had = new Set(old.players[seat].hand);
            const added = next.players[seat].hand.filter((id) => !had.has(id));
            if (added.length) newIds = new Set(added);
          }
        }
        waiting = false;
        render();
        if (old && next.actionNo !== lastEventNo && next.event?.kind === 'action' && next.event.seat !== mySeat()) {
          const a = A[next.event.action];
          banner(q('.banner'), `${a.icon} ${a.name}`, 'bank', 1400);
        }
        lastEventNo = next.actionNo;
        if (old && old.current !== next.current && next.phase !== 'over') {
          const nmx = next.players[next.current].name;
          turnPill(q('.turn-banner'), next.current === mySeat() ? 'Your turn' : `${nmx}’s turn`, 200);
        }
      },
      refresh: () => render(false),
      destroy() { clearInterval(tickTimer); el.remove(); },
    };
  },
};
