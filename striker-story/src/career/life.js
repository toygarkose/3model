// Off-pitch life: sponsors, partner, agent, cup, international duty, awards.
// Operates on the career save object `d`. All names and brands are fictional.
import { SPONSORS, CUPS, NATIONS, PARTNER_NAMES, LEAGUES } from '../data/teams.js';

export function initLife(d, nation) {
  d.nation = nation || d.nation || 'Türkiye';
  d.sponsors = d.sponsors || [];
  d.sponsorOffers = d.sponsorOffers || [];
  d.partner = d.partner ?? null;
  d.agent = d.agent ?? null;
  d.intl = d.intl || { caps: 0, goals: 0, called: false, played: [] };
  d.awards = d.awards || [];
  d.trophies = d.trophies || [];
  d.recent = d.recent || [];
}

// ------------------------------------------------------------------ cup & internationals
export function seasonSpecials(d, r) {
  d.cup = { name: CUPS[d.tier], rounds: ['Quarter-final', 'Semi-final', 'Final'], at: [3, 8, 13], round: 0, alive: true, done: [] };
  d.intlWeek = d.intl.called ? 5 + Math.floor(r() * 5) : null;
}

// A cup tie or international to play before this week's league match.
export function pendingSpecial(d) {
  const c = d.cup;
  if (c && c.alive && c.round < 3 && d.week >= c.at[c.round] && !c.done.includes(c.round)) return { kind: 'cup', label: `${c.name} · ${c.rounds[c.round]}` };
  if (d.intlWeek != null && d.week >= d.intlWeek && !d.intl.played.includes(d.season)) return { kind: 'intl', label: `${d.nation} · International` };
  return null;
}

export function specialOpponent(d, kind, r) {
  if (kind === 'intl') {
    const pool = NATIONS.filter(n => n !== d.nation);
    const name = pool[(r() * pool.length) | 0];
    return { name, short: name.replace(/\s/g, '').slice(0, 3).toUpperCase(), colors: ['#f4f4f4', '#c0242b'], str: 74 + r() * 16 };
  }
  // cup: an opponent from your tier or the one above
  const tier = Math.max(1, d.tier - (r() < 0.4 ? 1 : 0));
  const pool = d.leagues[tier].filter(c => c.name !== d.club);
  const c = pool[(r() * pool.length) | 0];
  return { ...c, str: c.str + d.cup.round * 2 };
}

export function resolveSpecial(d, kind, res, r) {
  const news = [];
  if (kind === 'intl') {
    d.intl.played.push(d.season);
    d.intl.caps++; d.intl.goals += res.myGoals;
    d.fans += 10 + res.myGoals * 8;
    news.push({ t: `${d.nation} ${res.ourGoals}-${res.theirGoals}`, b: res.myGoals ? `${d.name} scores on international duty. A nation celebrates.` : `${d.name} earns international cap number ${d.intl.caps}.` });
    return { news };
  }
  const c = d.cup;
  c.done.push(c.round);
  let won = res.ourGoals > res.theirGoals;
  let shootout = false;
  if (res.ourGoals === res.theirGoals) { shootout = true; won = res.shootout != null ? !!res.shootout : r() < 0.45 + (res.rating - 6) * 0.08; }
  const rn = c.rounds[c.round];
  if (won) {
    if (c.round === 2) {
      c.alive = false;
      d.trophies.push({ season: d.season, name: c.name });
      d.money += Math.round(d.wage * 4);
      d.fans += 30;
      news.push({ t: `${c.name.toUpperCase()} WINNERS!`, b: `${d.club} lift the ${c.name}${shootout ? ' after a penalty shootout' : ''}. ${d.name} has a winner's medal.` });
    } else news.push({ t: `Through to the ${c.rounds[c.round + 1]}`, b: `${d.club} win the ${rn}${shootout ? ' on penalties' : ''}.` });
    c.round++;
  } else {
    c.alive = false;
    news.push({ t: `Out of the ${c.name}`, b: `${d.club} go out in the ${rn}${shootout ? ' on penalties' : ''}.` });
  }
  return { news, won, shootout };
}

