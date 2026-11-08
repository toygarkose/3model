// Synthesised audio. Every sound is generated in code (no audio files).
const TAU = Math.PI * 2;

export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.buf = {}; }

  unlock() {
    try {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.85 : 0;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp); comp.connect(this.ctx.destination);
        this._build();
        this._ambient();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (_) { this.ctx = null; }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
  }

  _mk(dur, fn) {
    const sr = this.ctx.sampleRate, n = Math.floor(dur * sr), b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    fn(d, sr, n); return b;
  }

  _build() {
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
    const B = this.buf;
    B.launch = this._mk(0.7, (d, sr, n) => { let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; lp += (rnd() - lp) * (0.5 - 0.45 * i / n); ph += TAU * (110 + 420 * (1 - Math.exp(-t * 7))) / sr; d[i] = (lp * 0.9 + Math.sin(ph) * 0.3 * Math.exp(-t * 5)) * Math.min(1, t * 80) * Math.exp(-t * 4.2); } });
    B.whoosh = this._mk(0.8, (d, sr, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; const k = 0.05 + 0.4 * Math.sin(Math.PI * t / 0.8); lp += (rnd() - lp) * k; d[i] = lp * Math.sin(Math.PI * t / 0.8) * 0.9; } });
    B.crash = this._mk(1.1, (d, sr, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; lp += (rnd() - lp) * 0.12; d[i] = (lp * 1.5 * Math.exp(-t * 3.5) + Math.sin(TAU * (45 + 70 * Math.exp(-t * 14)) * t) * Math.exp(-t * 6) * 0.9) * Math.min(1, t * 300); } });
    B.portal = this._mk(2.2, (d, sr, n) => { const notes = [392, 523.25, 659.25, 783.99, 1046.5]; for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; notes.forEach((f, k) => { const lt = t - k * 0.075; if (lt > 0) s += (Math.sin(TAU * f * lt) + 0.3 * Math.sin(TAU * 2 * f * lt) + 0.1 * Math.sin(TAU * 3 * f * lt)) * Math.min(1, lt * 150) * Math.exp(-lt * 2.4) * 0.17; }); s += Math.sin(TAU * 2093 * t) * 0.05 * (0.5 + 0.5 * Math.sin(TAU * 9 * t)) * Math.exp(-t * 1.5) * Math.min(1, t * 3); d[i] = s; } });
    B.shard = this._mk(0.5, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU * 1046.5 * t) + 0.5 * Math.sin(TAU * 2093 * t) + 0.25 * Math.sin(TAU * 3140 * t)) * Math.min(1, t * 300) * Math.exp(-t * 7) * 0.3; } });
    B.close = this._mk(1.0, (d, sr, n) => { let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; lp += (rnd() - lp) * 0.25; ph += TAU * (300 - 180 * t) / sr; const env = Math.sin(Math.PI * Math.min(1, t / 0.9)); d[i] = (lp * 0.6 + Math.sin(ph) * 0.25) * env; } });
    B.assist = this._mk(1.0, (d, sr, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * (220 * Math.pow(4, t)) / sr; d[i] = (Math.sin(ph) + 0.4 * Math.sin(ph * 2)) * 0.22 * Math.min(1, t * 40) * Math.exp(-t * 2.5); } });
    B.horizon = this._mk(2.4, (d, sr, n) => { let ph = 0, lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * (180 * Math.exp(-t * 1.6) + 25) / sr; lp += (rnd() - lp) * 0.03; d[i] = (Math.sin(ph) * 0.5 + lp * 2) * Math.min(1, t * 6) * Math.exp(-t * 0.9); } });
    B.aero = this._mk(1.2, (d, sr, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; lp += (rnd() - lp) * 0.06; d[i] = lp * 2.2 * Math.sin(Math.PI * t / 1.2); } });
    B.lost = this._mk(0.8, (d, sr, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * (520 - 380 * t) / sr; d[i] = Math.sin(ph) * 0.3 * Math.min(1, t * 60) * Math.exp(-t * 2.8); } });
    B.click = this._mk(0.06, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU * 1400 * t) + 0.5 * Math.sin(TAU * 700 * t)) * 0.28 * Math.exp(-t * 80); } });
    B.star = this._mk(0.7, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU * 1318.5 * t) + 0.45 * Math.sin(TAU * 2637 * t)) * Math.min(1, t * 400) * Math.exp(-t * 5) * 0.3; } });
    B.tick = this._mk(0.03, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU * 2400 * t) * 0.12 * Math.exp(-t * 200); } });
    B.ambient = this._mk(8, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr, l = 0.6 + 0.4 * Math.sin(TAU * t / 8); d[i] = (Math.sin(TAU * 55 * t) * 0.45 + Math.sin(TAU * 82.5 * t) * 0.28 * l + Math.sin(TAU * 110 * t) * 0.12 * (1 - l) + Math.sin(TAU * 165 * t) * 0.05 * l) * 0.45; } });
  }

  _ambient() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf.ambient; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0.16;
    s.connect(g); g.connect(this.master); s.start();
  }

  play(name, { vol = 1, rate = 1 } = {}) {
    if (!this.ctx || !this.enabled || !this.buf[name]) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[name]; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
  }

  // Continuous "charging" tone while the player pulls back; pitch = power.
  chargeStart() {
    if (!this.ctx || !this.enabled || this.charge) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sine';
    f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 6;
    g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o.start(); o2.start();
    this.charge = { o, o2, g, f };
  }

  chargeSet(power) {
    const c = this.charge; if (!c) return;
    const now = this.ctx.currentTime;
    c.o.frequency.setTargetAtTime(90 + power * 240, now, 0.03);
    c.o2.frequency.setTargetAtTime(180 + power * 480, now, 0.03);
    c.f.frequency.setTargetAtTime(500 + power * 2600, now, 0.05);
    c.g.gain.setTargetAtTime(0.025 + power * 0.07, now, 0.05);
  }

  chargeStop() {
    const c = this.charge; if (!c) return;
    const now = this.ctx.currentTime;
    c.g.gain.setTargetAtTime(0, now, 0.03);
    c.o.stop(now + 0.2); c.o2.stop(now + 0.2);
    this.charge = null;
  }
}
