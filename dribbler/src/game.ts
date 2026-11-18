import * as THREE from 'three';
import { Footballer, Look, Pose, pose, runPose, jockeyPose, slidePose, sitFallPose, diveFallPose, sideFallPose } from './character';
import { World, BOX } from './world';
import { Particles, hintMaterial } from './fx';
import { Sfx } from './audio';
import { makeBallTexture } from './cosmetics';

export type Dir = 'l' | 'r' | 'u' | 'd';
type DType = 'track' | 'lean' | 'slide' | 'lunge' | 'static';
export interface Stats { score: number; dist: number; dribbles: number; perfects: number; bestMult: number; goals: number; reason: string }
type KKind = 'center' | 'left' | 'right' | 'rush';
export interface Hooks {
  popup(text: string, kind: 'perfect' | 'good' | 'warn'): void;
  hud(score: number, mult: number, goals: number): void;
  stage(n: number): void;
  over(s: Stats): void;
}

const LANE_X = [-2.3, 0, 2.3];
const BALL_R = 0.15;
const PERFECT = 0.25;          // temasa bu kadar saniye kala yapılan çalım "mükemmel"
const ACTIVATE = { track: 40, lean: 40, slide: 17, lunge: 16, static: 0 };
const MARK_COL = { track: 0xffffff, lean: 0xffffff, slide: 0xffd23f, lunge: 0xff4d6d, static: 0xffffff };

interface Def {
  type: DType; s: number; x: number; fb: Footballer; state: 'approach' | 'beaten' | 'gone' | 'won';
  t: number; cover: number; sliding: boolean; perfect: boolean; beatDir: number; force: boolean; phase: number;
  marker: THREE.Mesh; hint: THREE.Sprite; warned: boolean;
}
interface Move { type: 'cut' | 'spin' | 'hop' | 'drag' | 'bump'; t: number; dur: number; dir: number; from: number; to: number }

const ease = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const approach = (v: number, target: number, step: number) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);

