import * as THREE from 'three';
import { Kit, makeJerseyTexture } from './cosmetics';

/** Eklem açıları. İleri = pozitif, dışa açma = pozitif. roll: dünya +X yönüne yatış. */
export interface Pose {
  y: number; g: number; pitch: number; roll: number; yaw: number;
  spine: number; twist: number; head: number;
  thL: number; thR: number; abL: number; abR: number; knL: number; knR: number;
  shL: number; shR: number; saL: number; saR: number; elL: number; elR: number;
}
const KEYS: (keyof Pose)[] = ['y', 'g', 'pitch', 'roll', 'yaw', 'spine', 'twist', 'head', 'thL', 'thR', 'abL', 'abR', 'knL', 'knR', 'shL', 'shR', 'saL', 'saR', 'elL', 'elR'];

export function pose(p: Partial<Pose> = {}): Pose {
  return { y: 0, g: 1, pitch: 0, roll: 0, yaw: 0, spine: 0, twist: 0, head: 0, thL: 0, thR: 0, abL: 0.04, abR: 0.04, knL: 0, knR: 0, shL: 0, shR: 0, saL: 0.12, saR: 0.12, elL: 0.3, elR: 0.3, ...p };
}

export function runPose(phase: number, amp = 1, lean = 0.2): Pose {
  const s = Math.sin(phase), c = Math.cos(phase);
  return pose({
    pitch: lean, twist: 0.18 * s * amp,
    thL: 0.12 + 0.82 * s * amp, thR: 0.12 - 0.82 * s * amp,
    knL: 0.18 + 1.25 * Math.max(0, c) * amp, knR: 0.18 + 1.25 * Math.max(0, -c) * amp,
    shL: -0.85 * s * amp, shR: 0.85 * s * amp, elL: 1.45, elR: 1.45, saL: 0.16, saR: 0.16,
  });
}

/** Savunma duruşu: dizler kırık, kollar açık, yan adımlarla bekler. */
export function jockeyPose(t: number, side = 0): Pose {
  const w = Math.sin(t * 9);
  return pose({
    pitch: 0.28, roll: side * 0.12, thL: 0.55, thR: 0.55, knL: 0.95, knR: 0.95,
    abL: 0.32 + 0.1 * w, abR: 0.32 - 0.1 * w,
    saL: 0.95, saR: 0.95, shL: 0.25, shR: 0.25, elL: 0.55, elR: 0.55, head: -0.15,
  });
}

export function slidePose(): Pose {
  return pose({ g: 0, y: -0.64, pitch: -1.12, thL: 0.42, knL: 0.05, thR: 1.0, knR: 1.7, abL: 0.1, shL: -1.0, saL: 0.5, elL: 0.3, shR: 1.2, saR: 0.7, elR: 0.6, head: 0.5 });
}
export function sitFallPose(t: number): Pose {
  const k = Math.min(1, t / 0.35);
  return pose({ g: 0, y: -0.66 * k, pitch: -1.25 * k, thL: 1.3 - 0.3 * k, thR: 0.9, knL: 0.5, knR: 1.1 * k, abL: 0.4, abR: 0.35, shL: -0.9, shR: -0.7, saL: 1.0, saR: 1.2, elL: 0.2, elR: 0.3, head: 0.5 });
}
export function diveFallPose(t: number): Pose {
  const k = Math.min(1, t / 0.3);
  return pose({ g: 0, y: -0.68 * k, pitch: 1.45 * k, thL: -0.1, thR: 0.25, knL: 0.2, knR: 0.5, shL: 2.7, shR: 2.4, saL: 0.3, saR: 0.4, elL: 0.2, elR: 0.3, head: -0.5 });
}
export function sideFallPose(t: number, dir: number): Pose {
  const k = Math.min(1, t / 0.4);
  return pose({ g: 0, y: -0.6 * k, roll: dir * 1.4 * k, pitch: 0.2, thL: 0.5, thR: -0.2, knL: 0.9, knR: 0.5, abL: 0.5, abR: 0.2, shL: 1.6, shR: 0.6, saL: 1.2, saR: 1.3, elL: 0.4, elR: 0.6 });
}

