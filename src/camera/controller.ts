import * as THREE from 'three';
import type { VenueConfig } from '../config/venue';
import { ovalNorm } from '../core/oval';
import { clamp, damp, easeInOutCubic, easeOutCubic, lerp, smoothstep, wrapAngle } from '../core/rng';
import { EYE_HEIGHT, outerOffset, type SeatData } from '../data/seats';

interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
}

interface OrbitParams {
  az: number;
  polar: number;
  zoom: number;
}

type ControllerState = 'intro' | 'orbit' | 'tween' | 'flight' | 'seat' | 'hop';

const DEFAULT_ORBIT: OrbitParams = { az: Math.PI / 2 + 0.08, polar: 1.02, zoom: 0.12 };
const POLAR_MIN = 0.1;
const POLAR_MAX = 1.5;
const SEAT_FOV_MAX = 72;
const SEAT_FOV_MIN = 22;
const SEAT_YAW_LIMIT = (115 * Math.PI) / 180;
const SEAT_PITCH_UP = (32 * Math.PI) / 180;
const SEAT_PITCH_DOWN = (38 * Math.PI) / 180;

/**
 * Kamera kontrolcüsü: orbit (dışarıdan gezinme), koltuğa uçuş ve koltuk görünümü.
 * Geçişler sırasında `locked` true döner; girdi katmanı bunu kontrol eder.
 */
export class CameraController {
  private state: ControllerState = 'intro';
  private orbit: OrbitParams = { ...DEFAULT_ORBIT };
  private orbitTarget: OrbitParams = { ...DEFAULT_ORBIT };
  private tweenFrom: OrbitParams = { ...DEFAULT_ORBIT };
  private tweenTo: OrbitParams = { ...DEFAULT_ORBIT };
  private tweenT = 0;
  private tweenDur = 1;
  private tweenEase: (t: number) => number = easeInOutCubic;
  private tweenDone: (() => void) | null = null;

