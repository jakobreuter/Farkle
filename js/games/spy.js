import * as S from '../engines/spy.js';
import { h, esc, banner, turnPill } from '../ui.js';

const KIND_CLASS = { r: 'k-r', b: 'k-b', n: 'k-n', x: 'k-x' };
const NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, S.INF];
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

const rulesHTML = () => `
  <ol>
    <li>25 words are dealt. A secret key marks <b>9 or 8</b> of them for each team, <b>7</b> as neutral and <b>1 as the trap</b>.</li>
    <li>Each team has a <b>Spymaster</b> (it rotates every game). Only Spymasters see the key — so keep your phone to yourself!</li>
    <li>On your team’s turn the Spymaster gives <b>one word and a number</b>, e.g. “OCEAN 2”: two words on the table go with “ocean”. The clue can’t be a word on the table (or part of one).</li>
    <li>Teammates tap words to guess (tap once to point, tap again to reveal — anyone on the team can do it). Keep going while you’re right, up to the number <b>+ 1</b>. With 0 or ∞ there’s no limit.</li>
    <li>A neutral or enemy word ends your turn. The <b>trap</b> loses the game at once! You may also tap <b>End guessing</b> after at least one guess.</li>
    <li>The first team to uncover all of its words wins (even if the other team uncovers the last one for them).</li>
    <li><b>Co-op</b> (2–3 players, or if the host picks it): everyone is on one team with one Spymaster. Find your 9 words before the turns run out — after each of your turns the rival team uncovers one of its words on its own.</li>
  </ol>`;

