// GRAVITY physics: Newtonian gravity from every body, moons on Kepler
// orbits, atmospheric drag, planetary rings and black-hole horizons.
// Pure and deterministic: the browser game and the Node level generator
// run exactly this code with the same fixed step.
import { BODIES, gameRadius, gameMu, dragCoef, C_LIGHT } from '../data/bodies.js';

export const SIM = {
  DT: 1 / 120,
  MAX_T: 18,          // seconds of flight before "lost in space"
  SHIP_R: 9,
  MARGIN: 320,        // how far outside the field the ship may wander
  SOFT: 10,
  MAX_DRAG: 250,      // drag length (world px) for full power
  MIN_DRAG: 20,
  MIN_POWER: 0.16,    // weakest launch as a fraction of max speed
  SHARD_R: 28,
  ATMO_H: 0.4,        // atmosphere thickness as a fraction of radius
};
export const BH_MU = 6.0e7;   // black-hole GM (horizon r_s = 2GM/c^2 ≈ 34 px)

export const OUT = { NONE: 0, CRASH: 1, TARGET: 2, LOST: 3, RING: 4, HORIZON: 5 };

export function buildWorld(level) {
  const bodies = level.bodies.map(b => {
    const kind = b.key === 'blackhole' ? 'blackhole' : b.key === 'rock' ? 'rock' : 'planet';
    const r = b.r ?? gameRadius(b.key);
    const mu = kind === 'blackhole' ? (b.mu ?? BH_MU) : gameMu(b.key, r);
    const rs = kind === 'blackhole' ? (2 * mu) / (C_LIGHT * C_LIGHT) : 0;
    return {
      key: b.key, kind, x0: b.x, y0: b.y, r: kind === 'blackhole' ? rs : r, mu, rs,
      drag: dragCoef(b.key), orbit: b.orbit || null, x: b.x, y: b.y,
    };
  });
  const half = { w: level.field.w / 2, h: level.field.h / 2 };
  return {
    level, bodies,
    rings: (level.rings || []).map(r => ({ ...r })),
    target: { ...level.target },
    shards: (level.shards || []).map(s => ({ x: s[0], y: s[1] })),
    start: { x: level.start[0], y: level.start[1] },
    bounds: { x0: -half.w - SIM.MARGIN, x1: half.w + SIM.MARGIN, y0: -half.h - SIM.MARGIN, y1: half.h + SIM.MARGIN },
    maxSpeed: level.maxSpeed,
  };
}

// Move every body to its position at time t (moons follow Kepler orbits).
export function placeBodies(world, t) {
  for (const b of world.bodies) {
    if (!b.orbit) continue;
    const o = b.orbit;
    let cx = o.cx ?? 0, cy = o.cy ?? 0;
    if (o.around != null && o.around >= 0) { const p = world.bodies[o.around]; cx = p.x; cy = p.y; }
    const a = o.phase + o.w * t;
    b.x = cx + o.R * Math.cos(a);
    b.y = cy + o.R * Math.sin(a);
  }
}

export function makeShip(world, vx, vy) {
  return { x: world.start.x, y: world.start.y, vx, vy, t: 0, got: 0, near: new Set(), infl: new Map() };
}

// One fixed step of semi-implicit Euler. Returns an outcome code.
export function step(world, s, events) {
  const dt = SIM.DT;
  placeBodies(world, s.t);
  let ax = 0, ay = 0;
  const soft2 = SIM.SOFT * SIM.SOFT;
  for (const b of world.bodies) {
    const dx = b.x - s.x, dy = b.y - s.y;
    const d2 = dx * dx + dy * dy;
    const inv = 1 / Math.sqrt(d2 + soft2);
    const k = b.mu * inv * inv * inv;
    ax += dx * k; ay += dy * k;
    if (b.drag > 0) {
      const d = Math.sqrt(d2), top = b.r * (1 + SIM.ATMO_H);
      if (d < top) {
        const depth = 1 - (d - b.r) / (top - b.r);
        ax -= s.vx * b.drag * depth; ay -= s.vy * b.drag * depth;
        if (events && !s.near.has('atmo' + b.key)) { s.near.add('atmo' + b.key); events.push({ type: 'atmo', body: b, t: s.t }); }
      }
    }
  }
  s.vx += ax * dt; s.vy += ay * dt;
  s.x += s.vx * dt; s.y += s.vy * dt;
  s.t += dt;
  return classify(world, s, events);
}

