import * as THREE from 'three';
import { numberTexture } from './textures.js';

// Procedural footballer with a joint hierarchy for procedural animation.
// Model faces +z. Heights in metres (about 1.78 m tall).

const G = {};      // shared geometries
function geo(key, make) { return G[key] || (G[key] = make()); }
const M = {};      // shared materials
function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  return M[key] || (M[key] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.78, metalness: 0.02, ...opts }));
}

export const SKIN_TONES = [0xf2c9a5, 0xd9a47c, 0xb57a52, 0x8a5634, 0x5e3a22];
export const HAIR_COLORS = [0x1b1410, 0x4a2c17, 0x8a5a2b, 0xd8b26a, 0xe8e4dc];

function limbMesh(len, r, material) {
  const g = geo(`cap${len}_${r}`, () => new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10));
  const m = new THREE.Mesh(g, material);
  m.position.y = -len / 2;
  m.castShadow = true;
  return m;
}

function pivot(parent, x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

export function buildPlayer(look) {
  const root = new THREE.Group();
  const body = new THREE.Group();     // receives dive roll / jumps
  root.add(body);
  const j = {};
  const kit = look.kit;
  const shirtM = mat(kit.shirt), sleeveM = mat(kit.sleeve), shortsM = mat(kit.shorts), socksM = mat(kit.socks);
  const skinM = mat(look.skin ?? SKIN_TONES[1], { roughness: 0.65 });
  const bootM = mat(look.boots ?? 0x111111, { roughness: 0.4, metalness: 0.15 });
  const gloveM = mat(0xf0f0f0, { roughness: 0.6 });

  j.hips = pivot(body, 0, 0.93, 0);
  const shorts = new THREE.Mesh(geo('shorts', () => new THREE.CylinderGeometry(0.19, 0.2, 0.24, 12)), shortsM);
  shorts.position.y = -0.06; shorts.scale.z = 0.75; shorts.castShadow = true;
  j.hips.add(shorts);

  j.spine = pivot(j.hips, 0, 0.04, 0);
  const torso = new THREE.Mesh(geo('torso', () => new THREE.CapsuleGeometry(0.17, 0.26, 4, 12)), shirtM);
  torso.position.y = 0.26; torso.scale.set(1.28, 1, 0.74); torso.castShadow = true;
  j.spine.add(torso);
  j.torso = torso;

  j.neck = pivot(j.spine, 0, 0.53, 0);
  const neck = new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8)), skinM);
  neck.position.y = 0.03; j.neck.add(neck);
  j.head = pivot(j.neck, 0, 0.16, 0);
  const head = new THREE.Mesh(geo('head', () => new THREE.SphereGeometry(0.12, 16, 12)), skinM);
  head.scale.set(0.95, 1.08, 1); head.castShadow = true;
  j.head.add(head);
  const eyeG = geo('eye', () => new THREE.SphereGeometry(0.014, 6, 4));
  const eyeM = mat(0x161616);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(eyeG, eyeM); e.position.set(sx * 0.042, 0.015, 0.108); j.head.add(e); }

  // arms
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const sh = pivot(j.spine, sx * 0.22, 0.45, 0);
    const sleeve = limbMesh(0.17, 0.062, look.keeper ? shirtM : sleeveM);
    sh.add(sleeve);
    const upper = limbMesh(0.28, 0.05, look.keeper ? shirtM : skinM);
    sh.add(upper);
    const el = pivot(sh, 0, -0.28, 0);
    el.add(limbMesh(0.25, 0.045, look.keeper ? shirtM : skinM));
    const hand = new THREE.Mesh(geo(look.keeper ? 'glove' : 'hand', () => new THREE.SphereGeometry(look.keeper ? 0.07 : 0.05, 8, 6)), look.keeper ? gloveM : skinM);
    hand.position.y = -0.27; hand.castShadow = true;
    el.add(hand);
    j[side + 'Sh'] = sh; j[side + 'El'] = el; j[side + 'Upper'] = upper; j[side + 'Hand'] = hand;
  }
  // legs
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const hip = pivot(j.hips, sx * 0.1, -0.02, 0);
    const shortLeg = limbMesh(0.2, 0.088, shortsM);
    hip.add(shortLeg);
    hip.add(limbMesh(0.44, 0.072, skinM));
    const knee = pivot(hip, 0, -0.44, 0);
    knee.add(limbMesh(0.44, 0.062, socksM));
    const boot = new THREE.Mesh(geo('boot', () => { const b = new THREE.BoxGeometry(0.1, 0.075, 0.25); b.translate(0, 0, 0.05); return b; }), bootM);
    boot.position.y = -0.43; boot.castShadow = true;
    knee.add(boot);
    j[side + 'Hip'] = hip; j[side + 'Knee'] = knee; j[side + 'Boot'] = boot;
  }

  // shirt number on the back
  const num = new THREE.Mesh(geo('numPlane', () => new THREE.PlaneGeometry(0.26, 0.26)),
    new THREE.MeshBasicMaterial({ map: numberTexture(look.number ?? 0, '#' + (kit.number ?? 0xffffff).toString(16).padStart(6, '0'), look.backName || ''), transparent: true }));
  num.position.set(0, 0.3, -0.135); num.rotation.y = Math.PI;
  j.spine.add(num);

  const model = { root, body, j, look, parts: { shirtM, sleeveM, shortsM, socksM, skinM, bootM }, hair: null, extras: [] };
  setHair(model, look.hair ?? 'short', look.hairColor ?? HAIR_COLORS[0]);
  setAccessory(model, look.accessory ?? 'none');
  return model;
}

