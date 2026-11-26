import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/engines/snap.js';
import snap from '../js/games/snap.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));
const zeros = (ranges) => ranges.map(() => 0);

test('deck: 57 cards × 8 distinct symbols, every pair shares exactly one', () => {
  assert.equal(S.CARDS.length, 57);
  assert.equal(S.SYMBOLS.length, 57);
  assert.equal(new Set(S.SYMBOLS.map((x) => x[0])).size, 57, 'emoji distinct');
  assert.equal(new Set(S.SYMBOLS.map((x) => x[1])).size, 57, 'names distinct');
  const uses = new Array(57).fill(0);
  for (const c of S.CARDS) {
    assert.equal(c.length, 8);
    assert.equal(new Set(c).size, 8);
    for (const x of c) { assert.ok(x >= 0 && x < 57); uses[x]++; }
  }
  assert.ok(uses.every((u) => u === 8), 'each symbol on 8 cards');
  for (let a = 0; a < 57; a++) {
    for (let b = a + 1; b < 57; b++) {
      const shared = S.CARDS[a].filter((x) => S.CARDS[b].includes(x));
      assert.equal(shared.length, 1, `cards ${a} & ${b}`);
      assert.equal(S.common(a, b), shared[0]);
    }
  }
});

test('layout is deterministic and symbols never sit on top of each other', () => {
  for (let id = 0; id < 57; id++) {
    const L = S.layout(id);
    assert.deepEqual(L, S.layout(id));
    assert.deepEqual(L.map((x) => x.sym).sort((a, b) => a - b), S.CARDS[id].slice().sort((a, b) => a - b));
    const d = 172; // smallest card size in px; tap targets are 42px (48 in the middle)
    for (let i = 0; i < L.length; i++) {
      const ri = Math.hypot(L[i].x - 0.5, L[i].y - 0.5) * d;
      assert.ok(ri + 21 <= d / 2 + 2, 'inside the card');
      for (let j = i + 1; j < L.length; j++) {
        const dist = Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y) * d;
        assert.ok(dist >= (i === 0 ? 45 : 40), `card ${id}: symbols ${i},${j} only ${dist.toFixed(1)}px apart`);
      }
    }
  }
});

test('deal: Fisher–Yates ranges, one card each, pile size option', () => {
  const g = snap;
  let s = g.setup(P(3), { pile: 25 }, { now: 0, first: 0 });
  assert.deepEqual(g.tick(s, { now: 0 }), { type: 'deal' });
  const ranges = g.randomFor(s, { type: 'deal' }, -1);
  assert.equal(ranges.length, 56);
  assert.equal(ranges[0], 57);
  assert.equal(ranges[55], 2);
  assert.throws(() => g.apply(s, { type: 'deal' }, 0, { now: 0, rand: zeros(ranges) }));
  s = g.apply(s, { type: 'deal' }, -1, { now: 100, rand: randFor(ranges) });
  assert.equal(s.phase, 'play');
  assert.equal(s.pile.length, 24); // 25 including the revealed center card
  assert.equal(s.round, 1);
  assert.equal(s.roundAt, 100);
  const all = [...s.players.map((p) => p.card), s.center, ...s.pile];
  assert.equal(new Set(all).size, all.length);
  let t = g.setup(P(8), { pile: 'all' }, { now: 0 });
  t = g.apply(t, { type: 'deal' }, -1, { now: 0, rand: randFor(ranges) });
  assert.equal(t.pile.length + 1, 57 - 8);
  let u = g.setup(P(2), { pile: 15 }, { now: 0 });
  u = g.apply(u, { type: 'deal' }, -1, { now: 0, rand: zeros(ranges) });
  assert.equal(u.pile.length + 1, 15);
});

