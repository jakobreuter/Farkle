import * as R from '../engines/rumble.js';
import { h, esc, banner, turnPill } from '../ui.js';

const ROLL_MS = 950;
const FACE_CLS = ['n1', 'n2', 'n3', 'en', 'hp', 'cl'];
const SEAT_HUE = ['#4cc46b', '#a46cf0', '#e0873a', '#e2483c', '#3fb3d9', '#c9c9c9'];

const rulesHTML = () => `
  <ol>
    <li>Every monster starts with <b>10 ❤️</b> (max 12), <b>0 ⭐</b> and <b>0 ⚡</b>. One spot, <b>⛰️ ${R.PEAK}</b>, holds one monster.</li>
    <li>On your turn roll <b>6 dice</b>: 1, 2, 3, ⚡, ❤️, 👊. Tap dice to <b>keep</b> them and reroll the rest — up to <b>2 rerolls</b>. Press <b>Done</b> to use them.</li>
    <li><b>Numbers:</b> three of a kind scores that many ⭐ (three 2s = 2 ⭐), +1 ⭐ for every extra matching die.</li>
    <li><b>⚡</b> gives 1 energy each. <b>❤️</b> heals 1 each — but <i>not</i> while you’re on the Peak.</li>
    <li><b>👊</b> deals 1 damage each. On the Peak you hit <b>everyone else</b>; off it you hit <b>whoever is on the Peak</b>. They may then <b>flee</b> and you climb up.</li>
    <li>If the Peak is empty after your roll, you climb it. Taking the Peak: <b>+1 ⭐</b>. Starting your turn there: <b>+2 ⭐</b>.</li>
    <li><b>Power cards</b> (if on): after rolling, spend ⚡ on any of the 3 cards in the shop, or pay <b>2 ⚡</b> to sweep in 3 new ones. <b>Traits</b> stay with you; <b>snacks</b> work once.</li>
    <li>At 0 ❤️ you’re knocked out. First to the <b>star goal</b>, or the <b>last monster standing</b>, wins.</li>
  </ol>
  <table>${R.CARD_IDS.map((id) => { const c = R.CARDS[id]; return `<tr><td>${c.icon} ${esc(c.name)} <small>(${c.kind === 'keep' ? 'trait' : 'snack'})</small><br><small>${esc(c.text)}</small></td><td>${c.cost}⚡</td></tr>`; }).join('')}</table>`;

/** small custom die: rounded tile with a symbol, tumbles while rolling */
function makeDie(index, onClick) {
  const el = document.createElement('div');
  el.className = 'rumble-die';
  el.setAttribute('role', 'button');
  el.innerHTML = '<span class="rumble-dsym"></span>';
  const sym = el.firstChild;
  let value = -1;
  let spinT = null;
  let endT = null;
  const paint = (v) => {
    sym.textContent = R.FACE_ICON[v];
    FACE_CLS.forEach((c, k) => el.classList.toggle(`rumble-f${c}`, k === v));
  };
  el.addEventListener('click', () => onClick(index));
  return {
    el,
    set(v) { if (v !== value && !el.classList.contains('rumble-rolling')) { value = v; paint(v); el.setAttribute('aria-label', `die ${R.FACES[v]}`); } },
    roll(v) {
      value = v;
      clearInterval(spinT); clearTimeout(endT);
      el.classList.remove('rumble-rolling');
      el.style.setProperty('--rdx', `${Math.round(Math.random() * 40 - 20)}px`);
      el.style.setProperty('--rdl', `${Math.round(Math.random() * 120)}ms`);
      void el.offsetWidth;
      el.classList.add('rumble-rolling');
      spinT = setInterval(() => paint(Math.floor(Math.random() * 6)), 85);
      endT = setTimeout(() => { clearInterval(spinT); paint(value); el.setAttribute('aria-label', `die ${R.FACES[value]}`); }, ROLL_MS - 200);
      setTimeout(() => el.classList.remove('rumble-rolling'), ROLL_MS + 120);
    },
    shake(on) { el.classList.toggle('rumble-shaking', on); },
    stop() { clearInterval(spinT); clearTimeout(endT); },
  };
}

