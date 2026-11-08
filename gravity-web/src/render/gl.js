// WebGL layer: nebula backdrop (rendered once to a texture), twinkling stars,
// shader-lit rotating planets and black holes.
import { BODIES, spinRate } from '../data/bodies.js';

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const NOISE = `
float hash3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23) + vec3(uSeed * 0.137)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float a = hash3(i), b = hash3(i + vec3(1.0,0.0,0.0)), c = hash3(i + vec3(0.0,1.0,0.0)), d = hash3(i + vec3(1.0,1.0,0.0));
  float e = hash3(i + vec3(0.0,0.0,1.0)), g = hash3(i + vec3(1.0,0.0,1.0)), h = hash3(i + vec3(0.0,1.0,1.0)), k = hash3(i + vec3(1.0,1.0,1.0));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z); }
float fbm(vec3 p){ float v = 0.0, amp = 0.5; for (int i = 0; i < 5; i++){ v += amp * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); amp *= 0.5; } return v; }
`;

const PLANET_FRAG = `
precision highp float;
uniform vec2 uCenter; uniform float uRadius; uniform float uRect;
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uHigh; uniform vec3 uAtmo;
uniform float uBanded; uniform float uClouds; uniform float uScale; uniform float uSeed;
uniform float uRot; uniform float uTilt; uniform float uSpot; uniform float uAtmoK; uniform float uIce;
${NOISE}
void main(){
  vec2 p = (gl_FragCoord.xy - uCenter) / uRadius;
  float d = length(p);
  if (d > uRect) discard;
  vec3 L = normalize(vec3(-0.55, 0.5, 0.68));
  vec2 pd = p / max(d, 0.0001);
  float lit = clamp(dot(vec3(pd, 0.3), L) * 0.6 + 0.55, 0.1, 1.0);
  float glow = exp(-max(d - 1.0, 0.0) * (9.0 - uAtmoK * 4.0)) * (0.35 + uAtmoK) * lit;
  vec4 outside = vec4(uAtmo * glow, glow * 0.8);
  vec3 surf = vec3(0.0);
  if (d < 1.0) {
    vec3 n = vec3(p, sqrt(max(1.0 - d * d, 0.0)));
    // axial tilt (Uranus lies on its side)
    float ct = cos(uTilt), st = sin(uTilt);
    vec3 nt = vec3(n.x * ct - n.y * st, n.x * st + n.y * ct, n.z);
    float ca = cos(uRot), sa = sin(uRot);
    vec3 q = vec3(nt.x * ca + nt.z * sa, nt.y, -nt.x * sa + nt.z * ca);
    float hgt = fbm(q * uScale);
    if (uBanded > 0.5) {
      float warp = fbm(q * uScale * 1.6 + vec3(3.0, 1.0, 2.0)) - 0.5;
      float bands = 0.5 + 0.5 * sin((q.y * 8.0 + warp * 2.6) * 2.0);
      surf = mix(uDeep, uMid, bands);
      surf = mix(surf, uHigh, smoothstep(0.55, 0.8, hgt) * 0.6);
      if (uSpot > 0.5) {
        vec3 sp = normalize(vec3(0.35, -0.32, 0.88));
        float sd = length((q - sp) * vec3(1.0, 1.7, 1.0));
        surf = mix(surf, vec3(0.78, 0.33, 0.2), smoothstep(0.24, 0.14, sd));
      }
    } else {
      surf = mix(uDeep, uMid, smoothstep(0.42, 0.52, hgt));
      surf = mix(surf, uHigh, smoothstep(0.6, 0.74, hgt));
      if (uIce > 0.5) surf = mix(surf, vec3(0.95), smoothstep(0.72, 0.9, abs(q.y)));
      float cl = fbm(q * uScale * 1.7 + vec3(uRot * 0.3, 0.0, 4.0));
      surf = mix(surf, vec3(0.96, 0.97, 1.0), smoothstep(0.55, 0.76, cl) * uClouds);
    }
    float ndl = dot(n, L);
    surf *= 0.04 + 0.96 * smoothstep(-0.25, 0.9, ndl);
    vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
    surf += vec3(0.22) * pow(max(dot(n, hv), 0.0), 36.0) * (1.0 - uBanded) * 0.6;
    float rim = pow(1.0 - n.z, 2.4);
    surf += uAtmo * rim * (0.2 + uAtmoK) * (0.25 + 0.75 * clamp(ndl + 0.3, 0.0, 1.0));
  }
  float edge = clamp((1.0 - d) * uRadius * 0.9, 0.0, 1.0);
  vec4 col = mix(outside, vec4(surf, 1.0), edge);
  gl_FragColor = vec4(col.rgb, col.a);
}`;