const SEG = 14;
const G = {
  thigh: new THREE.CapsuleGeometry(0.082, 0.26, 4, SEG),
  shortLeg: new THREE.CylinderGeometry(0.108, 0.1, 0.2, SEG),
  shin: new THREE.CapsuleGeometry(0.066, 0.27, 4, SEG),
  knee: new THREE.SphereGeometry(0.075, SEG, 10),
  boot: new THREE.CapsuleGeometry(0.062, 0.15, 4, SEG),
  sole: new THREE.BoxGeometry(0.11, 0.025, 0.25),
  upArm: new THREE.CapsuleGeometry(0.055, 0.18, 4, SEG),
  sleeve: new THREE.CapsuleGeometry(0.07, 0.1, 4, SEG),
  foreArm: new THREE.CapsuleGeometry(0.048, 0.17, 4, SEG),
  hand: new THREE.SphereGeometry(0.056, SEG, 10),
  pelvis: new THREE.SphereGeometry(0.2, 18, 12),
  neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, SEG),
  head: new THREE.SphereGeometry(0.155, 24, 18),
  eye: new THREE.SphereGeometry(0.02, 8, 8),
  torso: (() => {
    const keys: [number, number][] = [[0, 0.155], [0.12, 0.165], [0.26, 0.19], [0.38, 0.215], [0.46, 0.21], [0.51, 0.17], [0.55, 0.1], [0.575, 0.055]];
    const pts: THREE.Vector2[] = [];
    const N = 18, H = 0.575;
    for (let i = 0; i <= N; i++) {
      const y = (i / N) * H;
      let j = 0; while (j < keys.length - 2 && keys[j + 1][0] < y) j++;
      const [y0, r0] = keys[j], [y1, r1] = keys[j + 1];
      const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
      const kk = k * k * (3 - 2 * k);
      pts.push(new THREE.Vector2(r0 + (r1 - r0) * kk, y));
    }
    return new THREE.LatheGeometry(pts, 28, Math.PI / 2, Math.PI * 2);
  })(),
};
const THIGH = 0.42, SHIN = 0.42, FOOT = 0.085, HIP = THIGH + SHIN + FOOT;

export interface Look { kit: Kit; number: number; boot: { color: string; sole: string }; hair: number; hairColor: string; skin: string }

function mat(color: string | number, rough = 0.75) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }); }

export class Footballer {
  root = new THREE.Group();
  private body = new THREE.Group();
  private spine = new THREE.Group();
  private headG = new THREE.Group();
  private hairG = new THREE.Group();
  private hip: THREE.Group[] = []; private knee: THREE.Group[] = [];
  private sh: THREE.Group[] = []; private el: THREE.Group[] = [];
  private mSkin = mat('#c98e62', 0.8); private mJersey = mat('#ffffff', 0.85); private mSleeve = mat('#fff', 0.85);
  private mShorts = mat('#222', 0.85); private mSock = mat('#fff', 0.9); private mBoot = mat('#fff', 0.4); private mSole = mat('#222', 0.6);
  private mHair = mat('#1a1412', 0.95);
  cur: Pose = pose();
  /** true: kameraya sırtı dönük (oyuncu). roll işaretini belirler. */
  away = false;
  baseYaw = 0;

