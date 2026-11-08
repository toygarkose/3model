import * as THREE from 'three';
import { DT, GOAL, PLAY, BALL_R } from './config.js';
import { Match, FAIL_TEXT } from './match.js';
import { Trajectory } from './trajectory.js';
import { computeStars } from './scoring.js';
import { interpretGesture, toScreen, gestureForAction } from './interpreter.js';
import { buildPlayer, setHair, setAccessory, setBoots, setKit, setSkin, SKIN_TONES, HAIR_COLORS } from '../scene/playerModel.js';
import { PlayerAnimator } from '../scene/animator.js';
import { BallView } from '../scene/ballView.js';
import { PreviewPath, RunArrows, Particles, makeRing } from '../scene/effects.js';
import { TEAMS, KEEPER_KITS } from '../levels/teams.js';
import { LEVELS } from '../levels/index.js';
import { findItem } from '../career/cosmetics.js';

export const FAIL_TIPS = {
  intercepted: 'Defenders cut out passes that go near them. Bend the line around them, or play it long.',
  saved: 'Aim for the corners and swipe faster.',
  caught: 'Too soft. Swipe faster for a powerful shot.',
  blocked: 'Shoot around the defender, or curve it.',
  loose: 'Draw your pass to where a teammate is running (follow the arrows).',
  woodwork: 'So close! Aim a little inside the post.',
  miss: 'Keep it between the posts.',
  out: 'Keep the ball on the pitch.',
  moves: 'Find a quicker route to goal.',
  claimed: 'The keeper owns the six-yard box. Cross toward the penalty spot.',
};

