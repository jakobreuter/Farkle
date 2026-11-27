import * as D from '../engines/draft.js';
import { h, esc, banner, turnPill } from '../ui.js';

const typeInfo = (k) => D.TYPES[D.typeOf(k)];
/** extra line on a card face (bites show their points) */
const shortOf = (k) => (D.BITES[k] ? `${D.BITES[k].v} pt${D.BITES[k].v > 1 ? 's' : ''}` : D.TYPES[k].short);

const rulesHTML = () => `
  <ol>
    <li>Every round each player is dealt a hand of snacks (10 cards with 2 players, 9 with 3, 8 with 4, 7 with 5–6).</li>
    <li>Everyone <b>secretly picks one card at the same time</b>. When all have picked, the picks are revealed onto each player’s table.</li>
    <li>Then pass the rest of your hand: <b>left</b> in rounds 1 and 3, <b>right</b> in round 2. Pick again from the hand you receive, until the hands run out.</li>
    <li>Score your table at the end of each round, then clear it. <b>Cupcakes</b> and <b>Fortune Cookies</b> stay and score at the end of the game.</li>
    <li>Each game uses <b>8 of the 12 snacks</b> (see “This game’s menu”). A fresh deck is shuffled every round. Highest total wins; a tie goes to the most cupcakes.</li>
  </ol>
  <table>${D.TYPE_IDS.map((t) => `<tr><td>${D.TYPES[t].emoji} ${esc(D.TYPES[t].name)}</td><td style="text-align:left;font-weight:500">${esc(D.TYPES[t].rule)}</td></tr>`).join('')}</table>`;

/** one-word progress note for a group on my table */
function groupNote(type, n, entries) {
  switch (type) {
    case 'popcorn': return n % 3 ? `${3 - (n % 3)} more → +10` : 'complete!';
    case 'pretzel': return n % 2 ? '1 more → +5' : 'paired!';
    case 'taco': return n >= 5 ? '+3 each now' : `next: +${[1, 2, 2, 3, 4][n]}`;
    case 'hotsauce': {
      const open = entries.filter((e) => !e.used).length;
      return open ? `${open} ready: next bite ×3` : 'all used';
    }
    case 'broccoli': return n >= 3 ? 'crunch time!' : `${3 - n} more → +${4 * 3 + 2 * n}`;
    case 'pickle': return n === 1 ? 'lone pickle' : 'too many!';
    case 'soda': return 'majority';
    case 'donut': return 'variety';
    case 'cupcake': return 'scores at end';
    case 'fortune': return 'scores at end';
    default: return '';
  }
}

