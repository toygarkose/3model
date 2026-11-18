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
  /** Üst direk: sert vuruş + çınlayan metal. Uyumsuz üst sesler metalin "tınnn" sesini verir. */
  post() {
    const c = this.ctx; if (!c) return;
    this.noise(0.035, 1.0, 5200, 1800, 0.6);                    // topun demire çarptığı an
    this.tone(118, 0.22, 'sine', 0.75, 0, 62);                  // gövde: tok vuruş
    const parts: [number, number, number][] = [[412, 0.9, 0.5], [968, 1.4, 0.42], [1541, 1.1, 0.3], [2290, 0.8, 0.22], [3127, 0.55, 0.14], [4380, 0.35, 0.08]];
    for (const [f, dur, vol] of parts) {
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.012, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    }
    this.ooh();
  }
  /** Tribünün "ooo" tepkisi */
  ooh() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + 0.08, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 1.6;
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(380, t + 1.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 1.6);
  }
  /** Koşu adımıyla yükselen beklenti */
  rise() { this.noise(0.75, 0.3, 350, 1500, 0.5); }
  step() { this.noise(0.05, 0.1, 900, 400, 1.2); }
  goal() { this.noise(2.6, 0.75, 500, 1500, 0.35); this.noise(2.2, 0.4, 900, 2200, 0.5, 0.1); [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.22, 0.1 + i * 0.09)); }
  private chargeOsc: OscillatorNode | null = null; private chargeGain: GainNode | null = null;
  /** Güç dolarken yükselen ton */
  charge(p: number) {
    const c = this.ctx; if (!c) return;
    if (!this.chargeOsc) { const o = this.chargeOsc = c.createOscillator(), g = this.chargeGain = c.createGain(); o.type = 'sawtooth'; g.gain.value = 0.0001; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; o.connect(f).connect(g).connect(this.master); o.start(); }
    this.chargeOsc.frequency.setTargetAtTime(90 + 260 * Math.min(p, 1) + (p > 1 ? 400 * (p - 1) + 30 * Math.sin(c.currentTime * 60) : 0), c.currentTime, 0.03);
    this.chargeGain!.gain.setTargetAtTime(0.05 + 0.06 * Math.min(p, 1.2), c.currentTime, 0.03);
  }
  chargeStop() { if (this.ctx && this.chargeGain) this.chargeGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.02); }
  strike(power: number) { this.tone(95, 0.2, 'sine', 0.7, 0, 38); this.tone(190, 0.07, 'square', 0.12 + 0.1 * power, 0, 70); this.noise(0.13, 0.35 + power * 0.4, 2200, 250, 0.7); }
  netSwish() { this.noise(0.5, 0.45, 3200, 700, 0.6); }
  glove() { this.tone(140, 0.1, 'sine', 0.4, 0, 70); this.noise(0.08, 0.3, 700, 300, 1); }
  bounce(v: number) { this.tone(110, 0.08, 'sine', Math.min(0.3, 0.05 + v * 0.03), 0, 60); }
  click() { this.tone(660, 0.05, 'triangle', 0.15); }
}
