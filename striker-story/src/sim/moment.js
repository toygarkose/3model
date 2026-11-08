// A "moment": one chance in a match (free kick, penalty, edge-of-box, 1v1).
// Pure simulation: the browser and the Node balance tool run the same code.
import { GOAL, BALL_R, DT, AI, SHOT, PRESSURE, BALL } from '../data/config.js';
import { makeBall, kick, stepBall, goalLine, netCollide } from './ball.js';

export function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const TYPES = ['open', 'freekick', 'penalty', 'oneonone'];
export const MOMENT_LABEL = {
  open: 'On the edge of the box', freekick: 'Free kick', penalty: 'Penalty!', oneonone: 'Through on goal', training: 'Training',
};

function keeperSet(ball) {
  const d = Math.hypot(ball.x, ball.y) || 1;
  const out = Math.min(3, Math.max(0.5, 0.5 + d * 0.07));
  return { x: Math.max(-2.8, Math.min(2.8, (ball.x / d) * out)), y: Math.max(0.3, (ball.y / d) * out) };
}

/**
 * @param {string} type  open | freekick | penalty | oneonone | training
 * @param {number} seed
 * @param {object} opp   { keeper: 0.7..1.3, defence: 0.7..1.3 }
 */
export function createMoment(type, seed, opp = { keeper: 1, defence: 1 }) {
  const r = rng(seed);
  const rnd = (a, b) => a + (b - a) * r();
  const m = {
    type, seed, opp, r, t: 0, phase: 'aim', events: [], result: null,
    you: { x: 0, y: 20, vx: 0, vy: 0, run: null },
    mates: [], defs: [], wall: [], targets: [],
    keeper: null, shooter: 'you', touches: 0,
  };
  let bx, by;
  if (type === 'penalty') { bx = 0; by = 11; }
  else if (type === 'freekick') { bx = rnd(-13, 13); by = rnd(17, 27); }
  else if (type === 'oneonone') { bx = rnd(-7, 7); by = rnd(15, 21); }
  else if (type === 'training') { bx = rnd(-9, 9); by = rnd(18, 24); }
  else { bx = rnd(-15, 15); by = rnd(18, 27); }
  m.ball = makeBall(bx, by);
  m.you.x = bx; m.you.y = by + 0.6;

  const k = type === 'penalty' ? { x: 0, y: 0.25 } : keeperSet(m.ball);
  if (type !== 'training') m.keeper = { x: k.x, y: k.y, hx: k.x, hy: k.y, hz: 1.1, mode: 'set', react: 0, skill: opp.keeper, dive: 0 };

  if (type === 'freekick') {
    const d = Math.hypot(bx, by), ux = -bx / d, uy = -by / d;        // toward goal centre
    const cx = bx + ux * 9.15, cy = by + uy * 9.15;
    const n = d < 21 ? 5 : d < 24 ? 4 : 3;
    // the wall covers the near-post side
    const px = -uy, py = ux, side = Math.sign(bx) || 1;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 0.62 + side * 0.4;
      m.wall.push({ x: cx + px * o, y: cy + py * o, jump: 0 });
    }
    m.keeper.x = -side * 0.9;
    m.mates.push({ x: rnd(-6, 6), y: rnd(8, 12), run: null, name: '' });
    m.defs.push({ x: m.mates[0].x + 0.8, y: m.mates[0].y - 1.2, vx: 0, vy: 0 });
  }
  if (type === 'open') {
    const nd = 2 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < nd; i++) {
      const f = rnd(0.35, 0.75);
      m.defs.push({ x: bx * (1 - f) + rnd(-4, 4), y: by * (1 - f) + rnd(-1, 2), vx: 0, vy: 0 });
    }
    const nm = 1 + (r() < 0.6 ? 1 : 0);
    for (let i = 0; i < nm; i++) {
      const sx = (i === 0 ? -Math.sign(bx || 1) : Math.sign(bx || 1)) * rnd(5, 12);
      m.mates.push({ x: sx, y: rnd(12, 19), run: { x: sx * 0.55, y: rnd(6, 10) }, name: '' });
    }
    m.you.run = { x: bx * 0.5, y: Math.max(9, by - 9) };
    m.pressure = PRESSURE.base;
  }
  if (type === 'oneonone') {
    m.defs.push({ x: bx + rnd(-2, 2), y: by + 3.5, vx: 0, vy: 0, chaser: true });
    m.pressure = PRESSURE.base * 0.9;
    m.keeper.rush = true;
  }
  if (type === 'training') {
    // targets inside the goal mouth: [x, z, r]
    m.targets = [[-2.8, 1.9, 0.55], [2.8, 1.9, 0.55], [-2.9, 0.45, 0.55], [2.9, 0.45, 0.55], [0, 2.0, 0.5]].map(([x, z, rr]) => ({ x, z, r: rr, hit: false }));
  }
  return m;
}

