import * as THREE from 'three';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const GZ = -30;          // kale çizgisi
export const HALF_W = 19.5;
export const BACK_Z = 50;
export const GOAL_W = 3.66, GOAL_H = 2.44;
const NET_TOP = 0.9, NET_BOT = 2.1;   // filenin üstteki ve yerdeki derinliği
export const NET_D = NET_BOT;
const BACK_H = Math.hypot(GOAL_H, NET_BOT - NET_TOP);

export class World {
  sun: THREE.DirectionalLight;
  private net!: THREE.Mesh; private off!: Float32Array; private vel!: Float32Array; private netLive = 0;
  private leds: THREE.Texture[] = []; private crowds: THREE.Texture[] = [];
  private flashes!: THREE.Points; private flashLife!: Float32Array; private hype = 0; private hypeTo = 0.15; private clock = 0;

  constructor(scene: THREE.Scene) {
    scene.background = canvas(8, 256, g => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#05081c'); gr.addColorStop(0.35, '#131a45'); gr.addColorStop(0.55, '#3b2a6b'); gr.addColorStop(0.68, '#7a3f78'); gr.addColorStop(1, '#141030');
      g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
    });
    scene.fog = new THREE.Fog(0x2a2350, 80, 230);
    // gece maçı ışığı: serin ortam ışığı + projektörden gelen sıcak ana ışık
    scene.add(new THREE.HemisphereLight(0xb9c8ff, 0x2a5236, 1.05));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.3);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 28; sc.bottom = -24; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0x9db4ff, 0.9); rim.position.set(-8, 6, -12); scene.add(rim);

    // çim: biçme şeritleri + çapraz doku + ince gürültü
    const grass = canvas(256, 256, g => {
      for (let i = 0; i < 2; i++) { g.fillStyle = i ? '#27984d' : '#2fae58'; g.fillRect(0, i * 128, 256, 128); }
      g.globalAlpha = 0.06; g.fillStyle = '#0a3a1c'; for (let i = 0; i < 8; i += 2) g.fillRect(i * 32, 0, 32, 256); g.globalAlpha = 1;
      for (let i = 0; i < 5200; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '230,255,190' : '0,45,22'},${0.03 + Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1, 2 + Math.random() * 3); }
    });
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(56 / 11, 120 / 11); grass.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(56, 120), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.92 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = 18; ground.receiveShadow = true; scene.add(ground);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(200, 220), new THREE.MeshStandardMaterial({ color: 0x1a1634, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.03, 0); scene.add(apron);

    // saha çizgileri
    const white = new THREE.MeshBasicMaterial({ color: 0xe9f5e4 });
    const line = (x1: number, z1: number, x2: number, z2: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1), m = new THREE.Mesh(new THREE.PlaneGeometry(0.13, len + 0.13), white);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(x2 - x1, z2 - z1)); m.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2); scene.add(m);
    };
    const W = HALF_W + 0.5, mid = 28;
    line(-W, GZ, W, GZ); line(-W, GZ, -W, mid + 30); line(W, GZ, W, mid + 30); line(-W, mid, W, mid);
    line(-13, GZ, -13, GZ + 13); line(13, GZ, 13, GZ + 13); line(-13, GZ + 13, 13, GZ + 13);
    line(-6, GZ, -6, GZ + 4.5); line(6, GZ, 6, GZ + 4.5); line(-6, GZ + 4.5, 6, GZ + 4.5);
    const ring = (x: number, z: number, r: number, a0 = 0, len = Math.PI * 2) => { const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.065, r + 0.065, 56, 1, a0, len), white); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); scene.add(m); };
    ring(0, mid, 7.5); ring(0, GZ + 9, 7.3, Math.PI + 0.58, Math.PI - 1.16);
    for (const s of [1, -1]) ring(W * s, GZ, 1, s > 0 ? Math.PI : Math.PI * 1.5, Math.PI / 2);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), white); spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.012, GZ + 9); scene.add(spot);
    // köşe bayrakları
    for (const s of [1, -1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })); pole.position.set(W * s, 0.75, GZ); pole.castShadow = true;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ color: 0xff4d6d, side: THREE.DoubleSide })); flag.position.set(W * s - 0.21 * s, 1.35, GZ);
      scene.add(pole, flag);
    }

    this.buildGoal(scene);
    this.buildSurround(scene);
  }

  private buildGoal(scene: THREE.Scene) {
    const postM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1, emissive: 0x30343a });
    const tube = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, r: number, m: THREE.Material = postM) => {
      const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), len = a.distanceTo(b);
      const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m); o.position.copy(a).add(b).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); o.castShadow = true; scene.add(o);
    };
    const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0ad, roughness: 0.5 });
    for (const s of [1, -1]) {
      const x = GOAL_W * s;
      tube(x, 0, GZ, x, GOAL_H + 0.07, GZ, 0.07);
      // arka destek demirleri: file bunlara gerilir
      tube(x, GOAL_H, GZ, x, GOAL_H, GZ - NET_TOP, 0.025, grey); tube(x, GOAL_H, GZ - NET_TOP, x, 0, GZ - NET_BOT, 0.025, grey); tube(x, 0.02, GZ, x, 0.02, GZ - NET_BOT, 0.025, grey);
    }
    tube(-GOAL_W - 0.07, GOAL_H, GZ, GOAL_W + 0.07, GOAL_H, GZ, 0.07);
    tube(-GOAL_W, GOAL_H, GZ - NET_TOP, GOAL_W, GOAL_H, GZ - NET_TOP, 0.025, grey); tube(-GOAL_W, 0.02, GZ - NET_BOT, GOAL_W, 0.02, GZ - NET_BOT, 0.025, grey);

    const netTex = canvas(32, 32, g => { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.2; g.strokeRect(0, 0, 32, 32); });
    const netMat = (w: number, h: number) => { const t = netTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 0.13, h / 0.13); t.anisotropy = 4; t.needsUpdate = true; return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }); };
    // arka ağ: eğimli ve esneyen yüzey
    const back = this.net = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W * 2, BACK_H, 30, 12), netMat(GOAL_W * 2, BACK_H));
    back.position.set(0, GOAL_H / 2, GZ - (NET_TOP + NET_BOT) / 2); back.rotation.x = -Math.atan2(NET_BOT - NET_TOP, GOAL_H); scene.add(back);
    const n = back.geometry.attributes.position.count; this.off = new Float32Array(n); this.vel = new Float32Array(n);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W * 2, NET_TOP), netMat(GOAL_W * 2, NET_TOP)); top.rotation.x = Math.PI / 2; top.position.set(0, GOAL_H, GZ - NET_TOP / 2); scene.add(top);
    const sideShape = new THREE.Shape(); sideShape.moveTo(0, 0); sideShape.lineTo(NET_BOT, 0); sideShape.lineTo(NET_TOP, GOAL_H); sideShape.lineTo(0, GOAL_H); sideShape.closePath();
    const sideGeo = new THREE.ShapeGeometry(sideShape); const uv = sideGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / NET_BOT, uv.getY(i) / GOAL_H);
    for (const s of [1, -1]) { const side = new THREE.Mesh(sideGeo, netMat(NET_BOT, GOAL_H)); side.rotation.y = Math.PI / 2; side.position.set(GOAL_W * s, 0, GZ); scene.add(side); }
  }

  private buildSurround(scene: THREE.Scene) {
    // LED reklam panoları: yazılar kayar
    const led = (len: number, words: string[], cols: string[][]) => {
      const t = canvas(1024, 64, g => {
        const seg = 1024 / words.length;
        words.forEach((w, i) => { g.fillStyle = cols[i % cols.length][0]; g.fillRect(i * seg, 0, seg, 64); g.fillStyle = cols[i % cols.length][1]; g.font = 'italic 800 44px "Barlow Condensed", "Arial Narrow", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(w, i * seg + seg / 2, 34); });
      });
      t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / 40, 1); this.leds.push(t);
      return new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), new THREE.MeshBasicMaterial({ map: t }));
    };
    const cols = [['#ff3d63', '#ffffff'], ['#0d1233', '#39f0c8'], ['#ffd23f', '#12142b'], ['#1769e0', '#ffffff']];
    const words = ['DRIBBLER', 'DOKSANA TAK', 'KALEYİ GÖR', 'BİR DAHA'];
    for (const s of [1, -1]) { const b = led(130, words, cols); b.position.set(24.5 * s, 0.58, 10); b.rotation.y = -s * Math.PI / 2; scene.add(b); }
    const eb = led(60, words, cols); eb.position.set(0, 0.58, GZ - 6.5); scene.add(eb);
    // kale arkası: foto muhabirleri
    const photog = new THREE.MeshStandardMaterial({ color: 0x23233a, roughness: 0.9 }), vest = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8 });
    for (let i = -6; i <= 6; i++) { if (Math.abs(i) < 2) continue; const x = i * 2.1 + (Math.random() - 0.5); const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.35, 3, 8), i % 2 ? vest : photog); body.position.set(x, 0.45, GZ - 4.6); const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), photog); head.position.set(x, 0.95, GZ - 4.6); scene.add(body, head); }

    // tribünler: iki kat, arada ışıklı bant
    const crowdTex = () => {
      const t = canvas(512, 256, g => {
        g.fillStyle = '#141130'; g.fillRect(0, 0, 512, 256);
        const pal = ['#ff4d6d', '#ffd23f', '#39f0c8', '#f4f4f0', '#6a8cff', '#ff9a4d', '#35305c', '#35305c', '#4c4478', '#221d44'];
        for (let r = 0; r < 26; r++) for (let x = 0; x < 128; x++) {
          const c = pal[(Math.random() * pal.length) | 0], px = x * 4 + (r % 2) * 2, py = 6 + r * 9.6;
          g.fillStyle = c; g.fillRect(px, py + 2.4, 3, 4.5);                       // gövde
          g.fillStyle = '#d9b08c'; g.beginPath(); g.arc(px + 1.5, py + 1, 1.5, 0, 7); g.fill();  // baş
        }
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping; this.crowds.push(t); return t;
    };
    const fpos: number[] = [];
    const stand = (len: number, x: number, z: number, ry: number) => {
      const dirX = -Math.sin(ry), dirZ = -Math.cos(ry);   // sahadan uzaklaşan yön
      for (let tier = 0; tier < 2; tier++) {
        const t = crowdTex(); t.repeat.set(len / 30, 1);
        const h = tier ? 15 : 11, back = tier ? 13 : 0, y0 = tier ? 10.5 : 1.6, tilt = tier ? 0.72 : 0.6;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshBasicMaterial({ map: t }));
        const cy = y0 + Math.cos(tilt) * h / 2, cb = back + Math.sin(tilt) * h / 2;
        m.position.set(x + dirX * cb, cy, z + dirZ * cb); m.rotation.y = ry; m.rotateX(-tilt); scene.add(m);
        for (let i = 0; i < 90; i++) { const u = (Math.random() - 0.5) * len, v = Math.random() * h, bb = back + Math.sin(tilt) * v; fpos.push(x + dirX * bb + Math.cos(ry) * u, y0 + Math.cos(tilt) * v, z + dirZ * bb - Math.sin(ry) * u); }
      }
      const band = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.3), new THREE.MeshBasicMaterial({ color: 0x39f0c8 })); band.position.set(x + dirX * 9.2, 10.2, z + dirZ * 9.2); band.rotation.y = ry; scene.add(band);
      const fascia = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), new THREE.MeshBasicMaterial({ color: 0x0b0a1e })); fascia.position.set(x + dirX * 9.3, 8.3, z + dirZ * 9.3); fascia.rotation.y = ry; scene.add(fascia);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(len, 16), new THREE.MeshBasicMaterial({ color: 0x08071a, side: THREE.DoubleSide })); roof.position.set(x + dirX * 17, 24.5, z + dirZ * 17); roof.rotation.y = ry; roof.rotateX(Math.PI / 2 - 0.12); scene.add(roof);
    };
    stand(150, 33, 6, -Math.PI / 2); stand(150, -33, 6, Math.PI / 2); stand(120, 0, GZ - 15, 0);
    // tribündeki flaşlar
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    const fc = new Float32Array(fpos.length); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3)); this.flashLife = new Float32Array(fpos.length / 3);
    const dot = canvas(32, 32, g => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
    this.flashes = new THREE.Points(fg, new THREE.PointsMaterial({ size: 2.6, map: dot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.flashes.frustumCulled = false; scene.add(this.flashes);

    // projektör kuleleri ve ışık pusu
    const glow = canvas(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,252,235,1)'); gr.addColorStop(0.2, 'rgba(255,235,190,0.6)'); gr.addColorStop(1, 'rgba(255,210,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const gm = new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const haze = new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.16 });
    for (const [x, z] of [[-44, GZ - 22], [44, GZ - 22], [-46, 34], [46, 34]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 34, 6), new THREE.MeshBasicMaterial({ color: 0x0b0a1e })); pole.position.set(x, 17, z); scene.add(pole);
      for (let r = 0; r < 2; r++) for (let k = -2; k <= 2; k++) { const sp = new THREE.Sprite(gm); sp.scale.setScalar(5.5); sp.position.set(x + k * 1.5, 33 + r * 1.6, z); scene.add(sp); }
      const hz = new THREE.Sprite(haze); hz.scale.setScalar(60); hz.position.set(x * 0.9, 31, z * 0.95); scene.add(hz);
    }
  }

  /** Tribünün heyecanı (0..1): flaşlar ve zıplama buna bağlı */
  excite(v: number) { this.hypeTo = v; if (v > this.hype) this.hype = v; }

  netHit(x: number, y: number, power: number) {
    const pos = this.net.geometry.attributes.position, ly = (y - GOAL_H / 2) * BACK_H / GOAL_H;
    for (let i = 0; i < pos.count; i++) { const dx = pos.getX(i) - x, dy = pos.getY(i) - ly; this.vel[i] -= power * Math.exp(-(dx * dx + dy * dy) / 0.7); }
    this.netLive = 3;
  }
  /** Arka ağın (x, y) noktasındaki dünya z konumu; esneme dahil */
  backZ(x: number, y: number) {
    const pos = this.net.geometry.attributes.position, ly = (y - GOAL_H / 2) * BACK_H / GOAL_H; let best = 0, bd = 1e9;
    for (let i = 0; i < pos.count; i++) { const dx = pos.getX(i) - x, dy = pos.getY(i) - ly, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = this.off[i]; } }
    return GZ - NET_BOT + (Math.max(0, Math.min(GOAL_H, y)) / GOAL_H) * (NET_BOT - NET_TOP) + best;
  }

  update(dt: number) {
    this.clock += dt; this.hype += (this.hypeTo - this.hype) * Math.min(1, dt * 0.6);
    for (const t of this.leds) t.offset.x += dt * 0.035;
    // tribün: heyecanlandıkça zıplar
    const jump = Math.abs(Math.sin(this.clock * 7)) * 0.006 * Math.max(0, this.hype - 0.3) / 0.7;
    this.crowds.forEach((t, i) => { t.offset.y = jump * (i % 2 ? 1 : 0.7); });
    // flaşlar
    const col = this.flashes.geometry.attributes.color as THREE.BufferAttribute, n = this.flashLife.length;
    for (let k = 0, m = Math.random() < 0.3 + this.hype * 4 ? 1 + Math.floor(this.hype * 5) : 0; k < m; k++) this.flashLife[(Math.random() * n) | 0] = 1;
    for (let i = 0; i < n; i++) { const l = this.flashLife[i]; if (l > 0) this.flashLife[i] = Math.max(0, l - dt * 9); col.setXYZ(i, l, l, l); }
    col.needsUpdate = true;
    // file
    if (this.netLive > 0) {
      this.netLive -= dt;
      const pos = this.net.geometry.attributes.position, h = Math.min(dt, 0.02);
      for (let i = 0; i < pos.count; i++) {
        const ex = GOAL_W - Math.abs(pos.getX(i)), ey = BACK_H / 2 - Math.abs(pos.getY(i)), pin = Math.max(0, Math.min(1, Math.min(ex, ey) / 0.6));
        this.vel[i] += (-90 * this.off[i] - 7 * this.vel[i]) * h; this.off[i] = Math.max(-1.3, this.off[i] + this.vel[i] * h);
        pos.setZ(i, this.off[i] * pin);
      }
      pos.needsUpdate = true;
    }
  }

  follow(x: number, z: number) { this.sun.position.set(x + 9, 20, z + 12); this.sun.target.position.set(x, 0, z - 4); }
}
