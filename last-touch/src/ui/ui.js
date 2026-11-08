import { LEVELS } from '../levels/index.js';
import { TEAMS } from '../levels/teams.js';
import { CHAPTERS, STORY, fill } from '../career/story.js';
import { COSMETICS } from '../career/cosmetics.js';
import { ACHIEVEMENTS } from '../career/career.js';
import { SKIN_TONES, HAIR_COLORS } from '../scene/playerModel.js';
import { Hud, ICON, starSvg, starsHtml } from './hud.js';

const hex = n => '#' + n.toString(16).padStart(6, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Screen manager. Every screen is plain DOM over the live 3D scene.
export class UI {
  constructor(root, deps) {
    this.root = root;
    Object.assign(this, deps);   // { career, audio, game, onQuality }
    this.hud = new Hud(root, {
      restart: () => { this.click(); this.game.restart(); this._mountHud(); },
      pause: () => { this.click(); this.showPause(); },
      guideTarget: () => this.game.guideTarget(),
    });
  }

  click() { this.audio.unlock(); this.audio.play('click', { volume: 0.6 }); }

  _screen(cls, html) {
    this.clear();
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.current = el;
    el.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', () => this.audio.unlock()));
    return el;
  }

  clear() {
    this.hud.unmount();
    this.root.querySelectorAll(':scope > :not(.toast)').forEach(n => n.remove());
    this.current = null;
  }

  // ------------------------------------------------------------------ menu
  showMenu() {
    this.game.showMenuScene();
    const c = this.career;
    const el = this._screen('screen home', `
      <div class="logo" aria-label="Last Touch">
        <span class="w1">LAST</span><span class="w2">TOUCH</span>
        <svg viewBox="0 0 400 80" preserveAspectRatio="none"><path d="M10 70 C 120 20, 260 10, 380 40"/><circle cx="384" cy="41" r="7"/></svg>
        <div class="tagline">Every touch tells a story</div>
      </div>
      <div class="menu">
        ${c.started ? `<button class="btn primary" data-a="continue">Continue Career <small>${esc(c.name)} · Level ${c.nextLevelIndex() + 1}</small></button>` : ''}
        <button class="btn ${c.started ? '' : 'primary'}" data-a="new">New Career <small>${c.started ? 'Start over' : 'Begin your story'}</small></button>
        <button class="btn" data-a="levels">Level Selection <small>${c.totalStars()} / ${LEVELS.length * 3} ★</small></button>
        <button class="btn" data-a="profile">Player Profile <small><span class="coin"></span> ${c.data.coins}</small></button>
        <button class="btn" data-a="settings">Settings</button>
      </div>`);
    el.style.flexDirection = window.innerWidth > window.innerHeight * 1.2 ? 'row' : 'column';
    el.style.gap = window.innerWidth > window.innerHeight * 1.2 ? 'clamp(24px, 8vw, 120px)' : '';
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a) return;
      this.click();
      if (a === 'continue') this.showIntro(c.nextLevelIndex());
      if (a === 'new') this.showNewCareer();
      if (a === 'levels') this.showLevels();
      if (a === 'profile') this.showProfile();
      if (a === 'settings') this.showSettings();
    };
  }

  // ------------------------------------------------------------------ new career
  showNewCareer() {
    const st = { skin: 1, hair: 0 };
    const el = this._screen('screen solid', `
      <button class="icon-btn back" data-a="back" aria-label="Back">${ICON.back}</button>
      <div class="kicker">New career</div>
      <h2>Who are you?</h2>
      <form class="form" autocomplete="off">
        <div class="field"><label for="nc-name">Surname on your shirt</label><input id="nc-name" maxlength="12" value="${esc(this.career.started ? this.career.name : 'Rivera')}" /></div>
        <div class="field"><label for="nc-num">Shirt number</label><input id="nc-num" type="number" min="1" max="99" value="17" inputmode="numeric" /></div>
        <div class="field"><label>Skin tone</label><div class="swatches" data-g="skin">${SKIN_TONES.map((c, i) => `<button type="button" class="swatch ${i === st.skin ? 'on' : ''}" data-i="${i}" style="background:${hex(c)}" aria-label="Skin tone ${i + 1}"></button>`).join('')}</div></div>
        <div class="field"><label>Hair colour</label><div class="swatches" data-g="hair">${HAIR_COLORS.map((c, i) => `<button type="button" class="swatch ${i === st.hair ? 'on' : ''}" data-i="${i}" style="background:${hex(c)}" aria-label="Hair colour ${i + 1}"></button>`).join('')}</div></div>
        <button class="btn primary center" type="submit">Start Career</button>
      </form>`);
    el.querySelector('[data-a=back]').onclick = () => { this.click(); this.showMenu(); };
    el.querySelectorAll('.swatches').forEach(g => g.addEventListener('click', (e) => {
      const b = e.target.closest('.swatch'); if (!b) return;
      this.click();
      g.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s === b));
      st[g.dataset.g] = +b.dataset.i;
    }));
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.click();
      const name = el.querySelector('#nc-name').value.trim().slice(0, 12) || 'Rivera';
      const number = Math.max(1, Math.min(99, parseInt(el.querySelector('#nc-num').value, 10) || 17));
      this.career.newCareer({ name, number, skin: st.skin, hairColor: st.hair });
      this.showStory(STORY.intro, () => this.showIntro(0));
    });
  }

  // ------------------------------------------------------------------ story
  showStory(cards, done) {
    let i = 0;
    const show = () => {
      const c = cards[i];
      const el = this._screen('screen', `<div class="story"><div class="kicker">${esc(c.kicker)}</div><h2 class="headline">${esc(fill(c.headline, this.career))}</h2><p>${esc(fill(c.body, this.career))}</p><div class="tap">Tap to continue · ${i + 1}/${cards.length}</div></div>`);
      el.onclick = () => { this.click(); i++; if (i < cards.length) show(); else done(); };
    };
    show();
  }

  showNews(after, done) {
    const c = this.career;
    const el = this._screen('screen solid', `
      <div class="paper">
        <div class="masthead"><span>${esc(after.paper)}</span><span>${new Date().getFullYear()}</span></div>
        <h3>${esc(fill(after.headline, c))}</h3>
        <p>${esc(fill(after.body, c))}</p>
        <div class="milestone">★ ${esc(after.milestone)}</div>
        ${after.season ? `<p style="margin-top:12px;font-weight:700">${esc(after.season)}</p>` : ''}
      </div>
      <div class="tap kicker" style="animation:pulse 1.6s infinite">Tap to continue</div>`);
    this.audio.play('sting', { volume: 0.6 });
    el.onclick = () => { this.click(); done(); };
  }

  // ------------------------------------------------------------------ levels
  showLevels() {
    this.game.showMenuScene();
    const c = this.career;
    const el = this._screen('screen solid', `
      <button class="icon-btn back" data-a="back" aria-label="Back">${ICON.back}</button>
      <h2>Level Selection</h2>
      <div class="chapters">${CHAPTERS.map(ch => `
        <div class="chapter"><h4>${esc(ch.name)} · ${esc(ch.title)} <span>${esc(ch.club)}</span></h4>
          <div class="lvgrid">${ch.levels.map(n => {
            const i = n - 1, L = LEVELS[i], open = c.isUnlocked(i);
            return `<button class="lv ${open ? '' : 'locked'}" data-i="${i}" ${open ? '' : 'disabled'} aria-label="Level ${n}: ${esc(L.title)}">
              <span class="n">${n}</span><span class="t">${esc(L.title)}</span>${open ? starsHtml(c.data.stars[i]) : '<span class="muted">Locked</span>'}</button>`;
          }).join('')}</div></div>`).join('')}
      </div>`);
    el.style.justifyContent = 'flex-start';
    el.style.paddingTop = 'calc(var(--safe-t) + 70px)';
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.click();
      if (b.dataset.a === 'back') return this.showMenu();
      if (b.dataset.i) this.showIntro(+b.dataset.i);
    };
  }

  // ------------------------------------------------------------------ profile
  showProfile(tab = 'hair') {
    this.game.showProfileScene();
    const c = this.career, d = c.data;
    const items = COSMETICS[tab];
    const el = this._screen('profile', `
      <button class="icon-btn back" data-a="back" aria-label="Back">${ICON.back}</button>
      <div class="coinbar"><span class="coin"></span>${d.coins}</div>
      <div class="stage" data-a="rotate"></div>
      <div class="side">
        <div class="pcard">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div><div class="kicker">${esc(this._club())}</div><div class="pname">${esc(c.name)}</div><div class="meta"><span>#${c.number} · Forward</span></div></div>
            <div style="text-align:right"><div class="ovr">${c.rating()}</div><div class="muted" style="font-size:12px">RATING</div></div>
          </div>
          <div class="statgrid"><div><b>${d.goals}</b>Goals</div><div><b>${c.totalStars()}</b>Stars</div><div><b>${d.points}</b>Career pts</div></div>
        </div>
        <div class="pcard">
          <div class="tabs">${['hair', 'boots', 'kit', 'accessory'].map(t => `<button class="tab ${t === tab ? 'on' : ''}" data-tab="${t}">${t === 'kit' ? 'Jersey' : t}</button>`).join('')}</div>
          <div class="items" style="margin-top:10px">${items.map(it => {
            const owned = c.owns(tab, it.id), on = d.equipped[tab] === it.id;
            const ach = it.unlock && ACHIEVEMENTS.find(a => a.id === it.unlock);
            const swatch = it.color != null ? `<span class="dot" style="background:${hex(it.color)}"></span>` : it.kit ? `<span class="dot" style="background:${hex(it.kit.shirt)}"></span>` : '';
            const price = owned ? (on ? 'Equipped' : 'Owned') : ach ? `Unlock: ${esc(ach.name)}` : `<span class="coin"></span>${it.price}`;
            const cant = !owned && (ach || d.coins < it.price);
            return `<button class="item ${on ? 'on' : ''} ${cant ? 'cant' : ''}" data-id="${it.id}"><b>${swatch} ${esc(it.name)}</b><span class="price">${price}</span></button>`;
          }).join('')}</div>
        </div>
        <div class="pcard"><div class="kicker" style="margin-bottom:8px">Achievements</div><div class="achs">${ACHIEVEMENTS.map(a => {
          const got = d.achievements.includes(a.id);
          return `<div class="ach ${got ? 'got' : ''}"><span>${got ? '★' : '☆'} ${esc(a.name)} — ${esc(a.desc)}</span><b>+${a.coins}</b></div>`;
        }).join('')}</div></div>
      </div>`);
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.click();
      if (b.dataset.a === 'back') return this.showMenu();
      if (b.dataset.tab) return this.showProfile(b.dataset.tab);
      const id = b.dataset.id;
      if (!id) return;
      if (!c.owns(tab, id)) {
        if (!c.buy(tab, id)) { this.hud.toast(d.coins < (items.find(i => i.id === id)?.price ?? 0) ? 'Not enough coins yet — keep playing!' : 'Unlock it with an achievement'); return; }
        this.audio.play('coin');
      }
      c.equip(tab, id);
      this.game.refreshProfile();
      this.showProfile(tab);
    };
    // drag the stage to spin the player
    const stage = el.querySelector('.stage');
    let lastX = null;
    stage.addEventListener('pointerdown', e => { lastX = e.clientX; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => { if (lastX == null) return; this.game.rotateProfile((e.clientX - lastX) * -0.01); lastX = e.clientX; });
    stage.addEventListener('pointerup', () => { lastX = null; });
  }

  _club() {
    const d = this.career.data;
    return d.stars[2] > 0 ? 'Harbor Town FC' : 'Harbor Town U19 · Trialist';
  }

  // ------------------------------------------------------------------ settings
  showSettings() {
    const s = this.career.data.settings;
    const seg = (key, opts) => `<span class="seg" data-key="${key}">${opts.map(([v, l]) => `<button class="${s[key] === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</span>`;
    const el = this._screen('screen solid', `
      <button class="icon-btn back" data-a="back" aria-label="Back">${ICON.back}</button>
      <h2>Settings</h2>
      <div class="settings">
        <div class="setrow">Sound ${seg('sound', [[true, 'On'], [false, 'Off']])}</div>
        <div class="setrow">Graphics ${seg('quality', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']])}</div>
        <div class="setrow">Gesture guide ${seg('guide', [[true, 'On'], [false, 'Off']])}</div>
        <div class="setrow">Career progress <button class="btn" data-a="reset" style="min-height:40px;font-size:16px">Reset</button></div>
        <p class="tip">Graphics changes apply after reloading the page.</p>
      </div>`);
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.click();
      if (b.dataset.a === 'back') return this.showMenu();
      if (b.dataset.a === 'reset') {
        if (b.dataset.armed) { this.career.resetAll(); b.textContent = 'Done'; delete b.dataset.armed; return; }
        b.dataset.armed = '1'; b.textContent = 'Tap again to confirm'; return;
      }
      const key = b.parentElement.dataset.key;
      if (!key) return;
      let v = b.dataset.v; if (v === 'true') v = true; if (v === 'false') v = false;
      s[key] = v;
      this.career.save();
      if (key === 'sound') this.audio.setEnabled(v);
      this.showSettings();
    };
  }

  // ------------------------------------------------------------------ level flow
  showIntro(index) {
    const L = LEVELS[index];
    this.game.loadLevel(index);
    const home = TEAMS[L.home], away = TEAMS[L.away];
    const style = { corner: 'Score in a corner', curve: 'Bend the ball in', header: 'Score with a header', perfect: 'Every pass perfectly weighted', power: 'Hit it hard' }[L.style || (L.objective.type === 'goal' ? 'corner' : 'perfect')];
    const el = this._screen('screen', `
      <div class="intro">
        <div class="matchup"><i class="crest" style="background:${home.crest}"></i>${esc(home.name)} <span>vs</span> <i class="crest" style="background:${away.crest}"></i>${esc(away.name)}</div>
        <div class="kicker">Level ${L.number} · ${esc(CHAPTERS.find(c => c.levels.includes(L.number)).title)}</div>
        <h2 class="lvtitle">${esc(L.title)}</h2>
        <p class="brief">${esc(L.brief)}</p>
        <div class="obj">${ICON.target}<span>${esc(L.objective.text)}</span></div>
        <div class="goals3">
          <div>${starSvg(true)} Complete the objective</div>
          <div>${starSvg(true)} Use ${L.par} move${L.par === 1 ? '' : 's'} or fewer (max ${L.maxActions})</div>
          <div>${starSvg(true)} ${style}</div>
        </div>
        ${L.hint ? `<p class="tip">💡 ${esc(L.hint)}</p>` : ''}
        <div class="row"><button class="btn" data-a="back">Back</button><button class="btn primary center" data-a="play">Play</button></div>
      </div>`);
    el.querySelectorAll('.goals3 svg').forEach(s => { s.style.width = '16px'; s.style.height = '16px'; });
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      this.click();
      if (a === 'back') return this.showLevels();
      if (a === 'play') this.play();
    };
  }

  play() {
    this.clear();
    this._mountHud();
    this.game.begin();
    this._rotateTip();
  }

  _mountHud() {
    this.hud.unmount();
    this.hud.mount(this.game.level, this.career);
  }

  _rotateTip() {
    if (window.innerHeight > window.innerWidth && !this._rotSeen) {
      this._rotSeen = true;
      const t = document.createElement('div');
      t.className = 'rotate-tip';
      t.innerHTML = 'Tip: turn your phone sideways for the best view.<br><small class="muted">Tap to dismiss</small>';
      t.onclick = () => t.remove();
      this.hud.el?.appendChild(t);
      setTimeout(() => t.remove(), 3500);
    }
  }

  showPause() {
    this.game.setPaused(true);
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `<h2>Paused</h2><div class="menu">
      <button class="btn primary" data-a="resume">Resume</button>
      <button class="btn" data-a="restart">Restart Level</button>
      <button class="btn" data-a="levels">Level Selection</button>
      <button class="btn" data-a="menu">Main Menu</button></div>`;
    this.root.appendChild(el);
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      this.click();
      el.remove();
      this.game.setPaused(false);
      if (a === 'restart') { this.game.restart(); this._mountHud(); }
      if (a === 'levels') this.showLevels();
      if (a === 'menu') this.showMenu();
    };
  }

  showResult(r) {
    this.hud.unmount();
    const c = this.career;
    const L = r.level;
    const ch = CHAPTERS.find(x => x.levels.includes(L.number));
    const done = ch.levels.filter(n => c.data.stars[n - 1] > 0).length;
    const last = r.index + 1 >= LEVELS.length;
    let html;
    if (r.success) {
      html = `
        <div class="kicker" style="text-align:center">Level ${L.number} · ${esc(L.title)}</div>
        <h2 class="title good">${r.stats.goal ? 'Goal!' : 'Complete!'}</h2>
        <div class="bigstars">${[0, 1, 2].map(i => starSvg(i < r.stars)).join('')}</div>
        <div class="reasons">${r.reasons.map(x => `<div class="${x.ok ? 'ok' : 'no'}"><span>${esc(x.label)}</span><span>${x.ok ? '★' : '—'}</span></div>`).join('')}</div>
        <div class="rewards"><span><span class="coin"></span>+${r.rewards.coins}</span><span>+${r.rewards.points} career pts</span><span>Rating ${c.rating()}</span></div>
        <div class="progress"><span>${esc(ch.name)} · ${esc(ch.title)} — ${done}/${ch.levels.length}</span><div class="bar"><i data-w="${Math.round((done / ch.levels.length) * 100)}"></i></div></div>
        <div class="row">
          <button class="btn" data-a="retry">Retry</button>
          <button class="btn" data-a="menu">Menu</button>
          <button class="btn primary center" data-a="next">${last ? 'Finish' : 'Next Level'}</button>
        </div>`;
    } else {
      html = `
        <div class="kicker" style="text-align:center">Level ${L.number} · ${esc(L.title)}</div>
        <h2 class="title bad">${esc(r.text)}</h2>
        <p class="tip">${esc(r.tip || 'Try a different idea.')}</p>
        <div class="row">
          <button class="btn" data-a="menu">Menu</button>
          <button class="btn primary center" data-a="retry">Try Again</button>
        </div>`;
    }
    const el = this._screen('screen', `<div class="result">${html}</div>`);
    if (r.success) {
      el.querySelectorAll('.bigstars svg').forEach((s, i) => setTimeout(() => {
        s.classList.add('pop');
        if (i < r.stars) { s.classList.add('on'); this.audio.play('star', { rate: 1 + i * 0.12 }); }
      }, 350 + i * 280));
      requestAnimationFrame(() => el.querySelectorAll('.bar i').forEach(b => { b.style.width = b.dataset.w + '%'; }));
      r.rewards.achievements.forEach((a, i) => setTimeout(() => this.achievementToast(a), 1300 + i * 1200));
      setTimeout(() => this.audio.play('coin'), 1250);
    }
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      this.click();
      if (a === 'retry') { this.clear(); this.game.restart(); this._mountHud(); }
      if (a === 'menu') this.showMenu();
      if (a === 'next') {
        const story = STORY.afterLevel[L.number];
        const go = () => (last ? this.showMenu() : this.showIntro(r.index + 1));
        if (story && !c.data.seenStory[L.number]) { c.data.seenStory[L.number] = true; c.save(); this.showNews(story, go); }
        else go();
      }
    };
  }

  achievementToast(a) {
    const t = document.createElement('div');
    t.className = 'toast ach';
    t.textContent = `★ Achievement: ${a.name}  +${a.coins}`;
    this.root.appendChild(t);
    this.audio.play('coin');
    setTimeout(() => t.remove(), 2500);
  }
}
