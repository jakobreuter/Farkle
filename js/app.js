import {
  SCORING_RULES, newGame, applyAction, diceToRoll, canBank, selectionScore, freeIndices,
} from './farkle.js';
import { cryptoDice, randomHex, sha256Hex, deriveDice } from './rng.js';
import { createHost, createGuest } from './net.js';

const $ = (s) => document.querySelector(s);
const ROLL_MS = 1100;

// ---------- app state ----------
let mode = null; // 'local' | 'host' | 'guest'
let me = 0; // my player index (online)
let state = null;
let net = null;
let room = null;
let myName = '';
let connected = false;

let pendingRoll = null; // host: {id, hostSeed, commit, n, timer}
const commits = {}; // guest: rollId -> commitment hash
const mySeeds = {}; // guest: rollId -> my seed
let fairText = '';
let fairBad = false;
let animatingUntil = 0;
let passTimer = null;
let uiTimer = null;

// ---------- persistence ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ---------- rules text ----------
function rulesHTML(full) {
  const rows = SCORING_RULES.map(([a, b]) => `<tr><td>${a}</td><td>${typeof b === 'number' ? b.toLocaleString() : b}</td></tr>`).join('');
  const how = `
    <ol>
      <li>Roll six dice. Tap the scoring dice you want to keep (you must keep at least one).</li>
      <li><b>Roll</b> the rest to try for more points, or <b>Bank</b> to add your turn total to your score.</li>
      <li>If a roll has no scoring dice, that’s a <b>Farkle</b> — you lose everything from this turn.</li>
      <li>Score with all six dice? <b>Hot dice</b> — roll all six again and keep building.</li>
      <li>Once someone reaches the target, everyone else gets one final turn. Highest score wins.</li>
    </ol>`;
  const fair = `
    <p><b>Pure chance, no tricks.</b> Every die is a uniform 1–6. There is no weighting, no streak
    or “catch-up” logic, and the code treats both players identically.</p>
    <p>Online, each roll is created <i>together</i> by both players with a commit–reveal scheme:
    the host locks in a secret random number (sending only its SHA-256 fingerprint), the guest adds
    their own random number, then the host reveals theirs and the dice come from mixing both.
    The guest’s browser re-checks every roll automatically. Neither player can steer the dice —
    even by editing the code.</p>`;
  return (full ? how : '') + `<table>${rows}</table>` + (full ? fair : '');
}
$('#rules-body').innerHTML = rulesHTML(true);
$('#rules-body-2').innerHTML = rulesHTML(false);

// ---------- dice DOM ----------
const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };

const dieEls = [];
const spins = [];
for (let i = 0; i < 6; i++) {
  const b = document.createElement('div');
  b.className = 'die no-anim';
  b.setAttribute('role', 'button');
  b.dataset.i = i;
  b.setAttribute('aria-label', 'die');
  const faces = [1, 2, 3, 4, 5, 6].map((f) => {
    const pips = Array.from({ length: 9 }, (_, k) => `<span class="pip${PIPS[f].includes(k) ? ' on' : ''}"></span>`).join('');
    return `<div class="face f${f}">${pips}</div>`;
  }).join('');
  b.innerHTML = `<div class="cube-wrap"><div class="tumble"><div class="cube">${faces}</div></div></div>`;
  b.addEventListener('click', () => onDieClick(i));
  dieEls.push(b);
  spins.push({ x: 0, y: 0, z: 0, value: 1 });
  setDieFace(i, (i % 6) + 1, false);
}

function setDieFace(i, value, spin) {
  const sp = spins[i];
  const [bx, by] = FACE_ROT[value];
  if (spin) {
    sp.x += 360 * (1 + Math.floor(Math.random() * 2));
    sp.y += 360 * (1 + Math.floor(Math.random() * 2));
    sp.z = Math.round(Math.random() * 40 - 20);
  }
  sp.value = value;
  const cube = dieEls[i].querySelector('.cube');
  // Random-looking spin is cosmetic only; the face shown is always exactly `value`.
  cube.style.transform = `rotateZ(${sp.z}deg) rotateX(${bx + sp.x}deg) rotateY(${by + sp.y}deg)`;
  dieEls[i].setAttribute('aria-label', `die showing ${value}`);
}

