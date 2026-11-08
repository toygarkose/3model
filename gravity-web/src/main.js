import './ui/style.css';
import LEVELS from './data/levels.json';
import { GLRenderer } from './render/gl.js';
import { Draw2D } from './render/draw2d.js';
import { Game } from './core/game.js';
import { FX } from './fx/fx.js';
import { Audio } from './audio/audio.js';
import { Store } from './store.js';
import { UI } from './ui/ui.js';
import { haptics } from './fx/haptics.js';
import { WORLDS } from './data/worlds.js';

const store = new Store();
const audio = new Audio();
audio.enabled = store.d.settings.sound !== false;
haptics.enabled = store.d.settings.haptics !== false;

const glCanvas = document.getElementById('gl'), fxCanvas = document.getElementById('fx');
const gl = new GLRenderer(glCanvas);
const draw = new Draw2D(fxCanvas, gl);
const fx = new FX();
const ui = new UI(document.getElementById('ui'), { store, audio, levels: LEVELS });
const game = new Game({ levels: LEVELS, store, audio, fx, ui });
ui.game = game;

// Menu backdrop: a gas-giant level without the ship's input.
game.showcase = () => {
  const i = LEVELS.findIndex(l => l.id === 'w2-03');
  game.load(i >= 0 ? i : 0);
  game.state = 'idle';
};
const _load = game.load.bind(game);
game.load = (i) => { _load(i); gl.setHue(WORLDS.find(w => w.id === LEVELS[i].world)?.hue || 'blue'); };

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  gl.resize(window.innerWidth, window.innerHeight, dpr);
  draw.resize(window.innerWidth, window.innerHeight, dpr);
  game.layout();
}
window.addEventListener('resize', resize);
resize();

// input on the scene canvas
let pid = null;
fxCanvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (pid !== null) return;
  if (game.pointerDown(e.clientX, e.clientY)) { pid = e.pointerId; try { fxCanvas.setPointerCapture(pid); } catch (_) { /* */ } }
});
fxCanvas.addEventListener('pointermove', (e) => { if (e.pointerId === pid) game.pointerMove(e.clientX, e.clientY); });
const up = (e) => { if (e.pointerId !== pid) return; pid = null; game.pointerUp(); };
fxCanvas.addEventListener('pointerup', up);
fxCanvas.addEventListener('pointercancel', (e) => { if (e.pointerId !== pid) return; pid = null; game.aim = null; audio.chargeStop(); });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });

let last = performance.now();
window.__G = { game, ui, store, timeWarp: 1, levels: LEVELS };
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05) * window.__G.timeWarp;
  last = now;
  game.update(dt);
  draw.render(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => { last = t; frame(t); });
ui.showMenu();
setTimeout(() => document.getElementById('boot')?.remove(), 200);