export function randomMomentType(r, weights = { open: 0.42, freekick: 0.24, penalty: 0.12, oneonone: 0.22 }) {
  let x = r(), acc = 0;
  for (const t of TYPES) { acc += weights[t]; if (x < acc) return t; }
  return 'open';
}

// Turn the player's aim into a kick. skills: { shooting, power, curl, composure } 0..100
export function launchShot(m, aim, skills, fatigue = 0, noise = null) {
  if (m.phase !== 'aim') return null;
  const R = noise || m.r;
  const wob = (SHOT.wobbleMax - (SHOT.wobbleMax - SHOT.wobbleMin) * skills.shooting / 100) * (1 + fatigue * 1.5);
  const err = ((R() + R() + R()) / 3 - 0.5) * 2 * wob * Math.PI / 180;
  const ang = Math.atan2(aim.dy, aim.dx) + err;
  const vmax = SHOT.baseMax + skills.power * SHOT.powerGain;
  const speed = SHOT.minSpeed + (vmax - SHOT.minSpeed) * aim.power * (1 - fatigue * 0.15);
  const elev = aim.lob ? SHOT.lob : SHOT.driveMin + (SHOT.driveMax - SHOT.driveMin) * aim.power;
  const spin = aim.curl * (SHOT.baseCurl + skills.curl * SHOT.curlGain);
  kick(m.ball, Math.cos(ang), Math.sin(ang), speed, elev, spin);
  m.phase = 'flight';
  m.flightT = 0;
  m.shooter = m.shooter === 'mate' ? 'mate' : 'you';
  m.touches++;
  m.kickInfo = { speed, curl: aim.curl, lob: !!aim.lob, err };
  // aimed at the goal mouth = shot, otherwise a pass
  const dy = Math.sin(ang);
  const crossX = dy < -0.05 ? m.ball.x + Math.cos(ang) * (m.ball.y / -dy) : Infinity;
  m.kickedAt = Math.abs(crossX) < 9 ? 'shot' : 'pass';
  if (m.keeper) { m.keeper.mode = 'react'; m.keeper.react = (AI.keeperReact / m.keeper.skill); m.keeper.sx = m.keeper.x; m.keeper.hx = m.keeper.x; m.keeper.hy = m.keeper.y; m.keeper.hz = 1.0; }
  if (m.type === 'penalty' && m.keeper) {
    const g = R();
    m.keeper.guess = g < 0.38 ? -1 : g < 0.76 ? 1 : 0;   // keepers usually pick a side
    if (m.keeper.guess) m.keeper.react = 0.05;           // ...and go at the moment of the kick
  }
  for (const w of m.wall) w.jump = 0.001;
  if (m.you.run) m.you.target = { ...m.you.run };
  for (const mt of m.mates) if (mt.run) mt.target = { ...mt.run };
  m.events.push({ type: 'kick', speed, lob: !!aim.lob });
  return m.kickInfo;
}

// Preview: where does a clean kick go (no aim error)? Used for the short aim guide.
export function previewPath(m, aim, skills, seconds = 0.4) {
  const b = { ...m.ball };
  const vmax = SHOT.baseMax + skills.power * SHOT.powerGain;
  const speed = SHOT.minSpeed + (vmax - SHOT.minSpeed) * aim.power;
  const elev = aim.lob ? SHOT.lob : SHOT.driveMin + (SHOT.driveMax - SHOT.driveMin) * aim.power;
  kick(b, aim.dx, aim.dy, speed, elev, aim.curl * (SHOT.baseCurl + skills.curl * SHOT.curlGain));
  const pts = [[b.x, b.y, b.z]];
  let n = 0;
  for (let t = 0; t < seconds; t += DT) { stepBall(b); if (++n % 3 === 0 || t + DT >= seconds) pts.push([b.x, b.y, b.z]); }
  return pts;
}

