// Synthesised audio (WebAudio). No sound files: every effect and the crowd
// are generated once at startup into AudioBuffers.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.enabled = true;
    this.volume = 0.9;
    this.crowdLevel = 0.35;
  }

  // Must be called from a user gesture (browsers block audio before that).
  unlock() {
    try {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? this.volume : 0;
        this.master.connect(this.ctx.destination);
        this._build();
        this._startCrowd();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  _buf(dur, fn) {
    const sr = this.ctx.sampleRate, n = Math.floor(dur * sr);
    const b = this.ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    fn(d, sr, n);
    return b;
  }

  _build() {
    let seed = 99;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
    const TAU = Math.PI * 2;
    const B = this.buffers;
    // kick: low thump + leather click
    B.kick = this._buf(0.25, (d, sr, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * (120 * Math.exp(-t * 30) + 45) / sr; d[i] = Math.sin(ph) * Math.exp(-t * 22) * 0.9 + rnd() * Math.exp(-t * 180) * 0.5; } });
    B.pass = this._buf(0.18, (d, sr, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * (160 * Math.exp(-t * 35) + 70) / sr; d[i] = Math.sin(ph) * Math.exp(-t * 30) * 0.55 + rnd() * Math.exp(-t * 220) * 0.35; } });
    B.trap = this._buf(0.15, (d, sr, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += TAU * 95 / sr; d[i] = Math.sin(ph) * Math.exp(-t * 40) * 0.4 + rnd() * Math.exp(-t * 90) * 0.12; } });
    // net swish: filtered noise
    B.net = this._buf(0.7, (d, sr, n) => { let lp = 0, hp = 0; for (let i = 0; i < n; i++) { const t = i / sr; const x = rnd(); lp += (x - lp) * 0.35; hp = x - lp; d[i] = hp * Math.min(1, t * 60) * Math.exp(-t * 5.5) * 0.7; } });
    // woodwork: inharmonic metal ring
    B.post = this._buf(1.4, (d, sr, n) => { const f = [610, 1340, 2210, 3170]; for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; f.forEach((q, k) => { s += Math.sin(TAU * q * t) * Math.exp(-t * (3 + k * 2)) / (k + 1); }); d[i] = s * 0.5 + rnd() * Math.exp(-t * 200) * 0.4; } });
    // glove save
    B.save = this._buf(0.3, (d, sr, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; lp += (rnd() - lp) * 0.2; d[i] = (lp * 1.6 + Math.sin(TAU * 180 * t) * 0.5) * Math.exp(-t * 18); } });
    // referee whistle
    B.whistle = this._buf(0.9, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const trem = 0.75 + 0.25 * Math.sin(TAU * 28 * t); const env = Math.min(1, t * 30) * Math.min(1, (0.9 - t) * 8); d[i] = (Math.sin(TAU * 2950 * t) + 0.6 * Math.sin(TAU * 3080 * t)) * trem * env * 0.18; } });
    B.click = this._buf(0.06, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU * 1800 * t) * Math.exp(-t * 90) * 0.25; } });
    B.star = this._buf(0.6, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU * 1318 * t) + 0.5 * Math.sin(TAU * 2637 * t)) * Math.min(1, t * 200) * Math.exp(-t * 6) * 0.25; } });
    B.coin = this._buf(0.35, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const f = t < 0.08 ? 1568 : 2093; d[i] = Math.sin(TAU * f * t) * Math.exp(-t * 9) * 0.2; } });
    B.sting = this._buf(1.6, (d, sr, n) => { const notes = [392, 523.25, 659.25, 783.99]; for (let i = 0; i < n; i++) { const t = i / sr; let s = 0; notes.forEach((f, k) => { const lt = t - k * 0.09; if (lt > 0) s += (Math.sin(TAU * f * lt) + 0.35 * Math.sin(TAU * 2 * f * lt)) * Math.min(1, lt * 120) * Math.exp(-lt * 2.6) * 0.16; }); d[i] = s; } });
    // crowd bed: 6 s of band-limited noise with slow swells (seamless loop by crossfade)
    B.crowd = this._buf(6, (d, sr, n) => {
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) { const x = rnd(); a += (x - a) * 0.08; b += (a - b) * 0.08; d[i] = (a - b) * 3; }
      const f = Math.floor(sr * 0.5);
      for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] *= 0.7 + 0.3 * Math.sin(TAU * t / 6 * 2 + 1) ; }
    });
    // roar: big swell for goals
    B.roar = this._buf(4.5, (d, sr, n) => { let a = 0, b = 0; for (let i = 0; i < n; i++) { const t = i / sr; const x = rnd(); a += (x - a) * 0.18; b += (a - b) * 0.05; const env = Math.min(1, t * 2.5) * Math.exp(-Math.max(0, t - 1.2) * 0.9); d[i] = (a - b) * 2.6 * env; } });
    // "ooh": formant-ish swell for near misses and saves
    B.ooh = this._buf(1.8, (d, sr, n) => { let a = 0; for (let i = 0; i < n; i++) { const t = i / sr; a += (rnd() - a) * 0.05; const f = 280 + 140 * Math.min(1, t * 2); const env = Math.min(1, t * 4) * Math.exp(-t * 1.6); d[i] = (a * 2 * Math.sin(TAU * f * t) + a) * env * 0.9; } });
  }

  _startCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.crowd; src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 700; filt.Q.value = 0.6;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = this.crowdLevel;
    src.connect(filt); filt.connect(this.crowdGain); this.crowdGain.connect(this.master);
    src.start();
    this.crowdFilter = filt;
  }

  // 0..1 tension (rises as an attack develops)
  setTension(v) {
    if (!this.ctx || !this.crowdGain) return;
    const now = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(this.crowdLevel * (0.8 + v * 0.9), now, 0.4);
    this.crowdFilter.frequency.setTargetAtTime(600 + v * 500, now, 0.4);
  }

  play(name, { volume = 1, rate = 1, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled || !this.buffers[name]) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffers[name];
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    s.connect(g); g.connect(this.master);
    s.start(this.ctx.currentTime + delay);
  }
}