function hashStr(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

export class LevelManager {
  constructor({ engine, stadium, camera, gesture, audio, career, ui }) {
    Object.assign(this, { engine, stadium, camCtl: camera, gesture, audio, career, ui });
    this.scene = engine.scene;
    this.views = [];
    this.ball = new BallView(this.scene);
    this.preview = new PreviewPath(this.scene);
    this.arrows = new RunArrows(this.scene);
    this.particles = new Particles(this.scene);
    this.holderRing = makeRing(0xffb020, 1.6);
    this.scene.add(this.holderRing);
    this.state = 'menu';
    this.match = null;
    this.acc = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.paused = false;
    this.labels = document.getElementById('labels');
    this.gesture.on({
      start: (p) => this._gestureStart(p),
      move: (pts) => this._gestureMove(pts),
      end: (pts, cancelled) => this._gestureEnd(pts, cancelled),
    });
    this._buildAttract();
  }

  // ---------------------------------------------------------------- scenes
  showMenuScene() {
    this._clearLevel();
    this.state = 'menu';
    this.attract.group.visible = true;
    this.camCtl.setMode('menu');
  }

  showProfileScene() {
    this._clearLevel();
    this.state = 'profile';
    this.attract.group.visible = false;
    if (!this.profileModel) {
      this.profileView = this._makeView({ id: 'profile', side: 'home', hero: true, number: this.career.number, pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, action: null, actionTime: 0, extra: {}, role: 'player' }, TEAMS.harbor);
      this.profileModel = this.profileView.model;
    }
    this.refreshHeroLook(this.profileView.model);
    this.profileView.model.root.visible = true;
    this.profileView.model.root.position.set(0, 0, 0);
    this.ball.mesh.visible = false;
    this.ball.shadow.visible = false;
    this.profileAngle = 0.5;
    this.camCtl.setMode('profile', { at: new THREE.Vector3(0, 0, 0), angle: 0.5, shift: this.engine.aspect > 1 ? 0.9 : 0 });
  }

  rotateProfile(d) { this.profileAngle += d; this.camCtl.data.angle = this.profileAngle; }

  // ---------------------------------------------------------------- level life-cycle
  loadLevel(index) {
    this._clearLevel();
    this.attract.group.visible = false;
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.match = new Match(this.level);
    const home = this._homeKit();
    const away = TEAMS[this.level.away] || TEAMS.trial;
    for (const a of this.match.team) this.views.push(this._makeView(a, home));
    for (const o of this.match.opponents) this.views.push(this._makeView(o, o.role === 'keeper' ? KEEPER_KITS.away : away));
    this.ball.mesh.visible = true; this.ball.shadow.visible = true;
    this.ball.prev.copy(this.match.ball.pos);
    this.ball.setTrail(false);
    this.acc = 0; this.timeScale = 1; this.slowmo = 0; this.paused = false;
    this.outcomeTimer = null;
    this.state = 'intro';
    this.gesture.enabled = false;
    // start the camera high and wide, then glide into the play
    const view = this._decisionView();
    this.camCtl.setMode('intro', { view });
    this.camCtl.wantPos.copy(view.pos).add(new THREE.Vector3(0, 26, 22));
    this.camCtl.wantLook.copy(view.look);
    this.camCtl.jump();
    this.camCtl.wantPos.copy(view.pos);
    this.audio.setTension(0.2);
    this._syncViews(0);
  }

  begin() {
    if (this.state !== 'intro') return;
    this.audio.play('whistle', { volume: 0.55 });
    this._enterDecision(true);
  }

  restart() { this.loadLevel(this.levelIndex); this.begin(); }

  _clearLevel() {
    for (const v of this.views) this.scene.remove(v.model.root);
    this.views = [];
    if (this.profileView) this.profileView.model.root.visible = false;
    this.preview.hide();
    this.arrows.clear();
    this.holderRing.visible = false;
    this.labels.innerHTML = '';
    this.match = null;
    this.gesture.enabled = false;
    this.gesture.cancel();
    this.ball.setTrail(false);
  }

  _homeKit() {
    const base = TEAMS[this.level.home] || TEAMS.harbor;
    if (this.level.home !== 'harbor') return base;
    const k = findItem('kit', this.career.data.equipped.kit).kit;
    return { ...base, ...k };
  }

  _makeView(agent, kit) {
    let look;
    const h = hashStr(agent.id + (this.level?.id || ''));
    if (agent.hero) {
      look = { kit, number: this.career.number, backName: this.career.name, keeper: false };
    } else {
      look = {
        kit, number: agent.number, keeper: agent.role === 'keeper',
        skin: SKIN_TONES[h % SKIN_TONES.length], hairColor: HAIR_COLORS[(h >> 3) % 3],
        hair: ['short', 'buzz', 'curls', 'short', 'bald', 'bun'][(h >> 5) % 6], boots: [0x15161a, 0xf4f7ff, 0xe0423e, 0x1d4fd8][(h >> 7) % 4],
      };
    }
    const model = buildPlayer(look);
    if (agent.hero) this.refreshHeroLook(model);
    model.root.position.copy(agent.pos);
    this.scene.add(model.root);
    const ring = agent.side === 'home' ? makeRing(agent.hero ? 0xffd27a : 0x4fe3d6, 1.1) : null;
    if (ring) { ring.material.opacity = 0.35; model.root.add(ring); ring.position.y = 0.02; }
    return { agent, model, anim: new PlayerAnimator(model), ring };
  }

  refreshHeroLook(model) {
    const d = this.career.data;
    setHair(model, d.equipped.hair, HAIR_COLORS[d.hairColor] ?? HAIR_COLORS[0]);
    setAccessory(model, d.equipped.accessory);
    setBoots(model, findItem('boots', d.equipped.boots).color);
    setSkin(model, SKIN_TONES[d.skin] ?? SKIN_TONES[1]);
    if (model === this.profileModel) setKit(model, findItem('kit', d.equipped.kit).kit);
  }

  // ---------------------------------------------------------------- decisions & gestures
  _decisionPoints() {
    const m = this.match, h = m.holder.pos;
    const pts = [h.clone().setY(1.8), m.ball.pos.clone()];
    for (const a of m.team) {
      if (a === m.holder) continue;
      pts.push(a.pos.clone().setY(1.8));
      const r = a.runs[m.actionIndex];
      if (r) pts.push(new THREE.Vector3(r[0], 0, r[1]));
    }
    for (const o of m.opponents) if (o.pos.distanceTo(h) < 28 || o.role === 'keeper') pts.push(o.pos.clone().setY(1.8));
    if (m.canShoot() || (this.level.objective.type === 'goal' && m.holder.pos.z < GOAL.z + 45)) {
      pts.push(new THREE.Vector3(-GOAL.halfWidth, GOAL.height, GOAL.z), new THREE.Vector3(GOAL.halfWidth, GOAL.height, GOAL.z));
    }
    return pts;
  }

  _decisionView() {
    const h = this.match.holder.pos;
    return this.camCtl.frameDecision(h, this._decisionPoints(), this.engine.aspect, this.engine.baseFov(), h.clone().setY(0));
  }

  _enterDecision(first = false) {
    const m = this.match;
    this.state = 'decision';
    this.camCtl.setMode('decision', { view: this._decisionView(), fast: !first });
    const runs = [];
    for (const a of m.team) {
      if (a === m.holder) continue;
      const r = a.runs[m.actionIndex];
      if (r) runs.push([a.pos.clone(), new THREE.Vector3(r[0], 0, r[1])]);
    }
    this.arrows.set(runs);
    this.holderRing.visible = true;
    this.gesture.enabled = true;
    this.ui.hud.setMoves(m.movesLeft, m.maxActions);
    this.ui.hud.setPhase(m.aerial ? 'header' : (m.canShoot() ? 'shoot' : 'pass'), this.career.data.settings.guide);
    this.audio.setTension(0.25 + 0.6 * (1 - Math.min(1, m.holder.pos.distanceTo(new THREE.Vector3(0, 0, GOAL.z)) / 50)));
    this.decisionStart = performance.now();
  }

  _ballScreen() {
    return toScreen(this.engine.camera, this.match.ball.pos, this.engine.width, this.engine.height);
  }

  _gestureStart(p) {
    if (this.state !== 'decision' || this.paused) return false;
    this.audio.unlock();
    const b = this._ballScreen();
    const hs = toScreen(this.engine.camera, this.match.holder.pos.clone().setY(1.0), this.engine.width, this.engine.height);
    const r = Math.max(64, Math.min(this.engine.width, this.engine.height) * 0.1);
    const near = Math.hypot(p.x - b.x, p.y - b.y) < r || Math.hypot(p.x - hs.x, p.y - hs.y) < r;
    if (!near) { this.ui.hud.flashBallHint(b); return false; }
    this.state = 'aiming';
    this.ui.hud.hideGuide();
    return true;
  }

  _gestureMove(pts) {
    if (this.state !== 'aiming') return;
    this.pending = interpretGesture(pts, this.engine.camera, this.match, this.engine.width, this.engine.height);
    this.preview.show(this.pending);
    this.ui.hud.setAimInfo(this.pending);
  }

  _gestureEnd(pts, cancelled) {
    if (this.state !== 'aiming') return;
    const action = cancelled ? null : interpretGesture(pts, this.engine.camera, this.match, this.engine.width, this.engine.height);
    this.preview.hide();
    this.ui.hud.setAimInfo(null);
    if (!action) {
      this.state = 'decision';
      if (!cancelled) this.ui.hud.toast(this.match.canShoot() ? 'Draw to a teammate or at the goal' : 'Draw a line to a teammate', 'info');
      return;
    }
    this.execute(action);
  }

  // Run an already-built action (used by gestures and automated tests).
  execute(action) {
    const m = this.match;
    this.state = 'windup';
    this.gesture.enabled = false;
    this.arrows.clear();
    this.holderRing.visible = false;
    this.windup = 0.17;
    this.pendingAction = action;
    m.holder.action = m.aerial ? 'header' : 'kick';
    m.holder.actionTime = -0.17;
    // face the direction of the ball before striking
    const e = action.traj.end;
    m.holder.facing = Math.atan2(e.x - m.holder.pos.x, e.z - m.holder.pos.z);
    this.ui.hud.setPhase(null);
  }

  _launch() {
    const m = this.match, a = this.pendingAction;
    const from = m.ball.pos.clone();
    m.startAction(a);
    this.state = 'action';
    this.ball.setTrail(a.kind === 'shot' || a.lofted);
    if (a.kind === 'shot') this.camCtl.setMode('shot', { from });
    else {
      const off = new THREE.Vector3().subVectors(this.camCtl.pos, this.camCtl.look);
      off.multiplyScalar(0.85);
      off.y = Math.max(off.y, 6);
      this.camCtl.setMode('follow', { offset: off, towards: a.traj.end.clone() });
    }
    this.ui.hud.setMoves(m.movesLeft, m.maxActions);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const real = dt;
    if (this.paused) { this.gesture.draw(real); return; }
    if (this.slowmo > 0) { this.slowmo -= real; this.timeScale = this.slowmo > 0 ? 0.3 : 1; }
    const sdt = real * this.timeScale;

    if (this.state === 'menu') this._updateAttract(sdt);
    if (this.state === 'profile' && this.profileView) {
      const v = this.profileView;
      v.agent.actionTime += real;
      v.anim.update(real, v.agent);
      this.profileAngle += real * 0.25;
      this.camCtl.data.angle = this.profileAngle;
    }

    const m = this.match;
    if (m) {
      if (this.state === 'windup') {
        m.holder.actionTime += sdt;
        this.windup -= sdt;
        if (this.windup <= 0) this._launch();
      }
      if (this.state === 'action' || this.state === 'outcome') {
        this.acc += sdt;
        let n = 0;
        while (this.acc >= DT && n < 60) { m.step(DT); this.acc -= DT; n++; }
        this._handleEvents(m.drainEvents());
      }
      this._syncViews(sdt);
      if (this.outcomeTimer != null) {
        this.outcomeTimer -= real;
        if (this.outcomeTimer <= 0) { this.outcomeTimer = null; this._finish(); }
      }
      this.stadium.focusShadows(m.ball.pos);
    }
    const ctx = { ball: m?.ball.pos, scorer: this.scorer?.pos };
    this.camCtl.update(real, ctx);
    const cam = this.engine.camera;
    const fov = this.engine.baseFov() * this.camCtl.fovMul;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.preview.update(real);
    this.arrows.update(real);
    this.particles.update(sdt);
    this.gesture.draw(real);
    if (m) this._updateLabels();
  }

  _syncViews(dt) {
    const m = this.match;
    for (const v of this.views) {
      const a = v.agent;
      v.model.root.position.set(a.pos.x, 0, a.pos.z);
      v.model.root.rotation.y = a.facing;
      const dejected = m?.result && (m.result.success ? a.side === 'away' && a.role !== 'keeper' : false);
      v.anim.update(dt, a, { dejected });
      if (v.ring) v.ring.visible = this.state === 'decision' || this.state === 'aiming';
    }
    if (m) {
      this.ball.update(dt, m.ball, this.engine.camera);
      if (this.holderRing.visible) {
        const h = m.holder.pos;
        this.holderRing.position.set(h.x, 0.03, h.z);
        const s = 1.5 + Math.sin(performance.now() / 180) * 0.12;
        this.holderRing.scale.set(s, s, 1);
      }
      // receiver highlight while aiming
      for (const v of this.views) {
        if (!v.ring) continue;
        const target = this.state === 'aiming' && this.pending?.receiver === v.agent;
        v.ring.material.opacity = target ? 0.95 : 0.35;
        v.ring.material.color.set(target ? (this.pending.perfect ? 0x3ee0a0 : 0xffffff) : (v.agent.hero ? 0xffd27a : 0x4fe3d6));
      }
    }
  }

  _updateLabels() {
    const show = this.state === 'decision' || this.state === 'aiming' || this.state === 'intro';
    if (!show) { if (this.labels.childElementCount) this.labels.innerHTML = ''; return; }
    const m = this.match, cam = this.engine.camera, w = this.engine.width, h = this.engine.height;
    const want = m.team.filter(a => a !== m.holder || a.hero);
    if (this.labels.childElementCount !== want.length) {
      this.labels.innerHTML = want.map(a => `<div class="plabel ${a.hero ? 'hero' : ''}">${a.hero ? 'YOU' : (a.name.split(' ')[0] || '').toUpperCase()}${a.hero ? '' : ` <b>${a.number}</b>`}</div>`).join('');
    }
    want.forEach((a, i) => {
      const s = toScreen(cam, a.pos.clone().setY(2.25), w, h);
      const el = this.labels.children[i];
      if (!el) return;
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      el.style.opacity = s.behind ? '0' : '1';
    });
  }

  _handleEvents(events) {
    const m = this.match;
    for (const e of events) {
      switch (e.type) {
        case 'kick': {
          const shot = e.kind === 'shot';
          this.audio.play(shot ? 'kick' : 'pass', { volume: shot ? 0.7 + e.power * 0.5 : 0.75, rate: shot ? 0.9 + e.power * 0.25 : 1 });
          this.particles.dust(m.ball.pos, shot ? 14 : 6);
          if (shot) { this.camCtl.shake(0.25 + e.power * 0.3); this.audio.setTension(1); this.stadium.cheer(0.25); }
          break;
        }
        case 'receive':
          this.audio.play('trap', { volume: 0.8 });
          if (e.perfect) this.ui.hud.floatText('PERFECT PASS', toScreen(this.engine.camera, e.who.pos.clone().setY(2.4), this.engine.width, this.engine.height), 'good');
          this.ball.setTrail(false);
          break;
        case 'decision':
          this._enterDecision();
          break;
        case 'intercept':
          this.audio.play('ooh', { volume: 0.5 });
          this.audio.play('trap', { volume: 0.7 });
          this.ball.setTrail(false);
          break;
        case 'save':
          this.audio.play('save', { volume: 1 });
          this.audio.play('ooh', { volume: 0.9 });
          this.camCtl.shake(0.35);
          this.stadium.cheer(0.4);
          this.ui.hud.floatText(e.caught ? 'CAUGHT' : 'SAVED', toScreen(this.engine.camera, e.at, this.engine.width, this.engine.height), 'bad');
          break;
        case 'post':
          this.audio.play('post', { volume: 1 });
          this.audio.play('ooh', { volume: 1 });
          this.camCtl.shake(0.4);
          this.stadium.cheer(0.5);
          break;
        case 'miss':
          this.audio.play('ooh', { volume: 0.8 });
          break;
        case 'net':
          this.stadium.rippleNet(e.at, e.strength);
          if (e.part === 'back' || e.strength > 0.3) this.audio.play('net', { volume: 0.4 + e.strength });
          break;
        case 'bounce':
          if (e.strength > 0.15) this.audio.play('trap', { volume: e.strength * 0.4, rate: 1.3 });
          break;
        case 'goal':
          this.scorer = e.scorer;
          this.slowmo = 0.9;
          this.audio.play('roar', { volume: 1.1 });
          this.audio.play('sting', { volume: 0.7, delay: 0.3 });
          this.audio.play('whistle', { volume: 0.4, delay: 2.0 });
          this.stadium.cheer(1);
          this.camCtl.shake(0.5);
          this.particles.confetti(new THREE.Vector3(0, 1.5, GOAL.z - 3));
          this.ui.hud.banner('GOAL!', 'good');
          setTimeout(() => { if (this.match === m && this.state === 'outcome') this.camCtl.setMode('celebrate', { startAngle: Math.atan2(this.camCtl.pos.x - e.scorer.pos.x, this.camCtl.pos.z - e.scorer.pos.z) }); }, 650);
          break;
        case 'result':
          this.state = 'outcome';
          this.gesture.enabled = false;
          this.holderRing.visible = false;
          this.arrows.clear();
          if (!e.success) {
            this.ui.hud.banner(m.result.text.toUpperCase(), 'bad');
            this.audio.setTension(0.15);
          } else if (e.reason === 'pass') {
            this.audio.play('sting', { volume: 0.7 });
            this.ui.hud.banner('GREAT PASS!', 'good');
            this.stadium.cheer(0.6);
          }
          this.outcomeTimer = e.success ? (e.reason === 'goal' ? 3.2 : 1.6) : 1.9;
          break;
      }
    }
  }

  _finish() {
    const m = this.match;
    this.state = 'finished';
    const success = m.result.success;
    if (success) {
      const { stars, reasons } = computeStars(this.level, m);
      const rewards = this.career.complete(this.levelIndex, stars, m);
      this.ui.showResult({ success: true, level: this.level, index: this.levelIndex, stars, reasons, rewards, stats: m.stats });
    } else {
      this.ui.showResult({ success: false, level: this.level, index: this.levelIndex, reason: m.result.reason, text: m.result.text, tip: FAIL_TIPS[m.result.reason] });
    }
  }

  setPaused(p) { this.paused = p; if (p) this.gesture.cancel(); }

  // ---------------------------------------------------------------- attract mode (menu background)
  _buildAttract() {
    const grp = new THREE.Group();
    this.scene.add(grp);
    const mk = (id, x, z, kit, num) => {
      const agent = { id, side: 'home', role: 'player', pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), facing: 0, action: null, actionTime: 0, extra: {}, number: num };
      const model = buildPlayer({ kit, number: num, skin: SKIN_TONES[(num * 3) % 5], hair: num % 2 ? 'short' : 'curls', hairColor: HAIR_COLORS[num % 3] });
      grp.add(model.root);
      return { agent, model, anim: new PlayerAnimator(model) };
    };
    this.attract = {
      group: grp,
      players: [mk('a1', -7, -8, TEAMS.harbor, 10), mk('a2', 7, -14, TEAMS.harbor, 9)],
      ball: { pos: new THREE.Vector3(-6.6, BALL_R, -8.3), vel: new THREE.Vector3(), mode: 'held' },
      t: 0.6, from: 0, traj: null,
    };
  }

  _updateAttract(dt) {
    const A = this.attract;
    const [p0, p1] = A.players;
    const giver = A.from === 0 ? p0 : p1, taker = A.from === 0 ? p1 : p0;
    if (!A.traj) {
      A.t -= dt;
      giver.agent.facing = Math.atan2(taker.agent.pos.x - giver.agent.pos.x, taker.agent.pos.z - giver.agent.pos.z);
      taker.agent.facing = Math.atan2(giver.agent.pos.x - taker.agent.pos.x, giver.agent.pos.z - taker.agent.pos.z);
      const f = giver.agent.facing;
      A.ball.pos.set(giver.agent.pos.x + Math.sin(f) * 0.42, BALL_R, giver.agent.pos.z + Math.cos(f) * 0.42);
      if (A.t < 0.17 && giver.agent.action !== 'kick') { giver.agent.action = 'kick'; giver.agent.actionTime = -0.17; }
      if (A.t <= 0) {
        const end = taker.agent.pos.clone().add(new THREE.Vector3(Math.sin(taker.agent.facing) * 0.4, BALL_R, Math.cos(taker.agent.facing) * 0.4));
        A.traj = new Trajectory({ start: A.ball.pos.clone(), end, bend: (Math.random() - 0.5) * 3, duration: 1.1, decel: 0.4, arc: Math.random() < 0.4 ? 1.4 : 0 });
        A.tt = 0;
      }
    } else {
      A.tt += dt;
      A.traj.positionAt(A.tt, A.ball.pos);
      A.traj.velocityAt(A.tt, A.ball.vel);
      if (A.tt >= A.traj.duration) {
        A.traj = null; A.from = 1 - A.from; A.t = 1.2 + Math.random();
        taker.agent.action = 'receive'; taker.agent.actionTime = 0;
        // drift to a new spot for variety
        taker.agent.pos.x = THREE.MathUtils.clamp(taker.agent.pos.x + (Math.random() - 0.5) * 2, -10, 10);
      }
    }
    for (const p of A.players) {
      p.agent.actionTime += dt;
      p.model.root.position.copy(p.agent.pos);
      p.model.root.rotation.y = p.agent.facing;
      p.anim.update(dt, p.agent);
    }
    this.ball.mesh.visible = true; this.ball.shadow.visible = true;
    this.ball.update(dt, A.ball, this.engine.camera);
  }

  refreshProfile() { if (this.profileModel) this.refreshHeroLook(this.profileModel); }

  // Where the tutorial hand should draw: from the ball to the first runner.
  guideTarget() {
    const m = this.match;
    if (!m) return null;
    const cam = this.engine.camera, w = this.engine.width, h = this.engine.height;
    const from = this._ballScreen();
    let to;
    if (m.aerial || (m.canShoot() && this.level.objective.type === 'goal' && !m.team.some(a => a !== m.holder && a.runs[m.actionIndex]))) {
      to = toScreen(cam, new THREE.Vector3(2, 1.4, GOAL.z), w, h);
    } else {
      const mate = m.team.find(a => a !== m.holder && a.runs[m.actionIndex]) || m.team.find(a => a !== m.holder);
      if (!mate) return null;
      to = toScreen(cam, m.predictRun(mate, 1.2), w, h);
    }
    return { from, to };
  }

  // ---------------------------------------------------------------- test hooks
  testApi() {
    return {
      state: () => this.state,
      level: () => this.levelIndex,
      result: () => this.match?.result,
      holderScreen: () => this.match && this._ballScreen(),
      buildPass: (x, z, curve) => this.match.previewPass({ x, z }, curve),
      buildShot: (x, y, curve, power) => this.match.previewShot({ x, y }, curve, power),
      play: (a) => { if (this.state === 'decision') this.execute(a.kind === 'pass' ? this.match.previewPass({ x: a.x, z: a.z }, a.curve) : this.match.previewShot({ x: a.x, y: a.y }, a.curve, a.power)); },
      gestureFor: (a) => {
        const act = a.kind === 'pass' ? this.match.previewPass({ x: a.x, z: a.z }, a.curve) : this.match.previewShot({ x: a.x, y: a.y }, a.curve, a.power);
        return gestureForAction(act, this.engine.camera, this.engine.width, this.engine.height);
      },
      interpret: (pts) => {
        const r = interpretGesture(pts, this.engine.camera, this.match, this.engine.width, this.engine.height);
        return r && { kind: r.kind, receiver: r.receiver?.id, perfect: r.perfect, curve: r.curve, power: r.power, target: r.target, end: r.traj.end.toArray() };
      },
    };
  }
}
