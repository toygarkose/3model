// 2D overlay: everything that is not a shaded sphere (ship, trails, rings,
// shards, portal, aim gizmo, particles, floating text, screen flashes).
import { OUT } from '../core/physics.js';
import { BODIES } from '../data/bodies.js';
import { PALETTE } from './gl.js';

const TAU = Math.PI * 2;
const DISPLAY = '"Syncopate", "Arial Black", sans-serif';
const BODY = '"Sora", system-ui, sans-serif';

export class Draw2D {
  constructor(canvas, gl) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.gl = gl;
    this.ringCache = new Map();
  }

  resize(w, h, dpr) {
    this.dpr = dpr; this.W = w; this.H = h;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.ringCache.clear();
  }

  render(game) {
    const g = this.ctx, d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!game.world) { this.gl.render([], game.time, { x: 0, y: 0 }); return; }
    const S = game.scale, T = game.time;
    const P = (x, y) => game.toScreen(x, y);
    const w = game.world;

    // shaded bodies on the WebGL layer
    const list = w.bodies.map((b, i) => { const [sx, sy] = P(b.x, b.y); return { key: b.key, kind: b.kind, sx, sy, sr: b.r * S, seed: game.seeds[i] }; });
    this.gl.render(list, T, { x: game.cam.x * S, y: game.cam.y * S });

    g.setTransform(d, 0, 0, d, 0, 0);
    // gravity-well pulses + orbit paths
    w.bodies.forEach((b, i) => {
      const [sx, sy] = P(b.x, b.y);
      if (b.kind === 'planet') {
        const pal = PALETTE[b.key] || PALETTE.rock, c = pal.atmo.map(v => Math.round(v * 255)).join(',');
        const strength = Math.min(1.4, Math.sqrt(BODIES[b.key].g / 9.81));
        for (let k = 0; k < 3; k++) {
          const t = ((T * 0.13 + k / 3) % 1);
          g.strokeStyle = `rgba(${c},${(1 - t) * 0.09 * strength})`;
          g.lineWidth = 1.4;
          g.beginPath(); g.arc(sx, sy, b.r * S * (1.25 + t * (1.5 + strength)), 0, TAU); g.stroke();
        }
      }
      if (b.kind === 'blackhole') {
        // infalling dust spiral
        for (let k = 0; k < 18; k++) {
          const a = T * (0.6 + k * 0.05) + k * 1.7, r = b.r * S * (3 + ((k * 0.37 + T * 0.2) % 1) * 9);
          g.fillStyle = `rgba(255,190,140,${0.25 * (1 - r / (b.r * S * 12))})`;
          g.beginPath(); g.arc(sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.9, 1.4, 0, TAU); g.fill();
        }
      }
      if (b.orbit && game.state === 'aim') {
        const o = b.orbit;
        let cx = o.cx ?? 0, cy = o.cy ?? 0;
        if (o.around != null && o.around >= 0) { cx = w.bodies[o.around].x; cy = w.bodies[o.around].y; }
        const [ox, oy] = P(cx, cy);
        g.setLineDash([3, 7]);
        g.strokeStyle = 'rgba(180,210,255,0.22)'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(ox, oy, o.R * S, 0, TAU); g.stroke();
        g.setLineDash([]);
        // direction chevron just ahead of the moon
        const a = o.phase + Math.sign(o.w) * 0.35;
        const hx = ox + Math.cos(a) * o.R * S, hy = oy + Math.sin(a) * o.R * S;
        const dir = a + Math.sign(o.w) * Math.PI / 2;
        g.fillStyle = 'rgba(180,210,255,0.55)';
        g.beginPath();
        g.moveTo(hx + Math.cos(dir) * 7, hy + Math.sin(dir) * 7);
        g.lineTo(hx + Math.cos(dir + 2.5) * 6, hy + Math.sin(dir + 2.5) * 6);
        g.lineTo(hx + Math.cos(dir - 2.5) * 6, hy + Math.sin(dir - 2.5) * 6);
        g.fill();
      }
    });

    for (const r of w.rings) this._ring(g, r, w.bodies[r.body], P, S, T);

    // ghost trails of previous attempts
    game.ghosts.forEach((gh, i) => {
      if (gh.pts.length < 2) return;
      g.strokeStyle = `rgba(255,255,255,${0.16 - i * 0.04})`;
      g.lineWidth = 1.6; g.setLineDash([2, 5]);
      g.beginPath();
      gh.pts.forEach((p, k) => { const [x, y] = P(p[0], p[1]); k ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); g.setLineDash([]);
      const [ex, ey] = P(gh.end[0], gh.end[1]);
      g.strokeStyle = `rgba(255,120,100,${0.4 - i * 0.1})`; g.lineWidth = 2;
      if (gh.out !== OUT.TARGET) { g.beginPath(); g.moveTo(ex - 5, ey - 5); g.lineTo(ex + 5, ey + 5); g.moveTo(ex - 5, ey + 5); g.lineTo(ex + 5, ey - 5); g.stroke(); }
    });

    if (game.state !== 'idle') {
      this._target(g, game, P, S, T);
      this._shards(g, game, P, S, T);
    }
    this._trail(g, game, P, S);
    this._aim(g, game, P, S, T);
    this._ship(g, game, P, S, T);
    this._fx(g, game, P, S);
  }

  _ring(g, r, b, P, S, T) {
    const [sx, sy] = P(b.x, b.y);
    const key = `${b.key}:${(S * 100) | 0}`;
    let c = this.ringCache.get(key);
    const outer = r.outer * S, size = Math.ceil(outer * 2 + 8);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = Math.ceil(size * this.dpr);
      const x = c.getContext('2d');
      x.scale(this.dpr, this.dpr);
      const m = size / 2;
      for (let rad = r.inner * S; rad < outer; rad += 0.8) {
        const k = rad / S;
        if (k > r.gap[0] && k < r.gap[1]) continue;
        const f = (k - r.inner) / (r.outer - r.inner);
        const band = 0.55 + 0.45 * Math.sin(f * 60) * Math.sin(f * 17 + 1);
        const a = (0.18 + 0.5 * band) * (f < 0.15 ? f / 0.15 : 1) * (f > 0.92 ? (1 - f) / 0.08 : 1);
        x.strokeStyle = `rgba(${220 + band * 25 | 0},${200 + band * 20 | 0},${160 + band * 40 | 0},${a})`;
        x.lineWidth = 1;
        x.beginPath(); x.arc(m, m, rad, 0, TAU); x.stroke();
      }
      this.ringCache.set(key, c);
    }
    g.save();
    g.translate(sx, sy); g.rotate(T * 0.02);
    g.drawImage(c, -size / 2, -size / 2, size, size);
    g.restore();
  }

  _target(g, game, P, S, T) {
    const tg = game.world.target, [x, y] = P(tg.x, tg.y), r = tg.r * S;
    const pulse = 0.5 + 0.5 * Math.sin(T * 3);
    const grd = g.createRadialGradient(x, y, 0, x, y, r * 1.6);
    grd.addColorStop(0, 'rgba(125,255,178,0.35)'); grd.addColorStop(1, 'rgba(125,255,178,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 1.6, 0, TAU); g.fill();
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(125,255,178,0.85)';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    for (let k = 0; k < 3; k++) {
      const a0 = T * (1.2 - k * 0.3) * (k % 2 ? -1 : 1) + k;
      g.strokeStyle = `rgba(255,255,255,${0.5 - k * 0.12})`; g.lineWidth = 2;
      for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(x, y, r * (0.75 - k * 0.18), a0 + j * TAU / 3, a0 + j * TAU / 3 + 1.1); g.stroke(); }
    }
    g.fillStyle = `rgba(255,255,255,${0.7 + pulse * 0.3})`;
    g.beginPath(); g.arc(x, y, 3 + pulse * 2, 0, TAU); g.fill();
    const t = (T * 0.7) % 1;
    g.strokeStyle = `rgba(125,255,178,${(1 - t) * 0.45})`; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, r * (1 + t), 0, TAU); g.stroke();
  }

  _shards(g, game, P, S, T) {
    const got = game.flight ? game.flight.got : 0;
    game.world.shards.forEach((s, i) => {
      if (got & (1 << i)) return;
      const [x, y] = P(s.x, s.y + Math.sin(T * 2 + i) * 4);
      const r = 11 + Math.sin(T * 4 + i) * 1.2;
      const grd = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
      grd.addColorStop(0, 'rgba(255,214,110,0.5)'); grd.addColorStop(1, 'rgba(255,214,110,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 2.6, 0, TAU); g.fill();
      g.save(); g.translate(x, y); g.rotate(T * 0.8 + i);
      g.fillStyle = '#ffd166';
      g.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, rr = k % 2 ? r * 0.38 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill();
      g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(0, 0, r * 0.28, 0, TAU); g.fill();
      g.restore();
    });
  }

  _trail(g, game, P, S) {
    const pts = game.trail, n = pts.length;
    if (n < 2) return;
    g.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const f = i / (n - 1);
      const [x0, y0] = P(pts[i - 1][0], pts[i - 1][1]), [x1, y1] = P(pts[i][0], pts[i][1]);
      g.strokeStyle = `rgba(94,232,255,${f * f * 0.75})`; g.lineWidth = 2 + f * 4;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5;
    g.beginPath();
    for (let i = Math.max(0, n - 25); i < n; i++) { const [x, y] = P(pts[i][0], pts[i][1]); i === Math.max(0, n - 25) ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  }

  _aim(g, game, P, S, T) {
    const a = game.aim;
    if (!a || game.state !== 'aim') return;
    const st = game.world.start, [sx, sy] = P(st.x, st.y);
    const maxPx = game.dragMax();
    const dx = a.x - a.sx, dy = a.y - a.sy, L = Math.hypot(dx, dy), p = a.power;
    const col = `rgba(${94 + p * 161 | 0},${232 - p * 23 | 0},${255 - p * 153 | 0}`;
    // finger gizmo
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(a.sx, a.sy, maxPx, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.arc(a.sx, a.sy, 6, 0, TAU); g.fill();
    if (L >= 14) {
      const k = Math.min(L, maxPx) / L, kx = a.sx + dx * k, ky = a.sy + dy * k;
      g.strokeStyle = col + ',0.5)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(kx, ky); g.stroke();
      g.fillStyle = col + ',0.9)'; g.beginPath(); g.arc(kx, ky, 8 + p * 6, 0, TAU); g.fill();
      // slingshot band at the ship
      const bx = sx + (dx / L) * 34 * (0.4 + p), by = sy + (dy / L) * 34 * (0.4 + p);
      g.strokeStyle = col + ',0.7)'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(sx - 12, sy + 4); g.lineTo(bx, by); g.lineTo(sx + 12, sy + 4); g.stroke();
    }
    if (a.preview) {
      const pts = a.preview.pts, n = pts.length;
      for (let i = 4; i < n; i += 4) {
        const f = 1 - i / n;
        const [x, y] = P(pts[i][0], pts[i][1]);
        g.fillStyle = `rgba(255,255,255,${0.15 + 0.75 * f})`;
        g.beginPath(); g.arc(x, y, 1.6 + 2 * f, 0, TAU); g.fill();
      }
    }
  }

  _ship(g, game, P, S, T) {
    const f = game.flight;
    const st = game.world.start;
    const x = f && game.state !== 'aim' ? f.x : st.x, y = f && game.state !== 'aim' ? f.y : st.y;
    if ((game.state === 'dead' && game.deadT > 0) || game.state === 'idle') return;
    const [px, py] = P(x, y);
    let ang = -Math.PI / 2;
    if (game.aim?.v) ang = Math.atan2(game.aim.v.vy, game.aim.v.vx);
    else if (f && game.state !== 'aim') ang = Math.atan2(f.vy, f.vx);
    else if (game.lastAng != null) ang = game.lastAng;
    if (game.aim?.v) game.lastAng = ang;
    const sc = (game.shipAnim.scale ?? 1) * Math.max(0.75, Math.min(1.25, S * 1.6));
    const stretch = game.shipAnim.stretch || 1;
    g.save();
    g.translate(px, py); g.rotate(ang); g.scale(sc * stretch, sc / Math.sqrt(stretch));
    if (game.state === 'aim' && game.aim?.power > 0.85) g.translate((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, 28);
    glow.addColorStop(0, 'rgba(94,232,255,0.25)'); glow.addColorStop(1, 'rgba(94,232,255,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 28, 0, TAU); g.fill();
    if (f && game.state === 'fly') {
      const flick = 0.75 + Math.random() * 0.4, len = (f.t < 0.35 ? 30 : 12) * flick;
      g.fillStyle = 'rgba(255,150,60,0.85)';
      g.beginPath(); g.moveTo(-8, -6); g.lineTo(-8 - len, 0); g.lineTo(-8, 6); g.fill();
      g.fillStyle = 'rgba(255,240,200,0.95)';
      g.beginPath(); g.moveTo(-8, -3); g.lineTo(-8 - len * 0.55, 0); g.lineTo(-8, 3); g.fill();
    } else if (game.state === 'aim') {
      const pulse = 0.5 + 0.5 * Math.sin(T * 5);
      g.fillStyle = `rgba(94,232,255,${0.4 + pulse * 0.4})`; g.beginPath(); g.arc(-10, 0, 3 + pulse * 1.5, 0, TAU); g.fill();
    }
    g.beginPath(); g.moveTo(20, 0); g.lineTo(-11, -12); g.lineTo(-6, 0); g.lineTo(-11, 12); g.closePath();
    g.fillStyle = '#dbe9ff'; g.fill(); g.strokeStyle = '#5ee8ff'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = '#2a7be0'; g.beginPath(); g.moveTo(10, 0); g.lineTo(0, -4); g.lineTo(0, 4); g.fill();
    g.restore();
    // power ring while aiming
    if (game.state === 'aim' && game.aim?.power > 0) {
      const p = game.aim.power;
      g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 4;
      g.beginPath(); g.arc(px, py, 34, 0, TAU); g.stroke();
      g.strokeStyle = `rgb(${94 + p * 161 | 0},${232 - p * 23 | 0},${255 - p * 153 | 0})`; g.lineCap = 'round';
      g.beginPath(); g.arc(px, py, 34, -Math.PI / 2, -Math.PI / 2 + TAU * p); g.stroke();
      g.font = `700 11px ${BODY}`; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(`${Math.round(p * 100)}%`, px, py + 52);
    }
  }

  _fx(g, game, P, S) {
    const fx = game.fx;
    g.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) {
      const t = p.life / p.max, [x, y] = P(p.x, p.y);
      g.fillStyle = `rgba(${p.color},${t})`;
      g.beginPath(); g.arc(x, y, p.size * (0.5 + t * 0.7), 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    for (const r of fx.rings) {
      const k = r.t / r.dur, e = 1 - Math.pow(1 - k, 3), [x, y] = P(r.x, r.y);
      g.strokeStyle = `rgba(${r.color},${1 - k})`; g.lineWidth = r.width * (1 - k) + 1;
      g.beginPath(); g.arc(x, y, 4 + r.max * S * e, 0, TAU); g.stroke();
    }
    for (const p of fx.pops) {
      const k = p.t / p.dur, [x, y] = p.world ? P(p.x, p.y) : [p.x, p.y];
      const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : k < 0.25 ? 1.15 - (k - 0.15) * 1.5 : 1;
      const a = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.save(); g.translate(x, y - k * 30); g.scale(s, s);
      g.globalAlpha = a; g.textAlign = 'center';
      g.font = `700 ${p.size}px ${DISPLAY}`;
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(p.text, 0, 0);
      g.fillStyle = p.color; g.fillText(p.text, 0, 0);
      if (p.sub) { g.font = `600 13px ${BODY}`; g.lineWidth = 4; g.strokeText(p.sub, 0, 20); g.fillStyle = '#e8eeff'; g.fillText(p.sub, 0, 20); }
      g.restore();
    }
    g.globalAlpha = 1;
    if (fx.edge > 0) {
      const grd = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
      grd.addColorStop(0, `rgba(${fx.edgeColor},0)`); grd.addColorStop(1, `rgba(${fx.edgeColor},${fx.edge * 0.35})`);
      g.fillStyle = grd; g.fillRect(0, 0, this.W, this.H);
    }
    if (fx.flash.a > 0) { g.fillStyle = `rgba(${fx.flash.r},${fx.flash.g},${fx.flash.b},${fx.flash.a})`; g.fillRect(0, 0, this.W, this.H); }
  }
}
