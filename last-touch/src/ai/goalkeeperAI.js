import * as THREE from 'three';
import { PLAY, GOAL } from '../game/config.js';

// The keeper narrows the angle while play is set up, then reads the shot.
// He extrapolates the ball's CURRENT direction, so a curling shot fools him
// until late — that is what makes bending it into the corner rewarding.
export class GoalkeeperAI {
  constructor(agent, skill = 1) {
    this.a = agent;
    this.skill = skill;
    this.reset();
  }

  reset() {
    this.mode = 'set';
    this.reactLeft = 0;
    this.hx = this.a.pos.x;       // hands centre (x, y)
    this.hy = 1.2;
    this.done = false;
    this.a.extra.dive = 0;
    this.a.extra.diveY = 0;
  }

  // Ideal set position for a ball at `b`.
  setPosition(b) {
    const gx = 0, gz = GOAL.z;
    const dx = b.x - gx, dz = b.z - gz;
    const d = Math.hypot(dx, dz) || 1;
    const out = THREE.MathUtils.clamp(0.6 + d * 0.08, 0.6, 3.0);
    const x = THREE.MathUtils.clamp(gx + (dx / d) * out, -GOAL.halfWidth + 0.5, GOAL.halfWidth - 0.5);
    return new THREE.Vector3(x, 0, gz + (dz / d) * out);
  }

  // Called when a pass is played: drift to the new angle.
  onPass(endPoint) {
    this.mode = 'set';
    const t = this.setPosition(endPoint);
    this.a.setRun(t, null, 3.5);
    this.a.look = new THREE.Vector3(endPoint.x, 0, endPoint.z);
  }

  onShot() {
    this.mode = 'react';
    this.reactLeft = PLAY.keeperReaction / this.skill;
    this.startX = this.a.pos.x;
    this.hz0 = this.a.pos.z;
    this.hz = this.a.pos.z;
    this.hx = this.a.pos.x;
    this.hy = 1.1;
    this.a.setRun(null);
    this.done = false;
  }

  /** @returns {'save'|null} */
  update(dt, ball, shotActive) {
    const a = this.a;
    if ((this.mode !== 'react' && this.mode !== 'dive') || !shotActive || this.done) return null;
    if (this.reactLeft > 0) { this.reactLeft -= dt; return null; }
    if (this.mode === 'react') {
      this.mode = 'dive'; a.action = 'dive'; a.actionTime = 0;
      this.hz = a.pos.z;
    }

    // Read the ball's CURRENT direction: closest point of that line to me.
    const v = ball.vel, p = ball.pos;
    const vxz = v.x * v.x + v.z * v.z;
    let t = 0;
    if (vxz > 1) t = Math.max(0, ((this.startX - p.x) * v.x + (this.hz0 - p.z) * v.z) / vxz);
    let tx = p.x + v.x * t, tz = p.z + v.z * t, ty = p.y + v.y * t;
    // never chase beyond the line or outside the posts
    if (tz < GOAL.z + 0.15 && v.z < -0.5) {
      const tl = (p.z - (GOAL.z + 0.15)) / -v.z;
      tx = p.x + v.x * tl; tz = GOAL.z + 0.15; ty = p.y + v.y * tl;
    }
    tx = THREE.MathUtils.clamp(tx, -GOAL.halfWidth - 0.5, GOAL.halfWidth + 0.5);
    const sp = PLAY.keeperSpeed * this.skill;
    const dx = tx - this.hx, dz = tz - this.hz, d = Math.hypot(dx, dz);
    if (d > 1e-4) { const k = Math.min(1, (sp * dt) / d); this.hx += dx * k; this.hz += dz * k; }
    const tyc = THREE.MathUtils.clamp(ty, 0.35, PLAY.keeperJump);
    this.hy += THREE.MathUtils.clamp(tyc - this.hy, -PLAY.keeperRise * dt, PLAY.keeperRise * dt);
    a.pos.x = this.hx * 0.8 + this.startX * 0.2;
    a.pos.z = this.hz;
    a.extra.dive = this.hx - this.startX;
    a.extra.diveY = this.hy;

    // contact?
    const reach = PLAY.keeperReach * (0.85 + 0.15 * this.skill);
    const hd = Math.hypot(p.x - this.hx, p.y - this.hy, p.z - this.hz);
    const body = Math.hypot(p.x - a.pos.x, p.z - a.pos.z) < 0.45 && p.y < this.hy + 0.25;
    if (hd < reach || body) { this.done = true; return 'save'; }
    if (p.z < GOAL.z) this.done = true;
    return null;
  }
}
