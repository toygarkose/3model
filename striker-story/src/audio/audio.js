// Synthesised football audio (no files): kicks, net, post, saves, whistle,
// crowd bed, roar, "ooh", UI, plus the pull-back charge tone.
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
        this.master.gain.value = this.enabled ? 0.9 : 0;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp); comp.connect(this.ctx.destination);
        this._build();
        this._crowd();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (_) { this.ctx = null; }
  }

  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05); }

  _mk(dur, fn) { const sr = this.ctx.sampleRate, n = Math.floor(dur * sr), b = this.ctx.createBuffer(1, n, sr); fn(b.getChannelData(0), sr, n); return b; }

  _build() {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
    const B = this.buf;
    B.kick = this._mk(0.3, (d, sr, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * (130 * Math.exp(-t * 32) + 48) / sr; d[i] = Math.sin(ph) * Math.exp(-t * 20) + rnd() * Math.exp(-t * 170) * 0.55; } });
    B.pass = this._mk(0.2, (d, sr, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * (170 * Math.exp(-t * 35) + 75) / sr; d[i] = Math.sin(ph) * Math.exp(-t * 28) * 0.6 + rnd() * Math.exp(-t * 220) * 0.35; } });
    B.net = this._mk(0.8, (d, sr, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; const x = rnd(); lp += (x - lp) * 0.3; d[i] = (x - lp) * Math.min(1, t * 50) * Math.exp(-t * 5) * 0.9; } });
    B.post = this._mk(1.5, (d, sr, n) => { const f = [620, 1360, 2240, 3200]; for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; f.forEach((q, k) => { s += Math.sin(TAU * q * t) * Math.exp(-t * (2.6 + k * 2)) / (k + 1); }); d[i] = s * 0.55 + rnd() * Math.exp(-t * 200) * 0.4; } });
    B.glove = this._mk(0.3, (d, sr, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; lp += (rnd() - lp) * 0.2; d[i] = (lp * 1.7 + Math.sin(TAU * 170 * t) * 0.5) * Math.exp(-t * 17); } });
    B.whistle = this._mk(0.9, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const env = Math.min(1, t * 30) * Math.min(1, (0.9 - t) * 8); d[i] = (Math.sin(TAU * 2950 * t) + 0.6 * Math.sin(TAU * 3080 * t)) * (0.75 + 0.25 * Math.sin(TAU * 28 * t)) * env * 0.2; } });
    B.whistle3 = this._mk(2.0, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const seg = t < 0.35 ? t : t < 0.7 ? t - 0.4 : t - 0.8; const on = (t < 0.35 || (t > 0.4 && t < 0.75) || (t > 0.8 && t < 1.9)) ? 1 : 0; const env = on * Math.min(1, seg * 40); d[i] = (Math.sin(TAU * 2950 * t) + 0.6 * Math.sin(TAU * 3080 * t)) * (0.75 + 0.25 * Math.sin(TAU * 28 * t)) * env * 0.2; } });
    B.roar = this._mk(5, (d, sr, n) => { let a = 0, b = 0; for (let i = 0; i < n; i++) { const t = i / sr; const x = rnd(); a += (x - a) * 0.2; b += (a - b) * 0.05; d[i] = (a - b) * 2.8 * Math.min(1, t * 3) * Math.exp(-Math.max(0, t - 1.4) * 0.8); } });
    B.ooh = this._mk(1.9, (d, sr, n) => { let a = 0; for (let i = 0; i < n; i++) { const t = i / sr; a += (rnd() - a) * 0.05; const f = 260 + 160 * Math.min(1, t * 2); d[i] = (a * 2 * Math.sin(TAU * f * t) + a) * Math.min(1, t * 4) * Math.exp(-t * 1.5) * 0.9; } });
    B.click = this._mk(0.06, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU * 1700 * t) * 0.25 * Math.exp(-t * 90); } });
    B.tick = this._mk(0.03, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU * 2400 * t) * 0.12 * Math.exp(-t * 200); } });
    B.coin = this._mk(0.4, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const f = t < 0.08 ? 1568 : 2093; d[i] = Math.sin(TAU * f * t) * Math.exp(-t * 8) * 0.22; } });
    B.levelup = this._mk(0.9, (d, sr, n) => { const notes = [523, 659, 784, 1046]; for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; notes.forEach((f, k) => { const lt = t - k * 0.07; if (lt > 0) s += Math.sin(TAU * f * lt) * Math.min(1, lt * 200) * Math.exp(-lt * 5) * 0.18; }); d[i] = s; } });
    B.sting = this._mk(1.8, (d, sr, n) => { const notes = [392, 523.25, 659.25, 783.99, 1046.5]; for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; notes.forEach((f, k) => { const lt = t - k * 0.08; if (lt > 0) s += (Math.sin(TAU * f * lt) + 0.3 * Math.sin(TAU * 2 * f * lt)) * Math.min(1, lt * 150) * Math.exp(-lt * 2.5) * 0.15; }); d[i] = s; } });
    B.crowd = this._mk(6, (d, sr, n) => { let a = 0, b = 0; for (let i = 0; i < n; i++) { const x = rnd(); a += (x - a) * 0.08; b += (a - b) * 0.08; d[i] = (a - b) * 3; } const f = Math.floor(sr * 0.5); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); } });
  }

  _crowd() {
    const s = this.ctx.createBufferSource(); s.buffer = this.buf.crowd; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = 0;
    s.connect(f); f.connect(this.crowdGain); this.crowdGain.connect(this.master); s.start();
    this.crowdFilter = f;
  }

  crowd(level) {
    if (!this.crowdGain) return;
    const now = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(level * 0.45, now, 0.4);
    this.crowdFilter.frequency.setTargetAtTime(600 + level * 400, now, 0.4);
  }

  play(name, { vol = 1, rate = 1 } = {}) {
    if (!this.ctx || !this.enabled || !this.buf[name]) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.buf[name]; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
  }

  chargeStart() {
    if (!this.ctx || !this.enabled || this.charge) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 5; g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(this.master); o.start();
    this.charge = { o, g, f };
  }
  chargeSet(p) {
    const c = this.charge; if (!c) return;
    const now = this.ctx.currentTime;
    c.o.frequency.setTargetAtTime(80 + p * 200, now, 0.03);
    c.f.frequency.setTargetAtTime(400 + p * 2200, now, 0.05);
    c.g.gain.setTargetAtTime(0.02 + p * 0.05, now, 0.05);
  }
  chargeStop() { const c = this.charge; if (!c) return; const now = this.ctx.currentTime; c.g.gain.setTargetAtTime(0, now, 0.03); c.o.stop(now + 0.2); this.charge = null; }
}
