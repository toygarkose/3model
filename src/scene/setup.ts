import * as THREE from 'three';
import type { Quality } from '../core/store';

export interface SceneKit {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Geçerli kalite için piksel oranını ve boyutu uygular. */
  resize(): void;
  setQuality(q: Quality): void;
  dispose(): void;
}

export const QUALITY_DPR: Record<Quality, number> = { high: 2, medium: 1.5, low: 1 };

export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Cihaza göre başlangıç kalitesi; çalışma anında kare süresine göre ayrıca düşürülür. */
export function detectQuality(): Quality {
  const forced = new URLSearchParams(location.search).get('kalite');
  if (forced === 'yuksek') return 'high';
  if (forced === 'orta') return 'medium';
  if (forced === 'dusuk') return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  if (mobile) return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

export function createSceneKit(canvas: HTMLCanvasElement, quality: Quality): SceneKit {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality !== 'low',
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b22);
  scene.fog = new THREE.Fog(0x0a1030, 750, 2600);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 5000);
  let q = quality;

  const resize = (): void => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    // devicePixelRatio 2 ile sınırlı; kalite düşünce daha da kısılır.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_DPR[q]));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  return {
    renderer,
    scene,
    camera,
    resize,
    setQuality(next: Quality) {
      q = next;
      resize();
    },
    dispose() {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      renderer.dispose();
    },
  };
}

/** Canvas'tan sRGB doku üretir. */
export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Bir nesne ağacındaki bütün geometri, malzeme ve dokuları serbest bırakır. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms) {
        for (const u of Object.values(uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
      }
      m.dispose();
    }
  });
}