  constructor(look: Look, scale = 1) {
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o;
    };
    this.root.add(this.body);
    this.root.scale.setScalar(scale);
    const pel = add(this.body, G.pelvis, this.mShorts, 0, 0.02, 0); pel.scale.set(1.02, 0.72, 0.78);
    this.spine.position.y = 0.04; this.body.add(this.spine);
    const torso = add(this.spine, G.torso, this.mJersey, 0, 0, 0); torso.scale.set(1.12, 1, 0.72);
    add(this.spine, G.neck, this.mSkin, 0, 0.6, 0);
    this.headG.position.set(0, 0.76, 0.01); this.spine.add(this.headG);
    const head = add(this.headG, G.head, this.mSkin); head.scale.set(0.94, 1.06, 1);
    const eyeM = mat('#14141c', 0.3);
    add(this.headG, G.eye, eyeM, 0.055, 0.015, 0.138); add(this.headG, G.eye, eyeM, -0.055, 0.015, 0.138);
    this.headG.add(this.hairG);
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(0.255 * s, 0.47, 0); this.spine.add(sh); this.sh.push(sh);
      add(sh, G.sleeve, this.mSleeve, 0, -0.07, 0);
      add(sh, G.upArm, this.mSkin, 0, -0.15, 0);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el); this.el.push(el);
      add(el, G.foreArm, this.mSkin, 0, -0.12, 0); add(el, G.hand, this.mSkin, 0, -0.27, 0);
      const hip = new THREE.Group(); hip.position.set(0.105 * s, -0.02, 0); this.body.add(hip); this.hip.push(hip);
      add(hip, G.thigh, this.mSkin, 0, -0.2, 0); add(hip, G.shortLeg, this.mShorts, 0, -0.1, 0);
      const kn = new THREE.Group(); kn.position.y = -THIGH; hip.add(kn); this.knee.push(kn);
      add(kn, G.knee, this.mSkin); add(kn, G.shin, this.mSock, 0, -0.21, 0);
      const boot = add(kn, G.boot, this.mBoot, 0, -SHIN - 0.015, 0.06); boot.rotation.x = Math.PI / 2; boot.scale.set(1, 1, 0.82);
      add(kn, G.sole, this.mSole, 0, -SHIN - 0.065, 0.06);
    }
    this.setLook(look);
  }

  setLook(l: Look) {
    this.mSkin.color.set(l.skin);
    const old = this.mJersey.map; this.mJersey.map = makeJerseyTexture(l.kit, l.number); this.mJersey.needsUpdate = true; old?.dispose();
    this.mSleeve.color.set(l.kit.pattern === 'halves' || l.kit.pattern === 'chest' ? l.kit.b : l.kit.a);
    this.mShorts.color.set(l.kit.shorts); this.mSock.color.set(l.kit.socks);
    this.mBoot.color.set(l.boot.color); this.mSole.color.set(l.boot.sole);
    this.mHair.color.set(l.hairColor);
    this.buildHair(l.hair);
  }

  private buildHair(style: number) {
    for (const c of [...this.hairG.children]) { this.hairG.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const m = this.mHair;
    const part = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; this.hairG.add(o); return o;
    };
    const cap = (r = 0.164, cover = 0.52) => { const o = part(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * cover), 0, 0.012, -0.02, 0.96, 1.06, 1.02); o.rotation.x = -0.28; return o; };
    switch (style) {
      case 0: cap(); break;
      case 1: cap(0.162, 0.46); part(new THREE.CylinderGeometry(0.125, 0.135, 0.075, 18), 0, 0.165, -0.01); break;
      case 2: part(new THREE.SphereGeometry(0.215, 20, 16), 0, 0.075, -0.035, 1, 0.95, 1); break;
      case 3: cap(0.159, 0.44); part(new THREE.BoxGeometry(0.055, 0.1, 0.3), 0, 0.17, -0.03); break;
      case 4: cap(); part(new THREE.SphereGeometry(0.075, 14, 10), 0, 0.15, -0.14); break;
      case 5: {
        cap(0.166, 0.5); part(new THREE.SphereGeometry(0.15, 16, 12), 0, -0.07, -0.085, 1.0, 1.25, 0.7);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.153, 0.016, 8, 28), mat('#ffffff', 0.6)); band.rotation.x = Math.PI / 2 - 0.2; band.position.y = 0.07; band.scale.set(0.95, 1, 1); this.hairG.add(band);
        break;
      }
    }
  }

  /** Hedef poza yumuşak geçiş. rate büyüdükçe daha sert. */
  setPose(target: Pose, dt: number, rate = 22) {
    const k = dt <= 0 ? 1 : 1 - Math.exp(-rate * dt);
    const c = this.cur;
    for (const key of KEYS) c[key] += (target[key] - c[key]) * k;
    const ext = (th: number, kn: number, ab: number) => THIGH * Math.cos(th) * Math.cos(ab) + SHIN * Math.cos(th - kn) * Math.cos(ab);
    const grounded = Math.max(ext(c.thL, c.knL, c.abL), ext(c.thR, c.knR, c.abR)) + FOOT;
    this.body.position.y = c.g * grounded + (1 - c.g) * HIP + c.y;
    this.body.rotation.set(c.pitch, 0, c.roll * (this.away ? 1 : -1), 'YXZ');
    this.root.rotation.y = this.baseYaw + c.yaw;
    this.spine.rotation.set(c.spine, c.twist, 0);
    this.headG.rotation.x = c.head;
    this.hip[0].rotation.set(-c.thL, 0, c.abL); this.hip[1].rotation.set(-c.thR, 0, -c.abR);
    this.knee[0].rotation.x = c.knL; this.knee[1].rotation.x = c.knR;
    this.sh[0].rotation.set(-c.shL, 0, c.saL); this.sh[1].rotation.set(-c.shR, 0, -c.saR);
    this.el[0].rotation.x = -c.elL; this.el[1].rotation.x = -c.elR;
  }
}
