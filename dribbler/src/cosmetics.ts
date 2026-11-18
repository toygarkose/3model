import * as THREE from 'three';

export type Pattern = 'solid' | 'stripes' | 'hoops' | 'sash' | 'halves' | 'pin' | 'chest';
export interface Kit { name: string; a: string; b: string; pattern: Pattern; shorts: string; socks: string; num: string }

export const KITS: Kit[] = [
  { name: 'Kızıl Şimşek', a: '#e02b3c', b: '#ffd23f', pattern: 'sash', shorts: '#1b1b2a', socks: '#e02b3c', num: '#ffffff' },
  { name: 'Okyanus', a: '#1769e0', b: '#ffffff', pattern: 'stripes', shorts: '#ffffff', socks: '#1769e0', num: '#0b1c40' },
  { name: 'Gece Yarısı', a: '#15162b', b: '#39f0c8', pattern: 'pin', shorts: '#15162b', socks: '#39f0c8', num: '#39f0c8' },
  { name: 'Limon', a: '#f6e23a', b: '#1d8a4a', pattern: 'chest', shorts: '#1d8a4a', socks: '#f6e23a', num: '#14351f' },
  { name: 'Zümrüt', a: '#0f9d58', b: '#ffffff', pattern: 'hoops', shorts: '#ffffff', socks: '#0f9d58', num: '#0b2b1a' },
  { name: 'Mor Fırtına', a: '#6a2fd6', b: '#ff5fa2', pattern: 'halves', shorts: '#2a1457', socks: '#ff5fa2', num: '#ffffff' },
  { name: 'Klasik Beyaz', a: '#f4f4f0', b: '#c9a227', pattern: 'chest', shorts: '#f4f4f0', socks: '#f4f4f0', num: '#1b1b2a' },
  { name: 'Turuncu Alev', a: '#ff7a1a', b: '#1b1b2a', pattern: 'stripes', shorts: '#1b1b2a', socks: '#ff7a1a', num: '#ffffff' },
];

// Rakip takım formaları: oyuncunun formasına en uzak renk seçilir.
export const RIVAL_KITS: Kit[] = [
  { name: 'r1', a: '#22263a', b: '#ff4d5e', pattern: 'chest', shorts: '#22263a', socks: '#ff4d5e', num: '#ffffff' },
  { name: 'r2', a: '#f2f2ee', b: '#22263a', pattern: 'pin', shorts: '#22263a', socks: '#f2f2ee', num: '#22263a' },
  { name: 'r3', a: '#b3122b', b: '#ffffff', pattern: 'solid', shorts: '#ffffff', socks: '#b3122b', num: '#ffffff' },
];

export const BOOTS = [
  { name: 'Neon', color: '#c6ff3a', sole: '#1b1b2a' },
  { name: 'Alev', color: '#ff5a1f', sole: '#ffffff' },
  { name: 'Kar', color: '#f5f5f5', sole: '#c9a227' },
  { name: 'Altın Gece', color: '#17171f', sole: '#e8b923' },
  { name: 'Pembe', color: '#ff4fa3', sole: '#ffffff' },
  { name: 'Buz', color: '#3fd8ff', sole: '#0b1c40' },
];

export const BALLS = [
  { name: 'Klasik', base: '#fafafa', patch: '#16161d', style: 'classic' },
  { name: 'Gün Batımı', base: '#ffe14d', patch: '#e02b3c', style: 'classic' },
  { name: 'Buz', base: '#e9fbff', patch: '#1aa3d9', style: 'star' },
  { name: 'Neon', base: '#1b1b2a', patch: '#c6ff3a', style: 'star' },
  { name: 'Şampiyon', base: '#ffffff', patch: '#c9a227', style: 'rings' },
  { name: 'Lav', base: '#ff7a1a', patch: '#2a0d0d', style: 'rings' },
];

export const HAIRS = ['Kısa', 'Düz Tepe', 'Afro', 'Mohawk', 'Topuz', 'Uzun + Bant', 'Kel'];
export const HAIR_COLORS = ['#1a1412', '#4a2c17', '#b5651d', '#e8c35a', '#d9d9d9', '#e0336e', '#2bb8d6'];
export const SKINS = ['#f6d3b3', '#e6b48a', '#c98e62', '#9a6238', '#6b4226', '#472a18'];
export const NUMBERS = [7, 8, 9, 10, 11, 17, 23, 99];

