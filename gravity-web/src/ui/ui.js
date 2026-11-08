// Screens and HUD (plain DOM over the live scene).
import { WORLDS } from '../data/worlds.js';
import { BODIES, formatG } from '../data/bodies.js';
import { PALETTE } from '../render/gl.js';
import { haptics } from '../fx/haptics.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const IC = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
};

export function star(on, cls = '') {
  const pts = [];
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 9 : 21; pts.push(`${(24 + Math.cos(a) * r).toFixed(1)},${(24 + Math.sin(a) * r).toFixed(1)}`); }
  return `<svg viewBox="0 0 48 48" class="${cls}" aria-hidden="true"><polygon class="${on ? 's-on' : 's-off'}" points="${pts.join(' ')}"/></svg>`;
}
const stars = n => `<span class="stars" aria-label="${n} of 3 stars">${[0, 1, 2].map(i => star(i < n)).join('')}</span>`;
const swatch = key => { const p = PALETTE[key]; if (!p) return key === 'blackhole' ? 'radial-gradient(circle at 50% 50%, #000 40%, #ff9a4a 55%, #000 75%)' : '#555'; const c = v => `rgb(${v.map(x => Math.round(x * 255)).join(',')})`; return `radial-gradient(circle at 35% 35%, ${c(p.high)}, ${c(p.mid)} 45%, ${c(p.deep)})`; };

export class UI {
  constructor(root, { store, audio, levels }) {
    Object.assign(this, { root, store, audio, levels });
    this.probe = document.getElementById('probe');
  }

  safeTop() { return parseFloat(getComputedStyle(this.probe).paddingTop) || 0; }
  safeBottom() { return parseFloat(getComputedStyle(this.probe).paddingBottom) || 0; }
  click() { this.audio.unlock(); this.audio.play('click', { vol: 0.7 }); haptics.tick(); }

  _layer(cls, html) {
    this.clear();
    const el = document.createElement('div');
    el.className = cls + ' layer';
    el.innerHTML = html;
    this.root.appendChild(el);
    return el;
  }
  clear() { this.root.innerHTML = ''; this.hudEl = null; }

  warp() { const w = document.createElement('div'); w.className = 'warpfx'; document.body.appendChild(w); setTimeout(() => w.remove(), 600); }

