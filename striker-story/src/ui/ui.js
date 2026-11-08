// All screens. DOM over the canvas pitch.
import { SKILLS, SHOP, ACTIVITIES } from '../career/career.js';
import { haptics } from '../fx/haptics.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');

export class UI {
  constructor(root, deps) { Object.assign(this, deps); this.root = root; this.tab = 'week'; this.probe = document.getElementById('probe'); }

  safeTop() { return parseFloat(getComputedStyle(this.probe).paddingTop) || 0; }
  safeBottom() { return parseFloat(getComputedStyle(this.probe).paddingBottom) || 0; }
  click() { this.audio.unlock(); this.audio.play('click', { vol: 0.6 }); haptics.tick(); }
  toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2300); }

  _scr(cls, html) {
    this.root.innerHTML = '';
    const el = document.createElement('div');
    el.className = cls; el.innerHTML = html;
    this.root.appendChild(el);
    return el;
  }

  // -------------------------------------------------------------- title
  showTitle() {
    this.app.mode = 'menu';
    const c = this.career;
    const el = this._scr('scr center', `
      <div class="logo"><b>Striker</b><b>Story</b><span>From Sunday league to legend</span></div>
      <div class="wrap" style="width:min(340px,100%)">
        ${c.active ? `<button class="btn go" data-a="cont">Continue <small>${esc(c.d.name)} · ${esc(c.d.club)}</small></button>` : ''}
        <button class="btn ${c.active ? '' : 'go'}" data-a="new">New Career</button>
        <button class="btn" data-a="sound">Sound: ${this.audio.enabled ? 'On' : 'Off'}</button>
      </div>`);
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      this.click();
      if (a === 'cont') this.showHub();
      if (a === 'new') this.showNew();
      if (a === 'sound') { this.audio.setEnabled(!this.audio.enabled); this.app.saveSettings(); this.showTitle(); }
    };
  }

  showNew() {
    const el = this._scr('scr center', `
      <div class="k">New career</div><h2>Your name on the shirt</h2>
      <form class="wrap card" style="width:min(400px,100%)" autocomplete="off">
        <div class="field"><label for="nm">Player name</label><input id="nm" maxlength="14" value="Rivera" /></div>
        <div class="field"><label for="no">Shirt number</label><input id="no" type="number" min="1" max="99" value="9" inputmode="numeric" /></div>
        <p style="margin:0;color:var(--dim);font-size:13px;line-height:1.5">You are 17. Harbor Rovers in the County League have given you a chance. Score, earn trust, and climb to the Elite League.</p>
        <button class="btn go" type="submit">Sign the contract</button>
      </form>`);
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault(); this.click();
      const name = el.querySelector('#nm').value.trim().slice(0, 14) || 'Rivera';
      const num = Math.max(1, Math.min(99, parseInt(el.querySelector('#no').value, 10) || 9));
      this.career.newCareer(name, num);
      this.audio.play('sting', { vol: 0.6 });
      this.showHub();
    };
  }

  // -------------------------------------------------------------- hub
  showHub(tab = this.tab) {
    this.app.mode = 'hub';
    this.tab = tab;
    const c = this.career, d = c.d, cl = c.club, fx = c.nextFixture();
    const bar = (label, v, col) => `<div class="meter">${label} <b>${Math.round(v)}</b><div><i style="width:${v}%;background:${col}"></i></div></div>`;
    const offers = d.offers.length;
    const el = this._scr('scr', `
      <div class="wrap">
        <div class="card">
          <div class="top">
            <div class="crest" style="background:${cl.colors[0]};color:${cl.colors[1]}">${esc(cl.short)}</div>
            <div class="who"><b>${esc(d.name)} #${d.number}</b><span>${esc(d.club)} · ${esc(c.league.name)} · Age ${d.age}</span></div>
            <div class="cash">${money(d.money)}<span>${money(d.wage)}/wk · OVR ${c.rating()}</span></div>
          </div>
          <div class="meters">
            ${bar('Energy', d.energy, d.energy < 30 ? 'var(--scarlet)' : 'var(--good)')}
            ${bar('Happiness', d.happy, 'var(--gold)')}
            ${bar('Coach trust', d.rel.coach, '#7fb6ff')}
            ${bar('Team bond', d.rel.team, '#c79bff')}
          </div>
        </div>
        ${fx ? `<div class="card next">
          <div class="k">Season ${d.season} · Week ${d.week + 1} of ${d.fixtures.length}</div>
          <div class="vs"><span>${esc(cl.short)}</span><small>${fx.home ? 'Home' : 'Away'} vs</small><span>${esc(fx.opp.name)}</span></div>
          ${d.energy < 30 ? '<div style="font-size:12px;color:var(--scarlet)">Low energy: shots will be weaker and less accurate. Rest or grab an energy drink.</div>' : ''}
          <button class="btn go" data-a="play">Play match</button>
        </div>` : `<button class="btn gold" data-a="endseason">End of season</button>`}
        <div class="tabs">${[['week', 'This week'], ['skills', `Skills${d.sp ? ` (${d.sp})` : ''}`], ['shop', 'Shop'], ['league', 'League'], ['inbox', 'Inbox'], ['career', 'Career']].map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}${k === 'inbox' && offers ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>
        <div class="list" data-body>${this._tab(tab)}</div>
      </div>`);
    el.onclick = (e) => this._hubClick(e);
  }

  _tab(tab) {
    const c = this.career, d = c.d;
    if (tab === 'week') return ACTIVITIES.map(a => `
      <button class="item" data-act="${a.id}" ${c.canDo(a) ? '' : 'disabled'}><b>${esc(a.name)}</b><em>${a.energy > 0 ? `−${a.energy} energy` : `+${-a.energy} energy`}${a.cost ? `<br>${money(a.cost)}` : ''}</em><span>${esc(a.desc)}</span></button>`).join('');
    if (tab === 'skills') return `<div class="card" style="font-size:13px;color:var(--dim)">Skill points: <b style="color:var(--gold);font-size:18px">${d.sp}</b> · each upgrade +2. Earn points with good match ratings, goals and training.</div>` +
      Object.entries(SKILLS).map(([k, s]) => `
      <div class="skill"><b>${s.name} <span style="color:var(--chalk);float:right;font:800 19px var(--display)">${c.skill(k)}</span></b>
        <div class="bar"><i style="width:${c.skill(k)}%"></i></div><span>${esc(s.desc)}</span>
        <button class="plus" data-up="${k}" ${d.sp > 0 && d.skills[k] < 100 ? '' : 'disabled'} aria-label="Upgrade ${s.name}">+</button></div>`).join('');
    if (tab === 'shop') return SHOP.map(it => {
      const owned = it.kind === 'own' && d.owned.includes(it.id);
      return `<button class="item" data-buy="${it.id}" ${owned || d.money < it.price ? 'disabled' : ''}><b>${esc(it.name)}</b><em>${owned ? 'Owned' : money(it.price)}</em><span>${esc(it.desc)}</span></button>`;
    }).join('');
    if (tab === 'league') return `<div class="card"><div class="k" style="margin-bottom:8px">${esc(c.league.name)} · Season ${d.season}</div><table><thead><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${c.sortedTable().map((t, i) => `<tr class="${t.name === d.club ? 'me' : ''}"><td>${i + 1}</td><td>${esc(t.name)}</td><td>${t.p}</td><td>${t.w}</td><td>${t.dr}</td><td>${t.l}</td><td>${t.gf - t.ga}</td><td>${t.pts}</td></tr>`).join('')}</tbody></table></div>`;
    if (tab === 'inbox') return d.offers.map((o, i) => `
      <div class="news" style="border-color:var(--gold)"><b>Offer: ${esc(o.club)}</b><p>${esc(o.league)} · ${money(o.wage)} per week. You would join at the end of this season.</p>
        <div class="row" style="margin-top:10px"><button class="btn" data-decline="${i}" style="min-height:44px;font-size:18px">Decline</button><button class="btn gold" data-accept="${i}" style="min-height:44px;font-size:18px">Accept</button></div></div>`).join('') +
      d.inbox.map(n => `<div class="news"><b>${esc(n.t)}</b><p>${esc(n.b)}</p></div>`).join('');
    if (tab === 'career') {
      const s = d.stats;
      return `<div class="card"><div class="gains"><div><b>${s.apps}</b>Apps</div><div><b>${s.goals}</b>Goals</div><div><b>${s.assists}</b>Assists</div><div><b>${c.avgRating().toFixed(1)}</b>Avg rating</div><div><b>${d.fans}</b>Fans</div><div><b>${c.position()}</b>League pos.</div></div></div>
      <div class="card"><div class="k" style="margin-bottom:8px">Career · ${d.career.goals} goals in ${d.career.apps} games</div>${d.career.seasons.length ? `<table><thead><tr><th>S</th><th>Club</th><th>Pos</th><th>G</th><th>A</th><th>Avg</th></tr></thead><tbody>${d.career.seasons.map(x => `<tr><td>${x.season}</td><td>${esc(x.club)}${x.goldenBoot ? ' 👟' : ''}</td><td>${x.pos}</td><td>${x.goals}</td><td>${x.assists}</td><td>${x.avg}</td></tr>`).join('')}</tbody></table>` : '<p style="margin:0;color:var(--dim);font-size:13px">Your first season is under way.</p>'}</div>
      <button class="btn" data-a="title" style="min-height:44px;font-size:18px">Main menu</button>`;
    }
    return '';
  }

  _hubClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const c = this.career;
    this.click();
    if (b.dataset.tab) return this.showHub(b.dataset.tab);
    if (b.dataset.a === 'play') return this.app.startMatch();
    if (b.dataset.a === 'endseason') return this.showSeasonEnd();
    if (b.dataset.a === 'title') return this.showTitle();
    if (b.dataset.act) {
      if (b.dataset.act === 'train') return this.app.startTraining();
      const r = c.doActivity(b.dataset.act);
      if (r) { this.toast(r.gained ? `+${r.gained} skill points` : 'Done!'); this.audio.play('coin', { vol: 0.6 }); }
      return this.showHub();
    }
    if (b.dataset.up) { if (c.upgrade(b.dataset.up)) { this.audio.play('levelup'); haptics.light(); } return this.showHub('skills'); }
    if (b.dataset.buy) { if (c.buy(b.dataset.buy)) { this.audio.play('coin'); this.toast('Purchased!'); } return this.showHub('shop'); }
    if (b.dataset.accept != null) { c.acceptOffer(+b.dataset.accept); this.audio.play('sting'); return this.showHub('inbox'); }
    if (b.dataset.decline != null) { c.declineOffer(+b.dataset.decline); return this.showHub('inbox'); }
  }

  // -------------------------------------------------------------- match
  showMatch(flow) {
    const c = this.career, cl = c.club, opp = flow.fx.opp;
    const H = flow.home ? cl : opp, A = flow.home ? opp : cl;
    this.flow = flow;
    const el = this._scr('pass', `
      <div class="board"><span><i style="background:${H.colors[0]}"></i>${esc(H.short)}</span><span class="sc" data-sc>0 – 0</span><span><i style="background:${A.colors[0]}"></i>${esc(A.short)}</span><span class="clk" data-clk>0'</span></div>
      <div class="feed" data-feed></div>`);
    this.matchEl = el;
    this.matchFeed(flow);
  }

  matchClock(flow) { const c = this.matchEl?.querySelector('[data-clk]'); if (c) c.textContent = `${Math.floor(flow.minute)}'`; const s = this.matchEl?.querySelector('[data-sc]'); if (s) s.textContent = `${flow.score[0]} – ${flow.score[1]}`; }
  matchFeed(flow) {
    const f = this.matchEl?.querySelector('[data-feed]'); if (!f) return;
    f.innerHTML = flow.feed.slice(0, 3).reverse().map(x => `<div class="${x.kind}"><b>${x.min}'</b>${esc(x.text)}</div>`).join('');
    this.matchClock(flow);
  }

  momentIntro(min, label, type, go) {
    const f = this.matchEl?.querySelector('[data-feed]'); if (f) f.hidden = true;
    const el = document.createElement('div');
    el.className = 'intro tap';
    el.innerHTML = `<span>${min}'</span><b>${esc(label)}</b><em>Tap to play</em>`;
    this.matchEl.appendChild(el);
    this.audio.play('whistle', { vol: 0.35, rate: 1.1 });
    let done = false;
    const start = () => { if (done) return; done = true; el.remove(); go(); };
    el.onclick = () => { this.click(); start(); };
    setTimeout(start, 2200);
  }

  momentCtx() {
    const c = this.career;
    const cl = c.club, opp = this.flow ? this.flow.fx.opp : cl;
    const same = cl.colors[0] === opp.colors[0];
    return {
      skills: c.skills(), fatigue: c.fatigue(), teamRel: c.d.rel.team,
      theme: { us: cl.colors, opp: same ? ['#f4f4f4', '#111'] : opp.colors, gk: ['#19c37d', '#0b3d1f'], number: c.d.number },
      top: this.safeTop() + 60, bottom: this.safeBottom() + 70,
    };
  }

  momentStart(training = false) {
    const el = document.createElement('div');
    el.className = 'mhud';
    el.innerHTML = `<span class="hint">${training ? 'Hit the targets' : 'Pull back to shoot · bend your swipe to curl'}</span><button class="chip" data-chip>CHIP</button>`;
    (this.matchEl || this.root.firstChild).appendChild(el);
    this.mhud = el;
    el.querySelector('[data-chip]').onclick = (e) => { e.stopPropagation(); const on = this.app.play.toggleLob(); e.currentTarget.classList.toggle('on', on); };
  }

  momentEnd(flow, res) {
    this.mhud?.remove(); this.mhud = null;
    const f = this.matchEl?.querySelector('[data-feed]'); if (f) f.hidden = false;
    this.matchFeed(flow);
  }

  banner(text) { const b = document.createElement('div'); b.className = 'banner'; b.textContent = text; document.body.appendChild(b); setTimeout(() => b.remove(), 1700); }

  matchOver(flow, res) {
    const c = this.career, d = c.d, lm = d.lastMatch;
    const won = lm.ourGoals > lm.theirGoals, draw = lm.ourGoals === lm.theirGoals;
    const el = this._scr('scr center', `
      <div class="wrap" style="width:min(440px,100%)">
        <div class="k" style="text-align:center">Full time</div>
        <div class="result-score">${esc(c.club.short)} ${flow.home ? `${lm.ourGoals} – ${lm.theirGoals}` : `${lm.ourGoals} – ${lm.theirGoals}`} ${esc(lm.opp)}</div>
        <div style="text-align:center;font:800 22px var(--display);color:${won ? 'var(--good)' : draw ? 'var(--chalk)' : 'var(--scarlet)'}">${won ? 'WIN' : draw ? 'DRAW' : 'DEFEAT'}</div>
        <div class="big"><b data-rate>0.0</b><span>Your rating</span></div>
        <div class="gains"><div><b>${lm.myGoals}</b>Goals</div><div><b>${lm.myAssists}</b>Assists</div><div><b>+${res.spGain}</b>Skill pts</div><div><b>${money(res.wage + res.bonus)}</b>Earned</div><div><b>${d.energy}</b>Energy</div><div><b>${d.rel.coach}</b>Coach</div></div>
        ${res.news.map(n => `<div class="news" style="border-color:var(--gold)"><b>${esc(n.t)}</b><p>${esc(n.b)}</p></div>`).join('')}
        <button class="btn go" data-a="go">${res.seasonOver ? 'Season finale' : 'Continue'}</button>
      </div>`);
    const r = el.querySelector('[data-rate]'), t0 = performance.now();
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / 900); r.textContent = (lm.rating * (1 - Math.pow(1 - k, 3))).toFixed(1); if (k < 1) requestAnimationFrame(tick); else if (lm.rating >= 8) { this.audio.play('levelup'); haptics.success(); } };
    requestAnimationFrame(tick);
    setTimeout(() => this.audio.play('coin'), 950);
    el.onclick = (e) => { if (!e.target.closest('button')) return; this.click(); if (res.seasonOver) this.showSeasonEnd(); else this.showHub('week'); };
  }

  showSeasonEnd() {
    const c = this.career;
    const pos = c.position(), top = c.sortedTable()[0];
    const { summary, moved } = c.endSeason();
    this.audio.play('sting');
    const el = this._scr('scr center', `
      <div class="wrap" style="width:min(440px,100%)">
        <div class="k" style="text-align:center">Season ${summary.season} complete</div>
        <h2 style="text-align:center">${pos === 1 ? 'Champions!' : `Finished ${pos}${['st', 'nd', 'rd'][pos - 1] || 'th'}`}</h2>
        <p style="text-align:center;color:var(--dim);margin:0">${esc(summary.league)} · winners ${esc(top.name)}</p>
        <div class="gains"><div><b>${summary.apps}</b>Apps</div><div><b>${summary.goals}</b>Goals</div><div><b>${summary.avg}</b>Avg</div></div>
        ${summary.goldenBoot ? '<div class="news" style="border-color:var(--gold)"><b>👟 Golden Boot</b><p>Top scorer in the league. +40 fans.</p></div>' : ''}
        ${moved ? `<div class="news" style="border-color:var(--good)"><b>${moved.promoted ? 'Promoted!' : `Welcome to ${esc(moved.club)}`}</b><p>${moved.promoted ? `${esc(c.d.club)} go up to the ${esc(c.league.name)} — and you with them.` : `You are now playing in the ${esc(c.league.name)}.`}</p></div>` : ''}
        <button class="btn go" data-a="go">Start season ${c.d.season}</button>
      </div>`);
    el.onclick = (e) => { if (!e.target.closest('button')) return; this.click(); this.showHub('week'); };
  }

  // -------------------------------------------------------------- training
  showTraining(state) {
    const el = this._scr('pass', `<div class="board"><span>TRAINING</span><span class="sc" data-tr>Shot 1/5</span><span class="clk" data-hits>0 hits</span></div>`);
    this.matchEl = el;
    this.trainEl = el;
    this.updateTraining(state);
  }
  updateTraining(st) { const e = this.trainEl; if (!e) return; e.querySelector('[data-tr]').textContent = `Shot ${Math.min(st.shot + 1, st.of)}/${st.of}`; e.querySelector('[data-hits]').textContent = `${st.hits} hits`; }
  trainingDone(hits, sp) {
    const el = this._scr('scr center', `
      <div class="wrap card" style="width:min(380px,100%);text-align:center">
        <div class="k">Training complete</div>
        <div class="big"><b>${hits}</b><span>Targets hit</span></div>
        <p style="margin:0;color:var(--dim)">+${sp} skill points · coach trust up</p>
        <button class="btn go" data-a="go">Back to the week</button>
      </div>`);
    this.audio.play(hits >= 3 ? 'levelup' : 'coin');
    el.onclick = (e) => { if (!e.target.closest('button')) return; this.click(); this.showHub('skills'); };
  }
}
