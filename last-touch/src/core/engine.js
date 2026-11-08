import * as THREE from 'three';

// Renderer, scene, camera, resize handling and the frame loop.
export function detectQuality() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return coarse || small ? 'medium' : 'high';
}

export class Engine {
  constructor(canvas, quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const maxDpr = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.3, 900);
    this.camera.position.set(0, 30, 40);
    this.updaters = [];
    this.timeWarp = 1;      // >1 only in automated tests
    this.last = performance.now();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }

  get width() { return window.innerWidth; }
  get height() { return window.innerHeight; }
  get aspect() { return this.width / this.height; }

  baseFov() { return this.aspect < 1 ? 64 : this.aspect < 1.4 ? 54 : 46; }

  resize() {
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.aspect;
    this.camera.fov = this.baseFov();
    this.camera.updateProjectionMatrix();
  }

  onUpdate(fn) { this.updaters.push(fn); }

  start() {
    const loop = (now) => {
      const dt = Math.min((now - this.last) / 1000, 0.05) * this.timeWarp;
      this.last = now;
      for (const f of this.updaters) f(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame((t) => { this.last = t; loop(t); });
  }
}
