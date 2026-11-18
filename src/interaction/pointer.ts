export interface PointerHandlers {
  /** Sürükleme (tek işaretçi). */
  onDrag(dx: number, dy: number): void;
  /** delta > 0 yakınlaştırır (tekerlek ya da iki parmak). */
  onZoom(delta: number): void;
  onHover(x: number, y: number): void;
  onHoverEnd(): void;
  /** Sürükleme eşiğini aşmayan kısa basış. */
  onTap(x: number, y: number, touch: boolean): void;
}

interface Tracked {
  x: number;
  y: number;
  startX: number;
  startY: number;
  t0: number;
  moved: boolean;
}

/**
 * Fare ve dokunmatik için tek girdi katmanı (Pointer Events).
 * Sürükleme ile tıklamayı hareket eşiğiyle ayırır; iki parmak pinch zoom'dur.
 */
export function attachPointer(el: HTMLElement, h: PointerHandlers): () => void {
  const pointers = new Map<number, Tracked>();
  let pinchDist = 0;
  let multi = false;

  const down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* etkin olmayan işaretçi (sentetik olay): yakalamadan devam */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, t0: performance.now(), moved: false });
    if (pointers.size >= 2) {
      multi = true;
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    } else {
      multi = false;
    }
    h.onHoverEnd();
  };

  const move = (e: PointerEvent): void => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') h.onHover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const threshold = e.pointerType === 'mouse' ? 5 : 10;
    if (!p.moved && Math.hypot(p.x - p.startX, p.y - p.startY) > threshold) p.moved = true;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) h.onZoom((d - pinchDist) / 260);
      pinchDist = d;
    } else if (p.moved && !multi) {
      h.onDrag(dx, dy);
    }
  };

  const up = (e: PointerEvent): void => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* zaten bırakılmış */
    }
    if (e.type === 'pointerup' && !p.moved && !multi && performance.now() - p.t0 < 700) {
      h.onTap(e.clientX, e.clientY, e.pointerType !== 'mouse');
    }
    if (pointers.size < 2) pinchDist = 0;
  };

  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 33 : 1;
    h.onZoom(-e.deltaY * unit * 0.0011);
  };
  const leave = (): void => h.onHoverEnd();
  const ctx = (e: Event): void => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', ctx);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('pointerleave', leave);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', ctx);
  };
}
