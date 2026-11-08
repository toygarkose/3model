// Level generator. For every recipe in src/data/worlds.js:
//   1. build many random layouts (seeded, so results are reproducible)
//   2. fire thousands of simulated launches at each (angles x powers)
//   3. keep the layout whose win-rate matches the level's place in the
//      difficulty curve, and reject layouts where flying straight works
//   4. pick a robust, strongly curved winning flight and place the three
//      star shards on it -> 3 stars is always possible, never trivial
// Output: src/data/levels.json
// Usage: node tools/generate-levels.mjs [onlyLevelNumbers...]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WORLDS, RECIPES } from '../src/data/worlds.js';
import { buildWorld, simulate, velocityFromAngle, OUT, escapeSpeed, BH_MU, SIM } from '../src/core/physics.js';
import { gameRadius, gameMu } from '../src/data/bodies.js';

const OUT_FILE = new URL('../src/data/levels.json', import.meta.url);

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Target win-rate over the whole (angle x power) space, by position in the world.
function targetRate(world, i) {
  const [a, b] = { 1: [0.05, 0.011], 2: [0.035, 0.008], 3: [0.03, 0.006] }[world];
  const t = i / 11;
  return Math.exp(Math.log(a) * (1 - t) + Math.log(b) * t);
}

function makeCandidate(recipe, seed) {
  const W = WORLDS.find(w => w.id === recipe.world);
  const field = recipe.field || W.field;
  const { w, h } = field;
  const r = rng(seed);
  const rnd = (a, b) => a + (b - a) * r();
  const placed = [];   // {x, y, ext}
  const free = (x, y, ext, pad = 60) => placed.every(p => Math.hypot(p.x - x, p.y - y) > p.ext + ext + pad);
  const fixed = recipe.fixed;

  const start = fixed ? fixed.start : [rnd(-w * 0.3, w * 0.3), h / 2 - rnd(90, 170)];
  const target = fixed ? fixed.target : (r() < 0.75
    ? [rnd(-w * 0.36, w * 0.36), -h / 2 + rnd(120, 260)]
    : [(r() < 0.5 ? -1 : 1) * rnd(w * 0.3, w * 0.4), rnd(-h * 0.35, -h * 0.05)]);
  placed.push({ x: start[0], y: start[1], ext: 30 }, { x: target[0], y: target[1], ext: 60 });

  const bodies = [];
  const keys = recipe.bodies;
  const radius = k => (k === 'rock' ? rnd(13, 24) : k === 'blackhole' ? 0 : gameRadius(k));
  const muOf = (k, rad) => (k === 'blackhole' ? BH_MU : gameMu(k, rad));
  const moonsOf = i => (recipe.moons || []).filter(m => m.parent === i);
  const inBinary = i => recipe.binary && (recipe.binary[0] === i || recipe.binary[1] === i);

  // primaries
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (inBinary(i) && recipe.binary[1] === i) continue;   // placed with its partner
    const rad = radius(k);
    let ext = Math.max(rad, k === 'blackhole' ? 40 : 0);
    if (recipe.rings === i) ext = rad * 2.3;
    const moons = moonsOf(i);
    const moonOrbits = moons.map((m, j) => (recipe.rings === i ? rad * 2.45 : Math.max(rad, 40)) + 80 + j * 75 + rnd(0, 35));
    if (moonOrbits.length) ext = Math.max(ext, moonOrbits[moonOrbits.length - 1] + gameRadius(moons[moons.length - 1].key));
    if (inBinary(i)) ext = recipe.binary[2] + gameRadius(keys[recipe.binary[1]]);
    let ok = false, x = 0, y = 0;
    for (let tries = 0; tries < 200 && !ok; tries++) {
      if (fixed?.bodies?.[i]) { [x, y] = fixed.bodies[i]; ok = true; break; }
      x = rnd(-w * 0.42, w * 0.42); y = rnd(-h * 0.32, h * 0.3);
      // keep rings and moon orbits on screen
      const inside = Math.abs(x) + Math.min(ext, w * 0.48) * 0.92 < w / 2 && Math.abs(y) + ext * 0.92 < h / 2 - 60;
      ok = inside && free(x, y, ext, k === 'rock' ? 40 : 90);
    }
    if (!ok) return null;
    placed.push({ x, y, ext });
    if (inBinary(i)) {
      const j = recipe.binary[1], d = recipe.binary[2];
      const ra = radius(k), rb = radius(keys[j]);
      const ma = muOf(k, ra), mb = muOf(keys[j], rb);
      const wv = Math.sqrt((ma + mb) / d ** 3);
      const phase = rnd(0, Math.PI * 2);
      bodies[i] = { key: k, x, y, orbit: { cx: x, cy: y, R: (d * mb) / (ma + mb), w: wv, phase } };
      bodies[j] = { key: keys[j], x, y, orbit: { cx: x, cy: y, R: (d * ma) / (ma + mb), w: wv, phase: phase + Math.PI } };
      continue;
    }
    bodies[i] = { key: k, x, y, ...(k === 'rock' ? { r: rad } : {}) };
    moons.forEach((m, j) => {
      const R = moonOrbits[j];
      const wv = m.dir * Math.sqrt(muOf(k, rad) / R ** 3);   // Kepler's third law
      m._orbit = { around: i, R, w: wv, phase: rnd(0, Math.PI * 2) };
    });
  }
  // moons go after the primaries
  for (const m of recipe.moons || []) {
    const p = bodies[m.parent];
    bodies.push({ key: m.key, x: p.x + m._orbit.R, y: p.y, orbit: { ...m._orbit } });
  }
  // free asteroids
  for (let n = 0; n < (recipe.rocks || 0); n++) {
    let ok = false, x = 0, y = 0;
    const rad = rnd(12, 22);
    for (let tries = 0; tries < 200 && !ok; tries++) {
      x = rnd(-w * 0.44, w * 0.44); y = rnd(-h * 0.36, h * 0.34);
      ok = free(x, y, rad, 45);
    }
    if (!ok) return null;
    placed.push({ x, y, ext: rad });
    bodies.push({ key: 'rock', x, y, r: rad });
  }
  const rings = recipe.rings != null ? [{ body: recipe.rings, inner: gameRadius(keys[recipe.rings]) * 1.24, outer: gameRadius(keys[recipe.rings]) * 2.27, gap: [gameRadius(keys[recipe.rings]) * 1.86, gameRadius(keys[recipe.rings]) * 2.06] }] : [];

  // launch speed scales with the strongest well: 1.45 x surface escape velocity
  const tmp = buildWorld({ field, start, target: { x: target[0], y: target[1], r: 46 }, bodies, rings, maxSpeed: 1 });
  let vmax = 0;
  for (const b of tmp.bodies) if (b.kind === 'planet') vmax = Math.max(vmax, escapeSpeed(b));
  if (tmp.bodies.some(b => b.kind === 'blackhole')) vmax = Math.max(vmax, 760);
  const maxSpeed = Math.round(Math.min(1700, Math.max(300, vmax * 1.45)));
  const warp = +Math.min(3, Math.max(0.6, h / (0.6 * maxSpeed) / 2.8)).toFixed(2);
  return {
    world: recipe.world, name: recipe.name, field,
    start: start.map(v => Math.round(v)), target: { x: Math.round(target[0]), y: Math.round(target[1]), r: recipe.world === 2 ? 54 : 46 },
    bodies: bodies.map(b => ({ ...b, x: Math.round(b.x), y: Math.round(b.y) })), rings, maxSpeed, warp,
  };
}

