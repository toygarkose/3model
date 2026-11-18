import * as THREE from 'three';
import { Game, Summary } from './game';
import { Sfx } from './audio';
import { Look } from './character';
import { KITS, BOOTS, BALLS, HAIRS, HAIR_COLORS, SKINS, NUMBERS, DEFAULT_LOADOUT, Loadout, pickRivalKit } from './cosmetics';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'dribbler.v1';
interface Career { played: number; w: number; d: number; l: number; goals: number; assists: number }
interface Save { career: Career; best: number; loadout: Loadout; sound: boolean; hints: boolean; seenHow: boolean }
const save: Save = { career: { played: 0, w: 0, d: 0, l: 0, goals: 0, assists: 0 }, best: 0, loadout: { ...DEFAULT_LOADOUT }, sound: true, hints: true, seenHow: false };
try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); Object.assign(save, s, { loadout: { ...DEFAULT_LOADOUT, ...(s.loadout || {}) }, career: { ...save.career, ...(s.career || {}) } }); } } catch { /* kayıt yoksa varsayılan */ }
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

const hud = $('hud'), menu = $('menu'), how = $('how'), over = $('over'), pops = $('pops'), contactEl = $('contact'), promptEl = $('prompt');
const RIVALS = ['Kuzey Yıldızı', 'Liman Gücü', 'Çelik Kanat', 'Vadi FK', 'Poyraz SK', 'Altın Köprü', 'Kara Bulut', 'Bozkır Atletik'];
const game = new Game(scene, camera, sfx, {
  popup(text, kind) {
    const el = document.createElement('div'); el.className = 'pop ' + kind; el.textContent = text;
    pops.appendChild(el); while (pops.children.length > 4) pops.firstElementChild!.remove();
    el.addEventListener('animationend', () => el.remove());
  },
  board(us, them, minute, rival, results) {
    $('bUs').textContent = String(us); $('bThem').textContent = String(them); $('bRival').textContent = rival; $('bMin').textContent = minute + "'";
    $('dots').querySelectorAll('i').forEach((el, i) => { el.className = results[i] || (i === results.length ? 'now' : ''); });
  },
  prompt(title, text) { $('pTitle').textContent = title; $('pText').textContent = text; promptEl.hidden = !title && !text; },
  contact(on, time) {
    contactEl.hidden = !on; $('mark').hidden = true;
    if (on) { const r = $('ctime'); r.style.animation = 'none'; void r.offsetWidth; r.style.animation = `ctime ${time}s linear forwards`; }
  },
  over(s: Summary) {
    const c = save.career; c.played++; c.goals += s.goals; c.assists += s.assists; if (s.us > s.them) c.w++; else if (s.us < s.them) c.l++; else c.d++;
    persist();
    $('oTitle').textContent = s.us > s.them ? 'Galibiyet' : s.us < s.them ? 'Mağlubiyet' : 'Beraberlik';
    $('oScore').textContent = s.us + ' - ' + s.them; $('oRival').textContent = 'Dribbler SK - ' + s.rival;
    $('oGoals').textContent = String(s.goals); $('oAst').textContent = String(s.assists); $('oRate').textContent = s.rating.toFixed(1); $('oPts').textContent = String(c.w * 3 + c.d);
    hud.hidden = true; promptEl.hidden = true; contactEl.hidden = true; over.hidden = false;
  },
}, lookOf(save.loadout));
const applyLook = () => { game.setPlayerLook(lookOf(save.loadout)); game.setKeeperLook(keeperLook); game.setRivalLook({ kit: pickRivalKit(KITS[save.loadout.kit]), number: 4, boot: { color: '#22222c', sole: '#eeeeee' }, hair: 0, hairColor: '#1a1412', skin: '#c98e62' }); game.setBall(BALLS[save.loadout.ball]); };
applyLook();
(document as any).fonts?.ready?.then(applyLook);

function resize() {
  const w = app.clientWidth, h = app.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app); resize();

// ---------- ekranlar ----------
function showMenu() {
  game.toMenu(); menu.hidden = false; hud.hidden = true; how.hidden = true; over.hidden = true; promptEl.hidden = true; contactEl.hidden = true;
  const c = save.career; $('best').textContent = c.played ? `${c.played} maç · ${c.w}G ${c.d}B ${c.l}M · ${c.goals} gol · ${c.assists} asist` : 'Kariyerin ilk maçı seni bekliyor';
}
function play() {
  sfx.unlock();
  if (!save.seenHow) { save.seenHow = true; persist(); menu.hidden = true; how.hidden = false; how.dataset.then = 'play'; return; }
  menu.hidden = true; how.hidden = true; over.hidden = true; hud.hidden = false; pops.innerHTML = '';
  game.startMatch(save.career.played, RIVALS[save.career.played % RIVALS.length]);
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
// 1) Ekrana bas, geri çek (sapan gibi), bırak: yön ve güç.  2) Büyük topa dokun: vuruş noktası.
let dragId = -1, dx0 = 0, dy0 = 0;
canvas.addEventListener('pointerdown', e => { sfx.unlock(); if (game.mode !== 'aim' || dragId >= 0) return; dragId = e.pointerId; dx0 = e.clientX; dy0 = e.clientY; });
window.addEventListener('pointermove', e => { if (e.pointerId === dragId) game.aimDrag(e.clientX - dx0, e.clientY - dy0, app.clientHeight); });
const end = (e: PointerEvent) => { if (e.pointerId !== dragId) return; dragId = -1; game.aimRelease(); };
window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
const bigBall = $('bigball');
bigBall.addEventListener('pointerdown', e => {
  e.preventDefault(); const r = bigBall.getBoundingClientRect(), cx = ((e.clientX - r.left) / r.width - 0.5) * 2, cy = -((e.clientY - r.top) / r.height - 0.5) * 2;
  const m = $('mark'); m.style.left = (e.clientX - r.left) + 'px'; m.style.top = (e.clientY - r.top) + 'px'; m.hidden = false;
  game.contact(cx, cy);
});
window.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && (game.mode === 'menu' || game.mode === 'done') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); if (!how.hidden) $('howOk').click(); else play(); } });

showMenu();
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  game.update(dt); renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as any).__dribbler = { game, save };
