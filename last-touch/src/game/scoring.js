import { STYLE } from './config.js';

// Stars: 1 objective, 2 efficiency (moves <= par), 3 style (level-specific).
export function computeStars(level, match) {
  const s = match.stats;
  const reasons = [];
  if (!match.result?.success) return { stars: 0, reasons };
  reasons.push({ label: 'Objective complete', ok: true });
  const par = level.par ?? s.actions;
  const efficient = s.actions <= par;
  reasons.push({ label: `Done in ${par} move${par === 1 ? '' : 's'}`, ok: efficient });
  const styleKind = level.style || (level.objective.type === 'goal' ? 'corner' : 'perfect');
  const g = s.goal;
  let styleOk = false, label = '';
  switch (styleKind) {
    case 'corner': label = 'Corner finish'; styleOk = !!g && (Math.abs(g.x) > STYLE.cornerX || g.y > STYLE.cornerY); break;
    case 'curve': label = 'Bend it in'; styleOk = !!g && Math.abs(g.curve || 0) >= STYLE.curveMin; break;
    case 'header': label = 'Header goal'; styleOk = !!g && !!g.header; break;
    case 'perfect': label = 'Perfectly weighted passes'; styleOk = s.imperfect === 0 && s.passes > 0; break;
    case 'power': label = 'Thunderbolt'; styleOk = !!g && (g.power || 0) > 0.8; break;
    default: label = 'Style'; styleOk = true;
  }
  reasons.push({ label, ok: styleOk });
  const stars = 1 + (efficient ? 1 : 0) + (styleOk ? 1 : 0);
  return { stars, reasons };
}

export function rewardsFor(stars, firstClear) {
  return { coins: stars * 15 + (firstClear ? 25 : 0), points: stars * 10 };
}
