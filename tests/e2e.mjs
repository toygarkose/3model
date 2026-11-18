// SEYİR uçtan uca doğrulama — `npm test` (önce build alır).
// Üretim derlemesini `vite preview` ile açar, headless Chromium'da iki ekran boyutunda
// senaryoları koşar ve her adımda tests/shots/ altına ekran görüntüsü bırakır.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tests', 'shots');
mkdirSync(shots, { recursive: true });
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const LONG = 240_000;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // Bulut ortamında Playwright küresel kurulu
    const require = createRequire('/opt/node-tools/node_modules/');
    return require('playwright');
  }
}

async function ensureServer() {
  const up = async () => {
    try {
      return (await fetch(BASE)).ok;
    } catch {
      return false;
    }
  };
  if (await up()) return null;
  if (!existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('dist/ yok: önce `npm run build` çalıştır.');
  const bin = path.join(root, 'node_modules', '.bin', 'vite');
  const proc = spawn(bin, ['preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    if (await up()) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('vite preview başlatılamadı');
}

let failures = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Sürücü/ekran görüntüsü kaynaklı, uygulamayla ilgisiz mesajlar. */
const IGNORED = [/GPU stall due to ReadPixels/i, /GL Driver Message/i];

function watchConsole(page, label, sink, expected = []) {
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    if (IGNORED.some((re) => re.test(text)) || expected.some((re) => re.test(text))) return;
    sink.push(`[${label}] ${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => sink.push(`[${label}] pageerror: ${e.message}`));
}

const state = (page) => page.evaluate(() => window.__seyir.state());
const waitMode = (page, mode) => page.waitForFunction((m) => window.__seyir.state().mode === m, mode, { timeout: LONG });
const waitReady = (page) => page.waitForFunction(() => window.__seyir && window.__seyir.ready, null, { timeout: LONG });
const shot = (page, name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const text = (page, sel) => page.locator(sel).innerText();

/** Paneller görünüm alanından taşıyor mu? */
async function overflow(page, selectors) {
  return page.evaluate((sels) => {
    const bad = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) bad.push('yatay kaydırma');
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < -1 || r.top < -1 || r.right > window.innerWidth + 1 || r.bottom > window.innerHeight + 1) bad.push(`${s} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
      }
    }
    return bad;
  }, selectors);
}

/** Görünür kartlar birbirinin üstüne biniyor mu? */
async function overlaps(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('.card-event, .card-camera, .card-map, .card-seat, .seatbar, .pill, .hint')].filter((el) => {
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.5;
    });
    const bad = [];
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect();
        const b = els[j].getBoundingClientRect();
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(`${els[i].className.split(' ').pop()} × ${els[j].className.split(' ').pop()}`);
      }
    }
    return bad;
  });
}

/** Yaygın dizüstü çözünürlüğü: kısa ekranda kartlar sığıyor ve çakışmıyor mu? */
async function laptop(browser, problems) {
  console.log('\nDizüstü 1366x768');
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  watchConsole(page, 'dizüstü', problems);
  await page.goto(BASE);
  await waitReady(page);
  check('kartlar çakışmıyor (orbit, seçim yok)', (await overlaps(page)).length === 0, (await overlaps(page)).join('; '));
  await page.click('#btn-suggest');
  await waitMode(page, 'seat');
  await page.waitForTimeout(800);
  await shot(page, 'l01-koltuk');
  check('kartlar çakışmıyor (koltuk)', (await overlaps(page)).length === 0, (await overlaps(page)).join('; '));
  check('arayüz taşmıyor (koltuk)', (await overflow(page, ['.card', '.seatbar'])).length === 0, (await overflow(page, ['.card', '.seatbar'])).join('; '));
  await page.click('#btn-back');
  await waitMode(page, 'orbit');
  await page.waitForTimeout(800);
  await shot(page, 'l02-orbit-secili');
  check('kartlar çakışmıyor (orbit, koltuk seçili)', (await overlaps(page)).length === 0, (await overlaps(page)).join('; '));
  const clipped = await page.evaluate(() => {
    const el = document.querySelector('.card-seat');
    return el.scrollHeight - el.clientHeight;
  });
  check('koltuk kartı kaydırma gerektirmiyor', clipped <= 2, `${clipped}px taşma`);
  await ctx.close();
}

async function findSeat(page, taken) {
  await page.waitForFunction(() => window.__seyir.stable(), null, { timeout: LONG });
  const hit = await page.evaluate((t) => window.__seyir.findClickable(t), taken);
  if (!hit) throw new Error(`Tıklanabilir ${taken ? 'dolu' : 'boş'} koltuk bulunamadı`);
  return hit;
}

