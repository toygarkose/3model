import * as THREE from 'three';
import { Footballer, Look, Pose, pose, runPose, jockeyPose, sideFallPose } from './character';
import { World, GZ, HALF_W, GOAL_W, GOAL_H, NET_D } from './world';
import { Particles } from './fx';
import { Sfx } from './audio';
import { makeBallTexture } from './cosmetics';

export type MomentType = 'shot' | 'freekick' | 'pass' | 'cross' | 'penalty' | 'oneone';
export interface Skills { power: number; curve: number; calm: number; tech: number }
export type MomentResult = 'goal' | 'assist' | 'miss';
export interface Summary { us: number; them: number; goals: number; assists: number; rating: number; rival: string }
export interface Hooks {
  popup(text: string, kind: 'perfect' | 'good' | 'warn'): void;
  board(us: number, them: number, minute: number, rival: string, results: MomentResult[]): void;
  prompt(title: string, text: string): void;
  contact(on: boolean, time: number, drift: number): void;
  over(s: Summary): void;
}

const BALL_R = 0.15, POST_R = 0.07, G = 9.81, MOMENTS = 5;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const vib = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* titreşim desteklenmiyor */ } };

interface Plan { T: number; x: number; y: number; from: number; dir: number; dist: number; reach: boolean; kind: 'catch' | 'parry' | 'tip'; done: boolean; dive: boolean }
interface Def { fb: Footballer; x: number; z: number; wall: boolean; phase: number }
type Mode = 'menu' | 'intro' | 'aim' | 'contact' | 'fly' | 'result' | 'done';

