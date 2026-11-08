import * as THREE from 'three';
import { PLAY, GOAL, SIX } from '../game/config.js';

// Who can cut out this ball, and where? Checked once at the kick, so the
// result is deterministic and fair: if a defender can physically reach a
// point on the ball's path before the ball, he wins it.
export function planIntercept(match, action) {
  const traj = action.traj;
  const isShot = action.kind === 'shot';
  const step = 1 / 60;
  let best = null;
  const p = new THREE.Vector3();

  for (const o of match.opponents) {
    const wall = o.role === 'wall';
    const keeper = o.role === 'keeper';
    if (keeper && isShot) continue;            // shots are handled by the keeper AI live
    const reach = wall ? PLAY.wallReach : keeper ? PLAY.keeperClaimReach : isShot ? 0.75 : PLAY.defReach;
    const maxH = wall ? PLAY.wallHeight : keeper ? PLAY.keeperJump + 0.2 : PLAY.defHeadReach;
    // against a shot a defender can only lunge, not sprint
    const speed = wall ? 0 : keeper ? PLAY.keeperSpeed * 0.9 : isShot ? o.maxSpeed * 0.4 : o.maxSpeed;
    // reading a lofted ball takes longer than a ground pass
    const reaction = (keeper ? PLAY.keeperReaction + 0.1 : o.reaction) + (action.lofted && !keeper && !wall ? 0.35 : 0);
    const tEnd = action.kind === 'pass' ? traj.duration - 0.05 : traj.duration;
    for (let t = 0.06; t <= tEnd; t += step) {
      if (best && t >= best.t) break;
      traj.positionAt(t, p);
      if (p.y > maxH) continue;
      if (keeper) {
        // keepers only come for balls into the six-yard area
        if (Math.abs(p.x) > SIX.halfWidth + 1.5 || p.z > GOAL.z + SIX.depth + 1.5) continue;
      }
      if (isShot && p.z < GOAL.z + 0.3) break;
      // high balls need a defender right underneath to win the header
      const r = !wall && !keeper && p.y > 1.2 ? reach * 0.6 : reach;
      const d = Math.hypot(p.x - o.pos.x, p.z - o.pos.z) - r;
      const can = d <= 0 || (wall ? false : d <= Math.max(0, t - reaction) * speed);
      if (can) { best = { opp: o, t, point: p.clone() }; break; }
    }
  }
  return best;
}

// Movement orders for opponents at the moment of a kick.
export function assignOpponentRuns(match, action, intercept) {
  const end = action.traj.end;
  for (const o of match.opponents) {
    if (o.role === 'keeper') continue;
    if (o.role === 'wall') { o.setRun(null); continue; }
    if (intercept && intercept.opp === o) {
      o.setRun(intercept.point, match.time + intercept.t);
      continue;
    }
    if (action.kind === 'shot') {
      // close down the shooter / block line
      const toward = new THREE.Vector3().subVectors(match.ball.pos, o.pos).setY(0);
      const d = toward.length();
      if (d > 0.1) o.setRun(o.pos.clone().addScaledVector(toward.normalize(), Math.min(3, d)), null, o.maxSpeed * 0.7);
      continue;
    }
    const markMate = o.mark && match.team.find(m => m.id === o.mark);
    if (markMate) {
      o.markTarget = markMate;
      o.setRun(null);
      continue;
    }
    // press toward where the ball is going, stopping short
    const dir = new THREE.Vector3(o.pos.x - end.x, 0, o.pos.z - end.z);
    const d = dir.length();
    if (d < 0.01) continue;
    const stop = Math.max(2.2, d * 0.35);
    const goalSide = new THREE.Vector3(end.x, 0, end.z).addScaledVector(dir.normalize(), stop);
    o.setRun(goalSide, null, o.maxSpeed * 0.75);
  }
}

// Marking: stay goal-side of the marked attacker.
export function updateMarkers(match) {
  for (const o of match.opponents) {
    if (!o.markTarget || match.intercept?.opp === o) continue;
    const m = o.markTarget;
    const toGoal = new THREE.Vector3(-m.pos.x * 0.15, 0, GOAL.z - m.pos.z).normalize();
    const t = m.pos.clone().addScaledVector(toGoal, 1.6);
    o.setRun(t, null, o.maxSpeed * 0.92);
  }
}