// Black hole: shadow at ~2.6 r_s (real), photon ring, Doppler-beamed accretion disk.
const HOLE_FRAG = `
precision highp float;
uniform vec2 uCenter; uniform float uRadius; uniform float uRect; uniform float uRot; uniform float uSeed;
${NOISE}
void main(){
  vec2 p = (gl_FragCoord.xy - uCenter) / uRadius;      // units of r_s
  float d = length(p);
  if (d > uRect) discard;
  // accretion disk seen at an angle (squashed), plus the lensed far side above
  vec2 q = vec2(p.x, p.y / 0.32);
  float dq = length(q);
  float ang = atan(q.y, q.x);
  float swirl = fbm(vec3(cos(ang - uRot * 2.0) * 2.0, sin(ang - uRot * 2.0) * 2.0, dq * 1.5));
  float disk = smoothstep(2.9, 3.4, dq) * (1.0 - smoothstep(5.5, 8.5, dq)) * (0.55 + 0.9 * swirl);
  float doppler = 0.55 + 0.45 * (-p.x / max(dq, 0.001));
  vec3 hot = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.92, 0.75), swirl);
  vec3 c = hot * disk * doppler * 1.6;
  float lensed = exp(-pow((length(vec2(p.x, (p.y - 0.4) * 1.15)) - 3.1) * 2.2, 2.0)) * step(0.0, p.y) * 0.8;
  c += vec3(1.0, 0.7, 0.4) * lensed * (0.6 + 0.4 * swirl);
  float ring = exp(-pow((d - 2.6) * 9.0, 2.0));
  c += vec3(1.0, 0.85, 0.65) * ring * 1.3;
  float shadow = smoothstep(2.62, 2.45, d);
  bool front = p.y < 0.0 && disk > 0.01;
  if (!front) c *= 1.0 - shadow;
  float a = clamp(max(max(c.r, c.g), c.b), 0.0, 1.0);
  a = max(a, shadow);
  gl_FragColor = vec4(c, a);
}`;

const NEBULA_FRAG = `
precision highp float;
uniform vec2 uRes; uniform vec3 uA; uniform vec3 uB; uniform vec3 uBase; uniform float uSeed;
${NOISE}
float fbm2(vec3 p){ float v = 0.0, amp = 0.5; for (int i = 0; i < 4; i++){ v += amp * vnoise(p); p = p * 2.07 + vec3(3.1, 1.7, 0.4); amp *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 p = vec3(uv.x * uRes.x / uRes.y, uv.y, 0.0) * 2.4;
  float n1 = fbm2(p + vec3(uSeed));
  float n2 = fbm2(p * 1.7 + vec3(5.2, 1.3, 2.0) + vec3(n1 * 1.4));
  vec3 c = uBase;
  c = mix(c, uA, smoothstep(0.42, 0.86, n1) * 0.8);
  c = mix(c, uB, smoothstep(0.5, 0.92, n2) * 0.7);
  float dust = smoothstep(0.55, 0.75, fbm2(p * 3.0 + vec3(9.0)));
  c *= 1.0 - dust * 0.35;
  float vig = smoothstep(1.25, 0.3, length((uv - 0.5) * vec2(1.0, 1.25)) * 1.5);
  c *= mix(0.5, 1.0, vig);
  gl_FragColor = vec4(c, 1.0);
}`;