async function desktop(browser, problems) {
  console.log('\nMasaüstü 1440x900');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  watchConsole(page, 'masaüstü', problems);
  await page.goto(BASE);
  await page.waitForSelector('#loader', { state: 'attached' });
  check('yükleme ekranı görünüyor', await page.evaluate(() => !!document.querySelector('#loader .logo-text')));
  await waitReady(page);
  await page.waitForTimeout(800);
  await shot(page, 'd01-stadyum');
  check('giriş hareketi bitti, mod orbit', (await state(page)).mode === 'orbit');
  const distinct = await page.evaluate(() => window.__seyir.probe());
  check('canvas boş değil', distinct > 20, `${distinct} farklı renk`);
  check('arayüz taşmıyor (orbit)', (await overflow(page, ['.card', '.topbar > *', '.hint'])).length === 0, (await overflow(page, ['.card', '.topbar > *', '.hint'])).join('; '));
  check('ipucu metni', (await text(page, '#hint-text')).includes('bir koltuğa tıkla'));

  // Orbit: sürükle-döndür, tekerlek zoom, sıfırla
  const cam0 = await page.evaluate(() => window.__seyir.camera());
  await page.mouse.move(720, 560);
  await page.mouse.down();
  await page.mouse.move(900, 520, { steps: 6 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(2500);
  const cam1 = await page.evaluate(() => window.__seyir.camera());
  check('sürükleme kamerayı döndürüyor', Math.hypot(cam1.pos[0] - cam0.pos[0], cam1.pos[2] - cam0.pos[2]) > 5);
  check('sürükleme koltuk seçmiyor', (await state(page)).selectedSeat === -1);
  check('tekerlek yakınlaştırıyor', cam1.zoom > cam0.zoom + 0.05, `${cam0.zoom.toFixed(2)} → ${cam1.zoom.toFixed(2)}`);
  await page.click('#cam-reset');
  await page.waitForFunction((z) => Math.abs(window.__seyir.camera().zoom - z) < 0.01 && !window.__seyir.state().locked, cam0.zoom, { timeout: LONG });
  check('sıfırla butonu', true);

  // Hover + tooltip
  let seat = await findSeat(page, false);
  await page.mouse.move(seat.x, seat.y);
  await page.waitForFunction(() => !document.getElementById('tooltip').hidden, null, { timeout: LONG });
  const tip = await text(page, '#tooltip');
  check('hover tooltip: blok/sıra/koltuk + fiyat + görüş', /Blok \d{3} · S.ra \d+ · Koltuk \d+/i.test(tip) && /€\d+ · Görüş %\d+/.test(tip), tip.replace(/\n/g, ' | '));
  check('hover imleci el', await page.evaluate(() => document.getElementById('scene').classList.contains('pointing')));
  await shot(page, 'd02-hover');

  // Tıklama → uçuş → koltuk görünümü
  await page.mouse.click(seat.x, seat.y);
  const mid = await state(page);
  check('tıklama uçuşu başlatıyor', mid.mode === 'flying' && mid.seatId === seat.id, `${mid.mode} ${mid.seatId}`);
  // Geçiş sırasında girdi kilitli: başka yere tıklamak seçimi bozmaz
  await page.mouse.click(700, 420);
  await page.mouse.click(520, 300);
  await page.waitForTimeout(1200);
  await shot(page, 'd03-ucus');
  await waitMode(page, 'seat');
  let st = await state(page);
  check('geçiş tamamlandı, seçim korundu', st.seatId === seat.id);
  check('koltuk kartı güncellendi', (await text(page, '#seat-block')).toLowerCase().includes(seat.id.split('-')[0]) && (await text(page, '#seat-row')) === seat.id.split('-')[1]);
  check('URL koltuğu içeriyor', (await page.evaluate(() => location.hash)).includes(`koltuk=${seat.id}`));
  await page.waitForFunction(() => document.getElementById('preview-wait').classList.contains('done'), null, { timeout: LONG });
  check('önizleme doldu', true);
  check('ipucu: etrafa bak', (await text(page, '#hint-text')).includes('Etrafa bakmak'));
  check('araç çubuğu: stadyuma dön + ses', await page.locator('#btn-back').isVisible() && await page.locator('#btn-sound2').isVisible());
  check('kamera kartı gizlendi', !(await page.locator('.card-camera').isVisible()));
  await page.waitForTimeout(1500);
  await shot(page, 'd04-koltuk');
  check('kartlar çakışmıyor (koltuk)', (await overlaps(page)).length === 0, (await overlaps(page)).join('; '));
  check('arayüz taşmıyor (koltuk)', (await overflow(page, ['.card', '.seatbar'])).length === 0, (await overflow(page, ['.card', '.seatbar'])).join('; '));

  // Etrafa bak
  const dir0 = (await page.evaluate(() => window.__seyir.camera())).dir;
  await page.mouse.move(720, 400);
  await page.mouse.down();
  await page.mouse.move(520, 380, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(2000);
  const dir1 = (await page.evaluate(() => window.__seyir.camera())).dir;
  check('koltukta sürükleme bakışı döndürüyor', Math.hypot(dir1[0] - dir0[0], dir1[2] - dir0[2]) > 0.05);
  await shot(page, 'd05-etrafa-bak');

  // Komşu koltuk (ok tuşu ve buton)
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((id) => window.__seyir.state().seatId !== id && !window.__seyir.state().locked, seat.id, { timeout: LONG });
  const afterKey = (await state(page)).seatId;
  check('ok tuşu komşu koltuğa geçiriyor', afterKey !== seat.id, `${seat.id} → ${afterKey}`);
  await page.click('#nb-up');
  await page.waitForFunction((id) => window.__seyir.state().seatId !== id && !window.__seyir.state().locked, afterKey, { timeout: LONG });
  const afterBtn = (await state(page)).seatId;
  check('buton arka sıraya geçiriyor', Number(afterBtn.split('-')[1]) === Number(afterKey.split('-')[1]) + 1, afterBtn);

  // Tepkiler
  for (const id of ['#re-applause', '#re-cheer', '#re-wave']) {
    await page.click(id);
    await page.waitForTimeout(900);
  }
  await shot(page, 'd06-tepki');
  check('tepkiler hatasız', true);

  // Ses aç/kapa
  await page.click('#btn-sound2');
  check('ses kapandı', (await state(page)).soundOn === false);
  await page.click('#btn-sound2');
  check('ses açıldı', (await state(page)).soundOn === true);

  // Stadyuma dön
  await page.click('#btn-back');
  await waitMode(page, 'orbit');
  st = await state(page);
  check('stadyuma dön çalışıyor, kart son koltukta', st.mode === 'orbit' && st.seatId === afterBtn && (await text(page, '#seat-row')) === afterBtn.split('-')[1]);
  await page.waitForTimeout(600);
  await shot(page, 'd07-donus');
  check('kartlar çakışmıyor (orbit, koltuk seçili)', (await overlaps(page)).length === 0, (await overlaps(page)).join('; '));

  // Dolu koltuk → aynı sıradaki en yakın boş koltuk
  const taken = await findSeat(page, true);
  await page.mouse.click(taken.x, taken.y);
  await page.waitForFunction(() => document.querySelector('#toasts .toast'), null, { timeout: LONG });
  const toast = await text(page, '#toasts');
  st = await state(page);
  const [tb, tr] = taken.id.split('-');
  check('dolu koltuk: bilgi mesajı', /dolu/i.test(toast), toast.replace(/\n/g, ' | '));
  check('dolu koltuk: aynı sırada boş koltuğa yönlendi', st.seatId !== taken.id && st.seatId.startsWith(`${tb}-${tr}-`), `${taken.id} → ${st.seatId}`);
  check('yönlendirilen koltuk boş', (await page.locator('#seat-status').getAttribute('data-state')) === 'free');
  await shot(page, 'd08-dolu-yonlendirme');
  await waitMode(page, 'seat');

  // Koltuğu al → bilet
  await page.click('#btn-buy');
  await page.waitForSelector('#dlg[open] .ticket');
  await shot(page, 'd09-bilet');
  const ticketSeat = (await state(page)).seatId;
  check('bilet kartı: blok/sıra/koltuk', (await text(page, '#dlg .ticket')).includes(ticketSeat.split('-')[0]));
  await page.click('#dlg-close');
  check('koltuk durumu: senin koltuğun', (await page.locator('#seat-status').getAttribute('data-state')) === 'mine');
  check('koltuklarım sayacı 1', (await text(page, '#ticket-count')) === '1');
  await page.click('#btn-back');
  await waitMode(page, 'orbit');

  // Favori + paylaş
  await page.click('#btn-fav');
  check('favori eklendi', (await text(page, '#fav-count')) === '1');
  await page.click('#btn-share');
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('bağlantı kopyalandı', clip.includes(`koltuk=${ticketSeat}`), clip);

  // Blok haritası → kamera döner
  const camA = await page.evaluate(() => window.__seyir.camera());
  await page.locator('#blockmap path[data-block="5"]').click();
  await page.waitForFunction(() => !window.__seyir.state().locked, null, { timeout: LONG });
  await page.waitForTimeout(600);
  const camB = await page.evaluate(() => window.__seyir.camera());
  check('bloğa tıklayınca kamera dönüyor', Math.hypot(camB.pos[0] - camA.pos[0], camB.pos[2] - camA.pos[2]) > 20);
  await shot(page, 'd10-blok-odak');
  await page.click('#cam-reset');
  await page.waitForFunction(() => !window.__seyir.state().locked, null, { timeout: LONG });

  // Filtre
  const before = await text(page, '#filter-count');
  await page.locator('#filter-tier button', { hasText: 'Üst' }).click();
  check('kat filtresi uygulanıyor', (await state(page)).filter.tier === 2 && (await text(page, '#filter-count')) !== before);
  await page.locator('#price-max').fill('65');
  check('fiyat filtresi uygulanıyor', (await state(page)).filter.priceMax === 65, await text(page, '#price-label'));
  await page.waitForTimeout(1200);
  await shot(page, 'd11-filtre');
  await page.locator('#filter-tier button', { hasText: 'Tümü' }).click();
  await page.locator('#price-max').fill('180');

  // Etkinlik modu: sahne
  await page.locator('#menu-events button', { hasText: 'Sahne' }).click();
  check('etkinlik modu değişti (sahne)', (await state(page)).eventId === 'sahne' && (await text(page, '#ev-badge')) === 'KONSER');
  check('video URL alanı görünüyor', await page.locator('#video-form').isVisible());
  // İsteğe bağlı video: bozuk adres → varsayılan içeriğe dönüş; geçerli video → dev ekrana bağlanır
  await page.fill('#video-url', 'data:video/webm;base64,AAAA');
  await page.click('#video-form button');
  await page.waitForFunction(() => /yüklenemedi/.test(document.getElementById('toasts').innerText), null, { timeout: LONG });
  check('bozuk video: anlaşılır mesaj, varsayılan içerik', (await state(page)).videoUrl === '');
  const videoClip = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `hsl(${i * 30} 80% 50%)`;
      g.fillRect(0, 0, 64, 36);
      await new Promise((r) => setTimeout(r, 80));
    }
    rec.stop();
    await done;
    return URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
  });
  await page.fill("#video-url", videoClip);
  await page.click('#video-form button');
  await page.waitForFunction(() => /bağlandı/.test(document.getElementById('toasts').innerText), null, { timeout: LONG });
  check('video dev ekrana bağlanıyor', (await state(page)).videoUrl === videoClip);
  await page.fill('#video-url', '');
  await page.click('#video-form button');
  await page.waitForFunction(() => window.__seyir.state().videoUrl === '', null, { timeout: LONG });
  await page.click('#btn-demo');
  await page.waitForFunction(() => window.__seyir.state().phase === 'live', null, { timeout: LONG });
  check('demo: geri sayım → CANLI', (await text(page, '#ev-phase')) === 'CANLI');
  await page.waitForTimeout(2500);
  await shot(page, 'd12-sahne-orbit');
  await page.click('#btn-tickets');
  await page.waitForSelector('#dlg[open] [data-go]');
  await shot(page, 'd13-koltuklarim');
  await page.click('#dlg [data-go]');
  await waitMode(page, 'seat');
  check('"Koltuğuma git" doğrudan koltuğa indiriyor', (await state(page)).seatId === ticketSeat);
  await page.waitForTimeout(2000);
  await shot(page, 'd14-sahne-koltuk');
  await page.keyboard.press('Escape');
  await waitMode(page, 'orbit');
  check('Esc stadyuma döndürüyor', true);

  // Etkinlik modu: maç + demo
  await page.locator('#menu-events button', { hasText: 'Maç' }).click();
  check('etkinlik modu değişti (maç)', (await state(page)).eventId === 'mac' && (await text(page, '#ev-badge')) === 'MAÇ');
  await page.click('#btn-demo');
  await page.waitForFunction(() => window.__seyir.state().phase === 'live', null, { timeout: LONG });
  await page.waitForFunction(() => parseInt(window.__seyir.status().clock, 10) >= 3, null, { timeout: LONG });
  check('maç: süre işliyor', true, JSON.stringify(await page.evaluate(() => window.__seyir.status())));
  await shot(page, 'd15-mac-canli');
  const audio = await page.evaluate(() => window.__seyir.audio());
  check('ses bağlamı kullanıcı etkileşiminden sonra çalışıyor', audio.unlocked && audio.state === 'running', JSON.stringify(audio));
  // Akışın sonu: bitti
  await page.evaluate(() => window.__seyir.fastForward(1000));
  await page.waitForFunction(() => window.__seyir.state().phase === 'finished', null, { timeout: LONG });
  await page.waitForTimeout(800);
  check('akış: CANLI → BİTTİ', (await text(page, '#ev-phase')) === 'BİTTİ' && /sona erdi/.test(await text(page, '#ev-detail')), await text(page, '#ev-headline'));
  await shot(page, 'd15b-bitti');
  await page.click('#btn-demo');
  await page.waitForFunction(() => window.__seyir.state().phase === 'live', null, { timeout: LONG });
  check('bitince Demo ile yeniden başlıyor', (await page.evaluate(() => window.__seyir.status().headline)).includes('0 – 0'));

  // Klavye ile gezinme: görünür odak
  await page.keyboard.press('Tab');
  const focusOk = await page.evaluate(() => {
    const el = document.activeElement;
    return !!el && el !== document.body && getComputedStyle(el).outlineStyle !== 'none';
  });
  check('klavye odağı görünür', focusOk);

  // Kare süresi
  const stats = await page.evaluate(() => window.__seyir.stats);
  console.log(`  · kare: ${stats.frameMs.toFixed(1)} ms (${stats.fps.toFixed(1)} fps), ${stats.calls} çizim çağrısı, ${stats.triangles} üçgen, kalite=${stats.quality}`);
  check('kare döngüsü çalışıyor', stats.frameMs > 0 && stats.calls > 0);

  // Yeniden açılış: bilet kalıcı
  await page.goto('about:blank');
  await page.goto(BASE);
  await waitReady(page);
  check('bilet localStorage ile kalıcı', (await text(page, '#ticket-count')) === '1');
  check('açılışta "Koltuğuma git" sunuluyor', await page.locator('#btn-myseat').isVisible());

  // İkinci sekme: BroadcastChannel ile birbirini görür
  const page2 = await ctx.newPage();
  watchConsole(page2, 'sekme2', problems);
  await page2.goto(`${BASE}#koltuk=${ticketSeat}`);
  await waitReady(page2);
  await page2.waitForFunction(() => window.__seyir.state().online >= 1, null, { timeout: LONG });
  await page.waitForFunction(() => window.__seyir.state().online >= 1, null, { timeout: LONG });
  check('iki sekme birbirini görüyor (BroadcastChannel)', true);
  // Paylaşılan bağlantı doğrudan koltuğa iner (aynı tarayıcı = aynı kullanıcı, koltuk onun)
  await waitMode(page2, 'seat');
  const linked = (await state(page2)).seatId;
  check('koltuk bağlantısı doğrudan koltuğa indiriyor', linked === ticketSeat, `${ticketSeat} → ${linked}`);
  // Bir sekmedeki tepki diğerine ulaşır
  await page2.click('#re-wave');
  await page2.waitForTimeout(1500);
  await shot(page2, 'd16-baglanti');
  await page2.close();

  // Temizlik: koltuğu bırak
  await page.click('#btn-tickets');
  await page.click('#dlg [data-show]');
  await page.click('#ticket-refund');
  check('koltuk bırakıldı', (await text(page, '#ticket-count')) === '0');
  await ctx.close();
}

