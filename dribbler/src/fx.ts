import * as THREE from 'three';

const N = 260;
export class Particles {
  points: THREE.Points;
  private pos = new Float32Array(N * 3); private col = new Float32Array(N * 3);
  private vel = new Float32Array(N * 3); private life = new Float32Array(N); private max = new Float32Array(N);
  private base = new Float32Array(N * 3); private grav = new Float32Array(N); private i = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.24, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.points.frustumCulled = false;
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -50;
  }
  emit(p: THREE.Vector3, color: number, count: number, speed: number, up = 1, life = 0.6, gravity = 9) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % N, a = Math.random() * 6.283, r = speed * (0.4 + Math.random() * 0.6);
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([Math.cos(a) * r, (0.3 + Math.random()) * speed * up, Math.sin(a) * r], i * 3);
      this.base.set([c.r, c.g, c.b], i * 3);
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6); this.grav[i] = gravity;
    }
  }
  /** scroll: dünyanın bu karede kameraya doğru aktığı mesafe */
  update(dt: number, scroll: number) {
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 1] = -50; continue; }
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] = Math.max(0.03, this.pos[j + 1] + this.vel[j + 1] * dt); this.pos[j + 2] += this.vel[j + 2] * dt + scroll;
      const f = this.life[i] / this.max[i];
      this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }
}

const hintCache: Record<string, THREE.SpriteMaterial> = {};
/** Savunmacının üstünde gösterilen "şu yöne kaydır" oku. */
export function hintMaterial(kind: 'l' | 'r' | 'lr' | 'u' | 'd'): THREE.SpriteMaterial {
  if (hintCache[kind]) return hintCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(13,18,51,.88)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
  g.strokeStyle = '#ffd23f'; g.lineWidth = 6; g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 13; g.lineCap = 'round'; g.lineJoin = 'round';
  const arrow = (ang: number, off = 0) => { g.save(); g.translate(64, 64); g.rotate(ang); g.translate(off, 0); g.beginPath(); g.moveTo(-26, 0); g.lineTo(24, 0); g.moveTo(4, -22); g.lineTo(26, 0); g.lineTo(4, 22); g.stroke(); g.restore(); };
  if (kind === 'r') arrow(0); else if (kind === 'l') arrow(Math.PI); else if (kind === 'u') arrow(-Math.PI / 2); else if (kind === 'd') arrow(Math.PI / 2);
  else { g.lineWidth = 11; g.beginPath(); g.moveTo(-34 + 64, 64); g.lineTo(34 + 64, 64); g.moveTo(78, 44); g.lineTo(100, 64); g.lineTo(78, 84); g.moveTo(50, 44); g.lineTo(28, 64); g.lineTo(50, 84); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return hintCache[kind] = new THREE.SpriteMaterial({ map: t, depthTest: false, fog: false, transparent: true });
}
