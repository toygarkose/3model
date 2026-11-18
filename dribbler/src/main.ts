import * as THREE from 'three';
import { Game, Summary, Skills } from './game';
import { Sfx } from './audio';
import { Look } from './character';
import { KITS, BOOTS, BALLS, HAIRS, HAIR_COLORS, SKINS, NUMBERS, DEFAULT_LOADOUT, Loadout, pickRivalKit } from './cosmetics';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'dribbler.v2';
const TEAMS = ['Dribbler SK', 'Kuzey Yıldızı', 'Liman Gücü', 'Çelik Kanat', 'Vadi FK', 'Poyraz SK', 'Altın Köprü', 'Kara Bulut'];
const WEEKS = TEAMS.length - 1;
interface Row { t: number; p: number; w: number; d: number; l: number; gf: number; ga: number }
type SkillKey = 'power' | 'curve' | 'calm' | 'tech';
interface Save {
  coins: number; season: number; week: number; table: Row[]; skills: Skills; owned: { kit: number[]; boots: number[]; ball: number[] };
  played: number; goals: number; assists: number; trophies: number; loadout: Loadout; sound: boolean; seenHow: boolean;
}
const freshTable = (): Row[] => TEAMS.map((_, t) => ({ t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }));
const save: Save = { coins: 0, season: 1, week: 0, table: freshTable(), skills: { power: 0, curve: 0, calm: 0, tech: 0 }, owned: { kit: [0, 1], boots: [0], ball: [0] }, played: 0, goals: 0, assists: 0, trophies: 0, loadout: { ...DEFAULT_LOADOUT }, sound: true, seenHow: false };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) { const s = JSON.parse(raw); Object.assign(save, s, { loadout: { ...DEFAULT_LOADOUT, ...(s.loadout || {}) }, skills: { ...save.skills, ...(s.skills || {}) }, owned: { ...save.owned, ...(s.owned || {}) } }); if (!Array.isArray(save.table) || save.table.length !== TEAMS.length) save.table = freshTable(); }
} catch { /* kayıt yoksa varsayılan */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* kaydedilemezse oyun yine çalışır */ } };
const pts = (r: Row) => r.w * 3 + r.d;
const sorted = () => [...save.table].sort((a, b) => pts(b) - pts(a) || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.t - b.t);
const record = (r: Row, f: number, a: number) => { r.p++; r.gf += f; r.ga += a; if (f > a) r.w++; else if (f < a) r.l++; else r.d++; };

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
  contact(on, time, drift) {
    contactEl.hidden = !on; $('mark').hidden = true;
    if (on) {
      const r = $('ctime'); r.style.animation = 'none'; void r.offsetWidth; r.style.animation = `ctime ${time}s linear forwards`;
      const bb = $('bigball'); bb.style.setProperty('--drift', drift + 'px'); bb.style.animation = 'none'; void bb.offsetWidth; bb.style.animation = drift > 0.5 ? 'drift 1.1s ease-in-out infinite' : 'none';
    }
  },
  over(s: Summary) {
    // lig: bizim maç + haftanın diğer maçları
    const rival = save.week + 1; record(save.table[0], s.us, s.them); record(save.table[rival], s.them, s.us);
    const rest = save.table.map(r => r.t).filter(t => t !== 0 && t !== rival).sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < rest.length; i += 2) { const g = (t: number) => Math.floor(Math.random() ** 1.6 * (3.6 + (t % 3) * 0.5)); const x = g(rest[i]), y = g(rest[i + 1]); record(save.table[rest[i]], x, y); record(save.table[rest[i + 1]], y, x); }
    const earn = 15 + s.goals * 15 + s.assists * 10 + (s.us > s.them ? 25 : s.us === s.them ? 10 : 0) + Math.round(s.rating * 2);
    save.played++; save.goals += s.goals; save.assists += s.assists; save.week++;
    let extra = 0, note = '';
    if (save.week >= WEEKS) {
      // sezon bitti
      const pos = sorted().findIndex(r => r.t === 0) + 1;
      if (pos === 1) { save.trophies++; extra = 200; note = `${save.season}. sezon şampiyonu oldun! Kupa ve 200 ₺ bonus.`; } else { extra = pos <= 3 ? 80 : 30; note = `${save.season}. sezonu ${pos}. sırada bitirdin. ${extra} ₺ bonus.`; }
      save.season++; save.week = 0; save.table = freshTable();
    }
    save.coins += earn + extra; persist();
    $('oTitle').textContent = s.us > s.them ? 'Galibiyet' : s.us < s.them ? 'Mağlubiyet' : 'Beraberlik';
    $('oScore').textContent = s.us + ' - ' + s.them; $('oRival').textContent = 'Dribbler SK - ' + s.rival;
    $('oGoals').textContent = String(s.goals); $('oAst').textContent = String(s.assists); $('oRate').textContent = s.rating.toFixed(1); $('oCoin').textContent = '+' + earn + ' ₺';
    $('oNote').textContent = note; $('oNote').hidden = !note;
    hud.hidden = true; promptEl.hidden = true; contactEl.hidden = true; over.hidden = false;
  },
}, lookOf(save.loadout));
let view: Loadout = { ...save.loadout };
const applyLook = () => { game.setPlayerLook(lookOf(view)); game.setKeeperLook(keeperLook); game.setRivalLook({ kit: pickRivalKit(KITS[view.kit]), number: 4, boot: { color: '#22222c', sole: '#eeeeee' }, hair: 0, hairColor: '#1a1412', skin: '#c98e62' }); game.setBall(BALLS[view.ball]); };
applyLook();
(document as any).fonts?.ready?.then(applyLook);

