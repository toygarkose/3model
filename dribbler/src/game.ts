import * as THREE from 'three';
import { Footballer, Look, Pose, pose, runPose, jockeyPose, diveFallPose, sideFallPose } from './character';
import { World, GZ, HALF_W, BACK_Z, GOAL_W, GOAL_H, NET_D } from './world';
import { Particles } from './fx';
import { Sfx } from './audio';
import { makeBallTexture } from './cosmetics';

export interface Stats { goals: number; shots: number; streak: number; bestStreak: number; topSpeed: number }
export interface Hooks {
  popup(text: string, kind: 'perfect' | 'good' | 'warn'): void;
  hud(s: Stats): void;
  power(p: number, charging: boolean): void;
}

const BALL_R = 0.15, POST_R = 0.07, SPRINT = 9.6, G = 9.81;
const K_REACT = 0.2, K_ACC = 24, K_VMAX = 7, K_REACH = 0.9;   // kaleci: tepki süresi, ivme, azami hız, kol boyu

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const turn = (a: number, b: number, k: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
const vib = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* titreşim desteklenmiyor */ } };
/** Kalecinin tepki süresinden sonra t saniyede kat edebileceği mesafe */
const keeperTravel = (t: number) => { const tm = Math.max(0, t - K_REACT), tv = K_VMAX / K_ACC; return tm < tv ? 0.5 * K_ACC * tm * tm : 0.5 * K_ACC * tv * tv + K_VMAX * (tm - tv); };

interface Plan { T: number; x: number; y: number; from: number; dir: number; dist: number; reach: boolean; kind: 'catch' | 'parry' | 'tip'; done: boolean; dive: boolean }

