// Per-device progress. localStorage can be unavailable (private mode): fail softly.
const KEY = 'gravity-v2';

export class Store {
  constructor() {
    this.d = { unlocked: 1, stars: {}, best: {}, attempts: {}, settings: { sound: true, haptics: true, assist: 'short' }, seenIntro: {} };
    try { const raw = localStorage.getItem(KEY); if (raw) this.d = { ...this.d, ...JSON.parse(raw), settings: { ...this.d.settings, ...JSON.parse(raw).settings } }; } catch (_) { /* ignore */ }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (_) { /* ignore */ } }
  stars(id) { return this.d.stars[id] || 0; }
  best(id) { return this.d.best[id] || 0; }
  totalStars() { return Object.values(this.d.stars).reduce((a, b) => a + b, 0); }
  complete(index, id, stars, score) {
    const prevStars = this.stars(id), prevBest = this.best(id);
    this.d.stars[id] = Math.max(prevStars, stars);
    this.d.best[id] = Math.max(prevBest, score);
    this.d.unlocked = Math.max(this.d.unlocked, index + 2);
    this.save();
    return { newBest: score > prevBest, moreStars: stars > prevStars, firstClear: prevBest === 0 };
  }
  reset() { const s = this.d.settings; this.d = { unlocked: 1, stars: {}, best: {}, attempts: {}, settings: s, seenIntro: {} }; this.save(); }
}
