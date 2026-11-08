import * as THREE from 'three';
import { PLAY } from './config.js';

// Shared movement for every footballer (teammates, opponents, keeper).
// A player either holds position or runs to `target`, optionally timed to
// arrive at `arriveAt` (match time) so runs meet the ball naturally.
export class Agent {
  constructor(def, side) {
    this.id = def.id;
    this.name = def.name || '';
    this.number = def.number ?? 0;
    this.side = side;                         // 'home' | 'away'
    this.role = def.role || (def.type === 'wall' ? 'wall' : 'player');
    this.hero = !!def.hero;
    this.pos = new THREE.Vector3(def.pos[0], 0, def.pos[1]);
    this.vel = new THREE.Vector3();
    this.target = null;
    this.arriveAt = null;
    this.maxSpeed = def.speed ?? (side === 'home' ? PLAY.runSpeed : PLAY.defSpeed);
    this.reaction = def.reaction ?? PLAY.defReaction;
    this.runs = def.runs || [];
    this.mark = def.mark || null;
    this.look = null;                         // point to face when idle
    this.facing = side === 'home' ? Math.PI : 0; // yaw; PI = facing -z
    this.action = null;                       // animation hint: 'kick','receive','celebrate','dive','jump','header'
    this.actionTime = 0;
    this.extra = {};                          // keeper dive data etc.
  }

  setRun(target, arriveAt = null, speed = null) {
    this.target = target ? new THREE.Vector3(target.x, 0, target.z) : null;
    this.arriveAt = arriveAt;
    this.runSpeed = speed;
  }

  // Straight-line prediction used by the pass assistant.
  predict(target, t, speed) {
    if (!target) return this.pos.clone();
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return this.pos.clone();
    const s = Math.min(d, speed * Math.max(0, t - 0.1));
    return new THREE.Vector3(this.pos.x + (dx / d) * s, 0, this.pos.z + (dz / d) * s);
  }
}

export function moveAgent(a, dt, now) {
  const desired = new THREE.Vector3();
  if (a.target) {
    const dx = a.target.x - a.pos.x, dz = a.target.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      let speed = a.runSpeed ?? a.maxSpeed;
      if (a.arriveAt != null) {
        const rem = a.arriveAt - now;
        speed = rem > 0.05 ? Math.min(a.maxSpeed, d / rem) : a.maxSpeed;
      }
      speed = Math.min(speed, d / Math.max(dt, 1e-4));
      desired.set((dx / d) * speed, 0, (dz / d) * speed);
    } else {
      a.target = null;
    }
  }
  const k = Math.min(1, PLAY.accel * dt / Math.max(0.5, a.vel.distanceTo(desired)));
  a.vel.lerp(desired, k);
  a.pos.addScaledVector(a.vel, dt);
  const sp = Math.hypot(a.vel.x, a.vel.z);
  let face = null;
  if (sp > 0.6) face = Math.atan2(a.vel.x, a.vel.z);
  else if (a.look) face = Math.atan2(a.look.x - a.pos.x, a.look.z - a.pos.z);
  if (face != null) {
    let d = face - a.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    a.facing += d * Math.min(1, dt * 10);
  }
  if (a.action) a.actionTime += dt;
}

export function speedOf(a) {
  return Math.hypot(a.vel.x, a.vel.z);
}