  // ------------------------------------------------------------------ menu
  showMenu() {
    this.game.showcase();
    const next = Math.min(this.store.d.unlocked, this.levels.length) - 1;
    const el = this._layer('screen', `
      <div class="logo"><h1>GRAVITY</h1><p>Real gravity · Real universe</p></div>
      <div class="stack">
        <button class="btn primary" data-a="play">${next > 0 ? 'Continue' : 'Play'} <small>Level ${next + 1}</small></button>
        <button class="btn" data-a="worlds">Worlds <small>${this.store.totalStars()} / ${this.levels.length * 3} ★</small></button>
        <button class="btn" data-a="settings">Settings</button>
      </div>
      <p class="note">Every planet pulls with its real surface gravity. Moons follow Kepler's laws.</p>`);
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      this.click();
      if (a === 'play') this.startLevel(next);
      if (a === 'worlds') this.showWorlds();
      if (a === 'settings') this.showSettings();
    };
  }

  showWorlds() {
    const el = this._layer('screen', `
      <button class="icon back" data-a="back" aria-label="Back">${IC.back}</button>
      <h2>Worlds</h2>
      <div class="worlds">${WORLDS.map(w => {
        const lv = this.levels.filter(l => l.world === w.id);
        const first = this.levels.indexOf(lv[0]);
        const got = lv.reduce((a, l) => a + this.store.stars(l.id), 0);
        const open = first < this.store.d.unlocked;
        return `<button class="world ${open ? '' : 'locked'}" data-w="${w.id}"><b>${w.id}. ${esc(w.name)}</b><span class="cnt">${got}/${lv.length * 3} ★</span><span>${esc(w.subtitle)}</span></button>`;
      }).join('')}</div>`);
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.click();
      if (b.dataset.a === 'back') return this.showMenu();
      if (b.dataset.w) this.showLevels(+b.dataset.w);
    };
  }

  showLevels(wid) {
    const w = WORLDS.find(x => x.id === wid);
    const el = this._layer('screen', `
      <button class="icon back" data-a="back" aria-label="Back">${IC.back}</button>
      <div class="kicker">World ${w.id}</div><h2>${esc(w.name)}</h2>
      <div class="grid">${this.levels.map((l, i) => l.world !== wid ? '' : `
        <button class="tile ${i < this.store.d.unlocked ? '' : 'locked'}" data-i="${i}" aria-label="Level ${i + 1} ${esc(l.name)}">
          <b>${i + 1}</b>${stars(this.store.stars(l.id))}<span>${esc(l.name)}</span></button>`).join('')}</div>`);
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.click();
      if (b.dataset.a === 'back') return this.showWorlds();
      if (b.dataset.i) this.startLevel(+b.dataset.i);
    };
  }

  showSettings() {
    const s = this.store.d.settings;
    const seg = (k, opts) => `<span class="seg" data-k="${k}">${opts.map(([v, l]) => `<button class="${String(s[k]) === String(v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</span>`;
    const el = this._layer('screen', `
      <button class="icon back" data-a="back" aria-label="Back">${IC.back}</button>
      <h2>Settings</h2>
      <div class="settings">
        <div class="set">Sound ${seg('sound', [[true, 'On'], [false, 'Off']])}</div>
        <div class="set">Vibration ${seg('haptics', [[true, 'On'], [false, 'Off']])}</div>
        <div class="set">Aim guide ${seg('assist', [['off', 'Arrow'], ['short', 'Short'], ['long', 'Long']])}</div>
        <div class="set">Progress <button class="btn" data-a="reset" style="min-height:40px;font-size:11px">Reset</button></div>
      </div>
      <p class="note">Aim guide shows how far the predicted path is drawn while you aim. "Short" is the intended challenge. No sound on iPhone? Turn off silent mode.</p>`);
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.click();
      if (b.dataset.a === 'back') return this.showMenu();
      if (b.dataset.a === 'reset') { if (b.dataset.armed) { this.store.reset(); b.textContent = 'Done'; } else { b.dataset.armed = 1; b.textContent = 'Tap again'; } return; }
      const k = b.parentElement.dataset.k; if (!k) return;
      let v = b.dataset.v; if (v === 'true') v = true; if (v === 'false') v = false;
      s[k] = v; this.store.save();
      if (k === 'sound') this.audio.setEnabled(v);
      if (k === 'haptics') haptics.enabled = v;
      this.showSettings();
    };
  }

  // ------------------------------------------------------------------ level
  startLevel(i) {
    this.warp();
    this.audio.play('whoosh', { vol: 0.6 });
    this.game.load(i);
    const L = this.levels[i];
    if (!this.store.d.seenIntro[L.id]) this.showIntro(i); else this.showHud();
  }

  showIntro(i, fromHud = false) {
    const L = this.levels[i];
    const w = WORLDS.find(x => x.id === L.world);
    const keys = [...new Set(L.bodies.map(b => b.key))];
    const chips = new Set();
    if (L.bodies.some(b => b.orbit && b.orbit.around != null)) chips.add('Kepler orbits: moons move once you launch');
    if (L.bodies.some(b => b.orbit && b.orbit.around == null)) chips.add('Barycentre: a double world orbits empty space');
    if (L.bodies.some(b => BODIES[b.key]?.atmBar > 0.5)) chips.add('Atmospheric drag');
    if (L.rings?.length) chips.add('Rings: fly the Cassini Division');
    if (L.bodies.some(b => b.key === 'blackhole')) chips.add('Event horizon r = 2GM/c²');
    if (L.bodies.some(b => b.orbit)) chips.add('Gravity assists only from moving bodies');
    const el = this._layer('screen', `
      <div class="card">
        <div class="kicker">World ${w.id} · Level ${i + 1}</div>
        <h3>${esc(L.name)}</h3>
        <div class="facts">${keys.map(k => { const b = BODIES[k]; return `
          <div class="fact"><i style="background:${swatch(k)}"></i><div><b>${esc(b.name)}</b> <span class="num">${k === 'blackhole' ? 'escape speed > c' : k === 'rock' ? 'tiny gravity' : `${formatG(k)} · escape ${b.escKms} km/s`}</span><p>${esc(b.fact)}</p></div></div>`; }).join('')}
        </div>
        ${chips.size ? `<div class="chips">${[...chips].map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
        <div class="goal">Pull back anywhere and release. Reach the <b>green portal</b>. Fly through the <b>★ shards</b> for stars. ${L.preview > 0.3 ? 'The dotted guide shows the start of your path.' : 'Only the first part of your path is shown. Learn from your ghost trails.'}</div>
        <button class="btn primary" data-a="go">${fromHud ? 'Resume' : 'Launch'}</button>
      </div>`);
    el.onclick = (e) => {
      if (!e.target.closest('button')) return;
      this.click();
      this.store.d.seenIntro[L.id] = true; this.store.save();
      this.showHud();
    };
  }

  showHud() {
    const L = this.game.level, i = this.game.index;
    const el = this._layer('hud pass', `
      <div class="hud-top">
        <button class="icon" data-a="menu" aria-label="Levels">${IC.menu}</button>
        <div class="hud-title"><b>${i + 1}. ${esc(L.name)}</b><span data-att>Attempt 1</span></div>
        <div class="hud-stars" data-stars>${[0, 1, 2].map(() => star(false)).join('')}</div>
        <button class="icon" data-a="info" aria-label="Science info">${IC.info}</button>
        <button class="icon" data-a="restart" aria-label="Restart">${IC.restart}</button>
      </div>
      <div class="hint" data-hint>${this.game.attempts === 0 ? 'Pull back anywhere · release to launch' : ''}</div>`);
    this.hudEl = el;
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      this.click();
      if (a === 'menu') this.showLevels(L.world);
      if (a === 'info') this.showIntro(i, true);
      if (a === 'restart') { this.game.load(i); this.showHud(); }
    };
  }

  hud({ stars: n = 0, attempts = 0, pulse = false } = {}) {
    if (!this.hudEl) return;
    const box = this.hudEl.querySelector('[data-stars]');
    box.innerHTML = [0, 1, 2].map(k => star(k < n, pulse && k === n - 1 ? 'bump' : '')).join('');
    this.hudEl.querySelector('[data-att]').textContent = `Attempt ${Math.max(1, attempts)}`;
  }

  onLaunch() { const h = this.hudEl?.querySelector('[data-hint]'); if (h) h.style.opacity = '0'; }

  onFail({ title, sub }) {
    if (!this.hudEl) return;
    const t = document.createElement('div');
    t.className = 'toast go';
    t.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;
    this.hudEl.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  onWin(r) {
    setTimeout(() => this._winPanel(r), 650);
  }

  _winPanel(r) {
    const i = this.game.index, L = this.levels[i];
    const last = i + 1 >= this.levels.length;
    const titles = ['MISSION COMPLETE', 'NICE FLIGHT', 'GREAT FLIGHT', 'PERFECT ORBIT'];
    const el = this._layer('screen', `
      <div class="win">
        <div class="kicker" style="text-align:center">Level ${i + 1} · ${esc(L.name)}</div>
        <h3>${titles[r.stars]}</h3>
        <div class="bigstars">${[0, 1, 2].map(k => star(k < r.stars, k < r.stars ? 'lit' : '')).join('')}</div>
        <div class="score" data-score>0<small>SCORE</small></div>
        <div class="breakdown">
          <div><span>Portal reached</span><span>1000</span></div>
          <div><span>Star shards × ${r.stars}</span><span>${r.stars * 500}</span></div>
          ${r.close ? `<div><span>Close calls × ${r.close}</span><span>${r.close * 250}</span></div>` : ''}
          ${r.assist ? `<div><span>Gravity assists × ${r.assist}</span><span>${r.assist * 400}</span></div>` : ''}
          <div><span>Attempts: ${r.attempts}</span><span>${Math.max(0, 4 - r.attempts) * 150}</span></div>
        </div>
        ${r.newBest && !r.firstClear ? '<div class="badge">NEW BEST</div>' : ''}
        <div class="row"><button class="btn" data-a="retry">Retry</button><button class="btn primary" data-a="next">${last ? 'Menu' : 'Next'}</button></div>
      </div>`);
    const svgs = el.querySelectorAll('.bigstars svg');
    svgs.forEach((s, k) => setTimeout(() => {
      s.classList.add('in');
      if (k < r.stars) { this.audio.play('star', { rate: 1 + k * 0.15 }); haptics.light(); }
    }, 250 + k * 300));
    const sc = el.querySelector('[data-score]');
    const t0 = performance.now(), dur = 900;
    const tick = () => { const k = Math.min(1, (performance.now() - t0 - 900) / dur); if (k > 0) sc.firstChild.textContent = Math.round(r.score * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); else this.audio.play('tick', { rate: 1.4 }); };
    requestAnimationFrame(tick);
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      this.click();
      if (a === 'retry') { this.game.load(i); this.showHud(); }
      if (a === 'next') { if (last) this.showMenu(); else this.startLevel(i + 1); }
    };
  }
}
