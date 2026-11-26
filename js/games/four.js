import * as S from '../engines/four.js';
import { h, esc, banner, turnPill } from '../ui.js';

// Board geometry in SVG units: 100 per cell, a 14-unit rim all round.
const CELL = 100;
const RIM = 14;
const W = S.COLS * CELL + RIM * 2;
const H = S.ROWS * CELL + RIM * 2;
const HOLE = 39;
const COLOR = ['red', 'gold'];
const COLOR_NAME = ['Red', 'Gold'];

const pct = (n, of) => `${((n / of) * 100).toFixed(4)}%`;
const fallMs = (cells) => Math.round(170 + 62 * Math.sqrt(cells) * 2.2);

function frameSVG() {
  let holes = '';
  let rims = '';
  for (let c = 0; c < S.COLS; c++) {
    for (let r = 0; r < S.ROWS; r++) {
      const x = RIM + c * CELL + CELL / 2;
      const y = RIM + r * CELL + CELL / 2;
      holes += `M${x - HOLE} ${y}a${HOLE} ${HOLE} 0 1 0 ${HOLE * 2} 0a${HOLE} ${HOLE} 0 1 0 ${-HOLE * 2} 0Z`;
      rims += `<circle cx="${x}" cy="${y}" r="${HOLE + 1.5}"/>`;
    }
  }
  return `<svg class="fr-frame" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="frBlue" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0" stop-color="#3f7be6"/><stop offset=".5" stop-color="#2459c6"/><stop offset="1" stop-color="#173f99"/>
      </linearGradient>
    </defs>
    <path fill="url(#frBlue)" fill-rule="evenodd" d="M24 0H${W - 24}Q${W} 0 ${W} 24V${H - 24}Q${W} ${H} ${W - 24} ${H}H24Q0 ${H} 0 ${H - 24}V24Q0 0 24 0Z${holes}"/>
    <g fill="none" stroke="#0b2a6e" stroke-opacity=".55" stroke-width="4">${rims}</g>
    <g fill="none" stroke="#9cc0ff" stroke-opacity=".35" stroke-width="2" transform="translate(-1.2 -1.6)">${rims}</g>
    <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="22" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="3"/>
    <g class="fr-winrings"></g>
  </svg>`;
}

const rulesHTML = () => `
  <ol>
    <li>Take turns dropping a disc into one of the seven columns — it falls to the lowest empty space. Tap anywhere in a column.</li>
    <li>Get <b>four of your discs in a line</b> — across, up and down, or diagonally — to win the game.</li>
    <li>If the board fills up with no line of four, the game is a draw.</li>
    <li>In a <b>best of 3</b> or <b>best of 5</b> match, the first to 2 (or 3) game wins takes the match. The loser of each game starts the next; after a draw the other player starts. Draws don’t count, but a match ends after 5 (or 7) games — most wins takes it.</li>
  </ol>`;

