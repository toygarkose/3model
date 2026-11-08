import * as THREE from 'three';
import { PLAY, GOAL, BALL_R } from './config.js';
import { Trajectory } from './trajectory.js';

/**
 * Build a shot toward a point on the goal plane.
 * @param {object} match
 * @param {{x:number,y:number}} target  point on the goal line plane
 * @param {number} curve   signed bend fraction
 * @param {number} power   0..1 (from swipe speed)
 */
export function buildShot(match, target, curve, power) {
  const start = match.ball.pos.clone();
  const header = start.y > 1.0;
  power = THREE.MathUtils.clamp(power, 0, 1);
  curve = THREE.MathUtils.clamp(curve, -PLAY.maxShotCurve, PLAY.maxShotCurve);
  if (Math.abs(curve) < PLAY.curveDeadzone * 0.5) curve = 0;

  const ty = THREE.MathUtils.clamp(target.y, BALL_R, 5);
  // aim slightly beyond the line so the ball carries into the net
  const end = new THREE.Vector3(target.x, ty, GOAL.z - 0.6);
  const L = Math.hypot(end.x - start.x, end.z - start.z);
  const speed = header
    ? THREE.MathUtils.lerp(PLAY.headerSpeedMin, PLAY.headerSpeedMax, power)
    : THREE.MathUtils.lerp(PLAY.shotSpeedMin, PLAY.shotSpeedMax, power);
  const duration = (L / speed) * (1 + Math.abs(curve) * 0.35) * 1.06;
  // soft shots loop up and dip, hard shots stay flat
  const arc = header ? 0.12 : 0.18 + L * 0.008 + (1 - power) * L * 0.05;
  const traj = new Trajectory({ start, end, bend: curve * L, duration, decel: 0.12, arc });
  return { kind: 'shot', traj, curve, power, header, target: { x: target.x, y: ty }, distance: L };
}

export function canShoot(match) {
  const b = match.ball.pos;
  return Math.hypot(b.x, b.z - GOAL.z) <= PLAY.shotRange;
}
