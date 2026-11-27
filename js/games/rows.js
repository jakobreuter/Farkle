import * as R from '../engines/rows.js';
import { createDie, ROLL_MS } from '../dice.js';
import { h, esc, banner, turnPill } from '../ui.js';

const rulesHTML = () => `
  <ol>
    <li>Everyone has a sheet with four coloured rows: <b>Red</b> and <b>Yellow</b> run 2→12, <b>Green</b> and <b>Blue</b> run 12→2.</li>
    <li>On each roll the active player throws <b>two white dice</b> plus one die for every colour still open. Then <b>everyone plays at once</b>:
      <ul>
        <li>Anyone may mark the <b>sum of the white dice</b> in any row (optional).</li>
        <li>The active player may <b>also</b> mark one <b>white + coloured die</b> total in that colour's row.</li>
      </ul>
      Tap the glowing boxes, then press <b>Done</b>.</li>
    <li>Marks go <b>left to right</b>. You may skip boxes, but skipped boxes are gone for good.</li>
    <li><b>Locking:</b> once a row has <b>${R.MIN_TO_LOCK} marks</b> you may mark its last number. That also marks the 🔒 (an extra mark) and locks the colour for everyone. Its die leaves the game.</li>
    <li>If the active player marks nothing at all, they take a <b>penalty (−${R.PENALTY})</b>.</li>
    <li>The game ends when <b>${R.LOCKS_TO_END} rows are locked</b> or someone has <b>${R.MAX_PEN} penalties</b>.</li>
    <li><b>Scoring:</b> each row scores by its number of marks: 1→1, 2→3, 3→6, 4→10, 5→15, 6→21, 7→28, 8→36, 9→45, 10→55, 11→66, 12→78. Penalties are −${R.PENALTY} each. Highest total wins.</li>
    <li><b>Variants:</b> <i>Nudged rows</i> swaps some neighbouring numbers in every row (it's different each game, and the end numbers stay put). <i>Star boxes</i> adds two ★ boxes per row, and marking one counts as an extra mark.</li>
  </ol>`;

const HEX = ['#d8383a', '#e9b51f', '#2f9a4e', '#2e6bd3'];
const key = (m) => `${m.row}:${m.n}`;

