// Football flight: gravity, quadratic air drag, Magnus curl from sidespin,
// bounces and rolling friction. Deterministic fixed step.
import { BALL, BALL_R, DT, GOAL } from '../data/config.js';

export function makeBall(x, y) {
  return { x, y, z: BALL_R, vx: 0, vy: 0, vz: 0, spin: 0, rot: 0, moving: false };
}

export function kick(b, dirX, dirY, speed, elevDeg, spin) {
  const e = (elevDeg * Math.PI) / 180;
  const L = Math.hypot(dirX, dirY) || 1;
  b.vx = (dirX / L) * speed * Math.cos(e);
  b.vy = (dirY / L) * speed * Math.cos(e);
  b.vz = speed * Math.sin(e);
  b.spin = spin;
  b.moving = true;
}

// Advance one step. Returns 'bounce' on a hard bounce, else null.
export function stepBall(b) {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  let ev = null;
  const hsp = Math.hypot(b.vx, b.vy);
  // drag
  const k = BALL.drag * sp;
  let ax = -k * b.vx, ay = -k * b.vy, az = -k * b.vz - BALL.gravity;
  // Magnus: sideways, perpendicular to horizontal velocity (positive spin curls left of travel)
  if (hsp > 0.5 && b.z > BALL_R + 0.02) {
    const m = b.spin * BALL.magnus * hsp;
    ax += (-b.vy / hsp) * m;
    ay += (b.vx / hsp) * m;
  }
  b.vx += ax * DT; b.vy += ay * DT; b.vz += az * DT;
  b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
  b.spin *= Math.exp(-BALL.spinDecay * DT);
  if (b.z < BALL_R) {
    b.z = BALL_R;
    if (b.vz < -1.5) { b.vz = -b.vz * BALL.bounce; b.vx *= 0.82; b.vy *= 0.82; b.spin *= 0.5; ev = 'bounce'; }
    else {
      b.vz = 0;
      const h = Math.hypot(b.vx, b.vy);
      if (h > 0) { const nh = Math.max(0, h - BALL.roll * DT); b.vx *= nh / h; b.vy *= nh / h; }
      b.spin *= 0.9;
    }
  }
  b.rot += hsp * DT / BALL_R;
  if (Math.hypot(b.vx, b.vy) < 0.05 && b.z <= BALL_R + 0.001) b.moving = false;
  return ev;
}

// Ball crossing the goal-line plane between prev and now.
export function goalLine(prev, b) {
  if (!(prev.y > 0 && b.y <= 0)) return null;
  const f = prev.y / (prev.y - b.y || 1);
  const x = prev.x + (b.x - prev.x) * f, z = prev.z + (b.z - prev.z) * f;
  const ax = Math.abs(x);
  if (ax < GOAL.halfW - BALL_R * 0.5 && z < GOAL.h - BALL_R * 0.5) return { kind: 'goal', x, z };
  if (Math.abs(ax - GOAL.halfW) < BALL_R + GOAL.postR + 0.03 && z < GOAL.h + BALL_R) return { kind: 'post', x, z };
  if (Math.abs(z - GOAL.h) < BALL_R + GOAL.postR + 0.03 && ax < GOAL.halfW + BALL_R) return { kind: 'bar', x, z };
  return { kind: 'miss', x, z };
}

// Ball inside the goal: net collisions (it should stay in).
export function netCollide(b) {
  if (b.y > 0 || Math.abs(b.x) > GOAL.halfW + 0.3) return null;
  let hit = null;
  if (b.y < -GOAL.depth + BALL_R) { b.y = -GOAL.depth + BALL_R; hit = Math.abs(b.vy); b.vy = Math.abs(b.vy) * 0.1; b.vx *= 0.35; b.vz *= 0.35; }
  if (Math.abs(b.x) > GOAL.halfW - BALL_R) { b.x = Math.sign(b.x) * (GOAL.halfW - BALL_R); hit = hit ?? Math.abs(b.vx); b.vx = -b.vx * 0.15; }
  if (b.z > GOAL.h - BALL_R) { b.z = GOAL.h - BALL_R; b.vz = -Math.abs(b.vz) * 0.2; }
  return hit;
}
