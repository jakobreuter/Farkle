import { createSession } from './session.js';
import { GAMES, GAME_LIST } from './games/index.js';
import { $, esc } from './ui.js';

// ---------- no zooming on phones ----------
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// ---------- storage ----------
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

// A player id per browser tab (survives reloads of that tab).
let me = ss.get('gn-pid');
if (!me) {
  me = [...crypto.getRandomValues(new Uint8Array(9))].map((x) => (x % 36).toString(36)).join('');
  ss.set('gn-pid', me);
}

let session = null;
let room = null;
let myName = '';
let view = null;
let mounted = null; // {id, no}
let lastGameState = null;
let closedOverlayFor = null;

// ---------- helpers ----------
function toast(msg, ms = 2600) {
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
  for (const id of ['home', 'lobby', 'play']) $(`#${id}`).classList.toggle('hidden', id !== screen);
}

function keepTestParams(q) {
  const cur = new URLSearchParams(location.search);
  for (const k of ['transport', 'broker']) if (cur.get(k)) q.set(k, cur.get(k));
}
function setUrl(params) {
  const q = new URLSearchParams(params);
  keepTestParams(q);
  const qs = q.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}
function shareLink() {
  const q = new URLSearchParams({ room, from: myName });
  keepTestParams(q);
  return `${location.origin}${location.pathname}?${q}`;
}

const sess = () => session?.state;
const mySeat = () => sess()?.game?.state.players.findIndex((p) => p.pid === me) ?? -1;

// ---------- rendering ----------
function renderStatus() {
  const s = sess();
  if (!session) return;
  if (!s) return setStatus('Looking for the session…', false);
  const online = s.members.filter((m) => session.isAlive(m.pid)).length;
  setStatus(`${session.isHost() ? 'Host · ' : ''}${online} online`, true);
}

function renderLobby() {
  const s = sess();
  $('#room-code').textContent = room;
  const host = session.isHost();
  $('#members').innerHTML = s.members.map((m) => {
    const alive = session.isAlive(m.pid);
    const tags = [m.pid === s.host ? '👑 host' : '', m.pid === me ? 'you' : '', alive ? '' : 'away'].filter(Boolean).join(' · ');
    const kick = host && !alive && m.pid !== me ? `<button class="btn ghost small kick" data-kick="${m.pid}">Remove</button>` : '';
    return `<li class="${alive ? '' : 'away'}"><span class="dot"></span><span class="who">${esc(m.name)}</span><span class="tag">${tags}</span>${kick}</li>`;
  }).join('');

  const sel = GAMES[s.lobby.game] || GAME_LIST[0];
  $('#pick-title').textContent = host ? 'Pick a game' : `${session.nameOf(s.host)} is picking a game`;
  $('#game-grid').innerHTML = GAME_LIST.map((g) => `<button class="game-card${g.id === sel.id ? ' on' : ''}" data-game="${g.id}" ${host ? '' : 'disabled'}>
      <span class="gi">${g.emoji}</span><span class="gn">${esc(g.name)}</span><span class="gb">${esc(g.blurb)}</span>
      <span class="gp">${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`} players</span></button>`).join('');

  $('#opts').innerHTML = (sel.options || []).map((o) => {
    const val = s.lobby.opts[`${sel.id}.${o.key}`] ?? o.default;
    if (!host) {
      const label = o.choices.find(([v]) => String(v) === String(val))?.[1] ?? val;
      return `<label>${esc(o.label)} <span class="ro">${esc(label)}</span></label>`;
    }
    return `<label>${esc(o.label)} <select data-opt="${o.key}">${o.choices.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  }).join('');

  const online = s.members.filter((m) => session.isAlive(m.pid)).length;
  const start = $('#start-btn');
  start.classList.toggle('hidden', !host);
  start.textContent = `Start ${sel.name}`;
  let note = '';
  if (!host) note = `Waiting for ${session.nameOf(s.host)} to start a game…`;
  else if (online < sel.minPlayers) note = `${sel.name} needs at least ${sel.minPlayers} players — invite a friend!`;
  else if (online > sel.maxPlayers) note = `${sel.name} allows up to ${sel.maxPlayers} players.`;
  else if (online === 1) note = 'You can play solo, or invite friends first.';
  start.disabled = !host || online < sel.minPlayers || online > sel.maxPlayers;
  $('#start-note').textContent = note;
}

