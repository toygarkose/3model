// Touch / mouse path drawing. Collects screen points (CSS px + timestamps)
// and draws the glowing finger trail on a 2D overlay canvas.
export class GestureInput {
  constructor(target, overlay) {
    this.el = target;
    this.cv = overlay;
    this.ctx = overlay.getContext('2d');
    this.points = [];
    this.active = false;
    this.fade = 0;
    this.enabled = false;
    this.handlers = { start: () => false, move: () => {}, end: () => {} };
    this.pointerId = null;
    target.addEventListener('pointerdown', e => this._down(e));
    target.addEventListener('pointermove', e => this._move(e));
    target.addEventListener('pointerup', e => this._up(e, false));
    target.addEventListener('pointercancel', e => this._up(e, true));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  on(handlers) { Object.assign(this.handlers, handlers); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cv.width = Math.round(window.innerWidth * dpr);
    this.cv.height = Math.round(window.innerHeight * dpr);
  }

  _pt(e) { return { x: e.clientX, y: e.clientY, t: performance.now() }; }

  _down(e) {
    if (!this.enabled || this.active) return;
    const p = this._pt(e);
    if (!this.handlers.start(p)) return;
    this.active = true;
    this.pointerId = e.pointerId;
    this.points = [p];
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    e.preventDefault();
  }

  _move(e) {
    if (!this.active || e.pointerId !== this.pointerId) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ce of events) {
      const p = this._pt(ce);
      const last = this.points[this.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 3) this.points.push(p);
    }
    this.handlers.move(this.points);
  }

  _up(e, cancelled) {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this.active = false;
    this.fade = 1;
    this.handlers.end(this.points, cancelled);
  }

  // Used by automated tests and the tutorial ghost-hand.
  inject(points) {
    this.points = points.slice();
    this.fade = 1;
    this.handlers.move(this.points);
    this.handlers.end(this.points, false);
  }

  cancel() { this.active = false; this.points = []; this.fade = 0; }

  draw(dt) {
    const g = this.ctx, d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!this.active) this.fade = Math.max(0, this.fade - dt * 2.5);
    const alpha = this.active ? 1 : this.fade;
    const pts = this.points;
    if (alpha <= 0 || pts.length < 2) return;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = `rgba(255,176,32,${0.25 * alpha})`; g.lineWidth = 18;
    this._path(pts); g.stroke();
    g.strokeStyle = `rgba(255,236,190,${0.95 * alpha})`; g.lineWidth = 5;
    this._path(pts); g.stroke();
    const e = pts[pts.length - 1];
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    g.beginPath(); g.arc(e.x, e.y, 7, 0, Math.PI * 2); g.fill();
  }

  _path(pts) {
    const g = this.ctx;
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      g.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }
}
