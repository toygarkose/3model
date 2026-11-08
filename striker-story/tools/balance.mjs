// Balance check (real simulation). For each chance we find the best aim a
// skilled human could choose, then measure how often it scores when the
// player's aim error (from the Shooting skill) is applied randomly.
import { createMoment, launchShot, stepFlight, mateDecision, rng } from '../src/sim/moment.js';

function run(type, seed, aim, skills, noiseSeed) {
  const m = createMoment(type, seed, { keeper: 1, defence: 1 });
  launchShot(m, aim, skills, 0, rng(noiseSeed));
  let g = 0;
  while (m.phase !== 'done' && g++ < 2000) {
    if (m.phase === 'mate') mateDecision(m, 50);
    if (m.phase === 'aim') return 'onetwo';
    stepFlight(m, 1 / 60);
  }
  return m.result?.kind || 'none';
}

const SK = s => ({ shooting: s, power: s, curl: s, composure: s });
const N = +(process.argv[2] || 30);
for (const type of ['penalty', 'oneonone', 'open', 'freekick']) {
  const line = [];
  for (const lvl of [20, 50, 85]) {
    const skills = SK(lvl);
    let sum = 0;
    for (let s = 1; s <= N; s++) {
      const m0 = createMoment(type, s);
      let best = 0;
      for (const tx of [-6, -4.5, -3.3, -2.6, 2.6, 3.3, 4.5, 6]) for (const curl of [-1, -0.5, 0, 0.5, 1]) for (const power of [0.75, 0.9, 1]) for (const lob of type === 'freekick' ? [false, true] : [false]) {
        const aim = { dx: tx - m0.ball.x, dy: -m0.ball.y, power: lob ? power * 0.65 : power, curl, lob };
        // quick filter with no error, then measure with error
        if (run(type, s, aim, { ...skills, shooting: 100 }, 1) !== 'goal') continue;
        let g = 0;
        for (let k = 0; k < 24; k++) if (run(type, s, aim, skills, 100 + k) === 'goal') g++;
        best = Math.max(best, g / 24);
      }
      sum += best;
    }
    line.push(`skill ${lvl}: ${(100 * sum / N).toFixed(0)}%`);
  }
  console.log(`${type.padEnd(9)} best-aim scoring chance  ${line.join('   ')}`);
}
