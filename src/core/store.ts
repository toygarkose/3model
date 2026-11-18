/**
 * Tek merkezli uygulama durumu. 3D katman ve arayüz buradan beslenir;
 * değişiklikler anahtar bazlı dinleyicilere bildirilir.
 */
export type Mode = 'intro' | 'orbit' | 'flying' | 'seat';
export type Phase = 'countdown' | 'live' | 'finished';
export type Quality = 'high' | 'medium' | 'low';

export interface Ticket {
  seat: string;
  event: string;
  code: string;
  ts: number;
}

export interface Filter {
  /** -1 = tüm katlar. */
  tier: number;
  priceMin: number;
  priceMax: number;
}

export interface AppState {
  mode: Mode;
  /** Seçili koltuk indeksi, -1 = yok. */
  selectedSeat: number;
  hoverSeat: number;
  eventId: string;
  phase: Phase;
  /** Geri sayımda kalan tam saniye. */
  countdown: number;
  filter: Filter;
  tickets: Ticket[];
  favorites: string[];
  soundOn: boolean;
  volume: number;
  quality: Quality;
  /** Başka sekme/cihazlardaki canlı seyirci sayısı. */
  online: number;
  /** Bağlantı katmanı: 'local' = BroadcastChannel, 'ws' = WebSocket sunucusu. */
  link: 'local' | 'ws';
  videoUrl: string;
}

type Listener<K extends keyof AppState> = (value: AppState[K], prev: AppState[K], state: AppState) => void;

export class Store {
  private state: AppState;
  private listeners = new Map<keyof AppState, Set<Listener<never>>>();

  constructor(initial: AppState) {
    this.state = initial;
  }

  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state[key];
  }

  get snapshot(): Readonly<AppState> {
    return this.state;
  }

  set(patch: Partial<AppState>): void {
    const changed: Array<[keyof AppState, unknown]> = [];
    for (const key of Object.keys(patch) as Array<keyof AppState>) {
      const next = patch[key] as AppState[typeof key];
      if (this.state[key] !== next) {
        changed.push([key, this.state[key]]);
        (this.state as unknown as Record<string, unknown>)[key] = next;
      }
    }
    for (const [key, prev] of changed) {
      const set = this.listeners.get(key);
      if (set) for (const fn of [...set]) (fn as Listener<keyof AppState>)(this.state[key], prev as never, this.state);
    }
  }

  /** Anahtar değişince çağrılır; `immediate` ile ilk değer de iletilir. */
  on<K extends keyof AppState>(key: K, fn: Listener<K>, immediate = false): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(fn as Listener<never>);
    if (immediate) fn(this.state[key], this.state[key], this.state);
    return () => set.delete(fn as Listener<never>);
  }
}
