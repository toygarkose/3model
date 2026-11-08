// Shared brute-force solver over the real simulation (used by check-levels and playtest).
import { Match } from '../src/game/match.js';
import { computeStars } from '../src/game/scoring.js';

export const SHOT_X = [-3.3, -2.7, -1.8, 0, 1.8, 2.7, 3.3];
export const SHOT_Y = [0.3, 1.2, 2.1];
export const CURVES = [-0.28, -0.14, 0, 0.14, 0.28];
export const SHOT_CURVES = [-0.15, -0.08, 0, 0.08, 0.15];
export const POWERS = [0.35, 0.7, 1.0];

export function simulate(level, actions) {
  const m = new Match(level);
  for (const a of actions) {
    if (m.state !== 'decision') return m;
    const built = a.kind === 'pass' ? m.previewPass({ x: a.x, z: a.z }, a.curve) : m.previewShot({ x: a.x, y: a.y }, a.curve, a.power);
    m.startAction(built);
    let guard = 0;
    while ((m.state === 'action' || m.pendingDecision > 0) && guard++ < 2400) m.step(1 / 120);
  }
  return m;
}

export function passCandidates(m) {
  const out = [], seen = new Set();
  for (const mate of m.team) {
    if (mate === m.holder) continue;
    const pts = [mate.pos, ...[0.7, 1.1, 1.5, 2.0].map(t => m.predictRun(mate, t))];
    for (const p of pts) for (const dx of [-2, 0, 2]) for (const curve of CURVES) {
      const key = `${Math.round(p.x + dx)},${Math.round(p.z)},${curve}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: 'pass', x: p.x + dx, z: p.z, curve });
    }
  }
  return out;
}

export function shotCandidates() {
  const out = [];
  for (const x of SHOT_X) for (const y of SHOT_Y) for (const curve of SHOT_CURVES) for (const power of POWERS) out.push({ kind: 'shot', x, y, curve, power });
  return out;
}

// Depth-first search for a winning sequence; prefers the best stars found.
export function solve(level, { maxChildren = 8 } = {}) {
  let best = null, bestStars = 0;
  const rec = (prefix, depth) => {
    if (bestStars === 3) return;
    const m = simulate(level, prefix);
    if (m.state !== 'decision' || depth <= 0) return;
    const tryOne = (a) => {
      const r = simulate(level, [...prefix, a]);
      if (r.state === 'over' && r.result.success) {
        const s = computeStars(level, r).stars;
        if (s > bestStars) { bestStars = s; best = [...prefix, a]; }
      }
      return r;
    };
    if (level.objective.type === 'goal' && m.canShoot()) for (const s of shotCandidates()) { tryOne(s); if (bestStars === 3) return; }
    const kids = [], seen = new Set();
    for (const p of passCandidates(m)) {
      const r = tryOne(p);
      if (bestStars === 3) return;
      if (r.state === 'decision') {
        const key = `${r.holder.id}:${Math.round(r.ball.pos.x / 3)},${Math.round(r.ball.pos.z / 3)}`;
        if (!seen.has(key)) { seen.add(key); kids.push(p); }
      }
    }
    for (const k of kids.slice(0, maxChildren)) rec([...prefix, k], depth - 1);
  };
  rec([], level.maxActions);
  return { actions: best, stars: bestStars };
}
