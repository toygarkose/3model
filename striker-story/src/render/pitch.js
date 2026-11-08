// Top-down broadcast pitch with a touch of height: anything in the air is
// drawn higher on screen while its shadow stays on the grass.
import { GOAL, BOX, SIX, BALL_R } from '../data/config.js';

const TAU = Math.PI * 2;

export class PitchRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.net = [];          // ripples {x, z, s, t}
    this.view = { s: 10, cx: 0, cy: 0, ox: 0, oy: 0 };
    this.cam = { x: 0, y: 12, s: 10 };
  }

  resize(w, h, dpr) {
    this.W = w; this.H = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
  }

  // Broadcast camera behind the ball, looking at the goal. Pinhole projection.
  _camFor(m) {
    const b = m.ball;
    const back = 7.5 + b.y * 0.32, height = 3.6 + b.y * 0.16;
    return {
      C: [b.x * 0.75, b.y + back, height],
      T: [b.x * 0.35, b.y * 0.38, 0.6],
    };
  }

  _basis(C, T) {
    let f = [T[0] - C[0], T[1] - C[1], T[2] - C[2]];
    const fl = Math.hypot(...f); f = f.map(v => v / fl);
    let r = [-f[1], f[0], 0];                      // f x up(0,0,1), screen-right = +x when looking toward -y
    const rl = Math.hypot(...r) || 1; r = r.map(v => v / rl);
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];   // up = forward x right
    return { f, r, u };
  }

  frame(m, top, bottom, instant = false) {
    const { C, T } = this._camFor(m);
    const B = this._basis(C, T);
    // fit: goal frame, ball, and the players around it
    const pts = [[-GOAL.halfW - 1.5, 0, GOAL.h + 0.6], [GOAL.halfW + 1.5, 0, GOAL.h + 0.6], [-GOAL.halfW - 1.5, 0, 0], [m.ball.x, m.ball.y + 1.2, 0], [m.ball.x, m.ball.y, 1.9]];
    // only players near the ball-to-goal line decide the framing (wide runners may sit at the edge)
    for (const p of [...m.mates, ...m.defs, ...m.wall]) {
      const L = Math.hypot(m.ball.x, m.ball.y) || 1, t = Math.max(0, Math.min(1, (p.x * m.ball.x + p.y * m.ball.y) / (L * L)));
      if (Math.hypot(p.x - m.ball.x * t, p.y - m.ball.y * t) < 7) pts.push([p.x, p.y, 1.9], [p.x, p.y, 0]);
    }
    const availH = this.H - top - bottom;
    let F = Infinity;
    for (const p of pts) {
      const v = [p[0] - C[0], p[1] - C[1], p[2] - C[2]];
      const z = v[0] * B.f[0] + v[1] * B.f[1] + v[2] * B.f[2];
      if (z < 0.5) continue;
      const x = Math.abs((v[0] * B.r[0] + v[1] * B.r[1] + v[2] * B.r[2]) / z);
      const y = Math.abs((v[0] * B.u[0] + v[1] * B.u[1] + v[2] * B.u[2]) / z);
      if (x > 1e-3) F = Math.min(F, (this.W * 0.47) / x);
      if (y > 1e-3) F = Math.min(F, (availH * 0.47) / y);
    }
    this.want = { C, T, F: Math.min(F, this.H * 2.2), top, availH };
    if (instant || !this.cam.C) this.cam = { C: [...C], T: [...T], F: this.want.F, top, availH };
  }

  follow(dt, ball, zoomToGoal) {
    const w = this.want; if (!w) return;
    const k = 1 - Math.exp(-dt * 2.5);
    const C = [...w.C], T = [...w.T];
    let F = w.F;
    if (zoomToGoal && ball) { C[1] = w.C[1] * 0.75 + ball.y * 0.25; T[0] = w.T[0] * 0.6 + ball.x * 0.4; F *= 1.04; }
    for (let i = 0; i < 3; i++) { this.cam.C[i] += (C[i] - this.cam.C[i]) * k; this.cam.T[i] += (T[i] - this.cam.T[i]) * k; }
    this.cam.F += (F - this.cam.F) * k;
    this.cam.top = w.top; this.cam.availH = w.availH;
  }

  setCam(C, T, F) { this.cam = { ...this.cam, C: [...C], T: [...T], F }; this.want = { ...this.want, C: [...C], T: [...T], F }; }

  // world (x, y = depth toward own half, z = height) -> screen; also returns px per metre at that depth
  P(x, y, z = 0, fx) {
    const c = this.cam;
    if (!c.C) return [0, 0, 1];
    const B = this._B && this._Bkey === c.C.join() + c.T.join() ? this._B : (this._Bkey = c.C.join() + c.T.join(), this._B = this._basis(c.C, c.T));
    const v = [x - c.C[0], y - c.C[1], z - c.C[2]];
    let d = v[0] * B.f[0] + v[1] * B.f[1] + v[2] * B.f[2];
    const behind = d < 0.8;
    if (d < 0.8) d = 0.8;
    const F = c.F * (1 + (fx?.punch || 0)), sh = fx ? fx.trauma * fx.trauma * 14 : 0;
    const sx = this.W / 2 + ((v[0] * B.r[0] + v[1] * B.r[1] + v[2] * B.r[2]) / d) * F + (fx ? fx._sx * sh : 0);
    const sy = c.top + c.availH / 2 - ((v[0] * B.u[0] + v[1] * B.u[1] + v[2] * B.u[2]) / d) * F + (fx ? fx._sy * sh : 0);
    return [sx, sy, F / d, behind];
  }

  // screen -> point on the grass (for aiming)
  unproject(sx, sy) {
    const c = this.cam, B = this._basis(c.C, c.T);
    const a = (sx - this.W / 2) / c.F, b = -(sy - c.top - c.availH / 2) / c.F;
    const d = [B.f[0] + B.r[0] * a + B.u[0] * b, B.f[1] + B.r[1] * a + B.u[1] * b, B.f[2] + B.r[2] * a + B.u[2] * b];
    const dz = Math.min(d[2], -0.02);
    const t = -c.C[2] / dz;
    return [c.C[0] + d[0] * t, c.C[1] + d[1] * t];
  }

  rippleNet(x, z, s) { this.net.push({ x, z, s, t: 0 }); if (this.net.length > 3) this.net.shift(); }

  render(m, ui, fx, dt, theme) {
    const g = this.g, d = this.dpr;
    fx._sx = Math.random() * 2 - 1; fx._sy = Math.random() * 2 - 1;
    g.setTransform(d, 0, 0, d, 0, 0);
    if (!this.cam.C) this.frame({ ball: { x: 0, y: 20 }, mates: [], defs: [], wall: [] }, 60, 70, true);
    this._sky(g);
    this._grass(g, fx);
    this._lines(g, fx);
    for (const r of this.net) r.t += dt;
    this.net = this.net.filter(r => r.t < 2);
    this._goalBack(g, fx);
    if (!m) { this._goalFront(g, fx); return; }
    for (const t of m.targets) {
      const [x, y, k] = this.P(t.x, 0, t.z, fx);
      g.strokeStyle = t.hit ? 'rgba(120,255,170,0.95)' : 'rgba(255,214,110,0.95)';
      g.lineWidth = 3; g.beginPath(); g.arc(x, y, t.r * k, 0, TAU); g.stroke();
      if (t.hit) { g.fillStyle = 'rgba(120,255,170,0.35)'; g.fill(); }
    }
    const people = [];
    for (const p of m.defs) people.push({ x: p.x, y: p.y, kit: theme.opp });
    for (const p of m.wall) people.push({ x: p.x, y: p.y, kit: theme.opp, jump: p.jump > 0.12 && p.jump < 0.75 ? Math.sin(((p.jump - 0.12) / 0.63) * Math.PI) * 0.45 : 0, arms: true });
    for (const p of m.mates) people.push({ x: p.x, y: p.y, kit: theme.us });
    if (m.keeper) people.push({ x: m.keeper.x, y: m.keeper.y, kit: theme.gk, keeper: true, dive: m.keeper.dive, hz: m.keeper.hz, mode: m.keeper.mode });
    if (m.phase === 'aim' || m.type === 'training') people.push({ x: m.ball.x - 0.55, y: m.ball.y + 0.9, kit: theme.us, you: true });
    else people.push({ x: m.you.x, y: m.you.y + 0.35, kit: theme.us, you: true });
    people.sort((a, b) => a.y - b.y);     // far (small y) first
    for (const p of people) this._shadow(g, p.x, p.y, 0.42, fx, 0.32);
    this._shadow(g, m.ball.x, m.ball.y, 0.15 + m.ball.z * 0.02, fx, Math.max(0.12, 0.45 - m.ball.z * 0.05));
    const ballInNet = m.ball.y < 0;
    if (ballInNet) this._ball(g, m.ball, fx);
    this._goalFront(g, fx);
    for (const p of people) { this._player(g, p, fx); if (!ballInNet && p.y < m.ball.y && people.indexOf(p) === people.length - 1) { /* noop */ } }
    if (!ballInNet) this._ball(g, m.ball, fx);
  }

  _sky(g) {
    const grd = g.createLinearGradient(0, 0, 0, this.H * 0.4);
    grd.addColorStop(0, '#0b1a12'); grd.addColorStop(1, '#183a24');
    g.fillStyle = grd; g.fillRect(0, 0, this.W, this.H);
  }

  _quad(g, pts, fill, fx) {
    g.beginPath();
    pts.forEach(([x, y], i) => { const [a, b] = this.P(x, y, 0, fx); i ? g.lineTo(a, b) : g.moveTo(a, b); });
    g.closePath(); g.fillStyle = fill; g.fill();
  }

  _grass(g, fx) {
    const far = -14, near = (this.cam.C?.[1] ?? 30) - 1;
    // stand rising behind the advertising boards, packed with fans
    const wall = (y, z0, z1, col) => { const [ax, ay] = this.P(-70, y, z0, fx), [bx, by] = this.P(70, y, z1, fx); g.fillStyle = col; g.fillRect(Math.min(ax, bx), by, Math.abs(bx - ax), ay - by); };
    wall(-9, 0, 9, '#1a2b22');
    const cols = ['#c0242b', '#f4f1e6', '#1f5aa8', '#ffcb4d', '#2f7d4f', '#9aa3ad'];
    for (let row = 0; row < 9; row++) {
      const z = 1.3 + row * 0.85, y = -9 - row * 0.05;
      for (let i = 0; i < 60; i++) {
        const x = -46 + i * 1.55 + (row % 2) * 0.7;
        const [px, py, k] = this.P(x, y, z, fx);
        if (px < -10 || px > this.W + 10) continue;
        g.fillStyle = cols[(i * 7 + row * 3) % cols.length];
        g.globalAlpha = 0.55 + ((i * 13 + row) % 5) * 0.08;
        g.fillRect(px - k * 0.22, py - k * 0.55, k * 0.44, k * 0.55);
      }
    }
    g.globalAlpha = 1;
    // roof line and floodlight glow
    const [, ry] = this.P(0, -9, 9, fx);
    const glow = g.createLinearGradient(0, ry - 40, 0, ry + 10);
    glow.addColorStop(0, 'rgba(255,250,220,0)'); glow.addColorStop(1, 'rgba(255,250,220,0.18)');
    g.fillStyle = glow; g.fillRect(0, ry - 40, this.W, 50);
    this._quad(g, [[-60, far], [60, far], [60, near], [-60, near]], '#2f7a35', fx);
    const stripe = 5.25;
    for (let y = far; y < near; y += stripe * 2) this._quad(g, [[-60, y], [60, y], [60, Math.min(near, y + stripe)], [-60, Math.min(near, y + stripe)]], '#378a3d', fx);
    // floodlight vignette
    const grd = g.createRadialGradient(this.W / 2, this.H * 0.45, Math.min(this.W, this.H) * 0.25, this.W / 2, this.H * 0.5, Math.max(this.W, this.H) * 0.85);
    grd.addColorStop(0, 'rgba(255,255,230,0.05)'); grd.addColorStop(1, 'rgba(0,10,0,0.5)');
    g.fillStyle = grd; g.fillRect(0, 0, this.W, this.H);
    // advertising boards behind the goal line
    const boards = ['STRIKER STORY', 'KICKLINE', 'HARBOR BANK', 'VOLTA', 'COUNTY CUP'];
    for (let i = 0; i < 10; i++) {
      const x0 = -40 + i * 8, [ax, ay] = this.P(x0, -5, 0, fx), [bx, by] = this.P(x0 + 8, -5, 0.9, fx);
      g.fillStyle = i % 2 ? '#c0242b' : '#1f3c88';
      g.fillRect(ax, by, bx - ax, ay - by);
      const [, , k] = this.P(x0 + 4, -5, 0.45, fx);
      g.fillStyle = '#f4f1e6'; g.font = `800 ${Math.max(6, k * 0.55)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(boards[i % boards.length], (ax + bx) / 2, (ay + by) / 2);
    }
    g.textBaseline = 'alphabetic';
  }

  _line(g, pts, fx) {
    g.beginPath();
    pts.forEach(([x, y], i) => { const [a, b] = this.P(x, y, 0, fx); i ? g.lineTo(a, b) : g.moveTo(a, b); });
    g.stroke();
  }

  _lines(g, fx) {
    const [, , k] = this.P(0, 12, 0, fx);
    g.strokeStyle = 'rgba(245,250,240,0.85)'; g.lineWidth = Math.max(1.4, 0.1 * k); g.lineJoin = 'round';
    this._line(g, [[-40, 0], [40, 0]], fx);
    this._line(g, [[-BOX.halfW, 0], [-BOX.halfW, BOX.depth], [BOX.halfW, BOX.depth], [BOX.halfW, 0]], fx);
    this._line(g, [[-SIX.halfW, 0], [-SIX.halfW, SIX.depth], [SIX.halfW, SIX.depth], [SIX.halfW, 0]], fx);
    const a = Math.acos(5.5 / 9.15), arc = [];
    for (let i = 0; i <= 24; i++) { const t = -a + (2 * a * i) / 24; arc.push([Math.sin(t) * 9.15, 11 + Math.cos(t) * 9.15]); }
    this._line(g, arc, fx);
    const [sx, sy, ks] = this.P(0, 11, 0, fx);
    g.fillStyle = 'rgba(245,250,240,0.9)'; g.beginPath(); g.ellipse(sx, sy, Math.max(2, 0.15 * ks), Math.max(1.2, 0.08 * ks), 0, 0, TAU); g.fill();
  }

  _netOffset(x, z) {
    let off = 0;
    for (const r of this.net) off += r.s * 0.7 * Math.exp(-((x - r.x) ** 2 + (z - r.z) ** 2) / 0.9) * Math.cos(r.t * 13) * Math.exp(-r.t * 2.6);
    return off;
  }

  _goalBack(g, fx) {
    const W = GOAL.halfW, D = GOAL.depth, H = GOAL.h;
    g.strokeStyle = 'rgba(255,255,255,0.38)'; g.lineWidth = 1;
    for (let i = 0; i <= 18; i++) {
      const x = -W + (2 * W * i) / 18;
      g.beginPath();
      for (let k = 0; k <= 8; k++) { const z = (H * k) / 8, [px, py] = this.P(x, -D - this._netOffset(x, z), z, fx); k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    }
    for (let k = 0; k <= 8; k++) {
      const z = (H * k) / 8;
      g.beginPath();
      for (let i = 0; i <= 18; i++) { const x = -W + (2 * W * i) / 18, [px, py] = this.P(x, -D - this._netOffset(x, z), z, fx); i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    }
    for (const sx of [-W, W]) for (let k = 0; k <= 5; k++) { const y = -(D * k) / 5, [a, b] = this.P(sx, y, 0, fx), [c, d2] = this.P(sx, y, H, fx); g.beginPath(); g.moveTo(a, b); g.lineTo(c, d2); g.stroke(); }
    for (let k = 0; k <= 5; k++) { const y = -(D * k) / 5, [a, b] = this.P(-W, y, H, fx), [c, d2] = this.P(W, y, H, fx); g.beginPath(); g.moveTo(a, b); g.lineTo(c, d2); g.stroke(); }
    this._quad(g, [[-W, 0], [W, 0], [W, -D], [-W, -D]], 'rgba(0,0,0,0.16)', fx);
  }

  _goalFront(g, fx) {
    const W = GOAL.halfW, H = GOAL.h;
    const [a, b, k] = this.P(-W, 0, 0, fx), [c, d] = this.P(-W, 0, H, fx), [e, f] = this.P(W, 0, H, fx), [h, i] = this.P(W, 0, 0, fx);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = Math.max(3, 0.12 * k) + 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.lineTo(e, f); g.lineTo(h, i); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(3, 0.12 * k);
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.lineTo(e, f); g.lineTo(h, i); g.stroke();
  }

  _shadow(g, x, y, r, fx, a) {
    const [px, py, k, behind] = this.P(x + 0.15, y + 0.1, 0, fx);
    if (behind) return;
    const [, py2] = this.P(x + 0.15, y + 0.1 + r, 0, fx);
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.beginPath(); g.ellipse(px, py, r * k, Math.max(1, Math.abs(py2 - py)), 0, 0, TAU); g.fill();
  }

  // Footballer as a little 3/4 figure: legs, shirt, head — scaled by depth.
  _player(g, p, fx) {
    const lift = (p.jump || 0) + (p.keeper && p.mode !== 'set' ? Math.max(0, (p.hz || 1) - 1.3) * 0.7 : 0);
    const [x, y, k, behind] = this.P(p.x, p.y, lift, fx);
    if (behind) return;
    const h = 1.8 * k, w = 0.55 * k;
    g.save(); g.translate(x, y);
    if (p.keeper && p.mode !== 'set') g.rotate(Math.max(-1.25, Math.min(1.25, (p.dive || 0) * 0.55)));
    // legs
    g.fillStyle = '#1b1b1b';
    g.fillRect(-w * 0.42, -h * 0.46, w * 0.3, h * 0.46);
    g.fillRect(w * 0.12, -h * 0.46, w * 0.3, h * 0.46);
    g.fillStyle = p.kit[1];
    g.fillRect(-w * 0.48, -h * 0.56, w * 0.96, h * 0.14);   // shorts
    // shirt
    g.fillStyle = p.kit[0];
    g.beginPath(); g.roundRect ? g.roundRect(-w * 0.55, -h * 0.86, w * 1.1, h * 0.34, w * 0.2) : g.rect(-w * 0.55, -h * 0.86, w * 1.1, h * 0.34); g.fill();
    // arms (raised for wall/keeper)
    g.strokeStyle = p.kit[0]; g.lineWidth = Math.max(1.5, w * 0.22); g.lineCap = 'round';
    const up = p.arms || p.keeper ? -0.35 : 0.18;
    g.beginPath(); g.moveTo(-w * 0.5, -h * 0.8); g.lineTo(-w * 0.8, -h * (0.62 - up)); g.moveTo(w * 0.5, -h * 0.8); g.lineTo(w * 0.8, -h * (0.62 - up)); g.stroke();
    if (p.keeper) { g.fillStyle = '#f2f2f2'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * w * 0.82, -h * (0.62 - up), w * 0.16, 0, TAU); g.fill(); } }
    // head
    g.fillStyle = '#c99a72'; g.beginPath(); g.arc(0, -h * 0.94, w * 0.27, 0, TAU); g.fill();
    g.fillStyle = '#2a1c14'; g.beginPath(); g.arc(0, -h * 0.98, w * 0.27, Math.PI, TAU); g.fill();
    g.restore();
    if (p.you) {
      const [gx, gy, gk] = this.P(p.x, p.y, 0, fx);
      g.strokeStyle = 'rgba(255,214,110,0.95)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(gx, gy, 0.7 * gk, 0.28 * gk, 0, 0, TAU); g.stroke();
    }
  }

  _ball(g, b, fx) {
    const [x, y, k, behind] = this.P(b.x, b.y, b.z, fx);
    if (behind) return;
    const r = Math.max(2.5, Math.min(60, BALL_R * k * 1.35));
    g.save(); g.translate(x, y);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.rotate(b.rot * 0.25);
    g.fillStyle = '#1b1f2a';
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; g.beginPath(); g.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.26, 0, TAU); g.fill(); }
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  }
}
