/**
 * Ses motoru: bütün sesler Web Audio ile üretilir (ses dosyası yok).
 * Tarayıcı politikası gereği yalnızca kullanıcı etkileşiminden sonra başlar.
 */
export type SoundCue = 'goal' | 'applause' | 'cheer' | 'wave' | 'whistle' | 'ooh';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private crowdGain!: GainNode;
  private musicGain!: GainNode;
  private noise!: AudioBuffer;
  private enabled = true;
  private volume = 0.7;
  /** 0-1: orbit'te uzaktan uğultu, koltukta tam ortam. */
  private presence = 0.35;
  private liveLevel = 0.6;
  private musicTimer: number | null = null;
  private musicNext = 0;
  private musicStep = 0;
  private musicBpm = 124;
  private pendingMusic: number | null = null;

  get info(): { unlocked: boolean; state: string; music: boolean } {
    return { unlocked: this.ctx !== null, state: this.ctx?.state ?? 'none', music: this.musicTimer !== null };
  }

  /** İlk kullanıcı etkileşiminde çağrılır. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.enabled) void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(ctx.destination);

    // 3 sn'lik beyaz gürültü tamponu: tezahürat, alkış ve uğultunun ham maddesi
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Sürekli tribün uğultusu: iki bant geçiren katman + yavaş dalgalanma
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    this.crowdGain.connect(this.master);
    for (const [freq, q, gain, rate] of [
      [420, 0.7, 0.55, 0.13],
      [1150, 0.9, 0.22, 0.21],
    ] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = 0.8 + rate;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = gain * 0.35;
      lfo.connect(lfoGain).connect(g.gain);
      src.connect(bp).connect(g).connect(this.crowdGain);
      src.start();
      lfo.start();
    }
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.applyAmbience();
    if (this.pendingMusic !== null) {
      const bpm = this.pendingMusic;
      this.pendingMusic = null;
      this.music(true, bpm);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
    if (on && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Kamera koltuktayken ortam yükselir. */
  setPresence(p: number): void {
    this.presence = p;
    this.applyAmbience();
  }

  /** Etkinlik evresine göre uğultu seviyesi. */
  setLive(level: number): void {
    this.liveLevel = level;
    this.applyAmbience();
  }

  private applyAmbience(): void {
    if (!this.ctx) return;
    this.crowdGain.gain.setTargetAtTime(0.5 * this.presence * this.liveLevel, this.ctx.currentTime, 0.6);
    this.musicGain.gain.setTargetAtTime(0.25 + 0.4 * this.presence, this.ctx.currentTime, 0.6);
  }

  private burst(freq: number, q: number, peak: number, attack: number, hold: number, release: number, sweepTo?: number, when = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random() * 2;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, t);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + hold);
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 2);
    src.stop(t + attack + hold + release + 0.05);
  }

  private clap(when: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100 + Math.random() * 1400;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 2.5, 0.09);
  }

  /** `intensity` 0-1: uzaktaki/başkasına ait tepkiler daha kısık çalınır. */
  cue(type: SoundCue, intensity = 1): void {
    if (!this.ctx || !this.enabled) return;
    const k = intensity * (0.45 + 0.55 * this.presence);
    switch (type) {
      case 'goal':
        // Yükselen kükreme + uzun alkış kuyruğu
        this.burst(350, 0.6, 0.9 * k, 0.25, 2.2, 3.2, 900);
        this.burst(1400, 0.8, 0.4 * k, 0.4, 1.8, 3.0, 2200);
        for (let i = 0; i < 90; i++) this.clap(1.2 + Math.random() * 4.5, 0.12 * k);
        break;
      case 'applause':
        for (let i = 0; i < 120; i++) this.clap(Math.random() * 2.6, 0.2 * k * (1 - i / 200));
        break;
      case 'cheer':
        this.burst(500, 0.7, 0.55 * k, 0.15, 0.9, 1.4, 1100);
        // Ritmik alkış: tak-tak-taktaktak
        for (const beat of [0, 0.4, 0.8, 1.0, 1.2]) for (let i = 0; i < 9; i++) this.clap(0.3 + beat + Math.random() * 0.04, 0.28 * k);
        break;
      case 'wave':
        this.burst(260, 0.5, 0.5 * k, 1.6, 0.6, 2.2, 1300);
        break;
      case 'ooh':
        this.burst(520, 1.4, 0.5 * k, 0.12, 0.35, 1.1, 260);
        break;
      case 'whistle': {
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 2350;
        const vib = ctx.createOscillator();
        vib.frequency.value = 38;
        const vg = ctx.createGain();
        vg.gain.value = 90;
        vib.connect(vg).connect(osc.frequency);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2400;
        bp.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18 * k, t + 0.03);
        g.gain.setValueAtTime(0.18 * k, t + 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
        osc.connect(bp).connect(g).connect(this.master);
        osc.start(t);
        vib.start(t);
        osc.stop(t + 0.8);
        vib.stop(t + 0.8);
        break;
      }
    }
  }

  /** Sahne modu için basit sentez müzik: kick, hi-hat, bas ve akor pedi. */
  music(on: boolean, bpm = 124): void {
    if (!on) {
      this.pendingMusic = null;
      if (this.musicTimer !== null) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      return;
    }
    if (!this.ctx) {
      this.pendingMusic = bpm;
      return;
    }
    if (this.musicTimer !== null) return;
    this.musicBpm = bpm;
    this.musicStep = 0;
    this.musicNext = this.ctx.currentTime + 0.08;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx!;
    const stepDur = 60 / this.musicBpm / 4;
    // Sekme arka plandaysa birikmiş adımları çalmadan atla
    if (this.musicNext < ctx.currentTime - 0.3) this.musicNext = ctx.currentTime + 0.05;
    while (this.musicNext < ctx.currentTime + 0.18) {
      this.playStep(this.musicStep, this.musicNext, stepDur);
      this.musicStep++;
      this.musicNext += stepDur;
    }
  }

  private playStep(step: number, t: number, stepDur: number): void {
    const ctx = this.ctx!;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const roots = [55, 55, 65.41, 49]; // A1, A1, C2, G1
    const root = roots[bar % roots.length];
    if (s % 4 === 0) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.3);
    }
    if (s % 2 === 1 || s % 4 === 2) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(s % 4 === 2 ? 0.22 : 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(hp).connect(g).connect(this.musicGain);
      src.start(t, Math.random() * 2, 0.06);
    }
    if ([0, 3, 6, 8, 11, 14].includes(s)) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = root * (s === 6 || s === 14 ? 1.5 : 1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + stepDur * 1.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
      osc.connect(lp).connect(g).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + stepDur * 2);
    }
    if (s === 0) {
      // Akor pedi: kök, minör üçlü, beşli
      for (const ratio of [4, 4.757, 5.993]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = root * ratio;
        const g = ctx.createGain();
        const len = stepDur * 16;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.07, t + 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        osc.connect(g).connect(this.musicGain);
        osc.start(t);
        osc.stop(t + len + 0.05);
      }
    }
  }

  dispose(): void {
    this.music(false);
    void this.ctx?.close();
    this.ctx = null;
  }
}
