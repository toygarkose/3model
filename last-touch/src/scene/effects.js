import * as THREE from 'three';
import { GOAL } from '../game/config.js';
import { ringTexture } from './textures.js';

const ringTex = ringTexture();

// Glowing ring decal under players (holder, teammates, receiver target).
export function makeRing(color, size = 1.4) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: ringTex, color, transparent: true, depthWrite: false, opacity: 0.9, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(size, size, 1);
  m.renderOrder = 2;
  return m;
}

// Dotted 3D preview of the interpreted pass / shot.
export class PreviewPath {
  constructor(scene) {
    this.n = 56;
    const geo = new THREE.SphereGeometry(0.07, 8, 6);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false });
    this.dots = new THREE.InstancedMesh(geo, this.mat, this.n);
    this.dots.renderOrder = 5;
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    scene.add(this.dots);
    this.target = makeRing(0x3ee0a0, 2.2);
    this.target.visible = false;
    scene.add(this.target);
    // shot reticle on the goal plane
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    this.reticle.renderOrder = 6;
    this.reticle.visible = false;
    scene.add(this.reticle);
    this.m4 = new THREE.Matrix4();
    this.time = 0;
  }

  show(action) {
    if (!action) { this.hide(); return; }
    const pts = action.traj.samples(this.n - 1);
    this.dots.count = pts.length;
    pts.forEach((p, i) => {
      const s = 0.6 + 0.8 * (1 - i / pts.length);
      this.m4.makeScale(s, s, s).setPosition(p.x, Math.max(p.y, 0.08), p.z);
      this.dots.setMatrixAt(i, this.m4);
    });
    this.dots.instanceMatrix.needsUpdate = true;
    const shot = action.kind === 'shot';
    this.mat.color.set(shot ? 0xffd27a : action.receiver ? 0xffffff : 0xff6a5a);
    this.target.visible = !shot;
    if (!shot) {
      const e = action.traj.end;
      this.target.position.set(e.x, 0.03, e.z);
      this.target.material.color.set(action.receiver ? (action.perfect ? 0x3ee0a0 : 0xffffff) : 0xff4a3a);
    }
    this.reticle.visible = shot;
    if (shot) {
      this.reticle.position.set(action.target.x, action.target.y, GOAL.z + 0.02);
      this.reticle.material.color.setHSL(0.11 - action.power * 0.11, 1, 0.55);
      const sc = 0.9 + action.power * 0.5;
      this.reticle.scale.set(sc, sc, 1);
    }
  }

  hide() { this.dots.count = 0; this.target.visible = false; this.reticle.visible = false; }

  update(dt) {
    this.time += dt;
    const s = 2.0 + Math.sin(this.time * 6) * 0.2;
    this.target.scale.set(s, s, 1);
  }
}

// Faint arrows on the grass showing where teammates will run next.
export class RunArrows {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.45, depthWrite: false });
    this.dash = new THREE.PlaneGeometry(0.22, 0.7);
    this.head = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.55, 0), new THREE.Vector2(0.55, 0), new THREE.Vector2(0, 1.1)]));
    this.time = 0;
  }

  set(runs) {
    this.group.clear();
    for (const [from, to] of runs) {
      const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz);
      if (L < 1) continue;
      const ang = Math.atan2(dx, dz);
      for (let s = 1.2; s < L - 1.2; s += 1.4) {
        const m = new THREE.Mesh(this.dash, this.mat);
        m.rotation.set(-Math.PI / 2, 0, ang);
        m.position.set(from.x + (dx / L) * s, 0.025, from.z + (dz / L) * s);
        this.group.add(m);
      }
      const h = new THREE.Mesh(this.head, this.mat);
      // shape points along +y; Rz(ang+PI) then laying flat points it along the run
      h.rotation.set(-Math.PI / 2, 0, ang + Math.PI);
      h.position.set(to.x - (dx / L) * 1.0, 0.026, to.z - (dz / L) * 1.0);
      this.group.add(h);
    }
  }

  clear() { this.group.clear(); }

  update(dt) {
    this.time += dt;
    this.mat.opacity = 0.32 + Math.sin(this.time * 4) * 0.12;
  }
}

// Confetti + sparks for goals, dust puffs for kicks.
export class Particles {
  constructor(scene) {
    this.max = 420;
    const geo = new THREE.PlaneGeometry(0.16, 0.09);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }), this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.ps = [];
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.c = new THREE.Color();
    // colour attribute initialised once
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, this.c.set(0xffffff));
  }

  confetti(at, n = 260, colors = [0xffb020, 0x0f6e78, 0xffffff, 0x3ee0a0]) {
    for (let i = 0; i < n && this.ps.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2, up = 6 + Math.random() * 9;
      this.ps.push({
        p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 2, (Math.random() - 0.5) * 3)),
        v: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 5), up, Math.sin(a) * (2 + Math.random() * 5)),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        life: 3 + Math.random() * 2, drag: 1.6, g: 6, color: colors[(Math.random() * colors.length) | 0], s: 1,
      });
    }
  }

  dust(at, n = 10) {
    for (let i = 0; i < n && this.ps.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      this.ps.push({
        p: at.clone().setY(0.05), v: new THREE.Vector3(Math.cos(a) * 1.5, 1 + Math.random() * 1.5, Math.sin(a) * 1.5),
        r: new THREE.Vector3(Math.random() * 3, Math.random() * 3, 0), life: 0.5, drag: 3, g: 4,
        color: Math.random() < 0.5 ? 0x6fb35a : 0xd9e8c8, s: 0.6,
      });
    }
  }

  update(dt) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0 || q.p.y < -0.5) { ps.splice(i, 1); continue; }
      q.v.y -= q.g * dt;
      q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.02) { q.p.y = 0.02; q.v.set(0, 0, 0); }
    }
    this.mesh.count = ps.length;
    ps.forEach((q, i) => {
      this.e.set(q.r.x * q.life, q.r.y * q.life, q.r.z * q.life);
      this.q.setFromEuler(this.e);
      const s = q.s * Math.min(1, q.life * 2);
      this.m4.compose(q.p, this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(i, this.m4);
      this.mesh.setColorAt(i, this.c.set(q.color));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
