import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { Quality } from '../core/store';
import type { SeatData } from '../data/seats';

const SHIRTS = [0xe63946, 0x2f6bff, 0xf1f1f1, 0xffd23f, 0x2b2d42, 0x8d99ae, 0x3a86ff, 0xd62828, 0xf4a261, 0x457b9d, 0xe9ecef, 0x6a4c93];
const SKINS = [0xf2c9a1, 0xe0ac7e, 0xc68642, 0x8d5524, 0xffdbb5];
const CROWD_FILL: Record<Quality, number> = { high: 0.92, medium: 0.8, low: 0.55 };
/** Bu uzaklığın (m) ötesindeki bloklar birleştirilmiş sade geometriyle çizilir (LOD). */
const LOD_DISTANCE: Record<Quality, number> = { high: 80, medium: 52, low: 24 };

// Uzak koltuk şablonu: oturak + sırtlık, iki dörtgen (8 köşe, 4 üçgen).
const W = 0.23;
// prettier-ignore
const FAR_SEAT = [
  -W, 0.44, -0.17,  W, 0.44, -0.17,  W, 0.44, 0.26,  -W, 0.44, 0.26,
  -W, 0.42, -0.17,  W, 0.42, -0.17,  W, 0.94, -0.17,  -W, 0.94, -0.17,
];
const FAR_SEAT_INDEX = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7];
// Uzak seyirci şablonu: kutu gövde (8 köşe) + sekizyüzlü kafa (6 köşe).
const BX = 0.2;
const BZ = 0.17;
// prettier-ignore
const FAR_PERSON = [
  -BX, 0.47, -BZ,  BX, 0.47, -BZ,  BX, 0.47, BZ,  -BX, 0.47, BZ,
  -BX, 1.06, -BZ,  BX, 1.06, -BZ,  BX, 1.06, BZ,  -BX, 1.06, BZ,
  0, 1.36, -0.03,  0, 1.06, -0.03,  0.15, 1.21, -0.03,  -0.15, 1.21, -0.03,  0, 1.21, 0.12,  0, 1.21, -0.18,
];
// prettier-ignore
const FAR_PERSON_INDEX = [
  0, 1, 2, 0, 2, 3,  4, 6, 5, 4, 7, 6,  0, 4, 5, 0, 5, 1,  1, 5, 6, 1, 6, 2,  2, 6, 7, 2, 7, 3,  3, 7, 4, 3, 4, 0,
  8, 12, 10, 8, 10, 13, 8, 13, 11, 8, 11, 12,  9, 10, 12, 9, 13, 10, 9, 11, 13, 9, 12, 11,
];
const PERSON_VERTS = FAR_PERSON.length / 3;
const HEAD_FIRST_VERT = 8;

interface SharedUniforms {
  uTime: { value: number };
  uCheer: { value: number };
  uWave: { value: THREE.Vector2 };
}