test('claims: right wins the card, wrong locks out 2s, stale rounds rejected', () => {
  const g = snap;
  let s = g.setup(P(2), { pile: 15 }, { now: 0 });
  s = g.apply(s, { type: 'deal' }, -1, { now: 0, rand: zeros(S.dealRanges()) });
  const right = S.common(s.players[0].card, s.center);
  const wrong = S.CARDS[s.center].find((x) => x !== right);
  const before = structuredClone(s);
  const w = g.apply(s, { type: 'claim', round: 1, symbol: wrong }, 0, { now: 1000 });
  assert.deepEqual(s, before, 'input not mutated');
  assert.equal(w.lockUntil[0], 3000);
  assert.equal(w.phase, 'play');
  assert.throws(() => g.apply(w, { type: 'claim', round: 1, symbol: right }, 0, { now: 2500 }), /locked/);
  assert.throws(() => g.apply(w, { type: 'claim', round: 0, symbol: right }, 0, { now: 3500 }), /late/);
  assert.throws(() => g.apply(w, { type: 'claim', round: 1, symbol: 999 }, 0, { now: 3500 }));
  assert.throws(() => g.apply(w, { type: 'claim', round: 1, symbol: right }, -1, { now: 3500 }));
  const center = w.center;
  const r = g.apply(w, { type: 'claim', round: 1, symbol: right }, 0, { now: 3500 });
  assert.equal(r.players[0].score, 1);
  assert.equal(r.players[0].card, center);
  assert.equal(r.phase, 'reveal');
  assert.deepEqual(r.last, { seat: 0, symbol: right, card: center, old: s.players[0].card });
  // second (simultaneous) claim for the same card is rejected
  const r1 = S.common(w.players[1].card, center);
  assert.throws(() => g.apply(r, { type: 'claim', round: 1, symbol: r1 }, 1, { now: 3600 }));
  assert.equal(g.tick(r, { now: 3600 }), null);
  const n = g.apply(r, g.tick(r, { now: 3500 + S.REVEAL_MS }), -1, { now: 6000 });
  assert.equal(n.round, 2);
  assert.equal(n.phase, 'play');
  assert.equal(n.roundAt, 6000);
  assert.notEqual(n.center, center);
});

test('bot waits 2.5–6 s from round start, then claims the right symbol', () => {
  for (let r = 1; r < 200; r++) for (let seat = 0; seat < 8; seat++) {
    const ms = S.botThinkMs(r, seat);
    assert.ok(ms >= 2500 && ms <= 6000);
    assert.equal(ms, S.botThinkMs(r, seat));
  }
  let s = snap.setup(P(2), {}, { now: 0 });
  s = snap.apply(s, { type: 'deal' }, -1, { now: 1000, rand: randFor(S.dealRanges()) });
  assert.equal(snap.bot(s, 0, { now: 1000 + 2400 }), null);
  const a = snap.bot(s, 0, { now: 1000 + 6000 });
  assert.equal(a.symbol, S.common(s.players[0].card, s.center));
  assert.equal(a.round, 1);
});

// ---- bot play-out (same harness as tests/bots.test.mjs) ----
function playOut(g, nPlayers, opts, maxSteps = 20000) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  let s = g.setup(players, opts, { now: 0, first: 0 });
  let now = 0;
  const apply = (a, seat) => {
    const ranges = g.randomFor?.(s, a, seat);
    s = g.apply(s, a, seat, { now, rand: ranges?.length ? randFor(ranges) : null });
  };
  for (let step = 0; step < maxSteps; step++) {
    if (g.results(s).over) return { s, step };
    now += 1000;
    const sys = g.tick?.(s, { now: now + 1e9 });
    if (sys) { apply(sys, -1); continue; }
    let moved = false;
    for (let seat = 0; seat < nPlayers && !moved; seat++) {
      const a = g.bot(s, seat, { now });
      if (!a) continue;
      try { apply(a, seat); } catch (e) { throw new Error(`bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
    }
    // bots are "thinking": time passes (the outer harness would also just wait)
  }
  throw new Error('game did not finish');
}

test('computer players finish 60 games legally', () => {
  const piles = [15, 25, 'all'];
  for (let k = 0; k < 60; k++) {
    const n = 2 + (k % 7);
    const pile = piles[k % 3];
    const { s } = playOut(snap, n, { pile });
    const res = snap.results(s);
    assert.ok(res.over);
    const total = s.players.reduce((t, p) => t + p.score, 0);
    assert.equal(total, pile === 'all' ? 57 - n : pile);
    assert.ok(res.rows.some((r) => r.win));
  }
});
