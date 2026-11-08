// Level registry. To add a level: create a file next to this one and add it here.
import l01 from './01-first-touch.js';
import l02 from './02-through-the-defence.js';
import l03 from './03-the-perfect-cross.js';
import l04 from './04-one-chance.js';
import l05 from './05-last-minute.js';
import l06 from './06-curve-it.js';
import l07 from './07-the-counterattack.js';
import l08 from './08-the-big-match.js';
import l09 from './09-top-corner.js';
import l10 from './10-final-whistle.js';

export const LEVELS = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10].map((l, i) => ({ ...l, number: i + 1 }));

export function getLevel(i) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))];
}
