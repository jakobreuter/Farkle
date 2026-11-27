import * as C from '../engines/court.js';
import { h, esc, banner, turnPill } from '../ui.js';

const { ROLE_INFO, ACTIONS } = C;
const ICON = (r) => ROLE_INFO[r].icon;
const RNAME = (r) => ROLE_INFO[r].name;
const COIN = '<span class="ci-coin" aria-hidden="true"></span>';

const rulesHTML = () => `
  <ol>
    <li>Everyone starts with <b>2 coins</b> and <b>2 face-down role cards</b>. Lose both cards and you leave the court; the last player left wins.</li>
    <li>On your turn take <b>one action</b>:
      <ul>
        <li><b>Wages</b>: +1 coin. Nobody can stop it.</li>
        <li><b>Petition</b>: +2 coins. Anyone claiming the Treasurer can block it.</li>
        <li><b>Banish</b>: pay 7, a rival loses a card. Can’t be stopped. With 10+ coins you <i>must</i> banish.</li>
      </ul></li>
    <li>Role actions — you may claim <b>any</b> role, whether you hold it or not:
      <ul>
        <li>💰 <b>Treasurer</b>: Levy, take 3 coins. Blocks Petition.</li>
        <li>🧪 <b>Poisoner</b>: pay 3, a rival loses a card.</li>
        <li>🩺 <b>Physician</b>: blocks Poison aimed at you.</li>
        <li>🗝️ <b>Smuggler</b>: steal 2 coins from a rival. Blocks stealing.</li>
        <li>🕵️ <b>Spymaster</b>: draw 2 from the court deck, keep any of your cards, return the rest. Blocks stealing.</li>
      </ul></li>
    <li><b>Challenge!</b> Anyone may challenge a role claim (an action or a block) while the timer runs. If the claimer really has the role, they show it, shuffle it into the deck and draw a new card — and the challenger loses a card. If they were bluffing, the bluffer loses a card and their action or block fails.</li>
    <li>When you lose a card, you choose which one to turn face up. Coins spent on Poison or Banish are not returned.</li>
  </ol>`;

