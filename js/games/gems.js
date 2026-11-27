import * as G from '../engines/gems.js';
import { h, esc, banner, turnPill } from '../ui.js';

const ROMAN = ['I', 'II', 'III'];
const gem = (c, cls = '') => `<i class="gt-gem g${c} ${cls}"></i>`;
const pip = (c, n) => `<span class="gt-pip g${c}${n ? '' : ' gt-z'}">${n}</span>`;
const sq = (c, n) => `<span class="gt-sq g${c}${n ? '' : ' gt-z'}">${n}</span>`;

function cardHTML(id) {
  const c = G.CARDS[id];
  const pips = c.cost.map((n, k) => (n ? pip(k, n) : '')).join('');
  return `<div class="gt-cf gt-b${c.color}">
    <div class="gt-ctop"><b class="gt-pts">${c.pts || ''}</b>${gem(c.color, 'gt-bonus')}</div>
    <div class="gt-cost">${pips}</div>
  </div>`;
}
const backHTML = (tier) => `<div class="gt-back t${tier}"><span>${ROMAN[tier]}</span></div>`;

function patronHTML(id) {
  const p = G.PATRONS[id];
  return `<div class="gt-patron" data-id="${id}" title="${esc(p.name)}">
    <div class="gt-ptop"><b>${G.PATRON_PTS}</b><span>👑</span></div>
    <div class="gt-preq">${p.req.map((n, c) => (n ? sq(c, n) : '')).join('')}</div>
    <div class="gt-pname">${esc(p.name)}</div>
  </div>`;
}

const rulesHTML = () => `
  <ol>
    <li>Collect gems — <b>ruby, sapphire, jade, amethyst, pearl</b> — and spend them on development cards. Every card you own gives a permanent <b>bonus</b> of its colour: one gem off every later purchase. Many cards also give prestige points. In the player panels, squares count your cards (bonuses) and round tokens your gems.</li>
    <li>On your turn do <b>one</b> thing:
      <br>• take up to <b>3 gems of different colours</b>, or
      <br>• take <b>2 of one colour</b> (only if 4 or more are left), or
      <br>• <b>reserve</b> a face-up card (or the top of a deck, unseen) and take a <b>gold</b> — gold is wild; you may hold 3 reserved cards, or
      <br>• <b>buy</b> a face-up or reserved card, paying its cost minus your bonuses (gold covers any shortfall).</li>
    <li>You may hold at most <b>10 gems</b>; return extras of your choice.</li>
    <li><b>Patrons</b> (👑, if on) visit you automatically when your card bonuses — the little squares — meet their requirement: +${G.PATRON_PTS} points, one per turn.</li>
    <li>When someone reaches the target (15 or 21), the round is finished so everyone has had the same number of turns. Most points wins; ties go to whoever bought fewer cards.</li>
    <li>If nobody can do anything useful, you may pass; if everyone passes in a row the game ends.</li>
    <li>Tap gems in the supply to pick them (tap one colour twice for two), or tap a card, then confirm with the button.</li>
  </ol>`;

