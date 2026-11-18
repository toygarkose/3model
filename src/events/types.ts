import type * as THREE from 'three';
import type { VenueConfig } from '../config/venue';
import type { Phase, Quality } from '../core/store';

/** Etkinliğin tribüne ve sese gönderdiği işaretler. */
export type CrowdCue =
  | { type: 'goal'; team: 0 | 1 }
  | { type: 'applause' }
  | { type: 'ooh' }
  | { type: 'cheer' }
  | { type: 'whistle' };

export interface EventInfo {
  id: string;
  /** Menüde görünen kısa ad. */
  label: string;
  /** Tür rozeti: MAÇ, KONSER… */
  badge: string;
  title: string;
  subtitle: string;
  date: string;
  time: string;
  /** Bu etkinlik isteğe bağlı video URL'si kabul ediyor mu? */
  acceptsVideo?: boolean;
}

export interface EventStatus {
  clock: string;
  headline: string;
  detail: string;
}

export interface EventContext {
  /** Etkinliğin 3B nesnelerini ekleyeceği grup (sahanın üstü). */
  group: THREE.Group;
  venue: VenueConfig;
  quality: Quality;
  cue(c: CrowdCue): void;
  /** Sentezlenmiş müzik (sahne modu). */
  music(on: boolean, bpm?: number): void;
}

/**
 * Sahadaki içerik bu arayüzün arkasındadır. Yeni bir etkinlik türü eklemek için
 * `src/events/sources/` altına bu arayüzü uygulayan bir fabrika `default export`
 * eden tek dosya eklemek yeterlidir; kayıt otomatik yapılır.
 */
export interface EventSource {
  readonly info: EventInfo;
  /** Koltuktan varsayılan bakış hedefi. */
  readonly focus: THREE.Vector3;
  /** Menü sırası. */
  readonly order: number;
  mount(ctx: EventContext): void;
  /** Canlı evre başlarken çağrılır; iç durum sıfırlanır. */
  begin(): void;
  update(dt: number, liveTime: number, phase: Phase): void;
  status(phase: Phase): EventStatus;
  houseLights(phase: Phase): number;
  /** Skorbordun içerik alanını çizer (başlık şeridi yönetmen tarafından çizilir). */
  drawScoreboard(g: CanvasRenderingContext2D, w: number, h: number, phase: Phase): void;
  /** İsteğe bağlı: dev ekrana video bağla. Boş URL varsayılan içeriğe döner. */
  setMedia?(url: string): Promise<boolean>;
  unmount(): void;
}

export type EventFactory = (venue: VenueConfig) => EventSource;