function moveToward(p, tx, ty, speed, dt) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < 0.02) return d;
  const s = Math.min(d, speed * dt);
  p.x += (dx / d) * s; p.y += (dy / d) * s;
  return d;
}

function finish(m, result, extra = {}) {
  if (m.result) return;
  m.result = { kind: result, shooter: m.shooter, ...extra };
  m.phase = 'done';
  m.events.push({ type: 'result', result: m.result });
}

// Real-time step while aiming (pressure, rushing keeper).
export function stepAim(m, dt) {
  if (m.phase !== 'aim') return;
  m.t += dt;
  if (m.pressure != null) {
    m.pressure -= dt;
    for (const d of m.defs) {
      const tx = m.ball.x + (0 - m.ball.x) * 0.08, ty = m.ball.y - 1.1;
      const dd = Math.hypot(d.x - m.ball.x, d.y - m.ball.y);
      if (dd > 1.25) moveToward(d, d.chaser ? m.ball.x : tx, d.chaser ? m.ball.y + 0.9 : ty, d.chaser ? 4.2 : 1.1, dt);
    }
    if (m.keeper?.rush) {
      const d = Math.hypot(m.keeper.x - m.ball.x, m.keeper.y - m.ball.y);
      if (m.keeper.y < 7 && d > 5) moveToward(m.keeper, m.ball.x * 0.5, m.ball.y, 2.4, dt);
    }
    if (m.pressure <= 0) { m.events.push({ type: 'tackle' }); finish(m, 'tackled'); }
  }
}

export function stepFlight(m, dt) {
  if (m.phase !== 'flight' && m.phase !== 'after') return;
  let acc = dt;
  while (acc > 1e-9) {
    const h = Math.min(DT, acc);
    acc -= h;
    if (!substep(m)) break;
  }
}

