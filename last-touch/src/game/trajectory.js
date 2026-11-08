import * as THREE from 'three';

// An "assisted" ball flight: the ground path is a quadratic Bezier (straight
// or curved), the height is a smooth arc, and speed follows a profile.
// It is deterministic, so the preview line and the real flight are identical.
export class Trajectory {
  /**
   * @param {object} o
   * @param {THREE.Vector3} o.start  start position (y = height)
   * @param {THREE.Vector3} o.end    end position (y = height)
   * @param {number} o.bend          signed sideways offset (m) at the middle of the path
   * @param {number} o.duration      seconds
   * @param {number} o.decel         0 = constant speed, 0.4 = ends at 60% speed
   * @param {number} o.arc           extra height (m) at the middle
   */
  constructor({ start, end, bend = 0, duration, decel = 0, arc = 0 }) {
    this.start = start.clone();
    this.end = end.clone();
    this.duration = Math.max(0.05, duration);
    this.decel = decel;
    this.arc = arc;
    this.bend = bend;
    const dx = end.x - start.x, dz = end.z - start.z;
    const len = Math.hypot(dx, dz) || 1;
    this.dir = new THREE.Vector2(dx / len, dz / len);
    // left-hand perpendicular in the XZ plane
    this.perp = new THREE.Vector2(-this.dir.y, this.dir.x);
    // control point so that B(0.5) is offset by `bend`
    const mx = (start.x + end.x) / 2, mz = (start.z + end.z) / 2;
    this.cx = mx + this.perp.x * bend * 2;
    this.cz = mz + this.perp.y * bend * 2;
    // arc-length table for even speed along the curve
    const N = 48;
    this.table = [0];
    let px = start.x, pz = start.z, acc = 0;
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const [x, z] = this._bez(u);
      acc += Math.hypot(x - px, z - pz);
      this.table.push(acc);
      px = x; pz = z;
    }
    this.length = acc;
  }

  _bez(u) {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    return [a * this.start.x + b * this.cx + c * this.end.x, a * this.start.z + b * this.cz + c * this.end.z];
  }

  // fraction of the length covered at normalized time tau
  _progress(tau) {
    const a = this.decel;
    return (tau * (2 - a * tau)) / (2 - a);
  }

  _uAtDistance(s) {
    const t = this.table, N = t.length - 1;
    if (s <= 0) return 0;
    if (s >= this.length) return 1;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] < s) lo = m; else hi = m; }
    const f = (s - t[lo]) / (t[hi] - t[lo] || 1);
    return (lo + f) / N;
  }

  positionAt(time, out = new THREE.Vector3()) {
    const tau = Math.min(Math.max(time / this.duration, 0), 1);
    const u = this._uAtDistance(this._progress(tau) * this.length);
    const [x, z] = this._bez(u);
    const y = this.start.y + (this.end.y - this.start.y) * tau + 4 * this.arc * tau * (1 - tau);
    return out.set(x, y, z);
  }

  velocityAt(time, out = new THREE.Vector3()) {
    const h = 1 / 240;
    const t0 = Math.min(Math.max(time - h, 0), this.duration - 2 * h);
    const a = this.positionAt(t0), b = this.positionAt(t0 + 2 * h);
    return out.subVectors(b, a).multiplyScalar(1 / (2 * h));
  }

  // Evenly spaced sample points for the preview line.
  samples(count = 40) {
    const pts = [];
    for (let i = 0; i <= count; i++) pts.push(this.positionAt((i / count) * this.duration));
    return pts;
  }
}