function resize() {
  const w = app.clientWidth, h = app.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app); resize();

// ---------- ekranlar ----------
const level = () => (save.season - 1) * 3 + Math.floor(save.week / 2);
function showMenu() {
  game.toMenu(); menu.hidden = false; hud.hidden = true; how.hidden = true; over.hidden = true; promptEl.hidden = true; contactEl.hidden = true;
  view = { ...save.loadout }; applyLook(); renderAll();
}
function play() {
  sfx.unlock();
  if (!save.seenHow) { save.seenHow = true; persist(); menu.hidden = true; how.hidden = false; how.dataset.then = 'play'; return; }
  view = { ...save.loadout }; applyLook();
  menu.hidden = true; how.hidden = true; over.hidden = true; hud.hidden = false; pops.innerHTML = '';
  game.startMatch(level(), TEAMS[save.week + 1], save.skills, save.played === 0);
}
$('play').onclick = play; $('again').onclick = play; $('toMenu').onclick = () => { sfx.click(); showMenu(); };
$('bHow').onclick = () => { sfx.unlock(); sfx.click(); menu.hidden = true; how.hidden = false; how.dataset.then = 'menu'; };
$('howOk').onclick = () => { if (how.dataset.then === 'play') play(); else showMenu(); };
const tSound = $('tSound');
const syncToggles = () => { tSound.textContent = 'Ses: ' + (save.sound ? 'Açık' : 'Kapalı'); tSound.setAttribute('aria-pressed', String(save.sound)); };
tSound.onclick = () => { save.sound = !save.sound; sfx.unlock(); sfx.setEnabled(save.sound); sfx.click(); persist(); syncToggles(); };
syncToggles();