function animateRoll(indices) {
  animatingUntil = Date.now() + ROLL_MS;
  for (const i of indices) {
    const el = dieEls[i];
    el.classList.remove('no-anim', 'shaking', 'rolling');
    el.style.setProperty('--dx', `${Math.round(Math.random() * 160 - 80)}px`);
    void el.offsetWidth; // restart CSS animation
    el.classList.add('rolling');
    setDieFace(i, state.dice[i].value, true);
  }
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => {
    for (const i of indices) dieEls[i].classList.remove('rolling');
    render();
  }, ROLL_MS + 20);
}

function shakeFree() {
  if (!state) return;
  const free = freeIndices(state);
  const sel = state.phase === 'select' ? state.selected : [];
  const left = free.filter((i) => !sel.includes(i));
  const toShake = left.length ? left : free.length ? free : [0, 1, 2, 3, 4, 5];
  for (const i of toShake) dieEls[i].classList.add('shaking');
}

// ---------- helpers ----------
function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), ms);
}

function setStatus(text, ok) {
  const s = $('#status');
  if (!text) return s.classList.add('hidden');
  s.textContent = text;
  s.className = `status ${ok ? 'ok' : 'warn'}`;
}

function show(screen) {
  $('#lobby').classList.toggle('hidden', screen !== 'lobby');
  $('#game').classList.toggle('hidden', screen !== 'game');
}