function substep(m) {
  const b = m.ball, prev = { x: b.x, y: b.y, z: b.z };
  m.flightT += DT;
  const ev = stepBall(b);
  if (ev) m.events.push({ type: 'bounce', strength: Math.min(1, Math.abs(b.vz) / 6) });

  // ----- people move
  for (const mt of m.mates) if (mt.target) moveToward(mt, mt.target.x, mt.target.y, 6.5, DT);
  if (m.you.target) moveToward(m.you, m.you.target.x, m.you.target.y, 6.8, DT);
  for (const w of m.wall) if (w.jump > 0) w.jump += DT;

  if (m.phase === 'after') {
    const hit = netCollide(b);
    if (hit != null && hit > 1) m.events.push({ type: 'net', strength: Math.min(1, hit / 25), x: b.x, z: b.z });
    m.afterT -= DT;
    if (m.afterT <= 0) { m.phase = 'done'; return false; }
    return true;
  }

  // ----- defenders chase / block (they react to the ball, not your intentions)
  const lead = 0.22;
  for (const d of m.defs) {
    if (m.flightT < AI.defReact / m.opp.defence) continue;
    const tx = b.x + b.vx * lead, ty = b.y + b.vy * lead;
    const fast = Math.hypot(b.vx, b.vy) > 14 && m.kickedAt === 'shot';
    moveToward(d, tx, ty, fast ? AI.lunge * m.opp.defence : AI.defSpeed * m.opp.defence * (d.chaser ? 1.05 : 1), DT);
    const dd = Math.hypot(d.x - b.x, d.y - b.y);
    if ((dd < AI.defReach && b.z < 1.1) || (dd < 0.5 && b.z < AI.defJump)) {
      b.vx = -b.vx * 0.3 + (m.r() - 0.5) * 6; b.vy = Math.abs(b.vy) * 0.3 + 2; b.vz = 2; b.spin = 0;
      m.events.push({ type: 'block', x: d.x, y: d.y });
      finish(m, m.kickedAt === 'pass' ? 'intercepted' : 'blocked');
      m.phase = 'after'; m.afterT = 0.8;
      return true;
    }
  }
  for (const w of m.wall) {
    const jumpH = w.jump > 0.12 && w.jump < 0.75 ? AI.wallJump : AI.wallStand;
    if (Math.hypot(w.x - b.x, w.y - b.y) < 0.36 && b.z < jumpH) {
      b.vx = (m.r() - 0.5) * 5; b.vy = Math.abs(b.vy) * 0.35 + 2; b.vz = 3; b.spin = 0;
      m.events.push({ type: 'wall', x: w.x, y: w.y });
      finish(m, 'blocked');
      m.phase = 'after'; m.afterT = 0.8;
      return true;
    }
  }

  // ----- teammates receive passes
  if (m.shooter === 'you') {
    for (const mt of m.mates) {
      if (Math.hypot(mt.x - b.x, mt.y - b.y) < AI.mateReach && b.z < 1.7 && m.flightT > 0.15) {
        b.vx = b.vy = b.vz = 0; b.spin = 0; b.z = BALL_R; b.x = mt.x; b.y = mt.y - 0.4;
        m.events.push({ type: 'received', mate: mt });
        m.receiver = mt;
        m.phase = 'mate';
        return false;
      }
    }
  }
  // returning one-two: you collect
  if (m.shooter === 'mate-pass' && Math.hypot(m.you.x - b.x, m.you.y - b.y) < 1.3 && b.z < 1.5) {
    b.vx = b.vy = b.vz = 0; b.spin = 0; b.z = BALL_R; b.x = m.you.x; b.y = m.you.y - 0.5;
    m.shooter = 'you'; m.phase = 'aim'; m.pressure = PRESSURE.base * 0.7; m.oneTwo = true;
    m.you.target = null;
    for (const k of m.keeper ? [m.keeper] : []) { const s = keeperSet(b); k.x = s.x; k.y = s.y; k.mode = 'set'; }
    m.events.push({ type: 'onetwo' });
    return false;
  }

  // ----- goalkeeper
  const kp = m.keeper;
  if (kp && kp.mode !== 'set' && kp.mode !== 'done') {
    if (kp.react > 0) kp.react -= DT;
    else {
      kp.mode = 'dive';
      let tx, ty, tz;
      if (m.type === 'penalty' && kp.guess) {
        // committed to a side before the kick: dive there, adjust a little
        tx = kp.guess * 2.9 + (b.x - kp.guess * 2.9) * 0.18; ty = 0.25; tz = Math.min(2.2, Math.max(0.4, b.z + b.vz * 0.2));
      } else {
        const hv = b.vx * b.vx + b.vy * b.vy;
        let t = hv > 1 ? Math.max(0, ((kp.sx - b.x) * b.vx + (kp.y - b.y) * b.vy) / hv) : 0;
        if (b.vy < -0.5) t = Math.min(t, (b.y - 0.15) / -b.vy);
        tx = b.x + b.vx * t; ty = Math.max(0.15, b.y + b.vy * t); tz = b.z + b.vz * t - 0.5 * BALL.gravity * t * t;
      }
      tx = Math.max(-GOAL.halfW - 0.6, Math.min(GOAL.halfW + 0.6, tx));
      const sp = AI.keeperSpeed * kp.skill * (m.type === 'penalty' && kp.guess ? 1.8 : 1);
      const dx = tx - kp.hx, dy = ty - kp.hy, d = Math.hypot(dx, dy);
      if (d > 1e-4) { const k = Math.min(1, sp * DT / d); kp.hx += dx * k; kp.hy += dy * k; }
      kp.hz += Math.max(-4 * DT, Math.min(4 * DT, Math.min(AI.keeperJump, Math.max(0.3, tz)) - kp.hz));
      kp.x = kp.hx * 0.8 + kp.sx * 0.2; kp.y = kp.hy;
      kp.dive = kp.hx - kp.sx;
      const reach = AI.keeperReach * (0.85 + 0.15 * kp.skill);
      const hd = Math.hypot(b.x - kp.hx, b.y - kp.hy, b.z - kp.hz);
      const body = Math.hypot(b.x - kp.x, b.y - kp.y) < 0.45 && b.z < kp.hz + 0.3;
      if ((hd < reach || body) && b.y > -0.05) {
        const sp2 = Math.hypot(b.vx, b.vy);
        kp.mode = 'done';
        if (sp2 < 17 && b.z < 2.0) {
          b.vx = b.vy = b.vz = 0; b.spin = 0; b.x = kp.hx; b.y = kp.hy; b.z = Math.max(BALL_R, kp.hz);
          m.events.push({ type: 'save', caught: true, x: b.x, y: b.y });
          finish(m, 'saved', { caught: true });
        } else {
          b.vx = Math.sign(b.x - kp.x || 1) * 5 + b.vx * 0.2; b.vy = Math.abs(b.vy) * 0.25 + 2; b.vz = 3; b.spin = 0;
          m.events.push({ type: 'save', caught: false, x: b.x, y: b.y });
          finish(m, 'saved');
        }
        m.phase = 'after'; m.afterT = 1.0;
        return true;
      }
    }
  }

  // ----- training targets
  if (m.type === 'training' && prev.y > 0 && b.y <= 0) {
    const f = prev.y / (prev.y - b.y || 1), x = prev.x + (b.x - prev.x) * f, z = prev.z + (b.z - prev.z) * f;
    for (const tg of m.targets) if (!tg.hit && Math.hypot(x - tg.x, z - tg.z) < tg.r) { tg.hit = true; m.events.push({ type: 'target', tg }); }
  }

  // ----- goal line
  const gl = goalLine(prev, b);
  if (gl) {
    if (gl.kind === 'goal') {
      m.events.push({ type: 'goal', x: gl.x, z: gl.z });
      finish(m, 'goal', { x: gl.x, z: gl.z, curl: m.kickInfo?.curl || 0, speed: Math.hypot(b.vx, b.vy) });
      if (kp) kp.mode = 'done';
      m.phase = 'after'; m.afterT = 1.6;
      return true;
    }
    if (gl.kind === 'post' || gl.kind === 'bar') {
      b.vy = Math.abs(b.vy) * 0.6;
      if (gl.kind === 'bar') b.vz = -Math.abs(b.vz) - 1; else b.vx = -b.vx * 0.5 - Math.sign(b.x) * 2;
      b.y = 0.05;
      m.events.push({ type: 'post', kind: gl.kind, x: gl.x, z: gl.z });
      finish(m, 'post');
      m.phase = 'after'; m.afterT = 1.0;
      return true;
    }
    m.events.push({ type: 'miss', x: gl.x, z: gl.z });
    finish(m, 'miss', { x: gl.x, z: gl.z });
    m.phase = 'after'; m.afterT = 0.9;
    return true;
  }
  // ball dead or out of play
  const out = Math.abs(b.x) > 34 || b.y > 60;
  if (out || (!b.moving && m.flightT > 0.3) || m.flightT > 7) {
    finish(m, m.shooter === 'you' && m.kickedAt === 'pass' ? 'intercepted' : 'lost');
    return false;
  }
  return true;
}

