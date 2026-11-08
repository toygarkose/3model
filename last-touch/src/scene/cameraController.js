import * as THREE from 'three';
import { GOAL } from '../game/config.js';

const GOAL_C = new THREE.Vector3(0, 0, GOAL.z);

// Broadcast-style camera with smooth transitions between modes:
// menu (orbit) · intro (fly-in) · decision (auto-framed) · follow · shot · celebrate · profile
export class CameraController {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'menu';
    this.pos = camera.position.clone();
    this.look = new THREE.Vector3(0, 0, -10);
    this.wantPos = this.pos.clone();
    this.wantLook = this.look.clone();
    this.k = 2.5;          // position smoothing
    this.kLook = 4;
    this.t = 0;
    this.shakeAmt = 0;
    this.fovMul = 1;
    this.wantFovMul = 1;
    this.probe = new THREE.PerspectiveCamera();
    this.offset = new THREE.Vector3(0, 9, 14);
  }

  shake(a) { this.shakeAmt = Math.min(1, this.shakeAmt + a); }

  setMode(mode, data = {}) {
    this.mode = mode;
    this.data = data;
    this.t = 0;
    if (mode === 'decision') { this.k = data.fast ? 3.5 : 2.2; this.kLook = 3.5; this.wantFovMul = 1; }
    if (mode === 'follow') { this.k = 3.2; this.kLook = 6; this.wantFovMul = 1; }
    if (mode === 'shot') { this.k = 2.6; this.kLook = 5; this.wantFovMul = 0.9; }
    if (mode === 'celebrate') { this.k = 1.6; this.kLook = 3; this.wantFovMul = 0.95; this.orbit = data.startAngle ?? 0; }
    if (mode === 'menu') { this.k = 1.2; this.kLook = 1.5; this.wantFovMul = 1; }
    if (mode === 'profile') { this.k = 3; this.kLook = 4; this.wantFovMul = 0.85; }
    if (mode === 'intro') { this.k = 1.6; this.kLook = 2.2; }
  }

  jump() { this.pos.copy(this.wantPos); this.look.copy(this.wantLook); }

  // Find the closest camera (behind the ball holder, facing goal) that keeps
  // every important point on screen.
  frameDecision(holderPos, points, aspect, fov, holderPt = null) {
    const toGoal = new THREE.Vector3(GOAL_C.x - holderPos.x, 0, GOAL_C.z - holderPos.z);
    const distGoal = toGoal.length();
    toGoal.normalize();
    const cam = this.probe;
    cam.fov = fov; cam.aspect = aspect; cam.near = 0.5; cam.far = 500;
    cam.updateProjectionMatrix();
    const test = new THREE.Vector3();
    const lookAhead = THREE.MathUtils.clamp(distGoal * 0.42, 6, 16);
    let result = null, best = null;
    // Prefer a view behind the player toward goal. If that would put the
    // camera in (or above) the stands, swing it round and slide it infield.
    for (const shift of [0, 0.4, 0.65]) for (const bias of [0.35, 0.7, 1.0]) {
      const base = holderPos.clone(); base.x *= 1 - shift;
      const fwd = toGoal.clone().lerp(new THREE.Vector3(0, 0, -1), bias).normalize();
      const look = base.clone().addScaledVector(fwd, lookAhead).setY(0.5);
      const place = (d) => {
        cam.position.copy(base).addScaledVector(fwd, -d * 0.9).setY(d * 0.42 + 2.2);
        cam.lookAt(look);
        cam.updateMatrixWorld(true);
      };
      const fits = (d) => {
        place(d);
        for (const p of points) {
          test.copy(p).project(cam);
          if (test.z > 1 || Math.abs(test.x) > 0.86 || test.y > 0.62 || test.y < -0.82) return false;
        }
        if (holderPt) { test.copy(holderPt).project(cam); if (test.y < -0.55) return false; }
        return true;
      };
      let lo = 7, hi = 70;
      if (!fits(hi)) lo = hi;
      for (let i = 0; i < 18 && hi - lo > 0.2; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
      place(Math.max(lo, hi));
      const p = cam.position;
      result = { pos: p.clone(), look };
      const inside = Math.abs(p.x) < 27 && Math.abs(p.z) < 57 && p.y < 21;
      if (inside) return result;
      if (!best || p.y < best.pos.y) best = result;
    }
    // last resort: the lowest candidate, kept inside the bowl
    best.pos.x = THREE.MathUtils.clamp(best.pos.x, -27, 27);
    best.pos.z = THREE.MathUtils.clamp(best.pos.z, -57, 57);
    return best;
  }

  update(dt, ctx = {}) {
    this.t += dt;
    const d = this.data || {};
    switch (this.mode) {
      case 'menu': {
        const a = this.t * 0.06 + 0.6;
        this.wantPos.set(Math.sin(a) * 58, 24 + Math.sin(this.t * 0.2) * 3, Math.cos(a) * 58 - 10);
        this.wantLook.set(0, 0, -16);
        break;
      }
      case 'intro':
      case 'decision':
        if (d.view) { this.wantPos.copy(d.view.pos); this.wantLook.copy(d.view.look); }
        break;
      case 'follow': {
        const b = ctx.ball;
        if (b) {
          const off = d.offset || this.offset;
          const target = b.clone().lerp(d.towards || b, 0.25).setY(Math.min(b.y, 3) * 0.6);
          this.wantLook.copy(target);
          this.wantPos.copy(target).add(off);
        }
        break;
      }
      case 'shot': {
        const b = ctx.ball;
        if (b) {
          const look = b.clone().lerp(new THREE.Vector3(0, 1.2, GOAL.z), 0.55);
          this.wantLook.copy(look);
          const dir = new THREE.Vector3(0 - d.from.x, 0, GOAL.z - d.from.z).normalize();
          const behind = d.from.clone().addScaledVector(dir, -6).setY(3.2);
          const close = new THREE.Vector3(b.x * 0.5, 2.6, Math.max(b.z + 9, GOAL.z + 10));
          this.wantPos.copy(behind).lerp(close, Math.min(1, this.t * 0.9));
        }
        break;
      }
      case 'celebrate': {
        const s = ctx.scorer;
        if (s) {
          this.orbit += dt * 0.35;
          this.wantLook.set(s.x, 1.1, s.z);
          this.wantPos.set(s.x + Math.sin(this.orbit) * 7.5, 2.6, s.z + Math.cos(this.orbit) * 7.5);
        }
        break;
      }
      case 'profile': {
        const p = d.at || new THREE.Vector3();
        const a = d.angle ?? 0;
        const shift = d.shift ?? 0;   // push the player to the left of the screen
        this.wantLook.set(p.x + Math.cos(a) * shift, 1.0, p.z - Math.sin(a) * shift);
        this.wantPos.set(p.x + Math.sin(a) * 3.6, 1.35, p.z + Math.cos(a) * 3.6);
        break;
      }
    }
    const kp = 1 - Math.exp(-dt * this.k), kl = 1 - Math.exp(-dt * this.kLook);
    this.pos.lerp(this.wantPos, kp);
    this.look.lerp(this.wantLook, kl);
    this.fovMul += (this.wantFovMul - this.fovMul) * (1 - Math.exp(-dt * 3));
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    const sh = this.shakeAmt * this.shakeAmt * 0.35;
    this.cam.position.set(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + (Math.random() - 0.5) * sh, this.pos.z + (Math.random() - 0.5) * sh);
    this.cam.lookAt(this.look);
  }
}
