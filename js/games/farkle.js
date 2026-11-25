import * as F from '../engines/farkle.js';
import { createDie, ROLL_MS } from '../dice.js';
import { h, scoreboard, banner, turnPill } from '../ui.js';

const rulesHTML = () => `
  <ol>
    <li>Roll six dice. Tap the scoring dice you want, then <b>Set aside</b>.</li>
    <li><b>Roll</b> the rest for more points, or <b>Bank</b> your turn total.</li>
    <li>Your first bank must be at least <b>${F.ENTRY_MIN}</b> points in one turn.</li>
    <li>No scoring dice in a roll = <b>Farkle</b>: you lose that turn’s points.</li>
    <li>Score with all six dice = <b>hot dice</b>: roll all six again.</li>
    <li>When someone reaches the target, everyone else gets one last turn.</li>
  </ol>
  <table>${F.SCORING_RULES.map(([a, b]) => `<tr><td>${a}</td><td>${typeof b === 'number' ? b.toLocaleString() : b}</td></tr>`).join('')}</table>`;

export default {
  id: 'farkle',
  name: 'Farkle',
  emoji: '🎲',
  blurb: 'Six dice, push your luck.',
  minPlayers: 1,
  maxPlayers: 8,
  options: [
    { key: 'target', label: 'Play to', default: 10000, choices: [[10000, '10,000'], [5000, '5,000'], [2500, '2,500 (quick)']] },
  ],

  setup(players, opts, { first }) {
    return F.newGame(players, Number(opts.target) || 10000, first % players.length);
  },

  randomFor(s, a, seat) {
    if (a.type !== 'roll' || seat !== s.current) return null;
    const n = F.diceToRoll(s);
    return n ? Array(n).fill(6) : null;
  },

  apply(s, a, seat, { now, rand }) {
    if (a.type === 'pass') {
      if (seat !== -1) throw new Error('system only');
      return F.applyAction(s, { type: 'pass' });
    }
    if (seat !== s.current) throw new Error('not your turn');
    if (a.type === 'roll') {
      if (!rand) throw new Error('no dice');
      const next = F.applyAction(s, { type: 'roll', values: rand.map((v) => v + 1) });
      if (next.phase === 'farkle') next.autoAt = now + ROLL_MS + 1900;
      return next;
    }
    if (a.type === 'toggle') return F.applyAction(s, { type: 'toggle', index: Number(a.index) });
    if (a.type === 'setAside' || a.type === 'bank') return F.applyAction(s, { type: a.type });
    throw new Error('unknown action');
  },

  tick(s, { now }) {
    return s.phase === 'farkle' && s.autoAt && now >= s.autoAt ? { type: 'pass' } : null;
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.score, win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game farkle">
      <section class="scoreboard"></section>
      <section class="table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points">Turn: <strong>0</strong></div></div>
        <div class="sel-line"></div>
        <div class="tray"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
        <div class="controls">
          <button class="btn primary big" data-a="roll">Roll</button>
          <button class="btn big" data-a="setAside">Set aside</button>
          <button class="btn big" data-a="bank">Bank</button>
        </div>
        <div class="hint"></div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const tray = q('.tray');
    const dice = Array.from({ length: 6 }, (_, i) => createDie(i, (k) => onDie(k)));
    dice.forEach((d) => tray.appendChild(d.el));

    let state = null;
    let animatingUntil = 0;
    let rollRequested = 0;
    let uiTimer = null;
    let lastBannerKey = '';

    const mySeat = () => api.mySeat();
    const myTurn = () => state && state.phase !== 'over' && state.current === mySeat();

    function onDie(i) {
      if (!myTurn() || state.phase !== 'select' || Date.now() < animatingUntil || state.dice[i].kept) return;
      // optimistic toggle for a snappy feel; the host confirms
      try { state = F.applyAction(state, { type: 'toggle', index: i }); render(); } catch { return; }
      api.act({ type: 'toggle', index: i });
    }

    el.querySelector('.controls').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a || !myTurn() || Date.now() < animatingUntil) return;
      if (a === 'roll') {
        if (!F.diceToRoll(state) || rollRequested) return;
        rollRequested = Date.now();
        shakeFree(true);
        render();
        api.act({ type: 'roll' });
        setTimeout(() => { if (rollRequested && Date.now() - rollRequested > 7900) { rollRequested = 0; shakeFree(false); render(); } }, 8000);
      } else if (a === 'setAside' && F.canSetAside(state)) {
        api.act({ type: 'setAside' });
      } else if (a === 'bank' && F.canBank(state)) {
        api.act({ type: 'bank' });
      }
    });

    function shakeFree(on) {
      state.dice.forEach((d, i) => dice[i].shake(on && !d.kept));
    }

    function render() {
      if (!state) return;
      const animating = Date.now() < animatingUntil;
      const me = mySeat();
      scoreboard(q('.scoreboard'), state.players.map((p, i) => ({
        name: p.name,
        score: p.score,
        active: i === state.current && state.phase !== 'over',
        me: i === me,
        away: !api.isAlive(p.pid),
        pct: (p.score / state.target) * 100,
      })));

      const cur = state.players[state.current];
      q('.turn-label').textContent = state.phase === 'over' ? 'Game over'
        : (myTurn() ? 'Your turn' : `${cur.name}’s turn`) + (state.finalRound ? ' · final round' : '');
      q('.turn-points strong').textContent = state.turnPoints.toLocaleString();

      state.dice.forEach((d, i) => {
        const die = dice[i];
        die.el.classList.toggle('kept', d.kept);
        die.set(d.value);
        const selectable = !animating && myTurn() && state.phase === 'select' && !d.kept && !rollRequested;
        die.el.classList.toggle('clickable', selectable);
        die.el.classList.toggle('selected', state.selected.includes(i));
        die.el.classList.toggle('dim', state.phase === 'start' && !die.el.classList.contains('shaking'));
      });

      const sel = q('.sel-line');
      if (state.phase === 'select' && state.selected.length && !animating) {
        const pts = F.selectionScore(state);
        sel.textContent = pts ? `+${pts} selected` : 'Selection doesn’t score';
        sel.classList.toggle('bad', !pts);
      } else {
        sel.textContent = '';
      }

      const busy = animating || !!rollRequested;
      const n = F.diceToRoll(state);
      const [rollBtn, asideBtn, bankBtn] = el.querySelectorAll('.controls .btn');
      rollBtn.disabled = !myTurn() || !n || busy;
      asideBtn.disabled = !myTurn() || !F.canSetAside(state) || busy;
      bankBtn.disabled = !myTurn() || !F.canBank(state) || busy;
      rollBtn.textContent = n ? `Roll ${n}` : 'Roll';
      bankBtn.textContent = F.canBank(state) ? `Bank ${state.turnPoints.toLocaleString()}` : 'Bank';

      let hint = '';
      if (state.phase === 'over' || animating) hint = '';
      else if (!myTurn()) hint = state.phase === 'farkle' ? '' : api.isAlive(cur.pid) ? `Waiting for ${cur.name}…` : `Waiting for ${cur.name} to come back…`;
      else if (state.phase === 'start') hint = 'Roll to start your turn.';
      else if (state.phase === 'select') {
        hint = !state.selected.length
          ? (!state.asideThisRoll ? 'Tap the scoring dice you want to keep.'
            : F.belowEntry(state) ? `Keep going — you need ${state.entryMin ?? F.ENTRY_MIN} to get on the board.`
              : 'Roll the rest, or bank your points.')
          : F.selectionScore(state) ? 'Tap Set aside to keep them.' : 'Every kept die must score.';
      }
      q('.hint').textContent = hint;

      if (!animating && state.event) {
        const key = `${state.rollNo}:${state.event}:${state.players.map((p) => p.score).join()}`;
        const txt = { farkle: 'FARKLE!', hot: 'HOT DICE!', bank: 'BANKED!' }[state.event];
        if (txt && key !== lastBannerKey) {
          lastBannerKey = key;
          banner(q('.banner'), txt, state.event);
        }
      }
    }

    return {
      update(next, prev) {
        const old = state;
        state = next;
        const fresh = !old;
        if (old && next.rollNo !== old.rollNo) {
          rollRequested = 0;
          shakeFree(false);
        }
        if (fresh) {
          lastBannerKey = `${next.rollNo}:${next.event}:${next.players.map((p) => p.score).join()}`;
        }
        if (old && next.lastRoll && next.rollNo === old.rollNo + 1) {
          render(); // gray out set-aside dice first, then tumble the rolled ones
          animatingUntil = Date.now() + ROLL_MS;
          next.lastRoll.indices.forEach((di) => dice[di].roll(next.dice[di].value));
          clearTimeout(uiTimer);
          uiTimer = setTimeout(render, ROLL_MS + 180);
        }
        render();
        if (old && old.current !== next.current && next.phase !== 'over') {
          const nm = next.players[next.current].name;
          turnPill(q('.turn-banner'), next.current === mySeat() ? 'Your turn' : `${nm}’s turn`, old.phase === 'farkle' ? 150 : 1150);
        }
      },
      refresh: render,
      destroy() { clearTimeout(uiTimer); el.remove(); },
    };
  },
};
