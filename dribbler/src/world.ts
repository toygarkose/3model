import * as THREE from 'three';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const wrap = (v: number, lo: number, len: number) => ((((v - lo) % len) + len) % len) + lo;

const STRIPE = 12; // bir açık + bir koyu çim şeridi (m)

export class World {
  private grass: THREE.Texture; private crowd: THREE.Texture[] = [];
  private movers: { o: THREE.Object3D; base: number; lo: number; len: number }[] = [];
  sun: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    scene.background = canvas(8, 256, g => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#0d1233'); gr.addColorStop(0.28, '#2b1d5c'); gr.addColorStop(0.44, '#8a3a78'); gr.addColorStop(0.52, '#ff8552'); gr.addColorStop(0.6, '#3a2550'); gr.addColorStop(1, '#1a1430');
      g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
    });
    scene.fog = new THREE.Fog(0x6a3566, 50, 135);

    scene.add(new THREE.HemisphereLight(0xcfd6ff, 0x2f5a3a, 1.15));
    const sun = this.sun = new THREE.DirectionalLight(0xffe2c4, 2.1);
    sun.position.set(7, 14, 6); sun.target.position.set(0, 0, -14);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -10; sc.right = 10; sc.top = 30; sc.bottom = -14; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0xff7ab0, 0.7); rim.position.set(-6, 5, -10); scene.add(rim);

    this.grass = canvas(64, 256, g => {
      g.fillStyle = '#2fae5a'; g.fillRect(0, 0, 64, 128);
      g.fillStyle = '#259a4f'; g.fillRect(0, 128, 64, 128);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,200' : '0,40,20'},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * 64, Math.random() * 256, 1, 3); }
    });
    this.grass.wrapS = this.grass.wrapT = THREE.RepeatWrapping; this.grass.repeat.set(10, 300 / STRIPE); this.grass.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(22, 300), new THREE.MeshStandardMaterial({ map: this.grass, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = -120; ground.receiveShadow = true; scene.add(ground);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(90, 300), new THREE.MeshStandardMaterial({ color: 0x241a3a, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.02, -120); scene.add(apron);

    const white = new THREE.MeshBasicMaterial({ color: 0xf4fff0, fog: true });
    for (const s of [1, -1]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 300), white); l.rotation.x = -Math.PI / 2; l.position.set(5.9 * s, 0.01, -120); scene.add(l);
    }
    // sahada akan çizgiler: orta çizgi + daire, belli aralıklarla tekrar eder
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const line = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 0.14), white); line.rotation.x = -Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.74, 48), white); ring.rotation.x = -Math.PI / 2;
      g.add(line, ring); g.position.y = 0.012; scene.add(g);
      this.movers.push({ o: g, base: -40 - i * 90, lo: -170, len: 180 });
    }

    // reklam panoları
    const words = ['DRIBBLER', 'ÇALIM AT', 'TOP SENDE', 'SERİYİ BOZMA', 'DRIBBLER', 'BİR DAHA'];
    const cols = [['#ff4d6d', '#fff'], ['#12142b', '#39f0c8'], ['#ffd23f', '#1b1b2a'], ['#1769e0', '#fff'], ['#39f0c8', '#12142b'], ['#f4f4f0', '#e02b3c']];
    const boardMats = words.map((w, i) => new THREE.MeshBasicMaterial({
      map: canvas(512, 64, g => {
        g.fillStyle = cols[i][0]; g.fillRect(0, 0, 512, 64);
        g.fillStyle = cols[i][1]; g.font = 'italic 800 46px "Barlow Condensed", "Arial Narrow", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(w, 256, 34);
      }),
    }));
    const boardGeo = new THREE.PlaneGeometry(11.6, 1.15);
    for (let i = 0; i < 14; i++) for (const s of [1, -1]) {
      const b = new THREE.Mesh(boardGeo, boardMats[(i + (s > 0 ? 0 : 3)) % boardMats.length]);
      b.position.set(8.6 * s, 0.6, 0); b.rotation.y = -s * Math.PI / 2;
      scene.add(b); this.movers.push({ o: b, base: -i * 12, lo: -150, len: 168 });
    }

    // tribünler
    for (const s of [1, -1]) {
      const tex = canvas(512, 256, g => {
        g.fillStyle = '#1c1634'; g.fillRect(0, 0, 512, 256);
        const pal = ['#ff4d6d', '#ffd23f', '#39f0c8', '#f4f4f0', '#6a8cff', '#ff9a4d', '#3b3560', '#3b3560', '#544a80'];
        for (let r = 0; r < 20; r++) for (let x = 0; x < 86; x++) {
          g.fillStyle = pal[(Math.random() * pal.length) | 0];
          g.beginPath(); g.arc(x * 6 + (r % 2) * 3 + 2, 10 + r * 12.3, 2.3, 0, 7); g.fill();
        }
      });
      tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(8, 1); this.crowd.push(tex);
      const stand = new THREE.Mesh(new THREE.PlaneGeometry(300, 20), new THREE.MeshBasicMaterial({ map: tex }));
      stand.position.set(18.5 * s, 7.6, -120); stand.rotation.set(0, -s * Math.PI / 2, 0); stand.rotateX(-0.62);
      scene.add(stand);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(300, 7), new THREE.MeshBasicMaterial({ color: 0x120e26 }));
      roof.position.set(24 * s, 16.5, -120); roof.rotation.set(0, -s * Math.PI / 2, 0); roof.rotateX(0.5); scene.add(roof);
    }
    // projektörler
    const glow = canvas(64, 64, g => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.25, 'rgba(255,225,170,0.55)'); gr.addColorStop(1, 'rgba(255,200,150,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    const gm = new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 19, 6), new THREE.MeshBasicMaterial({ color: 0x1a1430 })); pole.position.y = 9.5; g.add(pole);
      for (let k = -1; k <= 1; k++) { const sp = new THREE.Sprite(gm); sp.scale.setScalar(7); sp.position.set(0, 19.5, k * 1.6); g.add(sp); }
      g.position.x = 21 * s; scene.add(g); this.movers.push({ o: g, base: -20 - i * 56, lo: -160, len: 168 });
    }
  }

  update(dist: number) {
    this.grass.offset.y = dist / STRIPE;
    for (const t of this.crowd) t.offset.x = 0; // tribün sabit, panolar ve çizgiler akar
    for (const m of this.movers) m.o.position.z = wrap(m.base + dist, m.lo, m.len);
  }
}
