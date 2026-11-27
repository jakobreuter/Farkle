import * as C from '../engines/close.js';
import { h, esc, scoreboard, banner } from '../ui.js';

const rulesHTML = () => `
  <ol>
    <li>Each round asks a question whose answer is a number. Everyone secretly types a guess before the timer runs out.</li>
    <li>The guesses are lined up from low to high, each paying odds: the middle guesses pay <b>2:1</b>, the outside ones up to <b>5:1</b>, and <b>“All too high”</b> pays <b>${C.HIGH_ODDS}:1</b>.</li>
    <li>Then everyone places <b>two bets</b> on the guess they think is <b>closest without going over</b>. Each bet is a free house chip, and you can stack your own chips on it too.</li>
    <li>The answer drops in. A winning bet pays <b>odds × (1 + your chips)</b> and you keep your stake; a losing bet loses the chips you added.</li>
    <li>Whoever guessed closest without going over earns <b>+${C.BONUS}</b> (or <b>+${C.BULLSEYE}</b> for a bullseye). If every guess went over, “All too high” wins.</li>
    <li>Everyone starts with ${C.START_CHIPS} chips. Most chips after the last question wins!</li>
  </ol>`;

const COLORS = ['#e2a72e', '#4fb3ff', '#ff6b8b', '#7ee081', '#c792ff', '#ff9f43', '#3ee0d0', '#f5f5f5'];

const full = (v, q) => (q && q.year ? String(v) : Number(v).toLocaleString('en-US'));
function compact(v, q) {
  if (q && q.year) return String(v);
  const a = Math.abs(v);
  const f = (x, s) => `${x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100}${s}`;
  if (a >= 1e9) return f(v / 1e9, 'B');
  if (a >= 1e6) return f(v / 1e6, 'M');
  if (a >= 1e4) return f(v / 1e3, 'k');
  return v.toLocaleString('en-US');
}

