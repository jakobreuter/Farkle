import * as L from '../engines/liars.js';
import { createDie, ROLL_MS } from '../dice.js';
import { h, esc, banner, turnPill } from '../ui.js';

const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
/** small flat die (used for revealed dice, bid display and the face picker) */
const flat = (v, cls = '') => `<span class="lz-flat v${v} ${cls}">${Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[v].includes(k) ? 'on' : ''}"></i>`).join('')}</span>`;
const CUP = '<svg class="lz-cupsvg" viewBox="0 0 40 34" aria-hidden="true"><path d="M7 2 H33 L38 30 Q20 35 2 30 Z" fill="#7a4a24" stroke="#3d240f" stroke-width="1.5"/><path d="M9 6 H31" stroke="#a8703f" stroke-width="2.5" stroke-linecap="round"/><path d="M5 25 Q20 29 35 25" stroke="#e2a72e" stroke-width="2" fill="none"/></svg>';

// a tiny deterministic jitter so bots don't all play identically (no Math.random in rules)
const jitter = (s, seat, f) => (((s.round * 131 + seat * 71 + f * 29 + s.bids.length * 17) % 97) / 97) * 0.06;

function botMove(s, seat) {
  const me = s.players[seat];
  const have = (f) => me.dice.filter((v) => L.counts(s, v, f)).length;
  const faces = [];
  for (let f = L.minFace(s); f <= 6; f++) faces.push(f);
  if (!s.bid) {
    // opening: the face we hold most, at the largest quantity that is still likely
    let best = null;
    for (const f of faces) {
      let q = 1;
      while (q < L.totalDice(s) && L.chanceFor(s, seat, q + 1, f) >= 0.8) q++;
      const score = q + have(f) * 0.3 + f * 0.01 + jitter(s, seat, f);
      if (!best || score > best.score) best = { q, f, score };
    }
    return { type: 'bid', q: best.q, f: best.f };
  }
  const pTrue = L.chanceFor(s, seat, s.bid.q, s.bid.f);
  let best = null;
  for (const f of faces) {
    const q = L.minQty(s, f);
    if (q == null) continue;
    const p = L.chanceFor(s, seat, q, f);
    const score = p + have(f) * 0.04 + jitter(s, seat, f);
    if (!best || score > best.score) best = { q, f, p, score };
  }
  if (!best || pTrue < 0.35 || (best.p < 0.3 && pTrue < 0.55)) return { type: 'liar' };
  return { type: 'bid', q: best.q, f: best.f };
}

const rulesHTML = () => `
  <ol>
    <li>Everyone rolls their dice in secret under a cup. You only see your own.</li>
    <li>Take turns bidding on <b>all</b> the dice on the table: “four 5s” means <i>at least four dice showing 5, counting everyone’s</i>.</li>
    <li>Each bid must go higher: more dice of any face, or the same number of a higher face.</li>
    <li>Think the last bid is a stretch? Call <b>Liar!</b> Every cup is lifted and the dice are counted.</li>
    <li>If the bid was true, the caller loses a die. If not, the bidder does. The loser starts the next round.</li>
    <li>Lose all your dice and you’re out. The last player with dice wins.</li>
    <li><b>Ones are wild</b> (if the host left it on): 1s count as every face, and you can’t bid on 1s.</li>
  </ol>`;

export default {
  id: 'liars',
  name: 'Liar’s Dice',
  emoji: '🤥',
  blurb: 'Bluff about the dice under every cup.',
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    { key: 'wild', label: 'Ones are wild', default: 'on', choices: [['on', 'On'], ['off', 'Off']] },
    { key: 'start', label: 'Starting dice', default: 5, choices: [[5, '5 each'], [3, '3 each (quick)']] },
  ],

  setup(players, opts, { first }) {
    const start = Number(opts?.start) === 3 ? 3 : 5;
    const wild = String(opts?.wild ?? 'on') !== 'off';
    return L.newGame(players, first % players.length, { wild, start });
  },

  randomFor(s, a, seat) {
    if (a.type !== 'roll' || seat !== -1 || s.phase !== 'roll') return null;
    return Array(L.totalDice(s)).fill(6);
  },

  apply(s, a, seat, { now, rand }) {
    if (a.type === 'roll') {
      if (!rand) throw new Error('no dice');
      return L.applyAction(s, a, seat, { now, values: rand.map((v) => v + 1) });
    }
    if (a.type === 'bid') return L.applyAction(s, { type: 'bid', q: a.q, f: a.f }, seat, { now });
    if (a.type === 'liar' || a.type === 'next') return L.applyAction(s, { type: a.type }, seat, { now });
    throw new Error('unknown action');
  },

  tick(s, { now }) {
    if (s.phase === 'roll') return { type: 'roll' };
    if (s.phase === 'reveal' && now >= s.revealUntil) return { type: 'next' };
    return null;
  },

  botDelay: 1700,
  bot(s, seat) {
    if (s.phase !== 'bid' || s.current !== seat || s.players[seat].n === 0) return null;
    return botMove(s, seat);
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.n, win: s.winner === i })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game liars">
      <section class="table lz-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points lz-meta"></div></div>
        <div class="lz-seats"></div>
        <div class="lz-bidbox"></div>
        <div class="sel-line lz-last"></div>
        <div class="lz-mine">
          <div class="lz-minelabel">Your dice</div>
          <div class="lz-tray"></div>
        </div>
        <div class="lz-pick">
          <div class="lz-faces">${[1, 2, 3, 4, 5, 6].map((f) => `<button class="lz-facebtn" data-f="${f}" aria-label="${f}s">${flat(f)}</button>`).join('')}</div>
        </div>
        <div class="controls lz-controls">
          <div class="lz-step">
            <button class="btn lz-stepbtn" data-a="minus" aria-label="fewer">−</button>
            <div class="lz-qty"></div>
            <button class="btn lz-stepbtn" data-a="plus" aria-label="more">+</button>
          </div>
          <button class="btn primary big" data-a="bid">Bid</button>
          <button class="btn big lz-liarbtn" data-a="liar">Liar!</button>
        </div>
        <div class="hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);
    const tray = q('.lz-tray');
    const dice = Array.from({ length: 5 }, (_, i) => createDie(i));
    dice.forEach((d) => tray.appendChild(d.el));

    let state = null;
    let selQ = 1;
    let selF = 2;
    let selKey = ''; // which bid the selection was made against
    let sent = 0; // action sent, waiting for the host
    let rollUntil = 0;
    let timer = null;
    let countdown = null;

    const mySeat = () => api.mySeat();
    const meP = () => state?.players[mySeat()];
    const myTurn = () => state && state.phase === 'bid' && state.current === mySeat() && !sent;
    const name = (i) => (i === mySeat() ? 'You' : state.players[i].name);

    /** reset the picker to the smallest sensible raise, favouring a face you hold */
    function defaultPick() {
      const me = meP();
      const key = `${state.round}:${state.bids.length}`;
      if (key === selKey) return;
      selKey = key;
      if (state.bid) {
        selF = state.bid.f;
        selQ = L.minQty(state, selF) ?? state.bid.q;
        if (L.minQty(state, selF) == null) {
          for (let f = L.minFace(state); f <= 6; f++) if (L.minQty(state, f) != null) { selF = f; selQ = L.minQty(state, f); break; }
        }
      } else {
        let best = L.minFace(state);
        let bc = -1;
        for (let f = L.minFace(state); f <= 6; f++) {
          const c = (me?.dice || []).filter((v) => L.counts(state, v, f)).length;
          if (c >= bc) { bc = c; best = f; }
        }
        selF = best;
        selQ = Math.max(1, bc);
      }
    }
    const legalSel = () => L.isRaise(state, { q: selQ, f: selF });

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !state || !myTurn()) return;
      const a = b.dataset.a;
      const total = L.totalDice(state);
      if (b.dataset.f) {
        const f = Number(b.dataset.f);
        if (f < L.minFace(state)) return;
        selF = f;
        const mq = L.minQty(state, f);
        if (mq != null && selQ < mq) selQ = mq;
        if (state.bid && selQ > mq && selQ === state.bid.q + 1 && f > state.bid.f) selQ = mq; // drop back to the same quantity when it's enough
      } else if (a === 'minus') {
        const mq = L.minQty(state, selF) ?? 1;
        if (selQ > mq) selQ--;
      } else if (a === 'plus') {
        if (selQ < total) selQ++;
      } else if (a === 'bid') {
        if (!legalSel()) return;
        sent = Date.now();
        api.act({ type: 'bid', q: selQ, f: selF });
        setTimeout(() => { if (sent && Date.now() - sent > 5900) { sent = 0; render(); } }, 6000);
      } else if (a === 'liar') {
        if (!state.bid) return;
        sent = Date.now();
        api.act({ type: 'liar' });
        setTimeout(() => { if (sent && Date.now() - sent > 5900) { sent = 0; render(); } }, 6000);
      }
      render();
    });

    function renderSeats() {
      const seat = mySeat();
      const rev = state.phase === 'reveal' || state.phase === 'over' ? state.reveal : null;
      const f = rev?.bid.f;
      const others = state.players.map((p, i) => i).filter((i) => i !== seat);
      const box = q('.lz-seats');
      if (box.children.length !== others.length) {
        box.innerHTML = others.map(() => '<div class="lz-seat"><div class="lz-sname"><span class="nm"></span><span class="lz-n"></span></div><div class="lz-under"></div></div>').join('');
        box.dataset.n = String(others.length);
      }
      others.forEach((i, k) => {
        const p = state.players[i];
        const c = box.children[k];
        c.classList.toggle('active', state.phase === 'bid' && state.current === i);
        c.classList.toggle('out', p.n === 0 && !(rev && rev.loser === i));
        c.classList.toggle('away', !api.isAlive(p.pid));
        c.classList.toggle('loser', !!rev && rev.loser === i);
        c.querySelector('.nm').textContent = p.name;
        c.querySelector('.lz-n').textContent = p.n === 0 ? 'out' : `${p.n} ${p.n === 1 ? 'die' : 'dice'}`;
        const under = c.querySelector('.lz-under');
        const key = rev ? `r${state.round}` : p.n === 0 ? 'out' : `c${p.n}`;
        if (under.dataset.k !== key) {
          under.dataset.k = key;
          if (rev && p.dice.length) {
            under.innerHTML = p.dice.map((v, j) => flat(v, `${L.counts(state, v, f) ? 'match' : 'miss'}" style="--d:${(k * 5 + j) * 70}ms`)).join('');
          } else if (p.n === 0) {
            under.innerHTML = '<span class="lz-gone">no dice left</span>';
          } else {
            under.innerHTML = `${CUP}<span class="lz-dots">${'<b></b>'.repeat(p.n)}</span>`;
          }
        }
      });
    }

    function renderBidbox() {
      const box = q('.lz-bidbox');
      const rev = state.reveal;
      if ((state.phase === 'reveal' || state.phase === 'over') && rev) {
        const loser = state.players[rev.loser];
        const lname = rev.loser === mySeat() ? 'You lose' : `${esc(loser.name)} loses`;
        const why = rev.met ? 'The bid was good' : 'Caught bluffing';
        box.className = `lz-bidbox result ${rev.met ? 'good' : 'bad'}`;
        box.innerHTML = `<div class="lz-rtop"><span class="lz-rcount">${rev.count}</span>${flat(rev.bid.f)}<span class="lz-rvs">on the table · bid was ${rev.bid.q}</span></div>
          <div class="lz-rmsg"><b>${why}!</b> ${lname} a die${rev.out ? ` and ${rev.loser === mySeat() ? 'are' : 'is'} out` : ''}.</div>`;
        return;
      }
      box.className = 'lz-bidbox';
      const b = state.bid;
      if (!b) {
        box.innerHTML = `<div class="lz-none">${state.phase === 'bid' ? `${esc(name(state.current))} ${state.current === mySeat() ? 'open' : 'opens'} the bidding` : 'Rolling…'}</div>`;
        return;
      }
      box.innerHTML = `<div class="lz-cur"><span class="lz-cq">${b.q}</span><span class="lz-x">×</span>${flat(b.f, 'big')}</div>
        <div class="lz-by"><span class="muted-l">Current bid</span><b>${esc(name(b.seat))}</b><span>${esc(L.bidText(b))}</span></div>`;
    }

    function render() {
      if (!state) return;
      const seat = mySeat();
      const me = meP();
      const rolling = Date.now() < rollUntil;
      const cur = state.players[state.current];
      const tl = q('.turn-label');
      tl.textContent = state.phase === 'over' ? (state.winner === seat ? 'You win!' : `${state.players[state.winner].name} wins!`)
        : state.phase === 'reveal' ? 'Cups up!'
          : state.phase === 'roll' ? 'Rolling…'
            : state.current === seat ? 'Your turn' : `${cur.name}’s turn`;
      q('.lz-meta').innerHTML = state.phase === 'over' ? '' : `Round ${state.round} · <strong>${L.totalDice(state)}</strong> dice${state.wild ? ' · 1s wild' : ''}`;

      renderSeats();
      renderBidbox();

      // last action line
      const bids = state.bids;
      let last = '';
      if (state.phase === 'reveal' && state.reveal) last = `${name(state.reveal.caller)} called Liar on ${name(state.reveal.bidder) === 'You' ? 'you' : name(state.reveal.bidder)}!`;
      else if (state.phase === 'over') last = 'Game over — thanks for playing.';
      else if (bids.length > 1) last = `Before: ${bids.slice(-3, -1).map((b) => `${name(b.seat)} ${b.q}×${b.f}`).join(' → ')}`;
      q('.lz-last').textContent = last;

      // my dice
      const mine = q('.lz-mine');
      mine.classList.toggle('hidden', !me);
      if (me) {
        const rev = (state.phase === 'reveal' || state.phase === 'over') && state.reveal;
        q('.lz-minelabel').textContent = me.n === 0 && !(rev && state.reveal.loser === seat) ? 'You’re out — watch the bluffing!' : 'Your dice';
        dice.forEach((d, i) => {
          const v = me.dice[i];
          const show = v != null && (me.n > 0 || rev);
          d.el.classList.toggle('lz-off', !show);
          if (v != null) d.set(v);
          d.el.classList.toggle('lz-match', !!rev && v != null && L.counts(state, v, state.reveal.bid.f));
          d.el.classList.toggle('lz-miss', !!rev && v != null && !L.counts(state, v, state.reveal.bid.f));
          d.el.classList.toggle('lz-lost', !!rev && state.reveal.loser === seat && i === me.dice.length - 1);
        });
      }

      // picker + buttons
      const mine2 = myTurn() && !rolling;
      if (state.phase === 'bid' && state.current === seat) defaultPick();
      const pick = q('.lz-pick');
      pick.classList.toggle('off', !mine2);
      q('.lz-step').classList.toggle('off', !mine2);
      pick.classList.toggle('hidden', !me);
      q('.controls').classList.toggle('hidden', !me);
      q('.lz-qty').innerHTML = mine2 ? `<b>${selQ}</b><span>× ${selF}s</span>` : '<b>–</b>';
      const mq = mine2 ? L.minQty(state, selF) : null;
      el.querySelector('[data-a="minus"]').disabled = !mine2 || mq == null || selQ <= mq;
      el.querySelector('[data-a="plus"]').disabled = !mine2 || selQ >= L.totalDice(state);
      el.querySelectorAll('.lz-facebtn').forEach((b) => {
        const f = Number(b.dataset.f);
        b.disabled = !mine2 || f < L.minFace(state) || L.minQty(state, f) == null;
        b.classList.toggle('on', mine2 && f === selF);
        b.classList.toggle('wildx', f === 1 && state.wild);
      });
      const bidBtn = el.querySelector('[data-a="bid"]');
      const liarBtn = el.querySelector('[data-a="liar"]');
      bidBtn.disabled = !mine2 || !legalSel();
      bidBtn.textContent = 'Bid';
      liarBtn.disabled = !mine2 || !state.bid;

      let hint = '';
      if (state.phase === 'over') hint = '';
      else if (state.phase === 'reveal') hint = `Next round in ${Math.max(0, Math.ceil((state.revealUntil - api.hostNow()) / 1000))}s…`;
      else if (state.phase === 'roll' || rolling) hint = 'Shaking the cups…';
      else if (!me) hint = `${cur.name} is thinking…`;
      else if (me.n === 0) hint = `${cur.name} is thinking…`;
      else if (sent) hint = 'Sending…';
      else if (state.current !== seat) hint = !api.isAlive(cur.pid) ? `Waiting for ${cur.name} to come back…` : `Waiting for ${cur.name}…`;
      else if (!state.bid) hint = 'Open with any bid — pick how many and which face.';
      else hint = `Raise the bid, or call Liar! on ${state.players[state.bid.seat].name}.`;
      q('.hint').textContent = hint;
    }

    return {
      update(next) {
        const old = state;
        state = next;
        if (old && (old.bids.length !== next.bids.length || old.phase !== next.phase || old.round !== next.round)) sent = 0;
        const seat = mySeat();
        const me = next.players[seat];
        if (me && old && next.round !== old.round && next.phase === 'bid') {
          rollUntil = Date.now() + ROLL_MS;
          me.dice.forEach((v, i) => dice[i].roll(v));
          clearTimeout(timer);
          timer = setTimeout(render, ROLL_MS + 120);
        }
        render();
        clearInterval(countdown);
        if (next.phase === 'reveal') countdown = setInterval(render, 500);
        if (old && old.phase === 'bid' && next.phase === 'reveal' && next.reveal) {
          const r = next.reveal;
          banner(q('.banner'), 'LIAR!', 'farkle', 1100);
          setTimeout(() => {
            if (state?.phase !== 'reveal') return;
            const lose = r.loser === mySeat();
            banner(q('.banner'), r.met ? (lose ? 'IT WAS TRUE!' : 'TRUE!') : 'BLUFF!', r.met ? 'bank' : 'hot', 1800);
          }, 1400);
        }
        if (old && next.phase === 'bid' && (old.current !== next.current || old.round !== next.round) && next.current === seat) {
          turnPill(q('.turn-banner'), 'Your turn', next.round !== old.round ? ROLL_MS : 200);
        }
        if (old && old.phase !== 'over' && next.phase === 'over') {
          banner(q('.banner'), next.winner === seat ? 'YOU WIN!' : `${next.players[next.winner].name.toUpperCase()} WINS`, 'hot', 2600);
        }
      },
      refresh: render,
      destroy() { clearTimeout(timer); clearInterval(countdown); el.remove(); },
    };
  },
};