export default {
  id: 'four',
  name: 'Four in a Row',
  emoji: '🔴',
  blurb: 'Drop discs, line up four.',
  minPlayers: 2,
  maxPlayers: 2,
  options: [
    { key: 'bestOf', label: 'Match', default: 1, choices: [[1, 'Single game'], [3, 'Best of 3'], [5, 'Best of 5']] },
  ],

  setup(players, opts, { first }) {
    return S.newGame(players, (first || 0) % 2, { bestOf: Number(opts.bestOf) || 1 });
  },
  randomFor() { return null; },
  apply(s, a, seat, { now }) {
    if ((a.type === 'next') !== (seat === -1)) throw new Error('not allowed');
    return S.applyAction(s, a, seat, now);
  },
  tick(s, { now }) {
    return s.phase === 'gameover' && now >= s.autoAt ? { type: 'next' } : null;
  },
  botDelay: 900,
  bot(s, seat) {
    if (s.phase !== 'play' || s.current !== seat) return null;
    return { type: 'drop', col: S.bestMove(s, seat, { tie: Math.random() }) };
  },
  results(s) {
    return {
      over: s.phase === 'over',
      rows: s.players.map((p, i) => ({ name: p.name, score: p.wins, win: (s.winners || []).includes(i) })),
    };
  },
  rulesHTML,

  createView(root, api) {
    const colBtns = [...Array(S.COLS).keys()].map((c) => `<button class="fr-colbtn" data-c="${c}" aria-label="Column ${c + 1}"></button>`).join('');
    const el = h(`<div class="game four">
      <section class="table fr-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points fr-gameno"></div></div>
        <div class="fr-score">
          <div class="fr-side fr-s0"><i class="fr-chip red"></i><div class="fr-who"><span class="fr-nm"></span><span class="fr-pips"></span></div><b class="fr-wins"></b></div>
          <div class="fr-mid"></div>
          <div class="fr-side fr-s1"><b class="fr-wins"></b><div class="fr-who"><span class="fr-nm"></span><span class="fr-pips"></span></div><i class="fr-chip gold"></i></div>
        </div>
        <div class="fr-stage">
          <div class="fr-aim"><div class="fr-ghost"><i></i></div></div>
          <div class="fr-boardbox">
            <div class="fr-glow"></div>
            <div class="fr-discs"></div>
            ${frameSVG()}
          </div>
          <div class="fr-cols">${colBtns}</div>
        </div>
        <div class="hint fr-hint"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);
    const discs = q('.fr-discs');
    const ghost = q('.fr-ghost');
    const glow = q('.fr-glow');
    // position overlays to line up with the cells inside the rim
    for (const x of [discs, q('.fr-cols'), q('.fr-aim')]) {
      x.style.left = pct(RIM, W);
      x.style.right = pct(RIM, W);
    }
    discs.style.top = pct(RIM, H);
    discs.style.bottom = pct(RIM, H);

    let state = null;
    let aim = null; // column the ghost disc hovers over
    let pending = 0;
    let uiTimer = null;
    let countdown = null;
    let lastKey = '';

    const mySeat = () => api.mySeat();
    const myTurn = () => state && state.phase === 'play' && state.current === mySeat();
    const canPlay = () => myTurn() && !pending;
    const nameOf = (i) => (i === mySeat() ? 'You' : state.players[i].name);
    const isBot = (i) => String(state.players[i].pid).startsWith('bot-');

    function setAim(c) {
      if (c === aim) return;
      aim = c;
      renderAim();
    }

    const cols = q('.fr-cols');
    cols.addEventListener('pointermove', (e) => {
      const b = e.target.closest('.fr-colbtn');
      if (b && myTurn()) setAim(Number(b.dataset.c));
    });
    cols.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.fr-colbtn');
      if (b && myTurn()) setAim(Number(b.dataset.c));
    });
    cols.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { aim = null; renderAim(); } });
    cols.addEventListener('click', (e) => {
      const b = e.target.closest('.fr-colbtn');
      if (!b || !state || !canPlay()) return;
      const c = Number(b.dataset.c);
      if (!S.canDrop(state, c)) { api.toast?.('That column is full.'); return; }
      pending = Date.now();
      setAim(c);
      render();
      api.act({ type: 'drop', col: c });
      setTimeout(() => { if (pending && Date.now() - pending > 4900) { pending = 0; render(); } }, 5000);
    });

    function discEl(c, r, seat) {
      const d = document.createElement('div');
      d.className = `fr-disc ${COLOR[seat]}`;
      d.dataset.k = `${c}:${r}`;
      d.style.left = pct(c, S.COLS);
      d.style.top = pct(S.ROWS - 1 - r, S.ROWS);
      d.innerHTML = '<i></i>';
      return d;
    }

    function renderDiscs(animate) {
      // rebuild when the set of discs changed in any way other than one new disc
      const want = new Map();
      state.cols.forEach((col, c) => col.forEach((seat, r) => want.set(`${c}:${r}`, seat)));
      const have = new Map([...discs.children].map((d) => [d.dataset.k, d]));
      for (const [k, d] of have) {
        if (!want.has(k) || !d.classList.contains(COLOR[want.get(k)])) { d.remove(); have.delete(k); }
      }
      for (const [k, seat] of want) {
        if (have.has(k)) continue;
        const [c, r] = k.split(':').map(Number);
        const d = discEl(c, r, seat);
        if (animate && state.last && state.last.col === c && state.last.row === r) {
          const cells = S.ROWS - r + RIM / CELL; // from the aim row down to the cell
          d.style.setProperty('--fall', `${-cells * 100}%`);
          d.style.setProperty('--ms', `${fallMs(cells)}ms`);
          d.classList.add('fr-drop');
        }
        discs.appendChild(d);
      }
      const win = new Set((state.line || []).map(([c, r]) => `${c}:${r}`));
      const ended = state.phase !== 'play';
      for (const d of discs.children) {
        d.classList.toggle('fr-won', win.has(d.dataset.k));
        d.classList.toggle('fr-dim', ended && win.size > 0 && !win.has(d.dataset.k));
      }
    }

    function renderWinRings(delay) {
      const g = q('.fr-winrings');
      g.innerHTML = (state.line || []).map(([c, r]) => {
        const x = RIM + c * CELL + CELL / 2;
        const y = RIM + (S.ROWS - 1 - r) * CELL + CELL / 2;
        return `<circle cx="${x}" cy="${y}" r="${HOLE + 2}"/>`;
      }).join('');
      g.style.animationDelay = `${delay}ms`;
      g.classList.remove('fr-on');
      if (state.line) { void g.getBoundingClientRect(); g.classList.add('fr-on'); }
    }

    function renderAim() {
      if (!state) return;
      const show = myTurn() && aim != null && S.canDrop(state, aim) && !pending;
      ghost.className = `fr-ghost ${COLOR[Math.max(0, mySeat())]}${show ? ' fr-show' : ''}`;
      if (aim != null) ghost.style.left = pct(aim, S.COLS);
      glow.classList.toggle('fr-show', show);
      if (aim != null) {
        glow.style.left = `calc(${pct(RIM, W)} + ${(aim / S.COLS) * (1 - (2 * RIM) / W) * 100}%)`;
        glow.style.width = `${(1 / S.COLS) * (1 - (2 * RIM) / W) * 100}%`;
      }
      [...cols.children].forEach((b, c) => { b.disabled = !myTurn() || !S.canDrop(state, c); });
    }

    function pips(p) {
      if (state.need <= 1) return '';
      return Array.from({ length: state.need }, (_, k) => `<i class="${k < p.wins ? 'on' : ''}"></i>`).join('');
    }

    function render() {
      if (!state) return;
      const me = mySeat();
      const cur = state.current;
      const lbl = q('.turn-label');
      if (state.phase === 'play') {
        lbl.innerHTML = `<i class="fr-dot ${COLOR[cur]}"></i>${cur === me ? 'Your turn' : `${esc(state.players[cur].name)}’s turn`}`;
      } else if (state.phase === 'gameover') {
        lbl.innerHTML = state.gameWinner >= 0 ? `<i class="fr-dot ${COLOR[state.gameWinner]}"></i>${state.gameWinner === me ? 'You win this game' : `${esc(state.players[state.gameWinner].name)} wins this game`}` : 'This game is a draw';
      } else {
        const w = state.winners?.[0];
        lbl.innerHTML = w == null ? (state.bestOf > 1 ? 'Match drawn' : 'It’s a draw') : `<i class="fr-dot ${COLOR[w]}"></i>${w === me ? 'You win' : `${esc(state.players[w].name)} wins`}${state.bestOf > 1 ? ' the match' : ''}!`;
      }
      q('.fr-gameno').textContent = state.bestOf > 1 ? `Game ${state.gameNo}` : '';
      q('.fr-mid').innerHTML = state.bestOf > 1
        ? `<span>Best of ${state.bestOf}</span><b>First to ${state.need}</b>`
        : '<span>Single</span><b>game</b>';
      state.players.forEach((p, i) => {
        const side = q(`.fr-s${i}`);
        side.classList.toggle('fr-active', state.phase === 'play' && cur === i);
        side.classList.toggle('fr-away', !api.isAlive(p.pid));
        side.querySelector('.fr-nm').textContent = p.name;
        side.classList.toggle('fr-me', i === me);
        side.querySelector('.fr-pips').innerHTML = pips(p) || `<small>${COLOR_NAME[i]}</small>`;
        side.querySelector('.fr-wins').textContent = state.bestOf > 1 ? p.wins : '';
      });

      let hint = '';
      if (state.phase === 'play') {
        if (myTurn()) hint = state.moves < 2 ? 'Tap a column to drop your disc. Line up four to win!' : 'Tap a column to drop your disc.';
        else if (!api.isAlive(state.players[cur].pid)) hint = `Waiting for ${state.players[cur].name} to come back…`;
        else hint = isBot(cur) ? `${state.players[cur].name} is thinking…` : `Waiting for ${state.players[cur].name}…`;
      } else if (state.phase === 'gameover') {
        const secs = Math.max(1, Math.ceil((state.autoAt - api.hostNow()) / 1000));
        const nxt = state.gameWinner >= 0 ? 1 - state.gameWinner : 1 - state.starter;
        hint = `Next game in ${secs}… ${nameOf(nxt)} ${nxt === me ? 'start' : 'starts'}.`;
      } else {
        const [a, b] = state.players.map((p) => p.wins);
        hint = state.bestOf > 1 ? `Final score ${a}–${b}${state.draws ? ` (${state.draws} drawn)` : ''}.` : (state.line ? 'Four in a row!' : 'The board is full.');
      }
      q('.fr-hint').textContent = hint;
      el.classList.toggle('fr-myturn', !!myTurn());
      renderAim();
    }

    function tickUI() {
      clearInterval(countdown);
      countdown = null;
      if (state?.phase === 'gameover') countdown = setInterval(render, 400);
    }

    return {
      update(next, prevState) {
        const old = state || null;
        state = next;
        const sameGame = old && old.gameNo === next.gameNo;
        const dropped = sameGame && next.moves === old.moves + 1;
        if (!old || next.moves !== old.moves || next.gameNo !== old.gameNo) pending = 0;
        if (old && !sameGame) discs.innerHTML = '';
        let wait = 0;
        if (dropped) {
          const cells = S.ROWS - next.last.row + RIM / CELL;
          wait = fallMs(cells);
        }
        // reset the aiming disc when my turn starts
        if (myTurn() && (!old || old.current !== next.current || !sameGame)) aim = next.last ? next.last.col : 3;
        if (!myTurn()) aim = null;
        renderDiscs(dropped);
        const lineNew = !!next.line && !(old && old.line && sameGame);
        if (lineNew || !next.line) renderWinRings(wait);
        render();
        clearTimeout(uiTimer);
        if (wait) uiTimer = setTimeout(render, wait + 20);
        tickUI();

        const key = `${next.gameNo}:${next.phase}`;
        if (old && key !== lastKey && next.phase !== 'play') {
          const me = mySeat();
          const gw = next.gameWinner;
          const matchW = next.winners?.[0];
          let text;
          let kind;
          if (next.phase === 'over' && next.bestOf > 1) {
            if (matchW == null) { text = 'MATCH DRAWN'; kind = 'bank'; } else if (me >= 0) { text = matchW === me ? 'MATCH WON!' : 'MATCH LOST'; kind = matchW === me ? 'hot' : 'farkle'; } else { text = `${COLOR_NAME[matchW].toUpperCase()} WINS!`; kind = 'bank'; }
          } else if (gw < 0) { text = 'DRAW'; kind = 'bank'; } else if (me >= 0) { text = gw === me ? 'YOU WIN!' : 'YOU LOSE'; kind = gw === me ? 'hot' : 'farkle'; } else { text = `${COLOR_NAME[gw].toUpperCase()} WINS!`; kind = 'bank'; }
          setTimeout(() => banner(q('.banner'), text, kind, 1900), wait + 450);
        }
        if (old && !sameGame && next.phase === 'play') {
          turnPill(q('.turn-banner'), `Game ${next.gameNo} · ${next.current === mySeat() ? 'You start' : `${next.players[next.current].name} starts`}`, 100);
        }
        lastKey = key;
        void prevState;
      },
      refresh: render,
      destroy() { clearTimeout(uiTimer); clearInterval(countdown); el.remove(); },
    };
  },
};