// ------------------------------------------------------------------ weekly life tick
export function weeklyLife(d, r) {
  const news = [];
  // sponsors pay every week; neglect them and they walk away (below 33%)
  for (const s of d.sponsors) { d.money += s.weekly; s.rel = Math.max(0, s.rel - 4); }
  for (const s of d.sponsors.filter(x => x.rel < 33)) news.push({ t: `${s.name} end your deal`, b: 'You missed too many sponsor events. Keep sponsors happy to keep the money coming.' });
  d.sponsors = d.sponsors.filter(s => s.rel >= 33);
  // new sponsor offers as you become famous
  const want = Math.min(3, Math.floor(d.fans / 40));
  if (d.sponsors.length + d.sponsorOffers.length < want && r() < 0.4) {
    const pool = SPONSORS.filter(s => !d.sponsors.some(x => x.name === s.name) && !d.sponsorOffers.some(x => x.name === s.name));
    if (pool.length) {
      const s = pool[(r() * pool.length) | 0];
      const weekly = Math.max(20, Math.round(d.wage * s.base * (1 + d.fans / 200)));
      d.sponsorOffers.push({ name: s.name, weekly });
      news.push({ t: `Sponsor offer: ${s.name}`, b: `$${weekly.toLocaleString('en-US')} a week to wear their name. Accept it in the Life tab.` });
    }
  }
  // partner
  if (d.partner) {
    d.partner.rel = Math.max(0, d.partner.rel - 3);
    if (d.partner.rel < 15) { news.push({ t: 'Heartbreak', b: `${d.partner.name} feels you only care about football. You split up.` }); d.partner = null; d.happy = Math.max(0, d.happy - 15); }
  } else if (d.fans > 20 && r() < 0.08) {
    const name = PARTNER_NAMES[(r() * PARTNER_NAMES.length) | 0];
    d.partner = { name, rel: 45 };
    news.push({ t: `You met ${name}`, b: 'Someone special. Date nights keep you both happy, and happiness speeds up your recovery.' });
  }
  if (d.partner && d.partner.rel > 60) d.happy = Math.min(100, d.happy + 2);
  // agent contract runs out
  if (d.agent) { d.agent.weeks--; if (d.agent.weeks <= 0) { d.agent = null; news.push({ t: 'Agent contract ended', b: 'Hire an agent again in the Shop for better offers.' }); } }
  return news;
}

export function acceptSponsor(d, i) { const o = d.sponsorOffers[i]; if (!o) return; d.sponsors.push({ ...o, rel: 60 }); d.sponsorOffers.splice(i, 1); }
export function declineSponsor(d, i) { d.sponsorOffers.splice(i, 1); }

// ------------------------------------------------------------------ awards
export function recordForm(d, rating, goals) {
  d.recent.push({ rating, goals });
  const news = [];
  if (d.recent.length >= 4) {
    const last = d.recent.slice(-4);
    const avg = last.reduce((a, b) => a + b.rating, 0) / 4, g = last.reduce((a, b) => a + b.goals, 0);
    if (avg >= 7.6 && g >= 3) {
      d.awards.push({ season: d.season, name: 'Player of the Month' });
      d.money += Math.round(d.wage * 1.5); d.fans += 12;
      news.push({ t: 'PLAYER OF THE MONTH', b: `${g} goals and an average rating of ${avg.toFixed(1)} over four games. Bonus paid.` });
    }
    d.recent = [];
  }
  return news;
}

export function seasonAwards(d, summary, topRivalGoals) {
  const out = [];
  if (summary.goals > topRivalGoals) out.push('Golden Boot');
  if (summary.avg >= 7.5 && summary.goals >= 8) out.push('Player of the Year');
  for (const a of out) d.awards.push({ season: d.season, name: a });
  return out;
}

// ------------------------------------------------------------------ contracts
// Ask for more money: an agent makes the club more likely to agree.
export function negotiate(d, offer, r) {
  if (offer.negotiated) return 'final';
  offer.negotiated = true;
  if (r() < (d.agent ? 0.75 : 0.5)) { offer.wage = Math.round(offer.wage * 1.2); return 'agreed'; }
  return 'walked';
}

export function signingBonus(d, offer) { return d.agent ? offer.wage * 2 : 0; }

export function intlCallup(d, avg) {
  if (d.intl.called || d.stats.apps < 5) return null;
  if ((d.tier <= 2 && avg >= 7.2) || (d.tier === 1 && avg >= 6.8) || (d.tier === 3 && avg >= 7.8 && d.fans > 60)) {
    d.intl.called = true;
    const L = LEAGUES.find(l => l.tier === d.tier);
    return { t: `Called up by ${d.nation}!`, b: `Your form in the ${L.name} has earned a call-up to the national team.` };
  }
  return null;
}
