import * as THREE from 'three';
import type { VenueConfig } from '../config/venue';
import { ovalRadius } from '../core/oval';
import { mulberry32 } from '../core/rng';
import type { Quality } from '../core/store';
import { outerOffset, type SeatData } from '../data/seats';
import { canvasTexture, disposeTree } from './setup';

export interface Scoreboard {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

export interface Stadium {
  group: THREE.Group;
  /** Koltuk seçimini perdeleyen opak yapılar (cephe, skorbord, direkler). */
  occluders: THREE.Object3D[];
  scoreboard: Scoreboard;
  /** Stadyum ışık seviyesi: 1 = maç aydınlatması, ~0.3 = konser karanlığı. */
  setHouseLights(level: number): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

/** İki oval (iç ofset d0, yükseklik y0 → d1, y1) arasında şerit geometri. */
function ringStrip(
  venue: VenueConfig,
  d0: number,
  y0: number,
  d1: number,
  y1: number,
  segs: number,
  uRepeat = 1,
): THREE.BufferGeometry {
  const { a, b, exponent: n } = venue.bowl;
  const pos = new Float32Array((segs + 1) * 6);
  const uv = new Float32Array((segs + 1) * 4);
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const th = (i / segs) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const r0 = ovalRadius(a + d0, b + d0, n, th);
    const r1 = ovalRadius(a + d1, b + d1, n, th);
    pos.set([c * r0, y0, s * r0, c * r1, y1, s * r1], i * 6);
    uv.set([(i / segs) * uRepeat, 0, (i / segs) * uRepeat, 1], i * 4);
    if (i < segs) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ovalPoint(venue: VenueConfig, d: number, theta: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  const { a, b, exponent: n } = venue.bowl;
  const r = ovalRadius(a + d, b + d, n, theta);
  return out.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
}

function drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number, L: number, W: number, margin: number): void {
  const s = w / (L + margin * 2);
  ctx.fillStyle = '#1f6b3a';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  // Biçme şeritleri
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2f8f4a' : '#27803f';
    ctx.fillRect(-L / 2 + (i * L) / stripes, -W / 2, L / stripes + 0.02, W);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 0.22;
  ctx.strokeRect(-L / 2, -W / 2, L, W);
  ctx.beginPath();
  ctx.moveTo(0, -W / 2);
  ctx.lineTo(0, W / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 9.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 0.4, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.strokeRect(-L / 2, -20.16, 16.5, 40.32);
    ctx.strokeRect(-L / 2, -9.16, 5.5, 18.32);
    ctx.beginPath();
    ctx.arc(-L / 2 + 11, 0, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-L / 2 + 11, 0, 9.15, -0.925, 0.925);
    ctx.stroke();
    for (const c of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-L / 2, (c * W) / 2, 1, c > 0 ? -Math.PI / 2 : 0, c > 0 ? 0 : Math.PI / 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  // Hafif doku gürültüsü
  const rng = mulberry32(7);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rng() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(rng() * w, rng() * h, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function ledText(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const tex = canvasTexture(2048, 64, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = '900 40px "Arial Black", "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    let x = 20;
    while (x < w - 200) {
      ctx.fillText(text, x, h / 2 + 2);
      x += ctx.measureText(text).width + 70;
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

const BEAM_VS = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying float vH;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vH = uv.y;
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FS = /* glsl */ `
uniform vec3 uColor; uniform float uIntensity;
varying vec3 vN; varying vec3 vV; varying float vH;
void main() {
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float fall = mix(0.035, 0.6, pow(vH, 2.2));
  gl_FragColor = vec4(uColor * rim * fall * uIntensity, 1.0);
}`;

/** Hacimli ışık hüzmesi (toplamalı koni). */
export function createBeam(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radiusFar: number,
  color: THREE.ColorRepresentation,
  intensity: number,
  radiusNear = 1.2,
): THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial> {
  const len = from.distanceTo(to);
  const geo = new THREE.CylinderGeometry(radiusNear, radiusFar, len, 28, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VS,
    fragmentShader: BEAM_FS,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  mesh.renderOrder = 5;
  return mesh;
}

export function buildStadium(venue: VenueConfig, seats: SeatData, quality: Quality): Stadium {
  const group = new THREE.Group();
  group.name = 'stadium';
  const occluders: THREE.Object3D[] = [];
  const segs = quality === 'low' ? 96 : 160;
  const tiers = seats.tiers;
  const outer = outerOffset(venue, tiers);
  const H = venue.facade.height;
  const { length: L, width: W } = venue.field;
  const animated: Array<(dt: number, time: number) => void> = [];

  // ---- Gökyüzü, zemin, şehir ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3800, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'varying vec3 vP; void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); vec3 c = mix(vec3(0.085,0.12,0.33), vec3(0.02,0.028,0.10), pow(h, 0.55)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  sky.renderOrder = -10;
  group.add(sky);

  const rng = mulberry32(venue.seed ^ 0x51ed);
  const starPos: number[] = [];
  for (let i = 0; i < 700; i++) {
    const u = rng() * Math.PI * 2;
    const v = Math.asin(0.08 + rng() * 0.92);
    starPos.push(Math.cos(u) * Math.cos(v) * 3500, Math.sin(v) * 3500, Math.sin(u) * Math.cos(v) * 3500);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  group.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xcfd9ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }),
    ),
  );

  const groundTex = canvasTexture(512, 512, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#1c2658');
    g.addColorStop(0.07, '#121a40');
    g.addColorStop(0.2, '#0a0f2b');
    g.addColorStop(1, '#070b22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 48), new THREE.MeshBasicMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  group.add(ground);

  // Meydan halkası
  const plaza = new THREE.Mesh(
    ringStrip(venue, outer, -0.1, outer + 26, -0.1, segs),
    new THREE.MeshBasicMaterial({ color: 0x1b2552 }),
  );
  group.add(plaza);
  const lampPos: number[] = [];
  for (let i = 0; i < 72; i++) {
    const p = ovalPoint(venue, outer + 24, (i / 72) * Math.PI * 2, 5);
    lampPos.push(p.x, p.y, p.z);
  }
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  group.add(new THREE.Points(lampGeo, new THREE.PointsMaterial({ color: 0xffd79a, size: 3.2, sizeAttenuation: true })));

  // Uzak şehir silüeti
  const cityCount = quality === 'low' ? 90 : 190;
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), cityCount);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const winPos: number[] = [];
  for (let i = 0; i < cityCount; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 460 + rng() * 1000;
    const w = 24 + rng() * 46;
    const dpt = 24 + rng() * 46;
    const h = 18 + rng() * rng() * 150;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    m4.makeScale(w, h, dpt).setPosition(x, h / 2, z);
    city.setMatrixAt(i, m4);
    city.setColorAt(i, col.setHSL(0.63 + rng() * 0.04, 0.55, 0.012 + rng() * 0.022));
    const wins = 6 + Math.floor(rng() * 14);
    for (let k = 0; k < wins; k++) {
      // Pencereler stadyuma bakan yüzde
      const fx = x - Math.cos(ang) * (dpt / 2 + 0.6) + -Math.sin(ang) * (rng() - 0.5) * w * 0.8;
      const fz = z - Math.sin(ang) * (dpt / 2 + 0.6) + Math.cos(ang) * (rng() - 0.5) * w * 0.8;
      winPos.push(fx, 4 + rng() * (h - 6), fz);
    }
  }
  group.add(city);
  const winGeo = new THREE.BufferGeometry();
  winGeo.setAttribute('position', new THREE.Float32BufferAttribute(winPos, 3));
  group.add(new THREE.Points(winGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 4.5, sizeAttenuation: true, transparent: true, opacity: 0.85 })));

  // ---- Saha ----
  const margin = 5;
  const pitchTex = canvasTexture(2048, Math.round((2048 * (W + margin * 2)) / (L + margin * 2)), (ctx, w, h) =>
    drawPitch(ctx, w, h, L, W, margin),
  );
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(L + margin * 2, W + margin * 2),
    new THREE.MeshLambertMaterial({ map: pitchTex }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.05;
  group.add(pitch);

  // Saha çevresi (oval taban)
  const apronShape = new THREE.Shape();
  for (let i = 0; i <= 96; i++) {
    const p = ovalPoint(venue, 0.2, (i / 96) * Math.PI * 2, 0);
    if (i === 0) apronShape.moveTo(p.x, -p.z);
    else apronShape.lineTo(p.x, -p.z);
  }
  const apron = new THREE.Mesh(new THREE.ShapeGeometry(apronShape), new THREE.MeshLambertMaterial({ color: 0x1a4a36 }));
  apron.rotation.x = -Math.PI / 2;
  group.add(apron);

  // LED reklam panoları
  const adTex = ledText('SEYİR  ·  KOLTUĞUNU SEÇ  ·  ORADAN İZLE  ·', '#0b1030', '#ffd23f');
  adTex.repeat.set(2, 1);
  const adMat = new THREE.MeshBasicMaterial({ map: adTex });
  const adOff = 3.0;
  const adH = 0.75;
  const adDefs: Array<[number, number, number, number]> = [
    [0, -(W / 2 + adOff), L * 0.86, 0],
    [0, W / 2 + adOff, L * 0.86, Math.PI],
    [-(L / 2 + adOff + 1.5), 0, W * 0.5, Math.PI / 2],
    [L / 2 + adOff + 1.5, 0, W * 0.5, -Math.PI / 2],
  ];
  for (const [x, z, len, rot] of adDefs) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(len, adH, 0.25), adMat);
    board.position.set(x, adH / 2, z);
    board.rotation.y = rot;
    group.add(board);
  }
  animated.push((dt) => {
    adTex.offset.x = (adTex.offset.x + dt * 0.02) % 1;
  });

  // ---- Tribün betonu: basamaklı ----
  const concrete = new THREE.MeshLambertMaterial({ color: 0x2a3252, side: THREE.DoubleSide });
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x1d2444, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x343d63, side: THREE.DoubleSide });
  const ribbonTex = ledText(`${venue.name.toLocaleUpperCase('tr')}  ·  HOŞ GELDİN  ·  SEYİR  ·`, '#101a4a', '#8fd6ff');
  ribbonTex.repeat.set(6, 1);
  const ribbonMat = new THREE.MeshBasicMaterial({ map: ribbonTex, side: THREE.DoubleSide });
  animated.push((dt) => {
    ribbonTex.offset.x = (ribbonTex.offset.x - dt * 0.012 + 1) % 1;
  });

  const rowSegs = quality === 'low' ? 72 : 120;
  tiers.forEach((tier, ti) => {
    const cfg = tier.config;
    const parts: THREE.BufferGeometry[] = [];
    for (let r = 0; r < cfg.rows; r++) {
      const d = tier.d0 + r * cfg.rowDepth;
      const y = tier.y0 + r * cfg.rowRise;
      parts.push(ringStrip(venue, d, y, d + cfg.rowDepth, y, rowSegs));
      if (r > 0) parts.push(ringStrip(venue, d, y - cfg.rowRise, d, y, rowSegs));
    }
    const steps = mergeSimple(parts);
    parts.forEach((p) => p.dispose());
    group.add(new THREE.Mesh(steps, concrete));

    // Ön parapet / alın
    const prevTop = ti === 0 ? 0 : tiers[ti - 1].y1;
    const frontD = tier.d0 - 0.25;
    group.add(new THREE.Mesh(ringStrip(venue, frontD, prevTop, frontD, tier.y0 + 0.55, segs), wallMat));
    if (ti > 0) {
      // Kat alnında LED şerit ve alt kat ile arasındaki koridor zemini
      const ribbon = new THREE.Mesh(ringStrip(venue, frontD - 0.06, tier.y0 - 1.3, frontD - 0.06, tier.y0 + 0.2, segs, 1), ribbonMat);
      group.add(ribbon);
      group.add(new THREE.Mesh(ringStrip(venue, tiers[ti - 1].d1, prevTop, frontD, prevTop, segs), floorMat));
    }
  });
  const top = tiers[tiers.length - 1];
  // Üst katın arkası, üst platform
  group.add(new THREE.Mesh(ringStrip(venue, top.d1, top.y1, top.d1, top.y1 + 2.2, segs), wallMat));
  group.add(new THREE.Mesh(ringStrip(venue, top.d1, top.y1 + 2.2, outer, H, segs), floorMat));

  // ---- Dış cephe: ışıklı pencereler ----
  const facadeTex = canvasTexture(2048, 512, (ctx, w, h) => {
    ctx.fillStyle = '#0d1433';
    ctx.fillRect(0, 0, w, h);
    const r2 = mulberry32(venue.seed ^ 0xfaca);
    const cols = 64;
    const rows = 9;
    const cw = w / cols;
    const ch = (h - 60) / rows;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const v = r2();
        ctx.fillStyle = v < 0.42 ? '#ffd98a' : v < 0.6 ? '#a8d4ff' : v < 0.68 ? '#fff3cf' : '#18214a';
        ctx.fillRect(cx * cw + cw * 0.2, 16 + cy * ch + ch * 0.22, cw * 0.6, ch * 0.56);
      }
      ctx.fillStyle = '#070b20';
      ctx.fillRect(cx * cw - 2, 0, 4, h);
    }
    // Zemin kat girişleri ve üst bant
    ctx.fillStyle = '#ffe9a8';
    for (let cx = 0; cx < cols; cx += 4) ctx.fillRect(cx * cw + cw * 0.5, h - 44, cw * 2, 44);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, 0, w, 7);
  });
  facadeTex.wrapS = THREE.RepeatWrapping;
  facadeTex.repeat.set(4, 1);
  const facadeGeo = ringStrip(venue, outer, 0, outer, H, segs, 1);
  const facade = new THREE.Mesh(facadeGeo, new THREE.MeshBasicMaterial({ map: facadeTex, side: THREE.DoubleSide }));
  group.add(facade);
  occluders.push(facade);

  // ---- Yarı saydam çatı ve kenar ışıkları ----
  const roofIn = outer - 12;
  const roof = new THREE.Mesh(
    ringStrip(venue, outer + 1.5, H + 1.5, roofIn, H + 6.5, segs),
    new THREE.MeshBasicMaterial({ color: 0x9db8ff, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  roof.renderOrder = 3;
  group.add(roof);
  const trussPos: number[] = [];
  const rimPos: number[] = [];
  const spokes = 64;
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  for (let i = 0; i < spokes; i++) {
    const th = (i / spokes) * Math.PI * 2;
    ovalPoint(venue, outer + 1.5, th, H + 1.5, p0);
    ovalPoint(venue, roofIn, th, H + 6.5, p1);
    trussPos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    trussPos.push(p0.x, p0.y, p0.z, p0.x, H - 1, p0.z);
    const th2 = ((i + 1) / spokes) * Math.PI * 2;
    ovalPoint(venue, roofIn, th2, H + 6.5, p0);
    trussPos.push(p1.x, p1.y, p1.z, p0.x, p0.y, p0.z);
  }
  for (let i = 0; i < 160; i++) {
    ovalPoint(venue, roofIn + 0.3, (i / 160) * Math.PI * 2, H + 6.2, p0);
    rimPos.push(p0.x, p0.y, p0.z);
  }
  const trussGeo = new THREE.BufferGeometry();
  trussGeo.setAttribute('position', new THREE.Float32BufferAttribute(trussPos, 3));
  group.add(new THREE.LineSegments(trussGeo, new THREE.LineBasicMaterial({ color: 0x8fa6e8, transparent: true, opacity: 0.55 })));
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
  const rimMat = new THREE.PointsMaterial({ color: 0xfff1cc, size: 1.3, sizeAttenuation: true });
  group.add(new THREE.Points(rimGeo, rimMat));

  // ---- Projektör direkleri ve hüzmeler ----
  const beams: Array<THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>> = [];
  const lampTex = canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#10152e';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 4; y++) {
        const g = ctx.createRadialGradient(x * 16 + 8, y * 16 + 8, 1, x * 16 + 8, y * 16 + 8, 7);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x * 16, y * 16, 16, 16);
      }
  });
  const lampMat = new THREE.MeshBasicMaterial({ map: lampTex });
  const mastMat = new THREE.MeshBasicMaterial({ color: 0x0b1028 });
  const towerH = H + 30;
  for (let k = 0; k < 4; k++) {
    const th = Math.PI / 4 + (k * Math.PI) / 2;
    const base = ovalPoint(venue, outer + 9, th, 0);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(2.2, towerH, 2.2), mastMat);
    mast.position.set(base.x, towerH / 2, base.z);
    group.add(mast);
    occluders.push(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(15, 8, 1.4), [mastMat, mastMat, mastMat, mastMat, lampMat, mastMat]);
    head.position.set(base.x, towerH + 2, base.z);
    head.lookAt(0, 0, 0);
    group.add(head);
    const from = head.position.clone().addScaledVector(head.position.clone().setY(0).normalize(), -1.2);
    const sx = Math.sign(base.x);
    const sz = Math.sign(base.z);
    const targets = [new THREE.Vector3(sx * L * 0.27, 0, sz * W * 0.2), new THREE.Vector3(sx * L * 0.06, 0, -sz * W * 0.12)];
    targets.forEach((to, j) => {
      if (quality === 'low' && j === 1) return;
      const beam = createBeam(from, to, j === 0 ? 30 : 36, 0xdfe8ff, j === 0 ? 0.5 : 0.3);
      group.add(beam);
      beams.push(beam);
    });
  }

  // ---- Skorbord (doğu kale arkası, çatı üstünde; karşı uçta ikizi) ----
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 1024;
  sbCanvas.height = 384;
  const sbCtx = sbCanvas.getContext('2d')!;
  sbCtx.fillStyle = '#0b1030';
  sbCtx.fillRect(0, 0, 1024, 384);
  const sbTex = new THREE.CanvasTexture(sbCanvas);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  sbTex.anisotropy = 8;
  const sbMat = new THREE.MeshBasicMaterial({ map: sbTex });
  const sbFrame = new THREE.MeshBasicMaterial({ color: 0x0a0e24 });
  for (const side of [1, -1]) {
    const p = ovalPoint(venue, outer - 7, side > 0 ? 0 : Math.PI, H + 12.5);
    const board = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(35, 13.6, 1.6), sbFrame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(33.4, 12.5), sbMat);
    face.position.z = 0.82;
    board.add(frame, face);
    for (const lx of [-13, 13]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), sbFrame);
      leg.position.set(lx, -10.2, 0);
      board.add(leg);
    }
    board.position.copy(p);
    board.lookAt(0, H * 0.35, 0);
    group.add(board);
    occluders.push(frame);
  }

  // ---- Işıklar ----
  const hemi = new THREE.HemisphereLight(0xcfdcff, 0x1c3a2c, 1.25);
  const amb = new THREE.AmbientLight(0x8fa0d8, 0.35);
  const d1 = new THREE.DirectionalLight(0xfff4e0, 1.5);
  d1.position.set(120, 160, 90);
  const d2 = new THREE.DirectionalLight(0xdfe8ff, 1.1);
  d2.position.set(-120, 150, -90);
  group.add(hemi, amb, d1, d2);
  const base = { hemi: hemi.intensity, amb: amb.intensity, d1: d1.intensity, d2: d2.intensity };
  const beamBase = beams.map((bm) => bm.material.uniforms.uIntensity.value as number);
  let house = 1;
  let houseTarget = 1;

  const applyHouse = (): void => {
    hemi.intensity = base.hemi * house;
    amb.intensity = base.amb * (0.5 + 0.5 * house);
    d1.intensity = base.d1 * house;
    d2.intensity = base.d2 * house;
    beams.forEach((bm, i) => {
      bm.material.uniforms.uIntensity.value = beamBase[i] * house;
      bm.visible = house > 0.05;
    });
  };

  return {
    group,
    occluders,
    scoreboard: { canvas: sbCanvas, ctx: sbCtx, texture: sbTex },
    setHouseLights(level: number) {
      houseTarget = level;
    },
    update(dt: number, time: number) {
      if (Math.abs(house - houseTarget) > 0.001) {
        house += (houseTarget - house) * Math.min(1, dt * 1.6);
        applyHouse();
      }
      for (const fn of animated) fn(dt, time);
    },
    dispose() {
      disposeTree(group);
    },
  };
}

/** Yalnızca position/uv/index içeren geometrileri birleştirir. */
function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.getAttribute('position').count;
    iCount += p.getIndex()!.count;
  }
  const pos = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    const pa = p.getAttribute('position').array as Float32Array;
    pos.set(pa, vo * 3);
    const ia = p.getIndex()!.array;
    for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
    vo += pa.length / 3;
    io += ia.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}