// Teammate decides after receiving your pass: shoot (you get the assist) or play a one-two.
export function mateDecision(m, teamRel = 50) {
  const mt = m.receiver, b = m.ball;
  const dist = Math.hypot(mt.x, mt.y);
  const goodSpot = dist < 17 && Math.abs(mt.x) < 14;
  const returnChance = 0.25 + teamRel / 200;   // better relationship -> they give it back to you
  if (m.you.y > 3 && m.r() < returnChance && (!goodSpot || m.r() < 0.55)) {
    // one-two: pass back into your run
    m.shooter = 'mate-pass';
    const tx = m.you.x + (m.you.target ? (m.you.target.x - m.you.x) * 0.6 : 0), ty = m.you.y + (m.you.target ? (m.you.target.y - m.you.y) * 0.6 : 0);
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
    kick(b, dx, dy, Math.min(20, 6 + d * 0.9), 2, 0);
    m.phase = 'flight'; m.flightT = 0;
    m.events.push({ type: 'matepass' });
    return 'onetwo';
  }
  // teammate shoots at a corner
  m.shooter = 'mate';
  const corner = (m.r() < 0.5 ? -1 : 1) * (2.2 + m.r() * 1.2), height = 0.3 + m.r() * 1.6;
  const dx = corner - b.x, dy = -b.y, d = Math.hypot(dx, dy) || 1;
  const err = (m.r() - 0.5) * 0.12;
  const ang = Math.atan2(dy, dx) + err;
  const speed = 21 + m.r() * 6;
  const elev = Math.atan2(height + 0.1 * d, d) * 180 / Math.PI * 0.9 + 2;
  kick(b, Math.cos(ang), Math.sin(ang), speed, elev, (m.r() - 0.5) * 0.5);
  m.phase = 'flight'; m.flightT = 0;
  if (m.keeper) { m.keeper.mode = 'react'; m.keeper.react = AI.keeperReact / m.keeper.skill; m.keeper.sx = m.keeper.x; m.keeper.hx = m.keeper.x; m.keeper.hy = m.keeper.y; m.keeper.hz = 1.0; }
  m.events.push({ type: 'mateshot' });
  return 'shoot';
}
