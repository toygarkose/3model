import { LEVELS } from '../levels/index.js';
import { COSMETICS, findItem } from './cosmetics.js';
import { STYLE } from '../game/config.js';

const KEY = 'last-touch-career-v1';

export const ACHIEVEMENTS = [
  { id: 'first-goal', name: 'First Goal', desc: 'Score your first goal', coins: 50 },
  { id: 'header', name: 'Head Master', desc: 'Score with a header', coins: 50 },
  { id: 'curler', name: 'Bend It', desc: 'Score a curled shot', coins: 75 },
  { id: 'top-bins', name: 'Top Bins', desc: 'Score in the top corner', coins: 75 },
  { id: 'perfectionist', name: 'Perfectionist', desc: 'Earn 3 stars on three levels', coins: 100 },
  { id: 'chapter1', name: 'Signed!', desc: 'Complete Chapter 1', coins: 60 },
  { id: 'chapter2', name: 'Captain Material', desc: 'Complete Chapter 2', coins: 80 },
  { id: 'champion', name: 'Champion', desc: 'Win the Coastal Cup', coins: 150 },
];

function fresh() {
  return {
    started: false, name: 'Rookie', number: 17, skin: 1, hairColor: 0,
    coins: 0, points: 0, goals: 0,
    stars: LEVELS.map(() => 0), unlocked: 1, seenStory: {},
    owned: { hair: ['short', 'buzz'], boots: ['black'], kit: ['home'], accessory: ['none'] },
    equipped: { hair: 'short', boots: 'black', kit: 'home', accessory: 'none' },
    achievements: [],
    settings: { sound: true, quality: 'auto', guide: true },
  };
}

export class Career {
  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...fresh(), ...JSON.parse(raw) };
    } catch (_) { /* private mode: play without saving */ }
    // keep arrays the right length if levels were added
    while (this.data.stars.length < LEVELS.length) this.data.stars.push(0);
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (_) {} }

  get name() { return this.data.name; }
  get number() { return this.data.number; }
  get started() { return this.data.started; }

  newCareer({ name, number, skin, hairColor }) {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    Object.assign(this.data, { started: true, name: name || 'Rookie', number: number || 17, skin: skin ?? 1, hairColor: hairColor ?? 0 });
    this.save();
  }

  rating() { return Math.min(94, 58 + Math.floor(this.data.points / 18)); }
  totalStars() { return this.data.stars.reduce((a, b) => a + b, 0); }
  isUnlocked(i) { return i < this.data.unlocked; }
  nextLevelIndex() {
    const i = this.data.stars.findIndex((s, k) => s === 0 && k < this.data.unlocked);
    return i >= 0 ? i : Math.min(this.data.unlocked, LEVELS.length) - 1;
  }

  /** Record a completed level; returns rewards + newly unlocked achievements. */
  complete(levelIndex, stars, match) {
    const d = this.data;
    const firstClear = d.stars[levelIndex] === 0;
    const improved = Math.max(0, stars - d.stars[levelIndex]);
    d.stars[levelIndex] = Math.max(d.stars[levelIndex], stars);
    d.unlocked = Math.min(LEVELS.length, Math.max(d.unlocked, levelIndex + 2));
    const coins = stars * 10 + improved * 15 + (firstClear ? 25 : 0);
    const points = improved * 10 + (firstClear ? 10 : 0);
    d.coins += coins; d.points += points;
    const unlocked = [];
    const g = match.stats.goal;
    if (g) {
      d.goals++;
      this._ach('first-goal', unlocked);
      if (g.header) this._ach('header', unlocked);
      if (Math.abs(g.curve || 0) >= STYLE.curveMin) this._ach('curler', unlocked);
      if (g.y > 1.6 && Math.abs(g.x) > 2.2) this._ach('top-bins', unlocked);
    }
    if (d.stars.filter(s => s === 3).length >= 3) this._ach('perfectionist', unlocked);
    if ([0, 1, 2].every(i => d.stars[i] > 0)) this._ach('chapter1', unlocked);
    if ([3, 4, 5, 6].every(i => d.stars[i] > 0)) this._ach('chapter2', unlocked);
    if (d.stars[9] > 0) this._ach('champion', unlocked);
    for (const a of unlocked) d.coins += a.coins;
    this.save();
    return { coins, points, firstClear, achievements: unlocked };
  }

  _ach(id, list) {
    if (this.data.achievements.includes(id)) return;
    this.data.achievements.push(id);
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a) list.push(a);
    // achievement items
    for (const slot of Object.keys(COSMETICS)) for (const item of COSMETICS[slot]) {
      if (item.unlock === id && !this.data.owned[slot].includes(item.id)) this.data.owned[slot].push(item.id);
    }
  }

  owns(slot, id) { return this.data.owned[slot].includes(id); }

  buy(slot, id) {
    const item = findItem(slot, id);
    if (this.owns(slot, id) || item.unlock || this.data.coins < item.price) return false;
    this.data.coins -= item.price;
    this.data.owned[slot].push(id);
    this.save();
    return true;
  }

  equip(slot, id) {
    if (!this.owns(slot, id)) return false;
    this.data.equipped[slot] = id;
    this.save();
    return true;
  }

  resetAll() { const s = this.data.settings; this.data = fresh(); this.data.settings = s; this.save(); }
}
