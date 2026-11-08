// Career: the life of one footballer. Weeks, energy, relationships, money,
// skills, the league table, contracts and transfers. Saved to localStorage.
import { LEAGUES, CLUBS, FIRST_NAMES, LAST_NAMES } from '../data/teams.js';
import { rng } from '../sim/moment.js';
import { rollEvent, applyEvent, currentEvent } from './events.js';
import { initLife, seasonSpecials, pendingSpecial, specialOpponent, resolveSpecial, weeklyLife, recordForm, seasonAwards, negotiate, signingBonus, intlCallup, acceptSponsor, declineSponsor } from './life.js';

const KEY = 'striker-story-v1';
export const SKILLS = {
  shooting: { name: 'Shooting', desc: 'Tighter aim cone — shots go where you point' },
  power: { name: 'Power', desc: 'Faster shots and longer passes' },
  curl: { name: 'Curl', desc: 'Stronger bend when you curve your swipe' },
  vision: { name: 'Vision', desc: 'Longer aim guide while you pull back' },
  composure: { name: 'Composure', desc: 'More time on the ball before defenders close in' },
};

export const SHOP = [
  { id: 'nrg', name: 'Energy Drink', desc: '+30 energy now', price: 60, kind: 'use' },
  { id: 'massage', name: 'Sports Massage', desc: '+55 energy, +5 happiness', price: 180, kind: 'use' },
  { id: 'boots-curl', name: 'Swerve Boots', desc: '+8 Curl while equipped', price: 900, kind: 'own', bonus: { curl: 8 } },
  { id: 'boots-aim', name: 'Precision Boots', desc: '+8 Shooting', price: 1400, kind: 'own', bonus: { shooting: 8 } },
  { id: 'agent', name: 'Hire an Agent', desc: 'More transfer offers, +25% wages, signing bonus (30 weeks)', price: 1500, kind: 'staff' },
  { id: 'trainer', name: 'Personal Trainer', desc: 'Training gives +50% skill points', price: 2500, kind: 'own' },
  { id: 'flat', name: 'City Apartment', desc: '+10 energy each week, +10 happiness', price: 3000, kind: 'own', home: 1 },
  { id: 'car', name: 'Sports Car', desc: '+15 fans, +10 happiness', price: 8000, kind: 'own' },
  { id: 'house', name: 'Family House', desc: '+20 energy each week, +20 happiness', price: 25000, kind: 'own', home: 2 },
  { id: 'villa', name: 'Seaside Villa', desc: '+30 energy each week, +30 happiness', price: 120000, kind: 'own', home: 3 },
];

export const ACTIVITIES = [
  { id: 'train', name: 'Training', desc: 'Shooting drill — hit the targets', energy: 22, game: true },
  { id: 'gym', name: 'Gym', desc: '+2 Power skill points', energy: 20, sp: { power: 2 } },
  { id: 'team', name: 'Team Night', desc: 'Crossbar challenge with the squad — bond grows with every hit', energy: 14, cost: 80, game: true },
  { id: 'sponsor', name: 'Sponsor Event', desc: 'Keep your sponsors happy (+25) and earn a fee', energy: 14, needs: 'sponsor' },
  { id: 'date', name: 'Date Night', desc: 'Time with your partner: +22 bond, +8 happiness', energy: 10, needs: 'partner' },
  { id: 'coach', name: 'Extra Session', desc: '+12 coach trust (more minutes)', energy: 18, rel: { coach: 12 } },
  { id: 'fans', name: 'Meet the Fans', desc: '+10 fans, small fee', energy: 12, rel: { fans: 10 }, earn: 60 },
  { id: 'rest', name: 'Rest Day', desc: '+28 energy, +6 happiness', energy: -28, happy: 6, once: true },
];


export class Career {
  constructor() {
    this.d = null;
    try { const raw = localStorage.getItem(KEY); if (raw) this.d = JSON.parse(raw); } catch (_) { /* ignore */ }
    if (this.d) { initLife(this.d); if (!this.d.cup) seasonSpecials(this.d, rng(this.d.seed)); }
  }
  get active() { return !!this.d; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (_) { /* ignore */ } }