export default {
  id: 'spy',
  name: 'Spy Words',
  emoji: '🕵️‍♀️',
  blurb: 'One-word clues, two teams, and a trap to avoid.',
  minPlayers: 2,
  maxPlayers: 10,
  options: [
    { key: 'mode', label: 'Mode', default: 'auto', choices: [['auto', 'Red vs Blue (co-op if 2–3)'], ['coop', 'Everyone together (co-op)']] },
    { key: 'teams', label: 'Teams', default: 'alt', choices: [['alt', 'Auto (alternate)'], ['halves', 'By join order'], ['shuffle', 'Shuffle']] },
    { key: 'limit', label: 'Co-op turns', default: 9, choices: [[9, '9 turns'], [7, '7 (hard)'], [11, '11 (easy)']] },
  ],

  setup(players, opts, { first }) {
    const limit = [7, 9, 11].includes(Number(opts?.limit)) ? Number(opts.limit) : 9;
    return S.newGame(players, first || 0, { mode: opts?.mode === 'coop' ? 'coop' : 'auto', teams: opts?.teams, limit });
  },

  randomFor(s, a, seat) {
    if (seat !== -1) return null;
    if (a.type === 'deal' && s.phase === 'deal') return S.dealRanges(s);
    if (a.type === 'rival' && s.phase === 'rival') {
      const n = S.left(s, 'b');
      return n ? [n] : null;
    }
    return null;
  },

  apply(s, a, seat, { now, rand }) {
    return S.applyAction(s, a, seat, { now, rand });
  },

  tick(s, { now }) {
    if (s.phase === 'deal') return { type: 'deal' };
    if (s.phase === 'rival' && now >= s.rivalAt) return { type: 'rival' };
    if (s.phase === 'end' && now >= s.endUntil) return { type: 'finish' };
    return null;
  },

  // no `bot`: a computer can't think up word-association clues, so the lobby blocks computer players

  results(s) {
    const over = s.phase === 'over';
    if (!S.isCoop(s)) {
      // one row per team; seats alternate Red/Blue so row i lines up with a player of that team
      const rows = [0, 1].map((t) => ({
        name: `${S.TEAM_NAMES[t]} team`,
        score: S.total(s, S.TEAM_KEY[t]) - S.teamLeft(s, t),
        win: over && s.winner === t,
      }));
      const winPids = s.winner != null ? s.players.filter((p) => p.team === s.winner).map((p) => p.pid) : [];
      return { over, rows, winPids, title: s.winner != null ? `🏆 ${S.TEAM_NAMES[s.winner]} team wins!` : '' };
    }
    const found = S.total(s, 'r') - S.left(s, 'r');
    if (s.winner === 0) return { over, rows: [{ name: 'Your team', score: found, win: over }], winPids: s.players.map((p) => p.pid), title: 'You found them all!' };
    // a loss: everyone loses to the clock (or the trap)
    const rows = s.players.map((p) => ({ name: p.name, score: found, win: false }));
    if (over) rows.push({ name: s.reason === 'trap' ? 'The trap' : 'The clock', score: 0, win: true });
    return { over, rows, winPids: [], title: s.reason === 'trap' ? '💥 Caught by the trap!' : '⏰ Out of turns!' };
  },

  rulesHTML,

  createView(root, api) {
    const el = h(`<div class="game spy">
      <section class="table sw-table">
        <div class="turn-info"><div class="turn-label"></div><div class="turn-points sw-left"></div></div>
        <div class="sw-role"><span class="sw-roletext"></span><button class="btn small sw-eye hidden" type="button">Hide key</button></div>
        <div class="sw-clue"></div>
        <div class="sw-grid"></div>
        <div class="hint"></div>
        <div class="sw-panel"></div>
        <div class="banner hidden"></div>
        <div class="turn-banner"></div>
      </section>
      <section class="sw-info">
        <div class="sw-teams"></div>
        <div class="sw-loghead">Clues</div>
        <ol class="sw-log"></ol>
      </section>
      <div class="sw-sheet hidden">
        <div class="sw-sheetcard">
          <div class="sw-sheeticon">🕵️‍♀️</div>
          <div class="sw-sheettitle"></div>
          <p class="sw-sheettext">You can see the <b>secret key</b>. Don’t let anyone else see your screen!</p>
          <div class="sw-legend"></div>
          <button class="btn primary big sw-gotit" type="button">Got it</button>
        </div>
      </div>
    </div>`);
    root.appendChild(el);
    const q = (x) => el.querySelector(x);
    const grid = q('.sw-grid');
    const panel = q('.sw-panel');

    let state = null;
    let gridKey = '';
    let panelKey = '';
    let sel = -1; // card I'm pointing at (tap again to reveal)
    let selKey = '';
    let sent = 0;
    let num = null; // chosen clue number
    let hideKey = false;
    let sheetDone = '';
    const pointers = new Map(); // pid -> { i, key }

    const seat = () => api.mySeat();
    const meP = () => state?.players[seat()];
    const amSpy = () => !!state && S.isSpy(state, seat()) && state.phase !== 'deal';
    const turnKey = () => `${state.clues.length}:${state.guesses}:${state.phase}`;
    const tname = (t) => S.TEAM_NAMES[t];
    const coop = () => S.isCoop(state);
    const nm = (i) => (i === seat() ? 'You' : state.players[i]?.name || '?');
    const showAll = () => state.phase === 'end' || state.phase === 'over';
    const seeKey = () => showAll() || (amSpy() && !hideKey);

    function buildGrid() {
      const k = state.words.join(',');
      if (k === gridKey) return;
      gridKey = k;
      grid.innerHTML = state.words.map((w, i) => `<button class="sw-card" type="button" data-i="${i}">
        <span class="sw-w">${esc(cap(w))}</span><span class="sw-tag"></span><span class="sw-mark"></span></button>`).join('');
      requestAnimationFrame(fitAll);
    }

    /** shrink each word until it fits on its card */
    function fitAll() {
      grid.querySelectorAll('.sw-card').forEach((c) => {
        const w = c.querySelector('.sw-w');
        const avail = c.clientWidth - 8;
        if (avail <= 0) return;
        const len = w.textContent.length;
        let size = Math.min(c.clientWidth * 0.25, 22, avail / (len * 0.6));
        w.style.fontSize = `${size}px`;
        while (w.scrollWidth > avail && size > 7) {
          size -= 0.5;
          w.style.fontSize = `${size}px`;
        }
      });
    }
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      let lastW = 0;
      ro = new ResizeObserver(() => { if (grid.clientWidth !== lastW) { lastW = grid.clientWidth; fitAll(); } });
      ro.observe(grid);
    }

    function buildPanel() {
      const me = meP();
      const role = !me || state.phase === 'deal' ? 'watch' : amSpy() ? 'spy' : 'guess';
      if (role === panelKey) return;
      panelKey = role;
      panel.className = `sw-panel p-${role}`;
      if (role === 'spy') {
        panel.innerHTML = `<div class="sw-cluebox">
          <div class="sw-row"><input class="sw-input" type="text" maxlength="24" placeholder="One-word clue" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send">
            <button class="btn primary sw-send" type="button">Give clue</button></div>
          <div class="sw-nums">${NUMS.map((n) => `<button class="btn sw-num" type="button" data-n="${n}">${S.numText(n)}</button>`).join('')}</div>
          <div class="sw-err"></div>
        </div><div class="sw-wait"></div>`;
        const inp = panel.querySelector('.sw-input');
        inp.addEventListener('input', render);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendClue(); } });
      } else if (role === 'guess') {
        panel.innerHTML = `<div class="sw-gbox"><div class="sw-gcount"></div>
          <button class="btn sw-take hidden" type="button">Be Spymaster</button>
          <button class="btn big sw-endbtn" type="button">End guessing</button></div>`;
      } else {
        panel.innerHTML = '<div class="sw-watch"></div>';
      }
    }

    function sendClue() {
      const inp = panel.querySelector('.sw-input');
      if (!inp || !state || state.phase !== 'clue' || state.spy[state.team] !== seat() || sent) return;
      const word = inp.value.trim();
      if (S.clueProblem(state, word) || num == null) return;
      sent = Date.now();
      api.act({ type: 'clue', word, num });
      inp.blur();
      setTimeout(() => { if (sent && Date.now() - sent > 5900) { sent = 0; render(); } }, 6000);
      render();
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !state) return;
      if (b.classList.contains('sw-gotit')) { q('.sw-sheet').classList.add('hidden'); return; }
      if (b.classList.contains('sw-eye')) { hideKey = !hideKey; render(); return; }
      if (b.classList.contains('sw-num')) { num = Number(b.dataset.n); render(); return; }
      if (b.classList.contains('sw-send')) { sendClue(); return; }
      if (b.classList.contains('sw-take')) {
        const t = S.teamOf(state, seat());
        const spy = state.players[state.spy[t]];
        if (spy && !api.isAlive(spy.pid)) api.act({ type: 'takeover' });
        return;
      }
      if (b.classList.contains('sw-endbtn')) {
        if (!S.canGuess(state, seat()) || state.guesses < 1 || sent) return;
        sent = Date.now();
        api.act({ type: 'end' });
        setTimeout(() => { if (sent && Date.now() - sent > 5900) { sent = 0; render(); } }, 6000);
        render();
        return;
      }
      if (b.classList.contains('sw-card')) {
        const i = Number(b.dataset.i);
        if (!S.canGuess(state, seat()) || state.rev[i] || sent) return;
        if (selKey !== turnKey()) { sel = -1; selKey = turnKey(); }
        if (sel === i) {
          sent = Date.now();
          sel = -1;
          api.act({ type: 'guess', i });
          setTimeout(() => { if (sent && Date.now() - sent > 5900) { sent = 0; render(); } }, 6000);
        } else {
          sel = i;
          api.gameEvent({ t: 'pt', i, k: turnKey() });
        }
        render();
      }
    });

    function renderGrid() {
      buildGrid();
      const key = seeKey();
      const all = showAll();
      const can = S.canGuess(state, seat()) && !sent;
      if (selKey !== turnKey()) { sel = -1; selKey = turnKey(); }
      const tk = turnKey();
      const pointed = new Map();
      for (const [pid, p] of pointers) {
        if (p.k !== tk || pid === api.me) continue;
        const who = state.players.find((x) => x.pid === pid);
        if (who && !state.rev[p.i]) pointed.set(p.i, [...(pointed.get(p.i) || []), who.name]);
      }
      [...grid.children].forEach((c, i) => {
        const k = state.key[i];
        const r = state.rev[i];
        c.className = `sw-card ${r ? `rev ${KIND_CLASS[k]}` : key ? `key ${KIND_CLASS[k]}` : ''}${all && !r ? ' ghost' : ''}${can && !r ? ' live' : ''}${sel === i && can ? ' sel' : ''}${state.lastPick?.i === i ? ' last' : ''}`;
        c.disabled = !can || !!r;
        const tag = c.querySelector('.sw-tag');
        let t = '';
        if (sel === i && can) t = 'Tap again';
        else if (pointed.has(i) && !r) t = `${pointed.get(i)[0]}?`;
        else if (r && r.by >= 0 && !all) t = state.players[r.by]?.name || '';
        tag.textContent = t;
        c.querySelector('.sw-mark').textContent = k === 'x' && (r || key) ? '☠' : '';
      });
    }

    function renderTop() {
      const s = state;
      const me = meP();
      const myTeam = me ? me.team : null;
      const tl = q('.turn-label');
      let label = '';
      if (s.phase === 'deal') label = 'Dealing the words…';
      else if (showAll()) {
        if (coop()) label = s.winner === 0 ? 'You found them all!' : s.reason === 'trap' ? 'Caught by the trap!' : 'Out of turns!';
        else label = `${tname(s.winner)} team wins!`;
      } else if (coop()) label = s.phase === 'rival' ? 'Rival team’s move' : `Turn ${s.turn + 1} of ${s.limit}`;
      else label = myTeam === s.team ? `Your team’s turn (${tname(s.team)})` : `${tname(s.team)} team’s turn`;
      tl.textContent = label;
      tl.className = `turn-label ${coop() || s.phase === 'deal' ? '' : `t${showAll() ? s.winner : s.team}`}`;
      const L = q('.sw-left');
      if (s.phase === 'deal') L.innerHTML = '';
      else if (coop()) L.innerHTML = `<span class="sw-chip r" title="your words left">${S.left(s, 'r')}</span><span class="sw-lbl">left</span><span class="sw-chip turns" title="turns left">⏳ ${Math.max(0, s.limit - s.turn)}</span>`;
      else L.innerHTML = `<span class="sw-chip r${s.team === 0 && !showAll() ? ' on' : ''}">${S.teamLeft(s, 0)}</span><span class="sw-chip b${s.team === 1 && !showAll() ? ' on' : ''}">${S.teamLeft(s, 1)}</span><span class="sw-lbl">left</span>`;

      // role strip
      const role = q('.sw-role');
      const rt = q('.sw-roletext');
      const eye = q('.sw-eye');
      if (s.phase === 'deal') { role.className = 'sw-role'; rt.textContent = ''; eye.classList.add('hidden'); }
      else if (!me) { role.className = 'sw-role watch'; rt.textContent = '👀 You’re watching this game'; eye.classList.add('hidden'); }
      else if (amSpy()) {
        role.className = `sw-role spyrole t${me.team}`;
        rt.innerHTML = `🕵️‍♀️ <b>${coop() ? 'You’re the' : tname(me.team)} Spymaster</b> · hide your screen!`;
        eye.classList.toggle('hidden', showAll());
        eye.textContent = hideKey ? 'Show' : 'Hide';
      } else {
        role.className = `sw-role t${me.team}${coop() ? ' coop' : ''}`;
        const sp = s.spy[me.team];
        rt.innerHTML = `🔎 You’re ${coop() ? 'a guesser' : `on <b>${tname(me.team)}</b>`} · Spymaster: <b>${esc(s.players[sp]?.name || '?')}</b>`;
        eye.classList.add('hidden');
      }

      // clue banner
      const cb = q('.sw-clue');
      if (s.phase === 'guess' && s.clue) {
        const lim = s.maxGuesses >= 25 ? 'no limit' : `${s.guesses} of ${s.maxGuesses} guesses`;
        cb.className = `sw-clue on t${s.clue.team}${coop() ? ' coop' : ''}`;
        cb.innerHTML = `<span class="sw-cw">${esc(s.clue.word.toUpperCase())}</span><span class="sw-cn">${S.numText(s.clue.num)}</span><span class="sw-cg">${coop() ? '' : `${tname(s.clue.team)} · `}${lim}</span>`;
      } else if (s.phase === 'clue') {
        cb.className = `sw-clue wait t${s.team}${coop() ? ' coop' : ''}`;
        const sp = s.spy[s.team];
        cb.innerHTML = `<span class="sw-cwait">${sp === seat() ? 'Your team is waiting for <b>your</b> clue' : `Waiting for <b>${esc(s.players[sp]?.name)}</b>’s clue…`}</span>`;
      } else if (s.phase === 'rival') {
        cb.className = 'sw-clue wait t1';
        cb.innerHTML = '<span class="sw-cwait">The rival team is uncovering a word…</span>';
      } else if (showAll()) {
        cb.className = `sw-clue result ${coop() ? (s.winner === 0 ? 'good' : 'bad') : `t${s.winner}`}`;
        const why = s.reason === 'trap' ? (coop() ? 'Someone tapped the trap.' : `${tname(1 - s.winner)} tapped the trap.`)
          : s.reason === 'time' ? `${S.left(s, 'r')} word${S.left(s, 'r') === 1 ? '' : 's'} were still hidden.`
            : coop() ? `All 9 words in ${s.turn + 1} turn${s.turn ? 's' : ''}.` : `${tname(s.winner)} uncovered all its words.`;
        cb.innerHTML = `<span class="sw-cwait">${esc(why)}</span>`;
      } else {
        cb.className = 'sw-clue wait';
        cb.innerHTML = '<span class="sw-cwait">Shuffling the word cards…</span>';
      }
    }

    function renderPanel() {
      buildPanel();
      const s = state;
      const me = meP();
      if (panelKey === 'spy') {
        const mine = s.phase === 'clue' && s.spy[s.team] === seat();
        panel.querySelector('.sw-cluebox').classList.toggle('hidden', !mine);
        const wait = panel.querySelector('.sw-wait');
        wait.classList.toggle('hidden', mine);
        if (!mine) {
          if (showAll()) wait.innerHTML = 'Game over — the whole key is shown.';
          else if (s.phase === 'guess' && s.team === me.team) wait.innerHTML = '🤐 Your team is guessing.<br><small>No hints, no faces!</small>';
          else if (s.phase === 'rival') wait.innerHTML = 'The rival team is moving…';
          else wait.innerHTML = `${tname(s.team)} team’s turn.<br><small>Plan your next clue.</small>`;
        } else {
          const inp = panel.querySelector('.sw-input');
          const word = inp.value.trim();
          const why = word ? S.clueProblem(s, word) : '';
          panel.querySelectorAll('.sw-num').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === num));
          panel.querySelector('.sw-send').disabled = !!sent || !word || !!why || num == null;
          const err = panel.querySelector('.sw-err');
          err.textContent = why || (word && num == null ? 'Now pick a number.' : '');
          err.classList.toggle('bad', !!why);
          inp.disabled = !!sent;
        }
      } else if (panelKey === 'guess') {
        const can = S.canGuess(s, seat());
        const end = panel.querySelector('.sw-endbtn');
        end.disabled = !can || s.guesses < 1 || !!sent;
        end.style.visibility = can ? '' : 'hidden';
        const t = me.team;
        const spy = s.players[s.spy[t]];
        panel.querySelector('.sw-take').classList.toggle('hidden', !spy || api.isAlive(spy.pid) || showAll());
        const gc = panel.querySelector('.sw-gcount');
        if (can && s.clue) {
          const leftG = s.maxGuesses - s.guesses;
          gc.innerHTML = s.maxGuesses >= 25 ? '<b>∞</b><span>guesses</span>' : `<b>${leftG}</b><span>guess${leftG === 1 ? '' : 'es'} left</span>`;
        } else gc.innerHTML = '';
      } else {
        const w = panel.querySelector('.sw-watch');
        if (w) w.textContent = '';
      }
    }

    function renderHint() {
      const s = state;
      const me = meP();
      let t = '';
      if (s.phase === 'deal' || showAll()) t = '';
      else if (sent) t = 'Sending…';
      else if (s.phase === 'rival') t = 'After every turn the rival team uncovers one of its words.';
      else if (s.phase === 'clue') {
        const sp = s.players[s.spy[s.team]];
        if (s.spy[s.team] === seat()) t = 'Type one word, pick how many words it fits, then Give clue.';
        else if (!api.isAlive(sp.pid)) t = `${sp.name} seems to be away…`;
        else if (me && me.team === s.team) t = 'Your Spymaster is thinking of a clue…';
        else t = `${tname(s.team)}’s Spymaster is thinking…`;
      } else if (s.phase === 'guess') {
        if (S.canGuess(s, seat())) t = sel >= 0 ? 'Tap the same word again to reveal it.' : 'Tap a word to point at it, tap it again to reveal.';
        else if (amSpy() && me.team === s.team) t = 'Your team is guessing — keep a poker face!';
        else t = `${coop() ? 'The guessers are' : `${tname(s.team)} is`} guessing…`;
      }
      q('.hint').textContent = t;
    }

    function renderInfo() {
      const s = state;
      const teams = q('.sw-teams');
      if (s.phase === 'deal') { teams.innerHTML = ''; }
      else {
        const list = (t) => S.members(s, t).map((i) => `<span class="sw-mem${s.spy[t] === i ? ' spy' : ''}${api.isAlive(s.players[i].pid) ? '' : ' away'}">${s.spy[t] === i ? '🕵️‍♀️ ' : ''}${esc(nm(i))}</span>`).join('');
        teams.innerHTML = coop()
          ? `<div class="sw-tcol t0 coop"><div class="sw-th">Your team · co-op</div><div class="sw-tm">${list(0)}</div></div>`
          : [0, 1].map((t) => `<div class="sw-tcol t${t}"><div class="sw-th">${tname(t)} · ${S.teamLeft(s, t)} left</div><div class="sw-tm">${list(t)}</div></div>`).join('');
      }
      const log = q('.sw-log');
      const items = s.clues.slice().reverse().map((c) => `<li class="t${c.team}${coop() ? ' coop' : ''}">
          <span class="sw-lclue">${esc(c.word.toUpperCase())} <b>${S.numText(c.num)}</b></span>
          <span class="sw-lpicks">${c.picks.map((i) => `<i class="${KIND_CLASS[s.key[i]]}">${esc(cap(s.words[i]))}</i>`).join('') || '<em>…</em>'}</span></li>`).join('');
      const html = items || '<li class="sw-none">No clues yet.</li>';
      if (log.innerHTML !== html) log.innerHTML = html;
    }

    function maybeSheet() {
      if (!amSpy() || showAll() || sheetDone === gridKey || !gridKey) return;
      sheetDone = gridKey;
      const t = meP().team;
      q('.sw-sheettitle').textContent = coop() ? 'You’re the Spymaster' : `You’re the ${tname(t)} Spymaster`;
      const mine = coop() ? 'Your team’s words' : `${tname(t)} words (yours)`;
      q('.sw-legend').innerHTML = `<span><i class="k-${S.TEAM_KEY[t]}"></i>${mine}</span>
        <span><i class="k-${S.TEAM_KEY[1 - t]}"></i>${coop() ? 'Rival words' : `${tname(1 - t)} words`}</span>
        <span><i class="k-n"></i>Neutral</span><span><i class="k-x"></i>The trap ☠ — avoid!</span>`;
      q('.sw-sheet').classList.remove('hidden');
    }

    function render() {
      if (!state) return;
      renderTop();
      renderGrid();
      renderHint();
      renderPanel();
      renderInfo();
      maybeSheet();
    }

    return {
      update(next, prev) {
        const old = state || prev || null;
        state = next;
        if (old && (old.phase !== next.phase || old.guesses !== next.guesses || old.clues.length !== next.clues.length || old.spy.join() !== next.spy.join())) sent = 0;
        if (old && old.phase === 'clue' && next.phase === 'guess') {
          const inp = panel.querySelector('.sw-input');
          if (inp && next.clue?.by === seat()) { inp.value = ''; num = null; }
        }
        if (old && old.words.join() !== next.words.join()) { hideKey = false; pointers.clear(); }
        render();
        const me = meP();
        // reveal feedback
        if (old && next.lastPick && (old.lastPick?.i !== next.lastPick.i) && next.rev[next.lastPick.i] && old.words.join() === next.words.join()) {
          const k = next.key[next.lastPick.i];
          const by = next.lastPick.by;
          const c = grid.children[next.lastPick.i];
          if (c) { c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip'); }
          if (by >= 0) {
            const team = old.team;
            const good = k === S.TEAM_KEY[team];
            const bn = q('.banner');
            if (k === 'x') banner(bn, 'TRAP!', 'farkle', 1600);
            else if (good) banner(bn, me && me.team === team ? 'YES!' : 'CORRECT', 'bank', 900);
            else if (k === 'n') banner(bn, 'NEUTRAL', 'hot', 1000);
            else banner(bn, coop() ? 'RIVAL!' : `${S.TEAM_NAMES[1 - team].toUpperCase()}!`, 'hot', 1000);
          }
        }
        if (old && old.phase !== 'end' && next.phase === 'end') {
          setTimeout(() => {
            if (state?.phase !== 'end' && state?.phase !== 'over') return;
            const win = coop() ? state.winner === 0 : !!me && me.team === state.winner;
            banner(q('.banner'), coop() ? (win ? 'YOU WIN!' : 'GAME OVER') : `${S.TEAM_NAMES[state.winner].toUpperCase()} WINS!`, win ? 'bank' : 'hot', 2400);
          }, 1000);
        }
        if (me && old && next.phase === 'clue' && (old.phase !== 'clue' || old.team !== next.team) && next.team === me.team) {
          turnPill(q('.turn-banner'), next.spy[next.team] === seat() ? 'Your clue!' : 'Your team’s turn', 300);
        }
      },
      refresh: render,
      onEvent(m, from) {
        if (!m || m.t !== 'pt' || !Number.isInteger(m.i)) return;
        pointers.set(from, { i: m.i, k: m.k });
        if (state) renderGrid();
      },
      destroy() { ro?.disconnect(); el.remove(); },
    };
  },
};
