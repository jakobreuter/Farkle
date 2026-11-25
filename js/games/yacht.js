import * as Y from '../engines/yacht.js';
import { createDie, ROLL_MS } from '../dice.js';
import { h, esc, scoreboard, banner, turnPill } from '../ui.js';

const rulesHTML = () => `
  <ol>
    <li>Each turn you get up to <b>3 rolls</b>. Tap dice to <b>hold</b> them between rolls.</li>
    <li>Then tap an empty box on your scorecard and press <b>Score</b>. Every box is used once — sometimes you have to take a 0.</li>
    <li>Upper section total of ${Y.BONUS_AT}+ earns a <b>${Y.BONUS}</b> bonus.</li>
    <li>After 13 turns each, the highest total wins.</li>
  </ol>
  <table>${Y.CATS.map((k) => `<tr><td>${Y.LABELS[k]}</td><td>${Y.HELP[k]}</td></tr>`).join('')}</table>`;

export default {
  id: 'yacht',
  name: 'Yacht',
  emoji: '⛵',
  blurb: 'Five dice, thirteen boxes to fill.',
  minPlayers: 1,
  maxPlayers: 6,
  options: [],

  setup(players, _opts, { first }) {
    return Y.newGame(players, first % players.length);
  },

  randomFor(s, a, seat) {
    if (a.type !== 'roll' || seat !== s.current) return null;
    const n = Y.diceToRoll(s);
    return n ? Array(n).fill(6) : null;
  },

  apply(s, a, seat, { rand }) {
    if (seat !== s.current) throw new Error('not your turn');
    if (a.type === 'roll') {
      if (!rand) throw new Error('no dice');
      return Y.applyAction(s, a, rand.map((v) => v + 1));
    }
    if (a.type === 'hold') return Y.applyAction(s, { type: 'hold', index: a.index });
    if (a.type === 'score') return Y.applyAction(s, { type: 'score', cat: a.cat });
    throw new Error('unknown action');
  },

  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: Y.totals(p.card).total, win: (s.winners || []).includes(i) })),
    };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game yacht">
      <section class="scoreboard"></section>
      <section class="table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points rolls"></div></div>
        <div class="sel-line"></div>
        <div class="tray five"></div>
        <div class="holds"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
        <div class="controls">
          <button class="btn primary big" data-a="roll">Roll</button>
          <button class="btn big" data-a="score">Score</button>
        </div>
        <div class="hint"></div>
      </section>
      <section class="card scorecard"><table></table></section>
    </div>`);
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    const tray = q('.tray');
    const holds = q('.holds');
    const dice = Array.from({ length: 5 }, (_, i) => createDie(i, (k) => onDie(k)));
    dice.forEach((d) => tray.appendChild(d.el));
    for (let i = 0; i < 5; i++) holds.appendChild(h('<span class="hold-tag">HOLD</span>'));

    let state = null;
    let animatingUntil = 0;
    let rollRequested = 0;
    let picked = null; // category selected on the scorecard, waiting for "Score"
    let theirPick = null; // box the current (other) player is considering
    let uiTimer = null;

    const mySeat = () => api.mySeat();
    const myTurn = () => state && state.phase === 'play' && state.current === mySeat();
    const rolled = () => state.rollsLeft < 3;

    function onDie(i) {
      if (!myTurn() || !rolled() || state.rollsLeft === 0 || Date.now() < animatingUntil || rollRequested) return;
      try { state = Y.applyAction(state, { type: 'hold', index: i }); render(); } catch { return; }
      api.act({ type: 'hold', index: i });
    }

    q('.controls').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a || !myTurn() || Date.now() < animatingUntil) return;
      if (a === 'roll' && Y.diceToRoll(state) && !rollRequested) {
        rollRequested = Date.now();
        picked = null;
        state.held.forEach((hd, i) => dice[i].shake(state.rollsLeft === 3 || !hd));
        render();
        api.act({ type: 'roll' });
        setTimeout(() => { if (rollRequested && Date.now() - rollRequested > 7900) { rollRequested = 0; dice.forEach((d) => d.shake(false)); render(); } }, 8000);
      } else if (a === 'score' && picked && rolled()) {
        api.act({ type: 'score', cat: picked });
        picked = null;
      }
    });

    q('.scorecard').addEventListener('click', (e) => {
      const cell = e.target.closest('td.open');
      if (!cell || !myTurn() || !rolled() || Date.now() < animatingUntil || rollRequested) return;
      picked = picked === cell.dataset.cat ? null : cell.dataset.cat;
      api.gameEvent({ k: 'pick', cat: picked, roll: state.rollNo });
      render();
    });

    function renderCard() {
      const me = mySeat();
      const players = state.players;
      const animating = Date.now() < animatingUntil;
      const canPick = myTurn() && rolled() && !animating && !rollRequested;
      const head = `<tr><th></th>${players.map((p, i) => `<th class="${i === state.current && state.phase === 'play' ? 'cur' : ''}">${esc(p.name)}${i === me ? ' (you)' : ''}</th>`).join('')}</tr>`;
      const row = (k) => `<tr><td class="cat">${Y.LABELS[k]}</td>${players.map((p, i) => {
        const v = p.card[k];
        if (v != null) return `<td class="done">${v}</td>`;
        if (i === state.current && canPick && i === me) {
          const pts = Y.scoreFor(k, state.dice);
          return `<td class="open${picked === k ? ' picked' : ''}${pts ? '' : ' zero'}" data-cat="${k}">${pts}</td>`;
        }
        // the other player's options, so you can follow along
        if (i === state.current && i !== me && state.phase === 'play' && rolled() && !animating) {
          const pts = Y.scoreFor(k, state.dice);
          return `<td class="preview${theirPick === k ? ' peek' : ''}${pts ? '' : ' zero'}">${pts}</td>`;
        }
        return '<td></td>';
      }).join('')}</tr>`;
      const tot = players.map((p) => Y.totals(p.card));
      const sumRow = (label, f, cls = '') => `<tr class="sum ${cls}"><td class="cat">${label}</td>${tot.map((t) => `<td>${f(t)}</td>`).join('')}</tr>`;
      q('.scorecard table').innerHTML = head
        + Y.UPPER.map(row).join('')
        + sumRow(`Bonus (${Y.BONUS_AT}+)`, (t) => (t.bonus ? `+${t.bonus}` : `${t.upper}/${Y.BONUS_AT}`))
        + Y.LOWER.map(row).join('')
        + sumRow('Total', (t) => t.total, 'grand');
    }

    function render() {
      if (!state) return;
      const animating = Date.now() < animatingUntil;
      const me = mySeat();
      scoreboard(q('.scoreboard'), state.players.map((p, i) => ({
        name: p.name,
        score: Y.totals(p.card).total,
        active: i === state.current && state.phase === 'play',
        me: i === me,
        away: !api.isAlive(p.pid),
        sub: `${Y.CATS.filter((k) => p.card[k] != null).length}/13`,
      })));
      const cur = state.players[state.current];
      q('.turn-label').textContent = state.phase === 'over' ? 'Game over' : myTurn() ? 'Your turn' : `${cur.name}’s turn`;
      q('.rolls').textContent = state.phase === 'over' ? '' : `Roll ${3 - state.rollsLeft}/3 · Turn ${Math.min(state.turn, 13)}/13`;

      state.dice.forEach((v, i) => {
        const d = dice[i];
        d.set(v);
        const held = rolled() && state.held[i];
        d.el.classList.toggle('held', held);
        holds.children[i].classList.toggle('on', held);
        d.el.classList.toggle('clickable', myTurn() && rolled() && state.rollsLeft > 0 && !animating && !rollRequested);
        d.el.classList.toggle('dim', !rolled() && !d.el.classList.contains('shaking'));
      });

      const sel = q('.sel-line');
      sel.classList.remove('bad');
      sel.textContent = picked && myTurn() ? `${Y.LABELS[picked]}: ${Y.scoreFor(picked, state.dice)} points` : '';

      const busy = animating || !!rollRequested;
      const [rollBtn, scoreBtn] = el.querySelectorAll('.controls .btn');
      const n = Y.diceToRoll(state);
      rollBtn.disabled = !myTurn() || !n || busy;
      rollBtn.textContent = !myTurn() ? 'Roll' : state.rollsLeft === 0 ? 'No rolls left' : `Roll ${n}`;
      scoreBtn.disabled = !myTurn() || !picked || busy;
      scoreBtn.textContent = picked && myTurn() ? `Score ${Y.scoreFor(picked, state.dice)}` : 'Score';

      let hint = '';
      if (state.phase === 'over' || animating) hint = '';
      else if (!myTurn()) hint = !api.isAlive(cur.pid) ? `Waiting for ${cur.name} to come back…` : rolled() ? `${cur.name}’s options are shown on the scorecard` : `Waiting for ${cur.name}…`;
      else if (!rolled()) hint = 'Roll the dice to start your turn.';
      else if (state.rollsLeft > 0) hint = picked ? 'Press Score, or keep rolling.' : 'Tap dice to hold them, roll again, or pick a box below.';
      else hint = picked ? 'Press Score to confirm.' : 'Pick a box on your scorecard below.';
      q('.hint').textContent = hint;

      renderCard();
    }

    return {
      update(next) {
        const old = state;
        state = next;
        if (old && next.rollNo !== old.rollNo) { rollRequested = 0; dice.forEach((d) => d.shake(false)); }
        if (old && (old.current !== next.current || next.rollsLeft === 3)) { picked = null; theirPick = null; }
        if (old && next.rollNo !== old.rollNo) theirPick = null;
        if (old && next.lastRoll && next.rollNo === old.rollNo + 1) {
          animatingUntil = Date.now() + ROLL_MS;
          next.lastRoll.indices.forEach((di) => dice[di].roll(next.dice[di]));
          clearTimeout(uiTimer);
          uiTimer = setTimeout(render, ROLL_MS + 180);
        }
        render();
        if (old && next.event === 'yacht' && old.event !== 'yacht') banner(q('.banner'), 'YACHT!', 'hot');
        if (old && old.current !== next.current && next.phase === 'play') {
          const nm = next.players[next.current].name;
          turnPill(q('.turn-banner'), next.current === mySeat() ? 'Your turn' : `${nm}’s turn`, 300);
        }
      },
      refresh: render,
      onEvent(m, from) {
        if (m?.k !== 'pick' || !state || from !== state.players[state.current]?.pid || m.roll !== state.rollNo) return;
        theirPick = Y.CATS.includes(m.cat) ? m.cat : null;
        render();
      },
      destroy() { clearTimeout(uiTimer); el.remove(); },
    };
  },
};
