import * as THREE from 'three';
import { GOAL, PLAY } from './config.js';

// Turns a drawn screen path into a football action.
//  - ends on/near the goal (and in range)  -> shot; swipe speed = power
//  - ends on the grass                     -> pass to that spot
//  - bending the line                      -> curve
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -GOAL.z);
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function hit(camera, p, plane, w, h) {
  ndc.set((p.x / w) * 2 - 1, -(p.y / h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const out = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, out) ? out : null;
}

export function toScreen(camera, v, w, h) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, behind: p.z > 1 };
}

// Screen-space box around the goal mouth (generous, for fat fingers).
export function goalScreenBox(camera, w, h, margin = 0.35) {
  const xs = [], ys = [];
  for (const x of [-GOAL.halfWidth - 1.5, GOAL.halfWidth + 1.5]) for (const y of [0, GOAL.height + 1.5]) {
    const s = toScreen(camera, new THREE.Vector3(x, y, GOAL.z), w, h);
    xs.push(s.x); ys.push(s.y);
  }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const mx = (x1 - x0) * margin + 24, my = (y1 - y0) * margin + 24;
  return { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my };
}

export function interpretGesture(points, camera, match, w, h) {
  if (points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  if (chord < 28) return null;

  // signed screen deviation (curve amount)
  let dev = 0, far = first;
  for (const p of points) {
    const d = ((last.x - first.x) * (p.y - first.y) - (last.y - first.y) * (p.x - first.x)) / chord;
    if (Math.abs(d) > Math.abs(dev)) { dev = d; far = p; }
  }
  const screenFrac = dev / chord;
  const start = match.ball.pos;

  const box = goalScreenBox(camera, w, h, match.aerial ? 0.9 : 0.35);
  const inGoalBox = last.x > box.x0 && last.x < box.x1 && last.y > box.y0 && last.y < box.y1;
  const lastGround = hit(camera, last, ground, w, h);
  const beyondLine = lastGround && lastGround.z < GOAL.z + 1.5 && Math.abs(lastGround.x) < GOAL.halfWidth + 6;

  if ((inGoalBox || beyondLine || (match.aerial && last.y < first.y)) && (match.canShoot() || match.aerial)) {
    const gp = hit(camera, last, goalPlane, w, h);
    if (!gp) return null;
    // curve sign from the world side of the bend
    let sign = Math.sign(screenFrac);
    const fg = hit(camera, far, ground, w, h);
    if (fg) {
      const dx = gp.x - start.x, dz = GOAL.z - start.z, L = Math.hypot(dx, dz) || 1;
      const lateral = ((fg.x - start.x) * (-dz) + (fg.z - start.z) * dx) / L;
      if (Math.abs(lateral) > 0.05) sign = Math.sign(lateral);
    }
    const curve = sign * Math.min(Math.abs(screenFrac) * 0.6, PLAY.maxShotCurve);
    // swipe speed over the last ~110 ms -> power
    let i = points.length - 1;
    while (i > 0 && last.t - points[i - 1].t < 110) i--;
    const p0 = points[Math.max(0, i - 1)];
    const dt = Math.max(16, last.t - p0.t);
    const speed = (Math.hypot(last.x - p0.x, last.y - p0.y) / dt) * 1000 / Math.min(w, h);   // screens per second
    const power = THREE.MathUtils.clamp((speed - 0.5) / 2.0, 0.12, 1);
    return match.previewShot({ x: gp.x, y: Math.max(0.12, gp.y) }, curve, power);
  }

  if (!lastGround) return null;
  // passes: measure the bend on the grass for accuracy
  const dx = lastGround.x - start.x, dz = lastGround.z - start.z, L = Math.hypot(dx, dz);
  if (L < 3) return null;
  let lateral = 0;
  for (const p of points) {
    const g = hit(camera, p, ground, w, h);
    if (!g) continue;
    const l = ((g.x - start.x) * (-dz) + (g.z - start.z) * dx) / L;
    if (Math.abs(l) > Math.abs(lateral)) lateral = l;
  }
  return match.previewPass({ x: lastGround.x, z: lastGround.z }, lateral / L);
}

// The inverse, for tests and the tutorial hand: a screen path that draws `action`.
export function gestureForAction(action, camera, w, h, durationMs = 350) {
  const pts = action.traj.samples(24).map(p => toScreen(camera, action.kind === 'shot' ? p : p.clone().setY(0), w, h));
  if (action.kind === 'shot') {
    const t = toScreen(camera, new THREE.Vector3(action.target.x, action.target.y, GOAL.z), w, h);
    pts[pts.length - 1] = { x: t.x, y: t.y };
  }
  const t0 = performance.now();
  return pts.map((p, i) => ({ x: p.x, y: p.y, t: t0 + (i / (pts.length - 1)) * durationMs }));
}
