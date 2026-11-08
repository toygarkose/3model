// All screens. DOM over the canvas pitch.
import { SKILLS, SHOP, ACTIVITIES } from '../career/career.js';
import { NATIONS } from '../data/teams.js';
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
        ${c.active && !c.d.retired ? `<button class="btn go" data-a="cont">Continue <small>${esc(c.d.name)} · ${esc(c.d.club)}</small></button>` : ''}
        ${c.active && c.d.retired ? `<button class="btn gold" data-a="legacy">Legacy <small>${esc(c.d.name)} · ${c.legacy().toLocaleString('en-US')} pts</small></button>` : ''}
        <button class="btn ${c.active ? '' : 'go'}" data-a="new">New Career</button>
        <button class="btn" data-a="sound">Sound: ${this.audio.enabled ? 'On' : 'Off'}</button>
      </div>`);
    el.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      this.click();
      if (a === 'cont') this.showHub();
      if (a === 'legacy') this.showLegacy();
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
        <div class="field"><label for="na">Nationality</label><select id="na" class="sel">${NATIONS.map(n => `<option>${esc(n)}</option>`).join('')}</select></div>
        <p style="margin:0;color:var(--dim);font-size:13px;line-height:1.5">You are 17. Harbor Rovers in the County League have given you a chance. Score, earn trust, and climb to the Elite League.</p>
        <button class="btn go" type="submit">Sign the contract</button>
      </form>`);
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault(); this.click();
      const name = el.querySelector('#nm').value.trim().slice(0, 14) || 'Rivera';
      const num = Math.max(1, Math.min(99, parseInt(el.querySelector('#no').value, 10) || 9));
      this.career.newCareer(name, num, el.querySelector('#na').value);
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
    const ev = c.event();
    const el = this._scr('scr', `
      <div class="wrap">
        ${ev ? `<div class="news" style="border-color:#7fb6ff"><b>${esc(ev.title)}</b><p>${esc(ev.text)}</p><div class="row" style="margin-top:10px">${ev.options.map((o, i) => `<button class="btn" data-ev="${i}" style="min-height:44px;font-size:17px">${esc(o.label)}</button>`).join('')}</div></div>` : ''}
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
        ${fx ? `<div class="card next" ${fx.special ? 'style="border-color:var(--gold)"' : ''}>
          <div class="k">${fx.special ? esc(fx.label) : `Season ${d.season} · Week ${d.week + 1} of ${d.fixtures.length}`}</div>
          <div class="vs"><span>${esc(fx.special === 'intl' ? d.nation : cl.short)}</span><small>${fx.special ? 'vs' : fx.home ? 'Home vs' : 'Away vs'}</small><span>${esc(fx.opp.name)}</span></div>
          ${d.energy < 30 ? '<div style="font-size:12px;color:var(--scarlet)">Low energy: shots will be weaker and less accurate. Rest or grab an energy drink.</div>' : ''}
          ${d.injury > 0 ? `<div style="font-size:13px;color:var(--scarlet)">Injured: ${d.injury} week${d.injury > 1 ? 's' : ''} out. Rest up — your team plays without you.</div><button class="btn" data-a="skip">Watch from the stands</button>`
            : `<button class="btn go" data-a="play">${fx.special === 'cup' ? 'Play cup tie' : fx.special === 'intl' ? 'Play for your country' : 'Play match'}</button>`}
        </div>` : `<button class="btn gold" data-a="endseason">End of season</button>`}
        <div class="tabs">${[['week', 'This week'], ['skills', `Skills${d.sp ? ` (${d.sp})` : ''}`], ['life', 'Life'], ['shop', 'Shop'], ['league', 'League'], ['inbox', 'Inbox'], ['career', 'Career']].map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}${(k === 'inbox' && offers) || (k === 'life' && d.sponsorOffers.length) ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>
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
    if (tab === 'life') {
      const bar = (v, col) => `<div class="bar" style="height:7px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:6px"><i style="display:block;height:100%;width:${v}%;background:${col}"></i></div>`;
      return `<div class="news"><b>${d.partner ? `Partner: ${esc(d.partner.name)}` : 'Single'}</b><p>${d.partner ? 'Date nights keep the relationship strong. A happy home means faster recovery.' : 'Become better known (fans) and you might meet someone special.'}</p>${d.partner ? bar(d.partner.rel, '#ff8fb1') : ''}</div>` +
        d.sponsorOffers.map((o, i) => `<div class="news" style="border-color:var(--gold)"><b>Offer: ${esc(o.name)}</b><p>${money(o.weekly)} per week. Attend sponsor events or they will walk away (below 33%).</p>
          <div class="row" style="margin-top:10px"><button class="btn" data-sdecline="${i}" style="min-height:44px;font-size:18px">Decline</button><button class="btn gold" data-saccept="${i}" style="min-height:44px;font-size:18px">Sign deal</button></div></div>`).join('') +
        (d.sponsors.length ? d.sponsors.map(sp => `<div class="news"><b>${esc(sp.name)} · ${money(sp.weekly)}/wk</b><p>Relationship ${sp.rel}%</p>${bar(sp.rel, sp.rel < 45 ? 'var(--scarlet)' : 'var(--good)')}</div>`).join('') : '<div class="news"><b>No sponsors yet</b><p>Brands come calling once you have 40+ fans.</p></div>') +
        `<div class="news"><b>${d.agent ? `Agent: ${d.agent.weeks} weeks left` : 'No agent'}</b><p>${d.agent ? 'More offers, +25% wages, signing bonuses, better at negotiating.' : 'Hire one in the Shop.'}</p></div>`;
    }
    if (tab === 'shop') return SHOP.map(it => {
      const owned = (it.kind === 'own' && d.owned.includes(it.id)) || (it.kind === 'staff' && d.agent);
      return `<button class="item" data-buy="${it.id}" ${owned || d.money < it.price ? 'disabled' : ''}><b>${esc(it.name)}</b><em>${owned ? 'Owned' : money(it.price)}</em><span>${esc(it.desc)}</span></button>`;
    }).join('');
    if (tab === 'league') return `<div class="card"><div class="k" style="margin-bottom:8px">${esc(c.league.name)} · Season ${d.season}</div><table><thead><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${c.sortedTable().map((t, i) => `<tr class="${t.name === d.club ? 'me' : ''}"><td>${i + 1}</td><td>${esc(t.name)}</td><td>${t.p}</td><td>${t.w}</td><td>${t.dr}</td><td>${t.l}</td><td>${t.gf - t.ga}</td><td>${t.pts}</td></tr>`).join('')}</tbody></table></div>`;
    if (tab === 'inbox') return d.offers.map((o, i) => `
      <div class="news" style="border-color:var(--gold)"><b>Offer: ${esc(o.club)}</b><p>${esc(o.league)} · ${money(o.wage)} per week. You would join at the end of this season.</p>
        <div class="row" style="margin-top:10px"><button class="btn" data-decline="${i}" style="min-height:44px;font-size:18px">Decline</button>${o.negotiated ? '' : `<button class="btn" data-nego="${i}" style="min-height:44px;font-size:18px">Ask +20%</button>`}<button class="btn gold" data-accept="${i}" style="min-height:44px;font-size:18px">Accept</button></div></div>`).join('') +
      d.inbox.map(n => `<div class="news"><b>${esc(n.t)}</b><p>${esc(n.b)}</p></div>`).join('');
    if (tab === 'career') {
      const s = d.stats;
      return `<div class="card"><div class="gains"><div><b>${s.apps}</b>Apps</div><div><b>${s.goals}</b>Goals</div><div><b>${s.assists}</b>Assists</div><div><b>${c.avgRating().toFixed(1)}</b>Avg rating</div><div><b>${d.fans}</b>Fans</div><div><b>${c.position()}</b>League pos.</div></div></div>
      <div class="card"><div class="k" style="margin-bottom:8px">Career · ${d.career.goals} goals in ${d.career.apps} games</div>${d.career.seasons.length ? `<table><thead><tr><th>S</th><th>Club</th><th>Pos</th><th>G</th><th>A</th><th>Avg</th></tr></thead><tbody>${d.career.seasons.map(x => `<tr><td>${x.season}</td><td>${esc(x.club)}${x.goldenBoot ? ' 👟' : ''}</td><td>${x.pos}</td><td>${x.goals}</td><td>${x.assists}</td><td>${x.avg}</td></tr>`).join('')}</tbody></table>` : '<p style="margin:0;color:var(--dim);font-size:13px">Your first season is under way.</p>'}</div>
      <div class="card"><div class="k" style="margin-bottom:8px">Honours · Legacy ${c.legacy().toLocaleString('en-US')}</div><p style="margin:0;font-size:13px;color:var(--dim);line-height:1.6">${[...d.trophies.map(t => `🏆 ${esc(t.name)} (S${t.season})`), ...d.awards.map(a => `⭐ ${esc(a.name)} (S${a.season})`)].join('<br>') || 'No honours yet. Win the cup, top the scoring charts, win the league.'}<br>${d.nation} caps: ${d.intl.caps} · goals: ${d.intl.goals}</p></div>
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
    if (b.dataset.a === 'skip') {
      const res = c.skipMatch(); const lm = c.d.lastMatch;
      this.toast(`${c.club.short} ${lm.ourGoals}-${lm.theirGoals} ${lm.opp}`);
      if (res.seasonOver) return this.showSeasonEnd();
      return this.showHub('week');
    }
    if (b.dataset.drill) return this.app.startTraining(b.dataset.drill);
    if (b.dataset.a === 'endseason') return this.showSeasonEnd();
    if (b.dataset.a === 'title') return this.showTitle();
    if (b.dataset.ev != null) {
      const o = c.answerEvent(+b.dataset.ev);
      const f = o?.fx || {}, parts = [];
      for (const [k, v] of Object.entries(f)) parts.push(`${v > 0 ? '+' : ''}${k === 'moneyW' ? '$' + Math.round(c.d.wage * v) : v} ${({ moneyW: '', sp: 'skill pts' })[k] ?? k}`);
      this.toast(parts.join(' · ').trim() || 'Done');
      return this.showHub();
    }
    if (b.dataset.saccept != null) { c.acceptSponsor(+b.dataset.saccept); this.audio.play('coin'); this.toast('Deal signed!'); return this.showHub('life'); }
    if (b.dataset.sdecline != null) { c.declineSponsor(+b.dataset.sdecline); return this.showHub('life'); }
    if (b.dataset.nego != null) { const r = c.negotiateOffer(+b.dataset.nego); this.toast(r === 'agreed' ? 'They agreed: +20% wage!' : 'They walked away.'); this.audio.play(r === 'agreed' ? 'levelup' : 'ooh'); return this.showHub('inbox'); }
    if (b.dataset.act) {
      if (b.dataset.act === 'train') return this.showDrills();
      if (b.dataset.act === 'team') return this.app.startTeamNight();
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
    const c = this.career, cl = flow.me, opp = flow.fx.opp;
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
    const cl = this.flow?.me || c.club, opp = this.flow ? this.flow.fx.opp : cl;
    const same = cl.colors[0] === opp.colors[0];
    return {
      skills: c.skills(), fatigue: c.fatigue(), teamRel: c.d.rel.team,
      theme: { us: cl.colors, opp: same ? ['#f4f4f4', '#111'] : opp.colors, gk: ['#19c37d', '#0b3d1f'], number: c.d.number },
      top: this.safeTop() + 60, bottom: this.safeBottom() + 70, replays: true,
    };
  }

  momentStart(training = false) {
    const m = this.app.play.m;
    const el = document.createElement('div');
    el.className = 'mhud';
    const hint = m?.phase === 'dribble' ? 'Swipe left or right as he closes in' : training ? (m?.type === 'crossbar' ? 'Hit the crossbar' : 'Hit the targets') : m?.type === 'buildup' ? 'Pass to a runner — or shoot from distance' : 'Pull back to shoot · bend your swipe to curl';
    el.innerHTML = `<span class="hint">${hint}</span><button class="chip" data-chip>CHIP</button>`;
    const d = this.career.d;
    if (d && (d.tutorial || 0) < 3 && !training) {
      d.tutorial = (d.tutorial || 0) + 1; this.career.save();
      const t = document.createElement('div');
      t.className = 'coach';
      t.innerHTML = m?.phase === 'dribble'
        ? '<b>Take him on</b><p>Watch the defender. When the arrows turn green, flick left or right to go past him.</p><span>Tap to start</span>'
        : '<b>How to shoot</b><p>Put your finger anywhere and <b>pull back</b>, away from the goal. Longer pull = more power. <b>Curve</b> your swipe to bend the ball. Release to kick.</p><div class="hand"></div><span>Tap to start</span>';
      this.app.play.paused = true;
      t.onclick = (e) => { e.stopPropagation(); t.remove(); this.app.play.paused = false; };
      el.appendChild(t);
    }
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
    const won = lm.won ?? lm.ourGoals > lm.theirGoals, draw = lm.won == null && lm.ourGoals === lm.theirGoals;
    const st = lm.stats || { chances: 0, onTarget: 0, passes: 0, keyPasses: 0 };
    const el = this._scr('scr center', `
      <div class="wrap" style="width:min(440px,100%)">
        <div class="k" style="text-align:center">${lm.special ? esc(lm.special) : 'Full time'}</div>
        <div class="result-score">${esc(flow.me.short)} ${lm.ourGoals} – ${lm.theirGoals} ${esc(lm.opp)}</div>
        <div style="text-align:center;font:800 22px var(--display);color:${won ? 'var(--good)' : draw ? 'var(--chalk)' : 'var(--scarlet)'}">${won ? (lm.shootout ? 'WIN ON PENALTIES' : 'WIN') : draw ? 'DRAW' : lm.shootout ? 'OUT ON PENALTIES' : 'DEFEAT'}</div>
        <div class="big"><b data-rate>0.0</b><span>Your rating${lm.rating >= 8 ? ' · ⭐ Player of the Match' : ''}</span></div>
        <div class="gains"><div><b>${st.chances}</b>Chances</div><div><b>${st.onTarget}</b>On target</div><div><b>${st.passes}</b>Passes</div></div>
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
        ${(summary.awards || []).map(a => `<div class="news" style="border-color:var(--gold)"><b>⭐ ${esc(a)}</b><p>${a === 'Golden Boot' ? 'Top scorer in the league. +40 fans.' : 'Voted the best player in the league this season.'}</p></div>`).join('')}
        ${(summary.trophies || []).map(t => `<div class="news" style="border-color:var(--good)"><b>🏆 ${esc(t)}</b><p>Silverware for the cabinet.</p></div>`).join('')}
        ${moved ? `<div class="news" style="border-color:var(--good)"><b>${moved.promoted ? 'Promoted!' : `Welcome to ${esc(moved.club)}`}</b><p>${moved.promoted ? `${esc(c.d.club)} go up to the ${esc(c.league.name)} — and you with them.` : `You are now playing in the ${esc(c.league.name)}.`}</p></div>` : ''}
        <button class="btn go" data-a="go">${c.d.retired ? 'Hang up your boots' : `Start season ${c.d.season}`}</button>
      </div>`);
    el.onclick = (e) => { if (!e.target.closest('button')) return; this.click(); if (c.d.retired) this.showLegacy(); else this.showHub('week'); };
  }

  showLegacy() {
    const c = this.career, d = c.d;
    this.audio.play('sting');
    const el = this._scr('scr center', `
      <div class="wrap" style="width:min(440px,100%)">
        <div class="k" style="text-align:center">Career over · age ${d.age}</div>
        <h2 style="text-align:center">${esc(d.name)}</h2>
        <div class="big"><b>${c.legacy().toLocaleString('en-US')}</b><span>Legacy points</span></div>
        <div class="gains"><div><b>${d.career.apps}</b>Games</div><div><b>${d.career.goals}</b>Goals</div><div><b>${d.career.assists}</b>Assists</div><div><b>${d.trophies.length}</b>Trophies</div><div><b>${d.awards.length}</b>Awards</div><div><b>${d.intl.caps}</b>Caps</div></div>
        <div class="news"><b>Honours</b><p>${[...d.trophies.map(t => esc(t.name)), ...d.awards.map(a => esc(a.name))].join(' · ') || '—'}</p></div>
        <button class="btn go" data-a="new">Start a new career</button>
        <button class="btn" data-a="title">Main menu</button>
      </div>`);
    el.onclick = (e) => { const a = e.target.closest('button')?.dataset.a; if (!a) return; this.click(); if (a === 'new') this.showNew(); else this.showTitle(); };
  }

  // -------------------------------------------------------------- training
  showTraining(state) {
    const el = this._scr('pass', `<div class="board"><span>${state.team ? 'TEAM NIGHT' : 'TRAINING'}</span><span class="sc" data-tr>Shot 1/5</span><span class="clk" data-hits>0 hits</span></div>`);
    this.matchEl = el;
    this.trainEl = el;
    this.updateTraining(state);
  }
  updateTraining(st) { const e = this.trainEl; if (!e) return; e.querySelector('[data-tr]').textContent = `Shot ${Math.min(st.shot + 1, st.of)}/${st.of}`; e.querySelector('[data-hits]').textContent = `${st.hits} hits`; }
  showDrills() {
    const el = this._scr('scr center', `
      <div class="k">Training ground</div><h2>Pick a drill</h2>
      <div class="wrap list" style="width:min(420px,100%)">
        <button class="item" data-drill="shooting"><b>Shooting targets</b><em>5 shots</em><span>Hit the corners of the goal</span></button>
        <button class="item" data-drill="dribble"><b>Take-on drill</b><em>3 reps</em><span>Beat the defender with a well-timed feint</span></button>
        <button class="item" data-drill="passing"><b>Passing drill</b><em>3 reps</em><span>Find a runner through the lines</span></button>
        <button class="btn" data-a="back" style="min-height:44px;font-size:18px">Back</button>
      </div>`);
    el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; this.click(); if (b.dataset.drill) this.app.startTraining(b.dataset.drill); else this.showHub('week'); };
  }

  teamNightDone(hits, gain) {
    const el = this._scr('scr center', `
      <div class="wrap card" style="width:min(380px,100%);text-align:center">
        <div class="k">Team night</div>
        <div class="big"><b>${hits}/3</b><span>Crossbar hits</span></div>
        <p style="margin:0;color:var(--dim)">The squad loved it: +${gain} team bond</p>
        <button class="btn go" data-a="go">Back to the week</button>
      </div>`);
    this.audio.play(hits ? 'levelup' : 'coin');
    el.onclick = (e) => { if (!e.target.closest('button')) return; this.click(); this.showHub('week'); };
  }

  replayLabel(on) {
    if (on) { const r = document.createElement('div'); r.className = 'replay'; r.innerHTML = '<span>● REPLAY</span><em>Tap to skip</em>'; document.body.appendChild(r); this.replayEl = r; }
    else { this.replayEl?.remove(); this.replayEl = null; }
  }

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
