import * as THREE from 'three';
import { Game, Stats } from './game';
import { Sfx } from './audio';
import { Look } from './character';
import { KITS, BOOTS, BALLS, HAIRS, HAIR_COLORS, SKINS, NUMBERS, DEFAULT_LOADOUT, Loadout, pickRivalKit } from './cosmetics';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'dribbler.v1';
interface Save { best: number; loadout: Loadout; sound: boolean; hints: boolean; seenHow: boolean }
const save: Save = { best: 0, loadout: { ...DEFAULT_LOADOUT }, sound: true, hints: true, seenHow: false };
try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); Object.assign(save, s, { loadout: { ...DEFAULT_LOADOUT, ...(s.loadout || {}) } }); } } catch { /* kayıt yoksa varsayılan */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* kaydedilemezse oyun yine çalışır */ } };

const lookOf = (l: Loadout): Look => ({ kit: KITS[l.kit], number: l.number, boot: BOOTS[l.boots], hair: l.hair, hairColor: HAIR_COLORS[l.hairColor], skin: SKINS[l.skin] });
const rivalOf = (l: Loadout): Look => ({ kit: pickRivalKit(KITS[l.kit]), number: 4, boot: { color: '#22222c', sole: '#eeeeee' }, hair: 0, hairColor: '#1a1412', skin: '#c98e62' });

const app = $('app'), canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 0.56, 0.1, 400);
const sfx = new Sfx(); sfx.enabled = save.sound;

const hud = $('hud'), menu = $('menu'), over = $('over'), how = $('how'), pops = $('pops');
let lastScore = -1, lastLives = -1;
const game = new Game(scene, camera, sfx, {
  popup(text, kind) {
    const el = document.createElement('div'); el.className = 'pop ' + kind; el.textContent = text;
    pops.appendChild(el); while (pops.children.length > 3) pops.firstElementChild!.remove();
    el.addEventListener('animationend', () => el.remove());
  },
  hud(score, lives, time) {
    if (score !== lastScore) { $('score').textContent = String(score); lastScore = score; }
    if (lives !== lastLives) { $('lives').querySelectorAll('i').forEach((el, i) => el.classList.toggle('off', i >= lives)); lastLives = lives; }
    const bar = $('timebar'); bar.style.transform = `scaleX(${Math.max(0, time)})`; bar.classList.toggle('low', time < 0.3);
  },
  over(s: Stats) {
    const isBest = s.score > save.best; if (isBest) { save.best = s.score; persist(); }
    $('oScore').textContent = String(s.score); $('oBest').textContent = isBest ? 'Yeni rekor!' : 'En iyi: ' + save.best;
    $('oGoals').textContent = String(s.goals); $('oDrib').textContent = String(s.dribbles); $('oLong').textContent = s.longest ? s.longest + ' m' : '-';
    hud.hidden = true; stick.hidden = true; over.hidden = false;
  },
}, lookOf(save.loadout));
const applyLook = () => { game.setPlayerLook(lookOf(save.loadout)); game.setRivalLook(rivalOf(save.loadout)); game.setBall(BALLS[save.loadout.ball]); };
applyLook();
(document as any).fonts?.ready?.then(applyLook);

function resize() {
  const w = app.clientWidth, h = app.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app); resize();

// ---------- ekranlar ----------
function showMenu() { game.toMenu(); camera.updateProjectionMatrix(); menu.hidden = false; over.hidden = true; hud.hidden = true; how.hidden = true; $('best').textContent = 'En iyi skor: ' + save.best; }
function play() {
  sfx.unlock();
  if (!save.seenHow) { save.seenHow = true; persist(); menu.hidden = true; over.hidden = true; how.hidden = false; how.dataset.then = 'play'; return; }
  menu.hidden = true; over.hidden = true; how.hidden = true; hud.hidden = false; pops.innerHTML = ''; lastScore = lastLives = -1;
  game.start();
}
$('play').onclick = play; $('again').onclick = play; $('toMenu').onclick = () => { sfx.click(); showMenu(); };
$('bHow').onclick = () => { sfx.unlock(); sfx.click(); menu.hidden = true; how.hidden = false; how.dataset.then = 'menu'; };
$('howOk').onclick = () => { if (how.dataset.then === 'play') play(); else showMenu(); };
const tSound = $('tSound');
const syncToggles = () => { tSound.textContent = 'Ses: ' + (save.sound ? 'Açık' : 'Kapalı'); tSound.setAttribute('aria-pressed', String(save.sound)); };
tSound.onclick = () => { save.sound = !save.sound; sfx.unlock(); sfx.setEnabled(save.sound); sfx.click(); persist(); syncToggles(); };
syncToggles();