export class Game {
  mode: 'menu' | 'play' = 'menu';
  private world: World; private player: Footballer; private keeper: Footballer;
  private ball: THREE.Mesh; private ballMat: THREE.MeshStandardMaterial; private reticle: THREE.Sprite;
  private fx = new Particles();
  // oyuncu
  private px = 0; private pz = 0; private vx = 0; private vz = 0; private heading = Math.PI; private phase = 0; private lastCycle = 0;
  private stickX = 0; private stickY = 0;
  // şut
  private charging = false; private chargeT = 0; private power = 0; private aim = new THREE.Vector2(0, 0.9); private aimBase = new THREE.Vector2();
  private strikeT = -1; private kickT = 9; private vibT = 0; private errR = 0.2;
  // top
  private ballState: 'held' | 'fly' | 'keeper' | 'gone' = 'held';
  private bv = new THREE.Vector3(); private curve = new THREE.Vector3(); private curveT = 0; private sinceKick = 9;
  private shotOpen = false; private inGoal = false; private hitPost = false; private respawnT = -1; private shotDist = 0; private celebrate = 0;
  // kaleci
  private kx = 0; private kz = GZ + 0.7; private kState: 'set' | 'dive' | 'down' | 'hold' = 'set'; private kT = 0; private plan: Plan | null = null;
  private stats: Stats = { goals: 0, shots: 0, streak: 0, bestStreak: 0, topSpeed: 0 };
  private clock = 0; private hitstop = 0; private slow = 0; private shake = 0;
  private camPos = new THREE.Vector3(0, 7, 30); private camLook = new THREE.Vector3(0, 1, 10); private fov = 66;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private sfx: Sfx, private hooks: Hooks, look: Look) {
    this.world = new World(scene);
    this.player = new Footballer(look); scene.add(this.player.root);
    this.keeper = new Footballer(look); scene.add(this.keeper.root);
    this.ballMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.ballMat); this.ball.castShadow = true; scene.add(this.ball);
    // nişan halkası: çapı o anki isabet payını gösterir
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    g.strokeStyle = '#ffd23f'; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
    g.lineWidth = 6; for (let i = 0; i < 4; i++) { g.save(); g.translate(64, 64); g.rotate(i * Math.PI / 2); g.beginPath(); g.moveTo(34, 0); g.lineTo(60, 0); g.stroke(); g.restore(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 6, 0, 7); g.fill();
    this.reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, fog: false, transparent: true }));
    this.reticle.renderOrder = 20; this.reticle.visible = false; scene.add(this.reticle);
    scene.add(this.fx.points);
    this.toMenu();
  }

  setPlayerLook(l: Look) { this.player.setLook(l); }
  setKeeperLook(l: Look) { this.keeper.setLook(l); }
  setBall(b: { base: string; patch: string; style: string }) { const o = this.ballMat.map; this.ballMat.map = makeBallTexture(b); this.ballMat.needsUpdate = true; o?.dispose(); }
  setStick(x: number, y: number) { this.stickX = x; this.stickY = y; }
  getStats() { return this.stats; }

  toMenu() {
    this.mode = 'menu'; this.cancelCharge(); this.reticle.visible = false;
    this.px = 0; this.pz = 0; this.player.root.position.set(0, 0, 0);
    this.kx = 0; this.kz = GZ + 0.7; this.kState = 'set'; this.plan = null;
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
  }

  start() {
    this.mode = 'play'; this.stats = { goals: 0, shots: 0, streak: 0, bestStreak: 0, topSpeed: 0 };
    this.px = 0; this.pz = GZ + 26; this.vx = this.vz = 0; this.heading = Math.PI; this.kState = 'set'; this.plan = null; this.kx = 0;
    this.giveBall(); this.celebrate = 0; this.respawnT = -1;
    this.camPos.set(0, 6, this.pz + 8); this.camLook.set(0, 1.2, this.pz - 9); this.fov = 66;
    this.sfx.whistle(); this.sfx.crowd(0.25); this.hooks.hud(this.stats);
  }

  private giveBall() {
    this.ballState = 'held'; this.shotOpen = false; this.inGoal = false; this.hitPost = false; this.respawnT = -1; this.bv.set(0, 0, 0); this.curveT = 0;
    this.ball.visible = true; this.ball.position.set(this.px + Math.sin(this.heading) * 0.7, BALL_R, this.pz + Math.cos(this.heading) * 0.7);
    this.fx.emit(this.ball.position.clone(), 0xffffff, 10, 2, 0.8, 0.4);
  }

  // ---------- şut: basılı tut, nişan al, bırak ----------
  chargeStart() {
    if (this.mode !== 'play' || this.ballState !== 'held' || this.strikeT >= 0 || this.charging) return false;
    this.charging = true; this.chargeT = 0; this.vibT = 0;
    this.aimBase.set(clamp(this.px * 0.25 + this.stickX * 2, -3, 3), 0.9); this.aim.copy(this.aimBase);
    return true;
  }
  /** Şut tuşundan itibaren parmağın kayması (piksel): nişanı kalede gezdirir */
  chargeAim(dx: number, dy: number) { if (this.charging) this.aim.set(clamp(this.aimBase.x + dx * 0.05, -5.5, 5.5), clamp(this.aimBase.y - dy * 0.024, 0.2, 3.8)); }
  chargeRelease() {
    if (!this.charging) return;
    this.charging = false; this.strikeT = 0.1; this.kickT = 0; this.sfx.chargeStop(); this.hooks.power(0, false);
  }
  private cancelCharge() { if (this.charging) { this.charging = false; this.sfx.chargeStop(); this.hooks.power(0, false); } this.strikeT = -1; }

  private strike() {
    const b = this.ball.position, over = Math.max(0, this.power - 1), p = Math.min(this.power, 1);
    // isabet payı: halkanın içinde rastgele bir nokta; fazla güçte top havalanır
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * this.errR;
    const tx = this.aim.x + Math.cos(a) * r, ty = Math.max(0.16, this.aim.y + Math.sin(a) * r + over * 7);
    let dx = tx - b.x, dz = GZ - b.z; const D = Math.max(1, Math.hypot(dx, dz)); dx /= D; dz /= D;
    const v = 15 + 21 * p + over * 8, h = ty - BALL_R;
    // hedefe ulaşan alçak yörüngenin açısı (sürtünmesiz atış denklemi)
    const disc = v ** 4 - G * (G * D * D + 2 * h * v * v);
    const th = clamp(disc > 0 ? Math.atan((v * v - Math.sqrt(disc)) / (G * D)) : 0.6, 0.03, 0.62);
    const vh = v * Math.cos(th), T = D / vh;
    // falso: top hedefin dış tarafından açılıp içeri kıvrılır
    const A = clamp(tx * 0.22 + (tx - b.x) * 0.03, -1.7, 1.7) * (0.3 + 0.7 * p) * clamp(D / 16, 0.3, 1.2), qx = -dz, qz = dx;
    this.bv.set(dx * vh + qx * 4 * A / T, v * Math.sin(th), dz * vh + qz * 4 * A / T);
    this.curve.set(qx * -8 * A / (T * T), 0, qz * -8 * A / (T * T)); this.curveT = T;
    this.ballState = 'fly'; this.sinceKick = 0; this.shotOpen = true; this.inGoal = false; this.hitPost = false; this.shotDist = D;
    this.stats.shots++; const kmh = Math.round(v * 3.6); this.stats.topSpeed = Math.max(this.stats.topSpeed, kmh);
    this.hooks.popup(kmh + ' km/s', over > 0.05 ? 'warn' : 'good'); this.hooks.hud(this.stats);
    this.hitstop = 0.05 + 0.04 * p; this.shake = 0.12 + 0.25 * p; this.fov -= 3 + 5 * p;
    this.sfx.strike(p); vib(30 + Math.round(60 * p));
    this.fx.emit(b.clone(), 0xffffff, 8 + Math.round(14 * p), 3 + 3 * p, 0.7, 0.4); this.fx.emit(b.clone().setY(0.05), 0x7dff9a, 10, 3, 0.9, 0.5);
    this.heading = Math.atan2(dx, dz);
    this.planKeeper(b, vh, dx, dz, qx, qz, A, T, v);
  }

  private planKeeper(b: THREE.Vector3, vh: number, dx: number, dz: number, qx: number, qz: number, A: number, T: number, v: number) {
    if (this.kState !== 'set' || dz >= -0.05) { this.plan = null; return; }
    const Tk = (this.kz - b.z) / (dz * vh); if (Tk <= 0) { this.plan = null; return; }
    const off = A * 4 * Tk * (T - Tk) / (T * T);
    const x = b.x + dx * vh * Tk + qx * off; let y = BALL_R + this.bv.y * Tk - 0.5 * G * Tk * Tk; if (y < BALL_R) y = BALL_R + Math.min(0.5, -y * 0.4);
    const lateral = Math.abs(x - this.kx), need = Math.hypot(lateral, Math.max(0, y - 1.5) * 0.9) - K_REACH, can = keeperTravel(Tk);
    const onTarget = Math.abs(x) < GOAL_W + 0.9 && y < GOAL_H + 0.6;
    const reach = onTarget && need <= can && y < 2.8;
    const kind = v < 21 || (need < -0.2 && v < 27) ? 'catch' : can - need < 0.3 ? 'tip' : 'parry';
    this.plan = { T: Tk, x, y, from: this.kx, dir: Math.sign(x - this.kx) || 1, dist: reach ? Math.max(0, lateral - 0.25) : Math.min(lateral, can + 0.4), reach, kind, done: false, dive: onTarget && lateral > 0.85 };
    if (onTarget || Math.abs(x) < 6) { this.kState = 'dive'; this.kT = 0; }
  }

  // ---------- ana döngü ----------
  update(dtReal: number) {
    this.clock += dtReal;
    if (this.mode === 'menu') return this.updateMenu(dtReal);
    if (this.hitstop > 0) { this.hitstop -= dtReal; this.updateCamera(dtReal); return; }   // vuruş anında kısa donma
    this.slow = Math.max(0, this.slow - dtReal);
    const dt = dtReal * (this.slow > 0 ? 0.35 : 1);

    this.updateCharge(dt);
    this.updatePlayer(dt);
    this.updateKeeper(dt);
    this.updateBall(dt);
    this.world.update(dt); this.fx.update(dt, 0); this.world.follow(this.px, this.pz);
    if (this.respawnT >= 0) { this.respawnT -= dt; if (this.respawnT < 0) this.giveBall(); }
    this.updateCamera(dtReal);
  }

  private updateCharge(dt: number) {
    if (this.charging) {
      if (this.ballState !== 'held') { this.cancelCharge(); return; }
      this.chargeT += dt;
      // 1 saniyede tam güç, kısa bir süre tam güçte kalır; tutmaya devam edersen kırmızıya geçer ve top kontrolden çıkar
      const t = this.chargeT; this.power = t < 1 ? 0.12 + 0.88 * t : t < 1.4 ? 1 : Math.min(1.25, 1 + (t - 1.4) / 0.5 * 0.25);
      this.sfx.charge(this.power); this.hooks.power(this.power, true);
      this.vibT -= dt;
      if (this.vibT <= 0) { const over = this.power > 1; vib(over ? 45 : 10 + Math.round(14 * this.power)); this.vibT = over ? 0.055 : 0.17 - 0.11 * this.power; }
    }
    if (this.charging || this.strikeT >= 0) {
      const sp = Math.hypot(this.vx, this.vz), over = Math.max(0, this.power - 1), D = Math.hypot(this.aim.x - this.px, GZ - this.pz);
      this.errR = (0.1 + 0.35 * (sp / SPRINT) ** 2 + over * 6) * clamp(D / 18, 0.55, 2.2);
      const w = 0.02 + over * 1.6, r = this.reticle;
      r.visible = true; r.position.set(this.aim.x + Math.sin(this.clock * 47) * w, this.aim.y + Math.cos(this.clock * 61) * w, GZ + 0.1);
      r.scale.setScalar(Math.max(0.5, this.errR * 2 + 0.25)); (r.material as THREE.SpriteMaterial).color.setHex(over > 0 ? 0xff4d6d : this.power > 0.8 ? 0xffffff : 0xffd23f);
    } else this.reticle.visible = false;
    if (this.strikeT >= 0) { this.strikeT -= dt; if (this.strikeT < 0) { if (this.ballState === 'held') this.strike(); } }
  }

  private updatePlayer(dt: number) {
    const m = Math.hypot(this.stickX, this.stickY), k = m > 1 ? 1 / m : 1;
    // şut hazırlığında adımlar kısalır; vuruş anında ayak yere basar
    const top = this.strikeT >= 0 || this.kickT < 0.25 ? 1.5 : this.charging ? SPRINT * 0.5 : SPRINT;
    const tx = this.stickX * k * top, tz = this.stickY * k * top;
    const acc = 1 - Math.exp(-(m > 0.1 ? 7 : 9) * dt);
    this.vx += (tx - this.vx) * acc; this.vz += (tz - this.vz) * acc;
    this.px = clamp(this.px + this.vx * dt, -HALF_W, HALF_W); this.pz = clamp(this.pz + this.vz * dt, GZ + 0.4, BACK_Z);
    const sp = Math.hypot(this.vx, this.vz);
    if (this.charging || this.strikeT >= 0) this.heading = turn(this.heading, Math.atan2(this.aim.x - this.px, GZ - this.pz), 1 - Math.exp(-12 * dt));
    else if (sp > 0.5 && this.kickT > 0.35) this.heading = turn(this.heading, Math.atan2(this.vx, this.vz), 1 - Math.exp(-12 * dt));
    this.phase += sp * dt * 1.7; this.kickT += dt; this.celebrate = Math.max(0, this.celebrate - dt);
    this.player.root.position.set(this.px, 0, this.pz); this.player.baseYaw = this.heading;
    this.player.setPose(this.playerPose(sp), dt, this.kickT < 0.4 ? 34 : 20);
  }

  private playerPose(sp: number): Pose {
    if (this.kickT < 0.42 && !this.charging) {
      // vuruş: geriden gelen bacak, top temasından sonra savrulan gövde
      const u = this.kickT / 0.42, sw = clamp(this.kickT / 0.1, 0, 1), pw = 0.5 + 0.5 * Math.min(1, this.power);
      return pose({ pitch: -0.12 + 0.3 * sw, twist: (-0.5 + 1.0 * sw) * pw, roll: 0, thR: (-0.9 + 2.5 * sw - 0.7 * Math.max(0, u - 0.5)) * pw, knR: 1.4 * (1 - sw), thL: 0.15, knL: 0.35, abL: 0.12, shL: 1.2 - 1.6 * sw, shR: -0.9 + 0.6 * sw, saL: 1.1, saR: 0.8, elL: 0.3, elR: 0.4, y: 0.06 * Math.sin(Math.PI * u) });
    }
    if (this.charging) {
      // güç toplarken: gövde açılır, vuracak ayak geride gerilir
      const c = Math.min(1, this.power), base = sp > 1 ? runPose(this.phase, 0.55, 0.1) : pose({ thL: 0.15, knL: 0.3 });
      base.saL = 0.5 + 0.7 * c; base.saR = 0.4 + 0.5 * c; base.twist += -0.35 * c; base.thR = Math.min(base.thR, 0.2) - 0.5 * c; base.knR = Math.max(base.knR, 0.5 + 0.7 * c); base.pitch = 0.1 - 0.12 * c;
      return base;
    }
    if (this.celebrate > 0 && sp < 2) { const w = Math.sin(this.clock * 12); return pose({ shL: 2.9, shR: 2.9, saL: 0.45, saR: 0.45, elL: 0.2, elR: 0.2, y: Math.abs(w) * 0.14, pitch: -0.1 }); }
    if (sp < 0.6) { const w = Math.sin(this.clock * 2.4); return pose({ pitch: 0.06, thL: 0.12, thR: 0.12, knL: 0.22, knR: 0.22, abL: 0.1, abR: 0.1, saL: 0.25 + 0.03 * w, saR: 0.25 - 0.03 * w, elL: 0.5, elR: 0.5 }); }
    return runPose(this.phase, Math.min(1, sp / 5), 0.06 + 0.2 * Math.min(1, sp / SPRINT));
  }

  // ---------- top ----------
  private updateBall(dt: number) {
    const b = this.ball.position;
    if (this.ballState === 'held') {
      const sp = Math.hypot(this.vx, this.vz), run = Math.min(1, sp / SPRINT);
      const q = (this.phase - Math.PI * 1.5) / (Math.PI * 3), cyc = q - Math.floor(q), side = Math.floor(q) % 2 === 0 ? 1 : -1;
      if (cyc < this.lastCycle && sp > 2) { this.sfx.touch(); this.fx.emit(b.clone().setY(0.05), 0x7dff9a, 3, 1.2, 0.6, 0.3); }
      this.lastCycle = cyc;
      const c = Math.pow(cyc, 0.75), set = this.charging || this.strikeT >= 0;
      // hızlandıkça top ayaktan daha uzağa açılır; şut hazırlığında vuruş ayağının önünde durur
      const fwd = set ? 0.62 : 0.5 + run * 1.0 * 4 * c * (1 - c), lat = set ? -0.14 : side * 0.2 * run * (2 * Math.min(1, cyc * 1.6) - 1);
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const k = 1 - Math.exp(-20 * dt), ox = b.x, oz = b.z;
      b.x += (this.px + fx * fwd + fz * lat - ox) * k; b.z += (this.pz + fz * fwd - fx * lat - oz) * k; b.y = BALL_R;
      this.spin(b.x - ox, b.z - oz);
      // topla kale çizgisini geçersen de gol
      if (b.z < GZ - BALL_R && Math.abs(b.x) < GOAL_W) { this.ballState = 'fly'; this.bv.set(this.vx, 0, this.vz - 2); this.shotOpen = true; this.shotDist = 0; this.stats.shots++; this.sinceKick = 1; this.curveT = 0; }
      return;
    }
    if (this.ballState === 'keeper') { const k = this.keeper.root.position; b.set(k.x + (this.plan?.dive ? this.plan.dir * 0.75 : 0), this.plan?.dive ? 0.35 : 1.15, k.z + 0.35); return; }
    if (this.ballState !== 'fly') return;
    this.sinceKick += dt;
    for (let n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n, i = 0; i < n && this.ballState === 'fly'; i++) this.stepBall(h);
    if (this.shotOpen && this.bv.lengthSq() > 60 && Math.random() < 0.7) this.fx.emit(b.clone(), 0xffe9a8, 1, 0.3, 0.4, 0.28, 0);
    // serbest topu geri al
    if (this.ballState === 'fly' && this.sinceKick > 0.4 && !this.inGoal && b.y < 0.8 && Math.hypot(b.x - this.px, b.z - this.pz) < 1.0 && this.respawnT < 0) {
      if (this.shotOpen) this.endShot(null);
      this.ballState = 'held'; this.curveT = 0; this.sfx.touch();
    }
  }

  private spin(dx: number, dz: number) { const d = Math.hypot(dx, dz); if (d > 1e-5) this.ball.rotateOnWorldAxis(new THREE.Vector3(dz / d, 0, -dx / d), d / BALL_R); }

  private stepBall(h: number) {
    const b = this.ball.position, v = this.bv, pz0 = b.z, px0 = b.x;
    if (this.curveT > 0) { v.addScaledVector(this.curve, h); this.curveT -= h; }
    else { const s = v.length(); v.multiplyScalar(Math.max(0, 1 - 0.006 * s * h)); }   // hava direnci
    v.y -= G * h; b.addScaledVector(v, h);
    this.spin(b.x - px0, b.z - pz0);
    // zemin
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (v.y < -1.2) { this.sfx.bounce(-v.y); v.y *= -0.58; v.x *= 0.86; v.z *= 0.86; this.curveT = 0; } else { v.y = 0; const f = Math.max(0, 1 - 0.9 * h); v.x *= f; v.z *= f; }
    }
    if (!this.inGoal) {
      // direkler ve üst direk: gerçek çarpışma, top içeri de dönebilir dışarı da
      for (const s of [1, -1]) if (b.y < GOAL_H + POST_R) this.bounceOff(b.x - GOAL_W * s, b.z - GZ, 'x', 'z');
      if (Math.abs(b.x) < GOAL_W + POST_R) this.bounceOff(b.y - GOAL_H, b.z - GZ, 'y', 'z');
      this.keeperTouch();
      if (pz0 >= GZ - BALL_R && b.z < GZ - BALL_R) {
        if (Math.abs(b.x) < GOAL_W && b.y < GOAL_H) this.goal();
        else if (this.shotOpen) this.endShot('AUT');
      }
    } else {
      // file: arka ağ esner ve topu yutar; yan ağlar ve tavan topu içeride tutar
      const back = GZ - NET_D + this.world.netOffset(b.x, b.y) + BALL_R;
      if (b.z < back) { const hit = Math.abs(v.z); if (hit > 1.5) { this.world.netHit(b.x, b.y, hit * 0.55); this.sfx.netSwish(); } b.z = back; v.z *= -0.06; v.x *= 0.35; v.y *= 0.35; }
      if (Math.abs(b.x) > GOAL_W - BALL_R) { b.x = Math.sign(b.x) * (GOAL_W - BALL_R); v.x *= -0.1; }
      if (b.y > GOAL_H - BALL_R) { b.y = GOAL_H - BALL_R; v.y *= -0.1; }
      if (b.z > GZ - BALL_R && v.z > 0) v.z *= 0.5;
    }
    // saha dışı
    if (this.respawnT < 0 && (Math.abs(b.x) > HALF_W + 3.5 || b.z < GZ - 5.5 || b.z > BACK_Z + 6)) { if (this.shotOpen) this.endShot('AUT'); else this.respawnT = 0.6; v.x *= -0.3; v.z *= -0.3; }
  }

  /** Silindire (direk) çarpma: a ve c, top merkezinin direk eksenine göre iki bileşeni */
  private bounceOff(a: number, c: number, ka: 'x' | 'y', kc: 'z') {
    const d = Math.hypot(a, c), min = BALL_R + POST_R; if (d >= min || d < 1e-4) return;
    const na = a / d, nc = c / d, b = this.ball.position, v = this.bv;
    b[ka] += na * (min - d); b[kc] += nc * (min - d);
    const vn = v[ka] * na + v[kc] * nc; if (vn >= 0) return;
    v[ka] -= 1.62 * vn * na; v[kc] -= 1.62 * vn * nc; this.curveT = 0;
    if (-vn > 3) { this.sfx.post(); this.shake = 0.3; vib(40); this.fx.emit(b.clone(), 0xffffff, 12, 4, 0.8, 0.4); if (this.shotOpen && !this.hitPost) this.hooks.popup('DİREK!', 'warn'); this.hitPost = true; }
  }

  private keeperTouch() {
    const p = this.plan, b = this.ball.position, v = this.bv;
    if (!p || p.done || !this.shotOpen || b.z > this.kz + 0.25) return;
    p.done = true; if (!p.reach) return;
    this.curveT = 0; this.sfx.glove(); this.shake = 0.2; vib(25); this.fx.emit(b.clone(), 0xc6ff3a, 14, 4, 0.8, 0.5);
    if (p.kind === 'catch') { this.ballState = 'keeper'; this.kState = 'hold'; this.kT = 0; v.set(0, 0, 0); return this.endShot('KALECİ TUTTU'); }
    if (p.kind === 'tip') {
      // parmak ucu: top yön değiştirir ama yoluna devam eder; gol de olabilir, direkten de dönebilir
      v.multiplyScalar(0.72); v.x += p.dir * (2 + Math.random() * 2.5); v.y += 1.5 + Math.random() * 2.5; this.hooks.popup('PARMAK UCU!', 'warn'); return;
    }
    const s = v.length(); v.set(p.dir * s * (0.2 + Math.random() * 0.25), 2 + Math.random() * 3.5, s * (0.12 + Math.random() * 0.2));
    this.endShot('KALECİ KURTARDI');
  }

  private goal() {
    this.inGoal = true; this.curveT = 0;
    const b = this.ball.position, st = this.stats;
    st.goals++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak);
    const corner = Math.abs(b.x) > 2.5 && b.y > 1.55, far = this.shotDist >= 25;
    this.hooks.popup('GOOOL!', 'perfect');
    if (this.hitPost) this.hooks.popup('DİREKTEN İÇERİ!', 'good'); else if (corner) this.hooks.popup('DOKSAN!', 'good'); else if (far) this.hooks.popup(Math.round(this.shotDist) + ' METREDEN!', 'good');
    if (st.streak >= 2) this.hooks.popup(st.streak + ' GOL ÜST ÜSTE', 'good');
    this.sfx.goal(); this.sfx.crowd(1); this.slow = 0.7; this.shake = 0.3; this.celebrate = 2.4; vib([40, 50, 40, 50, 120]);
    for (let i = 0; i < 4; i++) this.fx.emit(new THREE.Vector3((Math.random() - 0.5) * 8, 3 + Math.random() * 2, GZ + 2), [0xffd23f, 0xff4d6d, 0x39f0c8, 0xffffff][i], 30, 7, 0.8, 1.6, 5);
    this.shotOpen = false; this.respawnT = 2.6; this.hooks.hud(st);
  }

  /** Gol olmayan sonuç. text null ise sessizce kapanır (top geri alındı). */
  private endShot(text: string | null) {
    if (!this.shotOpen) return; this.shotOpen = false;
    this.stats.streak = 0; this.hooks.hud(this.stats); this.sfx.crowd(0.15);
    if (text) { this.hooks.popup(text, 'warn'); if (text === 'AUT' || this.ballState === 'keeper') this.respawnT = 1.5; }
  }

  // ---------- kaleci ----------
  private updateKeeper(dt: number) {
    const k = this.keeper, p = this.plan; this.kT += dt;
    let target: Pose;
    if (this.kState === 'set') {
      // açıyı kapatır: top ile kale ortası arasındaki çizgide durur, yaklaşınca öne çıkar
      const bx = this.ball.position.x, bz = this.ball.position.z, dist = Math.hypot(bx, bz - GZ);
      const out = this.ballState === 'held' ? clamp((16 - dist) / 16, 0, 1) * 3.2 : 0;
      const tz = GZ + 0.7 + out, tx = clamp(bx * (tz - GZ + 1.2) / Math.max(4, bz - GZ + 1.2) * 1.6, -2.8, 2.8);
      const step = 4.5 * dt, mx = clamp(tx - this.kx, -step, step); this.kx += mx; this.kz += clamp(tz - this.kz, -step, step);
      target = jockeyPose(this.clock * (Math.abs(mx) > 0.001 ? 1 : 0.3)); target.saL = target.saR = 1.0 + (this.charging ? 0.25 : 0); target.pitch = this.charging ? 0.38 : 0.25;
      // ayağına kadar gelirsen topu kapar
      if (this.ballState === 'held' && Math.hypot(bx - this.kx, bz - this.kz) < 1.35 && this.respawnT < 0) {
        this.cancelCharge(); this.ballState = 'keeper'; this.kState = 'hold'; this.kT = 0; this.plan = null; this.sfx.glove(); this.stats.streak = 0;
        this.hooks.popup('KALECİ TOPU ALDI', 'warn'); this.hooks.hud(this.stats); this.respawnT = 1.5;
      }
    } else if (this.kState === 'dive' && p) {
      const u = clamp(keeperTravel(this.kT) / Math.max(0.3, keeperTravel(p.T)), 0, 1), moved = Math.min(p.dist, p.dist * u);
      this.kx = p.from + p.dir * moved;
      if (p.dive) {
        // uzanarak uçuş: gövde yana yatar, kollar topa uzanır, yükseklik topun geliş yüksekliğine göre
        const fly = Math.sin(Math.PI * clamp(this.kT / (p.T + 0.25), 0, 1));
        target = sideFallPose(this.kT < K_REACT ? 0 : (this.kT - K_REACT) * 1.4, p.dir);
        target.y += clamp(p.y - 0.5, 0, 1.7) * fly; target.shL = target.shR = 2.9; target.saL = target.saR = 0.25; target.elL = target.elR = 0.1; target.thL = 0.1; target.thR = -0.15; target.knL = 0.3; target.knR = 0.2;
        if (this.kT < K_REACT) target = jockeyPose(this.clock);
      } else {
        const jump = p.y > 1.9 ? Math.sin(Math.PI * clamp(this.kT / (p.T + 0.2), 0, 1)) * 0.5 : 0;
        target = pose({ y: jump, thL: 0.4, thR: 0.4, knL: p.y < 0.6 ? 1.3 : 0.6, knR: p.y < 0.6 ? 1.3 : 0.6, abL: 0.3, abR: 0.3, pitch: p.y < 0.6 ? 0.5 : 0.1, shL: 0.8 + p.y * 0.9, shR: 0.8 + p.y * 0.9, saL: 0.2, saR: 0.2, elL: 0.3, elR: 0.3 });
      }
      if (this.kT > p.T + 0.35) { this.kState = 'down'; this.kT = 0; }
    } else if (this.kState === 'down') {
      target = this.plan?.dive ? sideFallPose(1, this.plan.dir) : pose({ thL: 0.3, thR: 0.3, knL: 0.5, knR: 0.5 });
      if (this.kT > (this.plan?.dive ? 1.0 : 0.3)) { this.kState = 'set'; this.plan = null; }
    } else {
      // topu tutuyor
      target = this.plan?.dive ? sideFallPose(1, this.plan.dir) : pose({ shL: 1.3, shR: 1.3, saL: 0.1, saR: 0.1, elL: 1.5, elR: 1.5, pitch: 0.1 });
      if (this.kT > 1.4) { this.ball.visible = false; this.ballState = 'gone'; if (this.respawnT < 0) this.respawnT = 0.1; this.kState = 'set'; this.plan = null; }
    }
    k.root.position.set(this.kx, 0, this.kz); k.baseYaw = 0; k.setPose(target, dt, this.kState === 'dive' ? 22 : 12);
  }

  // ---------- kamera ----------
  private updateCamera(dt: number) {
    const cam = this.camera, b = this.ball.position;
    const near = clamp((this.pz - GZ) / 45, 0.2, 1);
    const tp = new THREE.Vector3(this.px * 0.8, 3.8 + 2.6 * near, this.pz + 5.4 + 3.0 * near);
    const tl = new THREE.Vector3(this.px * 0.6, 1.2, this.pz - 9);
    let fov = 66, rate = 6;
    if (this.charging || this.strikeT >= 0) {
      // güç dolarken kamera topun arkasına iner ve kaleye kilitlenir
      const c = Math.min(1, this.chargeT * 2.5);
      tp.lerp(new THREE.Vector3(this.px + (this.px - this.aim.x) * 0.12, 2.3, this.pz + 5.0), c);
      tl.lerp(new THREE.Vector3(this.px + (this.aim.x - this.px) * 0.7, 1.4, this.pz + (GZ - this.pz) * 0.7), c);
      fov = 66 - 12 * Math.min(1, this.power) * c; rate = 8;
    } else if (this.ballState === 'fly' && (this.shotOpen || this.inGoal) && this.sinceKick < 3.5) {
      // şuttan sonra top takip edilir
      tl.set(b.x * 0.85 + this.px * 0.15, Math.max(1, b.y * 0.8), b.z); tp.set(this.px * 0.5 + b.x * 0.4, 3.6, Math.max(b.z + 10, this.pz - 6)); fov = 58; rate = 7;
    }
    const k = 1 - Math.exp(-rate * dt); this.camPos.lerp(tp, k); this.camLook.lerp(tl, k);
    const over = this.charging ? Math.max(0, this.power - 1) * 0.5 + Math.min(1, this.power) * 0.02 : 0;
    this.shake = Math.max(0, this.shake - dt); const sh = this.shake * 0.6 + over;
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z);
    cam.lookAt(this.camLook);
    this.fov += (fov - this.fov) * (1 - Math.exp(-7 * dt));
    if (Math.abs(cam.fov - this.fov) > 0.02) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  private updateMenu(dt: number) {
    const p = this.player, t = this.clock;
    p.baseYaw = t * 0.55;
    const w = Math.sin(t * 2);
    p.setPose(pose({ pitch: 0.03, twist: 0.06 * w, thR: 1.05, knR: 1.3, abR: 0.1, thL: -0.02, knL: 0.04, shL: 0.1 * w, shR: -0.1 * w, saL: 0.22, saR: 0.22, elL: 0.35, elR: 0.35, head: -0.05 }), dt, 8);
    const a = p.baseYaw, lx = -0.105, lz = 0.36;
    this.ball.visible = true; this.ball.position.set(lx * Math.cos(a) + lz * Math.sin(a), BALL_R, -lx * Math.sin(a) + lz * Math.cos(a));
    this.ball.rotation.set(0, a, 0);
    this.keeper.root.position.set(0, 0, GZ + 0.7); this.keeper.setPose(jockeyPose(t), dt, 10);
    this.fx.update(dt, 0); this.world.update(dt); this.world.follow(0, 0);
    this.camera.position.set(0, 1.45, 8.6); this.camera.lookAt(0, 0.1, 0);
    this.camPos.copy(this.camera.position); this.camLook.set(0, 0.1, 0);
  }
}