export interface Loadout { kit: number; boots: number; ball: number; hair: number; hairColor: number; skin: number; number: number }
export const DEFAULT_LOADOUT: Loadout = { kit: 0, boots: 0, ball: 0, hair: 0, hairColor: 0, skin: 2, number: 10 };

const BACK_U = 0.25, FRONT_U = 0.75;

export function makeJerseyTexture(kit: Kit, num: number): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = kit.a; g.fillRect(0, 0, W, H);
  g.fillStyle = kit.b;
  switch (kit.pattern) {
    case 'stripes': for (let i = 0; i < 12; i += 2) g.fillRect((i + 0.5) * W / 12, 0, W / 12, H); break;
    case 'pin': for (let i = 0; i < 24; i++) g.fillRect(i * W / 24 + 8, 0, 3, H); break;
    case 'hoops': for (let i = 0; i < 6; i += 2) g.fillRect(0, 40 + i * 32, W, 32); break;
    case 'chest': g.fillRect(0, 78, W, 30); break;
    case 'halves': g.fillRect(FRONT_U * W, 0, W, H); g.fillRect(0, 0, BACK_U * W, H); break;
    case 'sash':
      for (const u of [BACK_U, FRONT_U]) {
        g.save(); g.beginPath(); g.rect((u - 0.25) * W, 0, W / 2, H); g.clip();
        g.translate(u * W, H / 2); g.rotate(-0.72); g.fillRect(-26, -260, 52, 520); g.restore();
      }
      break;
  }
  // yaka ve etek şeridi
  g.fillStyle = kit.b; g.fillRect(0, 0, W, 16);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, H - 10, W, 10);
  const font = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const draw = (txt: string, x: number, y: number, px: number) => {
    g.font = `800 ${px}px ${font}`;
    g.lineWidth = px * 0.14; g.strokeStyle = kit.a; g.strokeText(txt, x, y);
    g.fillStyle = kit.num; g.fillText(txt, x, y);
  };
  draw(String(num), BACK_U * W, 122, 108);
  draw(String(num), FRONT_U * W + 34, 62, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

const ICO: THREE.Vector3[] = (() => {
  const p = (1 + Math.sqrt(5)) / 2, v: THREE.Vector3[] = [];
  for (const a of [-1, 1]) for (const b of [-p, p]) { v.push(new THREE.Vector3(0, a, b), new THREE.Vector3(a, b, 0), new THREE.Vector3(b, 0, a)); }
  return v.map(x => x.normalize());
})();

export function makeBallTexture(ball: { base: string; patch: string; style: string }): THREE.CanvasTexture {
  const W = 256, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const A = new THREE.Color(ball.base), B = new THREE.Color(ball.patch);
  const d = new THREE.Vector3();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const th = (y + 0.5) / H * Math.PI, ph = (x + 0.5) / W * Math.PI * 2;
    d.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    let best = -1, second = -1;
    for (const v of ICO) { const dot = v.dot(d); if (dot > best) { second = best; best = dot; } else if (dot > second) second = dot; }
    let on = false;
    if (ball.style === 'classic') on = best > 0.93 || (best - second) < 0.012;
    else if (ball.style === 'star') on = best > 0.955 || ((best - second) < 0.05 && best > 0.86);
    else on = Math.abs(d.y) < 0.09 || Math.abs(d.x) < 0.09 || best > 0.975;
    const col = on ? B : A, i = (y * W + x) * 4;
    img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function pickRivalKit(player: Kit): Kit {
  const p = new THREE.Color(player.a);
  let best = RIVAL_KITS[0], bd = -1;
  for (const k of RIVAL_KITS) {
    const c = new THREE.Color(k.a);
    const dd = (c.r - p.r) ** 2 + (c.g - p.g) ** 2 + (c.b - p.b) ** 2;
    if (dd > bd) { bd = dd; best = k; }
  }
  return best;
}
