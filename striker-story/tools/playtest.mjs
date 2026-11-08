// Browser end-to-end test: new career, training, shop, skills, a full season
// of matches (every moment played), season end. Checks console errors.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const URL = process.env.URL || 'http://localhost:4175/';
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.__S);
const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${n}.png` }); } };
await shot('01-title');
await page.tap('[data-a=new]');
await page.tap('form button[type=submit]');
await page.waitForTimeout(400);
await shot('02-hub');
// training through the real button
await page.evaluate(() => { window.__S.timeWarp = 3; });
await page.tap('[data-act=train]');
for (let i = 0; i < 5; i++) {
  await page.waitForFunction(() => window.__S.play.m?.phase === 'aim', null, { timeout: 30000 });
  if (i === 0) { await page.waitForTimeout(300); await shot('03-training'); }
  await page.evaluate(i => window.__S.play.testShoot([-2.8, 2.8, -2.9, 2.9, 0][i], 0, 0.82, 0), i);
  await page.waitForFunction(() => !window.__S.play.m || window.__S.play.m.phase !== 'flight', null, { timeout: 30000 });
}
await page.waitForFunction(() => window.__S.app.mode === 'hub', null, { timeout: 30000 });
await page.waitForTimeout(300);
await shot('04-training-done');
await page.tap('[data-a=go]');
// spend skill points & buy something
await page.evaluate(() => { const c = window.__S.career; for (let i = 0; i < 3; i++) c.upgrade('shooting'); c.buy('nrg'); });
const stats = { goals: 0, matches: 0, outcomes: {} };
for (let wk = 0; wk < 14; wk++) {
  await page.evaluate(() => window.__S.ui.showHub('week'));
  await page.tap('[data-a=play]');
  await page.evaluate(() => { window.__S.timeWarp = 2; });
  for (;;) {
    const st = await page.waitForFunction(() => { const S = window.__S; if (S.app.flow?.state === 'over') return 'over'; if (S.play.m?.phase === 'aim') return 'aim'; return false; }, null, { timeout: 120000 }).then(h => h.jsonValue());
    if (st === 'over') break;
    if (wk === 0 && !stats.shotMoment) { stats.shotMoment = true; await page.waitForTimeout(400); await shot('05-moment'); }
    // a sensible shot: far corner with a little curl
    await page.evaluate(() => { const m = window.__S.play.m; if (!m || m.phase !== 'aim') return; const tx = m.ball.x > 0 ? -2.9 : 2.9; window.__S.play.testShoot(tx, 0, 0.9, 0); });
    await page.waitForFunction(() => !window.__S.play.m || window.__S.play.m.phase !== 'aim', null, { timeout: 30000 });
    const r = await page.waitForFunction(() => window.__S.play.m?.result || window.__S.app.flow?.state === 'over' || (!window.__S.play.m && 'gone'), null, { timeout: 60000 }).then(h => h.jsonValue());
    const k = typeof r === 'object' ? r.kind : String(r);
    stats.outcomes[k] = (stats.outcomes[k] || 0) + 1;
    if (wk === 0 && k === 'goal' && !stats.goalShot) { stats.goalShot = true; await page.waitForTimeout(250); await shot('06-goal'); }
  }
  stats.matches++;
  await page.waitForTimeout(300);
  if (wk === 0) await shot('07-postmatch');
  const lm = await page.evaluate(() => window.__S.career.d.lastMatch);
  stats.goals += lm.myGoals;
  console.log(`week ${wk + 1}: ${lm.ourGoals}-${lm.theirGoals} vs ${lm.opp}, goals ${lm.myGoals}, assists ${lm.myAssists}, rating ${lm.rating}`);
}
await page.tap('[data-a=go]');
await page.waitForTimeout(500);
await shot('08-season-end');
const end = await page.evaluate(() => window.__S.career.d.career.seasons[0]);
console.log('season summary', JSON.stringify(end));
console.log('moment outcomes', JSON.stringify(stats.outcomes));
if (errors.length) console.log('Console errors:\n' + [...new Set(errors)].join('\n'));
await browser.close();
const ok = !errors.length && stats.matches === 14 && end;
console.log(ok ? '\nFULL SEASON PLAYED IN THE BROWSER WITHOUT ERRORS' : '\nPROBLEMS FOUND');
process.exit(ok ? 0 : 1);
