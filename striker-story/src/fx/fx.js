// Juice: particles, shockwaves, floating text, screen shake, flashes, slow-motion.
export class FX {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.pops = [];
    this.trauma = 0;
    this.flash = { r: 255, g: 255, b: 255, a: 0 };
    this.edge = 0;           // coloured vignette pulse (close calls)
    this.edgeColor = '94,232,255';
    this.slow = 0;           // seconds of slow motion remaining (real time)
    this.slowScale = 1;
    this.punch = 0;          // camera zoom punch
  }

  burst(x, y, { n = 30, speed = 300, life = 0.8, color = '255,200,120', size = 3, drag = 2.2, spread = Math.PI * 2, dir = 0, glow = true } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread, v = speed * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.4), max: life, color, size: size * (0.6 + Math.random() * 0.8), drag, glow });
    }
  }

  ring(x, y, { max = 200, dur = 0.6, color = '255,255,255', width = 5 } = {}) { this.rings.push({ x, y, max, dur, t: 0, color, width }); }

  pop(text, x, y, { color = '#ffffff', size = 30, sub = '', world = true, dur = 1.3 } = {}) {
    this.pops.push({ text, sub, x, y, color, size, t: 0, dur, world });
  }

  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  doFlash(r, g, b, a) { this.flash = { r, g, b, a }; }
  slowMo(sec, scale = 0.3) { this.slow = Math.max(this.slow, sec); this.slowScale = scale; }

  timeScale() { return this.slow > 0 ? this.slowScale : 1; }

  update(dt, sdt) {
    if (this.slow > 0) this.slow -= dt;
    this.trauma = Math.max(0, this.trauma - dt * 2.0);
    this.flash.a = Math.max(0, this.flash.a - dt * 1.6);
    this.edge = Math.max(0, this.edge - dt * 1.8);
    this.punch *= Math.exp(-dt * 5);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= sdt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * sdt);
      p.vx *= k; p.vy *= k; p.x += p.vx * sdt; p.y += p.vy * sdt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].t += sdt; if (this.rings[i].t > this.rings[i].dur) this.rings.splice(i, 1); }
    for (let i = this.pops.length - 1; i >= 0; i--) { this.pops[i].t += dt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
  }

  clear() { this.parts = []; this.rings = []; this.pops = []; this.slow = 0; this.trauma = 0; this.edge = 0; }
}