function myTurn() {
  if (!state || state.phase === 'over') return false;
  if (mode === 'local') return true;
  return state.current === me;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- rendering ----------
let lastBannerKey = '';

function render() {
  if (!state) return;
  const animating = Date.now() < animatingUntil;

  // scoreboard
  $('#scoreboard').innerHTML = state.players.map((p, i) => {
    const tag = mode === 'local' ? '' : i === me ? 'you' : 'friend';
    const pct = Math.min(100, (p.score / state.target) * 100);
    return `<div class="player ${i === state.current && state.phase !== 'over' ? 'active' : ''}">
      <div class="pname"><span>${esc(p.name)}</span><span class="tag">${tag}</span></div>
      <div class="pscore">${p.score.toLocaleString()}</div>
      <div class="bar"><span style="width:${pct}%"></span></div>
    </div>`;
  }).join('');

  const cur = state.players[state.current];
  const final = state.finalRound ? ' — final round!' : '';
  $('#turn-label').textContent = state.phase === 'over'
    ? 'Game over'
    : (mode === 'local' ? `${cur.name}’s turn` : myTurn() ? 'Your turn' : `${cur.name}’s turn`) + final;
  $('#turn-points').textContent = state.turnPoints.toLocaleString();

  // dice placement
  const tray = $('#tray');
  const kept = $('#kept');
  state.dice.forEach((d, i) => {
    const el = dieEls[i];
    const parent = d.kept ? kept : tray;
    if (el.parentElement !== parent) parent.appendChild(el);
    if (!el.classList.contains('rolling') && spins[i].value !== d.value) setDieFace(i, d.value, false);
    const selectable = !animating && myTurn() && state.phase === 'select' && !d.kept && !pendingRoll;
    el.classList.toggle('clickable', selectable);
    el.classList.toggle('selected', state.selected.includes(i));
    el.classList.toggle('dim', state.phase === 'start' && !el.classList.contains('shaking'));
    el.setAttribute('aria-disabled', String(!selectable));
  });
  // keep DOM order stable by index
  for (const parent of [tray, kept]) {
    [...parent.children].sort((a, b) => a.dataset.i - b.dataset.i).forEach((c) => parent.appendChild(c));
  }

  // selection score
  const selEl = $('#sel-points');
  if (state.phase === 'select' && state.selected.length && !animating) {
    const pts = selectionScore(state);
    selEl.textContent = pts ? `+${pts} selected` : 'selection doesn’t score';
    selEl.classList.toggle('bad', !pts);
  } else {
    selEl.textContent = '';
  }

  // controls
  const rollBtn = $('#roll-btn');
  const bankBtn = $('#bank-btn');
  const n = diceToRoll(state);
  const busy = animating || !!pendingRoll || rollRequested;
  rollBtn.disabled = !myTurn() || !n || busy;
  bankBtn.disabled = !myTurn() || !canBank(state) || busy;
  rollBtn.textContent = state.phase === 'start' ? 'Roll 6 dice'
    : n ? `Roll ${n} ${n === 1 ? 'die' : 'dice'}` : 'Roll';
  const bankPts = state.turnPoints + (canBank(state) ? selectionScore(state) : 0);
  bankBtn.textContent = canBank(state) ? `Bank ${bankPts.toLocaleString()}` : 'Bank';

  // hint
  let hint = '';
  if (state.phase === 'over') hint = '';
  else if (!myTurn()) hint = state.phase === 'farkle' ? '' : `Waiting for ${cur.name}…`;
  else if (animating) hint = '';
  else if (state.phase === 'start') hint = 'Roll to start your turn.';
  else if (state.phase === 'select') {
    hint = !state.selected.length ? 'Tap the scoring dice you want to keep.'
      : selectionScore(state) ? 'Roll again or bank your points.' : 'Every kept die must score.';
  }
  if (mode !== 'local' && !connected && state.phase !== 'over') hint = 'Connection lost — waiting to reconnect…';
  $('#hint').textContent = hint;

  const fair = $('#fair');
  fair.textContent = animating ? '' : fairText;
  fair.classList.toggle('bad', fairBad);

  // banners (shown after the dice land)
  if (!animating) {
    const key = `${state.rollNo}:${state.event}:${state.players.map((p) => p.score).join()}`;
    if (state.event && key !== lastBannerKey) {
      lastBannerKey = key;
      const b = $('#banner');
      const txt = { farkle: 'FARKLE!', hot: 'HOT DICE!', bank: 'BANKED!' }[state.event];
      if (txt) {
        b.textContent = txt;
        b.className = `banner ${state.event}`;
        clearTimeout(render.bt);
        render.bt = setTimeout(() => b.classList.add('hidden'), 1500);
      }
    }
  }

  // log
  $('#log').innerHTML = state.log.slice().reverse().map((l) => `<li>${esc(l)}</li>`).join('');

  // game over
  const go = $('#gameover');
  if (state.phase === 'over' && !animating) {
    go.classList.remove('hidden');
    const w = state.winners;
    const youWon = mode !== 'local' && w.includes(me);
    $('#go-title').textContent = w.length > 1 ? 'It’s a tie! 🤝'
      : mode === 'local' ? `🏆 ${state.players[w[0]].name} wins!` : youWon ? '🏆 You win!' : `${state.players[w[0]].name} wins!`;
    $('#go-scores').innerHTML = state.players
      .map((p, i) => `<div class="${w.includes(i) ? 'w' : ''}">${esc(p.name)}: ${p.score.toLocaleString()}</div>`).join('');
  } else {
    go.classList.add('hidden');
  }
}

// ---------- state updates ----------
let rollRequested = false;

function receiveState(next) {
  const prev = state;
  state = next;
  rollRequested = false;
  for (const el of dieEls) el.classList.remove('shaking');
  if (prev && state.lastRoll && state.rollNo === prev.rollNo + 1) {
    render(); // move dice to their trays first, then tumble the rolled ones
    animateRoll(state.lastRoll.indices);
  }
  render();
}

// host + local: commit a new authoritative state
function commitState(next) {
  receiveState(next);
  if (mode === 'host') {
    store.set(`farkle-host-${room}`, { state, myName });
    net.send({ t: 'state', state });
  }
  clearTimeout(passTimer);
  if (state.phase === 'farkle') {
    const rn = state.rollNo;
    passTimer = setTimeout(() => {
      if (state.phase === 'farkle' && state.rollNo === rn) commitState(applyAction(state, { type: 'pass' }));
    }, ROLL_MS + 1900);
  }
}

function tryApply(action) {
  try {
    commitState(applyAction(state, action));
  } catch (e) {
    console.warn(e.message);
  }
}

// ---------- local play ----------
function localRoll() {
  const n = diceToRoll(state);
  if (!n) return;
  fairText = '🎲 Rolled with your browser’s cryptographic random number generator.';
  fairBad = false;
  tryApply({ type: 'roll', values: cryptoDice(n) });
}

// ---------- host logic ----------
async function hostRoll(actor) {
  if (pendingRoll || !state || actor !== state.current) return;
  const n = diceToRoll(state);
  if (!n) return;
  if (!net.isConnected()) {
    rollRequested = false;
    render();
    return toast('Your friend is disconnected — waiting for them to reconnect.');
  }
  const id = randomHex(8);
  const hostSeed = randomHex(32);
  const commit = await sha256Hex(hostSeed);
  pendingRoll = { id, hostSeed, commit, n };
  pendingRoll.timer = setTimeout(() => {
    pendingRoll = null;
    rollRequested = false;
    for (const el of dieEls) el.classList.remove('shaking');
    render();
    toast('Roll timed out — try again.');
  }, 10000);
  shakeFree();
  render();
  net.send({ t: 'commit', id, commit });
}

async function hostOnSeed(msg) {
  const p = pendingRoll;
  if (!p || msg.id !== p.id || typeof msg.seed !== 'string' || !/^[0-9a-f]{64}$/.test(msg.seed)) return;
  pendingRoll = null;
  clearTimeout(p.timer);
  const values = await deriveDice(p.hostSeed, msg.seed, p.id, p.n);
  fairText = '🔒 Fair roll — mixed from both players’ secret random numbers.';
  fairBad = false;
  tryApply({ type: 'roll', values, proof: { id: p.id, commit: p.commit, hostSeed: p.hostSeed, guestSeed: msg.seed } });
}

function hostOnData(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'hello') {
    const name = String(msg.name || 'Friend').slice(0, 16);
    $('#invite').classList.add('hidden');
    if (!state) {
      const target = Number($('#target').value) || 10000;
      commitState(newGame([myName, name], target, Math.random() < 0.5 ? 0 : 1));
    } else {
      state = { ...state, players: state.players.map((p, i) => (i === 1 ? { ...p, name } : p)) };
      commitState(state);
    }
    if (pendingRoll) net.send({ t: 'commit', id: pendingRoll.id, commit: pendingRoll.commit });
    if (Date.now() - (hostOnData.lastHello || 0) > 15000) toast(`${name} joined!`);
    hostOnData.lastHello = Date.now();
  } else if (msg.t === 'seed') {
    hostOnSeed(msg);
  } else if (msg.t === 'action' && state) {
    const a = msg.a || {};
    if (a.type === 'rematch') return state.phase === 'over' && rematch();
    if (state.current !== 1 || pendingRoll) return;
    if (a.type === 'roll') return hostRoll(1);
    if (a.type === 'toggle') return tryApply({ type: 'toggle', index: Number(a.index) });
    if (a.type === 'bank') return tryApply({ type: 'bank' });
  }
}

