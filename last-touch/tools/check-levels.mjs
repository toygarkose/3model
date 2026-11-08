// Level checker: brute-forces passes and shots through the REAL game
// simulation (src/game/match.js) to prove every level can be won,
// and reports how forgiving each decision is.
// Usage: npm run check-levels   (or: node tools/check-levels.mjs 3  -> only level 3)
import { Match } from '../src/game/match.js';
import { LEVELS } from '../src/levels/index.js';
import { computeStars } from '../src/game/scoring.js';

const SHOT_X = [-3.3, -2.7, -1.8, 0, 1.8, 2.7, 3.3];
const SHOT_Y = [0.3, 1.2, 2.1];
const CURVES = [-0.28, -0.14, 0, 0.14, 0.28];
const SHOT_CURVES = [-0.15, -0.08, 0, 0.08, 0.15];
const POWERS = [0.35, 0.7, 1.0];

function simulate(level, actions) {
  const m = new Match(level);
  for (const a of actions) {
    if (m.state !== 'decision') return m;
    const built = a.kind === 'pass'
      ? m.previewPass({ x: a.x, z: a.z }, a.curve)
      : m.previewShot({ x: a.x, y: a.y }, a.curve, a.power);
    m.startAction(built);
    let guard = 0;
    while ((m.state === 'action' || m.pendingDecision > 0) && guard++ < 2400) m.step(1 / 120);
  }
  return m;
}

function passCandidates(m) {
  const out = [];
  const seen = new Set();
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

function shotCandidates() {
  const out = [];
  for (const x of SHOT_X) for (const y of SHOT_Y) for (const curve of SHOT_CURVES) for (const power of POWERS)
    out.push({ kind: 'shot', x, y, curve, power });
  return out;
}

function search(level, prefix, depth, report) {
  const m = simulate(level, prefix);
  if (m.state === 'over') {
    if (m.result.success) {
      const s = computeStars(level, m).stars;
      report.wins++;
      if (s > report.bestStars) { report.bestStars = s; report.example = prefix; }
    }
    return;
  }
  if (depth <= 0 || m.state !== 'decision') return;
  const stepStats = report.byDepth[prefix.length] || (report.byDepth[prefix.length] = { tried: 0, ok: 0 });

  if (level.objective.type === 'goal' && m.canShoot()) {
    for (const s of shotCandidates()) {
      const r = simulate(level, [...prefix, s]);
      stepStats.tried++;
      report.reasons[r.result?.reason] = (report.reasons[r.result?.reason] || 0) + 1;
      if (r.result?.success) {
        stepStats.ok++;
        report.wins++;
        const st = computeStars(level, r).stars;
        if (st > report.bestStars) { report.bestStars = st; report.example = [...prefix, s]; }
      }
    }
  }
  // passes: keep a handful of distinct successful receptions to explore deeper
  const children = [];
  const seen = new Set();
  for (const p of passCandidates(m)) {
    const r = simulate(level, [...prefix, p]);
    stepStats.tried++;
    if (r.state === 'over' && r.result.success) {
      stepStats.ok++; report.wins++;
      const st = computeStars(level, r).stars;
      if (st > report.bestStars) { report.bestStars = st; report.example = [...prefix, p]; }
      continue;
    }
    if (r.state === 'decision') {
      stepStats.ok++;
      const key = `${r.holder.id}:${Math.round(r.ball.pos.x / 3)},${Math.round(r.ball.pos.z / 3)}`;
      if (!seen.has(key)) { seen.add(key); children.push(p); }
    }
  }
  for (const c of children.slice(0, 8)) search(level, [...prefix, c], depth - 1, report);
}

const only = process.argv.slice(2).map(Number).filter(Boolean);
let allOk = true;
for (const level of LEVELS) {
  if (only.length && !only.includes(level.number)) continue;
  const report = { wins: 0, bestStars: 0, example: null, byDepth: [], reasons: {} };
  const t0 = Date.now();
  search(level, [], level.maxActions, report);
  const ok = report.wins > 0;
  allOk &&= ok;
  let direct = 0, dtot = 0;
  { const m0 = simulate(level, []); if (level.objective.type === 'goal' && m0.canShoot()) for (const s of shotCandidates()) { dtot++; if (simulate(level, [s]).result?.success) direct++; } }
  const depthInfo = report.byDepth.map((d, i) => `move${i + 1}: ${d.ok}/${d.tried}`).join('  ');
  console.log(`L${String(level.number).padStart(2)} ${level.title.padEnd(22)} ${ok ? 'SOLVABLE' : 'UNSOLVED'}  wins=${report.wins}  best=${report.bestStars}*  ${depthInfo}  direct-shot=${direct}/${dtot}  (${Date.now() - t0}ms)`);
  if (process.env.VERBOSE) console.log('     shot outcomes', JSON.stringify(report.reasons));
  if (report.example) console.log('     e.g. ' + report.example.map(a => a.kind === 'pass'
    ? `pass(${a.x.toFixed(1)},${a.z.toFixed(1)} c${a.curve})` : `shot(${a.x},${a.y} c${a.curve} p${a.power})`).join(' -> '));
}
process.exit(allOk ? 0 : 1);
