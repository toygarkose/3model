import * as THREE from 'three';
import { ACTIVE_VENUE } from './config/venue';
import { AudioEngine } from './audio/audio';
import { CameraController } from './camera/controller';
import { Store, type AppState, type Filter, type Quality, type Ticket } from './core/store';
import { findSeatById, generateSeats, nearestFreeInRow, neighborSeat, seatId, type Block } from './data/seats';
import { EventDirector } from './events/director';
import type { CrowdCue } from './events/types';
import { Picker } from './interaction/picking';
import { attachPointer } from './interaction/pointer';
import { Sync, type Peer, type ReactionKind } from './net/sync';
import { SeatField } from './scene/seatField';
import { createSceneKit, detectQuality, isWebGLAvailable, type SceneKit } from './scene/setup';
import { buildStadium } from './scene/stadium';
import { UI, type Actions, type SeatState } from './ui/ui';

const venue = ACTIVE_VENUE;
const STORAGE_KEY = 'seyir.v1';
const MAX_TICKETS = 6;

interface Saved {
  tickets: Ticket[];
  favorites: string[];
  soundOn: boolean;
  volume: number;
}

function loadSaved(): Saved {
  const base: Saved = { tickets: [], favorites: [], soundOn: true, volume: 0.7 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Saved>;
    return {
      tickets: Array.isArray(p.tickets) ? p.tickets.filter((t) => t && typeof t.seat === 'string') : [],
      favorites: Array.isArray(p.favorites) ? p.favorites.filter((f) => typeof f === 'string') : [],
      soundOn: p.soundOn !== false,
      volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : 0.7,
    };
  } catch {
    return base;
  }
}

