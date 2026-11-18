import type { VenueConfig } from '../config/venue';
import { formatClock } from '../core/format';
import type { Filter, Phase, Store, Ticket } from '../core/store';
import { findSeatById, seatId, type Block, type SeatData } from '../data/seats';
import type { EventSource, EventStatus } from '../events/types';
import type { ReactionKind } from '../net/sync';
import { hydrateIcons, icon, setIcon } from './icons';
import { BlockMap, CameraMap } from './maps';

export type SeatState = 'free' | 'taken' | 'mine';

/** Arayüzün tetiklediği uygulama eylemleri (main.ts uygular). */
export interface Actions {
  selectSeat(seat: number): void;
  goToSeat(seat: number): void;
  backToStadium(): void;
  suggestSeat(): void;
  buySeat(): void;
  refund(seat: string): void;
  toggleFavorite(): void;
  removeFavorite(seat: string): void;
  share(): void;
  focusBlock(block: Block): void;
  resetCamera(): void;
  zoom(delta: number): void;
  setEvent(id: string): void;
  startDemo(): void;
  setSound(on: boolean): void;
  setVolume(v: number): void;
  setFilter(f: Filter): void;
  neighbor(dx: number, dy: number): void;
  react(kind: ReactionKind): void;
  applyVideo(url: string): void;
  seatState(seat: number): SeatState;
  matchCount(): number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} bulunamadı`);
  return node as T;
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class UI {
  readonly previewCanvas = $<HTMLCanvasElement>('seat-preview');
  private readonly root = $('ui');
  private readonly tooltip = $('tooltip');
  private readonly dialog = $<HTMLDialogElement>('dlg');
  private readonly blockMap: BlockMap;
  private readonly camMap: CameraMap;
  private readonly money: (v: number) => string;
  private last: EventStatus & { phase: string } = { clock: '', headline: '', detail: '', phase: '' };
  private camTick = 0;
  private dialogKind: 'none' | 'favs' | 'tickets' | 'ticket' | 'help' = 'none';

  constructor(
    private readonly store: Store,
    private readonly venue: VenueConfig,
    private readonly data: SeatData,
    private readonly sources: EventSource[],
    private readonly actions: Actions,
  ) {
    hydrateIcons();
    this.money = (v) => `${venue.currency === 'EUR' ? '€' : `${venue.currency} `}${v}`;
    this.blockMap = new BlockMap(document.getElementById('blockmap') as unknown as SVGSVGElement, venue, data, (b) => actions.focusBlock(b));
    this.camMap = new CameraMap(document.getElementById('cammap') as unknown as SVGSVGElement, venue, data);
    this.bindTopbar();
    this.bindEventCard();
    this.bindFilters();
    this.bindCamera();
    this.bindSeatCard();
    this.bindSeatbar();
    this.bindSheet();
    this.bindDialog();

    store.on('mode', (mode) => {
      this.root.dataset.mode = mode;
      $('hint-text').textContent = mode === 'seat' ? 'Etrafa bakmak için sürükle' : 'Etkinliği oradan görmek için bir koltuğa tıkla';
      if (mode === 'seat' || mode === 'flying') this.setSheet(false);
      if (mode !== 'orbit') this.hideTooltip();
      this.renderSeat();
    }, true);
    store.on('selectedSeat', (seat) => {
      this.blockMap.setSeat(seat);
      $('map-selected').textContent = seat >= 0 ? `Blok ${data.blocks[data.block[seat]].id}` : '—';
      this.renderSeat();
      if (seat >= 0 && matchMedia('(max-width: 760px)').matches && store.get('mode') === 'orbit') this.setSheet(true, 'seat');
    }, true);
    store.on('tickets', () => {
      this.renderCounts();
      this.renderSeat();
      this.blockMap.setMine(this.mySeats());
      if (this.dialogKind === 'tickets') this.showTickets();
    }, true);
    store.on('favorites', () => {
      this.renderCounts();
      this.renderSeat();
      if (this.dialogKind === 'favs') this.showFavorites();
    });
    store.on('soundOn', (on) => {
      for (const id of ['btn-sound', 'btn-sound2']) {
        const b = $(id);
        b.setAttribute('aria-pressed', String(on));
        setIcon(b, on ? 'sound' : 'mute');
      }
    }, true);
    store.on('volume', (v) => {
      $<HTMLInputElement>('volume').value = String(Math.round(v * 100));
    }, true);
    store.on('eventId', () => this.renderEvent(), true);
    store.on('online', () => this.renderOnline(), true);
    store.on('link', () => this.renderOnline());
    store.on('filter', (f) => this.renderFilter(f), true);
  }

  private mySeats(): number[] {
    return this.store
      .get('tickets')
      .map((t) => findSeatById(this.data, t.seat))
      .filter((s) => s >= 0);
  }

  // ---------- Üst çubuk ----------

  private bindTopbar(): void {
    const host = $('menu-events');
    for (const src of this.sources) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill-btn';
      b.dataset.event = src.info.id;
      b.textContent = src.info.label;
      b.addEventListener('click', () => this.actions.setEvent(src.info.id));
      host.append(b);
    }
    $('logo').addEventListener('click', () => {
      if (this.store.get('mode') === 'seat') this.actions.backToStadium();
      else this.actions.resetCamera();
    });
    $('btn-demo').addEventListener('click', () => this.actions.startDemo());
    $('btn-help').addEventListener('click', () => this.showHelp());
    $('btn-sound').addEventListener('click', () => this.actions.setSound(!this.store.get('soundOn')));
    $('btn-favs').addEventListener('click', () => this.showFavorites());
    $('btn-tickets').addEventListener('click', () => this.showTickets());
  }

  private renderCounts(): void {
    const f = this.store.get('favorites').length;
    const t = this.store.get('tickets').length;
    $('fav-count').textContent = String(f);
    $('fav-count').dataset.n = String(f);
    $('ticket-count').textContent = String(t);
    $('ticket-count').dataset.n = String(t);
  }

  // ---------- Etkinlik kartı ----------

  private bindEventCard(): void {
    $<HTMLFormElement>('video-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.actions.applyVideo($<HTMLInputElement>('video-url').value.trim());
    });
  }

  private renderEvent(): void {
    const id = this.store.get('eventId');
    const src = this.sources.find((s) => s.info.id === id) ?? this.sources[0];
    $('ev-badge').textContent = src.info.badge;
    $('ev-title').textContent = src.info.title;
    $('ev-sub').textContent = src.info.subtitle;
    $('ev-date').textContent = src.info.date;
    $('ev-time').textContent = src.info.time;
    $('ev-venue').textContent = `${this.venue.name}, ${this.venue.city}`;
    $('video-form').hidden = !src.info.acceptsVideo;
    $<HTMLInputElement>('video-url').value = src.info.acceptsVideo ? this.store.get('videoUrl') : '';
    document.querySelectorAll<HTMLElement>('#menu-events .pill-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.event === id)));
  }

  private renderOnline(): void {
    const n = this.store.get('online');
    const ws = this.store.get('link') === 'ws';
    $('ev-online').dataset.live = String(n > 0);
    $('ev-online-text').textContent =
      n > 0 ? `${n + 1} seyirci çevrim içi · ${ws ? 'sunucu' : 'yerel sekmeler'}` : `Yalnızca sen çevrim içisin${ws ? ' · sunucuya bağlı' : ''}`;
  }

  /** Her karede çağrılır; yalnızca değişen metinler DOM'a yazılır. */
  tick(status: EventStatus, phase: Phase, countdown: number): void {
    const phaseText = phase === 'live' ? 'CANLI' : phase === 'finished' ? 'BİTTİ' : `GERİ SAYIM ${formatClock(countdown)}`;
    if (phaseText !== this.last.phase) {
      this.last.phase = phaseText;
      const elPhase = $('ev-phase');
      elPhase.textContent = phaseText;
      elPhase.dataset.phase = phase;
      $('btn-demo').lastElementChild!.textContent = phase === 'finished' ? 'Tekrar' : 'Demo';
    }
    if (status.headline !== this.last.headline) $('ev-headline').textContent = this.last.headline = status.headline;
    if (status.clock !== this.last.clock) $('ev-clock').textContent = this.last.clock = status.clock;
    if (status.detail !== this.last.detail) $('ev-detail').textContent = this.last.detail = status.detail;
  }

  // ---------- Filtreler ve blok haritası ----------

  private bindFilters(): void {
    const seg = $('filter-tier');
    const names = ['Tümü', ...this.data.tiers.map((t) => t.config.name.split(/[\s·]/)[0])];
    names.forEach((name, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.dataset.tier = String(i - 1);
      b.addEventListener('click', () => this.actions.setFilter({ ...this.store.get('filter'), tier: i - 1 }));
      seg.append(b);
    });
    const min = $<HTMLInputElement>('price-min');
    const max = $<HTMLInputElement>('price-max');
    for (const input of [min, max]) {
      input.min = String(this.data.priceMin);
      input.max = String(this.data.priceMax);
      input.step = '5';
      input.addEventListener('input', () => {
        let lo = Number(min.value);
        let hi = Number(max.value);
        if (lo > hi) {
          if (input === min) hi = lo;
          else lo = hi;
        }
        this.actions.setFilter({ ...this.store.get('filter'), priceMin: lo, priceMax: hi });
      });
    }
  }

  private renderFilter(f: Filter): void {
    document.querySelectorAll<HTMLElement>('#filter-tier button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.tier) === f.tier)));
    $<HTMLInputElement>('price-min').value = String(f.priceMin);
    $<HTMLInputElement>('price-max').value = String(f.priceMax);
    $('price-label').textContent = `${this.money(f.priceMin)} – ${this.money(f.priceMax)}`;
    $('filter-count').textContent = `${this.actions.matchCount().toLocaleString('tr-TR')} boş koltuk eşleşiyor`;
    this.blockMap.setTierFilter(f.tier);
  }

  // ---------- Kamera kartı ----------

  private bindCamera(): void {
    $('cam-in').addEventListener('click', () => this.actions.zoom(0.14));
    $('cam-out').addEventListener('click', () => this.actions.zoom(-0.14));
    $('cam-reset').addEventListener('click', () => this.actions.resetCamera());
    if (matchMedia('(pointer: coarse)').matches) $('cam-hint').textContent = 'Sürükle: döndür · İki parmak: yakınlaş';
  }

  updateCamera(x: number, z: number, dirX: number, dirZ: number, zoom: number): void {
    if (++this.camTick % 3 !== 0) return;
    this.camMap.update(x, z, dirX, dirZ);
    const text = `%${Math.round(zoom * 100)}`;
    const tag = $('cam-zoom');
    if (tag.textContent !== text) tag.textContent = text;
  }

  // ---------- Koltuk kartı ----------

  private bindSeatCard(): void {
    $('btn-suggest').addEventListener('click', () => this.actions.suggestSeat());
    $('btn-buy').addEventListener('click', () => {
      const seat = this.store.get('selectedSeat');
      if (seat >= 0 && this.actions.seatState(seat) === 'mine') this.showTicket(seatId(this.data, seat));
      else this.actions.buySeat();
    });
    $('btn-go').addEventListener('click', () => {
      if (this.store.get('mode') === 'seat') this.actions.backToStadium();
      else this.actions.goToSeat(this.store.get('selectedSeat'));
    });
    $('btn-fav').addEventListener('click', () => this.actions.toggleFavorite());
    $('btn-share').addEventListener('click', () => this.actions.share());
  }

  private renderSeat(): void {
    const seat = this.store.get('selectedSeat');
    $('seat-empty').hidden = seat >= 0;
    $('seat-body').hidden = seat < 0;
    if (seat < 0) return;
    const d = this.data;
    const block = d.blocks[d.block[seat]];
    const tier = d.tiers[d.tier[seat]].config;
    const state = this.actions.seatState(seat);
    const id = seatId(d, seat);
    const fav = this.store.get('favorites').includes(id);
    const status = $('seat-status');
    status.dataset.state = state;
    status.textContent = state === 'mine' ? 'Senin koltuğun' : state === 'taken' ? 'Dolu' : 'Boş · Satışta';
    $('seat-block').textContent = `Blok ${block.id}`;
    $('seat-tier').textContent = `${tier.name} · ${block.side}`;
    $('seat-row').textContent = String(d.row[seat] + 1);
    $('seat-num').textContent = String(d.num[seat]);
    $('seat-price').textContent = this.money(d.price[seat]);
    $('seat-score').textContent = `%${d.score[seat]}`;
    $('seat-scorebar').style.width = `${d.score[seat]}%`;
    $('seat-perks').innerHTML = tier.perks.map((p) => `<li>${esc(p)}</li>`).join('');
    const buy = $<HTMLButtonElement>('btn-buy');
    buy.disabled = state === 'taken';
    buy.textContent = state === 'mine' ? 'Bileti göster' : state === 'taken' ? 'Koltuk dolu' : 'Koltuğu al';
    const inSeat = this.store.get('mode') === 'seat';
    const go = $<HTMLButtonElement>('btn-go');
    go.textContent = inSeat ? 'Stadyuma dön' : 'Koltuktan izle';
    go.disabled = this.store.get('mode') === 'flying' || this.store.get('mode') === 'intro';
    const favBtn = $('btn-fav');
    favBtn.setAttribute('aria-pressed', String(fav));
    favBtn.classList.toggle('toggle', true);
    favBtn.setAttribute('aria-label', fav ? 'Favorilerden çıkar' : 'Favorilere ekle');
  }

  /** Önizleme: kısa süre "görünüm hazırlanıyor", sonra dolar. */
  previewPending(): void {
    $('preview-wait').classList.remove('done');
  }

  previewReady(): void {
    $('preview-wait').classList.add('done');
  }

  // ---------- Koltuk araç çubuğu ----------

  private bindSeatbar(): void {
    $('btn-back').addEventListener('click', () => this.actions.backToStadium());
    $('nb-left').addEventListener('click', () => this.actions.neighbor(-1, 0));
    $('nb-right').addEventListener('click', () => this.actions.neighbor(1, 0));
    $('nb-up').addEventListener('click', () => this.actions.neighbor(0, 1));
    $('nb-down').addEventListener('click', () => this.actions.neighbor(0, -1));
    $('re-applause').addEventListener('click', () => this.actions.react('applause'));
    $('re-cheer').addEventListener('click', () => this.actions.react('cheer'));
    $('re-wave').addEventListener('click', () => this.actions.react('wave'));
    $('btn-sound2').addEventListener('click', () => this.actions.setSound(!this.store.get('soundOn')));
    $<HTMLInputElement>('volume').addEventListener('input', (e) => this.actions.setVolume(Number((e.target as HTMLInputElement).value) / 100));
  }

  // ---------- Telefon paneli ----------

  private bindSheet(): void {
    document.querySelectorAll<HTMLButtonElement>('.sheet-tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        const tab = b.dataset.tab!;
        const open = this.root.dataset.sheet === 'open';
        if (open && this.root.dataset.tab === tab) this.setSheet(false);
        else this.setSheet(true, tab);
      });
    });
    this.setSheet(false, 'seat');
  }

  setSheet(open: boolean, tab?: string): void {
    if (tab) this.root.dataset.tab = tab;
    this.root.dataset.sheet = open ? 'open' : 'closed';
    document.querySelectorAll<HTMLButtonElement>('.sheet-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === this.root.dataset.tab)));
  }

  // ---------- Tooltip ve bildirim ----------

  showTooltip(seat: number, x: number, y: number): void {
    const d = this.data;
    const taken = this.actions.seatState(seat) === 'taken';
    const mine = this.actions.seatState(seat) === 'mine';
    const line1 = `Blok ${d.blocks[d.block[seat]].id} · Sıra ${d.row[seat] + 1} · Koltuk ${d.num[seat]}`;
    const line2 = taken ? '<span class="taken">Dolu</span>' : `<span>${this.money(d.price[seat])} · Görüş %${d.score[seat]}${mine ? ' · Senin' : ''}</span>`;
    const html = `<b>${line1}</b>${line2}`;
    if (this.tooltip.dataset.seat !== String(seat)) {
      this.tooltip.dataset.seat = String(seat);
      this.tooltip.innerHTML = html;
    }
    this.tooltip.hidden = false;
    const w = this.tooltip.offsetWidth;
    const flipX = x + w + 24 > window.innerWidth;
    const flipY = y + 70 > window.innerHeight;
    this.tooltip.style.left = `${flipX ? x - w - 28 : x}px`;
    this.tooltip.style.top = `${flipY ? y - 64 : y}px`;
  }

  hideTooltip(): void {
    if (!this.tooltip.hidden) {
      this.tooltip.hidden = true;
      this.tooltip.dataset.seat = '';
    }
  }

  toast(text: string, kind: 'info' | 'accent' = 'accent', ms = 3200): void {
    const host = $('toasts');
    while (host.children.length >= 3) host.firstElementChild!.remove();
    const t = document.createElement('div');
    t.className = `toast ${kind === 'info' ? 'info' : ''}`;
    t.textContent = text;
    host.append(t);
    window.setTimeout(() => {
      t.classList.add('out');
      window.setTimeout(() => t.remove(), 320);
    }, ms);
  }

  // ---------- Diyaloglar ----------

  private bindDialog(): void {
    $('dlg-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => {
      this.dialogKind = 'none';
    });
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });
  }

  private openDialog(kind: typeof this.dialogKind, title: string, html: string): HTMLElement {
    $('dlg-title').textContent = title;
    const body = $('dlg-body');
    body.innerHTML = html;
    hydrateIcons(body);
    this.dialogKind = kind;
    if (!this.dialog.open) this.dialog.showModal();
    return body;
  }

  get dialogOpen(): boolean {
    return this.dialog.open;
  }

  closeDialog(): void {
    if (this.dialog.open) this.dialog.close();
  }

  private seatLine(id: string): string {
    const s = findSeatById(this.data, id);
    if (s < 0) return esc(id);
    const d = this.data;
    return `<b>Blok ${d.blocks[d.block[s]].id} · Sıra ${d.row[s] + 1} · Koltuk ${d.num[s]}</b><small>${esc(d.tiers[d.tier[s]].config.name)} · ${this.money(d.price[s])} · Görüş %${d.score[s]}</small>`;
  }

  showFavorites(): void {
    const favs = this.store.get('favorites');
    const html = favs.length
      ? `<ul class="list">${favs
          .map(
            (id) =>
              `<li><span>${this.seatLine(id)}</span><button class="btn btn-small btn-yellow" data-go="${esc(id)}" type="button">Git</button><button class="btn btn-small btn-icon" data-del="${esc(id)}" type="button" aria-label="Favoriden çıkar"><span data-icon="close"></span></button></li>`,
          )
          .join('')}</ul>`
      : '<p class="empty">Henüz favori koltuğun yok. Koltuk kartındaki kalp ile ekleyebilirsin.</p>';
    const body = this.openDialog('favs', 'Favoriler', html);
    body.querySelectorAll<HTMLElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        this.dialog.close();
        this.actions.goToSeat(findSeatById(this.data, b.dataset.go!));
      }),
    );
    body.querySelectorAll<HTMLElement>('[data-del]').forEach((b) => b.addEventListener('click', () => this.actions.removeFavorite(b.dataset.del!)));
  }

  showTickets(): void {
    const tickets = this.store.get('tickets');
    const html = tickets.length
      ? `<ul class="list">${tickets
          .map(
            (t) =>
              `<li><span>${this.seatLine(t.seat)}</span><button class="btn btn-small btn-yellow" data-go="${esc(t.seat)}" type="button">Koltuğuma git</button><button class="btn btn-small" data-show="${esc(t.seat)}" type="button">Bilet</button></li>`,
          )
          .join('')}</ul>`
      : '<p class="empty">Henüz koltuğun yok. Bir koltuk seçip “Koltuğu al” ile kendine ayırabilirsin.</p>';
    const body = this.openDialog('tickets', 'Koltuklarım', html);
    body.querySelectorAll<HTMLElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        this.dialog.close();
        this.actions.goToSeat(findSeatById(this.data, b.dataset.go!));
      }),
    );
    body.querySelectorAll<HTMLElement>('[data-show]').forEach((b) => b.addEventListener('click', () => this.showTicket(b.dataset.show!)));
  }

  /** Bilet kartı: blok, sıra, koltuk, etkinlik. */
  showTicket(seat: string): void {
    const ticket: Ticket | undefined = this.store.get('tickets').find((t) => t.seat === seat);
    const s = findSeatById(this.data, seat);
    if (!ticket || s < 0) return;
    const d = this.data;
    const src = this.sources.find((e) => e.info.id === ticket.event) ?? this.sources[0];
    const html = `
      <div class="ticket">
        <div class="ticket-main">
          <span class="badge badge-dark">${esc(src.info.badge)}</span>
          <h3>${esc(src.info.title)}</h3>
          <p class="muted small">${esc(src.info.date)} · ${esc(src.info.time)} · ${esc(this.venue.name)}</p>
          <dl class="ticket-grid">
            <div><dt>Blok</dt><dd>${d.blocks[d.block[s]].id}</dd></div>
            <div><dt>Sıra</dt><dd>${d.row[s] + 1}</dd></div>
            <div><dt>Koltuk</dt><dd>${d.num[s]}</dd></div>
            <div><dt>Kat</dt><dd style="font-size:13px">${esc(d.tiers[d.tier[s]].config.name)}</dd></div>
            <div><dt>Fiyat</dt><dd style="font-size:13px">${this.money(d.price[s])}</dd></div>
          </dl>
        </div>
        <div class="ticket-stub"><canvas id="ticket-code" width="27" height="60"></canvas><span>${esc(ticket.code)}</span></div>
      </div>
      <p class="help-note">Ödeme alınmadı; bu bir gösterim biletidir ve bu tarayıcıda saklanır.</p>
      <div class="ticket-actions">
        <button class="btn btn-yellow" id="ticket-go" type="button">Koltuğuma git</button>
        <button class="btn" id="ticket-refund" type="button">Koltuğu bırak</button>
      </div>`;
    const body = this.openDialog('ticket', 'Biletin', html);
    // Bilet kodundan türetilen şerit desen (gösterim amaçlı barkod)
    const cv = body.querySelector<HTMLCanvasElement>('#ticket-code')!;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 27, 60);
    g.fillStyle = '#14142b';
    let h = 0;
    for (const ch of ticket.code) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
    for (let y = 2; y < 58; ) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      const bar = 1 + (h >>> 30);
      if ((h >>> 8) & 1) g.fillRect(2, y, 23, bar);
      y += bar;
    }
    body.querySelector('#ticket-go')!.addEventListener('click', () => {
      this.dialog.close();
      this.actions.goToSeat(s);
    });
    body.querySelector('#ticket-refund')!.addEventListener('click', () => {
      this.dialog.close();
      this.actions.refund(seat);
    });
  }

  showHelp(): void {
    const html = `
      <div class="keys">
        <kbd>Sürükle</kbd><span>Stadyumu döndür / koltukta etrafa bak</span>
        <kbd>Tekerlek · iki parmak</kbd><span>Yakınlaş, uzaklaş</span>
        <kbd>Tık</kbd><span>Koltuğa uç ve etkinliği oradan izle</span>
        <kbd>← → ↑ ↓</kbd><span>Stadyumda döndür · koltukta komşu koltuğa geç</span>
        <kbd>+ −</kbd><span>Yakınlaş, uzaklaş</span>
        <kbd>Esc</kbd><span>Stadyuma dön</span>
        <kbd>0</kbd><span>Kamerayı sıfırla</span>
        <kbd>M</kbd><span>Sesi aç / kapat</span>
      </div>
      <p class="help-note">${icon('') }Görüş puanı; koltuğun sahaya uzaklığı, bakış yüksekliği ve orta sahaya göre açısından hesaplanır. Koltuk bağlantısını paylaşırsan açan kişi doğrudan o koltuğa iner.</p>`;
    this.openDialog('help', 'Nasıl kullanılır?', html);
  }
}