export default {
  id: 'gems',
  name: 'Gem Traders',
  emoji: '💎',
  blurb: 'Collect gems, buy cards, woo patrons.',
  minPlayers: 2,
  maxPlayers: 4,
  options: [
    { key: 'target', label: 'Target', default: 15, choices: [[15, '15 points'], [21, '21 points (long)']] },
    { key: 'patrons', label: 'Patrons', default: 'on', choices: [['on', 'On'], ['off', 'Off']] },
  ],

  setup(players, opts, { first }) {
    return G.newGame(players, { target: Number(opts.target) || 15, patrons: opts.patrons !== 'off' && opts.patrons !== false }, first || 0);
  },
  randomFor(s, a, seat) { return G.randomNeeds(s, a, seat); },
  apply(s, a, seat, { rand }) {
    if ((a?.type === 'deal') !== (seat === -1)) throw new Error('not allowed');
    return G.applyAction(s, a, seat, rand);
  },
  tick(s) { return s.phase === 'deal' ? { type: 'deal' } : null; },
  botDelay: 1300,
  bot(s, seat) { return G.botAction(s, seat); },
  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.pts, win: (s.winners || []).includes(i) })),
    };
  },
  rulesHTML,

  createView(root, api) {
    const rowsHTML = [2, 1, 0].map((t) => `<div class="gt-row" data-tier="${t}">
        <button class="gt-deck" data-tier="${t}" aria-label="Tier ${t + 1} deck">${backHTML(t)}<b class="gt-left"></b></button>
        ${[0, 1, 2, 3].map((k) => `<button class="gt-slot" data-tier="${t}" data-slot="${k}"></button>`).join('')}
      </div>`).join('');
    const tokHTML = [0, 1, 2, 3, 4, 5].map((c) => `<button class="gt-tok" data-c="${c}" aria-label="${G.GEM_NAMES[c]}">${gem(c, 'gt-big')}<b></b><em></em></button>`).join('');
    const el = h(`<div class="game gems">
      <section class="table gt-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points gt-goal"></div></div>
        <div class="hint gt-hint"></div>
        <div class="gt-opps"></div>
        <div class="gt-patrons"></div>
        <div class="gt-market">${rowsHTML}</div>
        <div class="gt-supply">${tokHTML}</div>
        <div class="sel-line gt-sel"></div>
        <div class="controls gt-ctrl">
          <button class="btn ghost gt-clear">Clear</button>
          <button class="btn gt-res">Reserve</button>
          <button class="btn primary gt-go">Take</button>
        </div>
        <div class="gt-me">
          <div class="gt-mehead"><span class="gt-mename">You</span><span class="gt-mepts"></span></div>
          <div class="gt-mecols"></div>
          <div class="gt-rsvrow"><span class="gt-rsvlbl">Reserved</span>
            ${[0, 1, 2].map((k) => `<button class="gt-rsv" data-idx="${k}"></button>`).join('')}
          </div>
        </div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
        <div class="gt-sheetbg hidden">
          <div class="gt-sheet">
            <h3>Too many gems</h3>
            <p class="gt-shmsg"></p>
            <div class="gt-shgems">${[0, 1, 2, 3, 4, 5].map((c) => `<button class="gt-shtok" data-c="${c}">${gem(c, 'gt-big')}<b></b><em></em></button>`).join('')}</div>
            <div class="controls"><button class="btn ghost gt-shundo">Undo</button><button class="btn primary gt-shok">Return</button></div>
          </div>
        </div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);
    const qa = (x) => [...el.querySelectorAll(x)];

    let state = null;
    let sel = null; // {kind:'gems', list} | {kind:'card', tier, slot} | {kind:'res', idx} | {kind:'deck', tier}
    let ret = []; // gems chosen to return
    let pending = false;
    let selMsg = '';
    let patronKey = '';
    const timers = [];

    const mySeat = () => api.mySeat();
    const meP = () => (mySeat() >= 0 ? state.players[mySeat()] : null);
    const myTurn = () => state && state.phase === 'turn' && state.current === mySeat() && !pending;
    const nameOf = (i) => (i === mySeat() ? 'You' : state.players[i].name);
    const isBot = (i) => String(state.players[i].pid).startsWith('bot-');

    function send(a) {
      pending = true;
      sel = null;
      api.act(a);
      render();
      timers.push(setTimeout(() => { if (pending) { pending = false; render(); } }, 4000));
    }

    // ---------- input ----------
    el.addEventListener('click', (e) => {
      if (!state) return;
      const t = e.target;
      const tok = t.closest('.gt-tok');
      if (tok) return tapGem(Number(tok.dataset.c));
      const slot = t.closest('.gt-slot');
      if (slot) return tapCard({ kind: 'card', tier: Number(slot.dataset.tier), slot: Number(slot.dataset.slot) });
      const deck = t.closest('.gt-deck');
      if (deck) return tapCard({ kind: 'deck', tier: Number(deck.dataset.tier) });
      const rsv = t.closest('.gt-rsv');
      if (rsv) return tapCard({ kind: 'res', idx: Number(rsv.dataset.idx) });
      if (t.closest('.gt-clear')) { sel = null; render(); return; }
      if (t.closest('.gt-res')) return doReserve();
      if (t.closest('.gt-go')) return doGo();
      const sh = t.closest('.gt-shtok');
      if (sh) return tapReturn(Number(sh.dataset.c));
      if (t.closest('.gt-shundo')) { ret = []; renderSheet(); return; }
      if (t.closest('.gt-shok')) {
        const p = meP();
        if (p && ret.length === G.total(p.gems) - G.MAX_GEMS) { const g = ret; ret = []; send({ type: 'return', gems: g }); }
      }
    });

    function tapGem(c) {
      if (!myTurn()) return;
      if (c === G.GOLD) { api.toast?.('Gold only comes with a reservation.'); return; }
      if (state.supply[c] < 1 && !(sel?.kind === 'gems' && sel.list.includes(c))) { api.toast?.(`No ${G.COLORS[c]} left.`); return; }
      if (sel?.kind !== 'gems') sel = { kind: 'gems', list: [] };
      const L = sel.list;
      const two = L.length === 2 && L[0] === L[1];
      if (two) sel.list = L[0] === c ? [] : [L[0], c];
      else if (L.includes(c)) {
        if (L.length === 1) {
          if (state.supply[c] >= 4) sel.list = [c, c];
          else { sel.list = []; api.toast?.('Two of a colour needs 4+ in the supply.'); }
        } else sel.list = L.filter((x) => x !== c);
      } else if (L.length >= 3) { api.toast?.('Up to 3 different gems.'); return; } else sel.list = [...L, c];
      if (!sel.list.length) sel = null;
      render();
    }
    function tapCard(next) {
      if (!myTurn()) return;
      if (next.kind === 'card' && state.market[next.tier][next.slot] == null) return;
      if (next.kind === 'deck' && !state.decks[next.tier].length) return;
      if (next.kind === 'res' && !meP().reserved[next.idx]) return;
      const same = sel && sel.kind === next.kind && sel.tier === next.tier && sel.slot === next.slot && sel.idx === next.idx;
      sel = same ? null : next;
      render();
    }
    function tapReturn(c) {
      const p = meP();
      if (!p || state.phase !== 'return' || state.current !== mySeat()) return;
      const need = G.total(p.gems) - G.MAX_GEMS;
      const used = ret.filter((x) => x === c).length;
      if (used >= p.gems[c] || ret.length >= need) return;
      ret = [...ret, c];
      renderSheet();
    }

    function selCardId() {
      if (!sel) return null;
      if (sel.kind === 'card') return state.market[sel.tier][sel.slot];
      if (sel.kind === 'res') return meP()?.reserved[sel.idx]?.id ?? null;
      return null;
    }
    function doReserve() {
      if (!myTurn() || !sel) return;
      const p = meP();
      if (p.reserved.length >= G.MAX_RESERVE) { api.toast?.('You already hold 3 reserved cards.'); return; }
      if (sel.kind === 'card') send({ type: 'reserve', tier: sel.tier, slot: sel.slot });
      else if (sel.kind === 'deck') send({ type: 'reserve', tier: sel.tier, deck: true });
    }
    function doGo() {
      if (!myTurn()) return;
      if (!sel) { if (G.canPass(state, mySeat())) send({ type: 'pass' }); return; }
      if (sel.kind === 'gems') {
        const L = sel.list;
        send(L.length === 2 && L[0] === L[1] ? { type: 'take2', color: L[0] } : { type: 'take', gems: L });
      } else if (sel.kind === 'card') {
        const id = selCardId();
        if (id != null && G.payment(meP(), G.CARDS[id])) send({ type: 'buy', tier: sel.tier, slot: sel.slot });
      } else if (sel.kind === 'res') {
        const id = selCardId();
        if (id != null && G.payment(meP(), G.CARDS[id])) send({ type: 'buy', reserve: sel.idx });
      }
    }

    // ---------- rendering ----------
    function lastText() {
      const L = state.last;
      if (!L || L.seat == null) return '';
      const who = nameOf(L.seat);
      const gl = (g) => g.map((n, c) => (n ? `${gem(c, 'gt-in')}${n > 1 ? `×${n}` : ''}` : '')).join('');
      let t = '';
      if (L.kind === 'take') t = `${esc(who)} took ${gl(L.gems)}`;
      else if (L.kind === 'buy') t = `${esc(who)} bought ${gem(G.CARDS[L.id].color, 'gt-in')}${G.CARDS[L.id].pts ? ` +${G.CARDS[L.id].pts}` : ''}`;
      else if (L.kind === 'reserve') t = `${esc(who)} reserved a tier ${ROMAN[L.tier]} card${L.gold ? ` + ${gem(5, 'gt-in')}` : ''}`;
      else if (L.kind === 'pass') t = `${esc(who)} passed`;
      if (L.returned) t += ` · returned ${gl(L.returned)}`;
      if (L.patron != null) t += ' · 👑 patron!';
      return t;
    }

    function renderSel() {
      const line = q('.gt-sel');
      const clear = q('.gt-clear');
      const res = q('.gt-res');
      const go = q('.gt-go');
      const show = mySeat() >= 0;
      q('.gt-ctrl').classList.toggle('gt-off', !show);
      let html = '';
      let bad = false;
      let goLbl = 'Take';
      let goOk = false;
      let resOk = false;
      const p = meP();
      if (myTurn() && sel) {
        if (sel.kind === 'gems') {
          const L = sel.list;
          const two = L.length === 2 && L[0] === L[1];
          html = `Take ${L.map((c) => gem(c, 'gt-in')).join('')}${two ? ' (two of a kind)' : ''}`;
          const after = G.total(p.gems) + L.length;
          if (after > G.MAX_GEMS) html += ` · return ${after - G.MAX_GEMS}`;
          goOk = true;
        } else if (sel.kind === 'deck') {
          html = `Reserve a hidden tier ${ROMAN[sel.tier]} card${state.supply[G.GOLD] ? ` + ${gem(5, 'gt-in')}` : ''}`;
          resOk = p.reserved.length < G.MAX_RESERVE;
          goLbl = 'Buy';
          if (!resOk) { html = 'You already hold 3 reserved cards'; bad = true; }
        } else {
          const id = selCardId();
          const card = G.CARDS[id];
          const pay = G.payment(p, card);
          goLbl = 'Buy';
          if (pay) {
            html = G.total(pay) ? `Pay ${pay.map((n, c) => (n ? `${gem(c, 'gt-in')}${n > 1 ? `×${n}` : ''}` : '')).join(' ')}` : 'Free with your bonuses!';
            goOk = true;
          } else {
            html = `Need ${G.shortfall(p, card)} more gem${G.shortfall(p, card) > 1 ? 's' : ''} to buy`;
            bad = true;
          }
          resOk = sel.kind === 'card' && p.reserved.length < G.MAX_RESERVE;
        }
      } else if (myTurn() && G.canPass(state, mySeat())) {
        html = 'No useful move — you may pass';
        goLbl = 'Pass';
        goOk = true;
      } else {
        html = lastText() || (myTurn() ? 'Pick gems or a card' : '');
      }
      if (html !== selMsg) { line.innerHTML = html; selMsg = html; }
      line.classList.toggle('bad', bad);
      go.textContent = goLbl;
      go.disabled = !goOk;
      res.disabled = !resOk;
      clear.disabled = !sel || !myTurn();
    }

    function renderOpps() {
      const me = mySeat();
      const rows = state.players.map((p, i) => ({ p, i })).filter((x) => x.i !== me);
      const html = rows.map(({ p, i }) => {
        const b = G.bonuses(p);
        const cls = [state.phase !== 'over' && state.current === i ? 'gt-on' : '', !api.isAlive(p.pid) ? 'gt-away' : '', state.winners?.includes(i) ? 'gt-win' : ''].join(' ');
        const cols = [0, 1, 2, 3, 4].map((c) => `<div class="gt-oc">${sq(c, b[c])}${pip(c, p.gems[c])}</div>`).join('');
        return `<div class="gt-opp ${cls}">
          <div class="gt-oname"><span>${esc(p.name)}</span><small>${p.cards.length} cards${p.patrons.length ? ` · ${'👑'.repeat(p.patrons.length)}` : ''}</small></div>
          <b class="gt-opts">${p.pts}</b>
          <div class="gt-ocols">${cols}<div class="gt-oc">${pip(5, p.gems[5])}<span class="gt-orsv" title="reserved">${p.reserved.length}</span></div></div>
        </div>`;
      }).join('');
      const box = q('.gt-opps');
      if (box._h !== html) { box.innerHTML = html; box._h = html; }
    }

    function renderPatrons() {
      const box = q('.gt-patrons');
      box.classList.toggle('hidden', !state.opts.patrons);
      const key = state.patrons.join(',');
      if (key === patronKey) return;
      patronKey = key;
      const b = meP() ? G.bonuses(meP()) : null;
      box.innerHTML = state.patrons.length ? state.patrons.map(patronHTML).join('') : '<div class="gt-nopat">All patrons have been won</div>';
      if (b) markPatrons(b);
    }
    function markPatrons(b) {
      for (const x of qa('.gt-patron')) {
        const req = G.PATRONS[Number(x.dataset.id)].req;
        const miss = req.reduce((a, n, c) => a + Math.max(0, n - b[c]), 0);
        x.classList.toggle('gt-near', miss > 0 && miss <= 2);
      }
    }

    function renderMarket(fresh) {
      const p = meP();
      const b = p ? G.bonuses(p) : null;
      for (const btn of qa('.gt-slot')) {
        const t = Number(btn.dataset.tier);
        const k = Number(btn.dataset.slot);
        const id = state.market[t][k];
        const key = id == null ? '' : String(id);
        if (btn.dataset.id !== key) {
          btn.dataset.id = key;
          btn.innerHTML = id == null ? '<div class="gt-empty"></div>' : cardHTML(id);
          if (fresh && id != null) { btn.classList.remove('gt-new'); void btn.offsetWidth; btn.classList.add('gt-new'); }
        }
        btn.disabled = id == null;
        btn.classList.toggle('gt-can', !!(p && id != null && G.payment(p, G.CARDS[id], b)));
        btn.classList.toggle('gt-picked', sel?.kind === 'card' && sel.tier === t && sel.slot === k);
      }
      for (const d of qa('.gt-deck')) {
        const t = Number(d.dataset.tier);
        const n = state.decks[t].length;
        d.querySelector('.gt-left').textContent = n;
        d.classList.toggle('gt-gone', !n);
        d.classList.toggle('gt-picked', sel?.kind === 'deck' && sel.tier === t);
      }
    }

    function renderSupply() {
      const pick = sel?.kind === 'gems' ? sel.list : [];
      for (const b of qa('.gt-tok')) {
        const c = Number(b.dataset.c);
        const n = state.supply[c];
        const cnt = b.querySelector('b');
        if (cnt.textContent !== String(n)) {
          cnt.textContent = n;
          b.classList.remove('gt-bump'); void b.offsetWidth; b.classList.add('gt-bump');
        }
        const k = pick.filter((x) => x === c).length;
        b.querySelector('em').textContent = k ? `+${k}` : '';
        b.classList.toggle('gt-picked', k > 0);
        b.classList.toggle('gt-zero', n === 0);
        b.classList.toggle('gt-live', !!myTurn() && c !== G.GOLD);
      }
    }

    function renderMe() {
      const box = q('.gt-me');
      const p = meP();
      box.classList.toggle('hidden', !p);
      if (!p) return;
      const i = mySeat();
      box.classList.toggle('gt-on', state.phase !== 'over' && state.current === i);
      box.classList.toggle('gt-win', !!state.winners?.includes(i));
      const b = G.bonuses(p);
      q('.gt-mename').textContent = `You · ${p.cards.length} card${p.cards.length === 1 ? '' : 's'}${p.patrons.length ? ` · ${'👑'.repeat(p.patrons.length)}` : ''}`;
      q('.gt-mepts').innerHTML = `<b>${p.pts}</b> / ${state.opts.target}`;
      const held = G.total(p.gems);
      const cols = [0, 1, 2, 3, 4, 5].map((c) => `<div class="gt-mc">${c < 5 ? sq(c, b[c]) : '<span class="gt-sq gt-blank"></span>'}${pip(c, p.gems[c])}<small>${c < 5 ? b[c] + p.gems[c] : ''}</small></div>`).join('')
        + `<div class="gt-mc gt-held"><b>${held}</b><small>/10</small></div>`;
      const mc = q('.gt-mecols');
      if (mc._h !== cols) { mc.innerHTML = cols; mc._h = cols; }
      markPatrons(b);
      for (const r of qa('.gt-rsv')) {
        const k = Number(r.dataset.idx);
        const res = p.reserved[k];
        const key = res ? String(res.id) : '';
        if (r.dataset.id !== key) {
          r.dataset.id = key;
          r.innerHTML = res ? cardHTML(res.id) : '<div class="gt-empty"></div>';
        }
        r.disabled = !res;
        r.classList.toggle('gt-can', !!(res && G.payment(p, G.CARDS[res.id], b)));
        r.classList.toggle('gt-picked', sel?.kind === 'res' && sel.idx === k);
      }
    }

    function renderSheet() {
      const bg = q('.gt-sheetbg');
      const p = meP();
      const open = !!p && state.phase === 'return' && state.current === mySeat() && !pending;
      if (!open) { bg.classList.add('hidden'); return; }
      const wasHidden = bg.classList.contains('hidden');
      bg.classList.remove('hidden');
      if (wasHidden) { const sh = q('.gt-sheet'); sh.classList.remove('gt-pop'); void sh.offsetWidth; sh.classList.add('gt-pop'); }
      const need = G.total(p.gems) - G.MAX_GEMS;
      const left = need - ret.length;
      q('.gt-shmsg').innerHTML = left > 0 ? `You may hold 10. Tap gems to return <b>${left}</b> more.` : 'Ready — confirm to return these gems.';
      for (const b of qa('.gt-shtok')) {
        const c = Number(b.dataset.c);
        const k = ret.filter((x) => x === c).length;
        b.querySelector('b').textContent = p.gems[c] - k;
        b.querySelector('em').textContent = k ? `−${k}` : '';
        b.disabled = p.gems[c] - k <= 0 || left <= 0;
        b.classList.toggle('gt-picked', k > 0);
      }
      q('.gt-shok').disabled = left !== 0;
      q('.gt-shok').textContent = `Return ${need}`;
      q('.gt-shundo').disabled = !ret.length;
    }

    function render(fresh = false) {
      if (!state) return;
      const me = mySeat();
      const cur = state.current;
      const lbl = q('.turn-label');
      const goal = q('.gt-goal');
      goal.innerHTML = state.phase === 'over' ? 'Final' : `${state.finalRound ? '<strong>Final round</strong>' : `Round ${state.round}`} · to ${state.opts.target}`;
      let hint = '';
      if (state.phase === 'deal') { lbl.textContent = 'Setting out the market…'; hint = 'Shuffling the decks…'; }
      else if (state.phase === 'over') {
        const w = state.winners || [];
        lbl.textContent = w.length > 1 ? 'Shared victory!' : w[0] === me ? 'You win!' : `${state.players[w[0]].name} wins!`;
        hint = state.players.map((p) => `${p.name} ${p.pts}`).join(' · ');
      } else {
        lbl.textContent = cur === me ? (state.phase === 'return' ? 'Return gems' : 'Your turn') : `${state.players[cur].name}’s turn`;
        if (cur === me) {
          if (state.phase === 'return') hint = 'Choose which gems to put back.';
          else if (pending) hint = 'Sending…';
          else if (!sel) hint = 'Tap gems to take (one colour twice for two) or tap a card to buy or reserve.';
          else if (sel.kind === 'gems') hint = 'Add more colours, or confirm with Take.';
          else if (sel.kind === 'deck') hint = 'Reserve the top card unseen? You also get a gold.';
          else hint = sel.kind === 'res' ? 'Buy this reserved card?' : 'Buy this card, or reserve it for later (+1 gold).';
        } else if (!api.isAlive(state.players[cur].pid)) hint = `Waiting for ${state.players[cur].name} to come back…`;
        else hint = state.phase === 'return' ? `${state.players[cur].name} is returning gems…` : isBot(cur) ? `${state.players[cur].name} is thinking…` : `Waiting for ${state.players[cur].name}…`;
      }
      q('.gt-hint').textContent = hint;
      el.classList.toggle('gt-myturn', !!myTurn());
      renderOpps();
      renderPatrons();
      renderMarket(fresh);
      renderSupply();
      renderMe();
      renderSel();
      renderSheet();
    }

    function validateSel() {
      if (!sel || !myTurn()) { sel = null; return; }
      if (sel.kind === 'gems') {
        const ok = sel.list.every((c) => state.supply[c] >= (sel.list.length === 2 && sel.list[0] === sel.list[1] ? 4 : 1));
        if (!ok) sel = null;
      } else if (sel.kind === 'card' && state.market[sel.tier][sel.slot] == null) sel = null;
      else if (sel.kind === 'res' && !meP().reserved[sel.idx]) sel = null;
      else if (sel.kind === 'deck' && !state.decks[sel.tier].length) sel = null;
    }

    return {
      update(next) {
        const old = state;
        state = next;
        const moved = !old || old.seq !== next.seq;
        if (moved) { pending = false; ret = []; sel = null; }
        validateSel();
        render(!!old && moved);
        if (!old || !moved) return;
        const L = next.last;
        if (L?.patron != null && (!old.last || old.last.patron !== L.patron || old.seq !== next.seq) && old.patrons.includes(L.patron)) {
          const who = L.seat === mySeat() ? 'you' : next.players[L.seat].name;
          timers.push(setTimeout(() => banner(q('.banner'), '👑 PATRON!', 'bank', 1500), 200));
          api.toast?.(`${G.PATRONS[L.patron].name} visits ${who} (+${G.PATRON_PTS})`);
        }
        if (next.finalRound && !old.finalRound) timers.push(setTimeout(() => turnPill(q('.turn-banner'), 'Final round!'), 900));
        else if (next.phase === 'turn' && (old.phase === 'deal' || old.current !== next.current) && next.current === mySeat()) {
          turnPill(q('.turn-banner'), 'Your turn', 250);
        }
        if (next.phase === 'over' && old.phase !== 'over') {
          const me = mySeat();
          const w = next.winners || [];
          const text = me >= 0 ? (w.includes(me) ? 'YOU WIN!' : 'GAME OVER') : 'GAME OVER';
          timers.push(setTimeout(() => banner(q('.banner'), text, me >= 0 && w.includes(me) ? 'hot' : 'bank', 1600), 300));
        }
      },
      refresh() { render(); },
      destroy() { timers.forEach(clearTimeout); el.remove(); },
    };
  },
};
