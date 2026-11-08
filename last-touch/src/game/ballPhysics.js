import { PHYS, BALL_R, GOAL, PITCH } from './config.js';

// Free-flight physics used whenever the ball is not on an assisted path:
// after a shot crosses the line, after a save or block, and for loose balls.
export function stepFreeBall(ball, dt, events) {
  const p = ball.pos, v = ball.vel;
  v.y -= PHYS.gravity * dt;
  const drag = Math.exp(-PHYS.airDrag * dt);
  v.multiplyScalar(drag);
  p.addScaledVector(v, dt);

  if (p.y < BALL_R) {
    p.y = BALL_R;
    if (v.y < -1.2) {
      v.y = -v.y * PHYS.restitution;
      v.x *= 0.85; v.z *= 0.85;
      events?.push({ type: 'bounce', strength: Math.min(1, Math.abs(v.y) / 6) });
    } else {
      v.y = 0;
      const k = Math.exp(-PHYS.rollFriction * dt);
      v.x *= k; v.z *= k;
    }
  }

  // inside the goal: net walls
  if (p.z < GOAL.z && Math.abs(p.x) < GOAL.halfWidth + 0.3) {
    const back = GOAL.z - GOAL.depth + BALL_R;
    if (p.z < back) { hitNet(ball, 'back', events); p.z = back; v.z = Math.abs(v.z) * 0.12; v.x *= 0.35; v.y *= 0.35; }
    const side = GOAL.halfWidth - BALL_R;
    if (Math.abs(p.x) > side && p.z < GOAL.z - 0.1) { hitNet(ball, 'side', events); p.x = Math.sign(p.x) * side; v.x = -v.x * 0.15; v.z *= 0.5; }
    const roof = GOAL.height - BALL_R;
    if (p.y > roof && p.z < GOAL.z - 0.1) { hitNet(ball, 'roof', events); p.y = roof; v.y = -Math.abs(v.y) * 0.15; }
  }
}

function hitNet(ball, part, events) {
  const s = ball.vel.length();
  if (s > 1.5) events?.push({ type: 'net', part, strength: Math.min(1, s / 25), at: ball.pos.clone() });
}

// Classify a ball crossing the goal line plane.
export function classifyGoalLine(x, y) {
  const ax = Math.abs(x), r = BALL_R;
  if (ax < GOAL.halfWidth - r * 0.5 && y < GOAL.height - r * 0.5) return 'goal';
  if (Math.abs(ax - GOAL.halfWidth) < r + GOAL.postR + 0.04 && y < GOAL.height + r) return 'post';
  if (Math.abs(y - GOAL.height) < r + GOAL.postR + 0.04 && ax < GOAL.halfWidth + r) return 'bar';
  return 'miss';
}

export function isOutOfPlay(p) {
  return Math.abs(p.x) > PITCH.halfW + 1 || p.z > PITCH.halfL + 1 || (p.z < GOAL.z - 0.3 && Math.abs(p.x) > GOAL.halfWidth + 0.3);
}