const monOf = (p) => R.MONSTERS[p.mon];

export default {
  id: 'rumble',
  name: 'Monster Rumble',
  emoji: '🦖',
  blurb: 'Roll, smash and hold Thunder Peak.',
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    { key: 'stars', label: 'Stars to win', default: 20, choices: [[15, '15 stars'], [20, '20 stars']] },
    { key: 'cards', label: 'Power cards', default: 'on', choices: [['on', 'On'], ['off', 'Off']] },
  ],

  setup(players, opts, { first }) {
    return R.newGame(players, {
      target: Number(opts?.stars) === 15 ? 15 : 20,
      cards: String(opts?.cards ?? 'on') !== 'off',
      first: first % players.length,
    });
  },

  randomFor(s, a, seat) {
    if (a.type === 'roll') {
      if (seat !== s.current || s.phase !== 'roll' || s.rollsLeft <= 0) return null;
      const n = s.rolled ? s.keep.filter((k) => !k).length : s.dice.length;
      return n ? Array(n).fill(6) : null;
    }
    const r = R.drawRanges(s, a, seat);
    return r && r.length ? r : null;
  },

  apply(s, a, seat, { now, rand }) {
    if (!a || typeof a.type !== 'string') throw new Error('bad action');
    if (seat === -1 && !['deal', 'resolve', 'flee'].includes(a.type)) throw new Error('system action not allowed');
    return R.applyAction(s, a, seat, rand, now);
  },

  tick(s, { now }) {
    if (s.phase === 'over') return null;
    if (s.needDeal && s.cardsOn) return { type: 'deal' };
    if (s.phase === 'flee' && now >= s.fleeAt) return { type: 'flee', go: false };
    if (s.phase === 'roll' && s.rolled && s.rollsLeft === 0 && s.autoAt != null && now >= s.autoAt) return { type: 'resolve' };
    return null;
  },

  botDelay: 1400,
  bot(s, seat) {
    if (s.needDeal && s.cardsOn) return null; // the shop is being stocked
    return R.botAction(s, seat);
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({
        name: `${monOf(p).emoji} ${p.name}${p.alive ? '' : ' (KO)'}`,
        score: p.stars,
        win: (s.winners || []).includes(i),
      })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game rumble">
      <section class="table rumble-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points rumble-goal"></div></div>
        <div class="rumble-arena">
          <div class="rumble-peak"><div class="rumble-peaktag"><span class="rumble-mtn">⛰️</span><span>Thunder<br>Peak</span></div><div class="rumble-peakslot"><div class="rumble-empty">Empty — the first monster to finish a roll climbs up</div></div></div>
          <div class="rumble-ground"></div>
        </div>
        <div class="sel-line"></div>
        <div class="rumble-tray"></div>
        <div class="controls">
          <button class="btn primary big" data-a="a"></button>
          <button class="btn big" data-a="b"></button>
        </div>
        <div class="hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <section class="rumble-shop">
        <div class="rumble-shophead"><span class="rumble-shoptitle">Power shop</span><button class="rumble-mine" aria-label="Your energy and traits"></button><button class="btn small rumble-sweep">↻ Sweep 2⚡</button></div>
        <div class="rumble-market"></div>
      </section>
      <div class="rumble-sheetbg hidden"><div class="rumble-sheet"></div></div>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const tray = q('.rumble-tray');
    const peakSlot = q('.rumble-peakslot');
    const ground = q('.rumble-ground');
    const emptyMsg = q('.rumble-empty');
    const market = q('.rumble-market');
    const sheetBg = q('.rumble-sheetbg');
    const sheet = q('.rumble-sheet');
    const [btnA, btnB] = el.querySelectorAll('.controls .btn');

    let state = null;
    let dice = [];
    let tiles = [];
    let rollingUntil = 0;
    let rollRequested = 0;
    let pending = 0; // a non-roll action sent, waiting for the host
    let picked = null; // market slot selected
    let marketKey = '';
    let sheetSeat = null;
    let uiTimer = null;
    let clock = null;
    let lastFx = 0;

    const mySeat = () => api.mySeat();
    const myTurn = () => state && state.phase !== 'over' && state.current === mySeat();
    const rolling = () => Date.now() < rollingUntil;
    const me = () => (mySeat() >= 0 ? state.players[mySeat()] : null);

    function send(a) {
      pending = Date.now();
      api.act(a);
      render();
      setTimeout(() => { if (pending && Date.now() - pending > 5900) { pending = 0; render(); } }, 6000);
    }

    function onDie(i) {
      if (!myTurn() || state.phase !== 'roll' || !state.rolled || state.rollsLeft <= 0 || rolling() || rollRequested) return;
      try { state = R.applyAction(state, { type: 'keep', index: i }, mySeat(), null, 0); } catch { return; }
      api.act({ type: 'keep', index: i });
      render();
    }

    function buildDice(n) {
      if (dice.length === n) return;
      dice.forEach((d) => d.stop());
      tray.innerHTML = '';
      dice = Array.from({ length: n }, (_, i) => makeDie(i, onDie));
      dice.forEach((d) => tray.appendChild(d.el));
      tray.classList.toggle('rumble-seven', n > 6);
    }

    function buildTiles() {
      if (tiles.length === state.players.length) return;
      ground.innerHTML = '';
      tiles = state.players.map((p, i) => {
        const t = h(`<div class="rumble-mon" role="button" data-seat="${i}" style="--hue:${SEAT_HUE[p.mon]}">
          <div class="rumble-ava">${monOf(p).emoji}</div>
          <div class="rumble-info">
            <div class="rumble-nm"></div>
            <div class="rumble-hp"><i></i><b></b></div>
            <div class="rumble-st"><span class="rumble-sv"></span><span class="rumble-ev"></span><span class="rumble-cv"></span></div>
          </div>
          <div class="rumble-pops"></div>
        </div>`);
        t.addEventListener('click', () => openSheet(i));
        ground.appendChild(t);
        return t;
      });
      ground.dataset.n = String(state.players.length - 1);
    }

    function renderTiles() {
      buildTiles();
      state.players.forEach((p, i) => {
        const t = tiles[i];
        const onPeak = state.peak === i;
        const want = onPeak ? peakSlot : ground;
        if (t.parentNode !== want) {
          if (onPeak) peakSlot.appendChild(t);
          else {
            // keep seat order on the ground
            const after = tiles.slice(i + 1).find((x) => x.parentNode === ground);
            ground.insertBefore(t, after || null);
          }
        }
        t.classList.toggle('rumble-onpeak', onPeak);
        t.classList.toggle('rumble-cur', state.phase !== 'over' && i === state.current);
        t.classList.toggle('rumble-ko', !p.alive);
        t.classList.toggle('rumble-deciding', state.phase === 'flee' && state.fleeSeat === i);
        t.classList.toggle('rumble-win', state.phase === 'over' && (state.winners || []).includes(i));
        t.classList.toggle('rumble-away', !api.isAlive(p.pid));
        t.querySelector('.rumble-nm').textContent = `${p.name}${i === mySeat() ? ' (you)' : ''}`;
        const mx = R.maxHp(p);
        t.querySelector('.rumble-hp i').style.width = `${Math.max(0, Math.min(100, (p.hp / mx) * 100))}%`;
        t.querySelector('.rumble-hp b').textContent = p.alive ? `❤️ ${p.hp}` : '💀 KO';
        t.querySelector('.rumble-sv').textContent = `⭐${p.stars}`;
        t.querySelector('.rumble-ev').textContent = state.cardsOn ? `⚡${p.energy}` : '';
        t.querySelector('.rumble-cv').textContent = p.cards.length ? `🃏${p.cards.length}` : '';
      });
      emptyMsg.classList.toggle('hidden', state.peak != null);
      ground.dataset.n = String(state.players.length - (state.peak != null ? 1 : 0));
    }

    function cardHTML(id, slot, opts = {}) {
      const c = R.CARDS[id];
      const cost = opts.cost ?? c.cost;
      return `<button class="rumble-pc rumble-${c.kind}${opts.sel ? ' rumble-picked' : ''}${opts.cant ? ' rumble-cant' : ''}" data-slot="${slot}">
        <span class="rumble-pchead"><span class="rumble-pcicon">${c.icon}</span><span class="rumble-pccost">${cost}⚡</span></span>
        <span class="rumble-pcname">${esc(c.name)}</span>
        <span class="rumble-pctext">${esc(c.text)}</span>
        <span class="rumble-pckind">${c.kind === 'keep' ? 'Trait' : 'Snack'}</span>
      </button>`;
    }

    function renderShop() {
      const shop = q('.rumble-shop');
      shop.classList.toggle('hidden', !state.cardsOn);
      if (!state.cardsOn) return;
      const p = me();
      const shopping = myTurn() && state.phase === 'buy' && !pending;
      if (picked != null && (!shopping || !state.market[picked])) picked = null;
      const key = JSON.stringify([state.market, picked, p ? p.energy : -1, p ? p.cards.includes('haggle') : 0, shopping]);
      if (key !== marketKey) {
        marketKey = key;
        market.innerHTML = state.market.map((id, slot) => (id
          ? cardHTML(id, slot, { sel: picked === slot, cost: p ? R.costFor(p, id) : undefined, cant: shopping && p && R.costFor(p, id) > p.energy })
          : `<div class="rumble-pc rumble-none">${state.needDeal ? 'Shuffling…' : 'Sold out'}</div>`)).join('');
      }
      const sw = q('.rumble-sweep');
      sw.disabled = !shopping || !p || p.energy < R.SWEEP_COST || !state.pool.length;
      const mine = q('.rumble-mine');
      const icons = p ? p.cards.map((id) => R.CARDS[id].icon) : [];
      const mineTxt = p ? `You ⚡${p.energy}${icons.length ? ` · ${icons.length > 3 ? `${icons.slice(0, 2).join('')}+${icons.length - 2}` : icons.join('')}` : ''} ›` : '';
      if (mine.textContent !== mineTxt) mine.textContent = mineTxt;
      mine.classList.toggle('rumble-invis', !p);
    }

    market.addEventListener('click', (e) => {
      const b = e.target.closest('.rumble-pc[data-slot]');
      if (!b) return;
      const slot = Number(b.dataset.slot);
      const shopping = myTurn() && state.phase === 'buy' && !pending;
      if (!shopping) { openCard(state.market[slot]); return; }
      picked = picked === slot ? null : slot;
      render();
    });
    q('.rumble-sweep').addEventListener('click', () => {
      if (!myTurn() || state.phase !== 'buy' || pending || me().energy < R.SWEEP_COST) return;
      picked = null;
      send({ type: 'sweep' });
    });
    q('.rumble-mine').addEventListener('click', () => { if (mySeat() >= 0) openSheet(mySeat()); });

    function openCard(id) {
      if (!id) return;
      sheetSeat = null;
      sheet.innerHTML = `<div class="rumble-sheethead"><b>Power card</b><button class="btn small rumble-close">Close</button></div>
        <div class="rumble-sheetcards">${cardHTML(id, -1)}</div>`;
      sheetBg.classList.remove('hidden');
    }

    function openSheet(seat) {
      sheetSeat = seat;
      renderSheet();
      sheetBg.classList.remove('hidden');
    }
    function renderSheet() {
      if (sheetSeat == null || !state) return;
      const p = state.players[sheetSeat];
      const m = monOf(p);
      const html = `<div class="rumble-sheethead"><b>${m.emoji} ${esc(p.name)} <small>the ${esc(m.name)}</small></b><button class="btn small rumble-close">Close</button></div>
        <div class="rumble-sheetstats">${p.alive ? `❤️ ${p.hp}/${R.maxHp(p)}` : '💀 Knocked out'} · ⭐ ${p.stars}/${state.target}${state.cardsOn ? ` · ⚡ ${p.energy}` : ''}${state.peak === sheetSeat ? ' · ⛰️ on the Peak' : ''}</div>
        ${state.cardsOn ? `<div class="rumble-sheetcards">${p.cards.length ? p.cards.map((id) => cardHTML(id, -1)).join('') : '<div class="rumble-nocards">No traits yet.</div>'}</div>` : ''}`;
      if (sheet.dataset.html !== html) { sheet.dataset.html = html; sheet.innerHTML = html; }
    }
    sheetBg.addEventListener('click', (e) => {
      if (e.target === sheetBg || e.target.closest('.rumble-close')) { sheetBg.classList.add('hidden'); sheetSeat = null; sheet.dataset.html = ''; }
    });

    el.querySelector('.controls').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled || !state) return;
      const which = b.dataset.a;
      const s = state;
      if (s.phase === 'flee' && s.fleeSeat === mySeat() && !pending) { send({ type: 'flee', go: which === 'a' }); return; }
      if (!myTurn() || pending || rollRequested || rolling()) return;
      if (s.phase === 'roll') {
        if (which === 'a' && s.rollsLeft > 0 && (!s.rolled || s.keep.some((k) => !k))) {
          rollRequested = Date.now();
          dice.forEach((d, i) => d.shake(!s.rolled || !s.keep[i]));
          render();
          api.act({ type: 'roll' });
          setTimeout(() => { if (rollRequested && Date.now() - rollRequested > 7900) { rollRequested = 0; dice.forEach((d) => d.shake(false)); render(); } }, 8000);
        } else if (which === 'b' && s.rolled) send({ type: 'resolve' });
      } else if (s.phase === 'buy') {
        if (which === 'a' && picked != null && s.market[picked]) { const slot = picked; picked = null; send({ type: 'buy', slot }); }
        else if (which === 'b') { picked = null; send({ type: 'end' }); }
      }
    });

    function renderControls() {
      const s = state;
      const busy = rolling() || !!rollRequested || !!pending;
      let a = { t: 'Roll', on: false, show: true };
      let b = { t: 'Done', on: false, show: true };
      if (s.phase === 'flee' && s.fleeSeat === mySeat()) {
        a = { t: '🏃 Flee', on: !pending, show: true };
        b = { t: '⛰️ Stay', on: !pending, show: true };
      } else if (myTurn() && s.phase === 'buy') {
        const p = me();
        const id = picked != null ? s.market[picked] : null;
        a = { t: id ? `Buy ${R.costFor(p, id)}⚡` : 'Buy', on: !!id && R.costFor(p, id) <= p.energy && !busy, show: true };
        b = { t: 'End turn', on: !busy, show: true };
      } else if (s.phase === 'roll' || s.phase === 'buy' || s.phase === 'flee') {
        const mine = myTurn() && s.phase === 'roll';
        const free = s.rolled ? s.keep.filter((k) => !k).length : s.dice.length;
        a = { t: !mine ? 'Roll' : !s.rolled ? 'Roll' : s.rollsLeft <= 0 ? 'No rerolls' : `Reroll ${free} (${s.rollsLeft} left)`, on: mine && s.rollsLeft > 0 && free > 0 && !busy, show: true };
        b = { t: 'Done ✓', on: mine && s.rolled && !busy, show: true };
      } else {
        a.show = b.show = false;
      }
      btnA.textContent = a.t; btnA.disabled = !a.on; btnA.classList.toggle('hidden', !a.show);
      btnB.textContent = b.t; btnB.disabled = !b.on; btnB.classList.toggle('hidden', !b.show);
      btnB.classList.toggle('primary', s.phase === 'flee' || (myTurn() && s.phase === 'roll' && s.rollsLeft <= 0));
    }

    function render() {
      if (!state) return;
      const s = state;
      buildDice(s.dice.length);
      renderTiles();
      const cur = s.players[s.current];
      const anim = rolling();
      q('.turn-label').textContent = s.phase === 'over'
        ? (s.winners?.length === 1 ? `${monOf(s.players[s.winners[0]]).emoji} ${s.players[s.winners[0]].name} wins!` : 'Game over')
        : myTurn() ? `${monOf(cur).emoji} Your turn` : `${monOf(cur).emoji} ${cur.name}’s turn`;
      q('.rumble-goal').innerHTML = `Goal <strong>${s.target}⭐</strong>`;

      s.dice.forEach((v, i) => {
        const d = dice[i];
        d.set(v);
        const kept = s.rolled && s.keep[i] && s.phase === 'roll';
        d.el.classList.toggle('rumble-kept', kept);
        d.el.classList.toggle('rumble-tap', myTurn() && s.phase === 'roll' && s.rolled && s.rollsLeft > 0 && !anim && !rollRequested);
        d.el.classList.toggle('rumble-dim', (!s.rolled && s.phase === 'roll' && !d.el.classList.contains('rumble-shaking')) || s.phase === 'over');
        d.el.classList.toggle('rumble-used', s.phase !== 'roll' && s.phase !== 'over');
      });

      // what these dice would do
      const sel = q('.sel-line');
      let line = '';
      if (s.phase === 'roll' && s.rolled && !anim) {
        const pv = R.preview(s);
        const bits = [];
        if (pv.stars) bits.push(`+${pv.stars}⭐`);
        if (pv.energy) bits.push(`+${pv.energy}⚡`);
        if (pv.heal) bits.push(`+${pv.heal}❤️`);
        if (pv.dmg) bits.push(pv.targets.length ? `${pv.dmg}👊 → ${pv.targets.length > 1 ? 'everyone' : s.players[pv.targets[0]].name}` : `${pv.dmg}👊 (no one to hit)`);
        line = bits.length ? bits.join('  ·  ') : 'Nothing yet';
        if (s.peak === s.current && pv.c[R.HEART] && !R.has(cur, 'spring')) line += '  ·  no healing on the Peak';
      } else if (s.phase === 'flee') {
        line = `${s.players[s.fleeSeat].name} was hit on the Peak!`;
      } else if (s.phase === 'buy') {
        line = `${cur.name} is shopping`;
      }
      sel.textContent = line;

      renderControls();
      renderShop();
      if (sheetSeat != null) renderSheet();

      let hint = '';
      if (s.phase === 'over') hint = 'The rumble is over!';
      else if (s.phase === 'flee') {
        const left = Math.max(0, Math.ceil((s.fleeAt - api.hostNow()) / 1000));
        hint = s.fleeSeat === mySeat() ? `Flee and let ${cur.name} take the Peak, or stay and fight? (${left}s)` : `Waiting for ${s.players[s.fleeSeat].name} to flee or stay… (${left}s)`;
      } else if (!myTurn()) hint = !api.isAlive(cur.pid) ? `Waiting for ${cur.name} to come back…` : s.phase === 'buy' ? `${cur.name} is looking at power cards…` : `${cur.name} is rolling…`;
      else if (anim || rollRequested) hint = '';
      else if (s.phase === 'roll') {
        hint = !s.rolled ? 'Roll the dice to start your turn.' : s.rollsLeft > 0 ? 'Tap dice to keep them, reroll the rest — or press Done.' : 'No rerolls left — press Done (or wait).';
      } else if (s.phase === 'buy') hint = picked != null ? 'Press Buy — or pick another card.' : 'Tap a power card to pick it, then Buy. Or end your turn.';
      q('.hint').textContent = hint;

      clearInterval(clock);
      if (s.phase === 'flee') clock = setInterval(render, 500);
    }

    // floating numbers and shakes
    function pop(seat, text, cls) {
      const t = tiles[seat];
      if (!t) return;
      const box = t.querySelector('.rumble-pops');
      const n = box.children.length;
      const sp = h(`<span class="rumble-pop ${cls}" style="--k:${n}">${text}</span>`);
      box.appendChild(sp);
      setTimeout(() => sp.remove(), 1700);
    }
    function shakeTile(seat) {
      const t = tiles[seat];
      if (!t) return;
      t.classList.remove('rumble-hit');
      void t.offsetWidth;
      t.classList.add('rumble-hit');
      setTimeout(() => t.classList.remove('rumble-hit'), 650);
    }
    function playFx(s) {
      let bannerShown = false;
      const name = (i) => `${monOf(s.players[i]).emoji} ${s.players[i].name}`;
      for (const f of s.fx || []) {
        if (f.t === 'dmg') { pop(f.seat, `−${f.n}`, 'rumble-pdmg'); shakeTile(f.seat); }
        else if (f.t === 'hp') pop(f.seat, `+${f.n}❤️`, 'rumble-pheal');
        else if (f.t === 'stars') pop(f.seat, `${f.n > 0 ? '+' : '−'}${Math.abs(f.n)}⭐`, 'rumble-pstar');
        else if (f.t === 'energy') pop(f.seat, `${f.n > 0 ? '+' : '−'}${Math.abs(f.n)}⚡`, 'rumble-pen');
        else if (f.t === 'peak') { banner(q('.banner'), `${name(f.seat)} takes the Peak!`, 'rumble-bpeak', 1900); bannerShown = true; }
        else if (f.t === 'flee') pop(f.seat, '🏃 fled!', 'rumble-pnote');
        else if (f.t === 'stay') pop(f.seat, '💪 stays!', 'rumble-pnote');
        else if (f.t === 'gasp') pop(f.seat, '🫀 hangs on!', 'rumble-pnote');
        else if (f.t === 'ko') { banner(q('.banner'), `💥 ${s.players[f.seat].name} is KO!`, 'rumble-bko', 1900); bannerShown = true; }
        else if (f.t === 'buy') pop(f.seat, `${R.CARDS[f.id].icon} bought`, 'rumble-pnote');
        else if (f.t === 'sweep') pop(f.seat, '↻ new cards', 'rumble-pnote');
      }
      return bannerShown;
    }

    return {
      update(next, prev) {
        const old = state || prev;
        state = next;
        pending = 0;
        if (old && next.rollNo !== old.rollNo) { rollRequested = 0; dice.forEach((d) => d.shake(false)); }
        if (old && old.current !== next.current) picked = null;
        buildDice(next.dice.length);
        if (old && next.lastRoll && next.rollNo === old.rollNo + 1 && next.current === old.current) {
          rollingUntil = Date.now() + ROLL_MS;
          next.lastRoll.indices.forEach((di) => dice[di]?.roll(next.dice[di]));
          clearTimeout(uiTimer);
          uiTimer = setTimeout(render, ROLL_MS + 150);
        }
        render();
        let bannerShown = false;
        if (old && next.fxNo !== lastFx && next.fxNo > (old.fxNo ?? 0)) bannerShown = playFx(next);
        lastFx = next.fxNo;
        if (old && old.current !== next.current && next.phase !== 'over') {
          const nmx = next.players[next.current].name;
          turnPill(q('.turn-banner'), next.current === mySeat() ? 'Your turn' : `${nmx}’s turn`, bannerShown ? 2000 : 300);
        }
      },
      refresh: render,
      destroy() { clearTimeout(uiTimer); clearInterval(clock); dice.forEach((d) => d.stop()); el.remove(); },
    };
  },
};
