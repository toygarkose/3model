import * as THREE from 'three';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const wrap = (v: number, lo: number, len: number) => ((((v - lo) % len) + len) % len) + lo;

const STRIPE = 12; // bir açık + bir koyu çim şeridi (m)

export const GOAL_W = 3.66, GOAL_H = 2.44, BOX = 15;

export class World {
  private circle!: THREE.Group; private goal!: THREE.Group; private netBack!: THREE.Mesh; private netV = 0;
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
    // atak başlangıcı: orta çizgi + orta yuvarlak
    const circle = this.circle = new THREE.Group();
    const flat = (w: number, h: number, x: number, z: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), white); m.rotation.x = -Math.PI / 2; m.position.set(x, 0, z); return m; };
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.74, 48), white); ring.rotation.x = -Math.PI / 2;
    circle.add(flat(11.8, 0.14, 0, 0), ring); circle.position.y = 0.012; scene.add(circle);
    // atak sonu: ceza sahası, kale, file ve kale arkası tribün (z = 0 kale çizgisi)
    const goal = this.goal = new THREE.Group(); goal.position.y = 0.012; scene.add(goal);
    goal.add(flat(11.8, 0.14, 0, 0), flat(11.8, 0.14, 0, BOX), flat(0.14, BOX, -5.2, BOX / 2), flat(0.14, BOX, 5.2, BOX / 2), flat(8.6, 0.14, 0, 4.5), flat(0.14, 4.5, -4.3, 2.25), flat(0.14, 4.5, 4.3, 2.25));
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), white); spot.rotation.x = -Math.PI / 2; spot.position.z = 9.5; goal.add(spot);
    const arc = new THREE.Mesh(new THREE.RingGeometry(6.9, 7.04, 40, 1, Math.PI + 0.92, Math.PI - 1.84), white); arc.rotation.x = -Math.PI / 2; arc.position.z = 9.5; goal.add(arc);
    const postM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (const sx of [1, -1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOAL_H, 12), postM); p.position.set(GOAL_W * sx, GOAL_H / 2, 0); p.castShadow = true; goal.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOAL_W * 2 + 0.14, 12), postM); bar.rotation.z = Math.PI / 2; bar.position.y = GOAL_H; bar.castShadow = true; goal.add(bar);
    const netTex = canvas(64, 64, g => { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64); });
    const net = (w: number, h: number) => { const t = netTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 0.3, h / 0.3); t.needsUpdate = true; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })); };
    const back = this.netBack = net(GOAL_W * 2, GOAL_H); back.position.set(0, GOAL_H / 2, -2); goal.add(back);
    const top = net(GOAL_W * 2, 2); top.rotation.x = Math.PI / 2; top.position.set(0, GOAL_H, -1); goal.add(top);
    for (const sx of [1, -1]) { const side = net(2, GOAL_H); side.rotation.y = Math.PI / 2; side.position.set(GOAL_W * sx, GOAL_H / 2, -1); goal.add(side); }
    const endTex = canvas(512, 256, g => {
      g.fillStyle = '#1c1634'; g.fillRect(0, 0, 512, 256);
      const pal = ['#ff4d6d', '#ffd23f', '#39f0c8', '#f4f4f0', '#6a8cff', '#ff9a4d', '#3b3560', '#3b3560', '#544a80'];
      for (let r = 0; r < 20; r++) for (let x = 0; x < 86; x++) { g.fillStyle = pal[(Math.random() * pal.length) | 0]; g.beginPath(); g.arc(x * 6 + (r % 2) * 3 + 2, 10 + r * 12.3, 2.3, 0, 7); g.fill(); }
    });
    endTex.wrapS = THREE.RepeatWrapping; endTex.repeat.set(2, 1);
    const end = new THREE.Mesh(new THREE.PlaneGeometry(80, 22), new THREE.MeshBasicMaterial({ map: endTex })); end.position.set(0, 8, -15); end.rotateX(-0.55); goal.add(end);
    const endBoard = new THREE.Mesh(new THREE.PlaneGeometry(40, 1.2), new THREE.MeshBasicMaterial({ color: 0xffd23f })); endBoard.position.set(0, 0.6, -5); goal.add(endBoard);
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(60, 12), new THREE.MeshBasicMaterial({ color: 0x241a3a })); turf.rotation.x = -Math.PI / 2; turf.position.set(0, 0.004, -8.5); goal.add(turf);

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

  /** Orta yuvarlağın ve kalenin o anki z konumu (null = görünmez) */
  setStage(circleZ: number | null, goalZ: number | null) {
    this.circle.visible = circleZ !== null && circleZ < 12 && circleZ > -160; if (circleZ !== null) this.circle.position.z = circleZ;
    this.goal.visible = goalZ !== null && goalZ > -175; if (goalZ !== null) this.goal.position.z = goalZ;
  }
  netKick() { this.netV = -9; }

  update(dist: number, dt = 0) {
    // file: top çarpınca geriye esner, yay gibi geri gelir
    const z = this.netBack.position.z + 2; this.netV += (-120 * z - 9 * this.netV) * Math.min(dt, 0.03); this.netBack.position.z = -2 + Math.max(-0.9, z + this.netV * Math.min(dt, 0.03));
    this.grass.offset.y = dist / STRIPE;
    for (const t of this.crowd) t.offset.x = 0; // tribün sabit, panolar ve çizgiler akar
    for (const m of this.movers) m.o.position.z = wrap(m.base + dist, m.lo, m.len);
  }
}
