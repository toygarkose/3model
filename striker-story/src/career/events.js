// Small weekly story events with a choice. Each option changes your life stats.
// Effects keys: energy, happy, money (x wage if 'w' suffix), fans, coach, team, partner.
export const EVENTS = [
  {
    id: 'press', title: 'Press conference', text: 'A journalist asks if you would leave for a bigger club.',
    options: [
      { label: 'I am happy here', fx: { coach: 8, fans: 4 } },
      { label: 'Never say never', fx: { coach: -8, fans: 6 }, note: 'Bigger clubs take note' , offerBoost: true },
    ],
  },
  {
    id: 'charity', title: 'Hospital visit', text: 'The club asks you to visit the children\'s ward.',
    options: [
      { label: 'Of course', fx: { energy: -10, fans: 10, happy: 6 } },
      { label: 'I need to rest', fx: { energy: 8, fans: -3 } },
    ],
  },
  {
    id: 'nightout', title: 'Night out?', text: 'The squad are going out after training. Coach has asked for an early night.',
    options: [
      { label: 'Join them', fx: { team: 12, coach: -8, energy: -12, happy: 6 } },
      { label: 'Early night', fx: { coach: 6, team: -4, energy: 10 } },
    ],
  },
  {
    id: 'extra', title: 'Extra shooting practice', text: 'The assistant coach offers a late session.',
    options: [
      { label: 'Stay late', fx: { energy: -14, coach: 6, sp: 2 } },
      { label: 'Go home', fx: { energy: 6 } },
    ],
  },
  {
    id: 'interview', title: 'TV interview', text: 'A sports show wants you on air. They pay well.',
    options: [
      { label: 'Do it', fx: { moneyW: 0.6, fans: 8, energy: -8 } },
      { label: 'Stay focused', fx: { coach: 4 } },
    ],
  },
  {
    id: 'rival', title: 'Rival defender', text: 'Next week\'s centre-back called you "overrated" in the papers.',
    options: [
      { label: 'Respond on social media', fx: { fans: 10, coach: -5, happy: 4 } },
      { label: 'Let my football talk', fx: { coach: 5, happy: -2 } },
    ],
  },
  {
    id: 'family', title: 'Family birthday', text: 'It is your grandmother\'s 80th — the day before a match.',
    options: [
      { label: 'Travel home', fx: { happy: 14, energy: -12, partner: 8 } },
      { label: 'Send a gift', fx: { moneyW: -0.3, happy: -4 } },
    ],
  },
  {
    id: 'youth', title: 'Youth academy', text: 'Kids from the academy ask you for a free-kick masterclass.',
    options: [
      { label: 'Teach them', fx: { energy: -10, fans: 6, team: 4, sp: 1 } },
      { label: 'Not this week', fx: { fans: -2 } },
    ],
  },
];

export function rollEvent(d, r) {
  if (d.week < 2 || d.event || r() > 0.32) return null;
  const pool = EVENTS.filter(e => !(d.seenEvents || []).slice(-4).includes(e.id));
  const e = pool[(r() * pool.length) | 0];
  d.event = e.id;
  (d.seenEvents ||= []).push(e.id);
  return e;
}

export function applyEvent(d, optionIndex) {
  const e = EVENTS.find(x => x.id === d.event);
  if (!e) return null;
  const o = e.options[optionIndex];
  const cl = v => Math.max(0, Math.min(100, Math.round(v)));
  const f = o.fx;
  if (f.energy) d.energy = cl(d.energy + f.energy);
  if (f.happy) d.happy = cl(d.happy + f.happy);
  if (f.fans) d.fans = Math.max(0, d.fans + f.fans);
  if (f.coach) d.rel.coach = cl(d.rel.coach + f.coach);
  if (f.team) d.rel.team = cl(d.rel.team + f.team);
  if (f.partner && d.partner) d.partner.rel = cl(d.partner.rel + f.partner);
  if (f.moneyW) d.money = Math.max(0, d.money + Math.round(d.wage * f.moneyW));
  if (f.sp) d.sp += f.sp;
  if (o.offerBoost) d.offerBoost = 2;
  d.event = null;
  return o;
}

export function currentEvent(d) { return EVENTS.find(x => x.id === d.event) || null; }
