/** Tüm sesler WebAudio ile üretilir; dosya yok. */
export class Sfx {
  private ctx: AudioContext | null = null; private master!: GainNode; private crowdGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  enabled = true;

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.9 : 0; this.master.connect(ctx.destination);
      const n = this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // tribün uğultusu
      const src = ctx.createBufferSource(); src.buffer = n; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.5;
      this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0.04;
      src.connect(f).connect(this.crowdGain).connect(this.master); src.start();
    } catch { this.ctx = null; }
  }
  setEnabled(on: boolean) { this.enabled = on; if (this.ctx) this.master.gain.value = on ? 0.9 : 0; }
  crowd(level: number) { if (this.ctx) this.crowdGain.gain.setTargetAtTime(0.04 + 0.12 * Math.min(1, level), this.ctx.currentTime, 0.4); }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, f0: number, f1: number, q = 1, when = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  touch() { this.tone(150, 0.07, 'sine', 0.22, 0, 70); }
  whoosh() { this.noise(0.22, 0.35, 500, 2600, 1.2); }
  hop() { this.tone(260, 0.16, 'sine', 0.2, 0, 620); this.noise(0.12, 0.15, 900, 2000); }
  drag() { this.noise(0.18, 0.3, 1800, 300, 2); }
  good(combo: number) { const b = 440 * Math.pow(1.06, Math.min(combo, 14)); this.tone(b, 0.14, 'triangle', 0.25); this.tone(b * 1.5, 0.2, 'triangle', 0.2, 0.07); }
  perfect(combo: number) {
    const b = 523 * Math.pow(1.06, Math.min(combo, 14));
    [1, 1.26, 1.5, 2].forEach((m, i) => this.tone(b * m, 0.3, 'triangle', 0.24, i * 0.055));
    this.tone(b * 4, 0.5, 'sine', 0.08, 0.2);
    this.noise(0.9, 0.3, 500, 1400, 0.4, 0.05); // tribün coşkusu
  }
  early() { this.tone(200, 0.12, 'square', 0.06, 0, 150); }
  fail() { this.tone(110, 0.35, 'sawtooth', 0.3, 0, 45); this.noise(0.25, 0.5, 300, 90, 0.8); this.noise(1.2, 0.16, 500, 300, 0.4, 0.15); }
  whistle(long = false) {
    const c = this.ctx; if (!c) return;
    const dur = long ? 0.7 : 0.22;
    for (const f of [2150, 2230]) this.tone(f, dur, 'square', 0.05);
    this.noise(dur, 0.06, 2200, 2200, 6);
  }
  kick(power: number) { this.tone(120, 0.12, 'sine', 0.5, 0, 50); this.noise(0.1, 0.3 + power * 0.3, 1200, 300, 0.8); }
  post() { this.tone(880, 0.5, 'triangle', 0.3); this.tone(1320, 0.35, 'sine', 0.2); }
  goal() { this.noise(2.6, 0.75, 500, 1500, 0.35); this.noise(2.2, 0.4, 900, 2200, 0.5, 0.1); [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.22, 0.1 + i * 0.09)); }
  click() { this.tone(660, 0.05, 'triangle', 0.15); }
}