// ---------- soyunma odası ----------
type Tab = 'kit' | 'boots' | 'ball' | 'hair' | 'skin';
let tab: Tab = 'kit';
const opts = $('opts');
const kitBg = (k: typeof KITS[number]) => k.pattern === 'stripes' ? `repeating-linear-gradient(90deg,${k.a} 0 7px,${k.b} 7px 14px)` : k.pattern === 'pin' ? `repeating-linear-gradient(90deg,${k.a} 0 6px,${k.b} 6px 8px)` : k.pattern === 'hoops' ? `repeating-linear-gradient(0deg,${k.a} 0 8px,${k.b} 8px 16px)` : k.pattern === 'halves' ? `linear-gradient(90deg,${k.a} 50%,${k.b} 50%)` : k.pattern === 'sash' ? `linear-gradient(135deg,${k.a} 40%,${k.b} 40% 60%,${k.a} 60%)` : k.pattern === 'chest' ? `linear-gradient(0deg,${k.a} 52%,${k.b} 52% 72%,${k.a} 72%)` : k.a;
function row(label: string, items: { bg?: string; text?: string; name: string }[], sel: number, pick: (i: number) => void) {
  const wrap = document.createElement('div'); wrap.className = 'optrow';
  const h = document.createElement('div'); h.className = 'optlabel'; h.textContent = label + ' · ' + items[sel].name; wrap.appendChild(h);
  const list = document.createElement('div'); list.className = 'swatches';
  items.forEach((it, i) => {
    const b = document.createElement('button'); b.className = 'sw' + (it.text ? ' txt' : ''); b.setAttribute('aria-label', it.name); b.setAttribute('aria-pressed', String(i === sel));
    if (it.bg) b.style.background = it.bg; if (it.text) b.textContent = it.text;
    b.onclick = () => { sfx.unlock(); sfx.click(); pick(i); persist(); applyLook(); renderOpts(); };
    list.appendChild(b);
  });
  wrap.appendChild(list); opts.appendChild(wrap);
  const cur = list.children[sel] as HTMLElement; requestAnimationFrame(() => { list.scrollLeft = Math.max(0, cur.offsetLeft - list.clientWidth / 2 + cur.clientWidth / 2); });
}
function renderOpts() {
  opts.innerHTML = ''; const L = save.loadout;
  if (tab === 'kit') {
    row('Forma', KITS.map(k => ({ bg: kitBg(k), name: k.name })), L.kit, i => L.kit = i);
    row('Numara', NUMBERS.map(n => ({ text: String(n), name: String(n) })), Math.max(0, NUMBERS.indexOf(L.number)), i => L.number = NUMBERS[i]);
  } else if (tab === 'boots') row('Krampon', BOOTS.map(b => ({ bg: `linear-gradient(160deg,${b.color} 62%,${b.sole} 62%)`, name: b.name })), L.boots, i => L.boots = i);
  else if (tab === 'ball') row('Top', BALLS.map(b => ({ bg: `radial-gradient(circle at 50% 50%,${b.patch} 0 22%,${b.base} 24% 100%)`, name: b.name })), L.ball, i => L.ball = i);
  else if (tab === 'hair') {
    row('Saç', HAIRS.map(h => ({ text: h, name: h })), L.hair, i => L.hair = i);
    row('Saç rengi', HAIR_COLORS.map((c, i) => ({ bg: c, name: 'Renk ' + (i + 1) })), L.hairColor, i => L.hairColor = i);
  } else row('Ten', SKINS.map((c, i) => ({ bg: c, name: 'Ton ' + (i + 1) })), L.skin, i => L.skin = i);
  document.querySelectorAll<HTMLElement>('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
}
document.querySelectorAll<HTMLElement>('#tabs button').forEach(b => b.onclick = () => { sfx.unlock(); sfx.click(); tab = b.dataset.tab as Tab; renderOpts(); });
renderOpts();

// ---------- kontroller ----------
// Parmağı basılı tutup sürükle: hareket. Kısa ve hızlı yukarı fiske: şut.
const stick = $('stick'), knob = $('knob'), R = 54;
interface Touch { x0: number; y0: number; t0: number; x: number; y: number }
const touches = new Map<number, Touch>(); let stickId = -1;
canvas.addEventListener('pointerdown', e => {
  sfx.unlock(); if (game.mode === 'menu' || game.mode === 'over') return;
  touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t0: performance.now(), x: e.clientX, y: e.clientY });
  if (stickId < 0) { stickId = e.pointerId; const r = app.getBoundingClientRect(); stick.style.left = e.clientX - r.left + 'px'; stick.style.top = e.clientY - r.top + 'px'; knob.style.transform = ''; stick.hidden = false; }
});
window.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId); if (!t) return; t.x = e.clientX; t.y = e.clientY;
  if (e.pointerId !== stickId) return;
  let dx = (t.x - t.x0) / R, dy = (t.y - t.y0) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  knob.style.transform = `translate(${dx * R}px,${dy * R}px)`; game.setStick(m < 0.15 ? 0 : dx, m < 0.15 ? 0 : dy);
});
const end = (e: PointerEvent) => {
  const t = touches.get(e.pointerId); if (!t) return; touches.delete(e.pointerId);
  const dx = t.x - t.x0, dy = t.y - t.y0, dist = Math.hypot(dx, dy), dur = Math.max(16, performance.now() - t.t0);
  if (dur < 300 && dist > 38 && -dy > dist * 0.35) game.shoot(Math.atan2(dx, -dy), (dist / dur - 0.35) / 1.5, (dist / app.clientHeight - 0.07) / 0.3);
  if (e.pointerId === stickId) { stickId = -1; stick.hidden = true; game.setStick(0, 0); }
};
window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
const held = new Set<string>();
const keyStick = () => game.setStick((held.has('ArrowRight') || held.has('d') ? 1 : 0) - (held.has('ArrowLeft') || held.has('a') ? 1 : 0), (held.has('ArrowDown') || held.has('s') ? 1 : 0) - (held.has('ArrowUp') || held.has('w') ? 1 : 0));
window.addEventListener('keydown', e => {
  if (game.mode === 'play' || game.mode === 'shot' || game.mode === 'result') {
    if (e.key === ' ') { e.preventDefault(); const g = game as any; game.shoot(Math.atan2((held.has('q') ? -2.6 : held.has('e') ? 2.6 : 0) - g.px, g.pz + 30), 0.75, 0.3); }
    else { held.add(e.key); keyStick(); if (e.key.startsWith('Arrow')) e.preventDefault(); }
  } else if ((e.key === 'Enter' || e.key === ' ') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); if (!how.hidden) $('howOk').click(); else play(); }
});
window.addEventListener('keyup', e => { held.delete(e.key); keyStick(); });

showMenu();
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  game.update(dt); renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as any).__dribbler = { game, save };
