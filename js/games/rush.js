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

function cardHTML(id, extra = '') {
  const c = R.card(id);
  if (c.type === 'money') return `<div class="rc money ${extra}" data-id="${id}"><span class="rv">${c.value}</span><span class="rl">money</span></div>`;
  if (c.type === 'prop') {
    const d = D[c.district];
    return `<div class="rc prop ${extra}" data-id="${id}"><span class="band" style="background:${d.color}">${esc(d.name)}</span>
      <span class="rl">set of ${d.size}</span><span class="rent">rent ${d.rent.join('·')}</span><span class="val">${c.value}</span></div>`;
  }
  if (c.type === 'wild') return `<div class="rc prop wild ${extra}" data-id="${id}"><span class="band rainbow">Wild</span><span class="rl">any district</span><span class="val">0</span></div>`;
  const a = A[c.action];
  return `<div class="rc action ${extra}" data-id="${id}"><span class="ai">${a.icon}</span><span class="an">${esc(a.name)}</span><span class="val">${c.value}</span></div>`;
}

function chipHTML(id) {
  const c = R.card(id);
  if (c.type === 'prop') return `<span class="chip" style="--c:${D[c.district].color}">${esc(D[c.district].name)} · ${c.value}</span>`;
  if (c.type === 'wild') return '<span class="chip rainbowc">Wild · 0</span>';
  return `<span class="chip money">${c.type === 'money' ? '' : `${A[c.action].icon} `}${c.value}</span>`;
}

function districtsHTML(p, compact) {
  const ds = R.DISTRICT_IDS.filter((d) => R.count(p, d));
  if (!ds.length) return `<div class="nosets">${compact ? 'no properties' : 'No properties yet — place some from your hand.'}</div>`;
  return ds.map((d) => {
    const n = R.count(p, d);
    const done = R.isComplete(p, d);
    const pips = Array.from({ length: Math.max(n, D[d].size) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    return compact
      ? `<span class="dchip${done ? ' done' : ''}" style="--c:${D[d].color}" title="${esc(D[d].name)}"><b>${n}/${D[d].size}</b></span>`
      : `<div class="dset${done ? ' done' : ''}" style="--c:${D[d].color}"><span class="dn">${esc(D[d].name)}${done ? ' ✓' : ''}</span><span class="dp">${pips}</span><span class="dr">rent ${R.rentFor(p, d)}</span></div>`;
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
        } else if (a === 'swipe' || (a === 'swap' && !flow.take)) {
          const list = others().flatMap((i) => R.loose(state.players[i]).map((pid) => ({ i, pid })));
          const mineLoose = R.loose(p);
          if (a === 'swap' && !mineLoose.length) choices = '<p class="muted">You need a property (not in a complete set) to offer.</p>';
          else choices = list.length ? `<p class="muted">${a === 'swap' ? 'Step 1: pick the property you want.' : 'Pick a property to take.'}</p><div class="optlist">${list.map(({ i, pid }) => `<button class="btn opt" style="--c:${R.card(pid).type === 'wild' ? '#888' : D[R.districtOf(state.players[i], pid)].color}" data-do="${a === 'swap' ? 'take' : 'play'}" data-t="${i}" data-take="${pid}">${esc(state.players[i].name)}: ${esc(R.card(pid).type === 'wild' ? `Wild (${D[R.districtOf(state.players[i], pid)].name})` : R.cardName(pid))}</button>`).join('')}</div>`
              : '<p class="muted">Nobody has a property you can take right now.</p>';
        } else if (a === 'swap') {
          choices = `<p class="muted">Step 2: pick what you give in return.</p><div class="optlist">${R.loose(p).map((pid) => `<button class="btn opt" style="--c:${D[R.districtOf(p, pid)].color}" data-do="play" data-t="${flow.target}" data-take="${flow.take}" data-give="${pid}">${esc(R.card(pid).type === 'wild' ? `Wild (${D[R.districtOf(p, pid)].name})` : R.cardName(pid))}</button>`).join('')}</div>`;
        } else if (a === 'takeover') {
          const list = others().flatMap((i) => R.DISTRICT_IDS.filter((d) => R.isComplete(state.players[i], d)).map((d) => ({ i, d })));
          choices = list.length ? `<div class="optlist">${list.map(({ i, d }) => `<button class="btn opt" style="--c:${D[d].color}" data-do="play" data-t="${i}" data-d="${d}">${esc(state.players[i].name)}: ${esc(D[d].name)} set</button>`).join('')}</div>`
            : '<p class="muted">Nobody has a complete set yet.</p>';
        } else if (a === 'shield') {
          choices = '<p class="muted">Keep it in your hand — you’ll be offered it when someone plays an action against you.</p>';
        }
      }
      openSheet(`${head}<h3>${A[a].icon} ${esc(A[a].name)}</h3><p class="muted">${esc(A[a].text)}</p>${body}${choices}${bankBtn}${cancel}`);
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
      let what = '';
      if (pd.kind === 'swipe') what = `take your <b>${esc(R.cardName(pd.take))}</b>`;
      if (pd.kind === 'swap') what = `swap their <b>${esc(R.cardName(pd.give))}</b> for your <b>${esc(R.cardName(pd.take))}</b>`;
      if (pd.kind === 'takeover') what = `take your whole <b>${esc(D[pd.district].name)}</b> set`;
      openSheet(`<h3>${act.icon} ${esc(by.name)} played ${esc(act.name)}</h3><p class="owe">They want to ${what}.</p>
        <button class="btn primary" data-do="accept">OK</button>${shieldBtn}<p class="muted small">Goes through automatically in <span class="cd">${secs}</span>s</p>`);
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
        case 'take': flow.take = Number(d.take); flow.target = Number(d.t); return cardSheet();
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
    function render(full = true) {
      if (!state) return;
      const seat = mySeat();
      const cur = state.players[state.current];
      // opponents
      q('.opps').innerHTML = state.players.map((p, i) => (i === seat ? '' : `
        <div class="opp${i === state.current && state.phase !== 'over' ? ' active' : ''}${api.isAlive(p.pid) ? '' : ' away'}">
          <div class="on"><span>${esc(p.name)}</span><span class="tag">${api.isAlive(p.pid) ? '' : 'away'}</span></div>
          <div class="ostats"><span title="cards in hand">🂠 ${p.hand.length}</span><span title="bank">💰 ${R.bankTotal(p)}</span><span title="complete sets">⭐ ${R.completeSets(p)}/${R.WIN_SETS}</span></div>
          <div class="odistricts">${districtsHTML(p, true)}</div>
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
        q('.mysets').textContent = `Your sets: ${R.completeSets(p)}/${R.WIN_SETS}`;
        q('.mybank').textContent = `💰 ${R.bankTotal(p)} in bank`;
        q('.districts').innerHTML = districtsHTML(p, false);
        q('.hc').textContent = `(${p.hand.length})`;
        const tap = myTurn() && !waiting;
        const key = `${p.hand.join()}|${tap}`;
        if (key !== handKey) { // rebuild only when it changes, so taps aren't lost
          handKey = key;
          q('.hand').innerHTML = p.hand.map((id) => cardHTML(id, tap ? 'tap' : '')).join('');
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