function evaluate(level, aSteps, pSteps, maxT = SIM.MAX_T) {
  const world = buildWorld(level);
  const wins = [];
  let total = 0;
  for (let ai = 0; ai < aSteps; ai++) {
    const a = (ai / aSteps) * Math.PI * 2;
    for (let pi = 0; pi < pSteps; pi++) {
      const p = pSteps === 1 ? 1 : pi / (pSteps - 1);
      const v = velocityFromAngle(world, a, p);
      const res = simulate(world, v.vx, v.vy, { maxT });
      total++;
      if (res.out === OUT.TARGET) wins.push({ ai, pi, a, p, stars: res.stars });
    }
  }
  return { wins, rate: wins.length / total, total };
}

// Is a straight shot good enough? (then gravity isn't the puzzle)
function tooDirect(level) {
  const world = buildWorld(level);
  const sx = world.start.x, sy = world.start.y, tx = world.target.x, ty = world.target.y;
  const L = Math.hypot(tx - sx, ty - sy);
  for (const b of world.bodies) {
    const t = Math.max(0, Math.min(1, ((b.x - sx) * (tx - sx) + (b.y - sy) * (ty - sy)) / (L * L)));
    const d = Math.hypot(sx + (tx - sx) * t - b.x, sy + (ty - sy) * t - b.y);
    const reach = b.kind === 'rock' ? b.r + 30 : b.kind === 'blackhole' ? 170 : b.r * 1.6 + 40;
    if (d < reach) return false;
  }
  for (const rg of world.rings) {
    const b = world.bodies[rg.body];
    const t = Math.max(0, Math.min(1, ((b.x - sx) * (tx - sx) + (b.y - sy) * (ty - sy)) / (L * L)));
    if (Math.hypot(sx + (tx - sx) * t - b.x, sy + (ty - sy) * t - b.y) < rg.outer + 30) return false;
  }
  return true;
}