// ---------- guest logic ----------
async function guestOnData(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'commit') {
    commits[msg.id] = msg.commit;
    const seed = randomHex(32);
    mySeeds[msg.id] = seed;
    shakeFree();
    net.send({ t: 'seed', id: msg.id, seed });
  } else if (msg.t === 'state') {
    const next = msg.state;
    const isNewRoll = !state || next.rollNo !== state.rollNo;
    if (isNewRoll && next.lastRoll) {
      const res = await verifyRoll(next);
      fairBad = res === 'bad';
      fairText = {
        ok: '🔒 Verified fair roll — your browser checked it, both players’ randomness was mixed in.',
        bad: '⚠️ This roll FAILED verification — the dice may have been tampered with.',
        unknown: 'Roll from before you (re)joined — not re-verified.',
      }[res];
    }
    $('#invite').classList.add('hidden');
    receiveState(next);
  }
}

async function verifyRoll(s) {
  const lr = s.lastRoll;
  const p = lr?.proof;
  if (!p || !commits[p.id]) return 'unknown';
  if (commits[p.id] !== p.commit || mySeeds[p.id] !== p.guestSeed) return 'bad';
  if ((await sha256Hex(p.hostSeed)) !== p.commit) return 'bad';
  const values = await deriveDice(p.hostSeed, p.guestSeed, p.id, lr.values.length);
  if (values.join() !== lr.values.join()) return 'bad';
  if (!lr.indices.every((di, k) => s.dice[di].value === lr.values[k])) return 'bad';
  return 'ok';
}

