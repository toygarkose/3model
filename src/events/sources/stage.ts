import * as THREE from 'three';
import type { VenueConfig } from '../../config/venue';
import { mulberry32 } from '../../core/rng';
import type { Phase } from '../../core/store';
import { createBeam } from '../../scene/stadium';
import { formatClock } from '../../core/format';
import type { EventContext, EventFactory, EventSource, EventStatus } from '../types';

const BPM = 124;
const SETLIST = ['Mavi Gece', 'Işık Yılı', 'Tribün', "Boğaz'da Sabah", 'Yankı', 'Son Tur'];
const PALETTES: number[][] = [
  [0x2f6bff, 0x7af0c0, 0xffffff],
  [0xff4fa3, 0xb9a2f2, 0xffd23f],
  [0xffd23f, 0xff7a3d, 0xffffff],
  [0x7af0c0, 0x2f6bff, 0xb9a2f2],
];

type Beam = THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;

/** Sahne modu: sahaya kurulan sahne, ışık şovu ve dev ekran. */
class StageSource implements EventSource {
  readonly info;
  readonly focus = new THREE.Vector3(-38, 7, 0);
  readonly order = 2;

  private ctx!: EventContext;
  private readonly duration: number;
  private beams: Array<{ mesh: Beam; origin: THREE.Vector3; phase: number; sky: boolean }> = [];
  private performers: THREE.Group[] = [];
  private crowdUniforms = { uTime: { value: 0 }, uAmp: { value: 0 } };
  private wash: THREE.PointLight[] = [];
  private screenCanvas!: HTMLCanvasElement;
  private screenCtx!: CanvasRenderingContext2D;
  private screenTex!: THREE.CanvasTexture;
  private screenMat!: THREE.MeshBasicMaterial;
  private video: HTMLVideoElement | null = null;
  private videoTex: THREE.VideoTexture | null = null;
  private screenTimer = 0;
  private time = 0;
  private live = 0;
  private lastBar = -1;
  private wasLive = false;
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly dir = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(private readonly venue: VenueConfig) {
    const ev = venue.events.stage;
    this.info = {
      id: 'sahne',
      label: 'Sahne',
      badge: ev.badge,
      title: ev.artist,
      subtitle: ev.tour,
      date: ev.date,
      time: ev.time,
      acceptsVideo: true,
    };
    this.duration = venue.flow.liveSeconds;
  }

