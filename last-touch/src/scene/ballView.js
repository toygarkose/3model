import * as THREE from 'three';
import { BALL_R } from '../game/config.js';
import { ballTexture, blobShadowTexture } from './textures.js';

export class BallView {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 24, 16),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45, metalness: 0.0 }));
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    // fading trail for fast balls
    this.trailN = 26;
    this.trailPts = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 2 * 3), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(this.trailN * 2), 1));
    const idx = [];
    for (let i = 0; i < this.trailN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.trail = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(0xffd27a) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color, vA * 0.7); }',
    }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.trailOn = false;
    this.q = new THREE.Quaternion();
    this.prev = new THREE.Vector3();
  }

  setTrail(on) { this.trailOn = on; if (!on) this.trailPts = []; }

  update(dt, ball, camera) {
    const p = ball.pos;
    // rolling rotation from horizontal movement
    const dx = p.x - this.prev.x, dz = p.z - this.prev.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-5 && dist < 3) {
      const axis = new THREE.Vector3(dz, 0, -dx).normalize();
      this.q.setFromAxisAngle(axis, dist / BALL_R);
      this.mesh.quaternion.premultiply(this.q);
    }
    this.prev.copy(p);
    this.mesh.position.copy(p);
    const h = Math.max(0, p.y - BALL_R);
    const s = 0.45 + h * 0.12;
    this.shadow.scale.set(s, s, 1);
    this.shadow.position.set(p.x, 0.015, p.z);
    this.shadow.material.opacity = Math.max(0.15, 0.85 - h * 0.12);

    // trail ribbon facing the camera
    const speed = ball.vel.length();
    if (this.trailOn && speed > 6) this.trailPts.unshift(p.clone());
    else if (this.trailPts.length) this.trailPts.pop();
    if (this.trailPts.length > this.trailN) this.trailPts.length = this.trailN;
    const pos = this.trail.geometry.attributes.position, al = this.trail.geometry.attributes.alpha;
    const n = this.trailPts.length;
    const toCam = new THREE.Vector3();
    for (let i = 0; i < this.trailN; i++) {
      const a = this.trailPts[Math.min(i, n - 1)] || p;
      const b = this.trailPts[Math.min(i + 1, n - 1)] || a;
      const dir = new THREE.Vector3().subVectors(a, b);
      toCam.subVectors(camera.position, a);
      const side = new THREE.Vector3().crossVectors(dir, toCam).normalize().multiplyScalar(BALL_R * 0.9 * (1 - i / this.trailN));
      pos.setXYZ(i * 2, a.x + side.x, a.y + side.y, a.z + side.z);
      pos.setXYZ(i * 2 + 1, a.x - side.x, a.y - side.y, a.z - side.z);
      const f = i < n ? (1 - i / this.trailN) : 0;
      al.setX(i * 2, f); al.setX(i * 2 + 1, f);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
  }
}
