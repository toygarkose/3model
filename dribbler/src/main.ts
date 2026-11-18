import * as THREE from 'three';
import { Game, Stats } from './game';
import { Sfx } from './audio';
import { Look } from './character';
import { KITS, BOOTS, BALLS, HAIRS, HAIR_COLORS, SKINS, NUMBERS, DEFAULT_LOADOUT, Loadout } from './cosmetics';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'dribbler.v1';
interface Save { best: number; loadout: Loadout; sound: boolean; hints: boolean; seenHow: boolean }
const save: Save = { best: 0, loadout: { ...DEFAULT_LOADOUT }, sound: true, hints: true, seenHow: false };
try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); Object.assign(save, s, { loadout: { ...DEFAULT_LOADOUT, ...(s.loadout || {}) } }); } } catch { /* kayıt yoksa varsayılan */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* kaydedilemezse oyun yine çalışır */ } };

const lookOf = (l: Loadout): Look => ({ kit: KITS[l.kit], number: l.number, boot: BOOTS[l.boots], hair: l.hair, hairColor: HAIR_COLORS[l.hairColor], skin: SKINS[l.skin] });
const keeperLook: Look = { kit: { name: 'gk', a: '#c6ff3a', b: '#1b1b2a', pattern: 'chest', shorts: '#1b1b2a', socks: '#c6ff3a', num: '#1b1b2a' }, number: 1, boot: { color: '#22222c', sole: '#eeeeee' }, hair: 0, hairColor: '#1a1412', skin: '#c98e62' };

const app = $('app'), canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 0.56, 0.1, 400);
const sfx = new Sfx(); sfx.enabled = save.sound;

const hud = $('hud'), menu = $('menu'), how = $('how'), pops = $('pops'), shootBtn = $('shoot'), stick = $('stick'), knob = $('knob');
const game = new Game(scene, camera, sfx, {
  popup(text, kind) {
    const el = document.createElement('div'); el.className = 'pop ' + kind; el.textContent = text;
    pops.appendChild(el); while (pops.children.length > 4) pops.firstElementChild!.remove();
    el.addEventListener('animationend', () => el.remove());
  },
  hud(s: Stats) {
    $('goals').textContent = String(s.goals); $('shots').textContent = '/ ' + s.shots;
    const st = $('streak'); st.textContent = 'Seri ' + s.streak; st.classList.toggle('hot', s.streak >= 2);
    if (s.bestStreak > save.best) { save.best = s.bestStreak; persist(); }
  },
  power(p, charging) {
    shootBtn.style.setProperty('--p', String(Math.min(1, p))); shootBtn.classList.toggle('charging', charging); shootBtn.classList.toggle('over', charging && p > 1);
    $('pct').textContent = charging ? Math.round(Math.min(p, 1.25) * 100) + '%' : 'ŞUT';
  },
}, lookOf(save.loadout));
const applyLook = () => { game.setPlayerLook(lookOf(save.loadout)); game.setKeeperLook(keeperLook); game.setBall(BALLS[save.loadout.ball]); };
applyLook();
(document as any).fonts?.ready?.then(applyLook);

function resize() {
  const w = app.clientWidth, h = app.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app); resize();

// ---------- ekranlar ----------
function showMenu() { game.toMenu(); menu.hidden = false; hud.hidden = true; shootBtn.hidden = true; stick.hidden = true; how.hidden = true; $('best').textContent = 'En uzun gol serisi: ' + save.best; }
function play() {
  sfx.unlock();
  if (!save.seenHow) { save.seenHow = true; persist(); menu.hidden = true; how.hidden = false; how.dataset.then = 'play'; return; }
  menu.hidden = true; how.hidden = true; hud.hidden = false; shootBtn.hidden = false; pops.innerHTML = '';
  game.start();
}
$('play').onclick = play; $('toMenu').onclick = () => { sfx.click(); showMenu(); };
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
// Sol başparmak: ekranda herhangi bir yere basıp sürükle = koş.
// Sağ başparmak: ŞUT tuşuna basılı tut = güç dolar; parmağı kaydır = nişan; bırak = vur.
const R = 54; let stickId = -1, sx0 = 0, sy0 = 0;
canvas.addEventListener('pointerdown', e => {
  sfx.unlock(); if (game.mode !== 'play' || stickId >= 0) return;
  stickId = e.pointerId; sx0 = e.clientX; sy0 = e.clientY;
  const r = app.getBoundingClientRect(); stick.style.left = sx0 - r.left + 'px'; stick.style.top = sy0 - r.top + 'px'; knob.style.transform = ''; stick.hidden = false;
});
let shootId = -1, bx0 = 0, by0 = 0;
shootBtn.addEventListener('pointerdown', e => {
  e.preventDefault(); sfx.unlock(); if (shootId >= 0) return;
  if (game.chargeStart()) { shootId = e.pointerId; bx0 = e.clientX; by0 = e.clientY; try { shootBtn.setPointerCapture(e.pointerId); } catch { /* yakalanamazsa pencere olayları yeter */ } }
});
window.addEventListener('pointermove', e => {
  if (e.pointerId === shootId) { game.chargeAim(e.clientX - bx0, e.clientY - by0); return; }
  if (e.pointerId !== stickId) return;
  let dx = (e.clientX - sx0) / R, dy = (e.clientY - sy0) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  knob.style.transform = `translate(${dx * R}px,${dy * R}px)`; game.setStick(m < 0.12 ? 0 : dx, m < 0.12 ? 0 : dy);
});
const end = (e: PointerEvent) => {
  if (e.pointerId === shootId) { shootId = -1; game.chargeRelease(); }
  if (e.pointerId === stickId) { stickId = -1; stick.hidden = true; game.setStick(0, 0); }
};
window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
// klavye: WASD koş, boşluk basılı tut = şut, ok tuşları = nişan
const held = new Set<string>(); let kax = 0, kay = 0;
const keyStick = () => game.setStick((held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0), (held.has('s') ? 1 : 0) - (held.has('w') ? 1 : 0));
window.addEventListener('keydown', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (game.mode === 'play') {
    if (k === ' ') { e.preventDefault(); if (!e.repeat) { kax = kay = 0; game.chargeStart(); } }
    else { held.add(k); keyStick(); if (k.startsWith('Arrow')) e.preventDefault(); }
  } else if ((k === 'Enter' || k === ' ') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); if (!how.hidden) $('howOk').click(); else play(); }
});
window.addEventListener('keyup', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (k === ' ') game.chargeRelease(); held.delete(k); keyStick(); });

showMenu();
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (held.size) { kax += ((held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)) * dt * 110; kay += ((held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0)) * dt * 110; game.chargeAim(kax, kay); }
  game.update(dt); renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as any).__dribbler = { game, save };