  newCareer(name, number, nation) {
    const tier = 4;
    const clubIdx = 1; // Harbor Rovers: a small club that believes in you
    this.d = {
      name, number, age: 17, seed: (Math.random() * 1e9) | 0,
      skills: { shooting: 20, power: 22, curl: 18, vision: 15, composure: 20 },
      sp: 4, energy: 85, happy: 60, money: 250, fans: 5,
      rel: { coach: 45, team: 45, fans: 20 },
      tier, club: CLUBS[tier][clubIdx].name, wage: 150, contractWeeks: 28,
      owned: [], usedRest: false,
      season: 1, week: 0, table: null, fixtures: null,
      stats: { apps: 0, goals: 0, assists: 0, ratingSum: 0 },
      career: { apps: 0, goals: 0, assists: 0, seasons: [] },
      inbox: [{ t: 'Welcome to Harbor Rovers', b: `The coach is giving ${name} a chance in the County League. Score goals, earn trust, and the big clubs will come calling.` }],
      offers: [], lastMatch: null, totalStars: 0,
      leagues: JSON.parse(JSON.stringify(CLUBS)),   // rosters change with promotion
    };
    initLife(this.d, nation);
    this._newSeason();
    this.save();
  }

  // ------------------------------------------------------------ season & fixtures
  _newSeason() {
    const d = this.d;
    const teams = d.leagues[d.tier].map(c => ({ ...c }));
    const ci = teams.findIndex(t => t.name === d.club);
    d.table = teams.map(t => ({ name: t.name, short: t.short, colors: t.colors, str: t.str, p: 0, w: 0, dr: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    // double round robin (circle method), 14 rounds for 8 teams
    const n = teams.length, idx = [...Array(n).keys()];
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) pairs.push(r % 2 ? [idx[n - 1 - i], idx[i]] : [idx[i], idx[n - 1 - i]]);
      rounds.push(pairs);
      idx.splice(1, 0, idx.pop());
    }
    d.fixtures = [...rounds, ...rounds.map(r => r.map(([a, b]) => [b, a]))];
    d.week = 0;
    d.myIdx = ci;
    d.stats = { apps: 0, goals: 0, assists: 0, ratingSum: 0 };
    d.scorers = {};
    d.recent = [];
    seasonSpecials(d, rng(d.seed + d.season * 31));
    d.specialOpp = null;
  }

  get club() { return this.d.table[this.d.myIdx]; }
  get league() { return LEAGUES.find(l => l.tier === this.d.tier); }
  nextFixture() {
    const d = this.d;
    if (d.retired) return null;
    const sp = d.week < d.fixtures.length ? pendingSpecial(d) : (d.cup?.alive && d.cup.round === 2 && !d.cup.done.includes(2) ? { kind: 'cup', label: `${d.cup.name} · Final` } : null);
    if (sp) {
      if (!d.specialOpp || d.specialOpp.kind !== sp.kind || d.specialOpp.round !== d.cup.round) d.specialOpp = { kind: sp.kind, round: d.cup.round, opp: specialOpponent(d, sp.kind, rng(d.seed + d.week * 13 + d.season * 101 + d.cup.round)) };
      return { home: true, special: sp.kind, label: sp.label, opp: d.specialOpp.opp };
    }
    if (d.week >= d.fixtures.length) return null;
    const pair = d.fixtures[d.week].find(p => p.includes(d.myIdx));
    const home = pair[0] === d.myIdx;
    return { home, opp: d.table[home ? pair[1] : pair[0]], oppIdx: home ? pair[1] : pair[0] };
  }

  skill(k) {
    let v = this.d.skills[k];
    for (const id of this.d.owned) { const it = SHOP.find(s => s.id === id); if (it?.bonus?.[k]) v += it.bonus[k]; }
    return Math.min(100, v);
  }
  skills() { return Object.fromEntries(Object.keys(SKILLS).map(k => [k, this.skill(k)])); }
  rating() { const s = this.d.skills; return Math.round((s.shooting + s.power + s.curl + s.vision + s.composure) / 5); }
  fatigue() { return Math.max(0, (50 - this.d.energy) / 50); }

  upgrade(k) {
    if (this.d.sp <= 0 || this.d.skills[k] >= 100) return false;
    this.d.sp--; this.d.skills[k] = Math.min(100, this.d.skills[k] + 2);
    this.save(); return true;
  }

  // ------------------------------------------------------------ week activities
  canDo(a) {
    if (a.needs === 'sponsor' && !this.d.sponsors.length) return false;
    if (a.needs === 'partner' && !this.d.partner) return false;
    if (a.once && this.d.usedRest) return false;
    if (a.energy > 0 && this.d.energy < a.energy) return false;
    if (a.cost && this.d.money < a.cost) return false;
    return true;
  }

  doActivity(id) {
    const a = ACTIVITIES.find(x => x.id === id), d = this.d;
    if (!a || !this.canDo(a)) return null;
    d.energy = Math.max(0, Math.min(100, d.energy - a.energy));
    if (a.cost) d.money -= a.cost;
    if (a.earn) d.money += a.earn;
    if (a.happy) d.happy = Math.min(100, d.happy + a.happy);
    if (a.once) d.usedRest = true;
    for (const [k, v] of Object.entries(a.rel || {})) d.rel[k] = Math.min(100, d.rel[k] + v);
    let gained = 0;
    for (const [, v] of Object.entries(a.sp || {})) { d.sp += v; gained += v; }
    if (a.id === 'sponsor') { for (const sp of d.sponsors) sp.rel = Math.min(100, sp.rel + 25); d.money += Math.round(d.wage * 0.2); }
    if (a.id === 'date') { d.partner.rel = Math.min(100, d.partner.rel + 22); d.happy = Math.min(100, d.happy + 8); d.money -= Math.max(40, Math.round(d.wage * 0.15)); }
    this.save();
    return { gained };
  }

  teamNightReward(hits) {
    const gain = 6 + hits * 5;
    this.d.rel.team = Math.min(100, this.d.rel.team + gain);
    this.d.happy = Math.min(100, this.d.happy + 3);
    this.save();
    return gain;
  }

  trainingReward(hits) {
    const mult = this.d.owned.includes('trainer') ? 1.5 : 1;
    const sp = Math.round(hits * 0.8 * mult);
    this.d.sp += sp;
    this.d.rel.coach = Math.min(100, this.d.rel.coach + hits);
    this.save();
    return sp;
  }

  buy(id) {
    const it = SHOP.find(s => s.id === id), d = this.d;
    if (!it || d.money < it.price || (it.kind === 'own' && d.owned.includes(id))) return false;
    d.money -= it.price;
    if (it.kind === 'staff') { if (d.agent) { d.money += it.price; return false; } d.agent = { weeks: 30 }; this.save(); return true; }
    if (it.id === 'nrg') d.energy = Math.min(100, d.energy + 30);
    else if (it.id === 'massage') { d.energy = Math.min(100, d.energy + 55); d.happy = Math.min(100, d.happy + 5); }
    else {
      d.owned.push(id);
      if (it.id === 'car') { d.fans += 15; d.happy = Math.min(100, d.happy + 10); }
      if (it.home) d.happy = Math.min(100, d.happy + it.home * 10);
    }
    this.save(); return true;
  }

  // ------------------------------------------------------------ match
  // How many chances you get: coach trust (minutes) + teammates (they find you).
  matchPlan(seed) {
    const d = this.d, r = rng(seed);
    const starts = d.rel.coach >= 30 && d.energy >= 15;
    let n = starts ? 3 : 1;
    if (d.rel.team > 60) n++;
    if (d.rel.team > 85) n++;
    if (r() < 0.35) n++;
    const minutes = [];
    const from = starts ? 3 : 62;
    for (let i = 0; i < n; i++) minutes.push(Math.round(from + r() * (90 - from)));
    minutes.sort((a, b) => a - b);
    return { starts, minutes: [...new Set(minutes)], subOn: starts ? 0 : 60 };
  }

  // Simulate the rest of the round + record your match.
  // Injured: the week's match is played without you.
  skipMatch() {
    const d = this.d, fx = this.nextFixture();
    const r = rng(d.seed + d.week * 41 + d.season * 3);
    const [a, b] = simScore(this.club.str + (fx.home ? 3 : 0), fx.opp.str, r);
    return this.finishMatch({ ourGoals: a, theirGoals: b, myGoals: 0, myAssists: 0, rating: 6, played: false });
  }

  finishMatch({ ourGoals, theirGoals, myGoals, myAssists, rating, shootout = null, stats = null, played = true }) {
    const d = this.d, fx = this.nextFixture();
    const energyBefore = d.energy;
    if (fx.special) {
      const r0 = rng(d.seed + d.week * 7 + d.season * 77 + 5);
      const out = resolveSpecial(d, fx.special, { ourGoals, theirGoals, myGoals, rating, shootout }, r0);
      if (played) { d.career.apps++; d.career.goals += myGoals; d.career.assists += myAssists; }
      const spGain = played ? Math.max(1, Math.round((rating - 5) * 1.5)) + myGoals : 0;
      d.sp += spGain;
      const bonus = played ? Math.round(d.wage * (fx.special === 'intl' ? 0.8 : 0.5) + myGoals * d.wage * 0.4) : 0;
      d.money += bonus;
      d.energy = clamp(d.energy - 15);
      d.specialOpp = null;
      d.lastMatch = { opp: fx.opp.name, ourGoals, theirGoals, myGoals, myAssists, rating, special: fx.label, shootout: out.shootout, won: out.won, stats };
      d.inbox.unshift(...out.news); d.inbox = d.inbox.slice(0, 14);
      this.save();
      return { bonus, spGain, wage: 0, news: out.news, seasonOver: false, special: true };
    }
    const me = this.club, opp = fx.opp;
    const rec = (t, gf, ga) => { t.p++; t.gf += gf; t.ga += ga; if (gf > ga) { t.w++; t.pts += 3; } else if (gf === ga) { t.dr++; t.pts++; } else t.l++; };
    rec(me, ourGoals, theirGoals); rec(opp, theirGoals, ourGoals);
    const r = rng(d.seed + d.week * 97 + d.season * 7919);
    for (const [a, b] of d.fixtures[d.week]) {
      if (a === d.myIdx || b === d.myIdx) continue;
      const [ga, gb] = simScore(d.table[a].str + 4, d.table[b].str, r);
      rec(d.table[a], ga, gb); rec(d.table[b], gb, ga);
      for (const [ti, g] of [[a, ga], [b, gb]]) for (let k = 0; k < g; k++) if (r() < 0.4) { const key = d.table[ti].short + ' ' + LAST_NAMES[(r() * LAST_NAMES.length) | 0]; d.scorers[key] = (d.scorers[key] || 0) + 1; }
    }
    // money, relationships, energy, skill points
    const win = ourGoals > theirGoals, draw = ourGoals === theirGoals;
    const bonus = myGoals * Math.round(d.wage * 0.5) + (win ? Math.round(d.wage * 0.6) : 0);
    d.money += d.wage + (played ? bonus : 0);
    let spGain = 0;
    if (played) {
      d.stats.apps++; d.stats.goals += myGoals; d.stats.assists += myAssists; d.stats.ratingSum += rating;
      d.career.apps++; d.career.goals += myGoals; d.career.assists += myAssists;
      spGain = Math.max(1, Math.round((rating - 5) * 1.5)) + myGoals;
      d.sp += spGain;
      d.rel.coach = clamp(d.rel.coach + (rating - 6.3) * 6);
    }
    d.rel.fans = clamp(d.rel.fans + myGoals * 4 + (win ? 2 : draw ? 0 : -2));
    d.fans += myGoals * 3 + (rating >= 8 ? 4 : 0);
    d.happy = clamp(d.happy + (win ? 5 : draw ? 0 : -5) + myGoals * 3);
    d.energy = clamp(d.energy - (played ? 22 : 0));
    if (d.injury > 0) d.injury--;
    d.week++;
    d.contractWeeks--;
    // new week
    const homeBonus = Math.max(0, ...d.owned.map(id => (SHOP.find(s => s.id === id)?.home || 0) * 10));
    d.energy = clamp(d.energy + 22 + homeBonus + Math.round((d.happy - 50) / 10));
    d.usedRest = false;
    d.lastMatch = { opp: opp.name, ourGoals, theirGoals, myGoals, myAssists, rating, stats, played };
    const news = [];
    // playing exhausted risks injury
    if (played && energyBefore < 20 && r() < 0.35) {
      d.injury = 2 + Math.floor(r() * 2);
      news.push({ t: 'INJURED', b: `You played running on empty and pulled a hamstring. Out for ${d.injury} weeks. Manage your energy!` });
    }
    news.push(...weeklyLife(d, r), ...(played ? recordForm(d, rating, myGoals) : []));
    const call = intlCallup(d, this.avgRating());
    if (call) news.push(call);
    rollEvent(d, r);
    if (played && rating >= 8) { d.fans += 2; d.motm = (d.motm || 0) + 1; }
    if (myGoals >= 3) news.push({ t: 'HAT-TRICK HERO', b: `${d.name} scores three against ${opp.name}. The fans are chanting your name.` });
    this._maybeOffer(r, news);
    d.inbox.unshift(...news);
    d.inbox = d.inbox.slice(0, 12);
    this.save();
    return { bonus, spGain, wage: d.wage, news, seasonOver: d.week >= d.fixtures.length };
  }

  avgRating() { return this.d.stats.apps ? this.d.stats.ratingSum / this.d.stats.apps : 0; }
  position() { return [...this.d.table].sort(sortTable).findIndex(t => t.name === this.d.club) + 1; }
  sortedTable() { return [...this.d.table].sort(sortTable); }

  _maybeOffer(r, news) {
    const d = this.d;
    if (d.stats.apps < 4 || d.offers.length >= 2) return;
    const avg = this.avgRating();
    const up = d.tier > 1 && (avg >= 7.2 || (avg >= 6.8 && d.stats.goals >= d.stats.apps * 0.7));
    const boost = d.offerBoost > 0 ? 0.25 : 0;
    if (d.offerBoost > 0) d.offerBoost--;
    if (!up || r() > (d.agent ? 0.55 : 0.35) + boost) return;
    const tier = d.tier - 1;
    const pool = d.leagues[tier];
    const c = pool[(r() * pool.length) | 0];
    const L = LEAGUES.find(l => l.tier === tier);
    const wage = Math.round((L.wage[0] + (L.wage[1] - L.wage[0]) * Math.min(1, (avg - 6.5) / 2.5)) * (d.agent ? 1.25 : 1));
    if (d.offers.some(o => o.club === c.name)) return;
    d.offers.push({ club: c.name, tier, league: L.name, wage, colors: c.colors });
    news.push({ t: `OFFER FROM ${c.name.toUpperCase()}`, b: `${L.name} side ${c.name} want to sign you for $${wage.toLocaleString()} a week. Check your offers.` });
  }

  // Accept takes effect at the end of the season (keeps the table sane).
  acceptOffer(i) {
    const o = this.d.offers[i];
    if (!o) return;
    const bonus = signingBonus(this.d, o);
    if (bonus) { this.d.money += bonus; this.d.inbox.unshift({ t: 'Signing-on fee paid', b: `Your agent secured a $${bonus.toLocaleString('en-US')} signing bonus.` }); }
    this.d.pending = o;
    this.d.offers = [];
    this.d.inbox.unshift({ t: 'DEAL AGREED', b: `You join ${o.club} when the season ends.` });
    this.save();
  }
  declineOffer(i) { this.d.offers.splice(i, 1); this.save(); }
  negotiateOffer(i) {
    const o = this.d.offers[i];
    if (!o) return null;
    const res = negotiate(this.d, o, rng(this.d.seed + this.d.week * 3 + i + (this.d.season << 4)));
    if (res === 'walked') { this.d.offers.splice(i, 1); this.d.inbox.unshift({ t: `${o.club} walk away`, b: 'They would not meet your demands.' }); }
    this.save();
    return res;
  }
  acceptSponsor(i) { acceptSponsor(this.d, i); this.save(); }
  event() { return currentEvent(this.d); }
  answerEvent(i) { const o = applyEvent(this.d, i); this.save(); return o; }
  declineSponsor(i) { declineSponsor(this.d, i); this.save(); }
  legacy() {
    const d = this.d;
    return d.career.goals * 10 + d.career.assists * 5 + d.trophies.length * 150 + d.awards.length * 80 + d.intl.caps * 20 + d.career.seasons.length * 25;
  }

  endSeason() {
    const d = this.d;
    const pos = this.position();
    const topScorer = Math.max(0, ...Object.values(d.scorers));
    const goldenBoot = d.stats.goals > topScorer;
    const summary = { season: d.season, club: d.club, league: this.league.name, pos, apps: d.stats.apps, goals: d.stats.goals, assists: d.stats.assists, avg: +this.avgRating().toFixed(2), goldenBoot };
    if (pos === 1) d.trophies.push({ season: d.season, name: this.league.name + ' title' });
    summary.awards = seasonAwards(d, summary, topScorer);
    summary.trophies = d.trophies.filter(t => t.season === d.season).map(t => t.name);
    d.career.seasons.push(summary);
    let moved = null;
    if (d.pending) { moved = d.pending; d.club = moved.club; d.tier = moved.tier; d.wage = moved.wage; d.pending = null; d.rel.coach = 50; d.rel.team = 45; }
    else if (pos === 1 && d.tier > 1) {
      // champions: your club is promoted, the weakest club above drops down
      const low = d.leagues[d.tier], high = d.leagues[d.tier - 1];
      const mine = low.splice(low.findIndex(c => c.name === d.club), 1)[0];
      high.sort((a, b) => a.str - b.str);
      const relegated = high.shift();
      low.push({ ...relegated, str: Math.max(...low.map(c => c.str)) + 1 });
      high.push({ ...mine, str: Math.min(...high.map(c => c.str)) - 1 });
      d.tier--;
      moved = { club: d.club, promoted: true };
      d.wage = Math.round(d.wage * 2.2);
    }
    d.season++; d.age++;
    // ageing: the body slows after 30
    if (d.age > 30) { d.skills.power = Math.max(10, d.skills.power - 2); d.skills.composure = Math.min(100, d.skills.composure + 1); }
    if (d.age >= 36) d.retired = true;
    d.offers = [];
    d.contractWeeks = 28;
    if (goldenBoot) d.fans += 40;
    this._newSeason();
    this.save();
    return { summary, moved };
  }

  reset() { this.d = null; try { localStorage.removeItem(KEY); } catch (_) { /* */ } }
}

function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }
function sortTable(a, b) { return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf; }

// Poisson-ish score from strengths.
export function simScore(sa, sb, r) {
  const ea = 1.35 * Math.pow(10, (sa - sb) / 60), eb = 1.35 * Math.pow(10, (sb - sa) / 60);
  return [poisson(ea, r), poisson(eb, r)];
}
function poisson(l, r) { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 9); return k - 1; }

export function randomName(r) { return `${FIRST_NAMES[(r() * FIRST_NAMES.length) | 0]} ${LAST_NAMES[(r() * LAST_NAMES.length) | 0]}`; }
