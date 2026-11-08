import './ui/style.css';
import { Engine, detectQuality } from './core/engine.js';
import { Stadium } from './scene/stadium.js';
import { CameraController } from './scene/cameraController.js';
import { GestureInput } from './input/gesture.js';
import { AudioManager } from './audio/audio.js';
import { Career } from './career/career.js';
import { LevelManager } from './game/levelManager.js';
import { UI } from './ui/ui.js';

// Boot order: save data -> renderer -> stadium -> systems -> UI.
const career = new Career();
const q = career.data.settings.quality;
const quality = q === 'auto' || !q ? detectQuality() : q;

const engine = new Engine(document.getElementById('scene'), quality);
const stadium = new Stadium(engine.scene, engine.renderer, quality);
const camera = new CameraController(engine.camera);
const gesture = new GestureInput(document.getElementById('scene'), document.getElementById('trail'));
const audio = new AudioManager();
audio.enabled = career.data.settings.sound !== false;

const ui = new UI(document.getElementById('ui'), { career, audio });
const game = new LevelManager({ engine, stadium, camera, gesture, audio, career, ui });
ui.game = game;

engine.onUpdate((dt) => { game.update(dt); stadium.update(dt); });
engine.start();
ui.showMenu();

// unlock audio on the first touch anywhere
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });

setTimeout(() => document.getElementById('boot').classList.add('done'), 300);

// Debug / automated-test hooks.
window.__LT = { game, ui, career, engine, api: game.testApi() };