function placeShards(level, minRobust = 7, minThree = 4) {
  const fine = evaluate(level, 720, 32);
  const key = (a, p) => `${(a + 720) % 720},${p}`;
  const set = new Set(fine.wins.map(w => key(w.ai, w.pi)));
  const world = buildWorld(level);
  let cands = fine.wins.map(w => {
    let n = 0;
    for (const da of [-1, 0, 1]) for (const dp of [-1, 0, 1]) if (set.has(key(w.ai + da, w.pi + dp))) n++;
    return { ...w, robust: n };
  }).filter(w => w.robust >= minRobust);
  if (!cands.length) return null;
  // the most curved robust flight becomes the "golden" path
  cands = cands.sort(() => 0).slice(0, 400).map(w => {
    const v = velocityFromAngle(world, w.a, w.p);
    const res = simulate(world, v.vx, v.vy, { record: true });
    const P = res.path, [x0, y0] = P[0], [x1, y1] = P[P.length - 1];
    const L = Math.hypot(x1 - x0, y1 - y0) || 1;
    let dev = 0;
    for (const [x, y] of P) dev = Math.max(dev, Math.abs((x1 - x0) * (y0 - y) - (x0 - x) * (y1 - y0)) / L);
    return { ...w, path: P, curve: dev / L };
  }).sort((a, b) => b.curve - a.curve);
  for (const g of cands.slice(0, 12)) {
    const P = g.path;
    const acc = [0];
    for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = acc[acc.length - 1];
    const at = f => { const s = total * f; let i = acc.findIndex(v => v >= s); return P[Math.max(0, i)]; };
    const shards = [0.3, 0.55, 0.78].map(f => at(f).map(v => Math.round(v)));
    const trial = { ...level, shards };
    const check = evaluate(trial, 720, 32);
    const three = check.wins.filter(w => w.stars === 3).length;
    if (three >= minThree) {
      const sol = check.wins.find(w => w.stars === 3 && w.ai === g.ai && w.pi === g.pi) || check.wins.find(w => w.stars === 3);
      return { shards, rate: check.rate, rate3: three / check.total, curve: g.curve, solution: { a: +sol.a.toFixed(6), p: +sol.p.toFixed(6) } };
    }
  }
  return null;
}

function buildLevel(index) {
  const recipe = RECIPES[index];
  const worldLevels = RECIPES.filter(r => r.world === recipe.world);
  const i = worldLevels.indexOf(recipe);
  const want = targetRate(recipe.world, i);
  const cands = [];
  const tries = recipe.fixed ? 1 : +(process.env.TRIES || 28);
  for (let s = 0; s < tries; s++) {
    const lvl = makeCandidate(recipe, 1000 * (index + 1) + s);
    if (!lvl) continue;
    if (!recipe.tutorial && tooDirect(lvl)) continue;
    const ev = evaluate(lvl, 180, 12, 14);
    if (ev.rate < 0.002 || ev.rate > 0.2) continue;
    cands.push({ lvl, score: Math.abs(Math.log(ev.rate) - Math.log(want)), rate: ev.rate });
  }
  if (!cands.length) return { index, error: 'no valid layout' };
  cands.sort((x, y) => x.score - y.score);
  let best = null, sh = null;
  // the closest-difficulty layout that also has a robust 3-star path
  for (const c of cands.slice(0, 8)) {
    sh = placeShards(c.lvl) || placeShards(c.lvl, 5, 2);
    if (sh) { best = c; break; }
  }
  if (!sh) return { index, error: 'no shard path' };
  const preview = { 1: 1.3, 2: 0.8, 3: 0.5 }[recipe.tutorial] ?? 0.22;
  return {
    index, level: {
      id: `w${recipe.world}-${String(i + 1).padStart(2, '0')}`, recipe: index, ...best.lvl, shards: sh.shards, preview,
      solution: sh.solution,
      stats: { winRate: +sh.rate.toFixed(4), threeStarRate: +sh.rate3.toFixed(5), target: +want.toFixed(4), curve: +sh.curve.toFixed(2) },
    },
  };
}

if (isMainThread) {
  const only = process.argv.slice(2).map(Number).filter(Boolean);
  const todo = RECIPES.map((_, i) => i).filter(i => !only.length || only.includes(i + 1));
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch (_) { /* first run */ }
  const results = new Array(RECIPES.length);
  existing.forEach((l) => { if (l.recipe != null) results[l.recipe] = l; });
  const pool = Math.max(1, os.cpus().length);
  let next = 0, running = 0, failed = 0;
  const t0 = Date.now();
  await new Promise(resolve => {
    const launch = () => {
      while (running < pool && next < todo.length) {
        const idx = todo[next++];
        running++;
        const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { idx } });
        wk.on('message', (m) => {
          if (m.error) { failed++; console.log(`#${m.index + 1} ${RECIPES[m.index].name}: ${m.error}`); }
          else { results[m.index] = m.level; const s = m.level.stats; console.log(`#${m.index + 1} ${m.level.id} ${m.level.name.padEnd(20)} win ${(s.winRate * 100).toFixed(2)}% (want ${(s.target * 100).toFixed(2)}%)  3★ ${(s.threeStarRate * 100).toFixed(3)}%  speed ${m.level.maxSpeed}  warp ${m.level.warp}`); }
        });
        wk.on('exit', () => { running--; if (next >= todo.length && running === 0) resolve(); else launch(); });
      }
    };
    launch();
  });
  const final = results.filter(Boolean);
  fs.writeFileSync(OUT_FILE, JSON.stringify(final, null, 1));
  console.log(`\n${final.length} levels written in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${failed} failed`);
  process.exit(failed ? 1 : 0);
} else {
  parentPort.postMessage(buildLevel(workerData.idx));
}