  mount(ctx: EventContext): void {
    this.ctx = ctx;
    const g = ctx.group;
    const L = this.venue.field.length;
    const W = this.venue.field.width;
    const sx = -L / 2 + 9;
    const rng = mulberry32(this.venue.seed ^ 0x57a6e);
    const dark = new THREE.MeshLambertMaterial({ color: 0x15182e });
    const truss = new THREE.MeshLambertMaterial({ color: 0x2a2f52 });

    // Saha örtüsü
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(L + 2, W + 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1c2038 }));
    cover.position.y = 0.1;
    g.add(cover);

    // Platform, iskele
    const deck = new THREE.Mesh(new THREE.BoxGeometry(17, 2.2, 38), dark);
    deck.position.set(sx, 1.1, 0);
    g.add(deck);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 38), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    edge.position.set(sx + 8.6, 1.95, 0);
    g.add(edge);
    for (const z of [-19.5, 19.5]) {
      for (const x of [sx - 7, sx + 7]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 21, 1.1), truss);
        tower.position.set(x, 10.5, z);
        g.add(tower);
      }
      const speaker = new THREE.Mesh(new THREE.BoxGeometry(2.2, 7, 2.6), dark);
      speaker.position.set(sx + 8, 14, z * 0.86);
      g.add(speaker);
    }
    for (const x of [sx - 7, sx + 7]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 40), truss);
      beam.position.set(x, 21, 0);
      g.add(beam);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 40), dark);
    roof.position.set(sx, 21.8, 0);
    g.add(roof);

    // Dev ekran (ön ve arka yüz)
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 640;
    this.screenCanvas.height = 256;
    this.screenCtx = this.screenCanvas.getContext('2d')!;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex, side: THREE.DoubleSide });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(32, 12.8), this.screenMat);
    screen.rotation.y = Math.PI / 2;
    screen.position.set(sx - 7.2, 11.2, 0);
    g.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 13.8, 33), dark);
    frame.position.set(sx - 7.6, 11.2, 0);
    g.add(frame);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(32, 12.8), this.screenMat);
    back.rotation.y = -Math.PI / 2;
    back.position.set(sx - 7.95, 11.2, 0);
    g.add(back);

    // Sanatçılar
    const spots: Array<[number, number, number]> = [
      [sx + 5.5, 0, 0xff4fa3],
      [sx + 1, -7, 0x2f6bff],
      [sx + 1, 7, 0xffd23f],
      [sx - 3, 0, 0x7af0c0],
    ];
    this.performers = spots.map(([x, z, color]) => {
      const p = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.45), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
      body.position.y = 1.15;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf2c9a1 }));
      head.position.y = 2.1;
      p.add(body, head);
      p.position.set(x, 2.2, z);
      p.scale.setScalar(1.5);
      g.add(p);
      return p;
    });

    // Hareketli ışık hüzmeleri
    this.beams = [];
    const count = ctx.quality === 'low' ? 6 : 10;
    for (let i = 0; i < count; i++) {
      const z = -17 + (34 * i) / (count - 1);
      const origin = new THREE.Vector3(sx + 7, 20.3, z);
      const mesh = createBeam(origin, origin.clone().add(new THREE.Vector3(60, -20, 0)), 4.5, 0xffffff, 0, 0.35);
      g.add(mesh);
      this.beams.push({ mesh, origin, phase: i * 0.7, sky: false });
    }
    for (let i = 0; i < 4; i++) {
      const origin = new THREE.Vector3(sx - 9, 2, -16 + i * 10.6);
      const mesh = createBeam(origin, origin.clone().add(new THREE.Vector3(0, 150, 0)), 7, 0xffffff, 0, 0.5);
      g.add(mesh);
      this.beams.push({ mesh, origin, phase: i * 1.3, sky: true });
    }
    this.wash = [new THREE.PointLight(0xffffff, 0, 120, 1.4), new THREE.PointLight(0xffffff, 0, 140, 1.4)];
    this.wash[0].position.set(sx + 6, 14, 0);
    this.wash[1].position.set(sx + 40, 18, 0);
    g.add(...this.wash);

    // Ayakta seyirci (saha içi)
    const n = ctx.quality === 'high' ? 2600 : ctx.quality === 'medium' ? 1500 : 700;
    const mat = (): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.crowdUniforms.uTime;
        shader.uniforms.uAmp = this.crowdUniforms.uAmp;
        shader.vertexShader =
          'uniform float uTime;\nuniform float uAmp;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
            transformed.y += abs(sin(uTime * ${((BPM / 60) * Math.PI).toFixed(4)} + ph * 0.9)) * (0.08 + 0.3 * uAmp) * (0.5 + ph);`,
          );
      };
      m.customProgramCacheKey = () => 'seyir-floor-crowd';
      return m;
    };
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 1.25, 0.3).translate(0, 0.78, 0), mat(), n);
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.15, 0).translate(0, 1.58, 0), mat(), n);
    const m4 = new THREE.Matrix4();
    const shirts = [0x23263f, 0x3a3f6b, 0x8d99ae, 0xf1f1f1, 0xff4fa3, 0x2f6bff, 0xffd23f, 0x14142b];
    const skins = [0xf2c9a1, 0xe0ac7e, 0xc68642, 0x8d5524];
    for (let i = 0; i < n; i++) {
      // Sahneye yakın yoğun, arkaya doğru seyrek
      const depth = Math.pow(rng(), 1.6);
      const x = sx + 11 + depth * (L / 2 - 6 - (sx + 11));
      const z = (rng() - 0.5) * (W - 4);
      m4.makeRotationY(-Math.PI / 2 + (rng() - 0.5) * 0.5).setPosition(x, 0.1, z);
      bodies.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
      bodies.setColorAt(i, this.color.setHex(shirts[Math.floor(rng() * shirts.length)]));
      heads.setColorAt(i, this.color.setHex(skins[Math.floor(rng() * skins.length)]));
    }
    bodies.frustumCulled = false;
    heads.frustumCulled = false;
    g.add(bodies, heads);

    this.time = 0;
    this.live = 0;
    this.lastBar = -1;
    this.wasLive = false;
    this.drawScreen('countdown');
  }

  begin(): void {
    this.lastBar = -1;
    this.wasLive = true;
    this.ctx.music(true, BPM);
    this.ctx.cue({ type: 'cheer' });
  }

  update(dt: number, liveTime: number, phase: Phase): void {
    this.time += dt;
    this.live = liveTime;
    const isLive = phase === 'live';
    if (!isLive && this.wasLive) {
      this.wasLive = false;
      this.ctx.music(false);
      this.ctx.cue({ type: 'applause' });
      this.ctx.cue({ type: 'cheer' });
    }
    const beat = (liveTime * BPM) / 60;
    const pulse = isLive ? Math.pow(1 - (beat % 1), 2.2) : 0;
    const bar = Math.floor(beat / 4);
    const section = Math.floor(beat / 32);
    const palette = PALETTES[section % PALETTES.length];
    if (isLive && bar !== this.lastBar) {
      this.lastBar = bar;
      // Her 16 ölçüde bir "drop": tribün coşar
      if (bar > 0 && bar % 16 === 0) this.ctx.cue({ type: 'cheer' });
    }

    this.crowdUniforms.uTime.value = isLive ? liveTime : this.time * 0.25;
    this.crowdUniforms.uAmp.value += ((isLive ? 0.6 + 0.4 * pulse : 0) - this.crowdUniforms.uAmp.value) * Math.min(1, dt * 3);

    const t = this.time;
    const idle = phase === 'countdown' ? 0.18 : phase === 'finished' ? 0.28 : 0;
    this.beams.forEach((b, i) => {
      const u = b.mesh.material.uniforms;
      const c = palette[i % palette.length];
      (u.uColor.value as THREE.Color).lerp(this.color.setHex(isLive ? c : 0xbfd0ff), Math.min(1, dt * 4));
      if (b.sky) {
        this.dir.set(Math.sin(t * 0.5 + b.phase) * 0.35 + 0.15, 1, Math.cos(t * 0.37 + b.phase * 2) * 0.45).normalize();
        u.uIntensity.value = isLive ? 0.25 + 0.3 * pulse : idle * 0.6;
      } else {
        const sweep = isLive ? 1 : 0.25;
        const pan = Math.sin(t * (0.6 + (section % 3) * 0.25) * sweep + b.phase) * 0.55;
        const tilt = -0.32 - 0.2 * Math.sin(t * 0.43 * sweep + b.phase * 1.7);
        this.dir.set(1, tilt, pan).normalize();
        u.uIntensity.value = isLive ? 0.4 + 0.55 * pulse : idle;
      }
      b.mesh.quaternion.setFromUnitVectors(this.down, this.dir);
    });
    this.wash[0].color.setHex(palette[0]);
    this.wash[1].color.setHex(palette[1]);
    this.wash[0].intensity = isLive ? 70 + 130 * pulse : 25;
    this.wash[1].intensity = isLive ? 50 + 110 * pulse : 0;

    this.performers.forEach((p, i) => {
      p.position.y = 2.2 + (isLive ? Math.abs(Math.sin(beat * Math.PI + i)) * 0.22 : 0);
      p.rotation.y = Math.PI / 2 + (isLive ? Math.sin(beat * 0.5 + i * 2) * 0.5 : 0);
    });

    if (this.videoTex) return;
    this.screenTimer -= dt;
    if (this.screenTimer <= 0) {
      this.screenTimer = 1 / 24;
      this.drawScreen(phase, beat, pulse, palette);
    }
  }

  /** Dev ekranın varsayılan içeriği: canvas ile üretilen hareketli görsel. */
  private drawScreen(phase: Phase, beat = 0, pulse = 0, palette: number[] = PALETTES[0]): void {
    const g = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;
    const ev = this.venue.events.stage;
    const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0b0f2e');
    grad.addColorStop(1, phase === 'live' ? hex(palette[0]) : '#1a2466');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    if (phase === 'live') {
      // Halkalar ve ekolayzır
      g.lineWidth = 5;
      for (let i = 0; i < 5; i++) {
        const r = ((beat * 0.5 + i / 5) % 1) * w * 0.6;
        g.strokeStyle = hex(palette[i % palette.length]);
        g.globalAlpha = 1 - r / (w * 0.6);
        g.beginPath();
        g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 0.85;
      const bars = 32;
      for (let i = 0; i < bars; i++) {
        const v = 0.25 + 0.75 * Math.abs(Math.sin(beat * Math.PI * (0.5 + (i % 5) * 0.25) + i * 1.7)) * (0.5 + 0.5 * pulse);
        g.fillStyle = hex(palette[(i >> 2) % palette.length]);
        g.fillRect((i * w) / bars + 2, h - v * 70, w / bars - 4, v * 70);
      }
      g.globalAlpha = 1;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    const size = 92 + (phase === 'live' ? pulse * 12 : 0);
    g.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    g.strokeStyle = '#14142b';
    g.lineWidth = 10;
    const title = phase === 'finished' ? 'TEŞEKKÜRLER!' : ev.artist;
    if (phase === 'finished') g.font = '900 64px "Arial Black", Arial, sans-serif';
    g.strokeText(title, w / 2, h * 0.44);
    g.fillText(title, w / 2, h * 0.44);
    g.font = '700 24px Arial, sans-serif';
    g.fillStyle = '#ffd23f';
    const sub =
      phase === 'live'
        ? `Şimdi: ${this.songName()}`
        : phase === 'finished'
          ? `${this.venue.city.toLocaleUpperCase('tr')} · ${ev.tour}`
          : `${ev.tour} · birazdan sahnede`;
    g.fillText(sub, w / 2, h * 0.74);
    if (phase === 'live') {
      g.fillStyle = '#e63946';
      g.fillRect(16, 14, 96, 32);
      g.fillStyle = '#ffffff';
      g.font = '900 20px "Arial Black", Arial, sans-serif';
      g.fillText('CANLI', 64, 31);
    }
    this.screenTex.needsUpdate = true;
  }

  private songName(): string {
    const i = Math.min(SETLIST.length - 1, Math.floor((this.live / this.duration) * SETLIST.length));
    return SETLIST[i];
  }

  status(phase: Phase): EventStatus {
    const ev = this.venue.events.stage;
    if (phase === 'countdown') return { clock: '00:00', headline: ev.artist, detail: 'Sahne hazırlanıyor' };
    if (phase === 'finished') return { clock: formatClock(this.duration), headline: ev.artist, detail: 'Konser sona erdi' };
    return { clock: formatClock(this.live), headline: `${ev.artist} · ${this.songName()}`, detail: ev.tour };
  }

  houseLights(phase: Phase): number {
    return phase === 'live' ? 0.3 : phase === 'countdown' ? 0.55 : 0.75;
  }

  drawScoreboard(g: CanvasRenderingContext2D, w: number, h: number, phase: Phase): void {
    const ev = this.venue.events.stage;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = '900 120px "Arial Black", Arial, sans-serif';
    g.fillText(ev.artist, w / 2, h * 0.36);
    g.font = '700 34px Arial, sans-serif';
    g.fillStyle = '#8fd6ff';
    g.fillText(phase === 'live' ? `Şimdi çalıyor: ${this.songName()}` : ev.tour, w / 2, h * 0.66);
    g.font = '900 40px ui-monospace, Menlo, Consolas, monospace';
    g.fillStyle = '#ffd23f';
    g.fillText(this.status(phase).clock, w / 2, h * 0.86);
  }

  /** İsteğe bağlı video: muted + playsInline + crossOrigin; hata olursa varsayılan içeriğe dönülür. */
  setMedia(url: string): Promise<boolean> {
    this.clearVideo();
    if (!url) return Promise.resolve(true);
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      let settled = false;
      const fail = (): void => {
        if (settled) return;
        settled = true;
        video.removeAttribute('src');
        video.load();
        resolve(false);
      };
      const timer = window.setTimeout(fail, 8000);
      video.addEventListener('error', () => {
        window.clearTimeout(timer);
        fail();
      });
      video.addEventListener(
        'canplay',
        () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          video.play().catch(() => undefined);
          this.video = video;
          this.videoTex = new THREE.VideoTexture(video);
          this.videoTex.colorSpace = THREE.SRGBColorSpace;
          this.screenMat.map = this.videoTex;
          this.screenMat.needsUpdate = true;
          resolve(true);
        },
        { once: true },
      );
      video.src = url;
    });
  }

  private clearVideo(): void {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video = null;
    }
    if (this.videoTex) {
      this.videoTex.dispose();
      this.videoTex = null;
      this.screenMat.map = this.screenTex;
      this.screenMat.needsUpdate = true;
    }
  }

  unmount(): void {
    this.clearVideo();
    this.ctx.music(false);
    this.beams = [];
    this.performers = [];
    this.wash = [];
  }
}

const factory: EventFactory = (venue) => new StageSource(venue);
export default factory;
