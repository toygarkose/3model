// End-to-end browser test: plays every level in a real (headless) browser
// through the real game loop, checks for console errors, takes screenshots,
// and tests real mouse-drag input on level 1.
// Usage: npm run build && npx vite preview --port 4173 &  then  npm test
import { createRequire } from 'node:module';
import { LEVELS } from '../src/levels/index.js';
import { solve } from './solver.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = process.env.SHOTS || 'test-shots';
const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = [{ name: 'desktop', width: 1280, height: 720 }];
let failures = 0;
for (const vp of sizes) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__LT);
  await page.evaluate(() => window.__LT.career.newCareer({ name: 'Tester', number: 10 }));
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
  console.log(`${vp.name}: ${fps} fps in headless software rendering`);
  await page.evaluate(w => { window.__LT.engine.timeWarp = w; }, Math.min(8, Math.max(1, 30 / Math.max(fps, 1))));
  const waitState = async (states, ms = 60000) => page.waitForFunction(s => s.includes(window.__LT.api.state()), states, { timeout: ms });

  for (const level of LEVELS) {
    const i = level.number - 1;
    const sol = solve(level);
    if (!sol.actions) { console.log(`L${level.number}: no solution found by solver`); failures++; continue; }
    await page.evaluate(i => { window.__LT.ui.showIntro(i); window.__LT.ui.play(); }, i);
    await waitState(['decision']);
    for (const a of sol.actions) {
      await waitState(['decision']);
      await page.evaluate(a => window.__LT.api.play(a), a);
      await waitState(['decision', 'finished', 'outcome']);
    }
    await waitState(['finished']);
    const res = await page.evaluate(() => window.__LT.api.result());
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${OUT}/${vp.name}-L${String(level.number).padStart(2, '0')}-result.png` });
    const ok = res?.success;
    if (!ok) failures++;
    console.log(`L${level.number} ${level.title}: ${ok ? 'WON' : 'FAILED ' + JSON.stringify(res)} (solver stars ${sol.stars}, ${sol.actions.length} moves)`);
  }

  // real mouse gesture: drag from the ball to Dario on level 1
  await page.evaluate(() => { window.__LT.engine.timeWarp = 1; });
  await page.evaluate(() => { window.__LT.ui.showIntro(0); window.__LT.ui.play(); });
  await waitState(['decision']);
  await page.waitForTimeout(2500);
  const pts = await page.evaluate(() => window.__LT.api.gestureFor({ kind: 'pass', x: -10, z: -26, curve: 0 }));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.screenshot({ path: `${OUT}/${vp.name}-gesture-aiming.png` });
  await page.mouse.up();
  await waitState(['finished', 'outcome', 'action', 'decision'], 10000);
  await waitState(['finished'], 20000).catch(() => {});
  const g = await page.evaluate(() => window.__LT.api.result());
  console.log(`Mouse gesture pass on L1: ${g?.success ? 'WON' : 'FAILED ' + JSON.stringify(g)}`);
  if (!g?.success) failures++;
  if (errors.length) { console.log('Console errors:\n' + errors.join('\n')); failures++; }
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} problem(s)` : '\nALL GOOD');
process.exit(failures ? 1 : 0);