/** Seyirci malzemesi: zıplama / dalga hareketi vertex shader'da, CPU maliyeti yok. */
function crowdMaterial(shared: SharedUniforms, excite: { value: number }, merged: boolean): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: merged, flatShading: merged, side: merged ? THREE.DoubleSide : THREE.FrontSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCheer = shared.uCheer;
    shader.uniforms.uWave = shared.uWave;
    shader.uniforms.uExcite = excite;
    shader.vertexShader =
      'attribute vec3 aInfo;\nuniform float uTime;\nuniform float uCheer;\nuniform float uExcite;\nuniform vec2 uWave;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = aInfo.x * 6.2831853;
        float idle = sin(uTime * 1.3 + ph) * 0.012;
        float ex = max(uExcite, uCheer * (0.5 + 0.5 * aInfo.z));
        float jump = abs(sin(uTime * (5.5 + aInfo.x * 2.5) + ph)) * 0.36 * ex;
        float wd = abs(fract(aInfo.y - uWave.x + 0.5) - 0.5);
        float wave = smoothstep(0.05, 0.0, wd) * uWave.y * 0.55;
        transformed.y += idle + jump + wave;`,
      );
  };
  mat.customProgramCacheKey = () => 'seyir-crowd';
  return mat;
}

interface BlockMeshes {
  /** Yakın LOD + seçim (raycast) için InstancedMesh. */
  seats: THREE.InstancedMesh;
  bodies: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  /** Uzak LOD: blok başına tek statik geometri. */
  seatsFar: THREE.Mesh;
  crowdFar: THREE.Mesh;
  farColors: THREE.BufferAttribute;
  center: THREE.Vector3;
  near: boolean;
  /** Kalabalık yuvası → koltuk indeksi (önce dolu koltuklar). */
  order: Int32Array;
  takenCount: number;
  crowdCount: number;
  excite: { value: number };
  exciteUntil: number;
  exciteLevel: number;
  dirty: boolean;
}

/** Stadyumdaki tüm koltuklar ve seyirciler; seçim, vurgu, filtre ve tepki görselleri. */
export class SeatField {
  readonly group = new THREE.Group();
  private readonly blocks: BlockMeshes[] = [];
  private readonly pickMeshes: THREE.InstancedMesh[] = [];
  private readonly baseColor: Float32Array;
  private readonly matchFilter: Uint8Array;
  private readonly crowdSlot: Int32Array;
  private readonly shared: SharedUniforms = {
    uTime: { value: 0 },
    uCheer: { value: 0 },
    uWave: { value: new THREE.Vector2(0, 0) },
  };
  private readonly seatGeo: THREE.BufferGeometry;
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly headGeo: THREE.BufferGeometry;
  private readonly seatMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private readonly seatFarMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  private readonly hoverMesh: THREE.Mesh;
  private readonly selectPin: THREE.Group;
  private readonly minePins: THREE.Group[] = [];
  private readonly peerPins: THREE.InstancedMesh;
  private readonly m4 = new THREE.Matrix4();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly tmpColor = new THREE.Color();
  private readonly tmpV = new THREE.Vector3();
  private mine = new Set<number>();
  private selected = -1;
  private hidden = -1;
  private crowdFull = false;
  private cheerUntil = 0;
  private cheerLevel = 0;
  private waveStart = -1;
  private waveFrom = 0;
  private time = 0;
  private fill: number;
  private lodDistance: number;
  pinsVisible = true;

  constructor(
    private readonly data: SeatData,
    quality: Quality,
  ) {
    this.group.name = 'seats';
    this.fill = CROWD_FILL[quality];
    this.lodDistance = LOD_DISTANCE[quality];
    const pan = new THREE.BoxGeometry(0.46, 0.08, 0.42).translate(0, 0.42, 0.05);
    const back = new THREE.BoxGeometry(0.46, 0.52, 0.07).translate(0, 0.66, -0.19);
    this.seatGeo = mergeGeometries([pan, back]);
    pan.dispose();
    back.dispose();
    const torso = new THREE.BoxGeometry(0.4, 0.56, 0.24).translate(0, 0.77, -0.05);
    const thighs = new THREE.BoxGeometry(0.38, 0.15, 0.42).translate(0, 0.54, 0.14);
    this.bodyGeo = mergeGeometries([torso, thighs]);
    torso.dispose();
    thighs.dispose();
    this.headGeo = (quality === 'high' ? new THREE.SphereGeometry(0.125, 7, 5) : new THREE.IcosahedronGeometry(0.13, 0)).translate(0, 1.2, -0.03);

    const n = data.count;
    this.baseColor = new Float32Array(n * 3);
    this.matchFilter = new Uint8Array(n).fill(1);
    this.crowdSlot = new Int32Array(n).fill(-1);
    const rng = mulberry32(0xc0ffee);
    const c = new THREE.Color();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const shirt = new THREE.Color();
    const skin = new THREE.Color();
    const PI = FAR_PERSON_INDEX.length;

    for (const block of data.blocks) {
      const count = block.seatCount;
      const excite = { value: 0 };
      const seats = new THREE.InstancedMesh(this.seatGeo, this.seatMat, count);
      seats.userData.block = block.index;
      const bodies = new THREE.InstancedMesh(this.bodyGeo.clone(), crowdMaterial(this.shared, excite, false), count);
      const heads = new THREE.InstancedMesh(this.headGeo.clone(), crowdMaterial(this.shared, excite, false), count);

      // Yuva sırası: dolu koltuklar başta, boşlar karışık sırada arkada.
      const taken: number[] = [];
      const free: number[] = [];
      for (let i = block.seatStart; i < block.seatStart + count; i++) (data.taken[i] ? taken : free).push(i);
      for (let i = free.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [free[i], free[j]] = [free[j], free[i]];
      }
      const order = Int32Array.from([...taken, ...free]);

      // --- Koltuklar: instanced (yakın) + birleştirilmiş (uzak) ---
      const farPos = new Float32Array(count * 24);
      const farCol = new Uint8Array(count * 24);
      const farIdx = new Uint32Array(count * 12);
      c.setHex(block.color);
      for (let k = 0; k < count; k++) {
        const i = block.seatStart + k;
        const x = data.pos[i * 3];
        const y = data.pos[i * 3 + 1];
        const z = data.pos[i * 3 + 2];
        pos.set(x, y, z);
        quat.setFromAxisAngle(yAxis, data.yaw[i]);
        this.m4.compose(pos, quat, scl);
        seats.setMatrixAt(k, this.m4);
        // Sıradan sıraya hafif ton farkı: tribün düz bir leke gibi görünmesin.
        const shade = 0.93 + 0.07 * (data.row[i] % 2);
        this.baseColor.set([c.r * shade, c.g * shade, c.b * shade], i * 3);
        seats.setColorAt(k, this.tmpColor.setRGB(c.r * shade, c.g * shade, c.b * shade));
        const sn = Math.sin(data.yaw[i]);
        const cs = Math.cos(data.yaw[i]);
        for (let v = 0; v < 8; v++) {
          const lx = FAR_SEAT[v * 3];
          const lz = FAR_SEAT[v * 3 + 2];
          const o = (k * 8 + v) * 3;
          farPos[o] = x + lx * cs + lz * sn;
          farPos[o + 1] = y + FAR_SEAT[v * 3 + 1];
          farPos[o + 2] = z - lx * sn + lz * cs;
          farCol[o] = c.r * shade * 255;
          farCol[o + 1] = c.g * shade * 255;
          farCol[o + 2] = c.b * shade * 255;
        }
        for (let t = 0; t < 12; t++) farIdx[k * 12 + t] = k * 8 + FAR_SEAT_INDEX[t];
      }
      const seatFarGeo = new THREE.BufferGeometry();
      seatFarGeo.setAttribute('position', new THREE.BufferAttribute(farPos, 3));
      const farColors = new THREE.BufferAttribute(farCol, 3, true);
      seatFarGeo.setAttribute('color', farColors);
      seatFarGeo.setIndex(new THREE.BufferAttribute(farIdx, 1));
      seatFarGeo.computeBoundingSphere();
      const seatsFar = new THREE.Mesh(seatFarGeo, this.seatFarMat);

      // --- Seyirciler: instanced (yakın) + birleştirilmiş (uzak) ---
      const info = new Float32Array(count * 3);
      const pPos = new Float32Array(count * PERSON_VERTS * 3);
      const pCol = new Uint8Array(count * PERSON_VERTS * 3);
      const pInfo = new Uint16Array(count * PERSON_VERTS * 3);
      const pIdx = new Uint32Array(count * PI);
      for (let slot = 0; slot < count; slot++) {
        const i = order[slot];
        this.crowdSlot[i] = slot;
        const x = data.pos[i * 3];
        const y = data.pos[i * 3 + 1];
        const z = data.pos[i * 3 + 2];
        pos.set(x, y, z);
        quat.setFromAxisAngle(yAxis, data.yaw[i]);
        const s = 0.93 + rng() * 0.12;
        scl.set(1, s, 1);
        this.m4.compose(pos, quat, scl);
        bodies.setMatrixAt(slot, this.m4);
        heads.setMatrixAt(slot, this.m4);
        shirt.setHex(SHIRTS[Math.floor(rng() * SHIRTS.length)]);
        skin.setHex(SKINS[Math.floor(rng() * SKINS.length)]);
        bodies.setColorAt(slot, shirt);
        heads.setColorAt(slot, skin);
        const ang = Math.atan2(z, x) / (Math.PI * 2);
        const a01 = ang - Math.floor(ang);
        const r1 = rng();
        const r2 = rng();
        info.set([r1, a01, r2], slot * 3);
        const sn = Math.sin(data.yaw[i]);
        const cs = Math.cos(data.yaw[i]);
        for (let v = 0; v < PERSON_VERTS; v++) {
          const lx = FAR_PERSON[v * 3];
          const lz = FAR_PERSON[v * 3 + 2];
          const o = (slot * PERSON_VERTS + v) * 3;
          pPos[o] = x + lx * cs + lz * sn;
          pPos[o + 1] = y + FAR_PERSON[v * 3 + 1] * s;
          pPos[o + 2] = z - lx * sn + lz * cs;
          const col = v < HEAD_FIRST_VERT ? shirt : skin;
          pCol[o] = col.r * 255;
          pCol[o + 1] = col.g * 255;
          pCol[o + 2] = col.b * 255;
          pInfo[o] = r1 * 65535;
          pInfo[o + 1] = a01 * 65535;
          pInfo[o + 2] = r2 * 65535;
        }
        for (let t = 0; t < PI; t++) pIdx[slot * PI + t] = slot * PERSON_VERTS + FAR_PERSON_INDEX[t];
      }
      scl.set(1, 1, 1);
      const infoAttr = new THREE.InstancedBufferAttribute(info, 3);
      bodies.geometry.setAttribute('aInfo', infoAttr);
      heads.geometry.setAttribute('aInfo', infoAttr);
      const crowdFarGeo = new THREE.BufferGeometry();
      crowdFarGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      crowdFarGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3, true));
      crowdFarGeo.setAttribute('aInfo', new THREE.BufferAttribute(pInfo, 3, true));
      crowdFarGeo.setIndex(new THREE.BufferAttribute(pIdx, 1));
      crowdFarGeo.computeBoundingSphere();
      crowdFarGeo.boundingSphere!.radius += 1;
      const crowdFar = new THREE.Mesh(crowdFarGeo, crowdMaterial(this.shared, excite, true));

      for (const mesh of [seats, bodies, heads]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.visible = false;
      }
      for (const mesh of [seats, bodies, heads, seatsFar, crowdFar]) {
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
      }
      const bm: BlockMeshes = {
        seats,
        bodies,
        heads,
        seatsFar,
        crowdFar,
        farColors,
        center: new THREE.Vector3(...block.center),
        near: false,
        order,
        takenCount: taken.length,
        crowdCount: taken.length,
        excite,
        exciteUntil: 0,
        exciteLevel: 0,
        dirty: false,
      };
      this.blocks.push(bm);
      this.pickMeshes.push(seats);
      this.applyCrowdCount(bm);
    }

    // Vurgu ve işaretçiler
    this.hoverMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.9, 0.62).translate(0, 0.62, -0.02),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.92 }),
    );
    this.hoverMesh.visible = false;
    this.hoverMesh.renderOrder = 6;
    this.group.add(this.hoverMesh);
    this.selectPin = this.makePin(0xffd23f);
    this.group.add(this.selectPin);
    for (let i = 0; i < 6; i++) {
      const pin = this.makePin(0x2f6bff);
      this.minePins.push(pin);
      this.group.add(pin);
    }
    this.peerPins = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0x7af0c0 }), 48);
    this.peerPins.count = 0;
    this.peerPins.frustumCulled = false;
    this.group.add(this.peerPins);
  }

  private makePin(color: number): THREE.Group {
    const g = new THREE.Group();
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    geo.scale(0.72, 1.15, 0.72);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x14142b, side: THREE.BackSide }));
    outline.scale.setScalar(1.28);
    g.add(outline, core);
    g.visible = false;
    g.renderOrder = 7;
    return g;
  }

  private applyCrowdCount(b: BlockMeshes): void {
    b.bodies.count = b.crowdCount;
    b.heads.count = b.crowdCount;
    b.crowdFar.geometry.setDrawRange(0, b.crowdCount * FAR_PERSON_INDEX.length);
  }

  seatPosition(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.data.pos[i * 3], this.data.pos[i * 3 + 1], this.data.pos[i * 3 + 2]);
  }

  /**
   * Raycaster'ın instanceId değerini koltuk kaydına eşler.
   * `loose` (dokunmatik/tıklama) isabet yoksa ışına en yakın koltuğu arar.
   */
  pick(raycaster: THREE.Raycaster, occluders: THREE.Object3D[], loose: boolean): number {
    const hits = raycaster.intersectObjects(this.pickMeshes, false);
    let seat = -1;
    let dist = Infinity;
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const mesh = hits[0].object as THREE.InstancedMesh;
      seat = this.data.blocks[mesh.userData.block as number].seatStart + hits[0].instanceId;
      dist = hits[0].distance;
    } else if (loose) {
      const ray = raycaster.ray;
      const p = this.tmpV;
      let best = 0.55 * 0.55;
      for (let b = 0; b < this.blocks.length; b++) {
        if (!ray.intersectsSphere(this.blocks[b].seats.boundingSphere!)) continue;
        const block = this.data.blocks[b];
        for (let i = block.seatStart; i < block.seatStart + block.seatCount; i++) {
          p.set(this.data.pos[i * 3], this.data.pos[i * 3 + 1] + 0.5, this.data.pos[i * 3 + 2]);
          const d2 = ray.distanceSqToPoint(p);
          if (d2 < best) {
            const along = p.sub(ray.origin).dot(ray.direction);
            if (along > 0) {
              best = d2;
              seat = i;
              dist = along;
            }
          }
        }
      }
    }
    if (seat < 0) return -1;
    const occ = raycaster.intersectObjects(occluders, false);
    if (occ.length > 0 && occ[0].distance < dist) return -1;
    return seat;
  }

  setHover(i: number): void {
    if (i < 0) {
      this.hoverMesh.visible = false;
      return;
    }
    this.hoverMesh.visible = true;
    this.hoverMesh.position.set(this.data.pos[i * 3], this.data.pos[i * 3 + 1], this.data.pos[i * 3 + 2]);
    this.hoverMesh.rotation.y = this.data.yaw[i];
    (this.hoverMesh.material as THREE.MeshBasicMaterial).color.setHex(this.data.taken[i] ? 0x9aa0b4 : 0xffd23f);
  }

  setSelected(i: number): void {
    const prev = this.selected;
    this.selected = i;
    if (prev >= 0) this.paint(prev);
    if (i >= 0) this.paint(i);
    this.flushColors();
  }

  setMine(indices: number[]): void {
    const prev = this.mine;
    this.mine = new Set(indices);
    for (const i of prev) this.paint(i);
    for (const i of this.mine) this.paint(i);
    this.flushColors();
  }

  setPeers(indices: number[]): void {
    const n = Math.min(indices.length, 48);
    for (let k = 0; k < n; k++) {
      const i = indices[k];
      this.m4.makeTranslation(this.data.pos[i * 3], this.data.pos[i * 3 + 1] + 2.4, this.data.pos[i * 3 + 2]);
      this.peerPins.setMatrixAt(k, this.m4);
    }
    this.peerPins.count = n;
    this.peerPins.instanceMatrix.needsUpdate = true;
  }

  /** Filtreye uymayan koltuklar soluklaşır. */
  setFilter(match: (i: number) => boolean): void {
    for (let i = 0; i < this.data.count; i++) {
      this.matchFilter[i] = match(i) ? 1 : 0;
      this.paint(i);
    }
    this.flushColors();
  }

  matches(i: number): boolean {
    return this.matchFilter[i] === 1;
  }

  /** Koltuğun rengini hem instanced hem birleştirilmiş temsile yazar. */
  private paint(i: number): void {
    const block = this.data.blocks[this.data.block[i]];
    const b = this.blocks[block.index];
    const c = this.tmpColor;
    if (this.mine.has(i)) c.setHex(0x2f6bff);
    else if (i === this.selected) c.setHex(0xffd23f);
    else {
      c.setRGB(this.baseColor[i * 3], this.baseColor[i * 3 + 1], this.baseColor[i * 3 + 2]);
      if (!this.matchFilter[i]) c.multiplyScalar(0.16).offsetHSL(0, -0.3, 0);
    }
    const k = i - block.seatStart;
    b.seats.setColorAt(k, c);
    const arr = b.farColors.array as Uint8Array;
    const r = c.r * 255;
    const g = c.g * 255;
    const bl = c.b * 255;
    for (let v = 0; v < 8; v++) {
      const o = (k * 8 + v) * 3;
      arr[o] = r;
      arr[o + 1] = g;
      arr[o + 2] = bl;
    }
    b.dirty = true;
  }

  private flushColors(): void {
    for (const b of this.blocks) {
      if (b.dirty) {
        b.seats.instanceColor!.needsUpdate = true;
        b.farColors.needsUpdate = true;
        b.dirty = false;
      }
    }
  }

  /** Koltuk görünümünde tribünler maç günü gibi dolar; kameranın oturduğu koltuk boş bırakılır. */
  setCrowd(full: boolean, cameraSeat: number): void {
    this.crowdFull = full;
    for (const b of this.blocks) {
      const free = b.order.length - b.takenCount;
      b.crowdCount = b.takenCount + (full ? Math.floor(free * this.fill) : 0);
      this.applyCrowdCount(b);
    }
    if (this.hidden !== cameraSeat) {
      this.setOccupantVisible(this.hidden, true);
      this.hidden = cameraSeat;
      this.setOccupantVisible(cameraSeat, false);
    }
  }

  /** Kameranın oturduğu koltuktaki seyirci (yakın LOD'da) gizlenir. */
  private setOccupantVisible(seat: number, visible: boolean): void {
    if (seat < 0) return;
    const b = this.blocks[this.data.block[seat]];
    const slot = this.crowdSlot[seat];
    if (visible) {
      this.m4.makeRotationY(this.data.yaw[seat]).setPosition(this.data.pos[seat * 3], this.data.pos[seat * 3 + 1], this.data.pos[seat * 3 + 2]);
    } else {
      this.m4.copy(this.zero);
    }
    b.bodies.setMatrixAt(slot, this.m4);
    b.heads.setMatrixAt(slot, this.m4);
    b.bodies.instanceMatrix.needsUpdate = true;
    b.heads.instanceMatrix.needsUpdate = true;
  }

  /** Çalışma anında kalite düşerse kalabalık yoğunluğu ve LOD mesafesi de azalır. */
  setQuality(q: Quality): void {
    this.fill = Math.min(this.fill, CROWD_FILL[q]);
    this.lodDistance = Math.min(this.lodDistance, LOD_DISTANCE[q]);
    this.setCrowd(this.crowdFull, this.hidden);
  }

  /** Tek bloğu coştur (alkış/tezahürat). */
  exciteBlock(blockIndex: number, level: number, seconds: number): void {
    const b = this.blocks[blockIndex];
    if (!b) return;
    b.exciteLevel = Math.max(level, this.time < b.exciteUntil ? b.exciteLevel : 0);
    b.exciteUntil = Math.max(b.exciteUntil, this.time + seconds);
  }

  /** Bütün stadyum (gol). */
  cheerAll(level: number, seconds: number): void {
    this.cheerLevel = level;
    this.cheerUntil = this.time + seconds;
  }

  /** Meksika dalgası: verilen bloktan başlar, stadyumu bir tur dolaşır. */
  startWave(blockIndex: number): void {
    const block = this.data.blocks[blockIndex];
    if (!block) return;
    const a = block.angleMid / (Math.PI * 2);
    this.waveFrom = a - Math.floor(a);
    this.waveStart = this.time;
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    this.time = time;
    this.shared.uTime.value = time;
    const cheerTarget = time < this.cheerUntil ? this.cheerLevel : 0;
    this.shared.uCheer.value += (cheerTarget - this.shared.uCheer.value) * Math.min(1, dt * 4);
    const lod2 = this.lodDistance * this.lodDistance;
    for (const b of this.blocks) {
      // LOD: kameraya yakın bloklar ayrıntılı (instanced), uzaklar birleştirilmiş geometri
      const near = b.center.distanceToSquared(camera.position) < lod2;
      if (near !== b.near) {
        b.near = near;
        b.seats.visible = b.bodies.visible = b.heads.visible = near;
        b.seatsFar.visible = b.crowdFar.visible = !near;
      }
      const target = time < b.exciteUntil ? b.exciteLevel : 0;
      if (b.excite.value !== target) {
        b.excite.value += (target - b.excite.value) * Math.min(1, dt * 5);
        if (Math.abs(b.excite.value - target) < 0.002) b.excite.value = target;
      }
    }
    const WAVE_SECONDS = 7;
    if (this.waveStart >= 0) {
      const t = (time - this.waveStart) / WAVE_SECONDS;
      if (t >= 1) {
        this.waveStart = -1;
        this.shared.uWave.value.set(0, 0);
      } else {
        const f = this.waveFrom + t;
        this.shared.uWave.value.set(f - Math.floor(f), Math.min(1, t * 8, (1 - t) * 8));
      }
    }

    // İşaretçiler: kamera uzaklığına göre ölçeklenir, hafifçe süzülür.
    const bob = Math.sin(time * 3) * 0.18;
    const place = (pin: THREE.Group, seat: number): void => {
      if (seat < 0 || !this.pinsVisible) {
        pin.visible = false;
        return;
      }
      pin.visible = true;
      const x = this.data.pos[seat * 3];
      const y = this.data.pos[seat * 3 + 1];
      const z = this.data.pos[seat * 3 + 2];
      const d = Math.hypot(camera.position.x - x, camera.position.y - y, camera.position.z - z);
      const s = THREE.MathUtils.clamp(d * 0.022, 0.9, 6);
      pin.scale.setScalar(s);
      pin.position.set(x, y + 1.6 + s * (0.9 + bob * 0.5), z);
      pin.rotation.y = time * 1.4;
    };
    place(this.selectPin, this.mine.has(this.selected) ? -1 : this.selected);
    let k = 0;
    for (const seat of this.mine) {
      if (k < this.minePins.length) place(this.minePins[k++], seat);
    }
    for (; k < this.minePins.length; k++) this.minePins[k].visible = false;
    this.peerPins.visible = this.pinsVisible;
    if (this.hoverMesh.visible) (this.hoverMesh.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.2 * Math.sin(time * 8);
  }

  dispose(): void {
    for (const b of this.blocks) {
      for (const mesh of [b.bodies, b.heads, b.crowdFar]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      b.seatsFar.geometry.dispose();
      b.seats.dispose();
      b.bodies.dispose();
      b.heads.dispose();
    }
    this.seatGeo.dispose();
    this.bodyGeo.dispose();
    this.headGeo.dispose();
    this.seatMat.dispose();
    this.seatFarMat.dispose();
    for (const pin of [this.selectPin, ...this.minePins]) {
      pin.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    }
    this.hoverMesh.geometry.dispose();
    (this.hoverMesh.material as THREE.Material).dispose();
    this.peerPins.geometry.dispose();
    (this.peerPins.material as THREE.Material).dispose();
    this.peerPins.dispose();
  }
}
