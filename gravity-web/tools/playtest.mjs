// Browser end-to-end test: launches every level's verified 3-star solution
// through the real game loop and checks for a 3-star win and console errors.
// Usage: npm run build && npm run preview &   then   npm test
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const URL = process.env.URL || 'http://localhost:4174/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.__G);
const n = await page.evaluate(() => window.__G.levels.length);
await page.evaluate(() => { window.__G.timeWarp = 6; });
let fails = 0;
for (let i = 0; i < n; i++) {
  await page.evaluate(i => { const G = window.__G; G.store.d.seenIntro[G.levels[i].id] = true; G.ui.startLevel(i); const s = G.levels[i].solution; G.game.testLaunchAngle(s.a, s.p); }, i);
  try {
    await page.waitForFunction(() => ['won', 'dead', 'aim'].includes(window.__G.game.state) && window.__G.game.attempts > 0 && window.__G.game.state !== 'aim', null, { timeout: 90000 });
  } catch (e) { console.log(`#${i + 1} timeout in state`, await page.evaluate(() => window.__G.game.state)); fails++; continue; }
  const r = await page.evaluate(() => ({ state: window.__G.game.state, stars: window.__G.game.flight?.got, id: window.__G.game.level.id, name: window.__G.game.level.name }));
  const ok = r.state === 'won' && r.stars === 7;
  if (!ok) fails++;
  console.log(`#${String(i + 1).padStart(2)} ${r.id} ${r.name.padEnd(20)} ${ok ? 'WON ★★★' : 'FAILED ' + JSON.stringify(r)}`);
}
if (errors.length) { console.log('Console errors:\n' + [...new Set(errors)].join('\n')); fails++; }
await browser.close();
console.log(fails ? `\n${fails} problem(s)` : '\nALL LEVELS WON WITH 3 STARS IN THE BROWSER');
process.exit(fails ? 1 : 0);
