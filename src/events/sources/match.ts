import * as THREE from 'three';
import type { VenueConfig } from '../../config/venue';
import { clamp, damp, mulberry32 } from '../../core/rng';
import type { Phase } from '../../core/store';
import type { EventContext, EventFactory, EventSource, EventStatus } from '../types';

type Role = 'gk' | 'def' | 'mid' | 'fwd';

interface Player {
  team: 0 | 1;
  role: Role;
  /** Diziliş konumu, takım çerçevesinde (-1..1; kendi kalesi -1). */
  hx: number;
  hz: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  stride: number;
  cooldown: number;
}

type Mode = 'idle' | 'kickoff' | 'play' | 'celebrate' | 'halftime' | 'ended';
interface Shot {
  outcome: 'goal' | 'save' | 'miss';
  team: 0 | 1;
}

const FORMATION: Array<[Role, number, number]> = [
  ['gk', -0.94, 0],
  ['def', -0.6, -0.62],
  ['def', -0.66, -0.21],
  ['def', -0.66, 0.21],
  ['def', -0.6, 0.62],
  ['mid', -0.2, -0.66],
  ['mid', -0.28, -0.22],
  ['mid', -0.28, 0.22],
  ['mid', -0.2, 0.66],
  ['fwd', 0.2, -0.24],
  ['fwd', 0.2, 0.24],
];
const SCALE = 1.3;
const GOAL_HALF = 3.66;

/** Simüle maç: iki takım, top, goller, işleyen skor ve süre. */
class MatchSource implements EventSource {
  readonly info;
  readonly focus = new THREE.Vector3(0, 1.2, 0);
  readonly order = 1;

  private ctx!: EventContext;
  private readonly HL: number;
  private readonly HW: number;
  private readonly duration: number;
  private rng = mulberry32(1);
  private players: Player[] = [];
  private ref = { x: 0, z: 9, vx: 0, vz: 0, heading: 0, stride: 0 };
  private ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  private owner: Player | null = null;
  private receiver: Player | null = null;
  private lastKicker: Player | null = null;
  private lastTouch: 0 | 1 = 0;
  private freeFor: 0 | 1 | null = null;
  private shot: Shot | null = null;
  private mode: Mode = 'idle';
  private modeT = 0;
  private kickoffTeam: 0 | 1 = 0;
  private decisionT = 1;
  private tackleT = 0;
  private stuckT = 0;
  private score: [number, number] = [0, 0];
  private minute = 0;
  private secondHalf = false;
  private note = 'Takımlar ısınıyor';
  private scorer: Player | null = null;

  private bodies!: THREE.InstancedMesh;
  private heads!: THREE.InstancedMesh;
  private legs!: THREE.InstancedMesh;
  private shadows!: THREE.InstancedMesh;
  private ballMesh!: THREE.Mesh;
  private ballRing!: THREE.Mesh;
  private readonly m = new THREE.Matrix4();
  private readonly m2 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(SCALE, SCALE, SCALE);

  constructor(private readonly venue: VenueConfig) {
    const ev = venue.events.match;
    this.info = {
      id: 'mac',
      label: 'Maç',
      badge: ev.badge,
      title: `${ev.home.name} – ${ev.away.name}`,
      subtitle: ev.competition,
      date: ev.date,
      time: ev.time,
    };
    this.HL = venue.field.length / 2;
    this.HW = venue.field.width / 2;
    this.duration = venue.flow.liveSeconds;
  }

