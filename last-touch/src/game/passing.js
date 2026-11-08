import * as THREE from 'three';
import { PLAY, BALL_R, GOAL, BOX } from './config.js';
import { Trajectory } from './trajectory.js';

export function inBox(x, z) {
  return Math.abs(x) < BOX.halfWidth && z < GOAL.z + BOX.depth && z > GOAL.z;
}

// Flight plan for a pass from `start` to ground point `end` with a bend fraction.
function plan(start, end, curve, loft = null) {
  const L = Math.hypot(end.x - start.x, end.z - start.z);
  const lofted = loft ?? L > PLAY.loftDistance;
  const aerial = lofted && inBox(end.x, end.z);
  const endY = aerial ? PLAY.headerHeight : BALL_R;
  let duration, decel, arc;
  if (lofted) {
    duration = 0.9 + L * 0.028;
    decel = 0.15;
    arc = THREE.MathUtils.clamp(L * 0.11, PLAY.loftHeightMin, PLAY.loftHeightMax);
  } else {
    const v0 = THREE.MathUtils.clamp(10 + 0.55 * L, PLAY.passSpeedMin, PLAY.passSpeedMax);
    decel = PLAY.passDecel;
    duration = L / ((v0 * (2 - decel)) / 2);
    arc = 0;
  }
  // curved paths are a little longer, so they take a little longer
  duration *= 1 + Math.abs(curve) * 0.5;
  const traj = new Trajectory({
    start, end: new THREE.Vector3(end.x, endY, end.z), bend: curve * L, duration, decel, arc,
  });
  return { traj, lofted, aerial, length: L };
}

/**
 * Build a pass toward a ground point. Finds the teammate who can collect it
 * and, when a runner is close to the landing point, weights it perfectly.
 * @returns {{kind:'pass', traj, receiver, perfect, lofted, aerial, curve}}
 */
export function buildPass(match, endXZ, curve) {
  const start = match.ball.pos.clone();
  const holder = match.holder;
  let end = new THREE.Vector3(endXZ.x, 0, endXZ.z);
  curve = THREE.MathUtils.clamp(curve, -PLAY.maxCurve, PLAY.maxCurve);
  if (Math.abs(curve) < PLAY.curveDeadzone) curve = 0;

  // ground or air is decided by what the player drew, not by the assist
  const loft = Math.hypot(end.x - start.x, end.z - start.z) > PLAY.loftDistance;
  let p = plan(start, end, curve, loft);
  let receiver = null, perfect = false;

  // 1) snap to a runner who will be near the landing point
  let best = null, bestD = PLAY.snapRadius;
  for (const m of match.team) {
    if (m === holder) continue;
    const at = match.predictRun(m, p.traj.duration);
    const d = Math.hypot(at.x - end.x, at.z - end.z);
    if (d < bestD) { bestD = d; best = { m, at }; }
  }
  if (best) {
    end = new THREE.Vector3(best.at.x, 0, best.at.z);
    p = plan(start, end, curve, loft);
    // re-predict once with the new flight time
    const at2 = match.predictRun(best.m, p.traj.duration);
    if (Math.hypot(at2.x - end.x, at2.z - end.z) > 0.3) {
      end.set(at2.x, 0, at2.z);
      p = plan(start, end, curve, loft);
    }
    receiver = best.m;
    perfect = true;
  } else {
    // 2) otherwise the closest teammate who can still get there in time
    let bestT = Infinity;
    for (const m of match.team) {
      if (m === holder) continue;
      const t = Math.hypot(m.pos.x - end.x, m.pos.z - end.z) / PLAY.runSpeed + 0.1;
      if (t <= p.traj.duration + PLAY.receiveTolerance && t < bestT) { bestT = t; receiver = m; }
    }
  }
  return { kind: 'pass', traj: p.traj, receiver, perfect, lofted: p.lofted, aerial: p.aerial && !!receiver, curve };
}
