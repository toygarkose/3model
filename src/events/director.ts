import * as THREE from 'three';
import type { VenueConfig } from '../config/venue';
import { formatClock } from '../core/format';
import type { Phase, Quality, Store } from '../core/store';
import type { Scoreboard } from '../scene/stadium';
import { disposeTree } from '../scene/setup';
import type { CrowdCue, EventFactory, EventSource, EventStatus } from './types';

const modules = import.meta.glob<{ default: EventFactory }>('./sources/*.ts', { eager: true });

export interface DirectorHooks {
  cue(c: CrowdCue): void;
  music(on: boolean, bpm?: number): void;
  houseLights(level: number): void;
  focus(v: THREE.Vector3): void;
  phaseChanged(phase: Phase): void;
}

/** Etkinlik yönetmeni: kaynak seçimi ve geri sayım → CANLI → bitti akışı. */
export class EventDirector {
  readonly sources: EventSource[];
  readonly group = new THREE.Group();
  private active: EventSource;
  private countdown: number;
  private liveTime = 0;
  private boardTimer = 0;
  private lastStatus: EventStatus = { clock: '', headline: '', detail: '' };

  constructor(
    private readonly venue: VenueConfig,
    private readonly store: Store,
    private readonly quality: Quality,
    private readonly board: Scoreboard,
    private readonly hooks: DirectorHooks,
  ) {
    this.sources = Object.values(modules)
      .map((m) => m.default(venue))
      .sort((a, b) => a.order - b.order);
    this.group.name = 'event';
    this.countdown = venue.flow.countdownSeconds;
    const wanted = store.get('eventId');
    this.active = this.sources.find((s) => s.info.id === wanted) ?? this.sources[0];
    this.mountActive();
  }

  get source(): EventSource {
    return this.active;
  }

  get status(): EventStatus {
    return this.lastStatus;
  }

  private mountActive(): void {
    const src = this.active;
    src.mount({
      group: this.group,
      venue: this.venue,
      quality: this.quality,
      cue: (c) => this.hooks.cue(c),
      music: (on, bpm) => this.hooks.music(on, bpm),
    });
    this.liveTime = 0;
    this.countdown = this.venue.flow.countdownSeconds;
    this.store.set({ eventId: src.info.id, phase: 'countdown', countdown: Math.ceil(this.countdown) });
    this.hooks.focus(src.focus);
    this.hooks.houseLights(src.houseLights('countdown'));
    this.hooks.phaseChanged('countdown');
    this.boardTimer = 0;
  }

  setEvent(id: string): void {
    const next = this.sources.find((s) => s.info.id === id);
    if (!next || next === this.active) return;
    this.hooks.music(false);
    this.active.unmount();
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      disposeTree(child);
    }
    this.active = next;
    this.mountActive();
  }

  /** Hızlı gösterim: akışı birkaç saniyelik geri sayımla hemen başlatır. */
  startDemo(): void {
    if (this.store.get('phase') === 'finished') this.hooks.music(false);
    this.liveTime = 0;
    this.countdown = this.venue.flow.demoCountdownSeconds;
    this.setPhase('countdown');
    this.store.set({ countdown: Math.ceil(this.countdown) });
  }

  private setPhase(phase: Phase): void {
    if (this.store.get('phase') === phase && phase !== 'countdown') return;
    this.store.set({ phase });
    this.hooks.houseLights(this.active.houseLights(phase));
    this.hooks.phaseChanged(phase);
    if (phase === 'live') this.active.begin();
  }

  update(dt: number): void {
    const phase = this.store.get('phase');
    if (phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.liveTime = 0;
        this.setPhase('live');
      } else {
        this.store.set({ countdown: Math.ceil(this.countdown) });
      }
    } else if (phase === 'live') {
      this.liveTime += dt;
      if (this.liveTime >= this.venue.flow.liveSeconds) {
        this.liveTime = this.venue.flow.liveSeconds;
        this.setPhase('finished');
      }
    }
    const now = this.store.get('phase');
    this.active.update(dt, this.liveTime, now);
    this.lastStatus = this.active.status(now);
    this.boardTimer -= dt;
    if (this.boardTimer <= 0) {
      this.boardTimer = 0.25;
      this.drawBoard(now);
    }
  }

  private drawBoard(phase: Phase): void {
    const { ctx: g, canvas, texture } = this.board;
    const w = canvas.width;
    const h = canvas.height;
    g.fillStyle = '#080c26';
    g.fillRect(0, 0, w, h);
    // Başlık şeridi
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, w, 64);
    g.fillStyle = '#14142b';
    g.font = '900 38px "Arial Black", Arial, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(`${this.active.info.badge} · ${this.venue.name.toLocaleUpperCase('tr')}`, 28, 34);
    const label = phase === 'live' ? 'CANLI' : phase === 'finished' ? 'BİTTİ' : `BAŞLAMASINA ${formatClock(this.store.get('countdown'))}`;
    g.textAlign = 'right';
    const tw = g.measureText(label).width;
    g.fillStyle = phase === 'live' ? '#e63946' : '#14142b';
    g.fillRect(w - tw - 56, 8, tw + 40, 48);
    g.fillStyle = '#ffffff';
    g.fillText(label, w - 36, 34);
    g.save();
    g.translate(0, 64);
    this.active.drawScoreboard(g, w, h - 64, phase);
    g.restore();
    texture.needsUpdate = true;
  }

  dispose(): void {
    this.hooks.music(false);
    this.active.unmount();
    disposeTree(this.group);
  }
}