  private flightFrom: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 42 };
  private flightTo: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60 };
  private c1 = new THREE.Vector3();
  private c2 = new THREE.Vector3();
  private flightT = 0;
  private flightDur = 1.3;
  private flightDone: (() => void) | null = null;
  private flightEndState: ControllerState = 'seat';

  private seatIndex = -1;
  private seatEye = new THREE.Vector3();
  private lookYaw = 0;
  private lookPitch = 0;
  private lookYawT = 0;
  private lookPitchT = 0;
  private seatFov = 62;
  private seatFovT = 62;
  /** Etkinliğin odak noktası (koltuktan varsayılan bakış hedefi). */
  readonly focus = new THREE.Vector3(0, 1.2, 0);

  private readonly outer: number;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly venue: VenueConfig,
    private readonly seats: SeatData,
  ) {
    this.outer = outerOffset(venue, seats.tiers);
  }

  get locked(): boolean {
    return this.state === 'intro' || this.state === 'flight' || this.state === 'tween' || this.state === 'hop';
  }

  get inSeat(): boolean {
    return this.state === 'seat' || this.state === 'hop';
  }

  get currentSeat(): number {
    return this.seatIndex;
  }

  /** Mini harita için: orbit zoom oranı (0-1). */
  get zoomLevel(): number {
    return this.orbit.zoom;
  }

  // ---------- Orbit ----------

  /** Orbit parametrelerinden kamera pozu. Zoom arttıkça pivot karşı tribüne kayar. */
  private orbitPose(p: OrbitParams, out: Pose): Pose {
    const z = p.zoom;
    const zc = clamp(z, 0, 1);
    // Dikey ekranda yatay görüş dar: uzak planda kamerayı geri çek ki stadyum kadraja sığsın.
    const aspect = this.camera.aspect;
    const narrow = aspect < 1 ? Math.min(2, Math.pow(1 / aspect, 0.8)) : 1;
    const dist = 360 * Math.pow(64 / 360, z) * lerp(narrow, 1, zc);
    const shift = 74 * smoothstep(0.34, 1, zc);
    const dirX = Math.cos(p.az);
    const dirZ = Math.sin(p.az);
    const pivot = this.tmpV.set(-dirX * shift, lerp(2, 13, zc), -dirZ * shift);
    const sp = Math.sin(p.polar);
    out.pos.set(pivot.x + dirX * sp * dist, pivot.y + Math.cos(p.polar) * dist, pivot.z + dirZ * sp * dist);
    out.pos.y = Math.max(out.pos.y, this.minHeight(out.pos.x, out.pos.z));
    this.tmpM.lookAt(out.pos, pivot, this.up);
    out.quat.setFromRotationMatrix(this.tmpM);
    const portrait = aspect < 1 ? 1.25 : 1;
    out.fov = lerp(42, 30, zc) * portrait;
    return out;
  }

  /** Kamera tribünlerin içine girmesin: stadyum izdüşümünün üstünde asgari yükseklik. */
  private minHeight(x: number, z: number): number {
    const { a, b, exponent: n } = this.venue.bowl;
    const uIn = ovalNorm(a, b, n, x, z);
    const uOut = ovalNorm(a + this.outer + 14, b + this.outer + 14, n, x, z);
    const top = this.venue.facade.height + 12;
    if (uIn < 1) return lerp(6, top, smoothstep(0.72, 1, uIn));
    return lerp(top, 3, smoothstep(1, 1.22, uOut));
  }

  rotate(dx: number, dy: number): void {
    if (this.state !== 'orbit') return;
    this.orbitTarget.az -= dx * 0.0052;
    this.orbitTarget.polar = clamp(this.orbitTarget.polar - dy * 0.0042, POLAR_MIN, POLAR_MAX);
  }

  /** delta > 0 yakınlaştırır. Orbit'te zoom oranı, koltukta görüş açısı değişir. */
  zoom(delta: number): void {
    if (this.state === 'orbit') {
      this.orbitTarget.zoom = clamp(this.orbitTarget.zoom + delta, 0, 1);
    } else if (this.state === 'seat') {
      this.seatFovT = clamp(this.seatFovT - delta * 60, SEAT_FOV_MIN, SEAT_FOV_MAX);
    }
  }

  look(dx: number, dy: number): void {
    if (this.state !== 'seat') return;
    const k = (this.seatFov / 62) * 0.0034;
    this.lookYawT = clamp(this.lookYawT + dx * k, -SEAT_YAW_LIMIT, SEAT_YAW_LIMIT);
    this.lookPitchT = clamp(this.lookPitchT + dy * k, -SEAT_PITCH_DOWN, SEAT_PITCH_UP);
  }

  private startTween(to: OrbitParams, dur: number, ease: (t: number) => number, done?: () => void): void {
    this.tweenFrom = { ...this.orbit };
    this.tweenTo = { ...to };
    // En kısa yoldan dön
    this.tweenTo.az = this.tweenFrom.az + wrapAngle(to.az - this.tweenFrom.az);
    this.tweenT = 0;
    this.tweenDur = dur;
    this.tweenEase = ease;
    this.tweenDone = done ?? null;
    this.state = 'tween';
  }

  reset(): void {
    if (this.state !== 'orbit') return;
    this.startTween(DEFAULT_ORBIT, 0.9, easeInOutCubic);
  }

  /** Kamerayı bloğu karşıdan görecek şekilde döndürür. */
  focusAngle(angle: number, tier: number): void {
    if (this.state !== 'orbit') return;
    const zoom = tier === 0 ? 0.78 : tier === 1 ? 0.72 : 0.6;
    const polar = tier === 2 ? 1.02 : 1.12;
    this.startTween({ az: angle + Math.PI, polar, zoom }, 1.0, easeInOutCubic);
  }

  /** Açılış: uzaktan stadyuma doğru yumuşak giriş. */
  playIntro(done: () => void): void {
    this.orbit = { az: DEFAULT_ORBIT.az - 1.1, polar: 1.32, zoom: -0.42 };
    this.orbitTarget = { ...DEFAULT_ORBIT };
    this.startTween(DEFAULT_ORBIT, 2.8, easeOutCubic, done);
    this.state = 'intro';
    this.applyOrbit();
  }

  private applyOrbit(): void {
    const pose = this.orbitPose(this.orbit, this.flightFrom);
    this.camera.position.copy(pose.pos);
    this.camera.quaternion.copy(pose.quat);
    this.setFov(pose.fov);
  }

  private setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // ---------- Koltuk ----------

  private seatPose(seat: number, out: Pose, yawOff: number, pitchOff: number, fov: number): Pose {
    const d = this.seats;
    const yaw = d.yaw[seat];
    out.pos.set(d.pos[seat * 3] + Math.sin(yaw) * 0.26, d.pos[seat * 3 + 1] + EYE_HEIGHT, d.pos[seat * 3 + 2] + Math.cos(yaw) * 0.26);
    const dir = this.tmpV2.copy(this.focus).sub(out.pos);
    const baseYaw = Math.atan2(-dir.x, -dir.z);
    const basePitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    this.euler.set(basePitch + pitchOff, baseYaw + yawOff, 0);
    out.quat.setFromEuler(this.euler);
    out.fov = fov;
    return out;
  }

  private beginFlight(dur: number, endState: ControllerState, done?: () => void): void {
    this.flightFrom.pos.copy(this.camera.position);
    this.flightFrom.quat.copy(this.camera.quaternion);
    this.flightFrom.fov = this.camera.fov;
    this.flightT = 0;
    this.flightDur = dur;
    this.flightEndState = endState;
    this.flightDone = done ?? null;
    this.state = 'flight';
  }

  /** Orbit'ten koltuğun göz hizasına iniş. */
  flyToSeat(seat: number, done?: () => void): void {
    this.seatIndex = seat;
    this.lookYaw = this.lookYawT = 0;
    this.lookPitch = this.lookPitchT = 0;
    this.seatFov = this.seatFovT = this.camera.aspect < 1 ? 70 : 62;
    this.beginFlight(1.35, 'seat', done);
    this.seatPose(seat, this.flightTo, 0, 0, this.seatFov);
    this.seatEye.copy(this.flightTo.pos);
    // Kontrol noktaları çanağın açık iç hacminde: tribün ve çatının içinden geçilmez.
    const from = this.flightFrom.pos;
    const to = this.flightTo.pos;
    this.c1.set(from.x * 0.55, Math.max(from.y, this.venue.facade.height + 28), from.z * 0.55);
    const inward = this.tmpV.set(-to.x, 0, -to.z).normalize();
    this.c2.copy(to).addScaledVector(inward, 26).setY(to.y + 14);
  }

  /** Koltuktan orbit konumuna aynı uçuşla geri çıkış. */
  flyToOrbit(done?: () => void): void {
    if (this.state !== 'seat') return;
    this.beginFlight(1.25, 'orbit', done);
    this.orbit = { ...this.orbitTarget };
    this.orbitPose(this.orbit, this.flightTo);
    const from = this.flightFrom.pos;
    const to = this.flightTo.pos;
    const inward = this.tmpV.set(-from.x, 0, -from.z).normalize();
    this.c1.copy(from).addScaledVector(inward, 26).setY(from.y + 14);
    this.c2.set(to.x * 0.55, Math.max(to.y, this.venue.facade.height + 28), to.z * 0.55);
  }

  /** Koltuk görünümündeyken komşu koltuğa kısa kayma. */
  hopToSeat(seat: number, done?: () => void): void {
    if (this.state !== 'seat') return;
    this.seatIndex = seat;
    this.beginFlight(0.38, 'seat', done);
    this.state = 'hop';
    this.seatPose(seat, this.flightTo, this.lookYawT, this.lookPitchT, this.seatFovT);
    this.seatEye.copy(this.flightTo.pos);
    this.lookYaw = this.lookYawT;
    this.lookPitch = this.lookPitchT;
    this.seatFov = this.seatFovT;
    this.c1.lerpVectors(this.flightFrom.pos, this.flightTo.pos, 0.33);
    this.c2.lerpVectors(this.flightFrom.pos, this.flightTo.pos, 0.66);
  }

  /** Açılışta doğrudan koltuğa yerleş (bağlantıdan gelindiğinde uçuş orbit'ten başlar). */
  setFocus(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
  }

  // ---------- Kare güncellemesi ----------

  update(dt: number): void {
    switch (this.state) {
      case 'intro':
      case 'tween': {
        this.tweenT = Math.min(1, this.tweenT + dt / this.tweenDur);
        const e = this.tweenEase(this.tweenT);
        this.orbit.az = lerp(this.tweenFrom.az, this.tweenTo.az, e);
        this.orbit.polar = lerp(this.tweenFrom.polar, this.tweenTo.polar, e);
        this.orbit.zoom = lerp(this.tweenFrom.zoom, this.tweenTo.zoom, e);
        this.applyOrbit();
        if (this.tweenT >= 1) {
          this.orbitTarget = { ...this.orbit };
          this.state = 'orbit';
          const done = this.tweenDone;
          this.tweenDone = null;
          done?.();
        }
        break;
      }
      case 'orbit': {
        const k = damp(9, dt);
        this.orbit.az += (this.orbitTarget.az - this.orbit.az) * k;
        this.orbit.polar += (this.orbitTarget.polar - this.orbit.polar) * k;
        this.orbit.zoom += (this.orbitTarget.zoom - this.orbit.zoom) * k;
        this.applyOrbit();
        break;
      }
      case 'flight':
      case 'hop': {
        this.flightT = Math.min(1, this.flightT + dt / this.flightDur);
        const e = easeInOutCubic(this.flightT);
        const a = this.flightFrom.pos;
        const b = this.flightTo.pos;
        const u = 1 - e;
        // Kübik Bezier
        this.camera.position
          .copy(a)
          .multiplyScalar(u * u * u)
          .addScaledVector(this.c1, 3 * u * u * e)
          .addScaledVector(this.c2, 3 * u * e * e)
          .addScaledVector(b, e * e * e);
        // Bakış, yolun ikinci yarısında hedefe kilitlenir: iniş hissi.
        const r = this.state === 'hop' ? e : easeInOutCubic(clamp(this.flightT * 1.15, 0, 1));
        this.camera.quaternion.copy(this.flightFrom.quat).slerp(this.flightTo.quat, r);
        // Uçuşun ortasında görüş açısı hafifçe genişler: hız hissi
        const kick = this.state === 'hop' ? 0 : Math.sin(Math.PI * e) * 7;
        this.setFov(lerp(this.flightFrom.fov, this.flightTo.fov, e) + kick);
        if (this.flightT >= 1) {
          this.state = this.flightEndState;
          const done = this.flightDone;
          this.flightDone = null;
          done?.();
        }
        break;
      }
      case 'seat': {
        const k = damp(12, dt);
        this.lookYaw += (this.lookYawT - this.lookYaw) * k;
        this.lookPitch += (this.lookPitchT - this.lookPitch) * k;
        this.seatFov += (this.seatFovT - this.seatFov) * k;
        const pose = this.seatPose(this.seatIndex, this.flightTo, this.lookYaw, this.lookPitch, this.seatFov);
        this.camera.position.copy(pose.pos);
        this.camera.quaternion.copy(pose.quat);
        this.setFov(pose.fov);
        break;
      }
    }
    // Koltukta yakın düzlem küçük: ön sıradaki seyirci kesilmez. Orbit'te derinlik hassasiyeti için büyük.
    const near = this.inSeat || this.state === 'flight' ? 0.2 : 1.5;
    if (this.camera.near !== near) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Önizleme kamerasını koltuk pozuna yerleştirir. */
  poseSeatCamera(cam: THREE.PerspectiveCamera, seat: number): void {
    const pose = this.seatPose(seat, { pos: this.tmpV.clone(), quat: this.tmpQ, fov: 62 }, 0, 0, 62);
    cam.position.copy(pose.pos);
    cam.quaternion.copy(pose.quat);
  }

  /** Komşu koltuğun kameraya göre sağda mı solda mı olduğunu bulur (+1 sağ). */
  sideOf(fromSeat: number, toSeat: number): number {
    const d = this.seats;
    const yaw = d.yaw[fromSeat];
    // Koltuk +Z'ye (sahaya) bakar; sağ vektör = (-cos, 0, sin)
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const dx = d.pos[toSeat * 3] - d.pos[fromSeat * 3];
    const dz = d.pos[toSeat * 3 + 2] - d.pos[fromSeat * 3 + 2];
    return dx * rx + dz * rz >= 0 ? 1 : -1;
  }
}
