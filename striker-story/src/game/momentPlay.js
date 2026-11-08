// Plays one moment: pull-back aiming with curl, the flight, and all the juice.
import { createMoment, launchShot, previewPath, stepAim, stepFlight, mateDecision, feint } from '../sim/moment.js';
import { SHOT, PRESSURE } from '../data/config.js';
import { haptics } from '../fx/haptics.js';

const TAU = Math.PI * 2;

export class MomentPlay {
  constructor({ renderer, fx, audio }) {
    Object.assign(this, { renderer, fx, audio });
    this.m = null;
    this.aim = null;
    this.lob = false;
    this.onResult = null;
    this.onEvent = null;
  }

  start(type, seed, opp, ctx) {
    this.ctx = ctx;   // { skills, fatigue, teamRel, theme }
    this.m = createMoment(type, seed, opp);
    if (this.m.pressure != null) this.m.pressure += ctx.skills.composure * PRESSURE.composureGain - ctx.fatigue * 1.2;
    this.lob = false;
    this.aim = null;
    this.doneTimer = null;
    this.mateTimer = null;
    this.rec = [];
    this.replay = null;
    this.swipe = null;
    this.fx.clear();
    this.renderer.frame(this.m, ctx.top, ctx.bottom, true);
    return this.m;
  }

  dragMax() { return Math.min(this.renderer.W, this.renderer.H) * SHOT.maxDragFrac; }

  down(x, y) {
    if (this.paused) return false;
    if (this.replay) { this.replay.t = 1e9; return false; }      // tap skips the replay
    if (this.m?.phase === 'dribble') { this.swipe = { x, y, t: performance.now() }; return true; }
    if (!this.m || this.m.phase !== 'aim') return false;
    this.aim = { sx: x, sy: y, x, y, path: [[x, y]], power: 0, curl: 0, ok: false };
    this.audio.chargeStart();
    return true;
  }