export function setHair(model, style, color) {
  const head = model.j.head;
  if (model.hair) head.remove(model.hair);
  const m = mat(color, { roughness: 0.9 });
  const g = new THREE.Group();
  const cap = (r, thetaLen = Math.PI * 0.55) => new THREE.Mesh(geo(`hcap${r}_${thetaLen}`, () => new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, thetaLen)), m);
  switch (style) {
    case 'buzz': { const c = cap(0.124, Math.PI * 0.5); c.position.y = 0.012; g.add(c); break; }
    case 'curls': {
      const c = cap(0.128); c.position.y = 0.01; g.add(c);
      const bump = geo('curl', () => new THREE.SphereGeometry(0.05, 8, 6));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, r = i % 2 ? 0.085 : 0.05;
        const b = new THREE.Mesh(bump, m); b.position.set(Math.cos(a) * r, 0.1 + (i % 2 ? 0 : 0.03), Math.sin(a) * r - 0.01); g.add(b);
      }
      break;
    }
    case 'mohawk': {
      const c = cap(0.122, Math.PI * 0.45); g.add(c);
      const strip = new THREE.Mesh(geo('mohawk', () => new THREE.BoxGeometry(0.045, 0.09, 0.22)), m);
      strip.position.set(0, 0.13, -0.01); g.add(strip);
      break;
    }
    case 'bun': {
      const c = cap(0.13); c.position.y = 0.01; g.add(c);
      const b = new THREE.Mesh(geo('bun', () => new THREE.SphereGeometry(0.06, 10, 8)), m);
      b.position.set(0, 0.13, -0.07); g.add(b);
      break;
    }
    case 'long': {
      const c = cap(0.132); c.position.y = 0.01; g.add(c);
      const back = new THREE.Mesh(geo('longhair', () => new THREE.BoxGeometry(0.2, 0.22, 0.06)), m);
      back.position.set(0, -0.06, -0.1); g.add(back);
      break;
    }
    case 'bald': break;
    default: { const c = cap(0.13); c.position.set(0, 0.012, -0.005); c.rotation.x = -0.12; g.add(c); }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  head.add(g);
  model.hair = g;
}

export function setAccessory(model, kind) {
  for (const e of model.extras) e.parent?.remove(e);
  model.extras = [];
  const add = (parent, mesh) => { parent.add(mesh); model.extras.push(mesh); };
  if (kind === 'headband') {
    const t = new THREE.Mesh(geo('band', () => new THREE.TorusGeometry(0.122, 0.018, 6, 20)), mat(0xffffff));
    t.rotation.x = Math.PI / 2 - 0.15; t.position.y = 0.04; add(model.j.head, t);
  } else if (kind === 'wristbands') {
    for (const s of ['l', 'r']) {
      const w = new THREE.Mesh(geo('wrist', () => new THREE.CylinderGeometry(0.052, 0.052, 0.06, 10)), mat(0xffb020));
      w.position.y = -0.2; add(model.j[s + 'El'], w);
    }
  } else if (kind === 'armband') {
    const w = new THREE.Mesh(geo('arm', () => new THREE.CylinderGeometry(0.066, 0.066, 0.06, 10)), mat(0xffb020, { emissive: 0x332000 }));
    w.position.y = -0.1; add(model.j.lSh, w);
  }
}

export function setBoots(model, hex) {
  const m = mat(hex, { roughness: 0.4, metalness: 0.15 });
  model.j.lBoot.material = m;
  model.j.rBoot.material = m;
}

export function setSkin(model, hex) {
  const m = mat(hex, { roughness: 0.65 });
  model.root.traverse(o => { if (o.isMesh && o.material === model.parts.skinM) o.material = m; });
  model.parts.skinM = m;
}

export function setKit(model, kit) {
  const swap = (from, to) => model.root.traverse(o => { if (o.isMesh && o.material === from) o.material = to; });
  const p = model.parts;
  const n = { shirtM: mat(kit.shirt), sleeveM: mat(kit.sleeve), shortsM: mat(kit.shorts), socksM: mat(kit.socks) };
  for (const k of Object.keys(n)) { swap(p[k], n[k]); p[k] = n[k]; }
}