function classify(world, s, events) {
  for (let i = 0; i < world.bodies.length; i++) {
    const b = world.bodies[i];
    const dx = s.x - b.x, dy = s.y - b.y, d = Math.hypot(dx, dy);
    if (b.kind === 'blackhole') {
      if (d < b.rs) return OUT.HORIZON;
    } else if (d < b.r + SIM.SHIP_R) return OUT.CRASH;
    if (events) {
      // close call: skim within 35% of a radius of the surface
      if (b.kind !== 'rock' && d < b.r * 1.35 + 14 && !s.near.has(i)) { s.near.add(i); events.push({ type: 'close', body: b, t: s.t, x: s.x, y: s.y }); }
      // gravity assist: only MOVING bodies can add energy (real physics)
      if (b.orbit) {
        const R = b.r * 3.2 + 40, sp = Math.hypot(s.vx, s.vy);
        const inside = d < R, rec = s.infl.get(i);
        if (inside && !rec) s.infl.set(i, { v0: sp });
        else if (!inside && rec && !rec.done) {
          rec.done = true;
          if (sp > rec.v0 * 1.1) events.push({ type: 'assist', body: b, gain: sp / rec.v0 - 1, t: s.t, x: s.x, y: s.y });
        }
      }
    }
  }
  for (const r of world.rings) {
    const b = world.bodies[r.body];
    const d = Math.hypot(s.x - b.x, s.y - b.y);
    if (d > r.inner - SIM.SHIP_R && d < r.outer + SIM.SHIP_R) {
      const inGap = r.gap && d > r.gap[0] + SIM.SHIP_R && d < r.gap[1] - SIM.SHIP_R;
      if (!inGap) return OUT.RING;
    }
  }
  for (let i = 0; i < world.shards.length; i++) {
    if (s.got & (1 << i)) continue;
    const sh = world.shards[i];
    if (Math.hypot(s.x - sh.x, s.y - sh.y) < SIM.SHARD_R) {
      s.got |= 1 << i;
      events?.push({ type: 'shard', index: i, count: popcount(s.got), t: s.t, x: sh.x, y: sh.y });
    }
  }
  const tg = world.target;
  if (Math.hypot(s.x - tg.x, s.y - tg.y) < tg.r) return OUT.TARGET;
  const B = world.bounds;
  if (s.x < B.x0 || s.x > B.x1 || s.y < B.y0 || s.y > B.y1 || s.t > SIM.MAX_T) return OUT.LOST;
  return OUT.NONE;
}

export function popcount(m) { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

// Drag (pull-back) vector in world px -> launch velocity.
export function dragToVelocity(world, dx, dy) {
  const L = Math.hypot(dx, dy);
  if (L < SIM.MIN_DRAG) return null;
  const p = Math.min(L / SIM.MAX_DRAG, 1);
  const sp = world.maxSpeed * (SIM.MIN_POWER + (1 - SIM.MIN_POWER) * p);
  return { vx: (-dx / L) * sp, vy: (-dy / L) * sp, power: p };
}

export function velocityFromAngle(world, angle, power) {
  const sp = world.maxSpeed * (SIM.MIN_POWER + (1 - SIM.MIN_POWER) * power);
  return { vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp };
}

// Full headless flight (used by the generator, tests and the aim preview).
export function simulate(world, vx, vy, { record = false, maxT = SIM.MAX_T, events = null } = {}) {
  const s = makeShip(world, vx, vy);
  const path = record ? [[s.x, s.y]] : null;
  let out = OUT.NONE;
  while (s.t < maxT) {
    out = step(world, s, events);
    if (record) path.push([s.x, s.y]);
    if (out) break;
  }
  placeBodies(world, 0);
  return { out, t: s.t, got: s.got, stars: popcount(s.got), path, x: s.x, y: s.y };
}

// Escape velocity at a body's surface: v = sqrt(2GM/R).
export function escapeSpeed(b) { return Math.sqrt((2 * b.mu) / Math.max(b.r, 1)); }

export { BODIES };
