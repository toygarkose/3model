import * as THREE from 'three';
import { Footballer, Look, Pose, pose, runPose, jockeyPose, slidePose, diveFallPose, sideFallPose } from './character';
import { World, GZ, HALF_W, BACK_Z, GOAL_W, GOAL_H } from './world';
import { Particles } from './fx';
import { Sfx } from './audio';
import { makeBallTexture } from './cosmetics';

export interface Stats { score: number; goals: number; dribbles: number; longest: number }
export interface Hooks {
  popup(text: string, kind: 'perfect' | 'good' | 'warn'): void;
  hud(score: number, lives: number, time: number): void;
  over(s: Stats): void;
}

const BALL_R = 0.15, PLAYER_SPEED = 7.6, ROUND_TIME = 22, START_Z = 20;

interface Def {
  fb: Footballer; x: number; z: number; hx: number; hz: number; heading: number; phase: number;
  state: 'guard' | 'windup' | 'dash' | 'down'; t: number; dx: number; dz: number; cd: number; slide: boolean; beaten: boolean;
  marker: THREE.Mesh;
}
type Mode = 'menu' | 'play' | 'shot' | 'result' | 'over';

const turn = (a: number, b: number, k: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class Game {
  mode: Mode = 'menu';
  private world: World; private player: Footballer; private keeper: Footballer;
  private ball: THREE.Mesh; private ballMat: THREE.MeshStandardMaterial;
  private fx = new Particles(); private defs: Def[] = []; private pool: Footballer[] = [];
  private rival!: Look;
  private px = 0; private pz = START_Z; private vx = 0; private vz = 0; private heading = Math.PI; private phase = 0;
  private stickX = 0; private stickY = 0;
  private bv = new THREE.Vector3(); private shotT = 0; private shotFrom = 0; private kickT = 9;
  private kx = 0; private kz = GZ + 0.8; private plan: { t: number; x: number; y: number; save: boolean; from: number; dir: number; dive: boolean } | null = null;
  private resolved = false; private goalScored = false; private resultT = 0; private fallen = false;
  private level = 0; private lives = 3; private time = ROUND_TIME; private freeze = 0; private slow = 0; private shake = 0;
  private stats: Stats = { score: 0, goals: 0, dribbles: 0, longest: 0 };
  private lungeCd = 0; private clock = 0; private lastCycle = 0; private camPos = new THREE.Vector3(0, 7, 30); private camLook = new THREE.Vector3(0, 1, 10);
  private ringGeo = new THREE.RingGeometry(0.62, 0.8, 40);

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private sfx: Sfx, private hooks: Hooks, look: Look) {
    this.world = new World(scene);
    this.player = new Footballer(look); scene.add(this.player.root);
    this.keeper = new Footballer(look); scene.add(this.keeper.root);
    this.ballMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.ballMat); this.ball.castShadow = true; scene.add(this.ball);
    scene.add(this.fx.points);
    this.toMenu();
  }

  setPlayerLook(l: Look) { this.player.setLook(l); }
  setRivalLook(l: Look) {
    this.rival = l; for (const f of this.pool) f.setLook(l); for (const d of this.defs) d.fb.setLook(l);
    this.keeper.setLook({ ...l, number: 1, kit: { name: 'gk', a: '#c6ff3a', b: '#1b1b2a', pattern: 'chest', shorts: '#1b1b2a', socks: '#c6ff3a', num: '#1b1b2a' } });
  }
  setBall(b: { base: string; patch: string; style: string }) { const o = this.ballMat.map; this.ballMat.map = makeBallTexture(b); this.ballMat.needsUpdate = true; o?.dispose(); }
  setStick(x: number, y: number) { this.stickX = x; this.stickY = y; }

  toMenu() {
    this.mode = 'menu'; this.clearDefs();
    this.player.root.position.set(0, 0, 0); this.px = 0; this.pz = 0;
    this.kx = 0; this.kz = GZ + 0.8; this.keeper.root.position.set(0, 0, this.kz); this.keeper.baseYaw = 0;
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
  }

  start() {
    this.level = 0; this.lives = 3; this.stats = { score: 0, goals: 0, dribbles: 0, longest: 0 };
    this.camera.fov = 66; this.camera.updateProjectionMatrix();
    this.newRound();
  }

  private clearDefs() { for (const d of this.defs) { this.scene.remove(d.fb.root, d.marker); (d.marker.material as THREE.Material).dispose(); this.pool.push(d.fb); } this.defs.length = 0; }

  private newRound() {
    this.clearDefs();
    this.mode = 'play'; this.px = (Math.random() - 0.5) * 16; this.pz = START_Z; this.vx = this.vz = 0; this.heading = Math.PI; this.phase = 0;
    this.time = ROUND_TIME; this.freeze = 0.7; this.resolved = false; this.goalScored = false; this.fallen = false; this.plan = null; this.kickT = 9;
    this.kx = 0; this.kz = GZ + 0.8;
    const n = Math.min(6, 2 + Math.floor((this.level + 1) / 2));
    // savunma hattı: seviye arttıkça sıra sayısı ve oyuncu sayısı artar
    const rows = [[GZ + 21], [GZ + 12, GZ + 24], [GZ + 10, GZ + 18, GZ + 27]][Math.min(2, Math.floor((n - 1) / 2))];
    for (let i = 0; i < n; i++) {
      const row = rows[i % rows.length], inRow = Math.ceil((n - (i % rows.length)) / rows.length), k = Math.floor(i / rows.length);
      const x = (inRow === 1 ? 0 : (k / (inRow - 1) - 0.5) * 20) + (Math.random() - 0.5) * 5;
      this.addDef(clamp(x, -15, 15), row + (Math.random() - 0.5) * 3);
    }
    this.ball.position.set(this.px, BALL_R, this.pz - 0.7);
    this.player.setPose(pose(), 0);
    this.sfx.whistle(); this.sfx.crowd(0.25);
    this.camPos.set(this.px * 0.8, 7.2, this.pz + 8.6); this.camLook.set(this.px * 0.6, 1.2, this.pz - 9);
    this.hooks.hud(this.stats.score, this.lives, 1);
  }

  private addDef(x: number, z: number) {
    const fb = this.pool.pop() || new Footballer(this.rival);
    const marker = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    marker.rotation.x = -Math.PI / 2;
    this.scene.add(fb.root, marker);
    this.defs.push({ fb, x, z, hx: x, hz: z, heading: 0, phase: Math.random() * 6, state: 'guard', t: Math.random() * 3, dx: 0, dz: 1, cd: 0.5, slide: false, beaten: false, marker });
  }

  // ---------- şut ----------
  /** ang: 0 = dümdüz kaleye, + sağa (radyan). power ve loft 0..1 */
  shoot(ang: number, power: number, loft: number) {
    if (this.mode !== 'play' || this.freeze > 0) return;
    ang = clamp(ang, -1.15, 1.15); power = clamp(power, 0, 1); loft = clamp(loft, 0, 1);
    const sp = 18 + power * 13, b = this.ball.position;
    this.heading = Math.PI - ang; this.kickT = 0;
    b.set(this.px + Math.sin(ang) * 0.6, BALL_R, this.pz - Math.cos(ang) * 0.6);
    this.bv.set(Math.sin(ang) * sp, 1.5 + loft * 8, -Math.cos(ang) * sp);
    this.mode = 'shot'; this.shotT = 0; this.shotFrom = Math.hypot(this.px, this.pz - GZ); this.resolved = false;
    this.sfx.kick(power); this.fx.emit(b.clone(), 0xffffff, 10, 3, 0.7, 0.4);
    // kaleci planı: top kalecinin hizasına ne zaman, nerede gelecek?
    const t = (this.kz - b.z) / this.bv.z;
    if (t > 0) {
      const x = b.x + this.bv.x * t, y = Math.max(BALL_R, b.y + this.bv.y * t - 4.9 * t * t);
      const react = Math.max(0.13, 0.3 - this.level * 0.012), speed = Math.min(7, 5.0 + this.level * 0.16);
      const reach = 0.85 + speed * Math.max(0, t - react);
      const onTarget = Math.abs(x) < GOAL_W + 0.6 && y < GOAL_H + 0.4;
      this.plan = { t, x, y, save: onTarget && Math.abs(x - this.kx) <= reach && y < 2.45, from: this.kx, dir: Math.sign(x - this.kx) || 1, dive: onTarget && Math.abs(x - this.kx) > 0.9 };
    } else this.plan = null;
  }

  private endRound(text: string, kind: 'perfect' | 'warn', goal: boolean) {
    if (this.resolved) return;
    this.resolved = true; this.mode = 'result'; this.resultT = 0; this.goalScored = goal;
    if (goal) {
      const far = this.shotFrom >= 20, corner = Math.abs(this.ball.position.x) > 2.6 && this.ball.position.y > 1.6;
      const pts = 500 + (far ? 300 : 0) + (corner ? 300 : 0) + Math.ceil(this.time) * 10;
      this.stats.score += pts; this.stats.goals++; this.stats.longest = Math.max(this.stats.longest, Math.round(this.shotFrom)); this.level++;
      this.hooks.popup('GOOOL!', 'perfect'); if (corner) this.hooks.popup('DOKSAN!', 'good'); else if (far) this.hooks.popup('UZAKTAN!', 'good');
      this.hooks.popup('+' + pts, 'good');
      this.sfx.goal(); this.sfx.crowd(1); this.slow = 0.5; this.shake = 0.35;
      for (let i = 0; i < 4; i++) this.fx.emit(new THREE.Vector3((Math.random() - 0.5) * 8, 3 + Math.random() * 2, GZ + 2), [0xffd23f, 0xff4d6d, 0x39f0c8, 0xffffff][i], 30, 7, 0.8, 1.6, 5);
      try { navigator.vibrate?.([30, 40, 60]); } catch { /* yok */ }
    } else {
      this.lives--; this.hooks.popup(text, kind); this.sfx.crowd(0.08);
    }
    this.hooks.hud(this.stats.score, this.lives, this.time / ROUND_TIME);
  }

  // ---------- ana döngü ----------
  update(dtReal: number) {
    this.clock += dtReal;
    if (this.mode === 'menu') return this.updateMenu(dtReal);
    this.slow = Math.max(0, this.slow - dtReal);
    const dt = dtReal * (this.slow > 0 ? 0.3 : 1);
    this.freeze = Math.max(0, this.freeze - dt);
    const playing = this.mode === 'play' && this.freeze <= 0;

    // oyuncu
    let tx = 0, tz = 0;
    if (playing) { const m = Math.hypot(this.stickX, this.stickY), k = m > 1 ? 1 / m : 1; tx = this.stickX * k * PLAYER_SPEED; tz = this.stickY * k * PLAYER_SPEED; }
    const acc = 1 - Math.exp(-(playing ? 11 : 5) * dt);
    this.vx += (tx - this.vx) * acc; this.vz += (tz - this.vz) * acc;
    this.px = clamp(this.px + this.vx * dt, -HALF_W, HALF_W); this.pz = clamp(this.pz + this.vz * dt, GZ + 0.7, BACK_Z);
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.4 && this.kickT > 0.3) this.heading = turn(this.heading, Math.atan2(this.vx, this.vz), 1 - Math.exp(-14 * dt));
    this.phase += sp * dt * 1.85; this.kickT += dt;
    this.player.root.position.set(this.px, 0, this.pz); this.player.baseYaw = this.heading;
    this.player.setPose(this.playerPose(sp), dt, 20);

    if (playing) {
      this.time -= dt;
      if (this.time <= 0) { this.sfx.whistle(true); this.endRound('SÜRE DOLDU', 'warn', false); }
    }
    this.updateDefs(dt);
    this.updateKeeper(dt);
    this.updateBall(dt, sp);
    if (this.mode === 'shot') this.updateShot(dt);
    if (this.mode === 'result') {
      this.resultT += dtReal;
      if (this.resultT > (this.goalScored ? 2.4 : 1.7)) {
        if (this.lives <= 0) { this.mode = 'over'; this.sfx.whistle(true); this.hooks.over(this.stats); } else this.newRound();
      }
    }
    if (this.mode === 'play') this.hooks.hud(this.stats.score, this.lives, this.time / ROUND_TIME);
    this.fx.update(dt, 0);
    this.world.follow(this.px, this.pz);
    this.updateCamera(dtReal);
  }

  private playerPose(sp: number): Pose {
    if (this.fallen) return diveFallPose(this.resultT);
    if (this.mode === 'result' && this.goalScored) { const w = Math.sin(this.clock * 12); return pose({ shL: 2.9, shR: 2.9, saL: 0.45, saR: 0.45, elL: 0.2, elR: 0.2, y: Math.abs(w) * 0.12, pitch: -0.1 }); }
    if (this.kickT < 0.32) { const u = this.kickT / 0.32; return pose({ pitch: -0.1 + 0.25 * u, twist: -0.4 + 0.8 * u, thR: -0.7 + 2.3 * Math.min(1, u * 1.6), knR: 1.1 * (1 - u), thL: 0.1, knL: 0.25, shL: 0.9 - u, shR: -0.8, saL: 0.9, saR: 0.7, elL: 0.4, elR: 0.4 }); }
    if (sp < 0.6) { const w = Math.sin(this.clock * 2.4); return pose({ pitch: 0.06, thL: 0.12, thR: 0.12, knL: 0.22, knR: 0.22, abL: 0.1, abR: 0.1, saL: 0.25 + 0.03 * w, saR: 0.25 - 0.03 * w, elL: 0.5, elR: 0.5 }); }
    return runPose(this.phase, Math.min(1, sp / 6), 0.08 + 0.12 * Math.min(1, sp / PLAYER_SPEED));
  }

  private updateBall(dt: number, sp: number) {
    const b = this.ball;
    if (this.mode === 'play') {
      // adımlarla eşzamanlı top sürme: ayaktan açılır, oyuncu yetişir, diğer ayakla tekrar iter
      const q = (this.phase - Math.PI * 1.5) / (Math.PI * 3), cyc = q - Math.floor(q), side = Math.floor(q) % 2 === 0 ? 1 : -1;
      if (cyc < this.lastCycle && sp > 2) { this.sfx.touch(); this.fx.emit(b.position.clone().setY(0.05), 0x7dff9a, 3, 1.2, 0.6, 0.3); }
      this.lastCycle = cyc;
      const run = Math.min(1, sp / PLAYER_SPEED), c = Math.pow(cyc, 0.75);
      const fwd = 0.55 + run * 0.75 * 4 * c * (1 - c), lat = side * 0.22 * run * (2 * Math.min(1, cyc * 1.6) - 1);
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const k = 1 - Math.exp(-22 * dt), ox = b.position.x, oz = b.position.z;
      b.position.x += (this.px + fx * fwd + fz * lat - ox) * k; b.position.z += (this.pz + fz * fwd - fx * lat - oz) * k; b.position.y = BALL_R;
      this.spin(b.position.x - ox, b.position.z - oz);
    } else if (this.mode !== 'shot') {
      const ox = b.position.x, oz = b.position.z;
      this.bv.y -= 9.8 * dt; b.position.addScaledVector(this.bv, dt);
      if (b.position.y < BALL_R) { b.position.y = BALL_R; this.bv.y = Math.abs(this.bv.y) * 0.5; const f = Math.exp(-1.6 * dt); this.bv.x *= f; this.bv.z *= f; }
      this.netClamp(); this.spin(b.position.x - ox, b.position.z - oz);
    }
  }
  private spin(dx: number, dz: number) { const d = Math.hypot(dx, dz); if (d > 1e-5) this.ball.rotateOnWorldAxis(new THREE.Vector3(dz / d, 0, -dx / d), d / BALL_R); }
  private netClamp() {
    const b = this.ball.position;
    if (this.goalScored && b.z < GZ) { if (b.z < GZ - 1.75) { b.z = GZ - 1.75; this.bv.z = 0; this.bv.x *= 0.3; } b.x = clamp(b.x, -GOAL_W + 0.3, GOAL_W - 0.3); b.y = Math.min(b.y, GOAL_H - 0.3); this.bv.multiplyScalar(0.96); }
  }

  private updateShot(dt: number) {
    const b = this.ball.position, v = this.bv, pzv = b.z, ox = b.x;
    this.shotT += dt;
    v.y -= 9.8 * dt; b.addScaledVector(v, dt);
    if (b.y < BALL_R) { b.y = BALL_R; v.y = Math.abs(v.y) * 0.55; v.x *= 0.93; v.z *= 0.93; }
    this.spin(b.x - ox, b.z - pzv);
    if (Math.random() < 0.6) this.fx.emit(b.clone(), 0xffe9a8, 1, 0.4, 0.5, 0.3, 0);
    // savunmacı bloğu
    for (const d of this.defs) if (d.state !== 'down' && b.y < 1.85 && Math.hypot(d.x - b.x, d.z - b.z) < 0.6) {
      v.set((Math.random() - 0.5) * 6, 3 + Math.random() * 2, Math.abs(v.z) * 0.25); this.sfx.touch(); return this.endRound('BLOK!', 'warn', false);
    }
    // kaleci
    const p = this.plan;
    if (p && p.save && this.shotT >= p.t) {
      v.set(p.dir * (3 + Math.random() * 4), 2.5 + Math.random() * 2, 3 + Math.random() * 3); this.sfx.touch(); this.shake = 0.2;
      this.fx.emit(b.clone(), 0xc6ff3a, 14, 4, 0.8, 0.5); return this.endRound('KALECİ KURTARDI', 'warn', false);
    }
    // kale çizgisi
    if (pzv > GZ && b.z <= GZ) {
      const ax = Math.abs(b.x);
      if (ax < GOAL_W - 0.12 && b.y < GOAL_H - 0.12) return this.endRound('', 'perfect', true);
      if (ax < GOAL_W + 0.22 && b.y < GOAL_H + 0.22) { b.z = GZ + 0.05; v.z = Math.abs(v.z) * 0.45; v.x *= -0.4; v.y = Math.abs(v.y) * 0.5 + 1; this.sfx.post(); this.shake = 0.25; return this.endRound('DİREK!', 'warn', false); }
      return this.endRound('AUT', 'warn', false);
    }
    if (Math.abs(b.x) > HALF_W + 3 || this.shotT > 3.2 || (this.shotT > 0.6 && v.length() < 2.5)) this.endRound('KAÇTI', 'warn', false);
  }

  private updateKeeper(dt: number) {
    const k = this.keeper, p = this.plan, b = this.ball.position;
    let target: Pose;
    if (p && this.mode !== 'play') {
      const react = Math.max(0.13, 0.3 - this.level * 0.012), u = clamp((this.shotT - react) / Math.max(0.05, p.t - react), 0, 1);
      const maxMove = p.save ? Math.abs(p.x - p.from) : Math.min(Math.abs(p.x - p.from), 0.85 + Math.min(7, 5 + this.level * 0.16) * Math.max(0, p.t - react)) * 0.85;
      if (this.mode === 'shot') this.kx = p.from + p.dir * maxMove * u;
      if (p.dive && u > 0) {
        target = sideFallPose(u * 0.4 + (this.resolved ? this.resultT : 0), p.dir);
        target.y += Math.min(1.2, p.y * 0.6) * Math.sin(Math.PI * Math.min(1, u)) * (this.resolved ? Math.max(0, 1 - this.resultT * 2) : 1); target.shL = target.shR = 2.8;
      } else target = pose({ thL: 0.4, thR: 0.4, knL: 0.7, knR: 0.7, abL: 0.3, abR: 0.3, shL: 1.2 + p.y * 0.5, shR: 1.2 + p.y * 0.5, saL: 0.3, saR: 0.3, elL: 0.3, elR: 0.3 });
    } else {
      const dist = Math.hypot(this.px, this.pz - GZ), out = clamp((14 - dist) / 14, 0, 1) * 2.6;
      const tx = clamp(b.x * 0.32, -2.7, 2.7), tz = GZ + 0.8 + out;
      const step = 4.2 * dt; this.kx += clamp(tx - this.kx, -step, step); this.kz += clamp(tz - this.kz, -step, step);
      target = jockeyPose(this.clock); target.saL = target.saR = 1.15;
      if (this.mode === 'play' && this.freeze <= 0 && Math.hypot(this.px - this.kx, this.pz - this.kz) < 1.25) this.tackle('KALECİ TOPU ALDI');
    }
    k.root.position.set(this.kx, 0, this.kz); k.baseYaw = 0; k.setPose(target, dt, 16);
  }

  private tackle(text: string) {
    this.fallen = true; this.bv.set((Math.random() - 0.5) * 6, 3, 2 + Math.random() * 3); this.shake = 0.45; this.slow = 0.3;
    this.sfx.fail(); this.fx.emit(new THREE.Vector3(this.px, 0.4, this.pz), 0xff4d6d, 20, 4, 1, 0.6);
    try { navigator.vibrate?.([40, 40, 80]); } catch { /* yok */ }
    this.endRound(text, 'warn', false);
  }

  private updateDefs(dt: number) {
    this.lungeCd -= dt;
    const live = this.mode === 'play' && this.freeze <= 0, speed = Math.min(6.8, 5.0 + this.level * 0.15);
    for (const d of this.defs) {
      d.t += dt; d.cd -= dt;
      const ddx = this.px - d.x, ddz = this.pz - d.z, dist = Math.hypot(ddx, ddz);
      const mm = d.marker.material as THREE.MeshBasicMaterial;
      let target: Pose, moved = 0;
      if (d.state === 'guard') {
        // top yakınsa üstüne gelir, değilse bölgesini korur
        const engage = live && (dist < 13 + this.level * 0.5 || this.pz < d.hz + 5);
        let tx = d.hx + clamp(this.px - d.hx, -4, 4) * 0.5, tz = d.hz;
        if (engage) { tx = this.px + this.vx * 0.3; tz = this.pz + this.vz * 0.3 - (d.z < this.pz ? 0.6 : 0); }
        const mx = tx - d.x, mz = tz - d.z, ml = Math.hypot(mx, mz);
        for (const o of this.defs) if (o !== d) { const sx = d.x - o.x, sz = d.z - o.z, sl = Math.hypot(sx, sz); if (sl < 1.8 && sl > 0.01) { d.x += sx / sl * dt * 3; d.z += sz / sl * dt * 3; } }
        if (ml > 0.3) { const s = Math.min(engage ? speed : speed * 0.6, ml * 4); d.x += mx / ml * s * dt; d.z += mz / ml * s * dt; moved = s; }
        d.heading = turn(d.heading, Math.atan2(ddx, ddz), 1 - Math.exp(-10 * dt));
        d.phase += moved * dt * 2; target = moved > 1.5 ? runPose(d.phase, Math.min(1, moved / 5), 0.2) : jockeyPose(d.t);
        mm.color.setHex(0xffffff); mm.opacity = 0.3; d.marker.scale.setScalar(1);
        if (live && dist < 2.5 && d.cd <= 0 && this.lungeCd <= 0) { d.state = 'windup'; d.t = 0; d.slide = Math.random() < 0.5; this.lungeCd = Math.max(0.35, 0.9 - this.level * 0.05); }
      } else if (d.state === 'windup') {
        // hamle öncesi kısa hazırlık: halka kırmızıya döner, oyuncunun yön değiştirme anı
        target = pose({ pitch: 0.45, thL: 0.8, thR: 0.2, knL: 1.2, knR: 0.9, saL: 0.6, saR: 0.6, elL: 1.2, elR: 1.2 });
        d.heading = turn(d.heading, Math.atan2(ddx, ddz), 1 - Math.exp(-14 * dt));
        mm.color.setHex(0xff4d6d); mm.opacity = 1; d.marker.scale.setScalar(1.25 + 0.2 * Math.sin(d.t * 40));
        if (d.t >= Math.max(0.22, 0.32 - this.level * 0.01)) {
          const ax = this.px + this.vx * 0.12 - d.x, az = this.pz + this.vz * 0.12 - d.z, al = Math.hypot(ax, az) || 1;
          d.dx = ax / al; d.dz = az / al; d.heading = Math.atan2(d.dx, d.dz); d.state = 'dash'; d.t = 0; d.beaten = true; this.sfx.drag();
        }
      } else if (d.state === 'dash') {
        const s = 11 * Math.max(0.25, 1 - d.t / 0.42); d.x += d.dx * s * dt; d.z += d.dz * s * dt;
        target = d.slide ? slidePose() : diveFallPose(d.t * 0.8);
        mm.opacity = 0; if (Math.random() < 0.6) this.fx.emit(new THREE.Vector3(d.x, 0.1, d.z), 0x9dffb0, 1, 1.5, 0.8, 0.3);
        if (live && Math.hypot(this.ball.position.x - d.x, this.ball.position.z - d.z) < 0.72) { d.beaten = false; this.tackle('TOP KAPTIRILDI'); }
        if (d.t >= 0.34) {
          d.state = 'down'; d.t = 0;
          if (d.beaten && this.mode === 'play') { this.stats.dribbles++; this.stats.score += 100; this.hooks.popup('ÇALIM! +100', 'good'); this.sfx.good(this.stats.dribbles); this.sfx.crowd(0.5); this.fx.emit(new THREE.Vector3(d.x, 1, d.z), 0xffd23f, 14, 4, 0.9, 0.6); }
        }
      } else {
        const s = 4 * Math.exp(-d.t * 5); d.x += d.dx * s * dt; d.z += d.dz * s * dt;
        target = d.slide ? slidePose() : diveFallPose(1); mm.opacity = 0;
        if (d.t > 1.9) { d.state = 'guard'; d.cd = 0.7; d.t = 0; }
      }
      d.x = clamp(d.x, -HALF_W, HALF_W); d.z = clamp(d.z, GZ + 1.5, BACK_Z);
      d.fb.root.position.set(d.x, 0, d.z); d.fb.baseYaw = d.heading; d.fb.setPose(target, dt, 16);
      d.marker.position.set(d.x, 0.03, d.z);
    }
  }

  private updateCamera(dt: number) {
    const cam = this.camera, b = this.ball.position;
    // kaleye yaklaştıkça kamera alçalır ve yaklaşır; şutta topu izler
    const near = clamp((this.pz - GZ) / 40, 0.25, 1), follow = this.mode === 'play' ? 0 : 0.55;
    const tp = new THREE.Vector3(this.px * 0.8, 4.6 + 2.6 * near, this.pz + 5.6 + 3.0 * near);
    const tl = new THREE.Vector3(this.px * 0.6 + (b.x - this.px) * follow, 1.2, this.pz - 9 + (b.z - this.pz) * follow * 0.6);
    const k = 1 - Math.exp(-6 * dt); this.camPos.lerp(tp, k); this.camLook.lerp(tl, k);
    this.shake = Math.max(0, this.shake - dt); const sh = this.shake * 0.6;
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z);
    cam.lookAt(this.camLook);
  }

  private updateMenu(dt: number) {
    const p = this.player, t = this.clock;
    p.baseYaw = t * 0.55;
    const w = Math.sin(t * 2);
    p.setPose(pose({ pitch: 0.03, twist: 0.06 * w, thR: 1.05, knR: 1.3, abR: 0.1, thL: -0.02, knL: 0.04, shL: 0.1 * w, shR: -0.1 * w, saL: 0.22, saR: 0.22, elL: 0.35, elR: 0.35, head: -0.05 }), dt, 8);
    const a = p.baseYaw, lx = -0.105, lz = 0.36;
    this.ball.position.set(lx * Math.cos(a) + lz * Math.sin(a), BALL_R, -lx * Math.sin(a) + lz * Math.cos(a));
    this.ball.rotation.set(0, a, 0);
    this.keeper.root.position.set(0, 0, GZ + 0.8); this.keeper.setPose(jockeyPose(t), dt, 10);
    this.fx.update(dt, 0); this.world.follow(0, 0);
    this.camera.position.set(0, 1.45, 8.6); this.camera.lookAt(0, 0.1, 0);
    this.camPos.copy(this.camera.position); this.camLook.set(0, 0.1, 0);
  }
}