export class Game {
  mode: 'menu' | 'run' | 'goal' | 'dead' = 'menu';
  // atak: belli sayıda savunmacı, sonunda kale ve kaleci
  private stage = 1; private left = 0; private goalS = 0; private circleS = 0; private keeper!: Footballer; private kHint!: THREE.Sprite;
  private kKind: KKind = 'center'; private kx = 0; private kOut = 0; private kDive = 0; private shootPhase = false; private goalT = 0;
  private shot: { t: number; dur: number; from: THREE.Vector3; fromS: number; toS: number; tx: number; ty: number; arc: number; goal: boolean; perfect: boolean } | null = null;
  hints = true;
  private world: World; private player: Footballer; private ball: THREE.Mesh; private ballMat: THREE.MeshStandardMaterial;
  private fx = new Particles(); private defs: Def[] = []; private pool: Footballer[] = [];
  private rival!: Look;
  private dist = 0; private speed = 10; private phase = 0; private lane = 1; private px = 0;
  private move: Move | null = null; private buffer: Dir | null = null;
  private nextS = 0; private encounters = 0; private slow = 0; private shake = 0; private fovKick = 0;
  private bonus = 0; private mult = 1; private stats: Stats = { score: 0, dist: 0, dribbles: 0, perfects: 0, bestMult: 1, goals: 0, reason: '' };
  private deadT = 0; private overSent = false; private ballVel = new THREE.Vector3(); private camX = 0; private time = 0;
  private lastCycle = 0; private window = 0.56;
  private ringGeo = new THREE.RingGeometry(0.62, 0.8, 40);

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private sfx: Sfx, private hooks: Hooks, look: Look) {
    this.world = new World(scene);
    this.keeper = new Footballer(look); this.keeper.root.visible = false; scene.add(this.keeper.root);
    this.kHint = new THREE.Sprite(hintMaterial('lr')); this.kHint.visible = false; this.kHint.renderOrder = 10; scene.add(this.kHint);
    this.player = new Footballer(look); scene.add(this.player.root);
    this.ballMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.ballMat); this.ball.castShadow = true; scene.add(this.ball);
    scene.add(this.fx.points);
    this.toMenu();
  }

  setPlayerLook(l: Look) { this.player.setLook(l); }
  setKeeperLook(l: Look) { this.keeper.setLook(l); }
  setRivalLook(l: Look) { this.rival = l; for (const f of this.pool) f.setLook(l); for (const d of this.defs) d.fb.setLook(l); }
  setBall(b: { base: string; patch: string; style: string }) { const o = this.ballMat.map; this.ballMat.map = makeBallTexture(b); this.ballMat.needsUpdate = true; o?.dispose(); }

  toMenu() {
    this.mode = 'menu'; this.clearDefs(); this.goalS = 0; this.shot = null; this.shootPhase = false; this.keeper.root.visible = false; this.kHint.visible = false; this.world.setStage(null, null);
    this.player.away = false; this.player.root.position.set(0, 0, 0);
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
  }

  start() {
    this.clearDefs();
    this.mode = 'run'; this.dist = 0; this.speed = 10; this.phase = 0; this.lane = 1; this.px = 0; this.move = null; this.buffer = null;
    this.nextS = 46; this.encounters = 0; this.slow = 0; this.shake = 0; this.bonus = 0; this.mult = 1; this.deadT = 0; this.overSent = false; this.camX = 0;
    this.stats = { score: 0, dist: 0, dribbles: 0, perfects: 0, bestMult: 1, goals: 0, reason: '' };
    this.stage = 1; this.setupStage(); this.nextS = 46;
    this.player.away = true; this.player.baseYaw = Math.PI; this.player.root.position.set(0, 0, 0);
    this.player.setPose(runPose(0), 0);
    this.ball.position.set(0.3, BALL_R, -1.2);
    this.sfx.whistle(); this.sfx.crowd(0.2);
    this.hooks.hud(0, 1, 0);
  }

  private setupStage() {
    this.left = Math.min(9, 3 + this.stage); this.goalS = 0; this.shootPhase = false; this.shot = null; this.kOut = 0; this.kDive = 0;
    this.nextS = this.dist + 46; this.circleS = this.dist + 16; this.keeper.root.visible = false; this.kHint.visible = false;
  }

  private clearDefs() { for (const d of this.defs) this.release(d); this.defs.length = 0; }
  private release(d: Def) { this.scene.remove(d.fb.root, d.marker, d.hint); (d.marker.material as THREE.Material).dispose(); this.pool.push(d.fb); }

  // ---------- girdi ----------
  swipe(dir: Dir) {
    if (this.mode !== 'run') return;
    if (this.move && this.move.t < this.move.dur - 0.03) { if (this.move.dur - this.move.t < 0.2) this.buffer = dir; return; }
    this.doMove(dir);
  }

  private ttc(d: Def) { return (d.s - this.dist) / (this.speed + this.own(d)); }
  private own(d: Def) {
    const gap = d.s - this.dist;
    if (d.state !== 'approach' || gap > ACTIVATE[d.type]) return 0;
    return d.type === 'lunge' ? 6.5 : d.type === 'slide' ? (d.sliding ? 7 : 4) : d.type === 'static' ? 0 : 1.2;
  }
  /** Çalım penceresindeki en yakın (duran olmayan) savunmacı */
  private target(maxT: number): Def | null {
    let best: Def | null = null, bt = 1e9;
    for (const d of this.defs) {
      if (d.state !== 'approach' || d.type === 'static') continue;
      const gap = d.s - this.dist; if (gap < 0.85) continue;
      const t = this.ttc(d); if (t <= maxT && t < bt) { bt = t; best = d; }
    }
    return best;
  }

  private doMove(dir: Dir) {
    const tg = this.target(this.window);
    if (this.shootPhase) { if (!this.shot) this.shootBall(dir); return; }
    if (dir === 'l' || dir === 'r') {
      const sgn = dir === 'r' ? 1 : -1, to = this.lane + sgn;
      if (to < 0 || to > 2) { this.move = { type: 'bump', t: 0, dur: 0.16, dir: sgn, from: this.px, to: this.px }; return; }
      let perfect = false;
      if (tg && (tg.type === 'track' || tg.type === 'lean')) {
        if (tg.type === 'lean' && sgn === tg.cover) tg.force = true;   // kapattığı tarafa gittin
        else { perfect = this.ttc(tg) <= PERFECT; this.beat(tg, perfect, sgn); }
      } else if (!tg) {
        const near = this.target(this.window + 0.4);
        if (near && (near.type === 'track' || near.type === 'lean') && !near.warned) { near.warned = true; this.early(); }
      }
      this.move = { type: perfect && this.stats.perfects % 2 === 0 ? 'spin' : 'cut', t: 0, dur: perfect ? 0.34 : 0.24, dir: sgn, from: this.px, to: LANE_X[to] };
      this.lane = to; this.sfx.whoosh();
      this.fx.emit(new THREE.Vector3(this.px, 0.1, 0.2), 0x9dffb0, 8, 2.2, 0.8, 0.4);
    } else if (dir === 'u') {
      this.move = { type: 'hop', t: 0, dur: 0.56, dir: 0, from: this.px, to: this.px }; this.sfx.hop();
      if (tg && tg.type === 'slide') this.beat(tg, this.ttc(tg) <= PERFECT, 0);
      else if (!tg) { const n = this.target(this.window + 0.4); if (n && n.type === 'slide' && !n.warned) { n.warned = true; this.early(); } }
    } else {
      this.move = { type: 'drag', t: 0, dur: 0.46, dir: 0, from: this.px, to: this.px }; this.sfx.drag();
      if (tg && tg.type === 'lunge') this.beat(tg, this.ttc(tg) <= PERFECT, this.px > tg.x ? 1 : -1);
      else if (!tg) { const n = this.target(this.window + 0.4); if (n && n.type === 'lunge' && !n.warned) { n.warned = true; this.early(); } }
    }
  }

  private early() { this.hooks.popup('ERKEN!', 'warn'); this.sfx.early(); if (this.mult > 1) { this.mult--; this.hooks.hud(this.score(), this.mult, this.stats.goals); } }
  private score() { return Math.floor(this.dist) + this.bonus; }

  private beat(d: Def, perfect: boolean, dir: number) {
    d.state = 'beaten'; d.t = 0; d.perfect = perfect; d.beatDir = dir; d.hint.visible = false;
    this.stats.dribbles++;
    if (perfect) { this.stats.perfects++; this.mult = Math.min(5, this.mult + 1); }
    this.stats.bestMult = Math.max(this.stats.bestMult, this.mult);
    const pts = (perfect ? 250 : 100) * this.mult; this.bonus += pts;
    const p = new THREE.Vector3(d.x, 1.0, -(d.s - this.dist));
    if (perfect) {
      this.slow = 0.26; this.fovKick = -7; this.sfx.perfect(this.stats.dribbles);
      this.fx.emit(p, 0xffd23f, 34, 6, 0.9, 0.8, 7); this.fx.emit(p, 0xff5fa2, 16, 4, 1.2, 0.7, 5);
      this.hooks.popup(`MÜKEMMEL! +${pts}`, 'perfect');
      try { navigator.vibrate?.(25); } catch { /* yok */ }
    } else {
      this.sfx.good(this.stats.dribbles); this.fx.emit(p, 0xffffff, 12, 3.5, 0.8, 0.5);
      this.hooks.popup(`İYİ +${pts}`, 'good');
    }
    this.sfx.crowd(0.2 + this.mult * 0.18);
    this.hooks.hud(this.score(), this.mult, this.stats.goals);
  }

  // ---------- şut ----------
  private shootBall(dir: Dir) {
    const gap = this.goalS - this.dist, k = this.kKind, perfect = gap <= BOX;
    let tx = 0, ty = 0.4, goal = false, arc = 0.5;
    if (dir === 'l' || dir === 'r') { const sgn = dir === 'r' ? 1 : -1; tx = sgn * 3.0; ty = perfect ? 1.95 : 1.0; goal = k === 'center' || (k === 'left' && sgn > 0) || (k === 'right' && sgn < 0); this.px += sgn * 0.01; }
    else if (dir === 'u') { tx = this.px * 0.3; ty = 1.5; arc = 3.2; goal = k === 'rush'; }   // aşırtma
    const ks = this.goalS - 1 - this.kOut;
    this.shot = { t: 0, dur: goal ? 0.55 : Math.max(0.25, 0.55 * (ks - this.dist) / Math.max(1, gap)), from: this.ball.position.clone(), fromS: this.dist - this.ball.position.z, toS: goal ? this.goalS + 1.2 : ks - 0.3, tx: goal ? tx : this.kx + (tx - this.kx) * (k === 'rush' ? 0.2 : 0.75), ty: goal ? ty : Math.min(ty, 1.6), arc, goal, perfect };
    this.kDive = Math.abs(tx - this.kx) > 0.8 ? Math.sign(tx - this.kx) : 0;
    this.move = null; this.buffer = null; this.slow = 0; this.sfx.strike(perfect ? 1 : 0.6); this.shake = 0.25; this.fovKick = -6;
    this.fx.emit(this.ball.position.clone(), 0xffffff, 16, 5, 0.7, 0.4);
    try { navigator.vibrate?.(40); } catch { /* yok */ }
  }

  private scored() {
    const s = this.shot!; this.mode = 'goal'; this.goalT = 0; this.stats.goals++; this.shootPhase = false;
    if (s.perfect) { this.mult = Math.min(5, this.mult + 1); this.stats.perfects++; } this.stats.bestMult = Math.max(this.stats.bestMult, this.mult);
    const pts = (s.perfect ? 1500 : 1000) * this.mult; this.bonus += pts;
    this.hooks.popup('GOOOL!', 'perfect'); this.hooks.popup((s.perfect ? 'CEZA SAHASINDAN! +' : '+') + pts, 'good');
    this.sfx.goal(); this.sfx.netSwish(); this.sfx.crowd(1); this.world.netKick(); this.slow = 0.6; this.shake = 0.35;
    const gz = -(this.goalS - this.dist);
    for (let i = 0; i < 4; i++) this.fx.emit(new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 2, gz + 2), [0xffd23f, 0xff4d6d, 0x39f0c8, 0xffffff][i], 30, 7, 0.8, 1.6, 5);
    try { navigator.vibrate?.([40, 50, 40, 50, 120]); } catch { /* yok */ }
    this.hooks.hud(this.score(), this.mult, this.stats.goals);
  }

  private fail(reason: string, side: number) {
    this.mode = 'dead'; this.deadT = 0; this.stats.reason = reason; this.shootPhase = false;
    this.slow = 0.5; this.shake = 0.5; this.sfx.fail(); this.sfx.crowd(0.05);
    this.ballVel.set(side * (2 + Math.random() * 2), 3.2, -3 - this.speed * 0.25);
    try { navigator.vibrate?.([40, 40, 80]); } catch { /* yok */ }
    this.stats.score = this.score(); this.stats.dist = Math.floor(this.dist);
  }

  /** Kale, kaleci ve şut anı */
  private updateGoal(dt: number) {
    this.world.setStage(-(this.circleS - this.dist), this.goalS ? -(this.goalS - this.dist) : null);
    const k = this.keeper;
    if (!this.goalS) { k.root.visible = false; this.kHint.visible = false; return; }
    const gap = this.goalS - this.dist, alive = this.mode === 'run', s = this.shot;
    if (alive && !s) {
      const clear = !this.defs.some(d => d.state === 'approach' && d.s > this.dist);
      if (!this.shootPhase && gap < 28 && clear) { this.shootPhase = true; this.move = null; this.hooks.popup('ŞUT ÇEK!', 'good'); this.sfx.crowd(0.7); }
      const tx = this.kKind === 'left' ? -1.5 : this.kKind === 'right' ? 1.5 : this.kKind === 'rush' ? this.px * 0.5 : this.px * 0.15;
      this.kx += Math.max(-4 * dt, Math.min(4 * dt, tx - this.kx));
      if (this.kKind === 'rush' && this.shootPhase) this.kOut = Math.min(gap - 2, this.kOut + 6.5 * dt);
      if (this.shootPhase && (this.goalS - 1 - this.kOut) - this.dist < 2.6) { k.root.position.x = this.kx; this.fail('Kaleci topu aldı', this.px >= this.kx ? 1 : -1); }
    }
    if (s && this.mode !== 'dead') {
      s.t += dt; const u = Math.min(1, s.t / s.dur);
      if (this.kDive) this.kx += this.kDive * (s.goal ? 3.2 : 7) * dt;
      if (u >= 1 && this.mode === 'run') { if (s.goal) this.scored(); else { this.sfx.glove(); this.fail('Kaleci kurtardı', this.kDive || 1); this.hooks.popup('KALECİ KURTARDI', 'warn'); } }
    }
    // kaleci duruşu
    const kz = -(this.goalS - 1 - this.kOut - this.dist);
    k.root.visible = kz > -170; k.root.position.set(this.kx, 0, kz);
    let p: Pose;
    if (s && this.kDive) { p = sideFallPose(s.t * 1.6, this.kDive); p.y += Math.min(1.2, s.ty * 0.6) * Math.sin(Math.PI * Math.min(1, s.t / (s.dur + 0.2))); p.shL = p.shR = 2.9; p.saL = p.saR = 0.25; }
    else if (s) p = pose({ y: s.arc > 2 ? 0.35 * Math.sin(Math.PI * Math.min(1, s.t / s.dur)) : 0, shL: 2.6, shR: 2.6, saL: 0.3, saR: 0.3, thL: 0.3, thR: 0.3, knL: 0.5, knR: 0.5 });
    else if (this.kKind === 'rush' && this.shootPhase) p = runPose(this.time * 14, 1, 0.35);
    else { p = jockeyPose(this.time, this.kKind === 'left' ? -1.6 : this.kKind === 'right' ? 1.6 : 0); p.saL = p.saR = 1.1; if (this.kKind === 'right') { p.saL = 1.5; p.elL = 0.1; } if (this.kKind === 'left') { p.saR = 1.5; p.elR = 0.1; } }
    k.setPose(p, dt, 18);
    const show = this.hints && alive && !s && gap < 45;
    this.kHint.visible = show;
    if (show) { this.kHint.material = hintMaterial(this.kKind === 'left' ? 'r' : this.kKind === 'right' ? 'l' : this.kKind === 'rush' ? 'u' : 'lr'); this.kHint.position.set(this.kx, 3.2, kz); this.kHint.scale.setScalar(this.shootPhase ? 1.5 + 0.15 * Math.sin(this.time * 30) : 1.1); }
  }

  private tackled(d: Def) {
    this.mode = 'dead'; this.deadT = 0; d.state = 'won'; d.t = 0; d.hint.visible = false; this.stats.reason = 'Top kaptırıldı';
    this.slow = 0.5; this.shake = 0.5; this.sfx.fail(); this.sfx.crowd(0.05);
    const side = d.x >= this.px ? 1 : -1;
    this.ballVel.set(side * (2 + Math.random() * 2), 3.2, -3 - this.speed * 0.25);
    this.fx.emit(new THREE.Vector3(this.px, 0.4, -0.5), 0xff4d6d, 22, 4, 1, 0.6);
    try { navigator.vibrate?.([40, 40, 80]); } catch { /* yok */ }
    this.stats.score = this.score(); this.stats.dist = Math.floor(this.dist);
  }

  // ---------- rakip üretimi ----------
  private add(type: DType, s: number, lane: number) {
    const fb = this.pool.pop() || new Footballer(this.rival);
    fb.root.scale.setScalar(type === 'lunge' ? 1.14 : 1); fb.baseYaw = 0; fb.away = false;
    const marker = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: MARK_COL[type], transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    marker.rotation.x = -Math.PI / 2; marker.visible = type !== 'static';
    const hint = new THREE.Sprite(hintMaterial('lr')); hint.scale.setScalar(1.0); hint.visible = false; hint.renderOrder = 10;
    const d: Def = { type, s, x: LANE_X[lane], fb, state: 'approach', t: Math.random() * 5, cover: Math.random() < 0.5 ? 1 : -1, sliding: false, perfect: false, beatDir: 0, force: false, phase: 0, marker, hint, warned: false };
    fb.setPose(type === 'static' ? this.readyPose(d) : jockeyPose(0), 0);
    this.scene.add(fb.root, marker, hint); this.defs.push(d);
  }

  private spawn() {
    const s = this.nextS, n = this.encounters++, level = Math.floor(n / 6), r = Math.random;
    const intro = ['track', 'track', 'static', 'slide', 'track', 'lunge', 'wall', 'lean'];
    let kind = intro[n];
    if (!kind) {
      const bag: string[] = ['track', 'track', 'slide', 'slide', 'lunge', 'lunge', 'lean', 'lean', 'wall', 'cover', 'cover'];
      if (level >= 2) bag.push('double', 'double', 'wallslide');
      if (level >= 3) bag.push('slidelunge', 'slidelunge', 'double');
      kind = bag[(r() * bag.length) | 0];
    }
    const L = this.lane; let extra = 0;
    switch (kind) {
      case 'static': this.add('static', s, L); break;
      case 'wall': { const gap = (r() * 3) | 0; for (let i = 0; i < 3; i++) if (i !== gap) this.add('static', s, i); break; }
      case 'cover': this.add('track', s, L); this.add('static', s + 3.4, r() < 0.5 ? 0 : 2); break;
      case 'double': extra = Math.max(10, this.speed * 0.8); this.add('track', s, L); this.add(r() < 0.5 ? 'track' : 'lean', s + extra, L); break;
      case 'slidelunge': extra = this.speed; this.add('slide', s, L); this.add('lunge', s + extra + 6, L); extra += 6; break;
      case 'wallslide': { extra = this.speed * 0.9; const gap = (r() * 3) | 0; for (let i = 0; i < 3; i++) if (i !== gap) this.add('static', s, i); this.add('slide', s + extra + 4, gap); extra += 4; break; }
      default: this.add(kind as DType, s, L);
    }
    this.window = Math.max(0.42, 0.56 - level * 0.015);
    this.nextS = s + extra + this.speed * Math.max(1.05, 2.0 - level * 0.12);
  }

  // ---------- pozlar ----------
  private readyPose(d: Def): Pose {
    const w = Math.sin(d.t * 3);
    return pose({ pitch: 0.18, roll: 0.05 * w, thL: 0.35, thR: 0.35, knL: 0.6, knR: 0.6, abL: 0.3, abR: 0.3, saL: 0.75 + 0.1 * w, saR: 0.75 - 0.1 * w, elL: 0.6, elR: 0.6 });
  }

  private defPose(d: Def, gap: number): Pose {
    if (d.state === 'won') { const w = Math.sin(d.t * 12); return pose({ shL: 2.9, shR: 2.9, saL: 0.4 + 0.1 * w, saR: 0.4 - 0.1 * w, elL: 0.3, elR: 0.3, y: Math.abs(w) * 0.08, pitch: -0.1 }); }
    if (d.state === 'beaten') {
      if (d.type === 'slide') return slidePose();
      if (d.type === 'lunge') return diveFallPose(d.t);
      if (d.t < 0.16) { const p = jockeyPose(d.t, -d.beatDir * 3); if (d.beatDir > 0) p.abR = 0.9; else p.abL = 0.9; return p; }
      if (d.perfect) return sitFallPose(d.t - 0.16);
      // dengesini kaybedip sendeler, sonra yana devrilir
      const k = d.t - 0.16;
      if (k < 0.35) return pose({ roll: -d.beatDir * 0.55, yaw: d.beatDir * 1.2 * (k / 0.35), pitch: 0.35, thL: 0.7, thR: -0.4, knL: 0.9, knR: 0.6, shL: 1.5, shR: -0.8, saL: 1.3, saR: 1.2, elL: 0.3, elR: 0.3 });
      return { ...sideFallPose(k - 0.35, -d.beatDir), yaw: d.beatDir * 1.2 };
    }
    const active = gap < ACTIVATE[d.type];
    switch (d.type) {
      case 'static': return this.readyPose(d);
      case 'track': return jockeyPose(d.t);
      case 'lean': { const p = jockeyPose(d.t, d.cover * 1.6); if (d.cover > 0) { p.saL = 1.5; p.elL = 0.1; p.saR = 0.4; } else { p.saR = 1.5; p.elR = 0.1; p.saL = 0.4; } return p; }
      case 'slide': return d.sliding ? slidePose() : active ? runPose(d.phase, 1, 0.25) : this.readyPose(d);
      case 'lunge': if (active) return runPose(d.phase, 1.1, 0.42);
        { const w = Math.sin(d.t * 7); return pose({ pitch: 0.5, thL: 0.7 + 0.25 * w, thR: 0.1 - 0.25 * w, knL: 0.9 + 0.3 * w, knR: 0.5, saL: 0.5, saR: 0.5, elL: 1.3, elR: 1.3, shL: -0.3, shR: -0.3, head: -0.4 }); }
    }
  }

  // ---------- ana döngü ----------
  update(dtReal: number) {
    this.time += dtReal;
    if (this.mode === 'menu') return this.updateMenu(dtReal);
    this.slow = Math.max(0, this.slow - dtReal);
    const dt = dtReal * (this.slow > 0 ? 0.3 : this.shootPhase && !this.shot ? 0.5 : 1);   // şut anında zaman yavaşlar
    const alive = this.mode === 'run';

    // hız
    let mul = 1;
    const m = this.move;
    if (m && m.type === 'drag') { const u = m.t / m.dur; mul = u < 0.5 ? 0.3 : 0.3 + 0.7 * ((u - 0.5) / 0.5); }
    if (alive && !this.shot) this.speed += (Math.min(17, 10 + this.stats.dribbles * 0.22) - this.speed) * Math.min(1, dt * 2);
    else { this.deadT += dtReal; this.speed *= Math.exp(-4 * dt); }
    let v = this.speed * mul; if (this.goalS && this.dist + v * dt > this.goalS - 4) v = 0;
    const scroll = v * dt;
    this.dist += scroll; this.phase += scroll * 1.85;

    // oyuncu hareketi
    if (m) {
      m.t += dt;
      if (m.type === 'cut' || m.type === 'spin') this.px = m.from + (m.to - m.from) * ease(m.t / (m.dur * 0.85));
      if (m.t >= m.dur) { this.move = null; if (this.buffer && alive) { const b = this.buffer; this.buffer = null; this.doMove(b); } }
    }
    this.player.root.position.x = this.px;
    this.player.setPose(this.playerPose(), dt, alive ? 26 : 12);

    if (alive) {
      while (this.left > 0 && this.dist + 78 >= this.nextS) {
        this.spawn();
        if (--this.left === 0) { this.goalS = this.nextS + 12; this.kx = 0; this.kKind = this.stage === 1 ? 'center' : (['center', 'left', 'right', 'rush', 'left', 'right'] as KKind[])[(Math.random() * (this.stage === 2 ? 3 : 6)) | 0]; }
      }
      this.hooks.hud(this.score(), this.mult, this.stats.goals);
    } else if (this.mode === 'goal') {
      this.goalT += dtReal;
      if (this.goalT > 2.4) {   // sıradaki atak: santra
        this.stage++; this.clearDefs(); this.setupStage(); this.mode = 'run'; this.speed = Math.max(this.speed, 9);
        this.hooks.stage(this.stage); this.hooks.popup(this.stage + '. ATAK', 'good'); this.sfx.whistle(); this.sfx.crowd(0.3);
      }
    } else if (this.deadT > 1.25 && !this.overSent) { this.overSent = true; this.sfx.whistle(true); this.hooks.over(this.stats); }

    this.updateDefs(dt, v);
    this.updateGoal(dt);
    this.updateBall(dt, scroll, v);
    this.world.update(this.dist, dt);
    this.fx.update(dt, scroll);
    if (alive && this.mult >= 4) this.fx.emit(this.ball.position, this.mult >= 5 ? 0xff7a1a : 0xffd23f, 1, 0.6, 1, 0.35, 0);

    // kamera
    this.camX += (this.px * 0.62 - this.camX) * Math.min(1, dtReal * 7);
    this.shake = Math.max(0, this.shake - dtReal); this.fovKick *= Math.exp(-6 * dtReal);
    const sh = this.shake * 0.5, cam = this.camera;
    cam.position.set(this.camX + (Math.random() - 0.5) * sh, 5.7 + (Math.random() - 0.5) * sh, 5.9);
    cam.lookAt(this.camX * 1.1, 1.0, -7.5);
    cam.rotation.z += (this.px - this.camX / 0.62) * -0.035;
    const fov = 62 + (this.speed - 10) * 1.1 + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * Math.min(1, dtReal * 10); cam.updateProjectionMatrix(); }
  }

  private playerPose(): Pose {
    if (this.mode === 'dead') { const k = Math.min(1, this.deadT / 0.4); return pose({ g: 0, y: -0.62 * k, pitch: 1.4 * k, thL: 0.4, thR: -0.3, knL: 0.8, knR: 0.4, shL: 2.4, shR: 2.0, saL: 0.5, saR: 0.6, elL: 0.4, elR: 0.3 }); }
    if (this.mode === 'goal') { const w = Math.sin(this.time * 12); return pose({ shL: 2.9, shR: 2.9, saL: 0.45, saR: 0.45, elL: 0.2, elR: 0.2, y: Math.abs(w) * 0.14, pitch: -0.1 }); }
    if (this.shot && this.shot.t < 0.4) { const sw = Math.min(1, this.shot.t / 0.1), u = this.shot.t / 0.4; return pose({ pitch: -0.12 + 0.3 * sw, twist: -0.5 + sw, thR: -0.9 + 2.5 * sw - 0.7 * Math.max(0, u - 0.5), knR: 1.4 * (1 - sw), thL: 0.15, knL: 0.35, shL: 1.2 - 1.6 * sw, shR: -0.9 + 0.6 * sw, saL: 1.1, saR: 0.8, elL: 0.3, elR: 0.4 }); }
    const p = runPose(this.phase, this.shot ? Math.min(1, this.speed / 8) : 1, 0.2), m = this.move;
    if (!m) return p;
    const u = m.t / m.dur, k = Math.sin(Math.PI * Math.min(1, u));
    if (m.type === 'cut' || m.type === 'bump') { p.roll = m.dir * 0.42 * k; p.twist += m.dir * -0.3 * k; if (m.dir > 0) { p.abL += 0.5 * k; p.saL = 0.9; } else { p.abR += 0.5 * k; p.saR = 0.9; } }
    else if (m.type === 'spin') { p.yaw = -m.dir * Math.PI * 2 * ease(u); p.roll = m.dir * 0.25 * k; p.saL = p.saR = 0.9; p.pitch = 0.1; }
    else if (m.type === 'hop') return pose({ g: 0, y: 0.85 * 4 * u * (1 - u), pitch: 0.12, thL: 1.15, thR: 0.7, knL: 1.6, knR: 1.3, shL: 0.4, shR: 0.4, saL: 1.3, saR: 1.3, elL: 0.5, elR: 0.5 });
    else if (m.type === 'drag') { if (u < 0.55) return pose({ pitch: -0.14, twist: 0.25, thR: 0.6, knR: 0.5, thL: -0.25, knL: 0.35, saL: 1.0, saR: 0.8, elL: 0.5, elR: 0.5, shL: -0.3, shR: 0.2 }); }
    return p;
  }

  private updateBall(dt: number, scroll: number, v: number) {
    const b = this.ball;
    if (this.mode === 'dead') {
      this.ballVel.y -= 12 * dt; b.position.addScaledVector(this.ballVel, dt); b.position.z += scroll * 0.2;
      if (b.position.y < BALL_R) { b.position.y = BALL_R; this.ballVel.y *= -0.5; this.ballVel.x *= 0.8; this.ballVel.z *= 0.8; }
      b.rotation.x -= this.ballVel.z * dt * 4; return;
    }
    if (this.shot) {
      // şut: top hedefe doğru yay çizer, golse filede kalır
      const s = this.shot, u = Math.min(1, s.t / s.dur), sb = s.fromS + (s.toS - s.fromS) * u;
      if (u < 1) { b.position.set(s.from.x + (s.tx - s.from.x) * u, s.from.y + (s.ty - s.from.y) * u + s.arc * Math.sin(Math.PI * u), -(sb - this.dist)); b.rotation.x -= 30 * dt; if (Math.random() < 0.7) this.fx.emit(b.position.clone(), 0xffe9a8, 1, 0.3, 0.4, 0.28, 0); }
      else { b.position.z = -(s.toS - this.dist); b.position.y += (BALL_R - b.position.y) * Math.min(1, dt * 6); }
      return;
    }
    // top, adımlarla eşzamanlı olarak bir sağ bir sol ayakla öne itilir
    const q = (this.phase - Math.PI * 1.5) / (Math.PI * 3), cyc = q - Math.floor(q);
    const side = Math.floor(q) % 2 === 0 ? 1 : -1;
    if (cyc < this.lastCycle && !this.move) { this.sfx.touch(); this.fx.emit(new THREE.Vector3(this.px + side * 0.2, 0.05, -0.6), 0x7dff9a, 3, 1.2, 0.6, 0.3); }
    this.lastCycle = cyc;
    const c = Math.pow(cyc, 0.75);
    let x = this.px + side * 0.55 * (2 * ease(cyc * 1.6) - 1), y = BALL_R, z = -(0.7 + 0.85 * 4 * c * (1 - c)), rate = 30;
    const m = this.move;
    if (m) {
      const u = m.t / m.dur;
      if (m.type === 'cut') { x = m.from + (m.to - m.from) * ease(u * 1.9) + m.dir * 0.3 * Math.sin(Math.PI * Math.min(1, u)); z = -1.6; }
      else if (m.type === 'spin') { const a = -m.dir * Math.PI * 2 * ease(u); x = this.px + Math.sin(a) * 0.75 * m.dir; z = -1.0 - 0.5 * Math.cos(a); }
      else if (m.type === 'hop') { y = BALL_R + 1.25 * 4 * u * (1 - u); z = -1.5; }
      else if (m.type === 'drag') { z = u < 0.5 ? -1.4 + 1.0 * ease(u / 0.5) : -0.4 - 1.3 * ease((u - 0.5) / 0.5); rate = 40; }
    }
    const k = 1 - Math.exp(-rate * dt);
    b.position.x += (x - b.position.x) * k; b.position.y += (y - b.position.y) * k; b.position.z += (z - b.position.z) * k;
    b.rotation.x -= v * dt / BALL_R * 0.6;
  }

  private updateDefs(dt: number, v: number) {
    const alive = this.mode === 'run';
    for (let i = this.defs.length - 1; i >= 0; i--) {
      const d = this.defs[i]; d.t += dt;
      let gap = d.s - this.dist;
      if (d.state === 'approach') {
        const own = this.own(d); d.s -= own * dt; gap -= own * dt; d.phase += own * dt * 2.1;
        const ttc = gap / (v + own + 0.001);
        if (d.type !== 'static' && gap < 40 && alive) {
          if (d.type === 'lean' && ttc > this.window + 0.25) { const open = this.lane - d.cover; if (open < 0 || open > 2) d.cover = -d.cover; }
          const tx = d.force ? this.px : LANE_X[this.lane] + (d.type === 'lean' ? d.cover * 0.5 : 0);
          const rate = d.force ? 18 : d.type === 'lunge' ? 9 : d.type === 'slide' ? (d.sliding ? 11 : 5.5) : 6.5;
          d.x = approach(d.x, tx, rate * dt);
        }
        if (d.type === 'slide' && !d.sliding && ttc < 0.8) { d.sliding = true; this.sfx.drag(); }
        if (d.sliding && Math.random() < 0.5) this.fx.emit(new THREE.Vector3(d.x, 0.1, -gap), 0x9dffb0, 1, 1.5, 0.8, 0.3);
        // işaret halkası ve ipucu
        const inWin = ttc <= this.window && gap > 0.85, perf = inWin && ttc <= PERFECT, mm = d.marker.material as THREE.MeshBasicMaterial;
        mm.color.setHex(perf ? 0xffe14d : MARK_COL[d.type]); mm.opacity = inWin ? 1 : gap < 40 ? 0.45 : 0;
        d.marker.scale.setScalar(perf ? 1.35 : inWin ? 1.15 : 1);
        d.marker.position.set(d.x, 0.03, -gap);
        const showHint = this.hints && alive && d.type !== 'static' && gap < 42 && gap > 0;
        d.hint.visible = showHint;
        if (showHint) {
          let kind: 'l' | 'r' | 'lr' | 'u' | 'd' = d.type === 'slide' ? 'u' : d.type === 'lunge' ? 'd' : 'lr';
          if (d.type === 'lean') kind = d.cover > 0 ? 'l' : 'r';
          else if (d.type === 'track') {
            const blocked = (ln: number) => ln < 0 || ln > 2 || this.defs.some(o => o.type === 'static' && o.state === 'approach' && Math.abs(o.x - LANE_X[ln]) < 0.5 && o.s > d.s - 1 && o.s < d.s + 8);
            const bl = blocked(this.lane - 1), br = blocked(this.lane + 1);
            kind = bl && !br ? 'r' : br && !bl ? 'l' : 'lr';
          }
          d.hint.material = hintMaterial(kind);
          d.hint.position.set(d.x, 2.55 * d.fb.root.scale.y, -gap);
          d.hint.scale.setScalar(inWin ? 1.35 + 0.15 * Math.sin(this.time * 30) : 1.0);
        }
        if (alive && gap <= 0.85) {
          if (gap > -0.7 && Math.abs(d.x - this.px) < 0.95) this.tackled(d);
          else if (gap <= -0.7) { d.state = 'gone'; d.hint.visible = false; }
        }
      } else if (d.state === 'beaten') {
        d.marker.visible = false;
        if (d.type === 'track' || d.type === 'lean') { if (d.t < 0.3) d.x -= d.beatDir * 4.2 * dt; }
        else if (d.type === 'slide') d.s -= 6 * Math.exp(-d.t * 3) * dt;
        else if (d.type === 'lunge') { d.s -= 7 * Math.exp(-d.t * 2.5) * dt; d.x -= d.beatDir * 2.5 * Math.exp(-d.t * 4) * dt; }
      } else { d.marker.visible = false; d.hint.visible = false; }
      gap = d.s - this.dist;
      d.fb.root.position.set(d.x, 0, -gap);
      d.fb.setPose(this.defPose(d, gap), dt, d.state === 'beaten' ? 14 : 20);
      if (gap < -12) { this.release(d); this.defs.splice(i, 1); }
    }
  }

  private updateMenu(dt: number) {
    const p = this.player, t = this.time;
    p.baseYaw = t * 0.55;
    const w = Math.sin(t * 2);
    p.setPose(pose({ pitch: 0.03, twist: 0.06 * w, thR: 1.05, knR: 1.3, abR: 0.1, thL: -0.02, knL: 0.04, shL: 0.1 * w, shR: -0.1 * w, saL: 0.22, saR: 0.22, elL: 0.35, elR: 0.35, head: -0.05 }), dt, 8);
    // top sağ ayağın altında, karakterle birlikte döner
    const a = p.baseYaw, lx = -0.105, lz = 0.36;
    this.ball.position.set(lx * Math.cos(a) + lz * Math.sin(a), BALL_R, -lx * Math.sin(a) + lz * Math.cos(a));
    this.ball.rotation.set(0, a, 0);
    this.world.update(0); this.fx.update(dt, 0);
    this.camera.position.set(0, 1.45, 8.6); this.camera.lookAt(0, 0.1, 0);
  }
}
