import * as THREE from 'three';

// Procedural animation: each frame we compute a target pose from the
// player's speed and current action, then ease every joint toward it.
// Pose convention: "forward" positive for hips/shoulders; knees/elbows bend positive.

const clamp = THREE.MathUtils.clamp;
const ease = t => t * t * (3 - 2 * t);
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

function blankPose() {
  return {
    hipsY: 0.93, bodyY: 0, bodyRoll: 0, bodyPitch: 0, bodyX: 0,
    spine: 0.04, spineRoll: 0, spineYaw: 0, head: 0,
    lHip: 0, rHip: 0, lHipOut: 0, rHipOut: 0, lKnee: 0.12, rKnee: 0.12,
    lSh: 0, rSh: 0, lShOut: 0.12, rShOut: 0.12, lEl: 0.3, rEl: 0.3,
  };
}

export class PlayerAnimator {
  constructor(model) {
    this.m = model;
    this.phase = Math.random() * Math.PI * 2;
    this.t = Math.random() * 10;
    this.cur = blankPose();
    this.kickFoot = Math.random() < 0.8 ? 'r' : 'l';
  }

  update(dt, agent, opts = {}) {
    this.t += dt;
    const speed = Math.hypot(agent.vel.x, agent.vel.z);
    const p = blankPose();
    const a = clamp(speed / 7.5, 0, 1);
    const keeper = agent.role === 'keeper';

    // --- base: idle or run ---
    if (speed > 0.25) {
      this.phase += dt * speed * 1.65;
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      p.lHip = s * 0.8 * a; p.rHip = -s * 0.8 * a;
      p.lKnee = 0.2 + 1.25 * a * Math.max(0, -c); p.rKnee = 0.2 + 1.25 * a * Math.max(0, c);
      p.lSh = -s * 0.7 * a; p.rSh = s * 0.7 * a;
      p.lEl = p.rEl = 0.4 + 1.0 * a;
      p.spine = 0.06 + 0.2 * a;
      p.spineYaw = s * 0.12 * a;
      p.hipsY = 0.93 - 0.05 * a + 0.05 * a * Math.abs(c);
    } else if (keeper) {
      // ready stance
      const b = Math.sin(this.t * 3) * 0.01;
      p.hipsY = 0.8 + b; p.lKnee = p.rKnee = 0.55; p.lHip = p.rHip = 0.3; p.spine = 0.3;
      p.lHipOut = 0.12; p.rHipOut = 0.12;
      p.lSh = p.rSh = 0.45; p.lShOut = p.rShOut = 0.55; p.lEl = p.rEl = 0.8; p.head = -0.2;
    } else {
      const b = Math.sin(this.t * 2.1);
      p.hipsY = 0.92 + b * 0.006;
      p.lKnee = 0.16; p.rKnee = 0.1;
      p.lShOut = 0.16 + b * 0.02; p.rShOut = 0.16 - b * 0.02;
      p.spine = 0.05 + b * 0.01;
      p.spineRoll = Math.sin(this.t * 0.7) * 0.03;
    }

    // --- actions layered on top ---
    const t = agent.actionTime;
    const foot = this.kickFoot;
    const kick = (f) => {
      const F = f === 'r' ? 'r' : 'l', O = f === 'r' ? 'l' : 'r';
      if (t < 0) {
        const w = ease(clamp((t + 0.18) / 0.18, 0, 1));
        p[F + 'Hip'] = -0.85 * w; p[F + 'Knee'] = 1.5 * w; p[O + 'Knee'] = 0.3;
        p[O + 'ShOut'] = 0.25 + 0.7 * w; p[F + 'ShOut'] = 0.2 + 0.4 * w; p[F + 'Sh'] = 0.4 * w;
        p.spine = -0.08 * w; p.spineRoll = (f === 'r' ? 0.12 : -0.12) * w; p.hipsY -= 0.03 * w;
      } else if (t < 0.12) {
        const s = ease(t / 0.12);
        p[F + 'Hip'] = -0.85 + 2.05 * s; p[F + 'Knee'] = 1.5 - 1.4 * s; p[O + 'Knee'] = 0.3;
        p[O + 'ShOut'] = 0.95; p[F + 'Sh'] = 0.4 - 0.9 * s;
        p.spine = -0.08 - 0.06 * s; p.hipsY -= 0.03;
      } else if (t < 0.5) {
        const f2 = ease((t - 0.12) / 0.38);
        p[F + 'Hip'] = 1.2 * (1 - f2); p[F + 'Knee'] = 0.1 + 0.2 * f2; p[O + 'ShOut'] = 0.95 - 0.7 * f2;
        p.spine = -0.14 * (1 - f2);
      }
    };

    switch (agent.action) {
      case 'kick':
        if (t < 0.55) kick(foot); else agent.action = null;
        break;
      case 'header': {
        if (t > 0.7) { agent.action = null; break; }
        const j = bump(t, -0.2, 0.45);
        p.bodyY = 0.38 * j;
        p.lKnee = p.rKnee = 0.4 + 0.6 * j;
        p.lShOut = p.rShOut = 0.5 + 0.6 * j; p.lSh = p.rSh = 0.5;
        p.head = t < 0 ? -0.4 : 0.6 * bump(t, -0.02, 0.25);
        p.spine = t < 0 ? -0.2 : 0.3 * bump(t, -0.02, 0.3);
        break;
      }
      case 'receive': {
        if (t > 0.45) { agent.action = null; break; }
        const b = bump(t, 0, 0.42);
        p[foot + 'Hip'] += 0.55 * b; p[foot + 'Knee'] += 0.7 * b;
        p.spine += 0.12 * b; p.hipsY -= 0.05 * b;
        p.lShOut += 0.3 * b; p.rShOut += 0.3 * b;
        break;
      }
      case 'jump': {
        if (t > 0.8) { agent.action = null; break; }
        const j = bump(t, 0.05, 0.6);
        p.bodyY = 0.42 * j; p.lKnee = p.rKnee = 0.2 + 0.5 * j;
        p.lSh = p.rSh = 0.2; p.lEl = p.rEl = 1.6; p.head = -0.15 * j;
        break;
      }
      case 'celebrate': {
        if (speed > 1.2) {
          // aeroplane run
          p.lShOut = p.rShOut = 1.45; p.lSh = p.rSh = 0.1; p.lEl = p.rEl = 0.1;
          p.spineRoll = Math.sin(this.t * 3) * 0.18; p.spine = 0.12;
        } else {
          const k = this.t * 5;
          p.bodyY = 0.28 * Math.abs(Math.sin(k));
          p.rSh = 2.9; p.rShOut = 0.2; p.rEl = 0.3 + 0.4 * Math.abs(Math.sin(k));
          p.lSh = 2.5 * (t > 2.5 ? 1 : 0.2); p.lShOut = 0.3; p.lEl = 0.4;
          p.lKnee = p.rKnee = 0.3 + 0.4 * Math.abs(Math.sin(k));
          p.head = -0.25;
        }
        break;
      }
      case 'dive': {
        const d = agent.extra.dive || 0, hy = agent.extra.diveY ?? 1.2;
        const side = Math.sign(d) || 1;
        const k = clamp(Math.abs(d) / 1.8, 0, 1);
        const air = t < 0.9;
        const roll = air ? k * 1.25 : Math.max(k, 0.4) * 1.45;
        p.bodyRoll = -side * roll;
        p.bodyX = side * k * 0.35;
        p.bodyY = air ? Math.max(0, hy - 1.5) * 0.7 + k * 0.25 : -0.55 * Math.min(1, (t - 0.9) * 4) * k;
        p.lSh = p.rSh = 2.6 + (hy < 0.8 ? -1.6 : 0); p.lShOut = p.rShOut = 0.25;
        p.lEl = p.rEl = 0.15;
        p.lKnee = p.rKnee = 0.3; p.lHip = 0.2; p.rHip = -0.1;
        p.lHipOut = side > 0 ? 0.3 : 0.05; p.rHipOut = side < 0 ? 0.3 : 0.05;
        p.spine = 0.05;
        break;
      }
      default: break;
    }

    if (opts.dejected) { p.head = 0.45; p.spine = 0.25; p.lSh = p.rSh = -0.05; }

    // --- ease toward target and apply ---
    const k = 1 - Math.exp(-dt * (agent.action === 'kick' || agent.action === 'dive' ? 30 : 16));
    const c = this.cur;
    for (const key in p) c[key] += (p[key] - c[key]) * k;
    this._apply(c);
  }

  _apply(c) {
    const j = this.m.j, b = this.m.body;
    b.position.set(c.bodyX, c.bodyY, 0);
    b.rotation.set(c.bodyPitch, 0, c.bodyRoll);
    j.hips.position.y = c.hipsY;
    j.spine.rotation.set(c.spine, c.spineYaw, c.spineRoll);
    j.head.rotation.x = c.head;
    j.lHip.rotation.set(-c.lHip, 0, c.lHipOut * 0.5);
    j.rHip.rotation.set(-c.rHip, 0, -c.rHipOut * 0.5);
    j.lKnee.rotation.x = c.lKnee;
    j.rKnee.rotation.x = c.rKnee;
    j.lSh.rotation.set(-c.lSh, 0, c.lShOut);
    j.rSh.rotation.set(-c.rSh, 0, -c.rShOut);
    j.lEl.rotation.x = -c.lEl;
    j.rEl.rotation.x = -c.rEl;
  }
}