const TEX_FRAG = `precision mediump float; uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uOff;
void main(){ vec2 uv = gl_FragCoord.xy / uRes * 0.9 + 0.05 + uOff; gl_FragColor = texture2D(uTex, uv); }`;

const STAR_VERT = `attribute vec3 aStar; uniform vec2 uRes; uniform vec2 uOff; uniform float uTime; uniform float uDpr; varying float vA;
void main(){ vec2 pos = fract(aStar.xy + uOff * aStar.z) * 2.0 - 1.0; gl_Position = vec4(pos, 0.0, 1.0);
  float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aStar.z * 3.0) + aStar.x * 40.0);
  vA = tw * (0.35 + aStar.z * 0.9); gl_PointSize = (0.8 + aStar.z * 2.4) * uDpr; }`;
const STAR_FRAG = `precision mediump float; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a); }`;

export const PALETTE = {
  mercury: { deep: [0.35, 0.33, 0.32], mid: [0.55, 0.52, 0.5], high: [0.75, 0.72, 0.68], atmo: [0.7, 0.7, 0.75], scale: 4.0 },
  venus: { deep: [0.72, 0.55, 0.3], mid: [0.9, 0.78, 0.52], high: [0.98, 0.92, 0.75], atmo: [1.0, 0.82, 0.5], scale: 1.8, clouds: 0.85 },
  earth: { deep: [0.04, 0.14, 0.42], mid: [0.1, 0.45, 0.25], high: [0.8, 0.76, 0.6], atmo: [0.4, 0.72, 1.0], scale: 2.4, clouds: 0.55, ice: 1 },
  moon: { deep: [0.3, 0.3, 0.32], mid: [0.52, 0.52, 0.54], high: [0.75, 0.75, 0.76], atmo: [0.7, 0.75, 0.85], scale: 4.2 },
  mars: { deep: [0.45, 0.16, 0.07], mid: [0.75, 0.35, 0.16], high: [0.92, 0.65, 0.45], atmo: [1.0, 0.55, 0.35], scale: 3.0, ice: 1 },
  rock: { deep: [0.25, 0.22, 0.2], mid: [0.42, 0.38, 0.34], high: [0.6, 0.56, 0.5], atmo: [0.5, 0.5, 0.5], scale: 5.0 },
  jupiter: { deep: [0.62, 0.42, 0.28], mid: [0.92, 0.82, 0.66], high: [0.98, 0.95, 0.88], atmo: [1.0, 0.85, 0.6], scale: 2.0, banded: 1, spot: 1 },
  io: { deep: [0.75, 0.62, 0.2], mid: [0.95, 0.85, 0.35], high: [0.55, 0.3, 0.12], atmo: [1.0, 0.9, 0.5], scale: 3.6 },
  europa: { deep: [0.62, 0.55, 0.45], mid: [0.88, 0.85, 0.8], high: [0.6, 0.42, 0.3], atmo: [0.8, 0.9, 1.0], scale: 3.4 },
  ganymede: { deep: [0.35, 0.32, 0.3], mid: [0.6, 0.57, 0.52], high: [0.82, 0.8, 0.76], atmo: [0.75, 0.8, 0.9], scale: 3.2 },
  callisto: { deep: [0.22, 0.2, 0.18], mid: [0.4, 0.36, 0.32], high: [0.7, 0.68, 0.64], atmo: [0.6, 0.65, 0.75], scale: 4.4 },
  saturn: { deep: [0.72, 0.6, 0.4], mid: [0.92, 0.84, 0.64], high: [0.98, 0.94, 0.82], atmo: [1.0, 0.9, 0.65], scale: 1.8, banded: 1 },
  titan: { deep: [0.62, 0.45, 0.18], mid: [0.82, 0.62, 0.3], high: [0.92, 0.78, 0.45], atmo: [1.0, 0.7, 0.3], scale: 1.6, clouds: 0.6 },
  uranus: { deep: [0.45, 0.78, 0.82], mid: [0.6, 0.88, 0.9], high: [0.78, 0.95, 0.96], atmo: [0.6, 0.95, 1.0], scale: 1.5, banded: 1 },
  neptune: { deep: [0.12, 0.25, 0.7], mid: [0.25, 0.45, 0.92], high: [0.75, 0.85, 1.0], atmo: [0.4, 0.6, 1.0], scale: 1.8, banded: 1 },
  triton: { deep: [0.6, 0.55, 0.55], mid: [0.82, 0.76, 0.75], high: [0.95, 0.88, 0.86], atmo: [0.8, 0.85, 1.0], scale: 3.4 },
  pluto: { deep: [0.45, 0.32, 0.25], mid: [0.75, 0.62, 0.52], high: [0.95, 0.92, 0.88], atmo: [0.8, 0.85, 1.0], scale: 2.8 },
  charon: { deep: [0.35, 0.34, 0.34], mid: [0.55, 0.54, 0.54], high: [0.7, 0.68, 0.66], atmo: [0.7, 0.7, 0.8], scale: 3.6 },
};

