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
await page.selectOption('#na', 'Türkiye');
await page.tap('form button[type=submit]');
await page.waitForTimeout(400);
await shot('02-hub');
// training through the real button
await page.evaluate(() => { window.__S.timeWarp = 3; });
await page.tap('[data-act=train]');
await page.tap('[data-drill=shooting]');
for (let i = 0; i < 5; i++) {
  await page.waitForFunction(() => window.__S.play.m?.phase === 'aim', null, { timeout: 30000 });
  if (i === 0) { await page.waitForTimeout(300); await shot('03-training'); }
  await page.evaluate(i => window.__S.play.testShoot([-2.8, 2.8, -2.9, 2.9, 0][i], 0, 0.82, 0), i);
  await page.waitForFunction(() => !window.__S.play.m || window.__S.play.m.phase !== 'flight', null, { timeout: 30000 });
}
await page.waitForFunction(() => window.__S.app.mode === 'hub', null, { timeout: 30000 });
await page.waitForTimeout(300);
await shot('04-training-done');
// dribble drill: feint at the right moment three times
await page.tap('[data-a=go]');
await page.evaluate(() => { window.__S.career.d.energy = 100; window.__S.ui.showHub('week'); });
await page.tap('[data-act=train]');
await page.tap('[data-drill=dribble]');
for (let i = 0; i < 3; i++) {
  await page.waitForFunction(() => window.__S.play.m?.phase === 'dribble', null, { timeout: 30000 });
  await page.waitForFunction(() => { const m = window.__S.play.m; if (!m || m.phase !== 'dribble') return true; const d = m.defs.find(x => x.presser); return Math.hypot(d.x - m.ball.x, d.y - m.ball.y) < 2.4; }, null, { timeout: 30000 });
  await page.evaluate(() => window.__S.play.m?.phase === 'dribble' && window.__S.play.doFeint(-1));
  await page.waitForFunction(() => !window.__S.play.m || window.__S.play.m.phase !== 'dribble', null, { timeout: 30000 });
  await page.evaluate(() => { const m = window.__S.play.m; if (m?.phase === 'aim') window.__S.play.testShoot(m.ball.x > 0 ? -2.9 : 2.9, 0, 0.9, 0); });
  await page.waitForFunction(i => window.__S.app.training == null || window.__S.app.training.shot > i, i, { timeout: 30000 });
}
await page.waitForFunction(() => window.__S.app.mode === 'hub', null, { timeout: 30000 });
console.log('dribble drill hits', await page.evaluate(() => document.querySelector('.big b')?.textContent));
await page.tap('[data-a=go]');
// team night: crossbar challenge through the real button
await page.evaluate(() => { const d = window.__S.career.d; d.energy = 100; window.__S.ui.showHub('week'); });
await page.tap('[data-act=team]');
for (let i = 0; i < 3; i++) {
  await page.waitForFunction(() => window.__S.play.m?.phase === 'aim' && !window.__S.play.paused, null, { timeout: 30000 });
  await page.evaluate(i => window.__S.play.testShoot([-2.6, 0, 2.6][i], 0, 0.9, 0), i);
  await page.waitForFunction(() => !window.__S.play.m || window.__S.play.m.phase !== 'flight', null, { timeout: 30000 });
}
await page.waitForFunction(() => window.__S.app.mode === 'hub', null, { timeout: 30000 });
await shot('04b-teamnight');
await page.tap('[data-a=go]');
await page.evaluate(() => window.__S.ui.showHub('life'));
await shot('04c-life');
// spend skill points & buy something
await page.evaluate(() => { const c = window.__S.career; for (let i = 0; i < 3; i++) c.upgrade('shooting'); c.buy('nrg'); });
const stats = { goals: 0, matches: 0, outcomes: {} };
let seasonOver = false;
for (let wk = 0; wk < 30 && !seasonOver; wk++) {
  await page.evaluate(() => window.__S.ui.showHub('week'));
  if (await page.$('[data-ev]')) { await page.tap('[data-ev="0"]'); stats.events = (stats.events || 0) + 1; }
  if (await page.$('[data-a=skip]')) {
    await page.tap('[data-a=skip]'); stats.skipped = (stats.skipped || 0) + 1;
    seasonOver = await page.evaluate(() => !document.querySelector('[data-a=play]') && !document.querySelector('[data-a=skip]'));
    console.log(`week ${wk + 1}: injured, watched from the stands`);
    continue;
  }
  await page.tap('[data-a=play]');
  await page.evaluate(() => { window.__S.timeWarp = 4; });
  for (;;) {
    const st = await page.waitForFunction(() => { const S = window.__S; if (S.app.flow?.state === 'over') return 'over'; if (S.play.m?.phase === 'aim' || S.play.m?.phase === 'dribble') return 'aim'; return false; }, null, { timeout: 120000 }).then(h => h.jsonValue());
    const isDribble = await page.evaluate(() => window.__S.play.m?.phase === 'dribble');
    if (isDribble) {
      await page.evaluate(() => { const c = document.querySelector('.coach'); if (c) c.click(); });
      await page.waitForFunction(() => { const m = window.__S.play.m; if (!m || m.phase !== 'dribble') return true; const d = m.defs.find(x => x.presser); return Math.hypot(d.x - m.ball.x, d.y - m.ball.y) < 2.4; }, null, { timeout: 30000 });
      const fr = await page.evaluate(() => window.__S.play.m?.phase === 'dribble' ? window.__S.play.doFeint(1) : 'gone');
      stats.feints = stats.feints || {}; stats.feints[fr] = (stats.feints[fr] || 0) + 1;
      await page.waitForFunction(() => !window.__S.play.m || window.__S.play.m.phase !== 'dribble', null, { timeout: 30000 });
      if (!(await page.evaluate(() => window.__S.play.m?.phase === 'aim'))) continue;
    }
    if (st === 'over') break;
    // dismiss tutorial cards
    await page.evaluate(() => { const c = document.querySelector('.coach'); if (c) c.click(); });
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
  seasonOver = await page.evaluate(() => document.querySelector('[data-a=go]')?.textContent === 'Season finale');
  if (!seasonOver) await page.tap('[data-a=go]');
}
if (await page.evaluate(() => document.querySelector('[data-a=go]')?.textContent === 'Season finale')) await page.tap('[data-a=go]');
await page.waitForTimeout(500);
await shot('08-season-end');
const end = await page.evaluate(() => window.__S.career.d.career.seasons[0]);
console.log('season summary', JSON.stringify(end));
console.log('moment outcomes', JSON.stringify(stats.outcomes), 'feints', JSON.stringify(stats.feints || {}), 'events', stats.events || 0, 'skipped', stats.skipped || 0, 'matches', stats.matches);
if (errors.length) console.log('Console errors:\n' + [...new Set(errors)].join('\n'));
await browser.close();
const ok = !errors.length && seasonOver && stats.matches >= 10 && end;
console.log(ok ? '\nFULL SEASON PLAYED IN THE BROWSER WITHOUT ERRORS' : '\nPROBLEMS FOUND');
process.exit(ok ? 0 : 1);