// ---------- menü: maç / yetenek / görünüm ----------
type Panel = 'match' | 'skills' | 'look';
let panel: Panel = 'match';
document.querySelectorAll<HTMLElement>('#nav button').forEach(b => b.onclick = () => { sfx.unlock(); sfx.click(); panel = b.dataset.p as Panel; view = { ...save.loadout }; applyLook(); renderAll(); });
function renderAll() {
  document.querySelectorAll<HTMLElement>('#nav button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.p === panel)));
  $('pMatch').hidden = panel !== 'match'; $('pSkills').hidden = panel !== 'skills'; $('pLook').hidden = panel !== 'look';
  $('coins').textContent = save.coins + ' ₺';
  $('best').textContent = `${save.season}. sezon · ${save.week + 1}. hafta` + (save.trophies ? ` · ${save.trophies} kupa` : '');
  if (panel === 'match') renderMatch(); else if (panel === 'skills') renderSkills(); else renderOpts();
}
function renderMatch() {
  $('fixture').textContent = 'Dribbler SK - ' + TEAMS[save.week + 1];
  const tb = $('table'); tb.innerHTML = '';
  sorted().forEach((r, i) => {
    const tr = document.createElement('tr'); if (r.t === 0) tr.className = 'me'; if (r.t === save.week + 1) tr.classList.add('next');
    for (const v of [i + 1, TEAMS[r.t], r.p, (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga), pts(r)]) { const td = document.createElement('td'); td.textContent = String(v); tr.appendChild(td); }
    tb.appendChild(tr);
  });
}
const SKILLS: { k: SkillKey; name: string; desc: string }[] = [
  { k: 'power', name: 'Güç', desc: 'Şutların daha sert çıkar' },
  { k: 'curve', name: 'Falso', desc: 'Yandan vuruşlar daha çok kıvrılır' },
  { k: 'calm', name: 'Soğukkanlılık', desc: 'Vuruş noktası için daha çok süre, daha sakin top' },
  { k: 'tech', name: 'Teknik', desc: 'Sert vuruşlarda yön daha az sapar' },
];
const SKILL_COST = [40, 70, 110, 160, 220];
function renderSkills() {
  const box = $('skills'); box.innerHTML = '';
  for (const sk of SKILLS) {
    const lv = save.skills[sk.k], cost = SKILL_COST[lv], li = document.createElement('div'); li.className = 'skill';
    const info = document.createElement('div'); info.className = 'sinfo';
    const nm = document.createElement('b'); nm.textContent = sk.name; const pips = document.createElement('span'); pips.className = 'pips'; for (let i = 0; i < 5; i++) { const p = document.createElement('i'); if (i < lv) p.className = 'on'; pips.appendChild(p); }
    const ds = document.createElement('span'); ds.className = 'sdesc'; ds.textContent = sk.desc; info.append(nm, pips, ds);
    const btn = document.createElement('button'); btn.className = 'buy'; btn.id = 'up-' + sk.k;
    if (lv >= 5) { btn.textContent = 'Tam'; btn.disabled = true; } else { btn.textContent = cost + ' ₺'; btn.disabled = save.coins < cost; btn.setAttribute('aria-label', `${sk.name} geliştir, ${cost} ₺`); btn.onclick = () => { if (save.coins < cost) return; save.coins -= cost; save.skills[sk.k]++; persist(); sfx.unlock(); sfx.good(save.skills[sk.k] * 2); renderAll(); }; }
    li.append(info, btn); box.appendChild(li);
  }
}

// ---------- görünüm ----------
type Tab = 'kit' | 'boots' | 'ball' | 'hair' | 'skin';
let tab: Tab = 'kit';
const opts = $('opts');
const PRICE = { kit: [0, 0, 80, 80, 120, 120, 160, 200], boots: [0, 40, 40, 80, 80, 120], ball: [0, 50, 50, 90, 120, 120] };
const kitBg = (k: typeof KITS[number]) => k.pattern === 'stripes' ? `repeating-linear-gradient(90deg,${k.a} 0 7px,${k.b} 7px 14px)` : k.pattern === 'pin' ? `repeating-linear-gradient(90deg,${k.a} 0 6px,${k.b} 6px 8px)` : k.pattern === 'hoops' ? `repeating-linear-gradient(0deg,${k.a} 0 8px,${k.b} 8px 16px)` : k.pattern === 'halves' ? `linear-gradient(90deg,${k.a} 50%,${k.b} 50%)` : k.pattern === 'sash' ? `linear-gradient(135deg,${k.a} 40%,${k.b} 40% 60%,${k.a} 60%)` : k.pattern === 'chest' ? `linear-gradient(0deg,${k.a} 52%,${k.b} 52% 72%,${k.a} 72%)` : k.a;
/** shop: satın alınabilen kategori. Kilitli bir şeye dokununca önce üstünde denersin, sonra satın alırsın. */
function row(label: string, items: { bg?: string; text?: string; name: string }[], sel: number, pick: (i: number) => void, shop?: 'kit' | 'boots' | 'ball') {
  const wrap = document.createElement('div'); wrap.className = 'optrow';
  const locked = (i: number) => !!shop && !save.owned[shop].includes(i);
  const h = document.createElement('div'); h.className = 'optlabel'; h.textContent = label + ' · ' + items[sel].name; wrap.appendChild(h);
  if (locked(sel)) {
    const cost = PRICE[shop!][sel], b = document.createElement('button'); b.className = 'buy inline'; b.id = 'buy-' + shop; b.textContent = `Satın al · ${cost} ₺`; b.disabled = save.coins < cost;
    b.onclick = () => { if (save.coins < cost) return; save.coins -= cost; save.owned[shop!].push(sel); save.loadout = { ...view }; persist(); sfx.unlock(); sfx.good(6); renderAll(); };
    h.appendChild(b);
  }
  const list = document.createElement('div'); list.className = 'swatches';
  items.forEach((it, i) => {
    const b = document.createElement('button'); b.className = 'sw' + (it.text ? ' txt' : '') + (locked(i) ? ' locked' : ''); b.setAttribute('aria-label', it.name + (locked(i) ? `, kilitli, ${PRICE[shop!][i]} ₺` : '')); b.setAttribute('aria-pressed', String(i === sel));
    if (it.bg) b.style.background = it.bg; if (it.text) b.textContent = it.text;
    if (locked(i)) { const tag = document.createElement('span'); tag.textContent = String(PRICE[shop!][i]); b.appendChild(tag); }
    b.onclick = () => { sfx.unlock(); sfx.click(); pick(i); if (!['kit', 'boots', 'ball'].some(c => !save.owned[c as 'kit'].includes(view[c as 'kit']))) { save.loadout = { ...view }; persist(); } applyLook(); renderOpts(); };
    list.appendChild(b);
  });
  wrap.appendChild(list); opts.appendChild(wrap);
  const cur = list.children[sel] as HTMLElement; requestAnimationFrame(() => { list.scrollLeft = Math.max(0, cur.offsetLeft - list.clientWidth / 2 + cur.clientWidth / 2); });
}
function renderOpts() {
  opts.innerHTML = ''; const L = view;
  if (tab === 'kit') {
    row('Forma', KITS.map(k => ({ bg: kitBg(k), name: k.name })), L.kit, i => L.kit = i, 'kit');
    row('Numara', NUMBERS.map(n => ({ text: String(n), name: String(n) })), Math.max(0, NUMBERS.indexOf(L.number)), i => L.number = NUMBERS[i]);
  } else if (tab === 'boots') row('Krampon', BOOTS.map(b => ({ bg: `linear-gradient(160deg,${b.color} 62%,${b.sole} 62%)`, name: b.name })), L.boots, i => L.boots = i, 'boots');
  else if (tab === 'ball') row('Top', BALLS.map(b => ({ bg: `radial-gradient(circle at 50% 50%,${b.patch} 0 22%,${b.base} 24% 100%)`, name: b.name })), L.ball, i => L.ball = i, 'ball');
  else if (tab === 'hair') {
    row('Saç', HAIRS.map(h => ({ text: h, name: h })), L.hair, i => L.hair = i);
    row('Saç rengi', HAIR_COLORS.map((c, i) => ({ bg: c, name: 'Renk ' + (i + 1) })), L.hairColor, i => L.hairColor = i);
  } else row('Ten', SKINS.map((c, i) => ({ bg: c, name: 'Ton ' + (i + 1) })), L.skin, i => L.skin = i);
  document.querySelectorAll<HTMLElement>('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
}
document.querySelectorAll<HTMLElement>('#tabs button').forEach(b => b.onclick = () => { sfx.unlock(); sfx.click(); tab = b.dataset.tab as Tab; renderOpts(); });

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
