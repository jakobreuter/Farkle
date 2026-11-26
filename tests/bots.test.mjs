// Computer players play complete games against each other. Every action they choose
// must be legal, and every game must finish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_LIST } from '../js/games/index.js';

const randFor = (ranges) => ranges.map((r) => Math.floor(Math.random() * r));

function playOut(g, nPlayers, maxSteps = 20000) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ pid: `bot-${i}`, name: `Bot${i}` }));
  const opts = {};
  for (const o of g.options || []) opts[o.key] = o.default;
  let s = g.setup(players, opts, { now: 0, first: 0 });
  let now = 0;
  const apply = (a, seat) => {
    const ranges = g.randomFor?.(s, a, seat);
    s = g.apply(s, a, seat, { now, rand: ranges?.length ? randFor(ranges) : null });
  };
  for (let step = 0; step < maxSteps; step++) {
    if (g.results(s).over) return { s, step };
    now += 1000;
    const sys = g.tick?.(s, { now: now + 1e9 }); // let any timers expire
    if (sys) { apply(sys, -1); continue; }
    let moved = false;
    for (let seat = 0; seat < nPlayers && !moved; seat++) {
      const a = g.bot(s, seat);
      if (!a) continue;
      try { apply(a, seat); } catch (e) { throw new Error(`${g.id}: bot ${seat} chose an illegal move ${JSON.stringify(a)} — ${e.message}`); }
      moved = true;
    }
    if (!moved) throw new Error(`${g.id}: nobody can move (phase ${s.phase})`);
  }
  throw new Error(`${g.id}: game did not finish`);
}

for (const g of GAME_LIST.filter((x) => x.bot)) {
  test(`computer players finish ${g.name} legally`, () => {
    const sizes = [Math.max(2, g.minPlayers), Math.min(3, g.maxPlayers)];
    const runs = g.id === 'rush' ? 40 : 60;
    let steps = 0;
    for (let k = 0; k < runs; k++) {
      const { step } = playOut(g, sizes[k % 2]);
      steps += step;
    }
    assert.ok(steps > 0);
  });
}