  move(x, y) {
    const a = this.aim; if (!a) return;
    a.x = x; a.y = y;
    const last = a.path[a.path.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) > 3) a.path.push([x, y]);
    const dx = x - a.sx, dy = y - a.sy, L = Math.hypot(dx, dy);
    a.ok = L > 14;
    if (!a.ok) { a.power = 0; this.audio.chargeSet(0); return; }
    a.power = Math.min(1, L / this.dragMax());
    // the bend of your swipe (signed, relative to the pull direction)
    let dev = 0;
    for (const [px, py] of a.path) { const c = (dx * (py - a.sy) - dy * (px - a.sx)) / L; if (Math.abs(c) > Math.abs(dev)) dev = c; }
    a.curl = -Math.max(-1, Math.min(1, (dev / L) * 3.2));
    if (Math.abs(a.curl) < 0.08) a.curl = 0;
    // direction on the grass: the point "ahead" of the ball where your pull points
    const [bsx, bsy] = this.renderer.P(this.m.ball.x, this.m.ball.y, 0);
    const [gx, gy] = this.renderer.unproject(bsx - (dx / L) * 80, bsy - (dy / L) * 80);
    const wx = gx - this.m.ball.x, wy = gy - this.m.ball.y, wl = Math.hypot(wx, wy) || 1;
    a.dir = { dx: wx / wl, dy: wy / wl };
    const aimObj = this._aimObj();
    a.preview = previewPath(this.m, aimObj, this.ctx.skills, 0.18 + this.ctx.skills.vision * 0.0065);
    this.audio.chargeSet(a.power);
    const q = Math.floor(a.power * 4 + 1e-6);
    if (q !== a.q) { a.q = q; if (q >= 4) haptics.medium(); else haptics.tick(); this.audio.play('tick', { rate: 0.8 + q * 0.2 }); }
  }

  _aimObj(a = this.aim) { return { dx: a.dir.dx, dy: a.dir.dy, power: a.power, curl: a.curl, lob: this.lob }; }

  up(x, y) {
    if (this.swipe) {
      const sw = this.swipe; this.swipe = null;
      const dx = (x ?? sw.x) - sw.x, dy = (y ?? sw.y) - sw.y;
      if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.2 && performance.now() - sw.t < 450) this.doFeint(Math.sign(dx));
      return;
    }
    const a = this.aim;
    this.aim = null;
    this.audio.chargeStop();
    if (!a || !a.ok || !this.m || this.m.phase !== 'aim') return;
    const info = launchShot(this.m, this._aimObj(a), this.ctx.skills, this.ctx.fatigue);
    const b = this.m.ball;
    this.fx.burst(b.x, b.y, { n: 14, speed: 4, life: 0.5, color: '170,220,140', size: 2.2, drag: 3 });
    this.fx.shake(0.1 + a.power * 0.2);
    this.fx.punch = -0.02 - a.power * 0.025;
    this.audio.play(info.speed > 18 ? 'kick' : 'pass', { vol: 0.6 + a.power * 0.6, rate: 0.9 + a.power * 0.2 });
    haptics.medium();
    this.onEvent?.('kick', { m: this.m });
  }

  // Test hook: shoot at a point on the goal line (or a teammate) without touch input.
  testShoot(tx, ty = 0, power = 0.9, curl = 0) {
    if (!this.m || this.m.phase !== 'aim') return false;
    const b = this.m.ball, dx = tx - b.x, dy = ty - b.y, L = Math.hypot(dx, dy);
    this.aim = { ok: true, power, curl, dir: { dx: dx / L, dy: dy / L }, path: [] };
    this.up();
    return true;
  }

  doFeint(dir) {
    const r = feint(this.m, dir, this.ctx.skills.composure);
    if (r === 'perfect' || r === 'good') {
      this.audio.play('pass', { rate: 1.4, vol: 0.6 }); this.audio.play('ooh', { vol: 0.5, rate: 1.2 });
      this.fx.pop(r === 'perfect' ? 'PERFECT SKILL!' : 'SKILL!', this.m.ball.x, this.m.ball.y - 1, { color: '#7dffb2', size: 28 });
      this.fx.slowMo(0.35, 0.4); this.fx.shake(0.15); haptics.medium();
    } else if (r === 'too-soon') {
      this.fx.pop('TOO EARLY', this.m.ball.x, this.m.ball.y - 1, { color: '#ffd1a1', size: 22 });
    }
    return r;
  }

  toggleLob() { this.lob = !this.lob; haptics.tick(); this.audio.play('click'); return this.lob; }

  update(dt) {
    if (this.paused) return;
    if (this.replay) return this._updateReplay(dt);
    const m = this.m; if (!m) return;
    const ts = this.fx.timeScale(), sdt = dt * ts;
    this.fx.update(dt, sdt);
    if (m.phase === 'aim' || m.phase === 'dribble') stepAim(m, dt);
    if (m.phase === 'flight' || m.phase === 'after') {
      stepFlight(m, sdt);
      const k = m.keeper;
      this.rec.push({ b: { ...m.ball }, k: k && { x: k.x, y: k.y, hz: k.hz, dive: k.dive, mode: k.mode }, w: m.wall.map(w => w.jump) });
      if (this.rec.length > 400) this.rec.shift();
    }
    if (m.phase === 'mate') {
      this.mateTimer = (this.mateTimer ?? 0.35) - dt;
      if (this.mateTimer <= 0) { this.mateTimer = null; mateDecision(m, this.ctx.teamRel); }
    }
    for (const e of m.events.splice(0)) this._event(e);
    if (m.phase === 'done' && this.doneTimer == null) this.doneTimer = m.result?.kind === 'goal' ? 1.4 : 1.0;
    if (this.doneTimer != null) {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) {
        const r = m.result; this.doneTimer = null;
        if (r?.kind === 'goal' && this.ctx.replays !== false && this.rec.length > 20) { this._startReplay(); return; }
        this.m = null; this.onResult?.(r); return;
      }
    }
    if (!this.replay) this.renderer.follow(dt, m.ball, m.phase === 'flight' && m.kickedAt === 'shot');
  }

  _startReplay() {
    const m = this.m, end = m.result;
    // goal-mouth camera beside the post, at half speed
    const side = end.x >= 0 ? 1 : -1;
    this.renderer.setCam([side * 5.5 + end.x * 0.3, 8.5, 1.5], [end.x * 0.5, 0.5, 1.1], Math.min(this.renderer.W, this.renderer.H) * 1.05);
    this.replay = { t: 0, i: 0 };
    this.onEvent?.('replay', {});
  }

  _updateReplay(dt) {
    const R = this.replay, m = this.m;
    R.t += dt * 0.5 * 120 / 1;
    const i = Math.min(this.rec.length - 1, Math.floor(R.t * 0.5));
    const snap = this.rec[i];
    if (snap) { Object.assign(m.ball, snap.b); if (snap.k && m.keeper) Object.assign(m.keeper, snap.k); m.wall.forEach((w, j) => { w.jump = snap.w[j] ?? w.jump; }); }
    if (i >= this.rec.length - 1 || R.t > 1e8) {
      const r = m.result; this.replay = null; this.m = null;
      this.onEvent?.('replayend', {});
      this.onResult?.(r);
    }
  }

  _event(e) {
    const m = this.m, b = m.ball, fx = this.fx, A = this.audio;
    switch (e.type) {
      case 'bounce': if (e.strength > 0.2) A.play('pass', { vol: e.strength * 0.4, rate: 1.4 }); break;
      case 'block': case 'wall':
        A.play('glove', { vol: 0.8, rate: 0.8 }); A.play('ooh', { vol: 0.7 });
        fx.shake(0.3); fx.pop(e.type === 'wall' ? 'OFF THE WALL' : 'BLOCKED', b.x, b.y - 1, { color: '#ffb4a8', size: 26 });
        haptics.light(); break;
      case 'received': A.play('pass', { vol: 0.8 }); fx.pop('RECEIVED', b.x, b.y - 1.5, { color: '#cfe8ff', size: 18, dur: 0.9 }); break;
      case 'matepass': A.play('pass'); break;
      case 'mateshot': A.play('kick', { vol: 0.9 }); break;
      case 'onetwo': fx.pop('ONE-TWO!', b.x, b.y - 1.5, { color: '#7dffb2', size: 26 }); A.play('levelup', { vol: 0.5 }); haptics.light(); break;
      case 'save':
        A.play('glove'); A.play('ooh', { vol: 1 });
        fx.shake(0.35); fx.pop(e.caught ? 'CAUGHT' : 'SAVED!', b.x, b.y - 1.2, { color: '#ffd1a1', size: 28 });
        haptics.medium(); break;
      case 'post':
        A.play('post'); A.play('ooh', { vol: 1 });
        fx.shake(0.45); fx.pop(e.kind === 'bar' ? 'CROSSBAR!' : 'OFF THE POST!', e.x, 1, { color: '#ffd166', size: 28 });
        haptics.heavy(); break;
      case 'miss': A.play('ooh', { vol: 0.6 }); fx.pop(e.z > 2.44 ? 'OVER' : 'WIDE', e.x, -0.5, { color: '#ffb4a8', size: 24 }); break;
      case 'net':
        this.renderer.rippleNet(e.x, e.z, e.strength);
        A.play('net', { vol: 0.5 + e.strength }); break;
      case 'goal':
        fx.slowMo(0.9, 0.3);
        fx.doFlash(255, 255, 230, 0.35);
        fx.shake(0.55);
        fx.burst(e.x, -1.5, { n: 90, speed: 9, life: 2, color: '255,214,110', size: 3, drag: 1 });
        fx.burst(e.x, -1.5, { n: 50, speed: 7, life: 1.8, color: '255,255,255', size: 2.4, drag: 1 });
        fx.ring(e.x, 0, { max: 6, dur: 0.7, color: '255,255,255', width: 6 });
        A.play('roar', { vol: 1.1 }); A.play('net', { vol: 1 }); A.play('sting', { vol: 0.7 });
        this.renderer.rippleNet(e.x, e.z, 1);
        haptics.success();
        break;
      case 'target':
        A.play('levelup', { vol: 0.7 }); fx.pop('HIT!', e.tg.x, -0.5, { color: '#7dffb2', size: 26 });
        fx.burst(e.tg.x, -0.2, { n: 30, speed: 6, life: 0.8, color: '125,255,178', size: 2.5, drag: 2 });
        haptics.light(); break;
      case 'tackle':
        A.play('glove', { rate: 0.7 }); A.play('ooh', { vol: 0.6 }); fx.shake(0.3);
        fx.pop('TACKLED!', b.x, b.y - 1, { color: '#ffb4a8', size: 28 }); haptics.heavy(); break;
    }
    this.onEvent?.(e.type, e);
  }

  // Aim gizmo, preview, cone, pressure ring, particles and text (after the pitch).
  drawOverlay(g) {
    const R = this.renderer, fx = this.fx, m = this.m;
    const P = (x, y, z = 0) => R.P(x, y, z, fx);
    if (m) {
      // pressure ring around you
      if (m.phase === 'aim' && m.pressure != null) {
        const [x, y] = P(m.ball.x, m.ball.y);
        const full = PRESSURE.base + this.ctx.skills.composure * PRESSURE.composureGain;
        const k = Math.max(0, m.pressure / full);
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 30, 0, TAU); g.stroke();
        g.strokeStyle = k > 0.35 ? 'rgba(255,214,110,0.95)' : 'rgba(255,90,70,0.95)';
        g.beginPath(); g.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
      }
      if (m.phase === 'dribble') {
        const d = m.defs.find(x => x.presser), dist = Math.hypot(d.x - m.ball.x, d.y - m.ball.y);
        const [x, y] = P(m.ball.x, m.ball.y, 0);
        const hot = dist < 3.6 + this.ctx.skills.composure * 0.012 && dist > 1.0;
        g.font = '800 30px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
        g.fillStyle = hot ? '#7dffb2' : 'rgba(255,255,255,0.55)';
        g.fillText('◀  NOW  ▶'.replace('NOW', hot ? 'NOW!' : 'WAIT'), x, y - 60);
      }
      const a = this.aim;
      if (a && a.ok && m.phase === 'aim') {
        const col = `${120 + a.power * 135 | 0},${230 - a.power * 60 | 0},${255 - a.power * 170 | 0}`;
        // finger gizmo
        g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(a.sx, a.sy, this.dragMax(), 0, TAU); g.stroke();
        g.strokeStyle = `rgba(${col},0.55)`; g.lineWidth = 3; g.lineCap = 'round';
        g.beginPath(); a.path.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
        g.fillStyle = `rgba(${col},0.95)`; g.beginPath(); g.arc(a.x, a.y, 8 + a.power * 6, 0, TAU); g.fill();
        // accuracy cone
        const wob = (SHOT.wobbleMax - (SHOT.wobbleMax - SHOT.wobbleMin) * this.ctx.skills.shooting / 100) * (1 + this.ctx.fatigue * 1.5) * Math.PI / 180;
        const ang = Math.atan2(a.dir.dy, a.dir.dx), len = 7 + a.power * 8;
        const [bx, by] = P(m.ball.x, m.ball.y);
        const [l1x, l1y] = P(m.ball.x + Math.cos(ang - wob) * len, m.ball.y + Math.sin(ang - wob) * len);
        const [l2x, l2y] = P(m.ball.x + Math.cos(ang + wob) * len, m.ball.y + Math.sin(ang + wob) * len);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath(); g.moveTo(bx, by); g.lineTo(l1x, l1y); g.lineTo(l2x, l2y); g.closePath(); g.fill();
        // preview dots (real flight, no aim error)
        const pts = a.preview || [];
        pts.forEach(([x, y, z], i) => {
          const f = 1 - i / pts.length;
          const [sx, sy] = P(x, y, z);
          g.fillStyle = `rgba(255,255,255,${0.2 + 0.75 * f})`;
          g.beginPath(); g.arc(sx, sy, 1.8 + 2.4 * f, 0, TAU); g.fill();
        });
        // power ring
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4; g.beginPath(); g.arc(bx, by, 20, 0, TAU); g.stroke();
        g.strokeStyle = `rgb(${col})`; g.beginPath(); g.arc(bx, by, 20, -Math.PI / 2, -Math.PI / 2 + TAU * a.power); g.stroke();
        if (a.curl) { g.font = '700 12px "Barlow", sans-serif'; g.fillStyle = '#ffd166'; g.textAlign = 'center'; g.fillText(a.curl > 0 ? 'CURL ↻' : '↺ CURL', bx, by + 36); }
      }
    }
    g.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) { const t = p.life / p.max, [x, y] = P(p.x, p.y, 0.3); g.fillStyle = `rgba(${p.color},${t})`; g.beginPath(); g.arc(x, y, p.size * (0.5 + t * 0.7), 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    for (const r of fx.rings) { const k = r.t / r.dur, e = 1 - Math.pow(1 - k, 3), [x, y] = P(r.x, r.y); g.strokeStyle = `rgba(${r.color},${1 - k})`; g.lineWidth = r.width * (1 - k) + 1; const k2 = R.P(r.x, r.y, 0)[2]; g.beginPath(); g.arc(x, y, 4 + r.max * k2 * e, 0, TAU); g.stroke(); }
    for (const p of fx.pops) {
      const k = p.t / p.dur, [x, y] = P(p.x, p.y, 1.5);
      const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : k < 0.25 ? 1.15 - (k - 0.15) * 1.5 : 1, al = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.save(); g.translate(x, y - k * 26); g.scale(s, s); g.globalAlpha = al; g.textAlign = 'center';
      g.font = `800 ${p.size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(p.text, 0, 0); g.fillStyle = p.color; g.fillText(p.text, 0, 0);
      g.restore();
    }
    g.globalAlpha = 1;
    if (fx.flash.a > 0) { g.fillStyle = `rgba(${fx.flash.r},${fx.flash.g},${fx.flash.b},${fx.flash.a})`; g.fillRect(0, 0, R.W, R.H); }
  }
}