export const NEBULA = {
  blue: { base: [0.012, 0.014, 0.045], a: [0.05, 0.12, 0.32], b: [0.16, 0.05, 0.3] },
  amber: { base: [0.03, 0.018, 0.02], a: [0.32, 0.14, 0.05], b: [0.08, 0.1, 0.28] },
  violet: { base: [0.02, 0.01, 0.04], a: [0.26, 0.05, 0.32], b: [0.04, 0.16, 0.26] },
};

export class GLRenderer {
  constructor(canvas) {
    this.cv = canvas;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(12), gl.DYNAMIC_DRAW);
    this.full = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.full);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.planet = this._prog(VERT, PLANET_FRAG);
    this.hole = this._prog(VERT, HOLE_FRAG);
    this.neb = this._prog(VERT, NEBULA_FRAG);
    this.tex = this._prog(VERT, TEX_FRAG);
    this.star = this._prog(STAR_VERT, STAR_FRAG, 'aStar');
    const stars = new Float32Array(420 * 3);
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 420; i++) { stars[i * 3] = r(); stars[i * 3 + 1] = r(); stars[i * 3 + 2] = Math.pow(r(), 2.2); }
    this.starBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf);
    gl.bufferData(gl.ARRAY_BUFFER, stars, gl.STATIC_DRAW);
    this.nebulaTex = null;
    this.hue = 'blue';
  }

  _prog(vs, fs, attr = 'aPos') {
    const gl = this.gl;
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    // uniform locations, looked up lazily (null for uniforms the compiler removed)
    const cache = {};
    const u = new Proxy(cache, { get: (t, k) => (k in t ? t[k] : (t[k] = gl.getUniformLocation(p, k))) });
    return { p, u, a: gl.getAttribLocation(p, attr) };
  }

  resize(w, h, dpr) {
    this.w = Math.round(w * dpr); this.h = Math.round(h * dpr); this.dpr = dpr;
    this.cv.width = this.w; this.cv.height = this.h;
    this.gl.viewport(0, 0, this.w, this.h);
    this.nebulaTex = null;   // re-render backdrop at the new size
  }

  setHue(h) { if (h !== this.hue) { this.hue = h; this.nebulaTex = null; } }

  _bakeNebula() {
    const gl = this.gl;
    const tw = Math.max(64, Math.round(this.w / 2)), th = Math.max(64, Math.round(this.h / 2));
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, tw, th);
    const P = this.neb, c = NEBULA[this.hue];
    gl.useProgram(P.p);
    gl.uniform2f(P.u.uRes, tw, th);
    gl.uniform3fv(P.u.uBase, c.base); gl.uniform3fv(P.u.uA, c.a); gl.uniform3fv(P.u.uB, c.b);
    gl.uniform1f(P.u.uSeed, { blue: 1.3, amber: 4.1, violet: 7.7 }[this.hue]);
    this._drawFull(P);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.viewport(0, 0, this.w, this.h);
    this.nebulaTex = tex;
  }

  _drawFull(P) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.full);
    gl.enableVertexAttribArray(P.a);
    gl.vertexAttribPointer(P.a, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // Quad around a screen-space circle (CSS px, y down).
  _drawQuad(P, x, y, half) {
    const gl = this.gl, d = this.dpr;
    const x0 = ((x - half) * d / this.w) * 2 - 1, x1 = ((x + half) * d / this.w) * 2 - 1;
    const y0 = 1 - ((y - half) * d / this.h) * 2, y1 = 1 - ((y + half) * d / this.h) * 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([x0, y1, x1, y1, x0, y0, x0, y0, x1, y1, x1, y0]));
    gl.enableVertexAttribArray(P.a);
    gl.vertexAttribPointer(P.a, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** bodies: [{key, kind, sx, sy, sr, seed}] in CSS px; parallax: CSS px offset */
  render(bodies, time, parallax = { x: 0, y: 0 }) {
    const gl = this.gl;
    if (!this.nebulaTex) this._bakeNebula();
    gl.disable(gl.BLEND);
    const T = this.tex;
    gl.useProgram(T.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.nebulaTex);
    gl.uniform1i(T.u.uTex, 0);
    gl.uniform2f(T.u.uRes, this.w, this.h);
    gl.uniform2f(T.u.uOff, -parallax.x / this.w * 0.15, parallax.y / this.h * 0.15);
    this._drawFull(T);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const S = this.star;
    gl.useProgram(S.p);
    gl.uniform1f(S.u.uTime, time);
    gl.uniform1f(S.u.uDpr, this.dpr);
    gl.uniform2f(S.u.uOff, -parallax.x / this.w * 0.4, parallax.y / this.h * 0.4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf);
    gl.enableVertexAttribArray(S.a);
    gl.vertexAttribPointer(S.a, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, 420);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const b of bodies) {
      if (b.kind === 'blackhole') {
        const P = this.hole;
        gl.useProgram(P.p);
        const rect = 9;
        gl.uniform2f(P.u.uCenter, b.sx * this.dpr, this.h - b.sy * this.dpr);
        gl.uniform1f(P.u.uRadius, b.sr * this.dpr);
        gl.uniform1f(P.u.uRect, rect);
        gl.uniform1f(P.u.uRot, time * 0.6);
        gl.uniform1f(P.u.uSeed, b.seed);
        this._drawQuad(P, b.sx, b.sy, b.sr * rect);
        continue;
      }
      const pal = PALETTE[b.key] || PALETTE.rock;
      const P = this.planet;
      gl.useProgram(P.p);
      const atmoK = Math.min(1, Math.sqrt(BODIES[b.key]?.atmBar || 0) * 0.12);
      const rect = 1.45 + atmoK * 0.4;
      gl.uniform2f(P.u.uCenter, b.sx * this.dpr, this.h - b.sy * this.dpr);
      gl.uniform1f(P.u.uRadius, b.sr * this.dpr);
      gl.uniform1f(P.u.uRect, rect);
      gl.uniform3fv(P.u.uDeep, pal.deep); gl.uniform3fv(P.u.uMid, pal.mid); gl.uniform3fv(P.u.uHigh, pal.high); gl.uniform3fv(P.u.uAtmo, pal.atmo);
      gl.uniform1f(P.u.uBanded, pal.banded || 0);
      gl.uniform1f(P.u.uClouds, pal.clouds || 0);
      gl.uniform1f(P.u.uScale, pal.scale);
      gl.uniform1f(P.u.uSeed, b.seed);
      gl.uniform1f(P.u.uRot, time * spinRate(b.key) + b.seed);
      gl.uniform1f(P.u.uTilt, b.key === 'uranus' ? 1.71 : 0.0);
      gl.uniform1f(P.u.uSpot, pal.spot || 0);
      gl.uniform1f(P.u.uAtmoK, atmoK);
      gl.uniform1f(P.u.uIce, pal.ice || 0);
      this._drawQuad(P, b.sx, b.sy, b.sr * rect);
    }
  }
}
