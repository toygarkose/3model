import * as THREE from 'three';

// All textures are generated at runtime on canvases — no image files needed.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// Mowed pitch: alternating stripes along the length plus fine noise.
export function grassTexture(maxAniso = 4) {
  const [c, g] = canvas(512, 1024);
  const stripes = 18;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#3f8a3a' : '#4a9a42';
    g.fillRect(0, (i / stripes) * c.height, c.width, c.height / stripes + 1);
  }
  const r = rng(7);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 22;
    d[i] += n * 0.6; d[i + 1] += n; d[i + 2] += n * 0.4;
  }
  g.putImageData(img, 0, 0);
  // soft wear patches
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '90,120,60' : '40,90,40'},${0.04 + r() * 0.05})`;
    g.beginPath();
    g.ellipse(r() * c.width, r() * c.height, 10 + r() * 40, 10 + r() * 60, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

export function apronTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2f6a2e';
  g.fillRect(0, 0, 256, 256);
  const r = rng(3);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '20,60,20' : '70,110,60'},0.25)`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Original ball design: white with navy tri-panels and an amber seam.
export function ballTexture() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 512, 256);
  const panels = [[64, 64], [192, 128], [320, 64], [448, 128], [64, 192], [320, 192], [192, 20], [448, 236]];
  for (const [x, y] of panels) {
    g.fillStyle = '#1c2a52';
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30);
    }
    g.closePath(); g.fill();
    g.strokeStyle = '#ffb020'; g.lineWidth = 4;
    g.beginPath(); g.arc(x, y, 40, 0.4, 1.6); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function netTexture() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3;
  for (let i = 0; i <= 128; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Scrolling LED advertising boards with fictional sponsors.
export function adBoardTexture() {
  const [c, g] = canvas(2048, 64);
  const brands = [
    ['LAST TOUCH', '#ffb020', '#0b1430'],
    ['NOVA AIR', '#ffffff', '#1d4fd8'],
    ['KICKLINE', '#0b1430', '#3ee0a0'],
    ['ORBIT MOBILE', '#ffffff', '#7a3cff'],
    ['HARBOR GAZETTE', '#0b1430', '#f2f2ee'],
    ['BREAKAWAY', '#ffffff', '#e0423e'],
    ['COASTAL CUP', '#0b1430', '#ffb020'],
    ['VOLTA ENERGY', '#0b1430', '#d6ff3e'],
  ];
  const w = c.width / brands.length;
  brands.forEach(([text, fg, bg], i) => {
    g.fillStyle = bg; g.fillRect(i * w, 0, w, 64);
    g.fillStyle = fg;
    g.font = '900 38px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, i * w + w / 2, 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function numberTexture(num, color = '#ffffff', name = '') {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (name) { g.font = 'bold 18px Arial, sans-serif'; g.fillText(name.toUpperCase().slice(0, 10), 64, 22); }
  g.font = '900 74px "Arial Black", Arial, sans-serif';
  g.fillText(String(num), 64, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture(inner = 'rgba(255,240,210,1)', outer = 'rgba(255,200,120,0)') {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.25, 'rgba(255,230,190,0.55)');
  gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function ringTexture() {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 60);
  gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function blobShadowTexture() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