export default {
  id: 'close',
  name: 'Close Call',
  emoji: '📏',
  blurb: 'Guess the number, then bet on the closest guess.',
  minPlayers: 2,
  maxPlayers: 8,
  options: [
    { key: 'questions', label: 'Questions', default: 10, choices: [[7, '7'], [10, '10'], [15, '15']] },
    { key: 'timer', label: 'Timer', default: 45, choices: [[30, '30 s'], [45, '45 s'], [60, '60 s']] },
  ],

  setup(players, opts) {
    return C.newGame(players, opts);
  },

  randomFor(s, a, seat) {
    return a && a.type === 'deal' && seat === -1 && s.phase === 'deal' ? C.dealRanges(s) : null;
  },

  apply(s, a, seat, ctx) {
    if (!a || typeof a !== 'object') throw new Error('bad action');
    if (a.type === 'guess' || a.type === 'bet') {
      if (seat < 0) throw new Error('players only');
    } else if (seat !== -1) throw new Error('system only');
    return C.applyAction(s, a, seat, ctx);
  },

  tick(s, { now }) {
    return C.tick(s, now);
  },

  realtime: true, // bots "think" for a few seconds, so they may have nothing to do for a while
  botDelay: 400,
  bot(s, seat, { now } = {}) {
    const t = now ?? Date.now();
    if (!s.players[seat]) return null;
    if (s.phase === 'guess' && s.guesses[seat] == null && t >= s.at + C.botThinkMs(s, seat)) return C.botGuess(s, seat);
    if (s.phase === 'bet' && s.bets[seat] == null && t >= s.at + C.LINE_MS + C.botThinkMs(s, seat)) return C.botBet(s, seat);
    return null;
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.chips, win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game close">
      <section class="scoreboard"></section>
      <section class="table cc-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points cc-clock"><span class="cc-clk-l"></span> <strong>0</strong></div></div>
        <div class="cc-qcard"><div class="cc-qtext"></div><div class="cc-qunit"></div></div>
        <div class="cc-stage">
          <div class="cc-pane cc-guess">
            <div class="cc-readout"><span class="cc-num"></span><span class="cc-u"></span></div>
            <div class="cc-pad">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button class="cc-key" data-k="${d}">${d}</button>`).join('')}
              <button class="cc-key cc-kfn" data-k="C">C</button><button class="cc-key" data-k="0">0</button><button class="cc-key cc-kfn" data-k="B" aria-label="Delete">⌫</button>
            </div>
            <div class="controls"><button class="btn primary big cc-lock">Lock in guess</button></div>
            <div class="cc-waitbox"><div class="cc-wtitle">Locked in</div><div class="cc-wnum"></div><div class="cc-who"></div></div>
          </div>
          <div class="cc-pane cc-bet">
            <div class="cc-line"><div class="cc-axis"></div><div class="cc-zone">too<br>high</div><div class="cc-dots"></div><div class="cc-pin"><span></span></div></div>
            <div class="cc-slots"></div>
            <div class="cc-bottom">
              <div class="cc-betbar">
                <button class="cc-mk" data-m="0"><b>①</b><span></span></button>
                <button class="cc-mk" data-m="1"><b>②</b><span></span></button>
                <div class="cc-step"><button class="cc-sb" data-d="-1" aria-label="Fewer chips">−</button><div class="cc-sv"><b>0</b><small>chips</small></div><button class="cc-sb" data-d="1" aria-label="More chips">+</button></div>
              </div>
              <div class="controls"><button class="btn primary big cc-place">Place bets</button></div>
              <div class="cc-ans"><div class="cc-aval"></div><div class="cc-fact"></div></div>
            </div>
          </div>
        </div>
        <div class="hint"></div>
        <div class="banner hidden"></div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);
    const qa = (x) => [...el.querySelectorAll(x)];

    let state = null;
    let draft = '';
    let sentGuess = null; // {qn, value}
    let marks = [{ slot: null, extra: 0 }, { slot: null, extra: 0 }];
    let sel = 0;
    let sentBet = -1;
    let key = ''; // phase|qn, to reset local picks
    let slotsKey = '';
    let revealKey = '';
    let anim = null; // count-up {from, to, start}
    let raf = 0;
    const timers = [];

    const seat = () => api.mySeat();
    const me = () => (state && seat() >= 0 ? state.players[seat()] : null);
    const curQ = () => (state && state.qs.length ? C.question(state.qs[state.qn]) : null);
    const left = () => Math.max(0, state.deadline - api.hostNow());

    // ---------- guess pad ----------
    function press(k) {
      if (!canGuess()) return;
      if (k === 'C') draft = '';
      else if (k === 'B') draft = draft.slice(0, -1);
      else if (draft.length < 12) draft = draft === '0' ? k : draft + k;
      renderGuess();
    }
    const canGuess = () => state && state.phase === 'guess' && me() && state.guesses[seat()] == null && !(sentGuess && sentGuess.qn === state.qn);
    function lockGuess() {
      if (!canGuess() || draft === '') return;
      const value = Number(draft);
      sentGuess = { qn: state.qn, value };
      api.act({ type: 'guess', q: state.qn, value });
      render();
    }
    q('.cc-pad').addEventListener('click', (e) => {
      const b = e.target.closest('.cc-key');
      if (b) press(b.dataset.k);
    });
    q('.cc-lock').addEventListener('click', lockGuess);

    // ---------- betting ----------
    const chips = () => (me() ? me().chips : 0);
    const canBet = () => state && state.phase === 'bet' && me() && state.bets[seat()] == null && sentBet !== state.qn;
    q('.cc-slots').addEventListener('click', (e) => {
      const b = e.target.closest('.cc-slot');
      if (!b || !canBet()) return;
      marks[sel].slot = Number(b.dataset.i);
      if (marks[1 - sel].slot == null) sel = 1 - sel;
      renderBet();
    });
    q('.cc-betbar').addEventListener('click', (e) => {
      if (!canBet()) return;
      const mk = e.target.closest('.cc-mk');
      if (mk) { sel = Number(mk.dataset.m); renderBet(); return; }
      const sb = e.target.closest('.cc-sb');
      if (sb) {
        const room = chips() - marks[1 - sel].extra;
        marks[sel].extra = Math.max(0, Math.min(room, marks[sel].extra + Number(sb.dataset.d)));
        renderBet();
      }
    });
    function placeBets(auto) {
      if (!canBet()) return;
      const bets = marks.filter((m) => m.slot != null).map((m) => ({ slot: m.slot, extra: m.extra }));
      if (!auto && bets.length < 2) return;
      sentBet = state.qn;
      api.act({ type: 'bet', q: state.qn, bets });
      render();
    }
    q('.cc-place').addEventListener('click', () => placeBets(false));

    // ---------- number line + slots ----------
    function buildSlots() {
      const s = state;
      const k = s.slots.length - 1;
      const cq = curQ();
      const qk = `${s.qn}|${s.slots.map((x) => x.v).join(',')}`;
      if (qk === slotsKey) return;
      slotsKey = qk;
      const dots = q('.cc-dots');
      dots.innerHTML = s.slots.slice(1).map((sl, j) => {
        const x = ((j + 1) / (k + 1)) * 100;
        const col = COLORS[sl.who[0] % COLORS.length];
        return `<div class="cc-dot ${j % 2 ? 'dn' : 'up'}" style="left:${x.toFixed(2)}%;--c:${col};animation-delay:${120 + j * 140}ms">
          <i></i><span>${esc(compact(sl.v, cq))}</span></div>`;
      }).join('');
      q('.cc-zone').style.width = `${(100 / (k + 1)).toFixed(2)}%`;
      const wrap = q('.cc-slots');
      wrap.classList.toggle('two', s.slots.length <= 4);
      wrap.innerHTML = s.slots.map((sl, i) => {
        const names = i === 0 ? 'every guess over' : sl.who.map((w) => (w === seat() ? 'You' : s.players[w].name)).join(', ');
        return `<button class="cc-slot${i === 0 ? ' high' : ''}" data-i="${i}" style="animation-delay:${i ? 120 + (i - 1) * 140 : 0}ms">
          <span class="cc-odds">${sl.odds}:1</span>
          <span class="cc-sv2">${i === 0 ? 'All too high' : esc(full(sl.v, cq))}</span>
          <span class="cc-own">${esc(names)}</span>
          <span class="cc-chips"></span></button>`;
      }).join('');
    }

    function renderLine() {
      const s = state;
      const pin = q('.cc-pin');
      const k = s.slots.length - 1;
      if (s.phase === 'reveal' || s.phase === 'over') {
        const L = s.last;
        const exact = L.win > 0 && s.slots[L.win].v === L.answer;
        const x = L.win === 0 ? 0.5 / (k + 1) : exact ? L.win / (k + 1) : (L.win + 0.5) / (k + 1);
        pin.style.left = `${(x * 100).toFixed(2)}%`;
        pin.firstElementChild.textContent = compact(L.answer, curQ());
        pin.classList.add('on');
      } else pin.classList.remove('on');
    }

    function renderSlotChips() {
      const s = state;
      const reveal = s.phase === 'reveal' || s.phase === 'over';
      const win = reveal && s.last ? s.last.win : -1;
      qa('.cc-slot').forEach((b) => {
        const i = Number(b.dataset.i);
        let html = '';
        if (reveal) {
          s.players.forEach((p, pi) => {
            for (const bt of s.bets[pi] || []) {
              if (bt.slot === i) html += `<i style="--c:${COLORS[pi % COLORS.length]}" title="${esc(p.name)}">${esc(p.name.slice(0, 1).toUpperCase())}${bt.extra ? `<sup>${bt.extra}</sup>` : ''}</i>`;
            }
          });
        } else {
          marks.forEach((m, mi) => {
            if (m.slot === i) html += `<i class="mine${mi === sel ? ' sel' : ''}">${mi ? '②' : '①'}${m.extra ? `<sup>${m.extra}</sup>` : ''}</i>`;
          });
        }
        const c = b.querySelector('.cc-chips');
        if (c.innerHTML !== html) c.innerHTML = html;
        b.classList.toggle('win', i === win);
        b.classList.toggle('lose', reveal && i !== win);
        b.classList.toggle('picked', !reveal && marks.some((m) => m.slot === i));
        b.disabled = !reveal && !canBet();
      });
    }

    function renderBet() {
      const s = state;
      if (!s || !s.slots.length) return;
      renderSlotChips();
      const cq = curQ();
      const betting = canBet();
      qa('.cc-mk').forEach((b, mi) => {
        const m = marks[mi];
        b.classList.toggle('sel', betting && mi === sel);
        b.disabled = !betting;
        b.lastElementChild.textContent = m.slot == null ? 'tap a guess' : m.slot === 0 ? 'Too high' : compact(s.slots[m.slot].v, cq);
      });
      q('.cc-sv b').textContent = String(marks[sel].extra);
      const room = chips() - marks[1 - sel].extra;
      q('.cc-sb[data-d="-1"]').disabled = !betting || marks[sel].extra <= 0;
      q('.cc-sb[data-d="1"]').disabled = !betting || marks[sel].extra >= room;
      const placed = marks.filter((m) => m.slot != null).length;
      const btn = q('.cc-place');
      btn.disabled = !betting || placed < 2;
      btn.textContent = !me() ? 'Watching' : !betting ? 'Bets placed ✓' : placed < 2 ? `Place ${2 - placed} more bet${placed === 1 ? '' : 's'}` : 'Place bets';
    }

    function renderGuess() {
      const s = state;
      const cq = curQ();
      const mine = me() ? s.guesses[seat()] ?? (sentGuess && sentGuess.qn === s.qn ? sentGuess.value : null) : null;
      const open = canGuess();
      q('.cc-guess').classList.toggle('locked', !open);
      q('.cc-num').textContent = draft === '' ? '?' : full(Number(draft), cq);
      q('.cc-num').classList.toggle('empty', draft === '');
      q('.cc-u').textContent = cq && cq.unit && !cq.year ? cq.unit : '';
      const len = draft.length;
      q('.cc-readout').style.setProperty('--fs', len > 9 ? '1.45rem' : len > 6 ? '1.75rem' : '2.1rem');
      q('.cc-lock').disabled = !open || draft === '';
      q('.cc-wtitle').textContent = me() ? 'Locked in' : 'Watching';
      q('.cc-wnum').textContent = mine != null ? `${full(mine, cq)}${cq && cq.unit && !cq.year ? ` ${cq.unit}` : ''}` : '—';
      const who = s.players.map((p, i) => `<span class="${s.guesses[i] != null ? 'done' : ''}" style="--c:${COLORS[i % COLORS.length]}">${s.guesses[i] != null ? '✓' : '…'} ${esc(i === seat() ? 'You' : p.name)}</span>`).join('');
      if (q('.cc-who').innerHTML !== who) q('.cc-who').innerHTML = who;
    }

    // ---------- reveal ----------
    function startReveal() {
      const s = state;
      const rk = `${s.qn}`;
      if (rk === revealKey) return false;
      revealKey = rk;
      const L = s.last;
      anim = { from: L.before.slice(), to: s.players.map((p) => p.chips), start: performance.now() + 1500 };
      const ans = q('.cc-ans');
      ans.classList.remove('in'); void ans.offsetWidth; ans.classList.add('in');
      const pin = q('.cc-pin');
      pin.classList.remove('drop'); void pin.offsetWidth; pin.classList.add('drop');
      q('.cc-slots').classList.remove('judged'); void q('.cc-slots').offsetWidth; q('.cc-slots').classList.add('judged');
      const my = seat();
      if (my >= 0) {
        const d = L.delta[my];
        timers.push(setTimeout(() => {
          if (d > 0) banner(q('.banner'), `+${d} chips!`, 'bank', 1500);
          else if (d < 0) banner(q('.banner'), `${d} chips`, 'farkle', 1300);
        }, 1700));
      }
      cancelAnimationFrame(raf);
      const step = () => {
        renderBoard();
        if (anim && performance.now() < anim.start + 1100) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return true;
    }

    function shownChips(i) {
      const s = state;
      if (!anim || !(s.phase === 'reveal' || s.phase === 'over')) return s.players[i].chips;
      const t = Math.max(0, Math.min(1, (performance.now() - anim.start) / 1000));
      const e = 1 - (1 - t) ** 3;
      return Math.round(anim.from[i] + (anim.to[i] - anim.from[i]) * e);
    }

    function renderBoard() {
      const s = state;
      const reveal = (s.phase === 'reveal' || s.phase === 'over') && s.last;
      const counting = reveal && anim && performance.now() >= anim.start;
      scoreboard(q('.scoreboard'), s.players.map((p, i) => {
        let sub = '';
        if (s.phase === 'guess') sub = s.guesses[i] != null ? '✓ guessed' : 'thinking…';
        else if (s.phase === 'bet') sub = s.bets[i] != null ? '✓ bets in' : 'betting…';
        else if (reveal) {
          const d = s.last.delta[i];
          sub = !counting ? '' : `${d > 0 ? '+' : ''}${d}${s.last.bonus[i] ? (s.last.bonus[i] === C.BULLSEYE ? ' 🎯' : ' ⭐') : ''}`;
        }
        return {
          name: p.name,
          score: shownChips(i),
          active: s.phase === 'over' ? (s.winners || []).includes(i) : reveal ? !!s.last.bonus[i] && counting : false,
          me: i === seat(),
          away: !api.isAlive(p.pid),
          sub,
        };
      }));
    }

    function renderClock() {
      const s = state;
      const lab = q('.cc-clk-l');
      const num = q('.cc-clock strong');
      if (s.phase === 'guess' || s.phase === 'bet') {
        const secs = Math.ceil(left() / 1000);
        lab.textContent = s.phase === 'guess' ? '⏱' : '🪙';
        num.textContent = String(secs);
        q('.cc-clock').classList.toggle('low', secs <= 5);
        // auto-submit when time runs out
        if (left() <= 0) {
          if (canGuess() && draft !== '') lockGuess();
          if (canBet() && marks.some((m) => m.slot != null)) placeBets(true);
        }
      } else if (s.phase === 'reveal') {
        lab.textContent = s.qn + 1 >= s.total ? 'Final in' : 'Next in';
        num.textContent = String(Math.max(0, Math.ceil((s.autoAt - api.hostNow()) / 1000)));
        q('.cc-clock').classList.remove('low');
      } else {
        lab.textContent = '';
        num.textContent = '';
      }
    }

    function hintText() {
      const s = state;
      const p = me();
      const waiting = (arr) => arr.filter((x) => x == null).length;
      if (s.phase === 'deal') return 'Shuffling the questions…';
      if (s.phase === 'guess') {
        if (!p) return 'Players are typing their guesses…';
        if (canGuess()) return 'Type your best guess, then lock it in.';
        const n = waiting(s.guesses);
        return n ? `Waiting for ${n} more guess${n === 1 ? '' : 'es'}…` : 'Lining up the guesses…';
      }
      if (s.phase === 'bet') {
        if (!p) return 'Everyone is betting on the closest guess…';
        if (canBet()) return 'Bet on the closest guess <b>without going over</b>. Tap ① ② to switch bets.';
        const n = waiting(s.bets);
        return n ? `Bets placed. Waiting for ${n} more…` : 'Revealing…';
      }
      const L = s.last;
      if (!L) return '';
      if (s.phase === 'over') {
        const ws = (s.winners || []).map((i) => (i === seat() ? 'You' : s.players[i].name));
        return ws.length > 1 ? `Tie between ${esc(ws.join(' & '))}!` : `${esc(ws[0])} ${ws[0] === 'You' ? 'win' : 'wins'} with the most chips! 🏆`;
      }
      if (L.win === 0) return `Every guess went over — <b>All too high</b> pays ${C.HIGH_ODDS}:1!`;
      const who = s.slots[L.win].who.map((i) => (i === seat() ? 'You' : s.players[i].name));
      const exact = s.slots[L.win].v === L.answer;
      return `${esc(who.join(' & '))} ${exact ? 'nailed it exactly! 🎯' : 'came closest without going over!'} +${exact ? C.BULLSEYE : C.BONUS}`;
    }

    function render() {
      if (!state) return;
      const s = state;
      const cq = curQ();
      const k = `${s.phase}|${s.qn}`;
      if (k !== key) {
        if (s.phase === 'guess') { draft = ''; }
        if (s.phase === 'bet') { marks = [{ slot: null, extra: 0 }, { slot: null, extra: 0 }]; sel = 0; }
        key = k;
      }
      const label = s.phase === 'deal' ? 'Getting ready…' : s.phase === 'over' ? 'Final scores' : `Question ${s.qn + 1} of ${s.total}`;
      const tl = q('.turn-label');
      if (tl.textContent !== label) { tl.textContent = label; tl.classList.remove('swap'); void tl.offsetWidth; tl.classList.add('swap'); }

      const qt = cq ? cq.q : 'Shuffling the questions…';
      if (q('.cc-qtext').textContent !== qt) {
        q('.cc-qtext').textContent = qt;
        q('.cc-qcard').classList.toggle('long', qt.length > 90);
        const card = q('.cc-qcard');
        card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip');
      }
      q('.cc-qunit').textContent = cq ? (cq.year ? 'Answer: a year' : cq.unit ? `Answer in ${cq.unit}` : 'Answer: a number') : '';

      const betLike = s.phase === 'bet' || s.phase === 'reveal' || (s.phase === 'over' && s.last);
      q('.cc-guess').classList.toggle('on', s.phase === 'guess' || s.phase === 'deal');
      q('.cc-bet').classList.toggle('on', !!betLike);
      q('.cc-bet').classList.toggle('revealing', s.phase === 'reveal' || s.phase === 'over');

      if (s.phase === 'guess' || s.phase === 'deal') renderGuess();
      if (betLike && s.slots.length) {
        buildSlots();
        renderLine();
        renderBet();
      } else if (betLike) {
        // nobody guessed: an empty line
        q('.cc-dots').innerHTML = ''; q('.cc-slots').innerHTML = ''; slotsKey = '';
        renderLine();
      }
      if ((s.phase === 'reveal' || s.phase === 'over') && s.last) {
        q('.cc-aval').innerHTML = `<small>Answer</small> ${esc(full(s.last.answer, cq))}<small>${cq && cq.unit && !cq.year ? ` ${esc(cq.unit)}` : ''}</small>`;
        q('.cc-fact').textContent = cq ? cq.fact : '';
        startReveal();
      }
      renderBoard();
      renderClock();
      const ht = hintText();
      if (q('.hint').innerHTML !== ht) q('.hint').innerHTML = ht;
    }

    const clock = setInterval(() => { if (state) { renderClock(); if (state.phase === 'reveal') renderBoard(); } }, 250);

    return {
      update(s) {
        state = s;
        render();
      },
      refresh() { render(); },
      destroy() {
        clearInterval(clock);
        cancelAnimationFrame(raf);
        timers.forEach(clearTimeout);
        el.remove();
      },
    };
  },
};