// ---------- user input ----------
function onDieClick(i) {
  if (!state || !myTurn() || state.phase !== 'select' || Date.now() < animatingUntil || pendingRoll) return;
  if (mode === 'guest') {
    // optimistic toggle for snappy feel; host's state will confirm
    try { state = applyAction(state, { type: 'toggle', index: i }); render(); } catch { return; }
    net.send({ t: 'action', a: { type: 'toggle', index: i } });
  } else {
    tryApply({ type: 'toggle', index: i });
  }
}

$('#roll-btn').addEventListener('click', () => {
  if (!myTurn() || !diceToRoll(state) || rollRequested) return;
  if (mode === 'local') return localRoll();
  rollRequested = true;
  if (mode === 'host') return hostRoll(me);
  shakeFree();
  render();
  net.send({ t: 'action', a: { type: 'roll' } });
  setTimeout(() => { if (rollRequested) { rollRequested = false; for (const el of dieEls) el.classList.remove('shaking'); render(); } }, 10000);
});

$('#bank-btn').addEventListener('click', () => {
  if (!myTurn() || !canBank(state)) return;
  if (mode === 'guest') return net.send({ t: 'action', a: { type: 'bank' } });
  tryApply({ type: 'bank' });
});

function rematch() {
  const names = state.players.map((p) => p.name);
  const first = (state.firstPlayer + 1) % names.length;
  fairText = '';
  commitState(newGame(names, state.target, first));
}

$('#rematch-btn').addEventListener('click', () => {
  if (mode === 'guest') {
    net.send({ t: 'action', a: { type: 'rematch' } });
    toast('Asked for a rematch…');
  } else rematch();
});

function leave() {
  if (mode === 'host' && room) store.del(`farkle-host-${room}`);
  if (mode === 'guest' && room) try { sessionStorage.removeItem(`farkle-joined-${room}`); } catch { /* ignore */ }
  location.href = location.pathname;
}
$('#leave-btn').addEventListener('click', () => { if (confirm('Leave this game?')) leave(); });
$('#go-leave').addEventListener('click', leave);
$('#invite-cancel').addEventListener('click', leave);

document.addEventListener('keydown', (e) => {
  if (!state || e.target.tagName === 'INPUT') return;
  if (e.key === ' ' || e.key === 'r') { e.preventDefault(); $('#roll-btn').click(); }
  if (e.key === 'b') $('#bank-btn').click();
  if (/^[1-6]$/.test(e.key)) {
    const free = state.dice.map((d, i) => (d.kept ? -1 : i)).filter((i) => i >= 0);
    const idx = free[Number(e.key) - 1];
    if (idx !== undefined) onDieClick(idx);
  }
});

// ---------- lobby ----------
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  const b = new Uint8Array(5);
  crypto.getRandomValues(b);
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

function readName() {
  const n = $('#name').value.trim().slice(0, 16);
  if (!n) {
    $('#name').focus();
    toast('Enter your name first.');
    return null;
  }
  store.set('farkle-name', n);
  return n;
}

// carry testing overrides (?transport=, ?broker=) along
function keepTestParams(q) {
  const cur = new URLSearchParams(location.search);
  for (const k of ['transport', 'broker']) if (cur.get(k)) q.set(k, cur.get(k));
}

