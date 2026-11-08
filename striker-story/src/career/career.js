// Career: the life of one footballer. Weeks, energy, relationships, money,
// skills, the league table, contracts and transfers. Saved to localStorage.
import { LEAGUES, CLUBS, FIRST_NAMES, LAST_NAMES } from '../data/teams.js';
import { rng } from '../sim/moment.js';

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
  { id: 'trainer', name: 'Personal Trainer', desc: 'Training gives +50% skill points', price: 2500, kind: 'own' },
  { id: 'flat', name: 'City Apartment', desc: '+10 energy each week, +10 happiness', price: 3000, kind: 'own', home: 1 },
  { id: 'car', name: 'Sports Car', desc: '+15 fans, +10 happiness', price: 8000, kind: 'own' },
  { id: 'house', name: 'Family House', desc: '+20 energy each week, +20 happiness', price: 25000, kind: 'own', home: 2 },
  { id: 'villa', name: 'Seaside Villa', desc: '+30 energy each week, +30 happiness', price: 120000, kind: 'own', home: 3 },
];

export const ACTIVITIES = [
  { id: 'train', name: 'Training', desc: 'Shooting drill — hit the targets', energy: 22, game: true },
  { id: 'gym', name: 'Gym', desc: '+2 Power skill points', energy: 20, sp: { power: 2 } },
  { id: 'team', name: 'Team Night', desc: '+12 teammate bond (they pass to you more)', energy: 14, cost: 80, rel: { team: 12 } },
  { id: 'coach', name: 'Extra Session', desc: '+12 coach trust (more minutes)', energy: 18, rel: { coach: 12 } },
  { id: 'fans', name: 'Meet the Fans', desc: '+10 fans, small fee', energy: 12, rel: { fans: 10 }, earn: 60 },
  { id: 'rest', name: 'Rest Day', desc: '+28 energy, +6 happiness', energy: -28, happy: 6, once: true },
];


export class Career {
  constructor() {
    this.d = null;
    try { const raw = localStorage.getItem(KEY); if (raw) this.d = JSON.parse(raw); } catch (_) { /* ignore */ }
  }
  get active() { return !!this.d; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (_) { /* ignore */ } }

  newCareer(name, number) {
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
  }

  get club() { return this.d.table[this.d.myIdx]; }
  get league() { return LEAGUES.find(l => l.tier === this.d.tier); }
  nextFixture() {
    const d = this.d;
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
    this.save();
    return { gained };
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
  finishMatch({ ourGoals, theirGoals, myGoals, myAssists, rating }) {
    const d = this.d, fx = this.nextFixture();
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
    d.money += d.wage + bonus;
    d.stats.apps++; d.stats.goals += myGoals; d.stats.assists += myAssists; d.stats.ratingSum += rating;
    d.career.apps++; d.career.goals += myGoals; d.career.assists += myAssists;
    const spGain = Math.max(1, Math.round((rating - 5) * 1.5)) + myGoals;
    d.sp += spGain;
    d.rel.coach = clamp(d.rel.coach + (rating - 6.3) * 6);
    d.rel.fans = clamp(d.rel.fans + myGoals * 4 + (win ? 2 : draw ? 0 : -2));
    d.fans += myGoals * 3 + (rating >= 8 ? 4 : 0);
    d.happy = clamp(d.happy + (win ? 5 : draw ? 0 : -5) + myGoals * 3);
    d.energy = clamp(d.energy - 22);
    d.week++;
    d.contractWeeks--;
    // new week
    const homeBonus = Math.max(0, ...d.owned.map(id => (SHOP.find(s => s.id === id)?.home || 0) * 10));
    d.energy = clamp(d.energy + 22 + homeBonus + Math.round((d.happy - 50) / 10));
    d.usedRest = false;
    d.lastMatch = { opp: opp.name, ourGoals, theirGoals, myGoals, myAssists, rating };
    const news = [];
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
    if (!up || r() > 0.35) return;
    const tier = d.tier - 1;
    const pool = d.leagues[tier];
    const c = pool[(r() * pool.length) | 0];
    const L = LEAGUES.find(l => l.tier === tier);
    const wage = Math.round(L.wage[0] + (L.wage[1] - L.wage[0]) * Math.min(1, (avg - 6.5) / 2.5));
    if (d.offers.some(o => o.club === c.name)) return;
    d.offers.push({ club: c.name, tier, league: L.name, wage, colors: c.colors });
    news.push({ t: `OFFER FROM ${c.name.toUpperCase()}`, b: `${L.name} side ${c.name} want to sign you for $${wage.toLocaleString()} a week. Check your offers.` });
  }

  // Accept takes effect at the end of the season (keeps the table sane).
  acceptOffer(i) {
    const o = this.d.offers[i];
    if (!o) return;
    this.d.pending = o;
    this.d.offers = [];
    this.d.inbox.unshift({ t: 'DEAL AGREED', b: `You join ${o.club} when the season ends.` });
    this.save();
  }
  declineOffer(i) { this.d.offers.splice(i, 1); this.save(); }

  endSeason() {
    const d = this.d;
    const pos = this.position();
    const topScorer = Math.max(0, ...Object.values(d.scorers));
    const goldenBoot = d.stats.goals > topScorer;
    const summary = { season: d.season, club: d.club, league: this.league.name, pos, apps: d.stats.apps, goals: d.stats.goals, assists: d.stats.assists, avg: +this.avgRating().toFixed(2), goldenBoot };
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
