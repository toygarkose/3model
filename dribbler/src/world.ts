import * as THREE from 'three';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const GZ = -30;          // kale çizgisi
export const HALF_W = 19.5;     // saha yarı genişliği
export const BACK_Z = 26;       // oyuncunun gidebileceği en geri nokta
export const GOAL_W = 3.66, GOAL_H = 2.44;

export class World {
  sun: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    scene.background = canvas(8, 256, g => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#0d1233'); gr.addColorStop(0.3, '#2b1d5c'); gr.addColorStop(0.5, '#8a3a78'); gr.addColorStop(0.62, '#ff8552'); gr.addColorStop(0.75, '#3a2550'); gr.addColorStop(1, '#1a1430');
      g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
    });
    scene.fog = new THREE.Fog(0x6a3566, 70, 190);
    scene.add(new THREE.HemisphereLight(0xcfd6ff, 0x2f5a3a, 1.15));
    const sun = this.sun = new THREE.DirectionalLight(0xffe2c4, 2.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 26; sc.bottom = -22; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0xff7ab0, 0.7); rim.position.set(-6, 5, -10); scene.add(rim);

    const grass = canvas(64, 256, g => {
      g.fillStyle = '#2fae5a'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#259a4f'; g.fillRect(0, 128, 64, 128);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,200' : '0,40,20'},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * 64, Math.random() * 256, 1, 3); }
    });
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(12, 96 / 11); grass.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(56, 96), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = 6; ground.receiveShadow = true; scene.add(ground);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(160, 180), new THREE.MeshStandardMaterial({ color: 0x241a3a, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.03, 0); scene.add(apron);

    // saha çizgileri
    const white = new THREE.MeshBasicMaterial({ color: 0xf4fff0 });
    const line = (x1: number, z1: number, x2: number, z2: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1), m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, len + 0.14), white);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(x2 - x1, z2 - z1)); m.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2); scene.add(m);
    };
    const W = HALF_W + 0.5, mid = 28;
    line(-W, GZ, W, GZ); line(-W, GZ, -W, mid + 20); line(W, GZ, W, mid + 20); line(-W, mid, W, mid);
    line(-13, GZ, -13, GZ + 13); line(13, GZ, 13, GZ + 13); line(-13, GZ + 13, 13, GZ + 13);
    line(-6, GZ, -6, GZ + 4.5); line(6, GZ, 6, GZ + 4.5); line(-6, GZ + 4.5, 6, GZ + 4.5);
    const ring = (x: number, z: number, r: number, a0 = 0, len = Math.PI * 2) => { const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.07, r + 0.07, 48, 1, a0, len), white); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); scene.add(m); };
    ring(0, mid, 7.5);
    ring(0, GZ + 9, 7.3, Math.PI + 0.58, Math.PI - 1.16);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), white); spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.012, GZ + 9); scene.add(spot);

    // kale
    const postM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const post = new THREE.CylinderGeometry(0.07, 0.07, GOAL_H, 12);
    for (const s of [1, -1]) { const p = new THREE.Mesh(post, postM); p.position.set(GOAL_W * s, GOAL_H / 2, GZ); p.castShadow = true; scene.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOAL_W * 2 + 0.14, 12), postM); bar.rotation.z = Math.PI / 2; bar.position.set(0, GOAL_H, GZ); bar.castShadow = true; scene.add(bar);
    const netTex = canvas(64, 64, g => { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64); });
    const net = (w: number, h: number) => { const t = netTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 0.3, h / 0.3); t.needsUpdate = true; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })); };
    const D = 2.0;
    const back = net(GOAL_W * 2, GOAL_H); back.position.set(0, GOAL_H / 2, GZ - D); scene.add(back);
    const top = net(GOAL_W * 2, D); top.rotation.x = Math.PI / 2; top.position.set(0, GOAL_H, GZ - D / 2); scene.add(top);
    for (const s of [1, -1]) { const side = net(D, GOAL_H); side.rotation.y = Math.PI / 2; side.position.set(GOAL_W * s, GOAL_H / 2, GZ - D / 2); scene.add(side); }

    // reklam panoları
    const words = ['DRIBBLER', 'ÇALIM AT', 'KALEYİ GÖR', 'DOKSANA TAK', 'DRIBBLER', 'BİR DAHA'];
    const cols = [['#ff4d6d', '#fff'], ['#12142b', '#39f0c8'], ['#ffd23f', '#1b1b2a'], ['#1769e0', '#fff'], ['#39f0c8', '#12142b'], ['#f4f4f0', '#e02b3c']];
    const mats = words.map((w, i) => new THREE.MeshBasicMaterial({ map: canvas(512, 64, g => { g.fillStyle = cols[i][0]; g.fillRect(0, 0, 512, 64); g.fillStyle = cols[i][1]; g.font = 'italic 800 46px "Barlow Condensed", "Arial Narrow", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(w, 256, 34); }) }));
    const bg = new THREE.PlaneGeometry(11.6, 1.15);
    for (let i = 0; i < 8; i++) for (const s of [1, -1]) { const b = new THREE.Mesh(bg, mats[(i + (s > 0 ? 0 : 3)) % 6]); b.position.set(24 * s, 0.6, GZ - 2 + i * 12); b.rotation.y = -s * Math.PI / 2; scene.add(b); }
    for (let i = -2; i <= 2; i++) { const b = new THREE.Mesh(bg, mats[(i + 8) % 6]); b.position.set(i * 12, 0.6, GZ - 6); scene.add(b); }

    // tribünler: iki yan + kale arkası
    const crowd = () => { const t = canvas(512, 256, g => {
      g.fillStyle = '#1c1634'; g.fillRect(0, 0, 512, 256);
      const pal = ['#ff4d6d', '#ffd23f', '#39f0c8', '#f4f4f0', '#6a8cff', '#ff9a4d', '#3b3560', '#3b3560', '#544a80'];
      for (let r = 0; r < 20; r++) for (let x = 0; x < 86; x++) { g.fillStyle = pal[(Math.random() * pal.length) | 0]; g.beginPath(); g.arc(x * 6 + (r % 2) * 3 + 2, 10 + r * 12.3, 2.3, 0, 7); g.fill(); }
    }); t.wrapS = THREE.RepeatWrapping; return t; };
    const stand = (len: number, x: number, z: number, ry: number) => {
      const t = crowd(); t.repeat.set(len / 38, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 22), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, 8.2, z); m.rotation.y = ry; m.rotateX(-0.6); scene.add(m);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(len, 8), new THREE.MeshBasicMaterial({ color: 0x120e26 })); roof.position.set(x + Math.sin(ry) * -5, 18, z + Math.cos(ry) * -5); roof.rotation.y = ry; roof.rotateX(0.5); scene.add(roof);
    };
    stand(130, 35, 0, -Math.PI / 2); stand(130, -35, 0, Math.PI / 2); stand(110, 0, GZ - 17, 0);
    const glow = canvas(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.25, 'rgba(255,225,170,0.55)'); gr.addColorStop(1, 'rgba(255,200,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const gm = new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const [x, z] of [[-38, GZ - 16], [38, GZ - 16], [-40, 20], [40, 20]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 24, 6), new THREE.MeshBasicMaterial({ color: 0x1a1430 })); pole.position.set(x, 12, z); scene.add(pole);
      for (let k = -1; k <= 1; k++) { const sp = new THREE.Sprite(gm); sp.scale.setScalar(8); sp.position.set(x + k * 1.8, 24.5, z); scene.add(sp); }
    }
  }

  /** Gölge alanı oyuncuyu takip eder. */
  follow(x: number, z: number) { this.sun.position.set(x + 7, 16, z + 8); this.sun.target.position.set(x, 0, z - 4); }
}