export class Game {
  mode: Mode = 'menu';
  private world: World; private player: Footballer; private keeper: Footballer; private mate: Footballer;
  private ball: THREE.Mesh; private ballMat: THREE.MeshStandardMaterial; private arrow: THREE.Group; private arrowMat: THREE.MeshBasicMaterial; private runLine: THREE.Mesh;
  private fx = new Particles(); private defs: Def[] = []; private pool: Footballer[] = []; private rivalLook!: Look;
  // maç
  private sk: Skills = { power: 0, curve: 0, calm: 0, tech: 0 }; private first = false; private contactTime = 1.3;
  private feed() { return this.type === 'pass' || this.type === 'cross'; }
  private level = 0; private rival = ''; private us = 0; private them = 0; private idx = -1; private minutes: number[] = []; private results: MomentResult[] = [];
  private goals = 0; private assists = 0; private type: MomentType = 'shot';
  // an
  private spot = new THREE.Vector3(); private fwd = new THREE.Vector2(0, -1); private aimDir = new THREE.Vector2(0, -1); private power = 0; private aiming = false;
  private t = 0; private kickT = 9; private kicker: 'player' | 'mate' = 'player';
  // top
  private bv = new THREE.Vector3(); private curve = new THREE.Vector3(); private curveT = 0; private sinceKick = 0; private live = false; private inGoal = false; private hitPost = false; private byMate = false;
  // takım arkadaşı
  private mx = 0; private mz = 0; private mTo = new THREE.Vector2(); private mPhase = 0; private mGot = false;
  // kaleci
  private kx = 0; private kz = GZ + 0.7; private kState: 'set' | 'dive' | 'down' | 'hold' = 'set'; private kT = 0; private plan: Plan | null = null;
  private clock = 0; private hitstop = 0; private slow = 0; private shake = 0;
  private camPos = new THREE.Vector3(0, 7, 30); private camLook = new THREE.Vector3(0, 1, 10);

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private sfx: Sfx, private hooks: Hooks, look: Look) {
    this.world = new World(scene);
    this.player = new Footballer(look); this.keeper = new Footballer(look); this.mate = new Footballer(look);
    scene.add(this.player.root, this.keeper.root, this.mate.root);
    this.ballMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.ballMat); this.ball.castShadow = true; scene.add(this.ball);
    // nişan oku: topu geri çektikçe uzar
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 1).translate(0, 0.5, 0), this.arrowMat); shaft.rotation.x = Math.PI / 2; shaft.name = 'shaft';
    const tri = new THREE.Shape(); tri.moveTo(-0.5, 0); tri.lineTo(0.5, 0); tri.lineTo(0, 0.9); tri.closePath();
    const head = new THREE.Mesh(new THREE.ShapeGeometry(tri), this.arrowMat); head.rotation.x = Math.PI / 2; head.name = 'head';
    this.arrow = new THREE.Group(); this.arrow.add(shaft, head); this.arrow.position.y = 0.04; this.arrow.visible = false; scene.add(this.arrow);
    this.runLine = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x39f0c8, transparent: true, opacity: 0.7, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.runLine.rotation.order = 'YXZ'; this.runLine.rotation.x = Math.PI / 2; this.runLine.position.y = 0.035; this.runLine.visible = false; scene.add(this.runLine);
    scene.add(this.fx.points);
    this.toMenu();
  }

  setPlayerLook(l: Look) { this.player.setLook(l); this.mate.setLook({ ...l, number: l.number === 9 ? 11 : 9, hair: (l.hair + 2) % 6, boot: { color: '#f5f5f5', sole: '#1b1b2a' } }); }
  setKeeperLook(l: Look) { this.keeper.setLook(l); }
  setRivalLook(l: Look) { this.rivalLook = l; for (const f of this.pool) f.setLook(l); for (const d of this.defs) d.fb.setLook(l); }
  setBall(b: { base: string; patch: string; style: string }) { const o = this.ballMat.map; this.ballMat.map = makeBallTexture(b); this.ballMat.needsUpdate = true; o?.dispose(); }

  toMenu() {
    this.mode = 'menu'; this.clearDefs(); this.arrow.visible = false; this.runLine.visible = false; this.mate.root.visible = false; this.hooks.contact(false, 0, 0);
    this.player.root.position.set(0, 0, 0); this.kx = 0; this.kz = GZ + 0.7; this.kState = 'set'; this.plan = null;
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
  }

  startMatch(level: number, rival: string, skills: Skills, first: boolean) {
    this.sk = skills; this.first = first; this.contactTime = 1.25 + 0.2 * skills.calm;
    this.level = level; this.rival = rival; this.us = this.them = 0; this.idx = -1; this.results = []; this.goals = this.assists = 0;
    this.minutes = [rnd(4, 17), rnd(20, 38), rnd(41, 58), rnd(60, 75), rnd(78, 90)].map(Math.round);
    this.camera.fov = 58; this.camera.updateProjectionMatrix();
    this.sfx.whistle(); this.sfx.crowd(0.25);
    this.nextMoment();
  }

  private clearDefs() { for (const d of this.defs) { this.scene.remove(d.fb.root); this.pool.push(d.fb); } this.defs.length = 0; }
  private addDef(x: number, z: number, wall = false) {
    const fb = this.pool.pop() || new Footballer(this.rivalLook); fb.root.scale.setScalar(1); this.scene.add(fb.root);
    this.defs.push({ fb, x, z, wall, phase: Math.random() * 6 });
  }

  // ---------- maç akışı: sıradaki kilit an ----------
  private nextMoment() {
    this.idx++;
    if (this.idx >= MOMENTS) return this.finish();
    // anlar arasında rakip de oynuyor
    let news = '';
    if (Math.random() < Math.min(0.5, 0.2 + this.level * 0.025)) { this.them++; news = `${Math.max(1, this.minutes[this.idx] - Math.round(rnd(2, 9)))}' ${this.rival} gol attı. `; this.sfx.crowd(0.05); }
    const lv = this.level, r = Math.random();
    this.type = this.idx === 0 && this.first ? 'shot' : r < 0.28 ? 'shot' : r < 0.47 ? 'freekick' : r < 0.65 ? 'pass' : r < 0.8 ? 'cross' : r < 0.92 ? 'oneone' : 'penalty';
    this.clearDefs(); this.mate.root.visible = false; this.runLine.visible = false;
    const side = Math.random() < 0.5 ? -1 : 1;
    let title = '', text = '';
    if (this.type === 'shot') {
      const d = rnd(15, 21 + Math.min(6, lv)); this.spot.set(side * rnd(0, 10), BALL_R, GZ + d);
      const n = 1 + Math.min(2, Math.floor(lv / 2)) + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) { const u = rnd(0.3, 0.7), off = (Math.random() < 0.5 ? -1 : 1) * rnd(0.7, 2.4); this.addDef(this.spot.x * (1 - u) + off, this.spot.z + (GZ - this.spot.z) * u); }
      title = 'Şut şansı'; text = 'Ceza sahası önünde top sende.';
    } else if (this.type === 'freekick') {
      const d = rnd(18, 25); this.spot.set(side * rnd(1, 9), BALL_R, GZ + d);
      // baraj: 9,15 metrede, topla yakın direk arasında
      const tx = side * 1.6 - this.spot.x, tz = GZ - this.spot.z, tl = Math.hypot(tx, tz), ux = tx / tl, uz = tz / tl, n = lv >= 3 ? 4 : 3;
      for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.66; this.addDef(this.spot.x + ux * 9.15 - uz * o, this.spot.z + uz * 9.15 + ux * o, true); }
      title = 'Frikik'; text = 'Faul! Barajı aş, kaleciyi geç.';
    } else if (this.type === 'pass') {
      this.spot.set(side * rnd(2, 9), BALL_R, GZ + rnd(31, 36));
      this.mx = -side * rnd(5, 9); this.mz = GZ + rnd(23, 26); this.mTo.set(-side * rnd(1, 4), GZ + 9); this.mGot = false; this.mPhase = 0;
      this.mate.root.visible = true;
      this.addDef((this.spot.x + this.mx) / 2 + rnd(-1.5, 1.5), GZ + rnd(27, 29)); this.addDef(-side * rnd(-2, 3), GZ + rnd(14, 17));
      if (lv >= 2) this.addDef(this.mTo.x + rnd(3, 5) * side, GZ + rnd(11, 13));
      title = 'Pas'; text = 'Arkadaşın koşuya kalkacak. Topu önüne at.';
    } else if (this.type === 'cross') {
      // kanattan orta: arkadaşın ceza sahasına koşar, top havadan da gelebilir
      this.spot.set(side * rnd(14, 17.5), BALL_R, GZ + rnd(7, 14));
      this.mx = -side * rnd(0, 4); this.mz = GZ + rnd(16, 19); this.mTo.set(side * rnd(-2, 1.5), GZ + rnd(6, 8)); this.mGot = false; this.mPhase = 0; this.mate.root.visible = true;
      this.addDef(side * rnd(5, 8), this.spot.z + rnd(-1.5, 1.5)); this.addDef(this.mTo.x - side * rnd(1.6, 2.6), GZ + rnd(5, 7));
      if (lv >= 2) this.addDef(this.mTo.x + side * rnd(2, 3), GZ + rnd(8, 10));
      title = 'Orta'; text = 'Kanattasın. Topu arkadaşının koştuğu yere kes.';
    } else if (this.type === 'penalty') {
      this.spot.set(0, BALL_R, GZ + 11);
      title = 'Penaltı'; text = 'Kaleci bir köşe seçecek. Sen de seç.';
    } else {
      // karşı karşıya: kaleci üstüne gelir, açı daralır
      this.spot.set(side * rnd(0, 5), BALL_R, GZ + rnd(15, 18));
      title = 'Karşı karşıya'; text = 'Kaleci üstüne geliyor. Köşeye yerleştir ya da aşırt.';
    }
    if (this.minutes[this.idx] >= 78) text = 'Son dakikalar. ' + text;
    this.ball.visible = true; this.ball.position.copy(this.spot); this.bv.set(0, 0, 0); this.live = false; this.inGoal = false; this.hitPost = false; this.byMate = false; this.curveT = 0;
    const fl = Math.hypot(this.spot.x, this.spot.z - GZ); this.fwd.set(-this.spot.x / fl, (GZ - this.spot.z) / fl);
    // pas ve ortada kamera topun tam arkasında değildir; çekiş yönü kameranın baktığı yöne göre hesaplanır
    if (this.type === 'pass') this.fwd.set(0.2 * (this.mx - this.spot.x), -19).normalize();
    if (this.type === 'cross') this.fwd.set(-0.5 * this.spot.x, -18).normalize();
    this.kState = 'set'; this.plan = null; this.kx = clamp(this.spot.x * 0.12, -1.5, 1.5); this.kz = GZ + 0.7;
    this.kicker = 'player'; this.kickT = 9; this.aiming = false; this.power = 0; this.arrow.visible = false;
    this.mode = 'intro'; this.t = 0;
    this.hooks.board(this.us, this.them, this.minutes[this.idx], this.rival, this.results);
    this.hooks.prompt(`${this.minutes[this.idx]}' ${title}`, news + text);
    // kamera yeni noktaya geçer
    this.camPos.set(this.spot.x - this.fwd.x * 9, 5.5, this.spot.z - this.fwd.y * 9); this.camLook.set(this.spot.x + this.fwd.x * 8, 1, this.spot.z + this.fwd.y * 8);
  }

  private finish() {
    this.mode = 'done'; this.sfx.whistle(true);
    const rating = clamp(5.5 + this.goals * 1.4 + this.assists * 1.0 - this.results.filter(r => r === 'miss').length * 0.35 + (this.us > this.them ? 0.5 : this.us < this.them ? -0.4 : 0), 3, 10);
    this.hooks.over({ us: this.us, them: this.them, goals: this.goals, assists: this.assists, rating: Math.round(rating * 10) / 10, rival: this.rival });
  }

  // ---------- kontrol: geri çek, bırak, topun vuruş noktasını seç ----------
  /** dx, dy: parmağın bastığı yerden kayması (piksel). h: ekran yüksekliği */
  aimDrag(dx: number, dy: number, h: number) {
    if (this.mode !== 'aim') return;
    const len = Math.hypot(dx, dy); this.aiming = len > 14;
    if (!this.aiming) { this.arrow.visible = false; return; }
    // sapan gibi: çekişin tersine gider. Ekranın yukarısı = kameranın baktığı yön.
    const a = Math.atan2(-dx, Math.max(dy, -len * 0.2)), f = this.fwd, c = Math.cos(a), s = Math.sin(a);
    this.aimDir.set(f.x * c - f.y * s, f.y * c + f.x * s).normalize();
    this.power = clamp((len - 14) / (h * 0.27), 0.05, 1);
  }
  aimRelease() {
    if (this.mode !== 'aim') return;
    if (!this.aiming || this.power < 0.08) { this.aiming = false; this.arrow.visible = false; return; }
    this.mode = 'contact'; this.t = 0; this.aiming = false; this.hooks.contact(true, this.contactTime, Math.max(0, 20 - this.sk.calm * 4 + Math.min(8, this.level))); this.hooks.prompt('', 'Topun neresine vuracaksın?'); vib(15);
  }
  /** cx, cy: topun üzerindeki vuruş noktası (-1..1). Alt = havalanır, yan = falso. */
  contact(cx: number, cy: number) {
    if (this.mode !== 'contact') return;
    this.hooks.contact(false, 0, 0); this.hooks.prompt('', '');
    const l = Math.hypot(cx, cy); if (l > 1) { cx /= l; cy /= l; }
    const p = this.power, off = Math.min(1, Math.hypot(cx, cy));
    const v = (9 + (20 + 1.6 * this.sk.power) * p) * (1 - 0.12 * off), th = clamp(0.13 - cy * (cy < 0 ? 0.33 : 0.115), 0.015, 0.5) * (0.6 + 0.4 * p);
    // teknik: sert vuruşlarda yön biraz sapar, yetenek arttıkça azalır
    const er = (Math.random() - 0.5) * 2 * Math.max(0.006, 0.042 - 0.007 * this.sk.tech) * p, d = this.aimDir.clone().rotateAround(new THREE.Vector2(), er), qx = -d.y, qz = d.x;
    this.launch(d.x, d.y, v, th);
    const k = -cx * (8 + 1.5 * this.sk.curve) * (0.35 + 0.65 * p); this.curve.set(qx * k, 0, qz * k); this.curveT = Math.abs(cx) > 0.12 ? 1.7 : 0;
    this.kicker = 'player'; this.kickT = 0; this.byMate = false;
    this.hooks.popup(Math.round(v * 3.6) + ' km/s', 'good');
    this.hitstop = 0.05 + 0.04 * p; this.shake = 0.12 + 0.25 * p; this.sfx.strike(p); vib(30 + Math.round(60 * p));
    this.fx.emit(this.ball.position.clone(), 0xffffff, 8 + Math.round(14 * p), 3 + 3 * p, 0.7, 0.4);
    this.planKeeper(v);
  }

  private launch(dx: number, dz: number, v: number, th: number) {
    this.bv.set(dx * v * Math.cos(th), v * Math.sin(th), dz * v * Math.cos(th)); this.curveT = 0;
    this.mode = 'fly'; this.live = true; this.sinceKick = 0; this.inGoal = false; this.arrow.visible = false; this.runLine.visible = false;
  }

  /** Kaleci topun yolunu hesaplar: kendi hizasına ne zaman, nerede gelecek? */
  private planKeeper(v: number) {
    this.plan = null; if (this.kState !== 'set') return;
    const p = this.ball.position.clone(), w = this.bv.clone(); let T = 0, ct = this.curveT;
    for (; T < 3 && p.z > this.kz; T += 0.01) {
      if (ct > 0) { w.addScaledVector(this.curve, 0.01); ct -= 0.01; }
      w.y -= G * 0.01; p.addScaledVector(w, 0.01);
      if (p.y < BALL_R) { p.y = BALL_R; if (w.y < -1.2) { w.y *= -0.58; w.x *= 0.86; w.z *= 0.86; ct = 0; } else { w.y = 0; w.x *= 0.991; w.z *= 0.991; } }
      if (w.z > -0.5) return;
    }
    if (p.z > this.kz) return;
    const react = Math.max(0.16, 0.27 - this.level * 0.012), vmax = Math.min(7.6, 6 + this.level * 0.18), acc = 24, tv = vmax / acc, tm = Math.max(0, T - react);
    const can = tm < tv ? 0.5 * acc * tm * tm : 0.5 * acc * tv * tv + vmax * (tm - tv);
    const lateral = Math.abs(p.x - this.kx), need = Math.hypot(lateral, Math.max(0, p.y - 1.5) * 0.9) - 0.9;
    const onTarget = Math.abs(p.x) < GOAL_W + 0.9 && p.y < GOAL_H + 0.6, reach = onTarget && need <= can && p.y < 2.8;
    const sp = w.length(), kind = sp < 19 || (need < -0.2 && sp < 25) ? 'catch' : can - need < 0.3 ? 'tip' : 'parry';
    this.plan = { T, x: p.x, y: p.y, from: this.kx, dir: Math.sign(p.x - this.kx) || 1, dist: reach ? Math.max(0, lateral - 0.25) : Math.min(lateral, can + 0.4), reach, kind, done: false, dive: onTarget && lateral > 0.85 };
    if (this.type === 'penalty' && Math.random() > 0.42 + this.level * 0.02) {
      // penaltıda kaleci tahmin eder: yanlış köşeye giderse yetişemez
      const pl = this.plan; pl.reach = false; pl.dir = Math.abs(p.x) < 0.8 ? (Math.random() < 0.5 ? -1 : 1) : -Math.sign(p.x); pl.dist = 2.4; pl.dive = true;
    }
    if (onTarget || Math.abs(p.x) < 6) { this.kState = 'dive'; this.kT = 0; }
  }

  // ---------- ana döngü ----------
  update(dtReal: number) {
    this.clock += dtReal;
    if (this.mode === 'menu') return this.updateMenu(dtReal);
    if (this.hitstop > 0) { this.hitstop -= dtReal; this.updateCamera(dtReal); return; }
    this.slow = Math.max(0, this.slow - dtReal);
    const dt = this.mode === 'contact' ? dtReal * 0.05 : dtReal * (this.slow > 0 ? 0.35 : 1);
    this.t += dtReal; this.kickT += dt;

    if (this.mode === 'intro' && this.t > 1.5) { this.mode = 'aim'; this.hooks.prompt('', this.feed() ? 'Geri çek, arkadaşının önüne nişan al, bırak' : 'Geri çek, nişan al, bırak'); }
    if (this.mode === 'contact' && this.t > this.contactTime) this.contact(0, 0);
    if (this.mode === 'result' && this.t > 1.9) this.nextMoment();

    // nişan oku
    this.arrow.visible = this.mode === 'aim' && this.aiming || this.mode === 'contact';
    if (this.arrow.visible) {
      const L = 2 + this.power * 9; this.arrow.position.set(this.spot.x, 0.04, this.spot.z); this.arrow.rotation.y = Math.atan2(this.aimDir.x, this.aimDir.y);
      this.arrow.getObjectByName('shaft')!.scale.set(1, L, 1); this.arrow.getObjectByName('head')!.position.z = L;
      this.arrowMat.color.setHex(this.power > 0.9 ? 0xff4d6d : this.power > 0.6 ? 0xffd23f : 0xf4fff0);
    }
    this.updatePeople(dt);
    this.updateKeeper(dt);
    if (this.mode === 'fly' || this.mode === 'result') this.updateBall(dt);
    this.world.update(dt); this.fx.update(dt, 0); this.world.follow(this.spot.x, this.spot.z - 6);
    this.updateCamera(dtReal);
  }

  private updatePeople(dt: number) {
    // vuran oyuncu: topun arkasında bekler, vuruşta adımını atar
    const f = this.fwd, d = this.mode === 'aim' && this.aiming || this.mode === 'contact' || this.kickT < 1 ? this.aimDir : f;
    const back = this.kickT < 0.5 && this.kicker === 'player' ? 0.45 : 1.0;
    this.player.root.position.set(this.spot.x - d.x * back - d.y * 0.22, 0, this.spot.z - d.y * back + d.x * 0.22);
    this.player.baseYaw = Math.atan2(d.x, d.y);
    this.player.setPose(this.kickT < 0.42 && this.kicker === 'player' ? this.kickPose(this.kickT) : this.celebrating() ? this.cheer() : this.readyPose(), dt, this.kickT < 0.4 ? 34 : 14);

    // savunmacılar: şutta yerinde, barajda sıçrar, pasta topa koşar
    for (const o of this.defs) {
      const b = this.ball.position; let p: Pose;
      if (o.wall) { const j = this.live && this.sinceKick < 0.7 && !this.byMate ? Math.sin(Math.PI * this.sinceKick / 0.7) * 0.5 : 0; p = pose({ y: j, shL: 0.5, shR: 0.5, saL: -0.1, saR: -0.1, elL: 0.9, elR: 0.9, thL: 0.05 + j, thR: 0.05 + j, knL: j * 1.5, knR: j * 1.5, g: j > 0.02 ? 0 : 1 }); }
      else if (this.type === 'pass' && this.live && !this.byMate) {
        const dx = b.x - o.x, dz = b.z - o.z, l = Math.hypot(dx, dz);
        if (l < 9 && l > 0.3) { const s = Math.min(6.2, 4.6 + this.level * 0.2) * dt; o.x += dx / l * s; o.z += dz / l * s; o.phase += s * 2; p = runPose(o.phase, 0.9, 0.2); } else p = jockeyPose(this.clock + o.phase);
      } else p = jockeyPose(this.clock * 0.6 + o.phase);
      o.fb.root.position.set(o.x, 0, o.z); o.fb.baseYaw = Math.atan2(this.spot.x - o.x, this.spot.z - o.z); o.fb.setPose(p, dt, 14);
    }

    // takım arkadaşı
    if (this.mate.root.visible) {
      let p: Pose; const m = this.mate;
      const running = this.feed() && (this.mode === 'fly' || this.mode === 'contact') && !this.mGot && !this.byMate;
      if (this.mode === 'aim' || this.mode === 'intro') {
        // koşu çizgisi: nereye koşacağını gösterir
        const lx = this.mTo.x - this.mx, lz = this.mTo.y - this.mz; this.runLine.visible = true; this.runLine.position.set(this.mx, 0.035, this.mz); this.runLine.rotation.y = Math.atan2(lx, lz); this.runLine.scale.set(1, Math.hypot(lx, lz), 1);
        const w = Math.sin(this.clock * 6); p = pose({ shR: 2.7 + 0.2 * w, saR: 0.3, elR: 0.2, thL: 0.3, knL: 0.5, pitch: 0.15 }); m.baseYaw = Math.atan2(lx, lz);
      } else if (running && this.mode === 'fly') {
        let tx = this.mTo.x, tz = this.mTo.y; const b = this.ball.position, bd = Math.hypot(b.x - this.mx, b.z - this.mz);
        if (bd < 5 && b.y < (this.type === 'cross' ? 4 : 1.2)) { tx = b.x + this.bv.x * 0.2; tz = b.z + this.bv.z * 0.2; }   // top yakınsa üstüne gider
        const dx = tx - this.mx, dz = tz - this.mz, l = Math.hypot(dx, dz), s = 6.8 * dt;
        if (l > 0.3) { this.mx += dx / l * s; this.mz += dz / l * s; this.mPhase += s * 1.8; m.baseYaw = Math.atan2(dx, dz); }
        p = runPose(this.mPhase, 1, 0.22);
        if (bd < (this.type === 'cross' ? 1.6 : 1.25) && b.y < (this.type === 'cross' ? 2.7 : 1.0) && this.live && this.sinceKick > 0.25) this.mateShoots();
      } else if (this.kickT < 0.42 && this.kicker === 'mate') p = this.kickPose(this.kickT);
      else p = this.celebrating() ? this.cheer() : this.readyPose();
      m.root.position.set(this.mx, 0, this.mz); m.setPose(p, dt, 16);
    }
  }
  private readyPose() { const w = Math.sin(this.clock * 2.4); return pose({ pitch: 0.1, thL: 0.25, thR: -0.1, knL: 0.35, knR: 0.25, abL: 0.1, abR: 0.1, saL: 0.3 + 0.03 * w, saR: 0.3 - 0.03 * w, elL: 0.5, elR: 0.5 }); }
  private celebrating() { return this.mode === 'result' && this.results[this.results.length - 1] !== 'miss'; }
  private cheer() { const w = Math.sin(this.clock * 12); return pose({ shL: 2.9, shR: 2.9, saL: 0.45, saR: 0.45, elL: 0.2, elR: 0.2, y: Math.abs(w) * 0.14, pitch: -0.1 }); }
  private kickPose(t: number) {
    const u = t / 0.42, sw = clamp(t / 0.1, 0, 1), pw = 0.55 + 0.45 * this.power;
    return pose({ pitch: -0.12 + 0.3 * sw, twist: (-0.5 + sw) * pw, thR: (-0.9 + 2.5 * sw - 0.7 * Math.max(0, u - 0.5)) * pw, knR: 1.4 * (1 - sw), thL: 0.15, knL: 0.35, abL: 0.12, shL: 1.2 - 1.6 * sw, shR: -0.9 + 0.6 * sw, saL: 1.1, saR: 0.8, elL: 0.3, elR: 0.4, y: 0.06 * Math.sin(Math.PI * u) });
  }

  /** Pas ulaştı: arkadaşın tek vuruşla uzak köşeye vurur */
  private mateShoots() {
    this.mGot = true; this.byMate = true; this.kicker = 'mate'; this.kickT = 0; this.power = 0.9;
    const b = this.ball.position, head = b.y > 1.0; if (!head) b.y = BALL_R;
    const tx = (this.kx > 0 ? -1 : 1) * rnd(2.3, 3.2), ty = rnd(0.4, 1.7), v = head ? 19 : 26;
    let dx = tx - b.x, dz = GZ - b.z; const D = Math.hypot(dx, dz); dx /= D; dz /= D;
    const disc = v ** 4 - G * (G * D * D + 2 * (ty - b.y) * v * v), th = disc > 0 ? Math.atan((v * v - Math.sqrt(disc)) / (G * D)) : 0.3;
    this.mate.baseYaw = Math.atan2(dx, dz);
    if (this.kState !== 'hold') this.kState = 'set';
    this.launch(dx, dz, v, th); this.hooks.popup(head ? 'KAFA!' : this.type === 'cross' ? 'ORTA YERİNDE!' : 'PAS ULAŞTI!', 'good'); this.sfx.strike(0.9); this.shake = 0.2; vib(40);
    this.fx.emit(b.clone(), 0xffffff, 16, 5, 0.7, 0.4);
    this.planKeeper(v);
  }

  // ---------- top ----------
  private updateBall(dt: number) {
    const b = this.ball.position; this.sinceKick += dt;
    for (let n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n, i = 0; i < n; i++) this.stepBall(h);
    if (this.live && this.bv.lengthSq() > 60 && Math.random() < 0.7) this.fx.emit(b.clone(), 0xffe9a8, 1, 0.3, 0.4, 0.28, 0);
    if (this.live && this.kState !== 'hold' && this.sinceKick > 0.6 && b.y <= BALL_R + 0.01 && Math.hypot(this.bv.x, this.bv.z) < 1.2) this.end(this.feed() && !this.byMate ? (this.type === 'cross' ? 'ORTA ULAŞMADI' : 'PAS ULAŞMADI') : 'KAÇTI');
    if (this.live && this.sinceKick > 6) this.end('KAÇTI');
  }
  private spin(dx: number, dz: number) { const d = Math.hypot(dx, dz); if (d > 1e-5) this.ball.rotateOnWorldAxis(new THREE.Vector3(dz / d, 0, -dx / d), d / BALL_R); }

  private stepBall(h: number) {
    const b = this.ball.position, v = this.bv, pz0 = b.z, px0 = b.x;
    if (this.kState === 'hold') { const k = this.keeper.root.position; b.set(k.x + (this.plan?.dive ? this.plan.dir * 0.75 : 0), this.plan?.dive ? 0.35 : 1.15, k.z + 0.35); return; }
    if (this.curveT > 0) { v.addScaledVector(this.curve, h); this.curveT -= h; }
    else { const s = v.length(); v.multiplyScalar(Math.max(0, 1 - 0.006 * s * h)); }
    v.y -= G * h; b.addScaledVector(v, h); this.spin(b.x - px0, b.z - pz0);
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (v.y < -1.2) { this.sfx.bounce(-v.y); v.y *= -0.58; v.x *= 0.86; v.z *= 0.86; this.curveT = 0; } else { v.y = 0; const f = Math.max(0, 1 - 0.9 * h); v.x *= f; v.z *= f; }
    }
    if (this.inGoal) {
      // file: arka ağ esner ve topu yutar
      const back = GZ - NET_D + this.world.netOffset(b.x, b.y) + BALL_R;
      if (b.z < back) { const hit = Math.abs(v.z); if (hit > 1.5) { this.world.netHit(b.x, b.y, hit * 0.55); this.sfx.netSwish(); } b.z = back; v.z *= -0.06; v.x *= 0.35; v.y *= 0.35; }
      if (Math.abs(b.x) > GOAL_W - BALL_R) { b.x = Math.sign(b.x) * (GOAL_W - BALL_R); v.x *= -0.1; }
      if (b.y > GOAL_H - BALL_R) { b.y = GOAL_H - BALL_R; v.y *= -0.1; }
      if (b.z > GZ - BALL_R && v.z > 0) v.z *= 0.5;
      return;
    }
    // direkler: gerçek çarpışma
    for (const s of [1, -1]) if (b.y < GOAL_H + POST_R) this.bounceOff(b.x - GOAL_W * s, b.z - GZ, 'x');
    if (Math.abs(b.x) < GOAL_W + POST_R) this.bounceOff(b.y - GOAL_H, b.z - GZ, 'y');
    // savunmacılar ve baraj
    if (this.live) for (const o of this.defs) {
      const top = 1.85 + (o.wall && this.sinceKick < 0.7 && !this.byMate ? Math.sin(Math.PI * this.sinceKick / 0.7) * 0.5 : 0);
      const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz);
      if (d < 0.42 + BALL_R && b.y < top && d > 1e-3) {
        const nx = dx / d, nz = dz / d, vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= 1.4 * vn * nx; v.z -= 1.4 * vn * nz; v.multiplyScalar(0.5); v.y = Math.abs(v.y) * 0.4 + 2; }
        this.curveT = 0; this.sfx.glove(); this.fx.emit(b.clone(), 0xffffff, 10, 3, 0.8, 0.4); this.end(o.wall ? 'BARAJ!' : this.feed() && !this.byMate ? (this.type === 'cross' ? 'ORTA KESİLDİ' : 'PAS KESİLDİ') : 'BLOK!');
      }
    }
    this.keeperTouch();
    if (pz0 >= GZ - BALL_R && b.z < GZ - BALL_R) { if (Math.abs(b.x) < GOAL_W && b.y < GOAL_H) this.goal(); else this.end('AUT'); }
    if (Math.abs(b.x) > HALF_W + 3.5 || b.z < GZ - 5.5 || b.z > GZ + 60) { this.end('AUT'); v.x *= -0.3; v.z *= -0.3; }
  }

  private bounceOff(a: number, c: number, ka: 'x' | 'y') {
    const d = Math.hypot(a, c), min = BALL_R + POST_R; if (d >= min || d < 1e-4) return;
    const na = a / d, nc = c / d, b = this.ball.position, v = this.bv;
    b[ka] += na * (min - d); b.z += nc * (min - d);
    const vn = v[ka] * na + v.z * nc; if (vn >= 0) return;
    v[ka] -= 1.62 * vn * na; v.z -= 1.62 * vn * nc; this.curveT = 0;
    if (-vn > 3) { this.sfx.post(); this.shake = 0.3; vib(40); this.fx.emit(b.clone(), 0xffffff, 12, 4, 0.8, 0.4); if (this.live && !this.hitPost) this.hooks.popup('DİREK!', 'warn'); this.hitPost = true; }
  }

  private keeperTouch() {
    const p = this.plan, b = this.ball.position, v = this.bv;
    if (!p || p.done || !this.live || b.z > this.kz + 0.25) return;
    p.done = true; if (!p.reach) return;
    this.curveT = 0; this.sfx.glove(); this.shake = 0.2; vib(25); this.fx.emit(b.clone(), 0xc6ff3a, 14, 4, 0.8, 0.5);
    if (p.kind === 'catch') { this.kState = 'hold'; this.kT = 0; v.set(0, 0, 0); return this.end('KALECİ TUTTU'); }
    if (p.kind === 'tip') { v.multiplyScalar(0.72); v.x += p.dir * rnd(2, 4.5); v.y += rnd(1.5, 4); this.hooks.popup('PARMAK UCU!', 'warn'); return; }
    const s = v.length(); v.set(p.dir * s * rnd(0.2, 0.45), rnd(2, 5.5), s * rnd(0.12, 0.32));
    this.end('KALECİ KURTARDI');
  }

  private goal() {
    if (!this.live) { this.inGoal = true; return; }
    this.inGoal = true; this.live = false; this.curveT = 0; this.us++;
    const b = this.ball.position, corner = Math.abs(b.x) > 2.5 && b.y > 1.55;
    if (this.byMate) { this.assists++; this.results.push('assist'); this.hooks.popup('GOOOL!', 'perfect'); this.hooks.popup('ASİST SENDEN', 'good'); }
    else { this.goals++; this.results.push('goal'); this.hooks.popup('GOOOL!', 'perfect'); if (this.hitPost) this.hooks.popup('DİREKTEN İÇERİ!', 'good'); else if (corner) this.hooks.popup('DOKSAN!', 'good'); else if (this.type === 'freekick') this.hooks.popup('FRİKİKTEN!', 'good'); }
    this.sfx.goal(); this.sfx.crowd(1); this.slow = 0.7; this.shake = 0.3; vib([40, 50, 40, 50, 120]);
    for (let i = 0; i < 4; i++) this.fx.emit(new THREE.Vector3(rnd(-4, 4), rnd(3, 5), GZ + 2), [0xffd23f, 0xff4d6d, 0x39f0c8, 0xffffff][i], 30, 7, 0.8, 1.6, 5);
    this.mode = 'result'; this.t = -0.6; this.hooks.board(this.us, this.them, this.minutes[this.idx], this.rival, this.results);
  }

  private end(text: string) {
    if (!this.live) return; this.live = false;
    this.results.push('miss'); this.hooks.popup(text, 'warn'); this.sfx.crowd(0.12);
    this.mode = 'result'; this.t = 0; this.hooks.board(this.us, this.them, this.minutes[this.idx], this.rival, this.results);
  }

  // ---------- kaleci ----------
  private updateKeeper(dt: number) {
    const k = this.keeper, p = this.plan; this.kT += dt;
    let target: Pose;
    if (this.kState === 'set') {
      const rush = this.type === 'oneone' && this.mode !== 'intro', tx = clamp(this.ball.position.x * (rush ? 0.5 : this.type === 'cross' ? 0.1 : 0.14), -2.4, 2.4), step = 3 * dt; this.kx += clamp(tx - this.kx, -step, step);
      if (rush && this.mode === 'aim') this.kz = Math.min(GZ + 7.5, this.kz + (1.7 + this.level * 0.1) * dt);
      const tense = this.mode === 'contact' || (this.mode === 'aim' && this.aiming);
      target = jockeyPose(this.clock * 0.5); target.saL = target.saR = tense ? 1.25 : 1.0; target.pitch = tense ? 0.38 : 0.25;
    } else if (this.kState === 'dive' && p) {
      const react = Math.max(0.16, 0.27 - this.level * 0.012), u = clamp((this.kT - react) / Math.max(0.08, p.T - react), 0, 1);
      this.kx = p.from + p.dir * p.dist * u * u * (3 - 2 * u);
      if (this.kT < react) target = jockeyPose(this.clock);
      else if (p.dive) {
        const fly = Math.sin(Math.PI * clamp(this.kT / (p.T + 0.25), 0, 1));
        target = sideFallPose((this.kT - react) * 1.4, p.dir);
        target.y += clamp(p.y - 0.5, 0, 1.7) * fly; target.shL = target.shR = 2.9; target.saL = target.saR = 0.25; target.elL = target.elR = 0.1; target.thL = 0.1; target.thR = -0.15; target.knL = 0.3; target.knR = 0.2;
      } else {
        const jump = p.y > 1.9 ? Math.sin(Math.PI * clamp(this.kT / (p.T + 0.2), 0, 1)) * 0.5 : 0, low = p.y < 0.6;
        target = pose({ y: jump, thL: 0.4, thR: 0.4, knL: low ? 1.3 : 0.6, knR: low ? 1.3 : 0.6, abL: 0.3, abR: 0.3, pitch: low ? 0.5 : 0.1, shL: 0.8 + p.y * 0.9, shR: 0.8 + p.y * 0.9, saL: 0.2, saR: 0.2, elL: 0.3, elR: 0.3 });
      }
      if (this.kT > p.T + 0.35) { this.kState = 'down'; this.kT = 0; }
    } else if (this.kState === 'down') target = p?.dive ? sideFallPose(1, p.dir) : pose({ thL: 0.3, thR: 0.3, knL: 0.5, knR: 0.5 });
    else target = p?.dive ? sideFallPose(1, p.dir) : pose({ shL: 1.3, shR: 1.3, saL: 0.1, saR: 0.1, elL: 1.5, elR: 1.5, pitch: 0.1 });
    k.root.position.set(this.kx, 0, this.kz); k.baseYaw = 0; k.setPose(target, dt, this.kState === 'dive' ? 22 : 12);
  }

  // ---------- kamera ----------
  private updateCamera(dt: number) {
    const cam = this.camera, b = this.ball.position, f = this.fwd, s = this.spot;
    // nişan alırken topun arkasında, okun ve kalenin görüneceği yükseklikte
    const tp = new THREE.Vector3(s.x - f.x * 8.2, 5.2, s.z - f.y * 8.2), tl = new THREE.Vector3(s.x + f.x * 9, 0.6, s.z + f.y * 9);
    let rate = 5;
    if (this.type === 'cross' && this.mode !== 'fly' && this.mode !== 'result') { tp.set(s.x * 0.9, 13, s.z + 13); tl.set(s.x * 0.4, 0, s.z - 5); }
    if (this.type === 'pass' && (this.mode === 'aim' || this.mode === 'intro' || this.mode === 'contact')) { tp.set(s.x * 0.85 + this.mx * 0.15, 13, s.z + 11); tl.set(s.x * 0.65 + this.mx * 0.35, 0, s.z - 8); }
    if (this.mode === 'contact') { tp.y -= 0.8; rate = 8; }
    if (this.mode === 'fly' || this.mode === 'result') {
      tl.set(b.x, Math.max(0.8, b.y * 0.8), b.z); tp.set(s.x * 0.5 + b.x * 0.4, 3.8, Math.max(b.z + 10, Math.min(s.z + 7, b.z + 16))); rate = 6;
    }
    const k = 1 - Math.exp(-rate * dt); this.camPos.lerp(tp, k); this.camLook.lerp(tl, k);
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
    this.ball.visible = true; this.ball.position.set(lx * Math.cos(a) + lz * Math.sin(a), BALL_R, -lx * Math.sin(a) + lz * Math.cos(a));
    this.ball.rotation.set(0, a, 0);
    this.keeper.root.position.set(0, 0, GZ + 0.7); this.keeper.setPose(jockeyPose(t), dt, 10);
    this.fx.update(dt, 0); this.world.update(dt); this.world.follow(0, 0);
    this.camera.position.set(0, 1.45, 8.6); this.camera.lookAt(0, 0.1, 0);
    this.camPos.copy(this.camera.position); this.camLook.set(0, 0.1, 0);
  }
}