/** WebGL yokluğu, bağlam kaybı ve tek dosyalık derleme. */
async function robustness(browser, problems) {
  console.log('\nDayanıklılık');
  // 1) WebGL desteklenmiyor
  const noGl = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await noGl.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/i.test(type) ? null : orig.call(this, type, ...rest);
    };
  });
  const p1 = await noGl.newPage();
  watchConsole(p1, 'webgl-yok', problems);
  await p1.goto(BASE);
  await p1.waitForSelector('#fatal:not([hidden])');
  check('WebGL yoksa anlaşılır mesaj', /WebGL/.test(await text(p1, '#fatal')), (await text(p1, '#fatal-title')));
  await shot(p1, 'r01-webgl-yok');
  await noGl.close();

  // 2) WebGL bağlam kaybı ve geri gelişi
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const p2 = await ctx.newPage();
  watchConsole(p2, 'baglam', problems);
  await p2.goto(BASE);
  await waitReady(p2);
  await p2.evaluate(() => {
    const gl = document.getElementById('scene').getContext('webgl2');
    window.__lose = gl.getExtension('WEBGL_lose_context');
    window.__lose.loseContext();
  });
  await p2.waitForSelector('#fatal:not([hidden])');
  check('bağlam kaybında mesaj gösteriliyor', /bağlam/i.test(await text(p2, '#fatal-title')));
  await shot(p2, 'r02-baglam-kaybi');
  await p2.evaluate(() => window.__lose.restoreContext());
  await p2.waitForSelector('#fatal', { state: 'hidden', timeout: LONG });
  const distinct = await p2.evaluate(() => window.__seyir.probe());
  check('bağlam geri gelince sahne yeniden çiziliyor', distinct > 20, `${distinct} farklı renk`);
  await p2.waitForTimeout(1500);
  await shot(p2, 'r03-baglam-geri');

  // 3) Sekme arka plana geçip dönünce animasyon zamanı sıçramaz (delta sınırlı)
  const liveBefore = await p2.evaluate(() => window.__seyir.state().countdown);
  await p2.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  check('geri sayım makul ilerliyor', liveBefore - (await p2.evaluate(() => window.__seyir.state().countdown)) <= 2);
  await ctx.close();

  // 4) Tek dosyalık derleme: file:// ile açılır
  const single = path.join(root, 'dist-single', 'index.html');
  if (existsSync(single)) {
    const fctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
    const p3 = await fctx.newPage();
    watchConsole(p3, 'tek-dosya', problems);
    await p3.goto(`file://${single}`);
    await waitReady(p3);
    await p3.click('#btn-suggest');
    await waitMode(p3, 'seat');
    check('tek dosyalık derleme file:// ile çalışıyor', (await state(p3)).seatId !== null && (await p3.evaluate(() => location.hash)).includes('koltuk='));
    await p3.waitForTimeout(1000);
    await shot(p3, 'r04-tek-dosya');
    await fctx.close();
  } else {
    console.log('  · dist-single/ yok: tek dosya kontrolü atlandı (npm run build:single)');
  }
}

