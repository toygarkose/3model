import { TEAMS } from '../levels/teams.js';

export const ICON = {
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  hand: '<svg viewBox="0 0 48 48"><circle cx="16" cy="12" r="9" fill="rgba(255,176,32,.35)"/><path d="M14 10v18l-4-3c-2-1.5-4.6 1-3 3l9 11c1.2 1.5 3 2 4.8 2H31c3 0 5-2 5.4-5l1.6-10c.3-2-1-3.6-3-3.6-1 0-2 .5-2.4 1.4V20c0-2-2.8-2.6-3.6-.8v-1.6c0-2-3-2.4-3.6-.4V10c0-3-4.4-3-4.4 0z" fill="#fff" stroke="#1a1000" stroke-width="1.6"/></svg>',
};

export function starSvg(on) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 9 : 21;
    pts.push(`${(24 + Math.cos(a) * r).toFixed(1)},${(24 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><polygon class="${on ? 'st-on' : 'st-off'}" points="${pts.join(' ')}"/></svg>`;
}

export function starsHtml(n) { return `<span class="stars" aria-label="${n} of 3 stars">${[0, 1, 2].map(i => starSvg(i < n)).join('')}</span>`; }

// In-game overlay: scoreboard bug, objective, moves, aim info, banners, guide.
export class Hud {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
  }

  mount(level, career) {
    const home = TEAMS[level.home], away = TEAMS[level.away];
    const ctx = level.context || {};
    const [hs, as] = ctx.score || [0, 0];
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="bug"><span><i class="crest" style="background:${home.crest}"></i>${home.short}</span><span class="sc">${hs} – ${as}</span><span><i class="crest" style="background:${away.crest}"></i>${away.short}</span><span class="clk">${ctx.clock || ''}</span></div>
      <div class="hud-right">
        <button class="icon-btn" data-act="restart" aria-label="Restart level">${ICON.restart}</button>
        <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
      </div>
      <div class="hud-bottom">
        <div class="phase" data-phase></div>
        <div class="objective"><span class="lvl">LV ${level.number}</span><span>${level.objective.text}</span><span class="pips" data-pips></span></div>
      </div>
      <div class="aiminfo" data-aim hidden></div>`;
    this.root.appendChild(this.el);
    this.el.querySelector('[data-act=restart]').onclick = () => this.handlers.restart();
    this.el.querySelector('[data-act=pause]').onclick = () => this.handlers.pause();
    this.pips = this.el.querySelector('[data-pips]');
    this.phase = this.el.querySelector('[data-phase]');
    this.aim = this.el.querySelector('[data-aim]');
    this.level = level;
    this.guideShown = false;
    this.career = career;
  }

  unmount() { this.el?.remove(); this.el = null; this.hideGuide(); }

  setMoves(left, max) {
    if (!this.pips) return;
    this.pips.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < max - left ? 'used' : ''}"></i>`).join('');
    this.pips.title = `${left} moves left`;
  }

  setPhase(kind, guide = true) {
    if (!this.phase) return;
    const text = { pass: 'Draw a pass from the ball', shoot: 'Pass — or swipe at goal to shoot', header: 'Header! Swipe at the goal' }[kind] || '';
    this.phase.textContent = text;
    if (kind && guide && this.level.number <= 3 && !this.guideShown) { this.guideShown = true; this.showGuide(); }
  }

  setAimInfo(action) {
    if (!this.aim) return;
    if (!action) { this.aim.hidden = true; return; }
    this.aim.hidden = false;
    if (action.kind === 'shot') {
      const curve = Math.abs(action.curve) > 0.03 ? ' · CURL' : '';
      this.aim.innerHTML = `${action.header ? 'HEADER' : 'SHOT'}${curve}<span class="pw"><i style="width:${Math.round(action.power * 100)}%"></i></span>`;
    } else {
      const who = action.receiver ? (action.receiver.hero ? 'YOU' : action.receiver.name.split(' ')[0].toUpperCase()) : 'NOBODY';
      const kind = action.lofted ? (action.aerial ? 'CROSS' : 'LONG BALL') : 'PASS';
      const bend = Math.abs(action.curve) > 0.04 ? ' · BENT' : '';
      this.aim.innerHTML = `${kind}${bend} → <span style="color:${action.receiver ? (action.perfect ? 'var(--good)' : 'var(--chalk)') : 'var(--bad)'}">${who}</span>`;
    }
  }

  // A ghost hand that demonstrates drawing from the ball toward a target.
  showGuide() {
    const api = this.handlers.guideTarget?.();
    if (!api) return;
    const { from, to } = api;
    this.guide = document.createElement('div');
    this.guide.className = 'guide';
    this.guide.style.left = from.x + 'px';
    this.guide.style.top = from.y + 'px';
    this.guide.innerHTML = `<div class="hand" style="--gx:${to.x - from.x}px;--gy:${to.y - from.y}px">${ICON.hand}</div>`;
    this.root.appendChild(this.guide);
  }

  hideGuide() { this.guide?.remove(); this.guide = null; }

  banner(text, kind) {
    const b = document.createElement('div');
    b.className = 'banner ' + kind;
    b.textContent = text;
    this.el?.appendChild(b);
    setTimeout(() => b.remove(), 1500);
  }

  floatText(text, at, kind) {
    if (!this.el || at.behind) return;
    const f = document.createElement('div');
    f.className = 'float ' + kind;
    f.textContent = text;
    f.style.left = at.x + 'px'; f.style.top = at.y + 'px';
    this.el.appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }

  toast(text, kind = 'info') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = text;
    (this.el || this.root).appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  flashBallHint(at) {
    if (!this.el) return;
    const h = document.createElement('div');
    h.className = 'ballhint';
    h.style.left = at.x + 'px'; h.style.top = at.y + 'px';
    this.el.appendChild(h);
    setTimeout(() => h.remove(), 850);
    this.toast('Start your line on the ball');
  }
}
