import * as THREE from 'three';
import { PITCH, GOAL, BOX, SIX } from '../game/config.js';
import { grassTexture, apronTexture, netTexture, adBoardTexture, glowTexture } from './textures.js';

const LINE_W = 0.12;
const LINE_Y = 0.012;

export class Stadium {
  constructor(scene, renderer, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.excite = 0;           // crowd excitement 0..1
    this.ripples = [];
    this._sky();
    this._lights();
    this._pitch(renderer);
    this._lines();
    this.goals = [this._goal(GOAL.z, 1), this._goal(-GOAL.z, -1)];
    this._boards();
    this._stands();
    this._floodlights();
  }

  _sky() {
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x050a1c) }, mid: { value: new THREE.Color(0x14204a) }, bottom: { value: new THREE.Color(0x2a2340) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){ float y = vP.y; vec3 c = mix(bottom, mid, smoothstep(-0.05, 0.18, y)); c = mix(c, top, smoothstep(0.18, 0.7, y));
          vec3 q = floor(vP * 260.0); float s = step(0.9975, h(q)) * smoothstep(0.15, 0.5, y); c += vec3(s * 0.8);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
    this.scene.fog = new THREE.Fog(0x141a33, 140, 380);
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x2a4a22, 0.9);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2dc, 2.4);
    key.position.set(-30, 60, 25);
    key.castShadow = this.quality === 'high';
    key.shadow.mapSize.set(2048, 2048);
    const s = key.shadow.camera;
    s.left = -30; s.right = 30; s.top = 30; s.bottom = -30; s.near = 10; s.far = 160;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.scene.add(key.target);
    this.key = key;
    const fill = new THREE.DirectionalLight(0xa8b8ff, 0.7);
    fill.position.set(40, 40, -30);
    this.scene.add(fill);
  }

  // Keep the shadow camera centred on the action so shadows stay sharp.
  focusShadows(p) {
    this.key.target.position.set(p.x, 0, p.z);
    this.key.position.set(p.x - 30, 60, p.z + 25);
  }

  _pitch(renderer) {
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH.width + 24, PITCH.length + 26),
      new THREE.MeshLambertMaterial({ map: apronTexture() }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.01;
    apron.receiveShadow = true;
    this.group.add(apron);
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH.width + 4, PITCH.length + 4),
      new THREE.MeshStandardMaterial({ map: grassTexture(Math.min(8, aniso)), roughness: 0.95, metalness: 0 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.group.add(pitch);
    this.pitch = pitch;
  }

  _lines() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f6f0, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2 });
    const g = this.group;
    const rect = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, LINE_Y, z); g.add(m);
    };
    const outline = (x0, z0, x1, z1) => {
      rect((x0 + x1) / 2, z0, Math.abs(x1 - x0) + LINE_W, LINE_W);
      rect((x0 + x1) / 2, z1, Math.abs(x1 - x0) + LINE_W, LINE_W);
      rect(x0, (z0 + z1) / 2, LINE_W, Math.abs(z1 - z0));
      rect(x1, (z0 + z1) / 2, LINE_W, Math.abs(z1 - z0));
    };
    const arc = (x, z, r, a0, a1) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - LINE_W / 2, r + LINE_W / 2, 64, 1, a0, a1 - a0), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, LINE_Y, z); g.add(m);
    };
    const W = PITCH.halfW, L = PITCH.halfL;
    outline(-W, -L, W, L);
    rect(0, 0, PITCH.width, LINE_W);
    arc(0, 0, 9.15, 0, Math.PI * 2);
    arc(0, 0, 0.18, 0, Math.PI * 2);
    for (const s of [-1, 1]) {
      const gz = s * L;
      outline(-BOX.halfWidth, gz, BOX.halfWidth, gz - s * BOX.depth);
      outline(-SIX.halfWidth, gz, SIX.halfWidth, gz - s * SIX.depth);
      const spot = gz - s * 11;
      arc(0, spot, 0.15, 0, Math.PI * 2);
      // Ring angle phi maps to world direction (cos phi, -sin phi) in (x, z).
      // The "D" lies outside the box, i.e. toward the centre of the pitch.
      const alpha = Math.acos((BOX.depth - 11) / 9.15);
      const centre = s < 0 ? (3 * Math.PI) / 2 : Math.PI / 2;
      arc(0, spot, 9.15, centre - alpha, centre + alpha);
    }
    // corner arcs: quarter circles opening into the pitch
    for (const [cx, cz, p0, p1] of [[-W, -L, -Math.PI / 2, 0], [W, -L, Math.PI, 1.5 * Math.PI], [W, L, Math.PI / 2, Math.PI], [-W, L, 0, Math.PI / 2]]) {
      arc(cx, cz, 1, p0, p1);
    }
  }

  _goal(z, dir) {
    // dir = 1 for the goal at -z (net extends further to -z), -1 for the other end
    const grp = new THREE.Group();
    grp.position.z = z;
    if (dir < 0) grp.rotation.y = Math.PI;
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
    const r = GOAL.postR, w = GOAL.halfWidth, h = GOAL.height, d = GOAL.depth;
    const cyl = (len) => new THREE.CylinderGeometry(r, r, len, 12);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(cyl(h + r), postMat);
      p.position.set(sx * w, (h + r) / 2, 0); p.castShadow = true; grp.add(p);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 8), postMat);
      back.position.set(sx * w, h / 2, -d); grp.add(back);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, d, 8), postMat);
      strut.rotation.x = Math.PI / 2; strut.position.set(sx * w, h, -d / 2); grp.add(strut);
    }
    const bar = new THREE.Mesh(cyl(2 * w + 2 * r), postMat);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, h, 0); bar.castShadow = true; grp.add(bar);

    const tex = netTexture();
    const netMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, alphaTest: 0.2, depthWrite: false });
    const mk = (geo, rx, ry, rw, rh) => { const t = tex.clone(); t.repeat.set(rw, rh); t.needsUpdate = true; const m = new THREE.Mesh(geo, netMat.clone()); m.material.map = t; return m; };
    const backGeo = new THREE.PlaneGeometry(2 * w, h, 28, 10);
    const back = mk(backGeo, 0, 0, 2 * w / 0.18, h / 0.18);
    back.position.set(0, h / 2, -d);
    grp.add(back);
    const roof = mk(new THREE.PlaneGeometry(2 * w, d, 28, 8), 0, 0, 2 * w / 0.18, d / 0.18);
    roof.rotation.x = Math.PI / 2; roof.position.set(0, h, -d / 2); grp.add(roof);
    for (const sx of [-1, 1]) {
      const side = mk(new THREE.PlaneGeometry(d, h, 8, 10), 0, 0, d / 0.18, h / 0.18);
      side.rotation.y = Math.PI / 2; side.position.set(sx * w, h / 2, -d / 2); grp.add(side);
    }
    this.group.add(grp);
    const base = Float32Array.from(backGeo.attributes.position.array);
    return { grp, back, backGeo, base, dir };
  }

  // Net ripple when the ball hits the back of the net.
  rippleNet(atWorld, strength) {
    const g = this.goals[0];
    this.ripples.push({ x: atWorld.x, y: atWorld.y, s: strength, t: 0 });
    if (this.ripples.length > 3) this.ripples.shift();
    g.active = true;
  }

  _updateNet(dt) {
    const g = this.goals[0];
    if (!g.active) return;
    const pos = g.backGeo.attributes.position;
    const arr = pos.array, base = g.base;
    let alive = false;
    for (const r of this.ripples) { r.t += dt; if (r.t < 2.5) alive = true; }
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], y = base[i + 1] + GOAL.height / 2;
      let off = 0;
      for (const r of this.ripples) {
        const d2 = (x - r.x) ** 2 + (y - r.y) ** 2;
        off += r.s * 0.9 * Math.exp(-d2 / 1.1) * Math.cos(r.t * 14) * Math.exp(-r.t * 2.6);
      }
      arr[i + 2] = base[i + 2] - off;
    }
    pos.needsUpdate = true;
    if (!alive) { g.active = false; this.ripples = []; }
  }

  _boards() {
    const tex = adBoardTexture();
    this.boardTex = tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const h = 0.9;
    const add = (x, z, len, ry, rep) => {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rep, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat.clone());
      m.material.map = t;
      m.position.set(x, h / 2, z); m.rotation.y = ry;
      this.group.add(m);
      (this.boardTexs ||= []).push(t);
    };
    add(-PITCH.halfW - 4, 0, PITCH.length + 8, Math.PI / 2, 2.4);
    add(PITCH.halfW + 4, 0, PITCH.length + 8, -Math.PI / 2, 2.4);
    add(-21, GOAL.z - 5, 30, 0, 0.8);
    add(21, GOAL.z - 5, 30, 0, 0.8);
    add(-21, -GOAL.z + 5, 30, Math.PI, 0.8);
    add(21, -GOAL.z + 5, 30, Math.PI, 0.8);
  }

  _stands() {
    const concrete = new THREE.MeshLambertMaterial({ color: 0x3a4160 });
    const rows = 14, rowD = 0.85, rise = 0.55;
    const sections = [
      // [centre x, centre z, length, rotationY, distance from pitch centre line]
      { x: -(PITCH.halfW + 8), z: 0, len: PITCH.length + 10, ry: -Math.PI / 2 },
      { x: PITCH.halfW + 8, z: 0, len: PITCH.length + 10, ry: Math.PI / 2 },
      { x: 0, z: -(PITCH.halfL + 9), len: PITCH.width + 14, ry: 0 },
      { x: 0, z: PITCH.halfL + 9, len: PITCH.width + 14, ry: Math.PI },
    ];
    const density = this.quality === 'high' ? 0.62 : this.quality === 'medium' ? 0.85 : 1.2;
    const seats = [];
    for (const s of sections) {
      const grp = new THREE.Group();
      grp.position.set(s.x, 0, s.z);
      grp.rotation.y = s.ry;
      // local frame: stand rises toward -z (away from pitch), runs along x
      for (let r = 0; r < rows; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(s.len, rise, rowD), concrete);
        step.position.set(0, rise * (r + 0.5) + 1.2, -r * rowD);
        grp.add(step);
        for (let x = -s.len / 2 + 0.5; x < s.len / 2 - 0.5; x += density) {
          seats.push({ grp, x: x + (Math.random() - 0.5) * 0.15, y: rise * (r + 1) + 1.2, z: -r * rowD + 0.1, row: r });
        }
      }
      // facade below the first row and a roof
      const face = new THREE.Mesh(new THREE.BoxGeometry(s.len, 1.2, 0.3), new THREE.MeshLambertMaterial({ color: 0x151a2a }));
      face.position.set(0, 0.6, 0.45); grp.add(face);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(s.len + 4, 0.4, rows * rowD + 2), new THREE.MeshLambertMaterial({ color: 0x232a44 }));
      roof.position.set(0, rise * rows + 16, -rows * rowD / 2);
      roof.rotation.x = -0.08;
      grp.add(roof);
      // roof light strip
      const strip = new THREE.Mesh(new THREE.BoxGeometry(s.len, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
      strip.position.set(0, rise * rows + 15.6, 0.9); grp.add(strip);

      this.group.add(grp);
      grp.updateMatrixWorld(true);
    }
    // corner blocks close the gaps between the four stands
    const cornerMat = new THREE.MeshLambertMaterial({ color: 0x1a2034 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(22, rise * rows + 3, 22), cornerMat);
      c.position.set(sx * (PITCH.halfW + 15), (rise * rows + 3) / 2, sz * (PITCH.halfL + 16));
      this.group.add(c);
    }
    // crowd: one instanced mesh, animated in the vertex shader
    const geo = new THREE.BoxGeometry(0.42, 0.62, 0.3);
    geo.translate(0, 0.31, 0);
    const head = new THREE.BoxGeometry(0.22, 0.24, 0.22); head.translate(0, 0.76, 0);
    const merged = mergeGeometries([geo, head]);
    const phase = new Float32Array(seats.length);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.uniforms.uExcite = { value: 0 };
      this.crowdShader = sh;
      sh.vertexShader = 'attribute float aPhase;\nuniform float uTime;\nuniform float uExcite;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float bounce = abs(sin(uTime * (5.0 + fract(aPhase * 7.3) * 3.0) + aPhase * 6.2831));
         transformed.y += bounce * (0.03 + uExcite * 0.45);
         transformed.x += sin(uTime * 1.3 + aPhase * 20.0) * 0.03;`);
    };
    const crowd = new THREE.InstancedMesh(merged, mat, seats.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const palette = [0x0f6e78, 0x0f6e78, 0x0f6e78, 0xf2f2ee, 0x1b2235, 0x3a3f55, 0xb3262e, 0xd9a23a, 0x5a6a8a, 0x0b4f57];
    seats.forEach((s, i) => {
      const v = new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(s.grp.matrixWorld);
      const rot = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(s.grp.matrixWorld));
      m4.compose(v, rot, new THREE.Vector3(1, 0.9 + Math.random() * 0.2, 1));
      crowd.setMatrixAt(i, m4);
      c.setHex(palette[(Math.random() * palette.length) | 0]).multiplyScalar(0.6 + Math.random() * 0.5);
      crowd.setColorAt(i, c);
      phase[i] = Math.random();
    });
    geo.dispose();
    merged.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    crowd.frustumCulled = false;
    this.group.add(crowd);
    this.crowd = crowd;
    this.seats = seats;
  }

  _floodlights() {
    const glow = glowTexture();
    const mat = new THREE.SpriteMaterial({ map: glow, color: 0xfff0d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const mastMat = new THREE.MeshLambertMaterial({ color: 0x1b2030 });
    for (const [x, z] of [[-48, -66], [48, -66], [-48, 66], [48, 66]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 42, 8), mastMat);
      mast.position.set(x, 21, z); this.group.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
      head.position.set(x, 43, z); head.lookAt(0, 0, 0); this.group.add(head);
      const s = new THREE.Sprite(mat);
      s.position.set(x * 0.98, 43, z * 0.98); s.scale.set(34, 34, 1);
      this.group.add(s);
    }
    // camera flashes in the crowd during big moments
    const fl = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    this.flashes = [];
    for (let i = 0; i < 40; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fl, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.scale.set(1.6, 1.6, 1);
      this.group.add(sp);
      this.flashes.push({ sp, t: 0 });
    }
  }

  cheer(amount = 1) { this.excite = Math.max(this.excite, amount); }

  update(dt) {
    this.time += dt;
    this.excite = Math.max(0.05, this.excite - dt * 0.12);
    if (this.crowdShader) {
      this.crowdShader.uniforms.uTime.value = this.time;
      this.crowdShader.uniforms.uExcite.value = this.excite;
    }
    for (const t of this.boardTexs || []) t.offset.x = (t.offset.x + dt * 0.035) % 1;
    this._updateNet(dt);
    // flashes
    for (const f of this.flashes) {
      f.t -= dt;
      if (f.t <= 0 && Math.random() < dt * (0.4 + this.excite * 30)) {
        const s = this.seats[(Math.random() * this.seats.length) | 0];
        const v = new THREE.Vector3(s.x, s.y + 0.8, s.z).applyMatrix4(s.grp.matrixWorld);
        f.sp.position.copy(v);
        f.t = 0.12;
      }
      f.sp.material.opacity = f.t > 0 ? f.t / 0.12 : 0;
    }
  }
}

// Minimal geometry merge (avoids pulling in BufferGeometryUtils for two parts).
function mergeGeometries(list) {
  const geos = list.map(g => g.index ? g.toNonIndexed() : g);
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
