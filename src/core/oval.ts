/**
 * Süper-elips (|x/a|^n + |z/b|^n = 1) yardımcıları.
 * Kutupsal açıdan doğrudan yarıçap verir; tekillik yoktur.
 */
export function ovalRadius(a: number, b: number, n: number, theta: number): number {
  const c = Math.abs(Math.cos(theta)) / a;
  const s = Math.abs(Math.sin(theta)) / b;
  return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
}

/** Noktanın oval içindeki normalize konumu: 1 = tam sınır, <1 içeride. */
export function ovalNorm(a: number, b: number, n: number, x: number, z: number): number {
  return Math.pow(Math.pow(Math.abs(x) / a, n) + Math.pow(Math.abs(z) / b, n), 1 / n);
}