export default {
  id: 'draft',
  name: 'Snack Draft',
  emoji: '🍿',
  blurb: 'Pick one snack, pass the rest. Build the tastiest table.',
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    { key: 'menu', label: 'Menu', default: 'random', choices: [['random', 'Random each game'], ['classic', 'Classic']] },
    { key: 'rounds', label: 'Rounds', default: 3, choices: [[3, '3 rounds'], [2, '2 (quick)']] },
  ],

  setup(players, opts, { now }) {
    const menu = String(opts?.menu ?? 'random') === 'classic' ? D.CLASSIC : null;
    return D.newGame(players, { menu, rounds: Number(opts?.rounds) === 2 ? 2 : 3, now });
  },

  randomFor(s, a, seat) { return D.randomNeeds(s, a, seat); },

  apply(s, a, seat, { now, rand }) {
    if (!a || typeof a !== 'object') throw new Error('bad action');
    const system = ['menu', 'deal', 'pass', 'next'].includes(a.type);
    if (system !== (seat === -1)) throw new Error(system ? 'system only' : 'player only');
    if (a.type === 'pick') return D.applyAction(s, { type: 'pick', i: a.i, k: a.k }, seat, { now });
    return D.applyAction(s, { type: a.type }, seat, { now, rand });
  },

  tick(s, { now }) { return D.tick(s, now); },

  botDelay: 500,
  bot(s, seat) { return D.botPick(s, seat); },

  results(s) {
    const w = s.phase === 'over' ? D.winners(s) : [];
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.total, win: w.includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game draft">
      <section class="table sd-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points sd-meta"></div></div>
        <div class="sd-seats"></div>
        <div class="sel-line sd-wait"></div>
        <div class="sd-handwrap">
          <div class="sd-handlabel"><span class="sd-hl1">Your hand</span><span class="sd-hl2"></span></div>
          <div class="sd-hand"></div>
        </div>
        <div class="controls"><button class="btn primary big sd-take" data-a="take">Take it</button></div>
        <div class="hint"><span class="sd-hint"></span></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <section class="sd-mine">
        <div class="sd-minehead"><span class="sd-mt">Your table</span><span class="sd-ms"></span></div>
        <div class="sd-groups"></div>
      </section>
      <details class="sd-menu" open>
        <summary>This game’s menu</summary>
        <div class="sd-menulist"></div>
      </details>
      <div class="sd-sheetbg hidden"><div class="sd-sheet"></div></div>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);

    let state = null;
    let sel = -1; // selected hand index
    let selKey = ''; // the hand the selection belongs to
    let sent = 0;
    let handKey = '';
    let seatKey = '';
    let menuKey = '';
    let sheetKey = '';
    let sheetClosed = '';
    let countdown = null;
    let sentTimer = null;

    const mySeat = () => api.mySeat();
    const me = () => state?.players[mySeat()];
    const nm = (i) => (i === mySeat() ? 'You' : state.players[i].name);
    const canPick = () => state && state.phase === 'pick' && me() && me().pick == null && !sent;
    const curHandKey = () => `${state.round}:${state.pickNo}:${me()?.hand.join(',')}`;
    const passTo = () => {
      const n = state.players.length;
      return (mySeat() + D.passDir(state.round) + n) % n;
    };

    function take(i) {
      const p = me();
      if (!canPick() || i < 0 || i >= p.hand.length) return;
      sent = Date.now();
      api.act({ type: 'pick', i, k: p.hand[i] });
      clearTimeout(sentTimer);
      sentTimer = setTimeout(() => { if (sent && Date.now() - sent > 5900) { sent = 0; render(); } }, 6000);
      render();
    }

    el.addEventListener('click', (e) => {
      if (!state) return;
      const card = e.target.closest('.sd-card');
      if (card && card.closest('.sd-hand')) {
        if (!canPick()) return;
        const i = Number(card.dataset.i);
        if (sel === i) take(i);
        else { sel = i; selKey = curHandKey(); render(); }
        return;
      }
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.a === 'take') take(sel);
      if (b.dataset.a === 'close') { sheetClosed = sheetKey; renderSheet(); }
    });

    // ---- pieces ----
    function cardHTML(k, i, extra = '') {
      const t = D.typeOf(k);
      return `<button class="sd-card sdt-${t} ${extra}" data-i="${i}" style="--d:${i * 40}ms" aria-label="${esc(D.cardName(k))}">
        <span class="sd-em">${D.cardEmoji(k)}</span><span class="sd-nm">${esc(D.cardName(k))}</span><span class="sd-sh">${esc(shortOf(k))}</span></button>`;
    }

    function summaryLine(p) {
      const c = {};
      for (const e of [...p.table, ...p.keep]) {
        if (e.dud) continue;
        const em = D.cardEmoji(D.typeOf(e.k) === 'bites' ? 'bites' : e.k);
        c[em] = (c[em] || 0) + 1;
      }
      const parts = Object.entries(c).map(([em, n]) => `<span>${em}${n > 1 ? `<i>${n}</i>` : ''}</span>`);
      return parts.length ? parts.join('') : '<span class="sd-empty">nothing yet</span>';
    }

    function renderSeats() {
      const box = q('.sd-seats');
      const n = state.players.length;
      if (box.children.length !== n) {
        box.innerHTML = state.players.map(() => `<div class="sd-seat"><div class="sd-st"><span class="nm"></span><b class="sd-tot"></b></div>
          <div class="sd-sb"><span class="sd-stat"></span><span class="sd-sum"></span></div></div>`).join('');
        box.dataset.n = String(n);
      }
      const rev = state.phase === 'reveal' ? state.reveal : null;
      state.players.forEach((p, i) => {
        const c = box.children[i];
        c.classList.toggle('me', i === mySeat());
        c.classList.toggle('waiting', state.phase === 'pick' && p.pick == null);
        c.classList.toggle('away', !api.isAlive(p.pid));
        c.querySelector('.nm').textContent = i === mySeat() ? `${p.name} (you)` : p.name;
        c.querySelector('.sd-tot').textContent = String(p.total);
        const stat = c.querySelector('.sd-stat');
        let sk;
        let html;
        if (rev) {
          const r = rev.cards[i];
          sk = `r${rev.no}`;
          html = `<span class="sd-flip" style="--d:${i * 120}ms">${D.cardEmoji(r.e.dud ? 'leftovers' : r.e.k)}${r.e.x ? '<em>×3</em>' : ''}</span>`;
        } else if (state.phase === 'pick') {
          sk = p.pick != null ? 'done' : 'think';
          html = p.pick != null ? '<span class="sd-done">✓</span>' : '<span class="sd-think"><i></i><i></i><i></i></span>';
        } else { sk = 'idle'; html = ''; }
        if (stat.dataset.k !== sk) { stat.dataset.k = sk; stat.innerHTML = html; }
        const sum = c.querySelector('.sd-sum');
        const sumHTML = summaryLine(p);
        if (sum.innerHTML !== sumHTML) sum.innerHTML = sumHTML;
      });
      seatKey = '';
    }

    function renderHand() {
      const wrap = q('.sd-handwrap');
      const box = q('.sd-hand');
      const p = me();
      if (!p) {
        if (handKey !== 'spec') { handKey = 'spec'; box.innerHTML = '<div class="sd-watch">You’re watching — hands are secret.</div>'; }
        q('.sd-hl2').textContent = '';
        return;
      }
      const key = curHandKey() + (state.phase === 'reveal' ? ':r' : '');
      if (key !== handKey) {
        const fresh = state.phase === 'pick' && !handKey.endsWith(':r') ? 'sd-dealt' : state.phase === 'pick' ? `sd-in sd-from${D.passDir(state.round) > 0 ? 'l' : 'r'}` : '';
        handKey = key;
        box.innerHTML = p.hand.length ? p.hand.map((k, i) => cardHTML(k, i, fresh)).join('')
          : `<div class="sd-watch">${state.phase === 'reveal' ? 'Last card served!' : state.phase === 'scored' || state.phase === 'over' ? 'Hands are empty.' : 'Shuffling…'}</div>`;
      }
      if (selKey !== curHandKey()) sel = -1;
      if (p.pick != null) sel = p.pick;
      wrap.classList.toggle('passing', state.phase === 'reveal');
      wrap.classList.toggle('locked', p.pick != null || !!sent);
      box.querySelectorAll('.sd-card').forEach((b) => {
        const i = Number(b.dataset.i);
        b.classList.toggle('sel', i === sel);
        b.disabled = !(canPick() || (p.pick != null && i === p.pick));
      });
      const n = state.players.length;
      q('.sd-hl2').textContent = state.phase === 'pick' || state.phase === 'reveal'
        ? `${p.hand.length} card${p.hand.length === 1 ? '' : 's'} · rest go ${D.passDir(state.round) > 0 ? '→' : '←'} ${n > 1 ? state.players[passTo()].name : ''}` : '';
    }

    function renderMine() {
      const p = me();
      const mine = q('.sd-mine');
      mine.classList.toggle('hidden', !p);
      if (!p) return;
      const tables = state.players.map((x) => x.table);
      const scores = D.scoreTables(tables)[mySeat()];
      const groups = new Map();
      for (const e of p.table) {
        const t = e.dud ? 'leftovers' : D.typeOf(e.k);
        if (!groups.has(t)) groups.set(t, []);
        groups.get(t).push(e);
      }
      for (const e of p.keep) {
        const t = D.typeOf(e.k);
        if (!groups.has(t)) groups.set(t, []);
        groups.get(t).push({ ...e, kept: true });
      }
      const order = D.TYPE_IDS.filter((t) => groups.has(t));
      const html = order.length ? order.map((t) => {
        const es = groups.get(t);
        const live = es.filter((e) => !e.dud);
        const pts = scores[t];
        const ems = es.map((e) => `<span class="${e.x ? 'hot' : ''}${e.lo ? ' lo' : ''}${e.kept ? ' kept' : ''}">${D.cardEmoji(e.dud ? 'leftovers' : e.k)}</span>`).join('');
        const note = t === 'leftovers' ? 'nothing to copy' : groupNote(t, live.length, es);
        return `<div class="sd-grp sdt-${t}"><div class="sd-gems">${ems}</div>
          <div class="sd-gtxt"><span class="sd-gnm">${esc(D.TYPES[t].name)}</span><span class="sd-gnote">${esc(note)}</span></div>
          <b class="sd-gpts">${pts == null ? '' : pts}</b></div>`;
      }).join('') : `<div class="sd-none">${state.phase === 'pick' || state.phase === 'menu' || state.phase === 'deal' ? 'Pick a card — it lands here.' : 'Table cleared.'}</div>`;
      const box = q('.sd-groups');
      if (box.dataset.h !== html) {
        box.dataset.h = html;
        box.innerHTML = html;
        if (state.phase === 'reveal') {
          const last = p.table[p.table.length - 1];
          if (last) box.querySelector(`.sdt-${last.dud ? 'leftovers' : D.typeOf(last.k)}`)?.classList.add('pop');
        }
      }
      q('.sd-ms').innerHTML = state.phase === 'scored' || state.phase === 'over'
        ? `Total <b>${p.total}</b>`
        : `This round <b>${D.sum(scores)}</b> · total <b>${p.total}</b>`;
      q('.sd-mt').textContent = state.round ? `Your table · round ${state.round}` : 'Your table';
    }

    function renderMenu() {
      const menu = state.menu;
      const key = menu ? menu.join() : '';
      if (key === menuKey) return;
      menuKey = key;
      q('.sd-menulist').innerHTML = menu ? menu.map((t) => `<div class="sd-mi sdt-${t}"><span class="sd-mie">${D.TYPES[t].emoji}</span>
        <div><b>${esc(D.TYPES[t].name)}</b>${D.END_TYPES.includes(t) ? '<span class="sd-tag">end of game</span>' : ''}<p>${esc(D.TYPES[t].rule)}</p></div></div>`).join('')
        : '<div class="sd-none">Choosing tonight’s menu…</div>';
    }

    function renderSheet() {
      const bg = q('.sd-sheetbg');
      const sm = state.summary;
      const show = state.phase === 'scored' && sm;
      const key = show ? `s${sm.round}` : '';
      if (!show || sheetClosed === key) { bg.classList.add('hidden'); return; }
      const fin = state.round >= state.rounds ? state.final : null;
      const secs = Math.max(0, Math.ceil((state.until - api.hostNow()) / 1000));
      if (key !== sheetKey) {
        sheetKey = key;
        const order = state.players.map((_, i) => i).sort((a, b) => state.players[b].total - state.players[a].total);
        const seat = mySeat();
        const mine = seat >= 0 ? sm.by[seat] : null;
        const parts = (o) => Object.entries(o || {}).map(([t, v]) => `<span class="sd-chip">${D.TYPES[t].emoji} ${v > 0 ? '+' : ''}${v}</span>`).join('');
        q('.sd-sheet').innerHTML = `<h3>${fin ? 'Final scores' : `Round ${sm.round} scored`}</h3>
          <table class="sd-stab"><thead><tr><th></th><th>Rnd</th>${fin ? '<th>End</th>' : ''}<th>Total</th></tr></thead><tbody>
          ${order.map((i) => `<tr class="${i === seat ? 'me' : ''}"><td>${esc(nm(i))}</td><td>${D.sum(sm.by[i])}</td>${fin ? `<td>${D.sum(fin[i]) > 0 ? '+' : ''}${D.sum(fin[i])}</td>` : ''}<td><b>${state.players[i].total}</b></td></tr>`).join('')}
          </tbody></table>
          ${mine ? `<div class="sd-brk"><span class="sd-bl">You scored</span>${parts(mine) || '<span class="sd-chip">nothing</span>'}</div>` : ''}
          ${fin && seat >= 0 ? `<div class="sd-brk"><span class="sd-bl">Desserts</span>${parts(fin[seat]) || '<span class="sd-chip">none</span>'}</div>` : ''}
          <div class="sd-foot"><span class="sd-cd"></span><button class="btn" data-a="close">OK</button></div>`;
        q('.sd-sheet').classList.remove('pop'); void q('.sd-sheet').offsetWidth; q('.sd-sheet').classList.add('pop');
      }
      bg.classList.remove('hidden');
      q('.sd-cd').textContent = fin ? `Results in ${secs}s…` : `Next round in ${secs}s…`;
    }

    function render() {
      if (!state) return;
      const seat = mySeat();
      const p = me();
      const tl = q('.turn-label');
      const ph = state.phase;
      let label;
      if (ph === 'over') {
        const w = D.winners(state);
        label = w.includes(seat) ? (w.length > 1 ? 'You tie for the win!' : 'You win!') : `${w.map((i) => state.players[i].name).join(' & ')} win${w.length > 1 ? '' : 's'}!`;
      } else if (ph === 'menu' || ph === 'deal') label = 'Dealing…';
      else if (ph === 'reveal') label = 'Reveal!';
      else if (ph === 'scored') label = state.round >= state.rounds ? 'Final scoring' : `Round ${state.round} scored`;
      else if (!p) label = 'Everyone is picking';
      else label = p.pick != null || sent ? 'Served! Waiting…' : 'Pick a snack';
      tl.textContent = label;
      q('.sd-meta').innerHTML = state.round && ph !== 'over'
        ? `Round <strong>${state.round}</strong>/${state.rounds} · pick ${Math.min(state.hand, state.pickNo + (ph === 'pick' ? 1 : 0))}/${state.hand}` : '';

      renderSeats();
      renderHand();
      renderMine();
      renderMenu();
      renderSheet();

      // waiting line
      let wait = '';
      if (ph === 'pick') {
        const w = D.waitingFor(state).filter((i) => i !== seat);
        const meWait = p && p.pick == null && !sent;
        if (!w.length && meWait) wait = 'Everyone else has picked — your call!';
        else if (w.length) {
          const names = w.map((i) => state.players[i].name);
          wait = `Waiting for ${names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')}…`;
        } else wait = 'Revealing…';
      } else if (ph === 'reveal') {
        wait = state.players[0].hand.length ? `Passing hands ${D.passDir(state.round) > 0 ? 'left →' : '← right'}` : 'Last picks of the round!';
      } else if (ph === 'scored') wait = state.round >= state.rounds ? 'Desserts are in!' : 'Clearing the tables…';
      else if (ph === 'over') wait = 'Thanks for snacking!';
      else wait = 'Shuffling a fresh deck…';
      q('.sd-wait').textContent = wait;

      // take button + hint
      const btn = q('.sd-take');
      const has = canPick() && sel >= 0 && sel < p.hand.length;
      btn.disabled = !has;
      btn.textContent = p && p.pick != null ? 'Served ✓' : has ? `Take ${D.cardName(p.hand[sel])}` : 'Take it';
      q('.controls').classList.toggle('hidden', !p);
      let hint = '';
      if (!p) hint = ph === 'pick' ? 'Players are choosing in secret.' : '';
      else if (ph === 'pick' && sent && p.pick == null) hint = 'Sending…';
      else if (ph === 'pick' && p.pick != null) hint = 'Your pick is face-down until everyone has chosen.';
      else if (ph === 'pick' && has) {
        const k = p.hand[sel];
        let extra = '';
        if (k === 'leftovers') {
          const prev = p.table[p.table.length - 1];
          extra = prev ? ` Now it would be ${D.cardEmoji(prev.k)} ${D.cardName(prev.k)}.` : ' Right now it would score nothing.';
        } else if (D.BITES[k] && p.table.some((e) => e.k === 'hotsauce' && !e.used)) extra = ' Hot sauce makes it ×3!';
        hint = `<b>${esc(D.cardName(k))}:</b> ${esc(D.BITES[k] ? `${D.BITES[k].v} point${D.BITES[k].v > 1 ? 's' : ''}.` : typeInfo(k).rule)}${esc(extra)} Tap again to take it.`;
      } else if (ph === 'pick') hint = 'Tap a card to look, tap again to take it.';
      else if (ph === 'reveal') hint = 'Everyone flips their pick…';
      q('.sd-hint').innerHTML = hint;
    }

    return {
      update(next, prev) {
        const old = state || prev || null;
        state = next;
        const seat = mySeat();
        const myPick = next.players[seat]?.pick;
        if (sent && (myPick != null || next.phase !== 'pick' || (old && old.pickNo !== next.pickNo))) sent = 0;
        render();
        clearInterval(countdown);
        if (next.phase === 'scored') countdown = setInterval(renderSheet, 500);
        if (old && old.phase === 'pick' && next.phase === 'reveal' && next.reveal) {
          if (next.players[0].hand.length === 0) banner(q('.banner'), 'LAST BITE!', 'bank', 1100);
        }
        if (old && old.phase !== 'pick' && next.phase === 'pick' && next.pickNo === 0 && seat >= 0) {
          turnPill(q('.turn-banner'), `Round ${next.round}`, 150);
        }
        if (old && old.phase !== 'over' && next.phase === 'over') {
          const w = D.winners(next);
          banner(q('.banner'), w.includes(seat) ? 'YOU WIN!' : 'GAME OVER', 'hot', 2600);
        }
      },
      refresh: render,
      destroy() { clearInterval(countdown); clearTimeout(sentTimer); el.remove(); },
    };
  },
};