/** İsteğe bağlı WebSocket sunucusu: iki ayrı tarayıcı oturumu (farklı "cihaz") birbirini görür. */
async function server(browser, problems) {
  console.log('\nEş zamanlılık sunucusu (WebSocket, iki ayrı oturum)');
  const WS_PORT = 8791;
  const proc = spawn(process.execPath, [path.join(root, 'server', 'server.mjs')], { env: { ...process.env, PORT: String(WS_PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const url = `${BASE}?ws=ws://localhost:${WS_PORT}`;
  const ctxA = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const ctxB = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  try {
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    // Sunucu bilerek kapatıldıktan sonraki yeniden bağlanma denemeleri tarayıcı tarafından loglanır: beklenen durum
    const refused = [/WebSocket connection to .* failed/];
    watchConsole(a, 'ws-a', problems, refused);
    watchConsole(b, 'ws-b', problems, refused);
    await Promise.all([a.goto(url), b.goto(url)]);
    await Promise.all([waitReady(a), waitReady(b)]);
    await a.waitForFunction(() => window.__seyir.state().online >= 1 && window.__seyir.state().link === 'ws', null, { timeout: LONG });
    await b.waitForFunction(() => window.__seyir.state().online >= 1 && window.__seyir.state().link === 'ws', null, { timeout: LONG });
    check('iki cihaz sunucu üzerinden birbirini görüyor', true, await text(a, '#ev-online-text'));
    // A bir koltuk alır → B'de o koltuk dolu görünür
    await a.click('#btn-suggest');
    await waitMode(a, 'seat');
    await a.click('#btn-buy');
    await a.waitForSelector('#dlg[open] .ticket');
    await a.click('#dlg-close');
    const sa = await state(a);
    await b.waitForFunction((i) => window.__seyir.seatInfo(i).taken, sa.selectedSeat, { timeout: LONG });
    check("A'nın aldığı koltuk B'de dolu", true, sa.seatId);
    // B aynı koltuğun bağlantısını açarsa aynı sıradaki boş koltuğa yönlenir
    await b.goto(`${url}#koltuk=${sa.seatId}`);
    await b.reload();
    await waitReady(b);
    await waitMode(b, 'seat');
    const sb = await state(b);
    check('B dolu koltuk bağlantısında yandaki boş koltuğa iniyor', sb.seatId !== sa.seatId && sb.seatId.startsWith(sa.seatId.split('-').slice(0, 2).join('-')), `${sa.seatId} → ${sb.seatId}`);
    await a.click('#re-cheer');
    await b.waitForTimeout(1200);
    await shot(b, 's01-iki-cihaz');
    check('tepki sunucu üzerinden iletiliyor (hatasız)', true);
    // Sunucu kapanınca uygulama çalışmaya devam eder
    proc.kill();
    await a.waitForFunction(() => window.__seyir.state().link === 'local', null, { timeout: LONG });
    await a.click('#btn-back');
    await waitMode(a, 'orbit');
    check('sunucu kapanınca uygulama sorunsuz devam ediyor', true);
  } finally {
    proc.kill();
    await ctxA.close();
    await ctxB.close();
  }
}

/** Gerçek dokunma olayları (CDP): tek parmak sürükleme. */
async function touchDrag(page, x0, y0, x1, y1) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await send('touchStart', [{ x: x0, y: y0, id: 1 }]);
  for (let i = 1; i <= 8; i++) {
    await send('touchMove', [{ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8, id: 1 }]);
    await page.waitForTimeout(16);
  }
  await send('touchEnd', []);
  await cdp.detach();
}

/** Gerçek iki parmak pinch (CDP). */
async function pinch(page, spread) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const pts = (s) => [
    { x: 180 - s, y: 380, id: 1 },
    { x: 210 + s, y: 380, id: 2 },
  ];
  await send('touchStart', pts(0));
  for (let i = 1; i <= 8; i++) {
    await send('touchMove', pts((spread * i) / 8));
    await page.waitForTimeout(16);
  }
  await send('touchEnd', []);
  await cdp.detach();
}

async function mobile(browser, problems) {
  console.log('\nTelefon 390x844 (dokunmatik)');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  watchConsole(page, 'telefon', problems);
  await page.goto(BASE);
  await waitReady(page);
  await page.waitForTimeout(800);
  await shot(page, 'm01-stadyum');
  const distinct = await page.evaluate(() => window.__seyir.probe());
  check('canvas boş değil', distinct > 20, `${distinct} farklı renk`);
  check('arayüz taşmıyor (orbit)', (await overflow(page, ['.topbar > *', '.hint', '#panels'])).length === 0, (await overflow(page, ['.topbar > *', '.hint', '#panels'])).join('; '));
  const sheetTop = await page.evaluate(() => document.getElementById('panels').getBoundingClientRect().top);
  check('sahne görünür kalıyor (panel kapalı)', sheetTop > 844 * 0.8, `panel üstü ${Math.round(sheetTop)}px`);

  // Sürükle + pinch
  const cam0 = await page.evaluate(() => window.__seyir.camera());
  await touchDrag(page, 200, 420, 300, 400);
  await pinch(page, 70);
  await page.waitForTimeout(2500);
  const cam1 = await page.evaluate(() => window.__seyir.camera());
  check('dokunmatik sürükleme döndürüyor', Math.hypot(cam1.pos[0] - cam0.pos[0], cam1.pos[2] - cam0.pos[2]) > 5);
  check('iki parmak yakınlaştırıyor', cam1.zoom > cam0.zoom + 0.1, `${cam0.zoom.toFixed(2)} → ${cam1.zoom.toFixed(2)}`);
  check('sürükleme/pinch koltuk seçmiyor', (await state(page)).selectedSeat === -1);
  await shot(page, 'm02-zoom');

  // Panel sekmeleri
  await page.tap('.sheet-tabs [data-tab="map"]');
  await page.waitForTimeout(500);
  await shot(page, 'm03-panel-bloklar');
  const openTop = await page.evaluate(() => document.getElementById('panels').getBoundingClientRect().top);
  check('panel açılıyor, sahne yine görünür', openTop > 844 * 0.4 && openTop < sheetTop, `panel üstü ${Math.round(openTop)}px`);
  check('arayüz taşmıyor (panel açık)', (await overflow(page, ['#panels', '.card-map'])).length === 0, (await overflow(page, ['#panels', '.card-map'])).join('; '));
  await page.tap('.sheet-tabs [data-tab="event"]');
  await page.waitForTimeout(300);
  await shot(page, 'm04-panel-etkinlik');
  await page.tap('.sheet-tabs [data-tab="camera"]');
  await page.waitForTimeout(300);
  await shot(page, 'm05-panel-kamera');
  await page.tap('.sheet-tabs [data-tab="camera"]');
  check('aynı sekmeye dokununca panel kapanıyor', (await page.evaluate(() => document.getElementById('ui').dataset.sheet)) === 'closed');

  // Dokunarak koltuk seç
  const seat = await findSeat(page, false);
  await page.touchscreen.tap(seat.x, seat.y);
  await page.waitForFunction(() => window.__seyir.state().selectedSeat >= 0, null, { timeout: LONG });
  let st = await state(page);
  check('dokunma koltuk seçip uçuşu başlatıyor', st.seatId === seat.id && st.mode !== 'orbit', `${st.seatId} ${st.mode}`);
  await waitMode(page, 'seat');
  await page.waitForTimeout(1500);
  await shot(page, 'm06-koltuk');
  check('araç çubuğu görünür', await page.locator('#btn-back').isVisible());
  check('arayüz taşmıyor (koltuk)', (await overflow(page, ['.seatbar', '#panels', '.topbar > *'])).length === 0, (await overflow(page, ['.seatbar', '#panels', '.topbar > *'])).join('; '));
  const dir0 = (await page.evaluate(() => window.__seyir.camera())).dir;
  await touchDrag(page, 200, 380, 80, 360);
  await page.waitForTimeout(2000);
  const dir1 = (await page.evaluate(() => window.__seyir.camera())).dir;
  check('koltukta dokunmatik bakış', Math.hypot(dir1[0] - dir0[0], dir1[2] - dir0[2]) > 0.05);
  await page.tap('.sheet-tabs [data-tab="seat"]');
  await page.waitForTimeout(500);
  await shot(page, 'm07-koltuk-karti');
  check('koltuk kartı panelde', (await text(page, '#seat-row')) === seat.id.split('-')[1]);
  await page.tap('.sheet-tabs [data-tab="seat"]');
  await page.tap('#nb-right');
  await page.waitForFunction((id) => window.__seyir.state().seatId !== id && !window.__seyir.state().locked, seat.id, { timeout: LONG });
  check('komşu koltuk butonu', true);
  await page.tap('#btn-back');
  await waitMode(page, 'orbit');
  check('stadyuma dön çalışıyor', true);
  await page.waitForTimeout(500);
  await shot(page, 'm08-donus');

  // Dolu koltuk yönlendirmesi
  await page.tap('.sheet-tabs [data-tab="seat"]');
  const taken = await findSeat(page, true);
  await page.touchscreen.tap(taken.x, taken.y);
  await page.waitForFunction(() => document.querySelector('#toasts .toast'), null, { timeout: LONG });
  st = await state(page);
  const [tb, tr] = taken.id.split('-');
  check('dolu koltuk yönlendirmesi', st.seatId !== taken.id && st.seatId.startsWith(`${tb}-${tr}-`), `${taken.id} → ${st.seatId}`);
  await waitMode(page, 'seat');
  await page.tap('#btn-back');
  await waitMode(page, 'orbit');

  // Etkinlik modu
  await page.locator('#menu-events button', { hasText: 'Sahne' }).tap();
  check('etkinlik modu değişti', (await state(page)).eventId === 'sahne');
  await page.tap('#btn-demo');
  await page.waitForFunction(() => window.__seyir.state().phase === 'live', null, { timeout: LONG });
  await page.waitForTimeout(2000);
  await shot(page, 'm09-sahne');
  await page.tap('#btn-help');
  await page.waitForSelector('#dlg[open]');
  await shot(page, 'm10-yardim');
  check('yardım diyaloğu taşmıyor', (await overflow(page, ['#dlg'])).length === 0);
  await page.tap('#dlg-close');
  const stats = await page.evaluate(() => window.__seyir.stats);
  console.log(`  · kare: ${stats.frameMs.toFixed(1)} ms (${stats.fps.toFixed(1)} fps), ${stats.calls} çizim çağrısı, ${stats.triangles} üçgen, kalite=${stats.quality}`);
  await ctx.close();
}

const preview = await ensureServer();
const { chromium } = await loadPlaywright();
const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };
let browser;
try {
  browser = await chromium.launch(launch);
} catch {
  browser = await chromium.launch({ ...launch, executablePath: '/opt/pw-browsers/chromium' });
}
const problems = [];
const only = process.argv[2];
try {
  if (!only || only === 'desktop') await desktop(browser, problems);
  if (!only || only === 'laptop') await laptop(browser, problems);
  if (!only || only === 'mobile') await mobile(browser, problems);
  if (!only || only === 'server') await server(browser, problems);
  if (!only || only === 'robust') await robustness(browser, problems);
} catch (err) {
  failures++;
  console.error('\nSenaryo yarıda kesildi:', err);
} finally {
  await browser.close();
  preview?.kill();
}
console.log('');
check('konsolda hata ve uyarı yok', problems.length === 0, problems.slice(0, 8).join('\n    '));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} kontrol geçti. Ekran görüntüleri: tests/shots/`);
process.exit(failures ? 1 : 0);