function fatal(title: string, text: string, reload = true): void {
  const box = document.getElementById('fatal')!;
  document.getElementById('fatal-title')!.textContent = title;
  document.getElementById('fatal-text')!.textContent = text;
  const btn = document.getElementById('fatal-reload') as HTMLButtonElement;
  btn.hidden = !reload;
  btn.onclick = () => location.reload();
  box.hidden = false;
  document.getElementById('loader')?.classList.add('done');
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

function progress(pct: number, text: string): Promise<void> {
  (document.getElementById('loader-fill') as HTMLElement).style.width = `${pct}%`;
  document.getElementById('loader-text')!.textContent = text;
  // İki kare bekle ki yükleme çubuğu ağır adımdan önce boyansın
  return nextFrame().then(nextFrame);
}

/** URL parçası: #koltuk=112-14-23&etkinlik=mac */
function readHash(): { seat: string | null; event: string | null } {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  return { seat: p.get('koltuk'), event: p.get('etkinlik') };
}

async function boot(): Promise<void> {
  if (!isWebGLAvailable()) {
    fatal('WebGL desteklenmiyor', 'Tarayıcın ya da cihazın 3B grafik (WebGL) desteklemiyor. Güncel bir Chrome, Edge, Firefox ya da Safari ile tekrar dene; donanım hızlandırmanın açık olduğundan emin ol.', false);
    return;
  }
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const quality: Quality = detectQuality();
  let kit: SceneKit;
  try {
    kit = createSceneKit(canvas, quality);
  } catch {
    fatal('3B sahne başlatılamadı', 'Grafik bağlamı oluşturulamadı. Sekmeyi yenilemeyi ya da başka bir tarayıcı kullanmayı dene.');
    return;
  }

  await progress(18, 'Koltuklar yerleştiriliyor…');
  const seats = generateSeats(venue);
  const saved = loadSaved();
  const hash = readHash();
  const store = new Store({
    mode: 'intro',
    selectedSeat: -1,
    hoverSeat: -1,
    eventId: hash.event ?? 'mac',
    phase: 'countdown',
    countdown: venue.flow.countdownSeconds,
    filter: { tier: -1, priceMin: seats.priceMin, priceMax: seats.priceMax },
    tickets: saved.tickets.filter((t) => findSeatById(seats, t.seat) >= 0),
    favorites: saved.favorites.filter((f) => findSeatById(seats, f) >= 0),
    soundOn: saved.soundOn,
    volume: saved.volume,
    quality,
    online: 0,
    link: 'local',
    videoUrl: new URLSearchParams(location.search).get('video') ?? '',
  } satisfies AppState);

  await progress(40, 'Tribünler kuruluyor…');
  const stadium = buildStadium(venue, seats, quality);
  kit.scene.add(stadium.group);
  await progress(62, 'Seyirciler yerlerini alıyor…');
  const field = new SeatField(seats, quality);
  kit.scene.add(field.group);
  const cam = new CameraController(kit.camera, venue, seats);
  const picker = new Picker(kit.camera, field, stadium.occluders);
  const audio = new AudioEngine();
  audio.setEnabled(store.get('soundOn'));
  audio.setVolume(store.get('volume'));

  // ---------- Koltuk durumu ----------
  let mineSet = new Set<number>();
  let peerTaken = new Set<number>();
  const seatState = (i: number): SeatState => (mineSet.has(i) ? 'mine' : seats.taken[i] || peerTaken.has(i) ? 'taken' : 'free');
  const isFree = (i: number): boolean => seatState(i) === 'free';
  const matchesFilter = (i: number, f: Filter): boolean => (f.tier < 0 || seats.tier[i] === f.tier) && seats.price[i] >= f.priceMin && seats.price[i] <= f.priceMax;

  let previewDirty = false;
  let previewRevealAt = 0;

  // ---------- Etkinlik katmanı ----------
  await progress(80, 'Etkinlik hazırlanıyor…');
  const onCue = (c: CrowdCue): void => {
    switch (c.type) {
      case 'goal':
        field.cheerAll(1, 6.5);
        audio.cue('goal');
        ui.toast(`GOL! ${c.team === 0 ? venue.events.match.home.name : venue.events.match.away.name}`);
        break;
      case 'applause':
        field.cheerAll(0.3, 2.6);
        audio.cue('applause', 0.8);
        break;
      case 'cheer':
        field.cheerAll(0.7, 3.2);
        audio.cue('cheer', 0.9);
        break;
      case 'ooh':
        audio.cue('ooh');
        break;
      case 'whistle':
        audio.cue('whistle');
        break;
    }
  };
  const director = new EventDirector(venue, store, quality, stadium.scoreboard, {
    cue: onCue,
    music: (on, bpm) => audio.music(on, bpm),
    houseLights: (level) => stadium.setHouseLights(level),
    focus: (v) => cam.setFocus(v.x, v.y, v.z),
    phaseChanged: (phase) => {
      audio.setLive(phase === 'live' ? 1 : phase === 'finished' ? 0.55 : 0.4);
      previewDirty = true;
    },
  });
  kit.scene.add(director.group);

  // ---------- Önizleme (koltuktan görünüm) ----------
  const previewCam = new THREE.PerspectiveCamera(62, 16 / 9, 0.2, 5000);

  function renderPreview(ui: UI): void {
    const seat = store.get('selectedSeat');
    if (seat < 0) return;
    const pr = kit.renderer.getPixelRatio();
    const target = ui.previewCanvas;
    const w = Math.min(target.width, canvas.width);
    const h = Math.min(target.height, canvas.height);
    cam.poseSeatCamera(previewCam, seat);
    previewCam.updateMatrixWorld();
    const pins = field.pinsVisible;
    field.pinsVisible = false;
    field.setHover(-1);
    field.update(0, time, previewCam);
    // Ana canvas'ın köşesine çiz, 2B canvas'a kopyala; ana kare hemen üstüne çizilir.
    kit.renderer.setViewport(0, 0, w / pr, h / pr);
    kit.renderer.setScissor(0, 0, w / pr, h / pr);
    kit.renderer.setScissorTest(true);
    kit.renderer.render(kit.scene, previewCam);
    kit.renderer.setScissorTest(false);
    kit.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    target.getContext('2d')!.drawImage(canvas, 0, canvas.height - h, w, h, 0, 0, target.width, target.height);
    field.pinsVisible = pins;
  }

  // ---------- Eylemler ----------
  const persist = (): void => {
    try {
      const data: Saved = { tickets: store.get('tickets'), favorites: store.get('favorites'), soundOn: store.get('soundOn'), volume: store.get('volume') };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* depolama kapalı olabilir */
    }
  };

  const writeHash = (): void => {
    const seat = store.get('selectedSeat');
    const parts = [`etkinlik=${store.get('eventId')}`];
    if (seat >= 0) parts.unshift(`koltuk=${seatId(seats, seat)}`);
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}#${parts.join('&')}`);
    } catch {
      /* file:// altında bazı tarayıcılar izin vermez */
    }
  };

  function arriveAtSeat(): void {
    store.set({ mode: 'seat' });
    audio.setPresence(1);
  }

  /** Seçimi yap ve kamerayı koltuğa indir. Dolu koltukta aynı sıradaki en yakın boş koltuğa yönlendirir. */
  function goToSeat(target: number): void {
    if (target < 0 || cam.locked) return;
    let seat = target;
    if (seatState(seat) === 'taken') {
      const alt = nearestFreeInRow(seats, seat, isFree);
      if (alt < 0) {
        ui.toast('Bu koltuk dolu ve sırada boş koltuk kalmadı.', 'info');
        return;
      }
      ui.toast(`Bu koltuk dolu — aynı sıradaki en yakın boş koltuk gösteriliyor (Koltuk ${seats.num[alt]}).`, 'info', 4200);
      seat = alt;
    }
    const mode = store.get('mode');
    if (mode === 'seat' && seat === cam.currentSeat) {
      store.set({ selectedSeat: seat });
      return;
    }
    store.set({ selectedSeat: seat, hoverSeat: -1 });
    field.setCrowd(true, seat);
    if (mode === 'seat') {
      const a = cam.currentSeat;
      const near = Math.hypot(seats.pos[a * 3] - seats.pos[seat * 3], seats.pos[a * 3 + 1] - seats.pos[seat * 3 + 1], seats.pos[a * 3 + 2] - seats.pos[seat * 3 + 2]) < 8;
      if (near) {
        cam.hopToSeat(seat);
        return;
      }
    }
    store.set({ mode: 'flying' });
    field.pinsVisible = false;
    cam.flyToSeat(seat, arriveAtSeat);
  }

  const actions: Actions = {
    goToSeat,
    backToStadium() {
      if (store.get('mode') !== 'seat' || cam.locked) return;
      store.set({ mode: 'flying' });
      audio.setPresence(0.35);
      cam.flyToOrbit(() => {
        field.setCrowd(false, -1);
        field.pinsVisible = true;
        store.set({ mode: 'orbit' });
      });
    },
    suggestSeat() {
      const f = store.get('filter');
      let best = -1;
      for (let i = 0; i < seats.count; i++) {
        if (!isFree(i) || !matchesFilter(i, f)) continue;
        if (best < 0 || seats.score[i] > seats.score[best] || (seats.score[i] === seats.score[best] && seats.price[i] < seats.price[best])) best = i;
      }
      if (best < 0) ui.toast('Bu filtreyle eşleşen boş koltuk yok.', 'info');
      else goToSeat(best);
    },
    buySeat() {
      const seat = store.get('selectedSeat');
      if (seat < 0 || !isFree(seat)) return;
      const tickets = store.get('tickets');
      if (tickets.length >= MAX_TICKETS) {
        ui.toast(`En fazla ${MAX_TICKETS} koltuk alabilirsin. Önce birini bırak.`, 'info');
        return;
      }
      const id = seatId(seats, seat);
      const code = `SYR-${id.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      store.set({ tickets: [...tickets, { seat: id, event: store.get('eventId'), code, ts: Date.now() }] });
      audio.cue('applause', 0.6);
      field.exciteBlock(seats.block[seat], 0.6, 2.2);
      ui.showTicket(id);
      sync.beat();
    },
    refund(id) {
      store.set({ tickets: store.get('tickets').filter((t) => t.seat !== id) });
      ui.toast('Koltuk bırakıldı.', 'info');
      sync.beat();
    },
    toggleFavorite() {
      const seat = store.get('selectedSeat');
      if (seat < 0) return;
      const id = seatId(seats, seat);
      const favs = store.get('favorites');
      const has = favs.includes(id);
      store.set({ favorites: has ? favs.filter((f) => f !== id) : [...favs, id].slice(-24) });
      ui.toast(has ? 'Favorilerden çıkarıldı.' : 'Favorilere eklendi.', 'info', 1800);
    },
    removeFavorite(id) {
      store.set({ favorites: store.get('favorites').filter((f) => f !== id) });
    },
    share() {
      writeHash();
      const url = location.href;
      const done = (): void => ui.toast('Koltuk bağlantısı kopyalandı. Açan kişi doğrudan bu koltuğa iner.', 'info');
      const fallback = (): void => {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (ok) done();
        else ui.toast(url, 'info', 6000);
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, fallback);
      else fallback();
    },
    focusBlock(block: Block) {
      if (store.get('mode') !== 'orbit' || cam.locked) return;
      cam.focusAngle(block.angleMid, block.tier);
      ui.toast(`Blok ${block.id} · ${seats.tiers[block.tier].config.name}`, 'info', 1600);
    },
    resetCamera() {
      cam.reset();
    },
    zoom(delta) {
      cam.zoom(delta);
    },
    setEvent(id) {
      if (id === store.get('eventId')) return;
      director.setEvent(id);
      if (store.get('videoUrl') && director.source.setMedia) actions.applyVideo(store.get('videoUrl'));
    },
    startDemo() {
      audio.unlock();
      director.startDemo();
      ui.toast('Demo: etkinlik birkaç saniye içinde başlıyor.', 'info', 2200);
    },
    setSound(on) {
      store.set({ soundOn: on });
      if (on) audio.unlock();
      audio.setEnabled(on);
    },
    setVolume(v) {
      store.set({ volume: v });
      audio.setVolume(v);
      if (v > 0 && !store.get('soundOn')) actions.setSound(true);
    },
    setFilter(f) {
      store.set({ filter: f });
    },
    neighbor(dx, dy) {
      if (store.get('mode') !== 'seat' || cam.locked) return;
      const cur = cam.currentSeat;
      let next = -1;
      if (dx !== 0) {
        // Koltuk numarası yönü ile ekran yönü farklı olabilir: kameranın sağına göre çöz.
        const plus = neighborSeat(seats, cur, 1, 0);
        const sign = plus >= 0 ? cam.sideOf(cur, plus) : -cam.sideOf(cur, neighborSeat(seats, cur, -1, 0));
        next = neighborSeat(seats, cur, dx * sign, 0);
      } else {
        next = neighborSeat(seats, cur, 0, dy);
      }
      if (next < 0) {
        ui.toast(dy !== 0 ? 'Bu yönde başka sıra yok.' : 'Bu yönde koltuk yok.', 'info', 1500);
        return;
      }
      store.set({ selectedSeat: next });
      field.setCrowd(true, next);
      cam.hopToSeat(next);
    },
    react(kind) {
      const seat = cam.inSeat ? cam.currentSeat : -1;
      if (seat < 0) return;
      const now = performance.now();
      if (now - lastReaction < 700) return;
      lastReaction = now;
      const block = seats.block[seat];
      playReaction(kind, block, 1);
      sync.react(kind, block);
    },
    applyVideo(url) {
      const src = director.source;
      if (!src.setMedia) return;
      store.set({ videoUrl: url });
      void src.setMedia(url).then((ok) => {
        if (!url) ui.toast('Dev ekran varsayılan içeriğe döndü.', 'info');
        else if (ok) ui.toast('Video dev ekrana bağlandı.', 'info');
        else {
          store.set({ videoUrl: '' });
          ui.toast('Video yüklenemedi (adres ya da CORS izni). Varsayılan içerik gösteriliyor.', 'info', 4500);
        }
      });
    },
    seatState,
    matchCount() {
      const f = store.get('filter');
      let n = 0;
      for (let i = 0; i < seats.count; i++) if (isFree(i) && matchesFilter(i, f)) n++;
      return n;
    },
  };

  let lastReaction = 0;
  function playReaction(kind: ReactionKind, block: number, intensity: number): void {
    if (kind === 'wave') {
      field.startWave(block);
      audio.cue('wave', intensity);
    } else if (kind === 'cheer') {
      field.exciteBlock(block, 1, 3.4);
      audio.cue('cheer', intensity);
    } else {
      field.exciteBlock(block, 0.42, 2.6);
      audio.cue('applause', intensity);
    }
  }

  // Bilet → koltuk durumu: arayüz dinleyicilerinden önce güncellenmeli
  store.on(
    'tickets',
    (tickets) => {
      mineSet = new Set(tickets.map((t) => findSeatById(seats, t.seat)).filter((s) => s >= 0));
      field.setMine([...mineSet]);
      persist();
    },
    true,
  );

  const ui = new UI(store, venue, seats, director.sources, actions);

  // ---------- Eş zamanlılık ----------
  const sync = new Sync({
    self: () => ({
      seat: cam.inSeat && cam.currentSeat >= 0 ? seatId(seats, cam.currentSeat) : null,
      event: store.get('eventId'),
      claims: store.get('tickets').map((t) => t.seat),
    }),
    peersChanged(peers: Peer[]) {
      const taken = new Set<number>();
      const pins: number[] = [];
      for (const p of peers) {
        for (const c of p.claims) {
          const s = findSeatById(seats, c);
          if (s >= 0 && !mineSet.has(s)) taken.add(s);
        }
        const here = p.seat ? findSeatById(seats, p.seat) : -1;
        if (here >= 0) pins.push(here);
        else if (p.claims[0]) {
          const s = findSeatById(seats, p.claims[0]);
          if (s >= 0) pins.push(s);
        }
      }
      peerTaken = taken;
      field.setPeers(pins);
      store.set({ online: peers.length });
      // Seçili koltuğun durumu değişmiş olabilir: kartı tazele
      store.set({ tickets: [...store.get('tickets')] });
    },
    reaction(kind, block) {
      const mine = cam.inSeat && cam.currentSeat >= 0 && seats.block[cam.currentSeat] === block;
      playReaction(kind, block, mine ? 0.85 : 0.4);
    },
    linkChanged(link) {
      store.set({ link });
    },
  });

  // ---------- Durum → sahne ----------
  store.on('selectedSeat', (seat) => {
    field.setSelected(seat);
    writeHash();
    if (seat >= 0) {
      previewDirty = true;
      previewRevealAt = performance.now() + 420;
      ui.previewPending();
    }
    sync.beat();
  });
  store.on('eventId', () => writeHash());
  store.on('hoverSeat', (seat) => {
    field.setHover(seat);
    canvas.classList.toggle('pointing', seat >= 0);
  });
  store.on('filter', (f) => field.setFilter((i) => matchesFilter(i, f)));
  store.on('favorites', persist);
  store.on('soundOn', persist);
  store.on('volume', persist);
  store.on('mode', () => sync.beat());

  // ---------- Girdi ----------
  let hoverX = 0;
  let hoverY = 0;
  let hoverPending = false;
  const detach = attachPointer(canvas, {
    onDrag(dx, dy) {
      canvas.classList.add('grabbing');
      if (cam.inSeat) cam.look(dx, dy);
      else cam.rotate(dx, dy);
    },
    onZoom(delta) {
      cam.zoom(delta);
    },
    onHover(x, y) {
      hoverX = x;
      hoverY = y;
      hoverPending = true;
    },
    onHoverEnd() {
      hoverPending = false;
      store.set({ hoverSeat: -1 });
      ui.hideTooltip();
    },
    onTap(x, y, touch) {
      audio.unlock();
      if (store.get('mode') !== 'orbit' || cam.locked) return;
      const seat = picker.at(x, y, true);
      if (seat >= 0 && field.matches(seat)) goToSeat(seat);
      else if (seat >= 0 && !touch) ui.toast('Bu koltuk filtre dışında. Filtreyi genişlet.', 'info', 1800);
    },
  });
  canvas.addEventListener('pointerup', () => canvas.classList.remove('grabbing'));
  canvas.addEventListener('pointercancel', () => canvas.classList.remove('grabbing'));
  // Tarayıcı ses politikası: ilk etkileşimde ses bağlamını aç
  const unlockOnce = (): void => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce);
  window.addEventListener('keydown', unlockOnce);

  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (ui.dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'svg')) return;
    const onButton = !!t && (t.tagName === 'BUTTON' || t.tagName === 'A');
    const seatMode = store.get('mode') === 'seat';
    switch (e.key) {
      case 'ArrowLeft':
        if (seatMode) actions.neighbor(-1, 0);
        else cam.rotate(60, 0);
        break;
      case 'ArrowRight':
        if (seatMode) actions.neighbor(1, 0);
        else cam.rotate(-60, 0);
        break;
      case 'ArrowUp':
        if (seatMode) actions.neighbor(0, 1);
        else cam.rotate(0, 40);
        break;
      case 'ArrowDown':
        if (seatMode) actions.neighbor(0, -1);
        else cam.rotate(0, -40);
        break;
      case '+':
      case '=':
        cam.zoom(0.1);
        break;
      case '-':
      case '_':
        cam.zoom(-0.1);
        break;
      case '0':
        cam.reset();
        break;
      case 'Escape':
        actions.backToStadium();
        break;
      case 'm':
      case 'M':
        if (onButton) return;
        actions.setSound(!store.get('soundOn'));
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // ---------- WebGL bağlam kaybı ----------
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
    fatal('Grafik bağlamı kaybedildi', 'Tarayıcı 3B sahneyi geçici olarak durdurdu (bellek ya da sürücü). Birkaç saniye içinde kendiliğinden geri gelebilir; gelmezse sayfayı yeniden yükle.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    document.getElementById('fatal')!.hidden = true;
    last = performance.now();
    requestAnimationFrame(frame);
  });

  // ---------- Kare döngüsü ----------
  let time = 0;
  let last = performance.now();
  let emaMs = 16;
  let slowFor = 0;
  let warmup = 4;
  let ambientIn = 6;
  let currentQuality = quality;
  const fwd = new THREE.Vector3();
  // Telefonda panel açıkken sahne, panelin üstünde kalan görünür alana ortalanır.
  const panels = document.getElementById('panels')!;
  const phoneLayout = matchMedia('(max-width: 760px)');
  let panelHeight = 0;
  let viewShift = 0;
  let appliedShift = 0;
  const measurePanel = (): void => {
    panelHeight = phoneLayout.matches ? panels.offsetHeight : 0;
    appliedShift = -1;
  };
  new ResizeObserver(measurePanel).observe(panels);
  window.addEventListener('resize', measurePanel);
  const stats = { fps: 60, frameMs: 16, calls: 0, triangles: 0, quality };
  let probeResolve: ((distinct: number) => void) | null = null;

  function frame(now: number): void {
    if (contextLost) return;
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    // Sekme arka plandan dönünce zaman sıçramasın
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    time += dt;

    director.update(dt);
    cam.update(dt);
    const shiftTarget = store.get('mode') === 'intro' ? 0 : Math.max(0, panelHeight - 70) / 2;
    viewShift += (shiftTarget - viewShift) * Math.min(1, dt * 9);
    if (Math.abs(shiftTarget - viewShift) < 0.5) viewShift = shiftTarget;
    if (Math.round(viewShift) !== appliedShift) {
      appliedShift = Math.round(viewShift);
      if (appliedShift === 0) kit.camera.clearViewOffset();
      else kit.camera.setViewOffset(window.innerWidth, window.innerHeight, 0, appliedShift, window.innerWidth, window.innerHeight);
    }
    stadium.update(dt, time);

    if (hoverPending && store.get('mode') === 'orbit' && !cam.locked) {
      hoverPending = false;
      const seat = picker.at(hoverX, hoverY, false);
      const ok = seat >= 0 && field.matches(seat);
      store.set({ hoverSeat: ok ? seat : -1 });
      if (ok) ui.showTooltip(seat, hoverX, hoverY);
      else ui.hideTooltip();
    }

    // Sahte seyirci hareketi: tribün her zaman canlı kalsın
    ambientIn -= dt;
    if (ambientIn <= 0) {
      ambientIn = store.get('phase') === 'live' ? 3 + Math.random() * 5 : 7 + Math.random() * 9;
      const block = Math.floor(Math.random() * seats.blocks.length);
      field.exciteBlock(block, 0.35 + Math.random() * 0.35, 1.8 + Math.random() * 1.6);
      if (cam.inSeat && seats.block[cam.currentSeat] === block) audio.cue('applause', 0.35);
    }

    if (previewDirty && !document.hidden) {
      previewDirty = false;
      renderPreview(ui);
    }
    if (previewRevealAt && now >= previewRevealAt) {
      previewRevealAt = 0;
      ui.previewReady();
    }

    field.update(dt, time, kit.camera);
    kit.renderer.render(kit.scene, kit.camera);
    if (probeResolve) {
      // Test kancası: çizilen karede kaç farklı renk var? (boş canvas tespiti)
      const gl = kit.renderer.getContext();
      const px = new Uint8Array(4);
      const seen = new Set<number>();
      for (let gy = 1; gy < 12; gy++) {
        for (let gx = 1; gx < 12; gx++) {
          gl.readPixels(Math.floor((canvas.width * gx) / 12), Math.floor((canvas.height * gy) / 12), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          seen.add((px[0] << 16) | (px[1] << 8) | px[2]);
        }
      }
      probeResolve(seen.size);
      probeResolve = null;
    }

    kit.camera.getWorldDirection(fwd);
    ui.updateCamera(kit.camera.position.x, kit.camera.position.z, fwd.x, fwd.z, cam.zoomLevel);
    ui.tick(director.status, store.get('phase'), store.get('countdown'));

    // Kare süresi ölçümü ve otomatik kalite düşürme
    if (!document.hidden && rawDt < 1.5) {
      emaMs += (Math.min(rawDt, 0.3) * 1000 - emaMs) * 0.06;
      stats.frameMs = emaMs;
      stats.fps = 1000 / emaMs;
      stats.calls = kit.renderer.info.render.calls;
      stats.triangles = kit.renderer.info.render.triangles;
      if (warmup > 0) warmup -= rawDt;
      else if (emaMs > 27 && currentQuality !== 'low') {
        slowFor += rawDt;
        if (slowFor > 2.5) {
          currentQuality = currentQuality === 'high' ? 'medium' : 'low';
          stats.quality = currentQuality;
          store.set({ quality: currentQuality });
          kit.setQuality(currentQuality);
          field.setQuality(currentQuality);
          slowFor = 0;
          warmup = 2;
        }
      } else slowFor = 0;
    }
  }

  // ---------- Test ve hata ayıklama kancası ----------
  const v3 = new THREE.Vector3();
  const api = {
    ready: false,
    scene: kit.scene,
    camera: () => ({ pos: kit.camera.position.toArray(), dir: kit.camera.getWorldDirection(new THREE.Vector3()).toArray(), fov: kit.camera.fov, zoom: cam.zoomLevel }),
    probe: () => new Promise<number>((resolve) => (probeResolve = resolve)),
    audio: () => audio.info,
    /** Kamera ve görünüm kayması durgun mu? (testler tıklamadan önce bekler) */
    stable: () => !cam.locked && viewShift === Math.max(0, panelHeight - 70) / 2,
    /** Canlı evreyi ileri sarar (testler bitiş durumunu beklemeden görsün). */
    fastForward: (seconds: number) => director.fastForward(seconds),
    state: () => ({ ...store.snapshot, seatId: store.get('selectedSeat') >= 0 ? seatId(seats, store.get('selectedSeat')) : null, locked: cam.locked }),
    stats,
    status: () => director.status,
    seatInfo: (i: number) => ({ id: seatId(seats, i), taken: seatState(i) === 'taken', block: seats.blocks[seats.block[i]].id, tier: seats.tier[i], price: seats.price[i], score: seats.score[i] }),
    /** Ekranda görünen, tıklanabilir bir koltuk bulur (dolu ya da boş). */
    findClickable(taken: boolean): { seat: number; id: string; x: number; y: number } | null {
      kit.camera.updateMatrixWorld();
      for (let n = 0; n < seats.count; n += 17) {
        const i = (n * 7919) % seats.count;
        if ((seatState(i) === 'taken') !== taken || seatState(i) === 'mine' || !field.matches(i)) continue;
        field.seatPosition(i, v3).y += 0.55;
        v3.project(kit.camera);
        if (v3.z > 1 || Math.abs(v3.x) > 0.9 || Math.abs(v3.y) > 0.9) continue;
        const x = Math.round(((v3.x + 1) / 2) * window.innerWidth);
        const y = Math.round(((1 - v3.y) / 2) * window.innerHeight);
        if (document.elementFromPoint(x, y) !== canvas) continue;
        if (picker.at(x, y, false) === i) return { seat: i, id: seatId(seats, i), x, y };
      }
      return null;
    },
  };
  (window as unknown as { __seyir: typeof api }).__seyir = api;

  // ---------- Açılış ----------
  await progress(100, 'Hazır');
  kit.renderer.compile(kit.scene, kit.camera);
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
  document.getElementById('loader')!.classList.add('done');
  window.setTimeout(() => document.getElementById('loader')?.remove(), 800);
  if (store.get('videoUrl') && director.source.setMedia) actions.applyVideo(store.get('videoUrl'));
  cam.playIntro(() => {
    store.set({ mode: 'orbit' });
    api.ready = true;
    // Paylaşılan bağlantı: doğrudan o koltuğa in
    const linked = hash.seat ? findSeatById(seats, hash.seat) : -1;
    if (linked >= 0) goToSeat(linked);
    else if (hash.seat) ui.toast('Bağlantıdaki koltuk bulunamadı.', 'info');
  });

  window.addEventListener('pagehide', (e) => {
    detach();
    sync.dispose();
    audio.dispose();
    if (!e.persisted) {
      // Sayfa gerçekten kapanıyor: GPU kaynaklarını bırak
      contextLost = true;
      director.dispose();
      field.dispose();
      stadium.dispose();
      kit.dispose();
    }
  });
  // Geri/ileri önbelleğinden dönülürse bağlantılar kapalıdır: temiz başlat
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });
}

void boot().catch((err: unknown) => {
  console.error(err);
  fatal('Beklenmeyen bir hata', 'Uygulama başlatılırken bir sorun oluştu. Sayfayı yeniden yüklemeyi dene.');
});
