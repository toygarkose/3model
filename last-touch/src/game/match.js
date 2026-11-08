import * as THREE from 'three';
import { PLAY, GOAL, BALL_R } from './config.js';
import { Agent, moveAgent } from './playerController.js';
import { buildPass, inBox } from './passing.js';
import { buildShot, canShoot } from './shooting.js';
import { stepFreeBall, classifyGoalLine, isOutOfPlay } from './ballPhysics.js';
import { planIntercept, assignOpponentRuns, updateMarkers } from '../ai/opponentAI.js';
import { GoalkeeperAI } from '../ai/goalkeeperAI.js';

const GOAL_CENTER = new THREE.Vector3(0, 0, GOAL.z);

export const FAIL_TEXT = {
  intercepted: 'Intercepted!',
  saved: 'Saved!',
  caught: 'Keeper holds it',
  blocked: 'Blocked!',
  woodwork: 'Off the woodwork!',
  miss: 'Off target',
  loose: 'Nobody there',
  out: 'Out of play',
  moves: 'Out of moves',
  claimed: 'Keeper claims it',
};

/**
 * Pure football simulation for one level. No rendering in here, so the same
 * code runs in the browser and in the automated level checker (Node).
 */
export class Match {
  constructor(level) {
    this.level = level;
    this.time = 0;
    this.events = [];
    this.team = level.team.map(d => new Agent(d, 'home'));
    this.opponents = level.opponents.map(d => new Agent(d, 'away'));
    const kd = level.keeper || {};
    this.keeper = new Agent({ id: 'gk', name: kd.name || 'Keeper', number: 1, pos: [0, GOAL.z + 1], role: 'keeper' }, 'away');
    this.opponents.push(this.keeper);
    this.gk = new GoalkeeperAI(this.keeper, kd.skill ?? 1);

    const hi = Math.max(0, level.team.findIndex(d => d.ball));
    this.holder = this.team[hi];
    this.ball = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), mode: 'held', owner: this.holder };
    this.state = 'decision';     // 'decision' | 'action' | 'over'
    this.actionIndex = 0;
    this.action = null;
    this.intercept = null;
    this.aerial = false;
    this.loose = null;
    this.pendingDecision = 0;
    this.result = null;
    this.stats = { actions: 0, passes: 0, perfect: 0, imperfect: 0, goal: null, shots: 0 };

    this._faceForDecision();
    this.keeper.pos.copy(this.gk.setPosition(this.ball.pos));
    this.keeper.look = this.ball.pos.clone();
    this._placeHeldBall();
  }

  get maxActions() { return this.level.maxActions ?? 4; }
  get movesLeft() { return this.maxActions - this.stats.actions; }
  canShoot() { return canShoot(this); }

  // Where a teammate will be after `t` seconds of their next planned run.
  predictRun(m, t) {
    const r = m.runs[this.actionIndex];
    if (!r) return m.pos.clone();
    return m.predict({ x: r[0], z: r[1] }, t, PLAY.runSpeed * 0.9);
  }

  previewPass(endXZ, curve) { return buildPass(this, endXZ, curve); }
  previewShot(target, curve, power) { return buildShot(this, target, curve, power); }

  // ---------------------------------------------------------------------------
  startAction(action) {
    if (this.state !== 'decision') return;
    this.state = 'action';
    this.action = action;
    this.trajT = 0;
    this.lineChecked = false;
    this.stats.actions++;
    if (action.kind === 'shot') this.stats.shots++;
    const holder = this.holder;
    holder.action = this.aerial ? 'header' : 'kick';
    holder.actionTime = 0;
    this.ball.mode = 'traj';
    this.ball.owner = null;
    this.aerial = false;
    const end = action.traj.end;

    for (const m of this.team) {
      m.look = null;
      if (m === holder) {
        if (action.kind === 'pass') {
          const fwd = new THREE.Vector3().subVectors(GOAL_CENTER, m.pos).setY(0).normalize();
          m.setRun(m.pos.clone().addScaledVector(fwd, 3.5), null, 4.5);
        } else m.setRun(null);
      } else if (action.kind === 'pass' && m === action.receiver) {
        m.setRun(end, this.time + action.traj.duration);
      } else {
        const r = m.runs[this.actionIndex];
        if (r) m.setRun({ x: r[0], z: r[1] }, null, PLAY.runSpeed * 0.9);
        else if (action.kind === 'shot') m.setRun(null);
      }
    }
    this.actionIndex++;

    this.intercept = planIntercept(this, action);
    assignOpponentRuns(this, action, this.intercept);
    if (action.kind === 'shot') {
      this.gk.onShot();
      for (const o of this.opponents) if (o.role === 'wall') { o.action = 'jump'; o.actionTime = 0; }
    } else this.gk.onPass(end);

    this.events.push({ type: 'kick', kind: action.kind, power: action.power ?? 0.5, lofted: !!action.lofted, header: !!action.header });
  }

  // ---------------------------------------------------------------------------
  step(dt) {
    if (this.state === 'decision') return;
    this.time += dt;
    updateMarkers(this);
    for (const a of this.team) moveAgent(a, dt, this.time);
    for (const o of this.opponents) {
      if (o.role === 'keeper' && (this.gk.mode === 'dive')) { if (o.action) o.actionTime += dt; continue; }
      moveAgent(o, dt, this.time);
    }
    const ball = this.ball;

    if (ball.mode === 'traj') this._stepTraj(dt);
    else if (ball.mode === 'free') {
      stepFreeBall(ball, dt, this.events);
      if (this.loose) this._stepLoose(dt);
      else if (!this.result && isOutOfPlay(ball.pos)) this._fail('out');
    } else if (ball.mode === 'held') this._placeHeldBall();

    if (this.pendingDecision > 0) {
      this.pendingDecision -= dt;
      if (this.pendingDecision <= 0) this._enterDecision();
    }
    if (this.state === 'over') this.overTime = (this.overTime || 0) + dt;
  }

  _stepTraj(dt) {
    const ball = this.ball, act = this.action, tr = act.traj;
    const prev = ball.pos.clone();
    this.trajT += dt;
    const t = Math.min(this.trajT, tr.duration);
    tr.positionAt(t, ball.pos);
    tr.velocityAt(t, ball.vel);

    if (this.intercept && this.trajT >= this.intercept.t) { this._intercepted(this.intercept.opp); return; }

    if (act.kind === 'shot') {
      const r = this.gk.update(dt, ball, !this.lineChecked);
      if (r === 'save') { this._saved(); return; }
      if (!this.lineChecked && prev.z > GOAL.z && ball.pos.z <= GOAL.z) {
        this.lineChecked = true;
        const f = (prev.z - GOAL.z) / (prev.z - ball.pos.z || 1);
        const x = prev.x + (ball.pos.x - prev.x) * f, y = prev.y + (ball.pos.y - prev.y) * f;
        const cls = classifyGoalLine(x, y);
        if (cls === 'goal') this._goal(x, y);
        else if (cls === 'post' || cls === 'bar') { this._woodwork(cls); return; }
        else this._miss();
      }
    }
    if (this.trajT >= tr.duration) {
      if (act.kind === 'pass' && !this.result) this._passArrived();
      else ball.mode = 'free';
    }
  }

  _passArrived() {
    const ball = this.ball, rec = this.action.receiver;
    if (rec && Math.hypot(rec.pos.x - ball.pos.x, rec.pos.z - ball.pos.z) < 1.5) {
      this._receive(rec, this.action.perfect, this.action.aerial);
      return;
    }
    ball.mode = 'free';
    this.loose = { t: 0.8, rec };
  }

  _stepLoose(dt) {
    const ball = this.ball, L = this.loose;
    L.t -= dt;
    if (L.rec) {
      L.rec.setRun(ball.pos, null);
      if (Math.hypot(L.rec.pos.x - ball.pos.x, L.rec.pos.z - ball.pos.z) < 1.0 && ball.pos.y < 1.2) {
        this.loose = null; this._receive(L.rec, false, false); return;
      }
    }
    for (const o of this.opponents) {
      if (o.role === 'wall') continue;
      if (Math.hypot(o.pos.x - ball.pos.x, o.pos.z - ball.pos.z) < 1.0 && ball.pos.y < 1.5) {
        this.loose = null; this._intercepted(o); return;
      }
    }
    if (L.t <= 0 || isOutOfPlay(ball.pos)) { this.loose = null; this._fail(isOutOfPlay(ball.pos) ? 'out' : 'loose'); }
  }

  _receive(rec, perfect, aerial) {
    const ball = this.ball;
    ball.mode = 'held';
    ball.owner = rec;
    this.holder = rec;
    this.aerial = !!aerial;
    rec.action = 'receive'; rec.actionTime = 0;
    rec.setRun(null);
    this.stats.passes++;
    if (perfect) this.stats.perfect++; else this.stats.imperfect++;
    this.events.push({ type: 'receive', perfect, aerial: this.aerial, who: rec });
    const obj = this.level.objective;
    if (obj.type === 'pass' && this.stats.passes >= (obj.count || 1) && (!obj.zone || inBox(rec.pos.x, rec.pos.z))) {
      this._succeed('pass');
      return;
    }
    if (this.stats.actions >= this.maxActions) { this._fail('moves'); return; }
    this.pendingDecision = this.aerial ? 0.12 : 0.4;
  }

  _enterDecision() {
    this.state = 'decision';
    for (const a of [...this.team, ...this.opponents]) {
      a.vel.set(0, 0, 0);
      a.target = null;
      a.markTarget = null;
    }
    this.gk.reset();
    this.keeper.pos.copy(this.gk.setPosition(this.ball.pos));
    this._faceForDecision();
    this._placeHeldBall();
    this.events.push({ type: 'decision' });
  }

  _faceForDecision() {
    const h = this.holder;
    h.facing = Math.atan2(GOAL_CENTER.x - h.pos.x, GOAL_CENTER.z - h.pos.z);
    h.look = GOAL_CENTER.clone();
    for (const a of [...this.team, ...this.opponents]) {
      if (a === h) continue;
      a.look = h.pos.clone();
      a.facing = Math.atan2(h.pos.x - a.pos.x, h.pos.z - a.pos.z);
    }
  }

  _placeHeldBall() {
    const o = this.ball.owner;
    if (!o) return;
    const f = o.facing;
    const lift = this.aerial && o === this.holder ? PLAY.headerHeight : BALL_R;
    const fwd = lift > 1 ? 0.25 : 0.42;
    this.ball.pos.set(o.pos.x + Math.sin(f) * fwd, lift, o.pos.z + Math.cos(f) * fwd);
    this.ball.vel.copy(o.vel);
  }

  _intercepted(o) {
    const keeper = o.role === 'keeper';
    const wall = o.role === 'wall';
    this.ball.mode = 'held';
    this.ball.owner = o;
    this.ball.vel.set(0, 0, 0);
    o.action = keeper ? 'dive' : 'receive'; o.actionTime = 0;
    if (keeper) { o.extra.dive = 0; o.extra.diveY = this.ball.pos.y; }
    if (wall) {
      // ball smacks off the wall
      this.ball.mode = 'free';
      this.ball.owner = null;
      this.ball.vel.set((Math.random() - 0.5) * 3, 3, 6);
    } else {
      o.setRun(o.pos.clone().add(new THREE.Vector3(0, 0, 6)), null, 3);
    }
    this.events.push({ type: 'intercept', who: o, keeper, wall });
    this._fail(wall || this.action?.kind === 'shot' ? 'blocked' : keeper ? 'claimed' : 'intercepted');
  }

  _saved() {
    const ball = this.ball, k = this.keeper;
    const hard = ball.vel.length() > 23;
    if (!hard) {
      ball.mode = 'held'; ball.owner = k;
      this.events.push({ type: 'save', caught: true, at: ball.pos.clone() });
      this._fail('caught');
    } else {
      ball.mode = 'free';
      const side = Math.sign(ball.pos.x - k.pos.x) || 1;
      ball.vel.set(side * 5.5, 3.2, Math.abs(ball.vel.z) * 0.25);
      this.events.push({ type: 'save', caught: false, at: ball.pos.clone() });
      this._fail('saved');
    }
  }

  _woodwork(kind) {
    const ball = this.ball;
    ball.mode = 'free';
    ball.vel.z = Math.abs(ball.vel.z) * 0.55;
    if (kind === 'bar') ball.vel.y = -Math.abs(ball.vel.y) - 2;
    else ball.vel.x = -ball.vel.x * 0.6 - Math.sign(ball.pos.x) * 3;
    this.events.push({ type: 'post', kind, at: ball.pos.clone() });
    this._fail('woodwork');
  }

  _miss() {
    this.events.push({ type: 'miss' });
    this._fail('miss');
  }

  _goal(x, y) {
    const a = this.action;
    this.stats.goal = { x, y, curve: a.curve, header: a.header, power: a.power, distance: a.distance };
    const scorer = this.holder;
    this.events.push({ type: 'goal', scorer, x, y });
    // celebration runs
    const cx = scorer.pos.x >= 0 ? 22 : -22;
    scorer.setRun({ x: cx, z: GOAL.z + 10 }, null, 6.2);
    scorer.action = 'celebrate'; scorer.actionTime = 0;
    // teammates join the celebration but stop short so the camera has room
    this.team.filter(m => m !== scorer).forEach((m, i) => m.setRun({ x: cx * 0.8 - Math.sign(cx) * i * 1.6, z: GOAL.z + 14 + i * 1.2 }, null, 5.2));
    for (const o of this.opponents) { if (o.role !== 'keeper') o.setRun(null); }
    this._succeed('goal');
  }

  _succeed(reason) {
    if (this.result) return;
    this.result = { success: true, reason };
    this.state = 'over';
    this.events.push({ type: 'result', success: true, reason });
  }

  _fail(reason) {
    if (this.result) return;
    this.result = { success: false, reason, text: FAIL_TEXT[reason] || 'Chance gone' };
    this.state = 'over';
    this.events.push({ type: 'result', success: false, reason });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
