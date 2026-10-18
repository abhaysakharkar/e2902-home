import * as THREE from 'three';
import { ROOMS } from './plan.js';

// ---------------------------------------------------------------------------
// Reveal map: a small texture laid over the plan. Each texel holds how far the
// real materials have swept across that spot (0 = paper, 1 = finished room).
// ---------------------------------------------------------------------------
const RES = 0.05;
const ORIGIN = new THREE.Vector2(-0.6, -0.6);
const SIZE = new THREE.Vector2(15.4, 11.4);
const FEATHER = 1.1;

export const U = {
  uReveal: { value: null },
  uOrigin: { value: ORIGIN },
  uSize: { value: SIZE },
  uOutside: { value: 0 },
  uPaper: { value: new THREE.Color(0.937, 0.922, 0.886) }, // sRGB, applied after output conversion
  uGold: { value: new THREE.Color(0.80, 0.62, 0.34) },
  uLineFade: { value: 0 },
};

export class RevealMap {
  constructor() {
    this.w = Math.round(SIZE.x / RES);
    this.h = Math.round(SIZE.y / RES);
    this.data = new Uint8Array(this.w * this.h);
    this.tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    U.uReveal.value = this.tex;

    const n = this.w * this.h;
    const owner = new Int16Array(n).fill(-1);
    // Rasterise room rects.
    ROOMS.forEach((r, ri) => {
      for (const [x0, z0, x1, z1] of r.rects) {
        const i0 = Math.max(0, Math.floor((x0 - ORIGIN.x) / RES)), i1 = Math.min(this.w - 1, Math.ceil((x1 - ORIGIN.x) / RES));
        const j0 = Math.max(0, Math.floor((z0 - ORIGIN.y) / RES)), j1 = Math.min(this.h - 1, Math.ceil((z1 - ORIGIN.y) / RES));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (owner[j * this.w + i] < 0) owner[j * this.w + i] = ri;
      }
    });
    // Grow rooms into the walls around them, so a wall belongs to the room it faces.
    for (let pass = 0; pass < 9; pass++) {
      const next = owner.slice();
      for (let j = 1; j < this.h - 1; j++) for (let i = 1; i < this.w - 1; i++) {
        const k = j * this.w + i;
        if (owner[k] >= 0) continue;
        const a = owner[k - 1], b = owner[k + 1], c = owner[k - this.w], d = owner[k + this.w];
        const v = a >= 0 ? a : b >= 0 ? b : c >= 0 ? c : d;
        if (v >= 0) next[k] = v;
      }
      owner.set(next);
    }
    this.owner = owner;
    // Per room: texel list + distance from the sweep's starting point.
    this.rooms = ROOMS.map((r) => ({ idx: [], dist: [], max: 0, p: -1 }));
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const k = j * this.w + i, ri = owner[k];
      if (ri < 0) continue;
      const x = ORIGIN.x + (i + 0.5) * RES, z = ORIGIN.y + (j + 0.5) * RES;
      const f = ROOMS[ri].from, d = Math.hypot(x - f[0], z - f[1]);
      const R = this.rooms[ri];
      R.idx.push(k); R.dist.push(d); R.max = Math.max(R.max, d);
    }
    this.rooms.forEach((R) => { R.idx = Int32Array.from(R.idx); R.dist = Float32Array.from(R.dist); });
    // Texels outside every room follow the outside value.
    this.free = [];
    for (let k = 0; k < n; k++) if (owner[k] < 0) this.free.push(k);
    this.outside = -1;
  }

  set(ri, p) {
    const R = this.rooms[ri];
    p = Math.min(1, Math.max(0, p));
    if (Math.abs(R.p - p) < 0.002) return;
    R.p = p;
    const rad = p * (R.max + FEATHER);
    for (let q = 0; q < R.idx.length; q++) {
      const v = (rad - R.dist[q]) / FEATHER;
      this.data[R.idx[q]] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0;
    }
    this.tex.needsUpdate = true;
  }

  // Which room owns a world position (-1 = none).
  roomAt(x, z) {
    const i = Math.floor((x - ORIGIN.x) / RES), j = Math.floor((z - ORIGIN.y) / RES);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return this.owner[j * this.w + i];
  }

  setOutside(p) {
    if (Math.abs(this.outside - p) < 0.002) return;
    this.outside = p;
    U.uOutside.value = p;
    const v = Math.round(p * 255);
    for (const k of this.free) this.data[k] = v;
    this.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Shader patch: every lit surface is paper until the reveal map says otherwise.
// ---------------------------------------------------------------------------
const MASK_GLSL = /* glsl */ `
uniform sampler2D uReveal; uniform vec2 uOrigin; uniform vec2 uSize; uniform float uOutside;
uniform vec3 uPaper; uniform vec3 uGold;
varying vec3 vRW;
float revealMask(){
  vec2 uv = (vRW.xz - uOrigin) / uSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return uOutside;
  return texture2D(uReveal, uv).r;
}
`;

function patchVertex(src) {
  return 'varying vec3 vRW;\n' + src.replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_INSTANCING
    vRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`);
}

export function reveal(mat, opt = {}) {
  const outside = !!opt.outside;
  const alpha = !!opt.alpha;
  const shade = opt.shade !== false && !outside && mat.isMeshStandardMaterial;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = patchVertex(s.vertexShader);
    s.fragmentShader = MASK_GLSL + s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float m = ${outside ? 'uOutside' : 'revealMask()'};
      vec3 paper = uPaper;
      ${shade ? `vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      paper *= 0.88 + 0.12 * clamp(dot(normal, upV) * 0.5 + 0.5, 0.0, 1.0);` : ''}
      float k = smoothstep(0.3, 0.8, m);
      gl_FragColor.rgb = mix(paper, gl_FragColor.rgb, k);
      ${outside ? '' : `float edge = smoothstep(0.02, 0.18, m) * (1.0 - smoothstep(0.2, 0.5, m));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uGold, edge * 0.5);`}
      ${alpha ? 'gl_FragColor.a *= k;' : ''}
    `);
  };
  mat.customProgramCacheKey = () => `rv${outside ? 1 : 0}${alpha ? 1 : 0}${shade ? 1 : 0}`;
  return mat;
}

