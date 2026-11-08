// One match day: a fast 90-minute ticker with commentary, paused for your moments.
import { rng, randomMomentType, MOMENT_LABEL } from '../sim/moment.js';
import { simScore, randomName } from '../career/career.js';

const RATING = { goal: 1.3, assist: 0.8, saved: 0.15, post: 0.05, miss: -0.25, blocked: -0.2, tackled: -0.35, intercepted: -0.35, lost: -0.3 };

export class MatchFlow {
  constructor({ career, play, audio, ui }) { Object.assign(this, { career, play, audio, ui }); }

  start() {
    const c = this.career, d = c.d;
    const fx = c.nextFixture();
    const seed = d.seed + d.season * 1009 + d.week * 131;
    const r = rng(seed);
    this.r = r;
    this.fx = fx;
    const me = fx.special === 'intl' ? { name: d.nation, short: d.nation.replace(/\s/g, '').slice(0, 3).toUpperCase(), colors: ['#e4443a', '#ffffff'], str: 80 } : c.club;
    const opp = fx.opp;
    this.me = me;
    this.special = fx.special || null;
    this.label = fx.label || null;
    const ourStr = me.str + (fx.home ? 3 : 0), oppStr = opp.str + (fx.home ? 0 : 3);
    const [gu, gt] = simScore(ourStr, oppStr, r);
    const plan = c.matchPlan(seed + 1);
    this.plan = plan;
    const events = [];
    const mates = Math.max(0, Math.round(gu * 0.7));
    for (let i = 0; i < mates; i++) events.push({ min: 2 + Math.round(r() * 87), kind: 'us', who: randomName(r) });
    for (let i = 0; i < gt; i++) events.push({ min: 2 + Math.round(r() * 87), kind: 'them', who: randomName(r) });
    for (const mn of plan.minutes) {
      // more pressure on goal = more dangerous chance types late on
      const type = randomMomentType(r);
      events.push({ min: mn, kind: 'moment', type, seed: Math.floor(r() * 1e9) });
    }
    events.sort((a, b) => a.min - b.min);
    this.events = events;
    this.minute = 0;
    this.score = [0, 0];
    this.rating = 6.0;
    this.myGoals = 0; this.myAssists = 0;
    this.st = { chances: 0, onTarget: 0, passes: 0, keyPasses: 0 };
    this.shootout = null;
    this.feed = [];
    this.state = 'ticker';
    this.paused = false;
    const q = (s) => 0.78 + Math.max(0, Math.min(1, (s - 40) / 55)) * 0.47;
    this.oppQ = { keeper: q(oppStr), defence: q(oppStr) * 0.95 + 0.05 };
    this.home = fx.home;
    this._say(0, this.label ? `${this.label}. ${me.name} against ${opp.name}.` : plan.starts ? `Kick-off! ${d.name} starts up front for ${me.name}.` : `${d.name} starts on the bench. Impress when you get your chance.`);
    if (!plan.starts) this.events.push({ min: plan.subOn, kind: 'sub' }), this.events.sort((a, b) => a.min - b.min);
    this.audio.crowd(0.5);
    this.audio.play('whistle', { vol: 0.6 });
  }

  _say(min, text, kind = '') { this.feed.unshift({ min, text, kind }); this.feed = this.feed.slice(0, 5); this.ui.matchFeed?.(this); }

  get usIdx() { return this.home ? 0 : 1; }

  update(dt) {
    if (this.state !== 'ticker' || this.paused) return;
    const speed = 9;   // match minutes per second
    this.minute = Math.min(90, this.minute + dt * speed);
    while (this.events.length && this.events[0].min <= this.minute) {
      const e = this.events.shift();
      if (e.kind === 'us') { this.score[this.usIdx]++; this._say(e.min, `GOAL! ${e.who} scores for ${this.me.name}.`, 'good'); this.audio.play('roar', { vol: 0.7 }); this.rating += 0.1; }
      else if (e.kind === 'them') { this.score[1 - this.usIdx]++; this._say(e.min, `${this.fx.opp.name} score through ${e.who}.`, 'bad'); this.audio.play('ooh', { vol: 0.6 }); }
      else if (e.kind === 'sub') { this._say(e.min, `${this.career.d.name} comes off the bench!`); }
      else if (e.kind === 'moment') { this._moment(e); return; }
      this.ui.matchFeed?.(this);
    }
    this.ui.matchClock?.(this);
    if (this.minute >= 90 && !this.events.length) this._end();
  }