export default {
  id: 'rows',
  name: 'Color Rows',
  emoji: '🌈',
  blurb: 'Everyone marks every roll: race your colored rows.',
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    { key: 'timer', label: 'Timer', default: '30', choices: [['20', '20 seconds'], ['30', '30 seconds'], ['off', 'Off']] },
    { key: 'variant', label: 'Variant', default: 'classic', choices: [['classic', 'Classic'], ['mixed', 'Nudged rows'], ['bonus', 'Star boxes']] },
  ],

  setup(players, opts, { first }) {
    return R.newGame(players, {
      variant: opts?.variant,
      timer: opts?.timer === 'off' ? 0 : Number(opts?.timer ?? 30),
      first: (first || 0) % players.length,
    });
  },

  randomFor(s, a, seat) {
    if (a?.type === 'deal' && s.phase === 'deal' && seat === -1) return R.dealRanges(s.variant);
    if (a?.type === 'roll' && s.phase === 'roll' && (seat === s.active || seat === -1)) return R.rollRanges(s);
    return null;
  },

  apply(s, a, seat, { now, rand }) {
    return R.applyAction(s, a, seat, { now, rand });
  },

  tick(s, { now }) {
    if (s.phase === 'deal') return { type: 'deal' };
    if (!s.timer || !s.deadline || now < s.deadline) return null;
    if (s.phase === 'roll') return { type: 'roll' };
    if (s.phase === 'mark') return { type: 'timeout' };
    return null;
  },

  botDelay: 1000,
  bot(s, seat) {
    if (s.phase === 'roll') return seat === s.active ? { type: 'roll' } : null;
    if (s.phase === 'mark' && s.subs && s.subs[seat] == null) return { type: 'done', marks: R.botMarks(s, seat), rollNo: s.rollNo };
    return null;
  },

  results(s) {
    const t = s.layout ? R.totals(s) : s.players.map(() => 0);
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: t[i], win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game rows">
      <section class="table rows-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points rows-clock"></div></div>
        <div class="rows-tray"></div>
        <div class="sel-line"></div>
        <div class="controls"><button class="btn primary big" data-a="go">Roll</button></div>
        <div class="hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <section class="rows-sheet">
        <div class="rows-sheethead"><span class="rows-whose"></span><span class="rows-total"></span></div>
        <div class="rows-lines"></div>
        <div class="rows-foot">
          <div class="rows-pens"><span>Penalties</span><span class="rows-penbox"></span></div>
          <div class="rows-break"></div>
        </div>
      </section>
      <section class="rows-others"></section>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const tray = q('.rows-tray');
    const lines = q('.rows-lines');
    const others = q('.rows-others');
    const goBtn = q('[data-a="go"]');

    // dice: two white, then one per colour
    const dice = Array.from({ length: 6 }, (_, i) => {
      const d = createDie(i, null);
      d.el.classList.add(i < 2 ? 'rows-dw' : `rows-d${R.COLORS[i - 2]}`);
      tray.appendChild(d.el);
      return d;
    });
    for (let i = 0; i < 4; i++) {
      const pen = h('<i class="rows-pen"></i>');
      q('.rows-penbox').appendChild(pen);
    }

    let state = null;
    let sel = []; // my pending marks [{ row, n }]
    let selRoll = -1;
    let sent = 0; // time I pressed Roll/Done (waiting for the host)
    let animatingUntil = 0;
    let viewSeat = null; // whose sheet is shown (null = mine)
    let layoutKey = '';
    let uiTimer = null;
    const clock = setInterval(() => { if (state && state.deadline && state.phase !== 'over') renderClock(); }, 500);

    const me = () => api.mySeat();
    const animating = () => Date.now() < animatingUntil;
    const shownSeat = () => {
      if (viewSeat != null && viewSeat < (state?.players.length || 0)) return viewSeat;
      return me() >= 0 ? me() : 0;
    };
    const mine = () => me() >= 0 && shownSeat() === me();
    const myPlans = () => (state && me() >= 0 && !sent && !animating() ? R.plans(state, me()) : []);

    function buildSheet() {
      lines.innerHTML = state.layout.map((row, c) => `<div class="rows-line rows-${R.COLORS[c]}" data-c="${c}">
        ${row.nums.map((n, i) => `<button class="rows-box${row.stars.includes(i) ? ' rows-star' : ''}${i === R.LAST ? ' rows-end' : ''}" data-c="${c}" data-n="${n}" data-i="${i}"><span>${n}</span></button>`).join('')}
        <div class="rows-lockbox" aria-label="lock">🔒</div>
      </div>`).join('');
    }

    lines.addEventListener('click', (e) => {
      const b = e.target.closest('.rows-box');
      if (!b || !mine() || !state || state.phase !== 'mark') return;
      const m = { row: Number(b.dataset.c), n: Number(b.dataset.n) };
      const k = key(m);
      const P = myPlans();
      if (!P.length) return;
      const sets = P.map((p) => new Set(p.map(key)));
      const cur = sel.map(key);
      if (cur.includes(k)) {
        sel = sel.filter((x) => key(x) !== k);
      } else if (sets.some((st) => [...cur, k].every((x) => st.has(x)))) {
        sel = [...sel, m];
      } else if (sets.some((st) => st.has(k))) {
        sel = [m]; // can't combine with what's picked: start over with this box
      } else return;
      selRoll = state.rollNo;
      render();
    });

    function exactPlan() {
      const P = myPlans();
      const want = new Set(sel.map(key));
      return P.find((p) => p.length === want.size && p.every((m) => want.has(key(m)))) || null;
    }

    goBtn.addEventListener('click', () => {
      if (!state || me() < 0 || sent || animating()) return;
      if (state.phase === 'roll' && state.active === me()) {
        sent = Date.now();
        dice.forEach((d, i) => d.shake(i < 2 || !state.locked[i - 2]));
        api.act({ type: 'roll' });
      } else if (state.phase === 'mark' && state.subs?.[me()] == null) {
        const plan = exactPlan();
        if (!plan) return;
        sent = Date.now();
        api.act({ type: 'done', marks: plan, rollNo: state.rollNo });
      } else return;
      const t = sent;
      setTimeout(() => { if (sent === t) { sent = 0; dice.forEach((d) => d.shake(false)); render(); } }, 8000);
      render();
    });

    others.addEventListener('click', (e) => {
      const r = e.target.closest('.rows-opp');
      if (!r || !state) return;
      const seat = Number(r.dataset.s);
      viewSeat = seat === me() || viewSeat === seat ? null : seat;
      render();
    });
    q('.rows-sheethead').addEventListener('click', (e) => {
      if (e.target.closest('.rows-back')) { viewSeat = null; render(); }
    });

    function renderClock() {
      const c = q('.rows-clock');
      if (!state || state.phase === 'over' || state.phase === 'deal') { c.textContent = ''; return; }
      const parts = [`Roll ${state.rollNo + (state.phase === 'roll' ? 1 : 0)}`];
      if (state.deadline) {
        const left = Math.max(0, Math.ceil((state.deadline - api.hostNow()) / 1000));
        parts.push(`⏱ ${left}s`);
        c.classList.toggle('rows-hurry', left <= 5);
      } else c.classList.remove('rows-hurry');
      c.textContent = parts.join(' · ');
    }

    function renderDice() {
      const anim = animating();
      dice.forEach((d, i) => {
        const locked = i >= 2 && state.locked[i - 2];
        d.el.classList.toggle('rows-gone', locked);
        const v = i < 2 ? state.dice?.w[i] : state.dice?.c[i - 2];
        if (v && !anim) d.set(v);
        d.el.classList.toggle('dim', state.phase === 'roll' && !d.el.classList.contains('shaking'));
      });
    }

    function renderSheet() {
      const seat = shownSeat();
      const p = state.players[seat];
      const own = mine();
      const isMark = state.phase === 'mark' && !animating();
      const subs = state.subs?.[seat];
      // pending marks: my selection, or what I've sent
      const pending = own && isMark ? (subs || (sel.length && selRoll === state.rollNo ? sel : [])) : [];
      const pendKeys = new Set(pending.map(key));
      const P = own && isMark && subs == null ? myPlans() : [];
      const canKeys = new Set(P.flatMap((pl) => pl.map(key)));
      const curSets = P.map((pl) => new Set(pl.map(key)));
      const addable = new Set([...canKeys].filter((k) => !pendKeys.has(k) && curSets.some((st) => [...pendKeys, k].every((x) => st.has(x)))));
      // where each row's marks will reach after the pending ones
      const reach = p.rows.map((m) => R.nextPos(m));
      for (const m of pending) {
        const i = state.layout[m.row].nums.indexOf(m.n);
        reach[m.row] = Math.max(reach[m.row], i + 1);
      }
      state.layout.forEach((row, c) => {
        const line = lines.children[c];
        const marks = p.rows[c];
        const next = R.nextPos(marks);
        line.classList.toggle('rows-locked', state.locked[c]);
        line.classList.toggle('rows-mine-lock', marks.includes(R.LAST));
        const boxes = line.querySelectorAll('.rows-box');
        boxes.forEach((b, i) => {
          const k = `${c}:${row.nums[i]}`;
          const marked = marks.includes(i);
          b.classList.toggle('rows-x', marked);
          b.classList.toggle('rows-skip', !marked && (i < next || (state.locked[c] && !marked)));
          b.classList.toggle('rows-willskip', !marked && i >= next && i < reach[c] && !pendKeys.has(k));
          b.classList.toggle('rows-pick', pendKeys.has(k));
          b.classList.toggle('rows-can', canKeys.has(k) && !pendKeys.has(k));
          b.classList.toggle('rows-add', addable.has(k));
          b.classList.toggle('rows-sent', pendKeys.has(k) && subs != null);
          b.disabled = !(canKeys.has(k) || pendKeys.has(k)) || subs != null;
        });
        const cnt = R.rowCount(row, marks);
        line.dataset.count = cnt;
        line.querySelector('.rows-lockbox').classList.toggle('rows-x', marks.includes(R.LAST));
      });
      const sc = R.scoreOf(state, p);
      const pens = q('.rows-penbox').children;
      for (let i = 0; i < pens.length; i++) pens[i].classList.toggle('rows-x', i < p.pen);
      q('.rows-break').innerHTML = sc.rows.map((v, c) => `<b style="--rc:${HEX[c]}">${v}</b>`).join('<i>+</i>') + (p.pen ? `<i>−</i><b class="rows-neg">${sc.pen}</b>` : '') + `<i>=</i><b class="rows-sum">${sc.total}</b>`;
      q('.rows-total').textContent = `${sc.total} pts`;
      q('.rows-whose').innerHTML = own ? 'Your sheet'
        : `${esc(p.name)}’s sheet${me() >= 0 ? ' <button class="rows-back">My sheet</button>' : ''}`;
      el.querySelector('.rows-sheet').classList.toggle('rows-peek', !own);
    }

    function renderOthers() {
      const n = state.players.length;
      if (others.children.length !== n) {
        others.innerHTML = state.players.map((_, i) => `<button class="rows-opp" data-s="${i}">
          <span class="rows-onm"></span><span class="rows-chips">${R.COLORS.map((c) => `<i class="rows-chip rows-${c}"></i>`).join('')}</span>
          <span class="rows-open"></span><span class="rows-osc"></span></button>`).join('');
      }
      state.players.forEach((p, i) => {
        const r = others.children[i];
        const status = state.phase === 'mark' ? (state.subs?.[i] != null ? '✓' : '…') : state.phase === 'roll' && i === state.active ? '🎲' : '';
        r.classList.toggle('rows-act', i === state.active && state.phase !== 'over');
        r.classList.toggle('rows-me', i === me());
        r.classList.toggle('rows-viewing', i === shownSeat());
        r.classList.toggle('rows-away', !api.isAlive(p.pid));
        r.classList.toggle('rows-win', (state.winners || []).includes(i));
        r.querySelector('.rows-onm').innerHTML = `<em>${status}</em>${esc(p.name)}${i === me() ? ' <small>you</small>' : ''}`;
        const chips = r.querySelectorAll('.rows-chip');
        chips.forEach((ch, c) => {
          ch.textContent = R.rowCount(state.layout[c], p.rows[c]);
          ch.classList.toggle('rows-lk', p.rows[c].includes(R.LAST));
          ch.classList.toggle('rows-closed', state.locked[c] && !p.rows[c].includes(R.LAST));
        });
        r.querySelector('.rows-open').textContent = p.pen ? '✕'.repeat(p.pen) : '';
        r.querySelector('.rows-osc').textContent = R.scoreOf(state, p).total;
      });
    }

    function render() {
      if (!state) return;
      if (state.phase === 'deal' || !state.layout) {
        q('.turn-label').textContent = 'Dealing sheets…';
        return;
      }
      const lk = JSON.stringify(state.layout);
      if (lk !== layoutKey) { layoutKey = lk; buildSheet(); }
      if (selRoll !== state.rollNo) sel = [];
      const seat = me();
      const act = state.players[state.active];
      const iAmActive = seat === state.active;
      const anim = animating();
      const done = state.phase === 'mark' && seat >= 0 && state.subs?.[seat] != null;

      let label;
      if (state.phase === 'over') label = 'Game over';
      else if (state.phase === 'roll') label = iAmActive ? 'Your roll' : `${act.name} rolls`;
      else label = iAmActive ? 'Your roll: mark your sheet' : `${act.name} rolled: mark too`;
      q('.turn-label').textContent = label;
      renderClock();
      renderDice();

      const ws = state.dice ? state.dice.w[0] + state.dice.w[1] : 0;
      const sl = q('.sel-line');
      sl.classList.remove('bad');
      let line = '';
      if (state.phase === 'mark' && !anim) {
        line = `White sum <b>${ws}</b>`;
        if (sel.length && seat >= 0 && !done) line += ` · picked ${sel.map((m) => `<span class="rows-tag" style="--rc:${HEX[m.row]}">${m.n}</span>`).join(' ')}`;
        if (done) line += ' · sent ✓';
      } else if (state.phase === 'roll' && state.last) {
        const L = state.last;
        const pen = L.marks.map((x, i) => (x.pen ? state.players[i].name : null)).filter(Boolean);
        if (L.locks.length) line = `${L.locks.map((c) => R.COLOR_NAMES[c]).join(' & ')} locked!`;
        else if (pen.length) { line = `${pen.join(', ')} took a penalty`; sl.classList.add('bad'); }
        else line = `Last roll: ${L.marks.reduce((a, x) => a + x.marks.length, 0)} marks made`;
      } else if (state.phase === 'over') {
        const w = (state.winners || []).map((i) => state.players[i].name);
        line = w.length > 1 ? `Tie: ${w.join(' & ')}` : `${w[0]} wins!`;
      }
      sl.innerHTML = line;

      // the one big button
      let txt = 'Roll';
      let dis = true;
      if (state.phase === 'roll') {
        txt = iAmActive ? 'Roll' : `Waiting for ${act.name}`;
        dis = !iAmActive || !!sent;
      } else if (state.phase === 'mark') {
        if (seat < 0) txt = 'Watching';
        else if (done) { txt = `Waiting for ${state.subs.filter((x) => x == null).length} more…`; }
        else {
          const plan = exactPlan();
          dis = anim || !!sent || !plan;
          txt = !plan ? 'Pick one more box' : plan.length ? `Done (${plan.length} mark${plan.length > 1 ? 's' : ''})` : iAmActive ? `Pass (−${R.PENALTY})` : 'Pass';
        }
      } else txt = 'Game over';
      goBtn.textContent = txt;
      goBtn.disabled = dis;
      goBtn.classList.toggle('rows-warn', state.phase === 'mark' && iAmActive && !done && !sel.length);

      let hint = '';
      if (state.phase === 'roll') {
        hint = iAmActive ? 'Roll the dice. Everyone plays your roll.' : !api.isAlive(act.pid) ? `Waiting for ${act.name} to come back…` : `${act.name} is about to roll.`;
      } else if (state.phase === 'mark' && !anim) {
        if (seat < 0) hint = 'Players are marking their sheets.';
        else if (done) {
          const wait = state.players.filter((_, i) => state.subs[i] == null).map((p) => p.name);
          hint = `Waiting for ${wait.join(', ')}`;
        } else if (!mine()) hint = 'Tap your own name below to get back to your sheet.';
        else if (iAmActive) hint = `Mark white ${ws} and/or one white + colour total in that colour's row. Mark nothing = penalty.`;
        else hint = `You may mark a ${ws} in any row, or pass.`;
      }
      q('.hint').textContent = hint;

      renderSheet();
      renderOthers();
    }

    return {
      update(next, prev) {
        const old = state || prev;
        state = next;
        if (old && next.rollNo !== old.rollNo) { sent = 0; sel = []; dice.forEach((d) => d.shake(false)); }
        if (old && old.phase === 'mark' && next.phase !== 'mark') sent = 0;
        if (next.phase !== 'mark' && next.phase !== 'roll') sent = 0;
        if (old && next.rollNo === old.rollNo + 1 && next.dice) {
          animatingUntil = Date.now() + ROLL_MS;
          dice.forEach((d, i) => {
            const v = i < 2 ? next.dice.w[i] : next.dice.c[i - 2];
            if (v) d.roll(v);
          });
          clearTimeout(uiTimer);
          uiTimer = setTimeout(render, ROLL_MS + 120);
        }
        render();
        if (old && old.phase === 'mark' && next.phase !== 'mark' && next.last) {
          const L = next.last;
          const ban = q('.banner');
          const myPen = me() >= 0 && L.marks[me()]?.pen;
          if (L.locks.length) banner(ban, `${L.locks.map((c) => R.COLOR_NAMES[c]).join(' & ').toUpperCase()} LOCKED!`, 'hot');
          else if (myPen) banner(ban, `PENALTY −${R.PENALTY}`, 'farkle');
        }
        if (old && next.phase === 'roll' && (old.active !== next.active || old.phase === 'deal')) {
          turnPill(q('.turn-banner'), next.active === me() ? 'Your roll' : `${next.players[next.active].name} rolls`, 900);
        }
      },
      refresh: render,
      destroy() { clearTimeout(uiTimer); clearInterval(clock); el.remove(); },
    };
  },
};