function renderPlay() {
  const s = sess();
  const g = s.game;
  const plugin = GAMES[g.id];
  if (!mounted || mounted.no !== g.no) {
    view?.destroy();
    $('#game-root').innerHTML = '';
    lastGameState = null;
    view = plugin.createView($('#game-root'), {
      me,
      mySeat,
      act: (a) => session.act(a),
      gameEvent: (m, light) => session.gameEvent(m, light),
      isAlive: (pid) => session.isAlive(pid),
      hostNow: () => session.hostNow(),
      toast,
    });
    mounted = { id: g.id, no: g.no };
    $('#play-name').textContent = `${plugin.emoji} ${plugin.name}`;
    $('#rules-body').innerHTML = plugin.rulesHTML ? plugin.rulesHTML() : '';
    $('#fair-warn').classList.add('hidden');
  }
  $('#to-lobby').classList.toggle('hidden', !session.isHost());
  if (g.state !== lastGameState) {
    view.update(g.state, lastGameState);
    lastGameState = g.state;
  } else {
    view.refresh?.();
  }
  const log = g.state.log || [];
  $('#log').innerHTML = log.slice().reverse().map((l) => `<li>${esc(l)}</li>`).join('');

  // game over
  const res = plugin.results(g.state);
  const go = $('#gameover');
  if (res.over && closedOverlayFor !== g.no) {
    const showIt = () => {
      if (sess()?.game?.no !== g.no) return;
      const wins = res.rows.filter((r) => r.win);
      const myWin = res.rows.some((r, i) => r.win && g.state.players[i]?.pid === me);
      $('#go-title').textContent = wins.length > 1 ? 'It’s a tie! 🤝' : myWin ? '🏆 You win!' : `🏆 ${wins[0]?.name} wins!`;
      $('#go-scores').innerHTML = res.rows.slice().sort((a, b) => b.score - a.score)
        .map((r) => `<div class="${r.win ? 'w' : ''}">${esc(r.name)}: ${r.score.toLocaleString()}</div>`).join('');
      const host = session.isHost();
      $('#again-btn').classList.toggle('hidden', !host);
      $('#go-lobby').classList.toggle('hidden', !host);
      $('#go-wait').classList.toggle('hidden', host);
      go.classList.remove('hidden');
    };
    if (go.classList.contains('hidden')) {
      clearTimeout(renderPlay.goTimer);
      renderPlay.goTimer = setTimeout(showIt, 1700); // let the last roll/flip finish first
    } else {
      showIt(); // already open: refresh buttons (e.g. host changed)
    }
  } else {
    clearTimeout(renderPlay.goTimer);
    go.classList.add('hidden');
  }
}

function render() {
  const s = sess();
  renderStatus();
  if (!s) return;
  if (s.game) {
    show('play');
    renderPlay();
  } else {
    if (view) { view.destroy(); view = null; mounted = null; lastGameState = null; }
    clearTimeout(renderPlay.goTimer);
    $('#gameover').classList.add('hidden');
    show('lobby');
    renderLobby();
  }
}

// ---------- session ----------
function startSession(code, create) {
  room = code;
  setUrl({ room: code });
  ss.set(`gn-joined-${code}`, myName);
  document.body.classList.remove('invited');
  show('lobby');
  $('#room-code').textContent = code;
  $('#members').innerHTML = '';
  $('#game-grid').innerHTML = '';
  $('#pick-title').textContent = 'Joining…';
  $('#start-note').textContent = 'Connecting to the session…';
  $('#start-btn').classList.add('hidden');
  setStatus('Connecting…', false);
  session = createSession({
    code,
    me,
    name: myName,
    create,
    ui: {
      onSession: () => render(),
      onPresence: () => {
        renderStatus();
        if (sess() && !sess().game) renderLobby();
        else view?.refresh?.();
      },
      onToast: toast,
      onConnection: () => renderStatus(),
      onError: (t) => setStatus(t, false),
      onGameEvent: (m, from) => view?.onEvent?.(m, from),
      gameSync: () => view?.syncItems?.() || null,
      onGameSync: (items) => view?.onSync?.(items),
      onFairnessProblem: () => $('#fair-warn').classList.remove('hidden'),
    },
  });
  if (sess()) render();
  setInterval(renderStatus, 3000);
}

