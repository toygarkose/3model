// Level runtime: aiming, launch, flight, events, outcome. Owns the view transform.
import { buildWorld, placeBodies, makeShip, step, SIM, OUT, popcount, escapeSpeed } from './physics.js';
import { BODIES } from '../data/bodies.js';
import { haptics } from '../fx/haptics.js';

const ASSIST = { off: 0.35, short: 1, long: 3.5 };
const PREVIEW_PX = 1000;          // preview length per "preview second" (world px)

export class Game {
  constructor({ levels, store, audio, fx, ui }) {
    Object.assign(this, { levels, store, audio, fx, ui });
    this.state = 'idle';
    this.view = { s: 1, cx: 0, cy: 0, W: 1, H: 1, top: 0 };
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.ghosts = [];
    this.trail = [];
    this.aim = null;
    this.paused = false;
    this.userWarp = 1;
  }

  // ------------------------------------------------------------------ setup
  load(index) {
    this.index = index;
    this.level = this.levels[index];
    this.world = buildWorld(this.level);
    placeBodies(this.world, 0);
    this.attempts = 0;
    this.ghosts = [];
    this.fx.clear();
    this.cam = { x: 0, y: 0 };
    this.seeds = this.world.bodies.map((_, i) => (i * 7.31 + index * 3.17) % 10);
    this.resetShot();
    this.layout();
  }