  mount(ctx: EventContext): void {
    this.ctx = ctx;
    const ev = this.venue.events.match;
    this.players = [];
    for (const team of [0, 1] as const) {
      for (const [role, hx, hz] of FORMATION) {
        const dir = team === 0 ? 1 : -1;
        this.players.push({ team, role, hx, hz, x: hx * 50 * dir, z: hz * this.HW * 0.8, vx: 0, vz: 0, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, stride: 0, cooldown: 0 });
      }
    }
    const n = this.players.length + 1;
    const lambert = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.7, 0.28).translate(0, 1.1, 0), lambert(), n);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.62, 0), lambert(), n);
    this.legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.76, 0.18).translate(0, -0.38, 0), lambert(), n * 2);
    this.shadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.55, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x06140c, transparent: true, opacity: 0.45, depthWrite: false }),
      n + 1,
    );
    const c = new THREE.Color();
    const skins = [0xf2c9a1, 0xc68642, 0xe0ac7e, 0x8d5524];
    this.players.forEach((p, i) => {
      const kit = p.team === 0 ? ev.home : ev.away;
      c.set(p.role === 'gk' ? (p.team === 0 ? '#22c55e' : '#f59e0b') : kit.color);
      this.bodies.setColorAt(i, c);
      this.heads.setColorAt(i, c.setHex(skins[i % skins.length]));
      c.set(p.role === 'gk' ? '#14142b' : kit.accent);
      this.legs.setColorAt(i * 2, c);
      this.legs.setColorAt(i * 2 + 1, c);
    });
    const ri = n - 1;
    this.bodies.setColorAt(ri, c.setHex(0x111118));
    this.heads.setColorAt(ri, c.setHex(0xe0ac7e));
    this.legs.setColorAt(ri * 2, c.setHex(0x111118));
    this.legs.setColorAt(ri * 2 + 1, c);
    for (const mesh of [this.bodies, this.heads, this.legs, this.shadows]) {
      mesh.frustumCulled = false;
      ctx.group.add(mesh);
    }
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 }));
    this.ballRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.0, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    ctx.group.add(this.ballMesh, this.ballRing);

    // Kaleler
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x444444 });
    const netPos: number[] = [];
    for (const side of [-1, 1]) {
      const gx = side * this.HL;
      for (const pz of [-GOAL_HALF, GOAL_HALF]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.44, 8), postMat);
        post.position.set(gx, 1.22, pz);
        ctx.group.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, GOAL_HALF * 2, 8), postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(gx, 2.44, 0);
      ctx.group.add(bar);
      const bx = gx + side * 2;
      for (let i = 0; i <= 12; i++) {
        const z = -GOAL_HALF + (i / 12) * GOAL_HALF * 2;
        netPos.push(gx, 2.44, z, bx, 1.6, z, bx, 1.6, z, bx, 0, z);
      }
      for (let j = 0; j <= 4; j++) {
        const y = (j / 4) * 1.6;
        netPos.push(bx, y, -GOAL_HALF, bx, y, GOAL_HALF);
        for (const pz of [-GOAL_HALF, GOAL_HALF]) netPos.push(gx, y * 1.52, pz, bx, y, pz);
      }
    }
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.Float32BufferAttribute(netPos, 3));
    ctx.group.add(new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })));

    this.resetState();
    this.syncMeshes(0);
  }

  private resetState(): void {
    this.score = [0, 0];
    this.minute = 0;
    this.secondHalf = false;
    this.mode = 'idle';
    this.owner = null;
    this.shot = null;
    this.freeFor = null;
    this.note = 'Takımlar ısınıyor';
    this.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  }

  begin(): void {
    this.rng = mulberry32((Date.now() & 0xffffff) | 1);
    this.resetState();
    this.note = 'İlk yarı';
    this.startKickoff(0, true);
  }

  private startKickoff(team: 0 | 1, whistle: boolean): void {
    this.mode = 'kickoff';
    this.modeT = 2.4;
    this.kickoffTeam = team;
    this.owner = null;
    this.shot = null;
    this.freeFor = null;
    this.receiver = null;
    this.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    if (whistle) this.ctx.cue({ type: 'whistle' });
  }

  // ---------- Simülasyon ----------

  private dirOf(team: 0 | 1): number {
    return team === 0 ? 1 : -1;
  }

  private homeTarget(p: Player, possession: boolean, out: { x: number; z: number }): void {
    const dir = this.dirOf(p.team);
    const bx = this.ball.x * dir;
    if (p.role === 'gk') {
      out.x = (-this.HL + 1.6 + clamp((bx + this.HL) * 0.035, 0, 4)) * dir;
      out.z = clamp(this.ball.z * 0.16, -3.2, 3.2);
      return;
    }
    const push = possession ? 7 : -4;
    const run = possession ? (p.role === 'fwd' ? 13 : p.role === 'mid' ? 5 : 0) : 0;
    const tx = clamp(p.hx * 50 * 0.62 + bx * 0.55 + push + run, -this.HL + 8, this.HL - 5);
    out.x = tx * dir;
    out.z = clamp(p.hz * this.HW * 0.74 + this.ball.z * 0.3, -this.HW + 2, this.HW - 2);
  }

  private nearest(team: 0 | 1, x: number, z: number, allowGk: boolean, except?: Player): Player | null {
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.team !== team || p === except) continue;
      if (p.role === 'gk' && !allowGk) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private kick(p: Player, tx: number, tz: number, speed: number, loft: number): void {
    const dx = tx - this.ball.x;
    const dz = tz - this.ball.z;
    const d = Math.hypot(dx, dz) || 1;
    this.ball.vx = (dx / d) * speed;
    this.ball.vz = (dz / d) * speed;
    this.ball.vy = loft;
    this.owner = null;
    this.lastKicker = p;
    this.lastTouch = p.team;
    p.cooldown = 0.9;
    this.freeFor = null;
  }

  private tryPass(p: Player, longBall: boolean): boolean {
    const dir = this.dirOf(p.team);
    let best: Player | null = null;
    let bestScore = -1;
    for (const c of this.players) {
      if (c.team !== p.team || c === p || c.role === 'gk') continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 7 || d > (longBall ? 48 : 34)) continue;
      const forward = (c.x - p.x) * dir;
      const opp = this.nearest((1 - p.team) as 0 | 1, c.x, c.z, true);
      const open = opp ? Math.min(10, Math.hypot(opp.x - c.x, opp.z - c.z)) : 10;
      // Pas hattı kapalı mı?
      let blocked = 0;
      for (const o of this.players) {
        if (o.team === p.team) continue;
        const t = clamp(((o.x - p.x) * (c.x - p.x) + (o.z - p.z) * (c.z - p.z)) / (d * d), 0, 1);
        if (Math.hypot(p.x + (c.x - p.x) * t - o.x, p.z + (c.z - p.z) * t - o.z) < 1.8) blocked = 14;
      }
      const sc = forward * 0.9 + open * 1.3 - blocked + this.rng() * 5;
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }
    if (!best) return false;
    const d = Math.hypot(best.x - p.x, best.z - p.z);
    this.kick(p, best.x + best.vx * 0.5, best.z + best.vz * 0.5, clamp(9 + d * 0.72, 12, 27), d > 26 ? 5 : 0);
    this.receiver = best;
    return true;
  }

  private shoot(p: Player): void {
    const dir = this.dirOf(p.team);
    const gx = this.HL * dir;
    const g = Math.hypot(gx - p.x, p.z);
    const keeper = this.players.find((k) => k.team !== p.team && k.role === 'gk')!;
    const r = this.rng();
    const pGoal = 0.14 + ((31 - Math.min(31, g)) / 31) * 0.24;
    let outcome: Shot['outcome'];
    let tz: number;
    if (r < pGoal) {
      outcome = 'goal';
      tz = (keeper.z > 0 ? -1 : 1) * (1.2 + this.rng() * 2.0);
    } else if (r < pGoal + 0.42) {
      outcome = 'save';
      tz = clamp(keeper.z + (this.rng() - 0.5) * 1.6, -3, 3);
    } else {
      outcome = 'miss';
      tz = (this.rng() > 0.5 ? 1 : -1) * (4.6 + this.rng() * 4.5);
    }
    this.kick(p, gx + dir * 1.5, tz, 26 + this.rng() * 5, outcome === 'save' ? 1.5 : 2.5 + this.rng() * 2.5);
    this.shot = { outcome, team: p.team };
    this.receiver = null;
    this.note = `${this.teamName(p.team)} şut çekti`;
  }

  private teamName(team: 0 | 1): string {
    return team === 0 ? this.venue.events.match.home.name : this.venue.events.match.away.name;
  }

  private placeBall(x: number, z: number, team: 0 | 1): void {
    this.ball = { x, y: 0, z, vx: 0, vy: 0, vz: 0 };
    this.owner = null;
    this.shot = null;
    this.receiver = null;
    this.freeFor = team;
    this.stuckT = 0;
  }

  private stepPlay(dt: number): void {
    const ball = this.ball;
    const target = { x: 0, z: 0 };
    const owner = this.owner;

    // Topa giden oyuncular
    const chasers: Array<Player | null> = [null, null];
    for (const team of [0, 1] as const) {
      if (owner && owner.team === team) continue;
      if (this.freeFor !== null && this.freeFor !== team) continue;
      if (this.shot) {
        if (this.shot.team !== team && this.shot.outcome === 'save') chasers[team] = this.players.find((k) => k.team === team && k.role === 'gk')!;
        continue;
      }
      if (this.receiver && this.receiver.team === team) {
        chasers[team] = this.receiver;
        continue;
      }
      const dir = this.dirOf(team);
      const nearGoal = (ball.x * dir + this.HL) < 11 && Math.abs(ball.z) < 12;
      chasers[team] = this.nearest(team, ball.x, ball.z, nearGoal, owner?.team === team ? owner : undefined);
    }

    for (const p of this.players) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      let maxSpeed = 6.6;
      if (p === owner) {
        // Top süren: kaleye doğru, yakın rakipten yana kaçarak
        const dir = this.dirOf(p.team);
        let dx = this.HL * dir - p.x;
        let dz = -p.z * 0.6;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d;
        dz /= d;
        const opp = this.nearest((1 - p.team) as 0 | 1, p.x, p.z, false);
        if (opp) {
          const ox = opp.x - p.x;
          const oz = opp.z - p.z;
          const od = Math.hypot(ox, oz);
          if (od < 6 && ox * dir > -1) dz += (oz > 0 ? -1 : 1) * (1 - od / 6) * 1.3;
        }
        if (Math.abs(p.z) > this.HW - 3) dz -= Math.sign(p.z) * 0.8;
        if (p.role === 'gk') {
          dx = 0;
          dz = 0;
        }
        target.x = p.x + dx * 8;
        target.z = p.z + dz * 8;
        maxSpeed = 6.6;
      } else if (p === chasers[p.team]) {
        target.x = ball.x + ball.vx * 0.25;
        target.z = ball.z + ball.vz * 0.25;
        maxSpeed = p.cooldown > 0 ? 3.5 : 7.6;
      } else {
        this.homeTarget(p, !!owner && owner.team === p.team, target);
        // Serbest vuruşta rakip topa yaklaşmaz
        if (this.freeFor !== null && this.freeFor !== p.team) {
          const d = Math.hypot(target.x - ball.x, target.z - ball.z);
          if (d < 7) {
            target.x += ((target.x - ball.x) / (d || 1)) * (7 - d);
            target.z += ((target.z - ball.z) / (d || 1)) * (7 - d);
          }
        }
      }
      this.steer(p, target.x, target.z, maxSpeed, dt);
    }

    if (this.owner) {
      const p = this.owner;
      ball.x = p.x + Math.sin(p.heading) * 0.75;
      ball.z = p.z + Math.cos(p.heading) * 0.75;
      ball.y = 0;
      ball.vx = p.vx;
      ball.vz = p.vz;
      ball.vy = 0;
      this.lastTouch = p.team;

      // Top kapma
      const opp = chasers[(1 - p.team) as 0 | 1];
      if (opp && Math.hypot(opp.x - p.x, opp.z - p.z) < 1.35 && p.role !== 'gk') {
        this.tackleT += dt;
        if (this.tackleT > 0.28) {
          this.tackleT = 0;
          if (opp.cooldown <= 0) {
            if (this.rng() < 0.2) {
              p.cooldown = 1.0;
              this.owner = opp;
              this.decisionT = 0.5 + this.rng() * 0.5;
              this.note = `${this.teamName(opp.team)} topu kaptı`;
              return;
            }
            // Çalım yedi: savunmacı bir süre geride kalır
            opp.cooldown = 1.1;
          }
        }
      }

      this.decisionT -= dt;
      if (this.decisionT <= 0) {
        this.decisionT = 0.45 + this.rng() * 0.9;
        const dir = this.dirOf(p.team);
        const g = Math.hypot(this.HL * dir - p.x, p.z);
        const near = this.nearest((1 - p.team) as 0 | 1, p.x, p.z, false);
        const dn = near ? Math.hypot(near.x - p.x, near.z - p.z) : 99;
        if (p.role === 'gk') {
          this.tryPass(p, true);
        } else if (g < 31 && this.rng() < (g < 17 ? 0.9 : g < 25 ? 0.5 : 0.16)) {
          this.shoot(p);
        } else if ((dn < 3.6 && this.rng() < 0.82) || this.rng() < 0.3) {
          this.tryPass(p, false);
        }
      }
      return;
    }

    // Serbest top
    const f = Math.exp(-0.55 * dt);
    ball.vx *= f;
    ball.vz *= f;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    if (ball.y > 0 || ball.vy > 0) {
      ball.vy -= 9.8 * dt;
      ball.y += ball.vy * dt;
      if (ball.y <= 0) {
        ball.y = 0;
        ball.vy = ball.vy < -2 ? -ball.vy * 0.45 : 0;
      }
    }
    const speed = Math.hypot(ball.vx, ball.vz);

    // Top kontrolü
    for (const p of this.players) {
      if (p.cooldown > 0) continue;
      if (this.freeFor !== null && this.freeFor !== p.team) continue;
      const isKeeper = p.role === 'gk';
      if (this.shot) {
        if (this.shot.outcome !== 'save' || !isKeeper || p.team === this.shot.team) continue;
      }
      const reach = isKeeper ? 1.7 : 1.0;
      if (Math.hypot(p.x - ball.x, p.z - ball.z) > reach || ball.y > 1.9) continue;
      if (!this.shot && speed > 17 && p !== this.receiver && this.rng() > 0.35) continue;
      this.take(p);
      return;
    }

    // Saha dışı ve gol
    if (Math.abs(ball.x) > this.HL) {
      const side = Math.sign(ball.x);
      const attacking: 0 | 1 = side > 0 ? 0 : 1;
      const defending = (1 - attacking) as 0 | 1;
      if (this.shot?.outcome === 'save') {
        this.take(this.players.find((k) => k.team === defending && k.role === 'gk')!);
        return;
      }
      if (Math.abs(ball.z) < GOAL_HALF && ball.y < 2.44 && this.shot?.outcome === 'goal') {
        this.goal(attacking);
        return;
      }
      if (this.shot) this.ctx.cue({ type: 'ooh' });
      this.note = 'Kale vuruşu';
      this.placeBall(side * (this.HL - 5.5), ball.z > 0 ? 4 : -4, defending);
      return;
    }
    if (Math.abs(ball.z) > this.HW) {
      this.note = 'Taç atışı';
      this.placeBall(clamp(ball.x, -this.HL + 1, this.HL - 1), Math.sign(ball.z) * (this.HW - 0.4), (1 - this.lastTouch) as 0 | 1);
      return;
    }
    // Top kimseye ulaşmadan durduysa oyunu aç
    if (speed < 0.6) {
      this.stuckT += dt;
      if (this.stuckT > 5) {
        this.freeFor = null;
        this.receiver = null;
        this.shot = null;
      }
    } else {
      this.stuckT = 0;
    }
  }

  private take(p: Player): void {
    const wasSave = this.shot?.outcome === 'save';
    this.owner = p;
    this.shot = null;
    this.receiver = null;
    this.freeFor = null;
    this.stuckT = 0;
    this.tackleT = 0;
    this.decisionT = p.role === 'gk' ? 1.3 : 0.4 + this.rng() * 0.7;
    if (wasSave) {
      this.note = `Kaleci kurtardı (${this.teamName(p.team)})`;
      this.ctx.cue({ type: 'ooh' });
      this.ctx.cue({ type: 'applause' });
    }
  }

  private goal(team: 0 | 1): void {
    this.score[team]++;
    this.scorer = this.lastKicker;
    this.note = `GOL! ${this.teamName(team)} ${Math.max(1, Math.ceil(this.minute))}'`;
    this.mode = 'celebrate';
    this.modeT = 5.5;
    this.kickoffTeam = (1 - team) as 0 | 1;
    this.shot = null;
    this.ctx.cue({ type: 'goal', team });
  }

  private steer(p: { x: number; z: number; vx: number; vz: number; heading: number; stride: number }, tx: number, tz: number, maxSpeed: number, dt: number): void {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.min(maxSpeed, d * 2.6);
    const k = damp(5.5, dt);
    p.vx += ((d > 0.01 ? (dx / d) * sp : 0) - p.vx) * k;
    p.vz += ((d > 0.01 ? (dz / d) * sp : 0) - p.vz) * k;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const v = Math.hypot(p.vx, p.vz);
    if (v > 0.4) {
      const want = Math.atan2(p.vx, p.vz);
      let diff = want - p.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.heading += diff * damp(10, dt);
    }
    p.stride += v * dt * 2.3;
  }

  update(dt: number, liveTime: number, phase: Phase): void {
    const target = { x: 0, z: 0 };
    if (phase === 'live') {
      this.minute = (liveTime / this.duration) * 90;
      if (!this.secondHalf && this.minute >= 45 && this.mode === 'play') {
        this.secondHalf = true;
        this.mode = 'halftime';
        this.modeT = 4.5;
        this.note = 'Devre arası';
        this.owner = null;
        this.ctx.cue({ type: 'whistle' });
        this.ctx.cue({ type: 'applause' });
      }
    } else if (phase === 'finished' && this.mode !== 'ended' && this.mode !== 'idle') {
      this.mode = 'ended';
      this.owner = null;
      this.minute = 90;
      this.note = 'Maç sona erdi';
      this.ctx.cue({ type: 'whistle' });
      this.ctx.cue({ type: 'applause' });
    }

    switch (this.mode) {
      case 'play':
        this.stepPlay(dt);
        break;
      case 'kickoff':
      case 'halftime':
      case 'idle':
      case 'ended': {
        for (const p of this.players) {
          const dir = this.dirOf(p.team);
          let hx = Math.min(p.hx * 50, -1.5) * dir;
          let hz = p.hz * this.HW * 0.8;
          if (this.mode === 'kickoff' && p.team === this.kickoffTeam && p.role === 'fwd') {
            hx = -0.8 * dir;
            hz = p.hz > 0 ? 2.2 : -0.6;
          }
          this.steer(p, hx, hz, this.mode === 'kickoff' ? 8.5 : 4, dt);
        }
        if (this.mode === 'kickoff' || this.mode === 'halftime') {
          this.modeT -= dt;
          if (this.modeT <= 0) {
            if (this.mode === 'halftime') {
              this.note = 'İkinci yarı';
              this.startKickoff(1, true);
            } else {
              this.mode = 'play';
              const kicker = this.players.find((p) => p.team === this.kickoffTeam && p.role === 'fwd' && p.hz < 0)!;
              this.owner = kicker;
              this.decisionT = 0.35;
              // Santra: ilk karar pas olsun
              this.tryPass(kicker, false);
            }
          }
        }
        break;
      }
      case 'celebrate': {
        const s = this.scorer;
        this.players.forEach((p, i) => {
          if (s && p.team === s.team && p.role !== 'gk') {
            const a = i * 0.9;
            this.steer(p, s.x + Math.cos(a) * 2.2, s.z + Math.sin(a) * 2.2, 7.5, dt);
          } else {
            this.homeTarget(p, false, target);
            this.steer(p, target.x, target.z, 3.5, dt);
          }
        });
        // Top ağlarda yavaşlar
        this.ball.vx *= Math.exp(-6 * dt);
        this.ball.vz *= Math.exp(-6 * dt);
        this.ball.x = clamp(this.ball.x + this.ball.vx * dt, -this.HL - 1.7, this.HL + 1.7);
        this.ball.z += this.ball.vz * dt;
        this.ball.y = Math.max(0, this.ball.y - 3 * dt);
        this.modeT -= dt;
        if (this.modeT <= 0) this.startKickoff(this.kickoffTeam, false);
        break;
      }
    }

    // Hakem
    this.steer(this.ref, this.ball.x - 5, clamp(this.ball.z + 9, -this.HW + 2, this.HW - 2), 5.2, dt);
    this.syncMeshes(dt);
  }

  private syncMeshes(_dt: number): void {
    const celebrate = this.mode === 'celebrate' && this.scorer;
    const write = (i: number, p: { x: number; z: number; vx: number; vz: number; heading: number; stride: number }, hop: number): void => {
      this.e.set(0, p.heading, 0);
      this.q.setFromEuler(this.e);
      this.v.set(p.x, hop, p.z);
      this.m.compose(this.v, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      this.heads.setMatrixAt(i, this.m);
      const swing = Math.sin(p.stride) * clamp(Math.hypot(p.vx, p.vz) / 5, 0, 1) * 0.85;
      for (const side of [0, 1]) {
        this.e.set(side === 0 ? swing : -swing, 0, 0);
        this.m2.makeRotationFromEuler(this.e).setPosition(side === 0 ? -0.13 : 0.13, 0.76, 0);
        this.m2.premultiply(this.m);
        this.legs.setMatrixAt(i * 2 + side, this.m2);
      }
      this.m.makeScale(SCALE, 1, SCALE).setPosition(p.x, 0.09, p.z);
      this.shadows.setMatrixAt(i, this.m);
    };
    this.players.forEach((p, i) => {
      const hop = celebrate && p.team === this.scorer!.team ? Math.abs(Math.sin(this.modeT * 7 + i)) * 0.5 : 0;
      write(i, p, hop);
    });
    write(this.players.length, this.ref, 0);
    const b = this.ball;
    this.m.makeScale(0.7, 1, 0.7).setPosition(b.x, 0.09, b.z);
    this.shadows.setMatrixAt(this.players.length + 1, this.m);
    this.ballMesh.position.set(b.x, 0.36 + b.y, b.z);
    this.ballRing.position.set(b.x, 0.1, b.z);
    for (const mesh of [this.bodies, this.heads, this.legs, this.shadows]) mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Sunum ----------

  status(phase: Phase): EventStatus {
    const ev = this.venue.events.match;
    const headline = `${ev.home.short} ${this.score[0]} – ${this.score[1]} ${ev.away.short}`;
    if (phase === 'countdown') return { clock: "0'", headline, detail: 'Takımlar ısınıyor' };
    if (phase === 'finished') return { clock: "90'", headline, detail: 'Maç sona erdi' };
    return { clock: `${Math.min(90, Math.floor(this.minute) + 1)}'`, headline, detail: this.note };
  }

  houseLights(): number {
    return 1;
  }

  drawScoreboard(g: CanvasRenderingContext2D, w: number, h: number, phase: Phase): void {
    const ev = this.venue.events.match;
    const mid = w / 2;
    g.textBaseline = 'middle';
    // Takım şeritleri
    g.fillStyle = ev.home.color;
    g.fillRect(0, 0, 26, h);
    g.fillStyle = ev.away.color;
    g.fillRect(w - 26, 0, 26, h);
    g.fillStyle = '#ffffff';
    g.font = '900 64px "Arial Black", Arial, sans-serif';
    g.textAlign = 'left';
    g.fillText(ev.home.short, 60, h * 0.36);
    g.textAlign = 'right';
    g.fillText(ev.away.short, w - 60, h * 0.36);
    g.font = '700 26px Arial, sans-serif';
    g.fillStyle = '#aab4e8';
    g.fillText(ev.away.name, w - 60, h * 0.62);
    g.textAlign = 'left';
    g.fillText(ev.home.name, 60, h * 0.62);
    // Skor
    g.fillStyle = '#ffd23f';
    g.font = '900 150px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(`${this.score[0]}–${this.score[1]}`, mid, h * 0.42);
    g.font = '900 44px ui-monospace, Menlo, Consolas, monospace';
    g.fillStyle = '#ffffff';
    g.fillText(this.status(phase).clock, mid, h * 0.82);
    g.font = '700 26px Arial, sans-serif';
    g.fillStyle = '#8fd6ff';
    g.textAlign = 'left';
    g.fillText(phase === 'live' ? this.note : this.status(phase).detail, 60, h * 0.86);
  }

  unmount(): void {
    this.owner = null;
    this.scorer = null;
  }
}

const factory: EventFactory = (venue) => new MatchSource(venue);
export default factory;