// ---------- lobby events ----------
$('#game-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-game]');
  if (b && session?.isHost()) session.selectGame(b.dataset.game);
});
$('#opts').addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-opt]');
  if (sel && session?.isHost()) session.setOption(sel.dataset.opt, sel.value);
});
$('#members').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kick]');
  if (b && session?.isHost()) session.kick(b.dataset.kick);
});
$('#start-btn').addEventListener('click', () => session?.startGame());

const canShare = !!navigator.share && matchMedia('(pointer: coarse)').matches;
if (canShare) $('#share-btn').textContent = 'Share invite link';
$('#share-btn').addEventListener('click', async () => {
  const link = shareLink();
  if (canShare) {
    try {
      await navigator.share({ title: 'Game Night', text: `${myName} invited you to play 🎲`, url: link });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    toast('Invite link copied — paste it into a message.');
  } catch {
    prompt('Copy this link:', link);
  }
});

function leave() {
  if (!confirm('Leave this session?')) return;
  session?.leave();
  ss.del(`gn-joined-${room}`);
  ss.del(`sess-${room}`);
  const q = new URLSearchParams();
  keepTestParams(q);
  const qs = q.toString();
  setTimeout(() => { location.href = location.pathname + (qs ? `?${qs}` : ''); }, 200);
}
$('#leave-btn').addEventListener('click', leave);
$('#leave-btn-2').addEventListener('click', leave);

$('#to-lobby').addEventListener('click', () => {
  const g = sess()?.game;
  if (!g || !session.isHost()) return;
  const over = GAMES[g.id].results(g.state).over;
  if (over || confirm('End this game for everyone and go back to the lobby?')) session.endGame();
});
$('#again-btn').addEventListener('click', () => {
  const g = sess()?.game;
  if (!g || !session.isHost()) return;
  session.selectGame(g.id);
  session.startGame();
});
$('#go-lobby').addEventListener('click', () => session?.isHost() && session.endGame());
$('#go-close').addEventListener('click', () => {
  closedOverlayFor = sess()?.game?.no;
  $('#gameover').classList.add('hidden');
});

// ---------- home ----------
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  return [...crypto.getRandomValues(new Uint8Array(5))].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

function readName() {
  const n = $('#name').value.trim().slice(0, 16);
  if (!n) {
    $('#name').focus();
    toast('Enter your name first.');
    return null;
  }
  ls.set('farkle-name', n);
  return n;
}

$('#create-btn').addEventListener('click', () => {
  const n = readName();
  if (!n) return;
  myName = n;
  startSession(newCode(), true);
});
$('#join-btn').addEventListener('click', () => {
  const n = readName();
  if (!n) return;
  const code = $('#join-code').value.trim().toUpperCase();
  if (code.length !== 5) return toast('Room codes are 5 characters.');
  myName = n;
  startSession(code, false);
});
$('#join-code').addEventListener('keydown', (e) => e.key === 'Enter' && $('#join-btn').click());
$('#name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.body.classList.contains('invited')) $('#join-btn').click();
});
$('#own-game').addEventListener('click', () => {
  document.body.classList.remove('invited');
  setUrl({});
  $('#create-card').scrollIntoView({ behavior: 'smooth' });
});

// ---------- boot ----------
(function boot() {
  $('#name').value = ls.get('farkle-name') || '';
  const q = new URLSearchParams(location.search);
  const code = (q.get('room') || '').toUpperCase();
  if (!code) return show('home');
  const rejoin = ss.get(`gn-joined-${code}`);
  if (rejoin) {
    myName = rejoin;
    return startSession(code, false);
  }
  show('home');
  const from = (q.get('from') || '').slice(0, 16);
  document.body.classList.add('invited');
  $('#join-code').value = code;
  $('#join-title').textContent = from ? `${from} invited you to play!` : 'You’re invited to play!';
  $('#join-sub').textContent = 'Enter your name above, then tap Join.';
  if (!$('#name').value) $('#name').focus();
})();