// Ink lines: the drawing. They fade out where the room has been revealed.
export function lineMaterial(color, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: `varying vec3 vRW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vRW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: MASK_GLSL + `uniform vec3 uColor; uniform float uOpacity; uniform float uLineFade;
      void main(){
        float m = revealMask();
        // Unrevealed: full ink. Revealed: gone, except for a faint trace on the final plan (uLineFade).
        float a = uOpacity * max(1.0 - smoothstep(0.05, 0.7, m), uLineFade * 0.35 * step(0.5, m));
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
// Texture library (CC0 scans from Poly Haven, 1k).
// ---------------------------------------------------------------------------
export function makeLibrary(manager, renderer) {
  const loader = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const cache = {};
  function set(name) {
    if (cache[name]) return cache[name];
    const base = `assets/tex/${name}/`;
    const t = {};
    for (const k of ['diff', 'nor', 'arm']) {
      t[k] = loader.load(base + k + '.jpg');
      t[k].wrapS = t[k].wrapT = THREE.RepeatWrapping;
      t[k].anisotropy = aniso;
      if (k === 'diff') t[k].colorSpace = THREE.SRGBColorSpace;
    }
    return (cache[name] = t);
  }
  // Textured material; tile is the size in metres one texture repeat covers.
  function pbr(name, tile, params = {}) {
    const t = set(name);
    const rep = 1 / tile;
    const c = (tx) => { const x = tx.clone(); x.repeat.set(rep, rep); x.needsUpdate = true; return x; };
    const arm = c(t.arm);
    const { normalScale, noMap, ...rest } = params;
    const m = new THREE.MeshStandardMaterial({
      map: noMap ? null : c(t.diff), normalMap: c(t.nor), roughnessMap: arm, metalnessMap: arm, aoMap: arm,
      metalness: 0, roughness: 1, envMapIntensity: 0.75, ...rest,
    });
    if (normalScale !== undefined) m.normalScale.set(normalScale, normalScale);
    return reveal(m);
  }
  function solid(params) {
    return reveal(new THREE.MeshStandardMaterial({ envMapIntensity: 0.75, ...params }));
  }
  return { pbr, solid, set };
}

// Procedural canvas textures (tiles, city windows).
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