function setUrl(params) {
  const q = new URLSearchParams(params);
  keepTestParams(q);
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

function shareLink() {
  const q = new URLSearchParams({ room, from: myName });
  keepTestParams(q);
  return `${location.origin}${location.pathname}?${q}`;
}

function startHost(code, restored) {
  mode = 'host';
  me = 0;
  room = code;
  setUrl({ room: code, host: '1' });
  show('game');
  if (restored) {
    state = restored;
    render();
  } else {
    $('#invite').classList.remove('hidden');
    $('#invite-link').value = shareLink();
    $('#invite-code').textContent = code;
    $('#scoreboard').innerHTML = '';
  }
  setStatus('Opening room…', false);
  net = createHost(code, {
    onReady: () => {
      if (!connected) setStatus(state ? 'Waiting for your friend…' : 'Room open', !state);
      if (state) net.send({ t: 'state', state }); // resync after (re)connecting
    },
    onConnect: () => { connected = true; setStatus('Friend connected', true); render(); },
    onDisconnect: () => { connected = false; setStatus('Friend disconnected', false); render(); },
    onData: hostOnData,
    onError: (t) => setStatus(t, false),
  });
  if (restored) commitState(state); // re-arm timers (e.g. pending farkle hand-off)
}

function startGuest(code) {
  try { sessionStorage.setItem(`farkle-joined-${code}`, myName); } catch { /* ignore */ }
  document.body.classList.remove('invited');
  mode = 'guest';
  me = 1;
  room = code;
  setUrl({ room: code });
  show('game');
  $('#turn-label').textContent = 'Connecting…';
  setStatus('Connecting…', false);
  const hello = () => net.send({ t: 'hello', name: myName });
  // Keep knocking until the host answers with the game state.
  clearInterval(startGuest.knock);
  startGuest.knock = setInterval(() => { if (!state) hello(); }, 2000);
  net = createGuest(code, {
    onReady: () => {
      if (!connected) setStatus('Looking for the game…', false);
      hello();
    },
    onConnect: () => {
      connected = true;
      setStatus('Connected', true);
      hello();
      render();
    },
    onDisconnect: () => { connected = false; setStatus('Reconnecting…', false); render(); },
    onData: guestOnData,
    onError: (t) => setStatus(t, false),
  });
}

$('#create-btn').addEventListener('click', () => {
  const n = readName();
  if (!n) return;
  myName = n;
  startHost(newCode());
});

$('#join-btn').addEventListener('click', () => {
  const n = readName();
  if (!n) return;
  const code = $('#join-code').value.trim().toUpperCase();
  if (code.length !== 5) return toast('Room codes are 5 characters.');
  myName = n;
  startGuest(code);
});
$('#join-code').addEventListener('keydown', (e) => e.key === 'Enter' && $('#join-btn').click());
$('#name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.body.classList.contains('invited')) $('#join-btn').click();
});

$('#local-btn').addEventListener('click', () => {
  const n = readName();
  if (!n) return;
  const p2 = $('#local-p2').value.trim().slice(0, 16) || 'Player 2';
  mode = 'local';
  myName = n;
  show('game');
  commitState(newGame([n, p2], Number($('#target').value) || 10000, 0));
});

const canShare = !!navigator.share && matchMedia('(pointer: coarse)').matches;
if (canShare) $('#copy-btn').textContent = 'Share link';
$('#copy-btn').addEventListener('click', async () => {
  const link = $('#invite-link').value;
  if (canShare) {
    try {
      await navigator.share({ title: 'Farkle', text: `${myName} invited you to play Farkle 🎲`, url: link });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    toast('Link copied — paste it into a message to your friend.');
  } catch {
    const inp = $('#invite-link');
    inp.focus();
    inp.setSelectionRange(0, inp.value.length);
    toast('Press and hold to copy the link.');
  }
});
$('#invite-link').addEventListener('focus', (e) => e.target.setSelectionRange(0, e.target.value.length));
$('#own-game').addEventListener('click', () => {
  document.body.classList.remove('invited');
  setUrl({});
  $('#create-card').scrollIntoView({ behavior: 'smooth' });
});

// ---------- boot ----------
(function boot() {
  $('#name').value = store.get('farkle-name') || '';
  const q = new URLSearchParams(location.search);
  const code = (q.get('room') || '').toUpperCase();
  if (code && q.get('host') === '1') {
    const saved = store.get(`farkle-host-${code}`);
    if (saved?.myName) {
      myName = saved.myName;
      return startHost(code, saved.state);
    }
  }
  if (code) {
    let rejoinName = null;
    try { rejoinName = sessionStorage.getItem(`farkle-joined-${code}`); } catch { /* ignore */ }
    if (rejoinName) {
      myName = rejoinName;
      return startGuest(code);
    }
    const from = (q.get('from') || '').slice(0, 16);
    document.body.classList.add('invited');
    $('#join-code').value = code;
    $('#join-title').textContent = from ? `${from} invited you to play!` : 'You’re invited to play!';
    $('#join-sub').textContent = 'Enter your name above, then tap Join game.';
    if (!$('#name').value) $('#name').focus();
  }
})();
