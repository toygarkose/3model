import * as THREE from 'three';
import { Footballer, Look, Pose, pose, runPose, jockeyPose, slidePose, sitFallPose, diveFallPose, sideFallPose } from './character';
import { World } from './world';
import { Particles, hintMaterial } from './fx';
import { Sfx } from './audio';
import { makeBallTexture } from './cosmetics';

export type Dir = 'l' | 'r' | 'u' | 'd';
type DType = 'track' | 'lean' | 'slide' | 'lunge' | 'static';
export interface Stats { score: number; dist: number; dribbles: number; perfects: number; bestMult: number }
export interface Hooks {
  popup(text: string, kind: 'perfect' | 'good' | 'warn'): void;
  hud(score: number, mult: number): void;
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
  mode: 'menu' | 'run' | 'dead' = 'menu';
  hints = true;
  private world: World; private player: Footballer; private ball: THREE.Mesh; private ballMat: THREE.MeshStandardMaterial;
  private fx = new Particles(); private defs: Def[] = []; private pool: Footballer[] = [];
  private rival!: Look;
  private dist = 0; private speed = 10; private phase = 0; private lane = 1; private px = 0;
  private move: Move | null = null; private buffer: Dir | null = null;
  private nextS = 0; private encounters = 0; private slow = 0; private shake = 0; private fovKick = 0;
  private bonus = 0; private mult = 1; private stats: Stats = { score: 0, dist: 0, dribbles: 0, perfects: 0, bestMult: 1 };
  private deadT = 0; private overSent = false; private ballVel = new THREE.Vector3(); private camX = 0; private time = 0;
  private lastCycle = 0; private window = 0.56;
  private ringGeo = new THREE.RingGeometry(0.62, 0.8, 40);

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private sfx: Sfx, private hooks: Hooks, look: Look) {
    this.world = new World(scene);
    this.player = new Footballer(look); scene.add(this.player.root);
    this.ballMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.ballMat); this.ball.castShadow = true; scene.add(this.ball);
    scene.add(this.fx.points);
    this.toMenu();
  }

  setPlayerLook(l: Look) { this.player.setLook(l); }
  setRivalLook(l: Look) { this.rival = l; for (const f of this.pool) f.setLook(l); for (const d of this.defs) d.fb.setLook(l); }
  setBall(b: { base: string; patch: string; style: string }) { const o = this.ballMat.map; this.ballMat.map = makeBallTexture(b); this.ballMat.needsUpdate = true; o?.dispose(); }

  toMenu() {
    this.mode = 'menu'; this.clearDefs();
    this.player.away = false; this.player.root.position.set(0, 0, 0);
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
  }

  start() {
    this.clearDefs();
    this.mode = 'run'; this.dist = 0; this.speed = 10; this.phase = 0; this.lane = 1; this.px = 0; this.move = null; this.buffer = null;
    this.nextS = 46; this.encounters = 0; this.slow = 0; this.shake = 0; this.bonus = 0; this.mult = 1; this.deadT = 0; this.overSent = false; this.camX = 0;
    this.stats = { score: 0, dist: 0, dribbles: 0, perfects: 0, bestMult: 1 };
    this.player.away = true; this.player.baseYaw = Math.PI; this.player.root.position.set(0, 0, 0);
    this.player.setPose(runPose(0), 0);
    this.ball.position.set(0.3, BALL_R, -1.2);
    this.sfx.whistle(); this.sfx.crowd(0.2);
    this.hooks.hud(0, 1);
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

  private early() { this.hooks.popup('ERKEN!', 'warn'); this.sfx.early(); if (this.mult > 1) { this.mult--; this.hooks.hud(this.score(), this.mult); } }
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
    this.hooks.hud(this.score(), this.mult);
  }

  private tackled(d: Def) {
    this.mode = 'dead'; this.deadT = 0; d.state = 'won'; d.t = 0; d.hint.visible = false;
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
    const dt = dtReal * (this.slow > 0 ? 0.3 : 1);
    const alive = this.mode === 'run';

    // hız
    let mul = 1;
    const m = this.move;
    if (m && m.type === 'drag') { const u = m.t / m.dur; mul = u < 0.5 ? 0.3 : 0.3 + 0.7 * ((u - 0.5) / 0.5); }
    if (alive) this.speed += (Math.min(17, 10 + this.stats.dribbles * 0.22) - this.speed) * Math.min(1, dt * 2);
    else { this.deadT += dtReal; this.speed *= Math.exp(-4 * dt); }
    const v = this.speed * mul, scroll = v * dt;
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
      while (this.dist + 78 >= this.nextS) this.spawn();
      this.hooks.hud(this.score(), this.mult);
    } else if (this.deadT > 1.25 && !this.overSent) { this.overSent = true; this.sfx.whistle(true); this.hooks.over(this.stats); }

    this.updateDefs(dt, v);
    this.updateBall(dt, scroll, v);
    this.world.update(this.dist);
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
    const p = runPose(this.phase, 1, 0.2), m = this.move;
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