export default {
  id: 'court',
  name: 'Court Intrigue',
  emoji: '🎭',
  blurb: 'Claim any role, bluff boldly, call out the liars.',
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    { key: 'react', label: 'Reaction time', default: 8, choices: [[5, '5s'], [8, '8s'], [12, '12s']] },
  ],

  setup(players, opts, { first }) {
    const sec = [5, 8, 12].includes(Number(opts?.react)) ? Number(opts.react) : 8;
    return C.newGame(players, first % players.length, { reactMs: sec * 1000 });
  },

  randomFor(s, a, seat) {
    if (a.type === 'deal' && seat === -1 && s.phase === 'deal') return Array.from({ length: s.players.length * 2 }, (_, k) => s.deck.length - k);
    if (a.type === 'draw' && seat === -1 && s.phase === 'swapDraw') return [s.deck.length, s.deck.length - 1];
    if (a.type === 'challenge' && seat >= 0 && C.canChallenge(s, seat)) return [C.challengeRange(s)];
    return null;
  },

  apply(s, a, seat, { now, rand }) {
    if (!a || typeof a !== 'object') throw new Error('bad action');
    return C.applyAction(s, a, seat, { now, rand });
  },

  tick(s, { now }) {
    if (s.phase === 'deal') return { type: 'deal' };
    if (s.phase === 'swapDraw') return { type: 'draw' };
    if (s.phase === 'react' && now >= s.pending.until) return { type: 'timeout', at: s.pending.until };
    if (s.phase === 'lose' && now >= s.lose.until) return { type: 'timeout', at: s.lose.until };
    if (s.phase === 'swap' && now >= s.swap.until) return { type: 'timeout', at: s.swap.until };
    return null;
  },

  botDelay: 1100,
  bot(s, seat) { return C.botAction(s, seat); },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: C.faceDown(p), win: s.winner === i })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game court">
      <section class="table ci-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points ci-meta"></div></div>
        <div class="ci-rivals"></div>
        <div class="ci-stage">
          <div class="ci-claim"></div>
          <div class="ci-sub"><span class="ci-subtxt"></span><span class="ci-clock"></span></div>
          <div class="ci-bar"><span></span></div>
        </div>
        <ol class="ci-log"></ol>
        <div class="ci-me">
          <div class="ci-hand"></div>
          <div class="ci-purse"><div class="ci-purse-n"></div><div class="ci-purse-l">coins</div></div>
        </div>
        <div class="ci-controls"></div>
        <div class="hint ci-hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <div class="ci-sheet-bg hidden"><div class="ci-sheet">
        <h3>Spymaster’s swap</h3>
        <p class="ci-sheet-p"></p>
        <div class="ci-opts"></div>
        <button class="btn primary big ci-keepbtn" data-a="keep">Keep these</button>
      </div></div>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);

    let state = null;
    let sent = 0;
    let picking = null; // action waiting for a target
    let keepSel = [];
    let ctrlKey = '';
    let sheetKey = '';
    let countdown = null;

    const mySeat = () => api.mySeat();
    const meP = () => state?.players[mySeat()];
    const nameOf = (i) => (i === mySeat() ? 'You' : state.players[i].name);
    const nameObj = (i) => (i === mySeat() ? 'you' : state.players[i].name);

    function send(a) {
      sent = Date.now();
      api.act(a);
      setTimeout(() => { if (sent && Date.now() - sent > 5900) { sent = 0; render(); } }, 6000);
      render();
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b || !state || b.disabled) return;
      const a = b.dataset.a;
      const seat = mySeat();
      if (sent && a !== 'cancel') return;
      if (a === 'act') {
        const act = b.dataset.act;
        if (ACTIONS[act].target) {
          picking = act;
          render();
          return;
        }
        send({ type: 'act', act });
      } else if (a === 'target') {
        const t = Number(b.dataset.t);
        if (!picking || C.actionError(state, seat, picking, t)) return;
        const act = picking;
        picking = null;
        send({ type: 'act', act, target: t });
      } else if (a === 'cancel') {
        picking = null;
        render();
      } else if (a === 'challenge') {
        if (C.canChallenge(state, seat)) send({ type: 'challenge' });
      } else if (a === 'block') {
        if (C.canBlock(state, seat, b.dataset.role)) send({ type: 'block', role: b.dataset.role });
      } else if (a === 'pass') {
        if (C.waitingOn(state).includes(seat)) send({ type: 'pass' });
      } else if (a === 'reveal') {
        if (state.phase === 'lose' && state.lose.seat === seat) send({ type: 'reveal', idx: Number(b.dataset.idx) });
      } else if (a === 'opt') {
        const i = Number(b.dataset.i);
        if (keepSel.includes(i)) keepSel = keepSel.filter((x) => x !== i);
        else if (keepSel.length < state.swap.keep) keepSel = [...keepSel, i];
        else keepSel = [...keepSel.slice(1), i];
        renderSheet(true);
      } else if (a === 'keep') {
        if (state.phase === 'swap' && state.swap.seat === seat && keepSel.length === state.swap.keep) send({ type: 'keep', idx: keepSel });
      } else if (a === 'opensheet') {
        sheetKey = '';
        renderSheet();
      }
    });

    // ---------- pieces ----------
    const mini = (c) => (c.up
      ? `<span class="ci-mini up" style="--rc:var(--ci-${c.r})" title="${RNAME(c.r)}">${ICON(c.r)}</span>`
      : '<span class="ci-mini back"></span>');

    function bigCard(c, i, mode) {
      const R = ROLE_INFO[c.r];
      const tap = mode === 'lose' && !c.up;
      return `<button class="ci-role ${c.up ? 'up' : ''} ${tap ? 'tap' : ''}" style="--rc:var(--ci-${c.r})" ${tap ? `data-a="reveal" data-idx="${i}"` : 'disabled'}>
        <span class="ci-role-top"><span class="ci-role-ic">${R.icon}</span><span class="ci-role-nm">${R.name}</span></span>
        <span class="ci-role-pw">${R.power}${R.block ? `<br>${R.block}` : ''}</span>
        ${c.up ? '<span class="ci-stamp">revealed</span>' : ''}
      </button>`;
    }

    function renderRivals() {
      const seat = mySeat();
      const others = state.players.map((_, i) => i).filter((i) => i !== seat);
      const box = q('.ci-rivals');
      if (box.children.length !== others.length) {
        box.innerHTML = others.map(() => `<button class="ci-rival" data-a="target"><span class="ci-rname"><span class="nm"></span><span class="ci-rcoins"></span></span><span class="ci-rrow"><span class="ci-rcards"></span><span class="ci-rtag"></span></span></button>`).join('');
        box.dataset.n = String(others.length);
      }
      const P = state.pending;
      const wait = C.waitingOn(state);
      others.forEach((i, k) => {
        const p = state.players[i];
        const c = box.children[k];
        const out = !C.isIn(state, i);
        c.dataset.t = String(i);
        const canT = !!picking && !sent && !C.actionError(state, seat, picking, i);
        c.disabled = !canT;
        c.classList.toggle('pick', canT);
        c.classList.toggle('active', state.phase !== 'over' && state.current === i && !out);
        c.classList.toggle('win', state.phase === 'over' && state.winner === i);
        c.classList.toggle('out', out);
        c.classList.toggle('away', !api.isAlive(p.pid));
        c.classList.toggle('aimed', !!P && P.target === i && state.phase !== 'turn');
        c.classList.toggle('blocker', !!P?.block && P.block.seat === i && state.phase === 'react');
        c.querySelector('.nm').textContent = p.name;
        const coins = c.querySelector('.ci-rcoins');
        const ck = String(p.coins);
        if (coins.dataset.k !== ck) {
          if (coins.dataset.k != null) { coins.classList.remove('bump'); void coins.offsetWidth; coins.classList.add('bump'); }
          coins.dataset.k = ck;
          coins.innerHTML = `${COIN}${p.coins}`;
        }
        const cards = c.querySelector('.ci-rcards');
        const key = p.cards.map((x) => (x.up ? x.r : '?')).join(',');
        if (cards.dataset.k !== key) { cards.dataset.k = key; cards.innerHTML = p.cards.map(mini).join(''); }
        let tag = '';
        if (out) tag = 'out';
        else if (state.phase === 'react' && wait.includes(i)) tag = '⏳';
        else if (state.phase === 'react' && P.passed.includes(i)) tag = 'pass';
        else if (state.phase === 'lose' && state.lose.seat === i) tag = '⏳';
        else if (!api.isAlive(p.pid)) tag = 'away';
        c.querySelector('.ci-rtag').textContent = tag;
      });
    }

    function stageText() {
      const s = state;
      const P = s.pending;
      const seat = mySeat();
      if (s.phase === 'deal') return ['Shuffling the court deck…', ''];
      if (s.phase === 'over') return [s.winner === seat ? '<b>You</b> rule the court!' : `<b>${esc(s.players[s.winner].name)}</b> rules the court!`, 'Game over'];
      if (s.phase === 'turn') {
        const forced = s.players[s.current].coins >= C.MUST_BANISH;
        if (s.current === seat) return [picking ? `Choose who to <b>${ACTIONS[picking].label.toLowerCase()}</b>` : 'Your move — choose an action', forced ? '10+ coins: you must Banish' : ''];
        return [`<b>${esc(s.players[s.current].name)}</b> is plotting…`, forced ? 'must Banish (10+ coins)' : ''];
      }
      let ct = C.claimText(s, P);
      if (P.actor === seat) ct = ct.replace(/^(\w+?)s /, '$1 ');
      if (P.target === seat) ct = ct.replace(new RegExp(`${s.players[seat].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), 'you');
      const who = `<b>${esc(nameOf(P.actor))}</b> ${esc(ct).replace(/(💰|🧪|🩺|🗝️|🕵️) (\w+)/u, '$1 <b>$2</b>')}`;
      if (s.phase === 'react') {
        if (P.stage === 'blockChal') {
          return [`<b>${esc(nameOf(P.block.seat))}</b> ${P.block.seat === seat ? 'block' : 'blocks'} with ${ICON(P.block.role)} <b>${RNAME(P.block.role)}</b>`, 'Challenge the block?'];
        }
        const can = [];
        if (C.challengerSeats(s).length) can.push('Challenge');
        if (C.blockerSeats(s).length) can.push('Block');
        return [who, `${can.join(' or ')}?`];
      }
      if (s.phase === 'lose') return [who, `${esc(nameOf(s.lose.seat))} must reveal a card`];
      if (s.phase === 'swapDraw' || s.phase === 'swap') return [who, `${esc(nameOf(P.actor))} ${P.actor === seat ? 'are' : 'is'} choosing cards…`];
      return [who, ''];
    }

    function timerInfo() {
      const s = state;
      let until = 0; let total = 1;
      if (s.phase === 'react') { until = s.pending.until; total = s.reactMs; }
      else if (s.phase === 'lose') { until = s.lose.until; total = C.LOSE_MS; }
      else if (s.phase === 'swap') { until = s.swap.until; total = C.SWAP_MS; }
      if (!until) return null;
      const left = Math.max(0, until - api.hostNow());
      return { left, pct: Math.max(0, Math.min(100, (left / total) * 100)) };
    }

    function renderClock() {
      if (!state) return;
      const t = timerInfo();
      q('.ci-clock').textContent = t ? `${Math.ceil(t.left / 1000)}s` : '';
      const bar = q('.ci-bar');
      bar.classList.toggle('off', !t);
      bar.firstElementChild.style.width = t ? `${t.pct}%` : '0%';
      bar.classList.toggle('low', !!t && t.left < 2500);
    }

    function renderStage() {
      const [a, b] = stageText();
      const claim = q('.ci-claim');
      if (claim.innerHTML !== a) claim.innerHTML = a;
      q('.ci-subtxt').innerHTML = b;
      const st = q('.ci-stage');
      st.classList.toggle('hot', state.phase === 'react');
      st.classList.toggle('blk', state.phase === 'react' && state.pending.stage === 'blockChal');
      renderClock();
    }

    function renderLog() {
      const lines = (state.log || []).slice(-3);
      const key = `${state.log.length}:${lines.join('|')}`;
      const box = q('.ci-log');
      if (box.dataset.k === key) return;
      box.dataset.k = key;
      box.innerHTML = lines.map((l, i) => `<li class="${i === lines.length - 1 ? 'new' : ''}">${esc(l)}</li>`).join('');
    }

    function renderMe() {
      const me = meP();
      const wrap = q('.ci-me');
      wrap.classList.toggle('hidden', !me);
      if (!me) return;
      const mode = state.phase === 'lose' && state.lose.seat === mySeat() && !sent ? 'lose' : '';
      const hand = q('.ci-hand');
      const key = `${mode}|${me.cards.map((c) => `${c.r}${c.up ? 'u' : ''}`).join(',')}`;
      if (hand.dataset.k !== key) { hand.dataset.k = key; hand.innerHTML = me.cards.map((c, i) => bigCard(c, i, mode)).join(''); }
      const pn = q('.ci-purse-n');
      if (pn.dataset.k !== String(me.coins)) {
        if (pn.dataset.k != null) { pn.classList.remove('bump'); void pn.offsetWidth; pn.classList.add('bump'); }
        pn.dataset.k = String(me.coins);
        pn.innerHTML = `${COIN}<b>${me.coins}</b>`;
      }
      q('.ci-me').classList.toggle('active', state.phase === 'turn' && state.current === mySeat());
      q('.ci-me').classList.toggle('aimed', !!state.pending && state.pending.target === mySeat() && state.phase !== 'turn');
    }

    function controls() {
      // returns [key, html]
      const s = state;
      const seat = mySeat();
      const me = meP();
      if (!me) return ['spec', '<div class="ci-note">You’re watching this game.</div>'];
      if (!C.isIn(s, seat) && s.phase !== 'over') return ['outx', '<div class="ci-note">You’re out — enjoy the intrigue.</div>'];
      if (sent) return ['sent', '<div class="ci-note">Sending…</div>'];
      if (s.phase === 'turn' && s.current === seat) {
        if (picking) {
          const ts = C.alive(s).filter((i) => i !== seat);
          return [`pick:${picking}:${s.turn}`, `<div class="ci-targets">${ts.map((i) => {
            const bad = C.actionError(s, seat, picking, i);
            return `<button class="btn ci-tbtn" data-a="target" data-t="${i}" ${bad ? 'disabled' : ''}><span>${esc(s.players[i].name)}</span><small>${s.players[i].coins} coins · ${C.faceDown(s.players[i])} card${C.faceDown(s.players[i]) === 1 ? '' : 's'}</small></button>`;
          }).join('')}<button class="btn ghost ci-tbtn ci-cancel" data-a="cancel">Cancel</button></div>`];
        }
        const hand = me.cards.filter((c) => !c.up).map((c) => c.r);
        const key = `turn:${s.turn}:${me.coins}:${hand.join(',')}`;
        return [key, `<div class="ci-acts">${C.ACTION_ORDER.map((act) => {
          const A = ACTIONS[act];
          const bad = C.actionError(s, seat, act, A.target ? C.alive(s).find((i) => i !== seat && (act !== 'steal' || s.players[i].coins > 0)) ?? -1 : null);
          const role = A.role;
          const mine = role && hand.includes(role);
          return `<button class="ci-act ${role ? 'role' : ''} ${mine ? 'mine' : ''}" ${role ? `style="--rc:var(--ci-${role})"` : ''} data-a="act" data-act="${act}" ${bad ? 'disabled' : ''}>
            <span class="ci-act-ic">${role ? ICON(role) : act === 'wages' ? '🪙' : act === 'petition' ? '📜' : '⚔️'}</span>
            <span class="ci-act-l">${A.label}</span><span class="ci-act-s">${A.sub}${mine ? ' ✓' : ''}</span></button>`;
        }).join('')}</div>`];
      }
      if (s.phase === 'react' && C.waitingOn(s).includes(seat)) {
        const P = s.pending;
        const btns = [];
        if (C.canChallenge(s, seat)) {
          const r = P.stage === 'blockChal' ? P.block.role : P.role;
          btns.push(`<button class="btn big ci-chal" data-a="challenge">Challenge<small>${ICON(r)} ${RNAME(r)}?</small></button>`);
        }
        if (C.canBlock(s, seat)) {
          for (const r of ACTIONS[P.act].blockers) btns.push(`<button class="btn big ci-blk" style="--rc:var(--ci-${r})" data-a="block" data-role="${r}">Block<small>as ${ICON(r)} ${RNAME(r)}</small></button>`);
        }
        btns.push(`<button class="btn big ci-pass" data-a="pass">Let it go<small>${P.stage === 'blockChal' ? 'block stands' : 'allow'}</small></button>`);
        return [`react:${P.stage}:${s.fx.n}:${btns.length}`, `<div class="ci-reacts n${btns.length}">${btns.join('')}</div>`];
      }
      if (s.phase === 'lose' && s.lose.seat === seat) {
        return [`lose:${s.fx.n}`, `<div class="ci-reacts n2">${me.cards.map((c, i) => (c.up ? '' : `<button class="btn big ci-revbtn" style="--rc:var(--ci-${c.r})" data-a="reveal" data-idx="${i}">Reveal<small>${ICON(c.r)} ${RNAME(c.r)}</small></button>`)).join('')}</div>`];
      }
      if (s.phase === 'swap' && s.swap.seat === seat) {
        return [`swap:${s.turn}`, '<div class="ci-reacts n1"><button class="btn primary big" data-a="opensheet">Choose cards to keep</button></div>'];
      }
      return ['idle', '<div class="ci-note ci-idle"></div>'];
    }

    function renderControls() {
      const [key, html] = controls();
      const box = q('.ci-controls');
      if (key !== ctrlKey) { ctrlKey = key; box.innerHTML = html; }
      const idle = box.querySelector('.ci-idle');
      if (idle) {
        const s = state;
        const seat = mySeat();
        let t = '';
        if (s.phase === 'react' && s.pending.passed.includes(seat)) t = 'You let it go — waiting on the others…';
        else if (s.phase === 'react') t = s.pending.actor === seat || s.pending.block?.seat === seat ? 'Your claim is on the table…' : 'Watching the court…';
        else if (s.phase === 'over') t = s.winner === seat ? 'Long may you reign!' : 'The court has spoken.';
        else if (s.phase === 'turn') t = 'Wait for your turn…';
        else t = 'Watching the court…';
        if (idle.textContent !== t) idle.textContent = t;
      }
    }

    function renderSheet(force = false) {
      const s = state;
      const bg = q('.ci-sheet-bg');
      const mine = s.phase === 'swap' && s.swap.seat === mySeat() && !sent;
      if (!mine) { bg.classList.add('hidden'); sheetKey = ''; return; }
      const key = `swap:${s.turn}`;
      if (key !== sheetKey) {
        sheetKey = key;
        keepSel = s.swap.options.map((_, i) => i).slice(0, s.swap.keep);
        force = true;
        bg.classList.remove('hidden');
        q('.ci-sheet').classList.remove('pop'); void q('.ci-sheet').offsetWidth; q('.ci-sheet').classList.add('pop');
      }
      if (!force) return;
      q('.ci-sheet-p').textContent = `Tap ${s.swap.keep === 1 ? 'the card' : `${s.swap.keep} cards`} to keep. The rest go back into the court deck.`;
      q('.ci-opts').innerHTML = s.swap.options.map((r, i) => {
        const R = ROLE_INFO[r];
        const fresh = i >= s.swap.keep;
        return `<button class="ci-opt ${keepSel.includes(i) ? 'on' : ''}" style="--rc:var(--ci-${r})" data-a="opt" data-i="${i}">
          <span class="ci-opt-ic">${R.icon}</span><span class="ci-opt-nm">${R.name}</span><span class="ci-opt-tag">${fresh ? 'new' : 'yours'}</span></button>`;
      }).join('');
      q('.ci-keepbtn').disabled = keepSel.length !== s.swap.keep;
    }

    function render() {
      if (!state) return;
      const s = state;
      const seat = mySeat();
      if (picking && !(s.phase === 'turn' && s.current === seat)) picking = null;
      const tl = q('.turn-label');
      tl.textContent = s.phase === 'over' ? (s.winner === seat ? 'You win!' : `${s.players[s.winner].name} wins!`)
        : s.phase === 'deal' ? 'Dealing…'
          : s.current === seat ? 'Your turn' : `${s.players[s.current].name}’s turn`;
      q('.ci-meta').innerHTML = `Deck <strong>${s.deck.length}</strong>`;
      renderRivals();
      renderStage();
      renderLog();
      renderMe();
      renderControls();
      renderSheet();
      let hint = '';
      const me = meP();
      if (s.phase === 'turn' && s.current === seat && !sent) {
        hint = picking ? 'Tap a rival, or Cancel.' : 'Bluffing is allowed · ✓ = a role you hold';
      } else if (s.phase === 'react' && C.waitingOn(s).includes(seat)) {
        hint = s.pending.target === seat ? 'This is aimed at you!' : 'Smell a bluff? Challenge before time runs out.';
      } else if (s.phase === 'lose' && s.lose.seat === seat) hint = 'Tap the card you’ll give up.';
      else if (s.phase === 'turn' && me && C.isIn(s, seat) && !api.isAlive(s.players[s.current].pid)) hint = `Waiting for ${s.players[s.current].name} to come back…`;
      q('.ci-hint').textContent = hint;
    }

    function fxBanner(old, next) {
      const f = next.fx;
      if (!old || !f || f.n === old.fx?.n) return;
      const B = q('.banner');
      const seat = mySeat();
      if (f.kind === 'proved') banner(B, f.seat === seat ? 'TRUE!' : 'NO BLUFF!', 'bank', 1500);
      else if (f.kind === 'caught') banner(B, f.seat === seat ? 'CAUGHT!' : 'BLUFF!', 'farkle', 1500);
      else if (f.kind === 'out' && next.phase !== 'over') banner(B, f.seat === seat ? 'YOU’RE OUT' : `${next.players[f.seat].name.toUpperCase()} OUT`, 'farkle', 1600);
    }

    return {
      update(next) {
        const old = state;
        state = next;
        if (old && (old.fx?.n !== next.fx?.n || old.phase !== next.phase || old.turn !== next.turn || (old.pending?.passed.length ?? 0) !== (next.pending?.passed.length ?? 0))) sent = 0;
        fxBanner(old, next);
        render();
        clearInterval(countdown);
        if (['react', 'lose', 'swap'].includes(next.phase)) countdown = setInterval(renderClock, 200);
        const seat = mySeat();
        if (old && next.phase === 'turn' && next.current === seat && (old.current !== seat || old.phase !== 'turn')) turnPill(q('.turn-banner'), 'Your turn', 300);
        if (old && old.phase !== 'over' && next.phase === 'over') banner(q('.banner'), next.winner === seat ? 'YOU WIN!' : 'GAME OVER', 'hot', 2600);
      },
      refresh: render,
      destroy() { clearInterval(countdown); el.remove(); },
    };
  },
};
