// Haptic feedback.
//  * Android / Chrome: navigator.vibrate with short patterns.
//  * iPhone Safari has no vibrate API. iOS 18+ plays a system haptic when a
//    native <input type="checkbox" switch> toggles, so we toggle a hidden one.
//    It works best inside a touch event; elsewhere it may stay silent.
let iosLabel = null;
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);

function setupIOS() {
  if (iosLabel || !isIOS) return;
  const id = 'haptic-switch';
  const input = document.createElement('input');
  input.type = 'checkbox'; input.id = id; input.setAttribute('switch', '');
  const label = document.createElement('label');
  label.htmlFor = id;
  for (const el of [input, label]) Object.assign(el.style, { position: 'fixed', left: '-100px', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
  document.body.append(input, label);
  iosLabel = label;
}

export const haptics = {
  enabled: true,
  _last: 0,
  pulse(ms = 10, pattern = null) {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this._last < 35) return;          // avoid buzzing
    this._last = now;
    if (canVibrate) { try { navigator.vibrate(pattern || ms); } catch (_) { /* ignore */ } return; }
    setupIOS();
    iosLabel?.click();
  },
  tick() { this.pulse(6); },
  light() { this.pulse(12); },
  medium() { this.pulse(25); },
  heavy() { this.pulse(60, [60, 30, 40]); },
  success() { this.pulse(30, [20, 40, 20, 40, 60]); },
};