  _moment(e) {
    this.state = 'moment';
    this.current = e;
    this.minute = e.min;
    this.audio.crowd(0.85);
    this.ui.momentIntro(e.min, e.decider ? 'Decisive penalty' : MOMENT_LABEL[e.type], e.type, () => {
      this.play.start(e.type, e.seed, this.oppQ, this.ui.momentCtx());
      this.ui.momentStart?.();
      this.play.onResult = (res) => this._momentDone(res);
    });
  }

  _momentDone(res) {
    const k = res?.kind || 'lost';
    if (this.current.decider) return this._deciderDone(res);
    this.st.chances++;
    if (res?.shooter === 'you' && ['goal', 'saved', 'post'].includes(k)) this.st.onTarget++;
    if (res?.shooter === 'mate' && k !== 'goal') { this.st.keyPasses++; this.rating += 0.3; }
    let key = k;
    if (k === 'goal' && res.shooter === 'mate') key = 'assist';
    if (k === 'goal' && res.shooter === 'you') {
      this.myGoals++; this.score[this.usIdx]++;
      let bonus = 0;
      if (Math.abs(res.curl || 0) > 0.35) bonus += 0.2;
      this._say(this.minute | 0, this._goalLine(res), 'good');
      this.rating += RATING.goal + bonus;
    } else if (key === 'assist') {
      this.myAssists++; this.score[this.usIdx]++;
      this._say(this.minute | 0, `GOAL! Your pass is finished by a teammate. Assist for ${this.career.d.name}!`, 'good');
      this.rating += RATING.assist;
      this.career.d.rel.team = Math.min(100, this.career.d.rel.team + 3);
    } else {
      this.rating += RATING[k] ?? -0.2;
      this._say(this.minute | 0, { saved: 'Good effort, but the keeper saves.', post: 'So close! It comes back off the woodwork.', miss: 'The shot flies wide.', blocked: 'Blocked by a defender.', tackled: 'Too slow — dispossessed.', intercepted: 'The pass is cut out.', lost: 'The chance goes begging.' }[k] || 'Chance gone.');
    }
    this.rating = Math.max(3, Math.min(10, this.rating));
    this.audio.crowd(0.5);
    this.state = 'ticker';
    this.ui.momentEnd?.(this, res);
  }

  _goalLine(res) {
    const n = this.career.d.name;
    if (this.current.type === 'freekick') return `WHAT A FREE KICK! ${n} ${Math.abs(res.curl) > 0.35 ? 'bends it' : 'drills it'} past the wall!`;
    if (this.current.type === 'penalty') return `${n} converts from the spot. Cool as you like.`;
    if (res.z > 1.8) return `TOP CORNER! ${n} finds the angle!`;
    return `GOAL! ${n} finishes it!`;
  }

  // Passing stats come from moment events.
  onMomentEvent(type) {
    if (type === 'received') { this.st.passes++; this.rating += 0.12; }
  }

  _deciderDone(res) {
    this.shootout = res?.kind === 'goal';
    this._say(120, this.shootout ? `${this.career.d.name} scores the decisive penalty! ${this.me.name} go through!` : `${this.career.d.name} misses the decisive penalty...`, this.shootout ? 'good' : 'bad');
    this.rating += this.shootout ? 0.6 : -0.4;
    this.state = 'ticker';
    this.ui.momentEnd?.(this, res);
    this._end(true);
  }

  _end(afterShootout = false) {
    const us0 = this.score[this.usIdx], them0 = this.score[1 - this.usIdx];
    // cup draw: you take the decisive penalty
    if (!afterShootout && this.special === 'cup' && us0 === them0) {
      this._say(90, 'Level after extra time. It goes to penalties — and it comes down to you.');
      this._moment({ min: 120, kind: 'moment', type: 'penalty', seed: Math.floor(this.r() * 1e9), decider: true });
      return;
    }
    this.state = 'over';
    const us = this.score[this.usIdx], them = this.score[1 - this.usIdx];
    if (us > them) this.rating += 0.3; else if (us < them) this.rating -= 0.2;
    this.rating = Math.round(Math.max(3, Math.min(10, this.rating)) * 10) / 10;
    this.audio.play('whistle3', { vol: 0.7 });
    this.audio.crowd(0.25);
    const res = this.career.finishMatch({ ourGoals: us, theirGoals: them, myGoals: this.myGoals, myAssists: this.myAssists, rating: this.rating, shootout: this.shootout, stats: this.st });
    this.ui.matchOver(this, res);
  }
}