  resetShot() {
    this.state = 'aim';
    this.flight = null;
    this.trail = [];
    this.aim = null;
    this.shipAnim = { scale: 0, t: 0 };
    this.got = 0;
    this.runScore = { close: 0, assist: 0 };
    placeBodies(this.world, 0);
    this.ui.hud?.({ stars: 0, attempts: this.attempts });
  }

  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const safeT = this.ui.safeTop?.() || 0, safeB = this.ui.safeBottom?.() || 0;
    const top = safeT + 64, bot = safeB + 14;
    const avail = Math.max(200, H - top - bot);
    const f = this.level?.field || { w: 720, h: 1280 };
    this.view = { W, H, top, s: Math.min(W / f.w, avail / f.h), cx: W / 2, cy: top + avail / 2 };
  }

  get scale() { return this.view.s * (1 + this.fx.punch); }
  toScreen(x, y) {
    const v = this.view, S = this.scale, sh = this.fx.trauma * this.fx.trauma * 22;
    return [v.cx + (x - this.cam.x) * S + this._shx * sh, v.cy + (y - this.cam.y) * S + this._shy * sh];
  }

  // ------------------------------------------------------------------ input
  dragMax() { return Math.min(this.view.W, this.view.H) * 0.34; }

  pointerDown(x, y) {
    if (this.state !== 'aim' || this.paused) return false;
    this.aim = { sx: x, sy: y, x, y, power: 0, v: null, lastTick: 0 };
    this.audio.chargeStart();
    return true;
  }

  pointerMove(x, y) {
    const a = this.aim;
    if (!a) return;
    a.x = x; a.y = y;
    const dx = x - a.sx, dy = y - a.sy, L = Math.hypot(dx, dy);
    if (L < 14) { a.v = null; a.power = 0; this.audio.chargeSet(0); return; }
    const p = Math.min(1, L / this.dragMax());
    const sp = this.world.maxSpeed * (SIM.MIN_POWER + (1 - SIM.MIN_POWER) * p);
    a.power = p;
    a.v = { vx: (-dx / L) * sp, vy: (-dy / L) * sp };
    a.preview = this._preview(a.v);
    this.audio.chargeSet(p);
    const step4 = Math.floor(p * 4 + 1e-6);
    if (step4 !== a.lastTick) {
      a.lastTick = step4;
      if (step4 >= 4) { haptics.medium(); this.audio.play('tick', { rate: 1.6, vol: 1.2 }); } else { haptics.tick(); this.audio.play('tick', { rate: 0.8 + step4 * 0.2 }); }
    }
  }

  pointerUp() {
    const a = this.aim;
    this.audio.chargeStop();
    this.aim = null;
    if (!a || !a.v || this.state !== 'aim') return;
    this.launch(a.v.vx, a.v.vy, a.power);
  }

  _preview(v) {
    const sec = (this.level.preview ?? 0.22) * (ASSIST[this.store.d.settings.assist] ?? 1);
    const dist = sec * PREVIEW_PX;
    const s = makeShip(this.world, v.vx, v.vy);
    const pts = [[s.x, s.y]];
    let len = 0, out = OUT.NONE;
    while (len < dist && s.t < 8) {
      const px = s.x, py = s.y;
      out = step(this.world, s, null);
      len += Math.hypot(s.x - px, s.y - py);
      pts.push([s.x, s.y]);
      if (out) break;
    }
    placeBodies(this.world, 0);
    return { pts, out };
  }

  // ------------------------------------------------------------------ flight
  launch(vx, vy, power = 0.5) {
    this.state = 'fly';
    this.attempts++;
    this.flight = makeShip(this.world, vx, vy);
    this.flight.power = power;
    this.acc = 0;
    this.trail = [[this.flight.x, this.flight.y]];
    this.got = 0;
    this.runScore = { close: 0, assist: 0 };
    const ang = Math.atan2(vy, vx);
    this.fx.burst(this.flight.x, this.flight.y, { n: 26, speed: 260 + power * 260, life: 0.6, color: '120,220,255', dir: ang + Math.PI, spread: 1.2 });
    this.fx.ring(this.flight.x, this.flight.y, { max: 70 + power * 60, dur: 0.4, color: '150,230,255', width: 3 });
    this.fx.shake(0.12 + power * 0.18);
    this.fx.punch = -0.025 - power * 0.02;
    this.audio.play('launch', { rate: 0.9 + power * 0.35, vol: 0.8 + power * 0.4 });
    haptics.medium();
    this.ui.hud?.({ stars: 0, attempts: this.attempts });
    this.ui.onLaunch?.();
  }

  update(dt) {
    this.time += dt;
    this._shx = Math.random() * 2 - 1; this._shy = Math.random() * 2 - 1;
    if (this.paused) return;
    const ts = this.fx.timeScale();
    const sdt = dt * ts;
    this.fx.update(dt, sdt);
    if (this.shipAnim.scale < 1 && this.state === 'aim') this.shipAnim.scale = Math.min(1, this.shipAnim.scale + dt * 4);

    if (this.state === 'fly') this._fly(sdt);
    if (this.state === 'warpin') this._warpIn(sdt);
    if (this.state === 'spaghetti') this._spaghetti(sdt);
    if (this.state === 'dead') { this.deadT -= dt; if (this.deadT <= 0) this.resetShot(); }

    // camera: lean toward the ship while it flies
    let gx = 0, gy = 0;
    if (this.flight && (this.state === 'fly')) { gx = this.flight.x * 0.12; gy = this.flight.y * 0.12; }
    const k = 1 - Math.exp(-dt * 3);
    this.cam.x += (gx - this.cam.x) * k; this.cam.y += (gy - this.cam.y) * k;
  }

  _fly(sdt) {
    const f = this.flight;
    this.acc += sdt * this.level.warp * this.userWarp;
    let n = 0;
    const events = [];
    while (this.acc >= SIM.DT && n < 60) {
      this.acc -= SIM.DT; n++;
      const out = step(this.world, f, events);
      if (n % 2 === 0 || out) {
        const last = this.trail[this.trail.length - 1];
        if (!last || Math.hypot(last[0] - f.x, last[1] - f.y) > 4) this.trail.push([f.x, f.y]);
      }
      if (events.length) { for (const e of events) this._event(e); events.length = 0; }
      if (out) { this._finish(out); return; }
    }
    // thruster/engine particles for the first moments, then a faint exhaust
    const sp = Math.hypot(f.vx, f.vy);
    if (Math.random() < (f.t < 0.35 ? 1 : 0.35)) {
      const a = Math.atan2(f.vy, f.vx) + Math.PI;
      this.fx.burst(f.x, f.y, { n: 1, speed: 60 + sp * 0.08, life: 0.45, color: f.t < 0.35 ? '255,170,80' : '120,200,255', dir: a, spread: 0.6, size: 2.2 });
    }
  }

  _event(e) {
    const f = this.flight;
    switch (e.type) {
      case 'shard': {
        this.got = this.flight.got;
        this.fx.burst(e.x, e.y, { n: 36, speed: 320, life: 0.8, color: '255,214,110', size: 3.2 });
        this.fx.ring(e.x, e.y, { max: 90, dur: 0.45, color: '255,214,110', width: 4 });
        this.fx.pop('★', e.x, e.y - 30, { color: '#ffd166', size: 40, dur: 0.9 });
        this.audio.play('shard', { rate: [1, 1.26, 1.5][e.count - 1] || 1.5, vol: 1 });
        haptics.light();
        this.ui.hud?.({ stars: e.count, attempts: this.attempts, pulse: true });
        break;
      }
      case 'close': {
        const b = e.body;
        if (b.kind === 'blackhole') break;
        this.runScore.close++;
        this.fx.slowMo(0.55, 0.32);
        this.fx.edge = 1; this.fx.edgeColor = '94,232,255';
        this.fx.pop('CLOSE CALL', f.x, f.y - 46, { color: '#5ee8ff', size: 28, sub: '+250', dur: 1.2 });
        this.audio.play('close', { vol: 0.9 });
        haptics.light();
        break;
      }
      case 'assist': {
        this.runScore.assist++;
        this.fx.pop('GRAVITY ASSIST', e.x, e.y - 46, { color: '#7dffb2', size: 26, sub: `+${Math.round(e.gain * 100)}% speed from ${BODIES[e.body.key].name}`, dur: 1.6 });
        this.fx.ring(e.x, e.y, { max: 160, dur: 0.6, color: '125,255,178', width: 4 });
        this.audio.play('assist');
        haptics.medium();
        break;
      }
      case 'atmo': {
        this.fx.pop('AEROBRAKING', f.x, f.y - 40, { color: '#ffc27a', size: 22, sub: `${BODIES[e.body.key].name}'s air slows you`, dur: 1.3 });
        this.audio.play('aero', { vol: 0.8 });
        this.fx.shake(0.15);
        haptics.tick();
        break;
      }
    }
  }

  _finish(out) {
    const f = this.flight;
    const ghost = { pts: this.trail.slice(), out, end: [f.x, f.y] };
    this.ghosts.unshift(ghost);
    if (this.ghosts.length > 3) this.ghosts.pop();
    if (out === OUT.TARGET) {
      this.state = 'warpin';
      this.warp = { t: 0, x0: f.x, y0: f.y, ang: Math.atan2(f.vy, f.vx) };
      const tg = this.world.target;
      this.fx.slowMo(0.6, 0.35);
      this.fx.ring(tg.x, tg.y, { max: 260, dur: 0.8, color: '125,255,178', width: 6 });
      this.fx.burst(tg.x, tg.y, { n: 60, speed: 420, life: 1.1, color: '125,255,178', size: 3 });
      this.audio.play('portal');
      haptics.success();
      return;
    }
    this.state = 'dead';
    this.deadT = 1.0;
    const near = this._nearestBody(f.x, f.y);
    if (out === OUT.CRASH) {
      const sp = Math.hypot(f.vx, f.vy);
      const real = near ? (sp / escapeSpeed(near)) * BODIES[near.key].escKms : 0;
      this.fx.burst(f.x, f.y, { n: 70, speed: 460, life: 1.0, color: '255,150,70', size: 3.4 });
      this.fx.burst(f.x, f.y, { n: 24, speed: 200, life: 0.7, color: '255,240,200', size: 2.4 });
      this.fx.ring(f.x, f.y, { max: 150, dur: 0.5, color: '255,140,80' });
      this.fx.shake(0.8); this.fx.doFlash(255, 90, 60, 0.28);
      this.audio.play('crash');
      haptics.heavy();
      this.ui.onFail?.({ title: 'IMPACT', sub: near ? `Hit ${BODIES[near.key].name} at ${real.toFixed(1)} km/s` : '' });
    } else if (out === OUT.RING) {
      this.fx.burst(f.x, f.y, { n: 70, speed: 380, life: 1.0, color: '200,230,255', size: 2.6 });
      this.fx.shake(0.6); this.fx.doFlash(180, 220, 255, 0.25);
      this.audio.play('crash', { rate: 1.3 });
      haptics.heavy();
      this.ui.onFail?.({ title: 'SHREDDED', sub: 'Saturn\'s rings are billions of ice chunks. Fly the Cassini Division.' });
    } else if (out === OUT.HORIZON) {
      this.state = 'spaghetti';
      this.spag = { t: 0, bh: near, x: f.x, y: f.y };
      this.audio.play('horizon');
      haptics.heavy();
      this.fx.doFlash(120, 40, 160, 0.3);
      this.ui.onFail?.({ title: 'EVENT HORIZON', sub: 'Past r = 2GM/c², even light cannot escape.' });
    } else {
      this.audio.play('lost');
      haptics.light();
      this.deadT = 0.7;
      this.ui.onFail?.({ title: 'LOST IN SPACE', sub: f.t > SIM.MAX_T - 0.1 ? 'Stuck in orbit. Too slow to escape!' : 'Too fast — gravity could not bend you back.' });
    }
  }

  _nearestBody(x, y) {
    let best = null, bd = Infinity;
    for (const b of this.world.bodies) { const d = Math.hypot(b.x - x, b.y - y) - b.r; if (d < bd) { bd = d; best = b; } }
    return best;
  }

  _warpIn(sdt) {
    const w = this.warp, tg = this.world.target;
    w.t += sdt;
    const k = Math.min(1, w.t / 0.7);
    const a = w.ang + k * Math.PI * 3;
    const r = (1 - k) * Math.hypot(w.x0 - tg.x, w.y0 - tg.y);
    this.flight.x = tg.x + Math.cos(a) * r; this.flight.y = tg.y + Math.sin(a) * r;
    this.shipAnim.scale = 1 - k * k;
    if (k >= 1 && this.state === 'warpin') {
      this.state = 'won';
      this.fx.doFlash(200, 255, 230, 0.45);
      this.fx.shake(0.3);
      const stars = popcount(this.flight.got);
      const score = 1000 + stars * 500 + this.runScore.close * 250 + this.runScore.assist * 400 + Math.max(0, 4 - this.attempts) * 150;
      const rec = this.store.complete(this.index, this.level.id, stars, score);
      this.ui.onWin?.({ stars, score, attempts: this.attempts, close: this.runScore.close, assist: this.runScore.assist, ...rec });
    }
  }

  _spaghetti(sdt) {
    const s = this.spag;
    s.t += sdt;
    const bh = s.bh;
    const k = Math.min(1, s.t / 1.2);
    this.flight.x = s.x + (bh.x - s.x) * k * k;
    this.flight.y = s.y + (bh.y - s.y) * k * k;
    this.shipAnim.stretch = 1 + k * 6;
    this.shipAnim.scale = 1 - k * 0.9;
    if (k >= 1) { this.state = 'dead'; this.deadT = 0.3; this.shipAnim.stretch = 1; }
  }

  // ------------------------------------------------------------------ test hooks
  testLaunchAngle(a, p) {
    const sp = this.world.maxSpeed * (SIM.MIN_POWER + (1 - SIM.MIN_POWER) * p);
    this.launch(Math.cos(a) * sp, Math.sin(a) * sp, p);
  }
}
