import * as THREE from 'three';
import { reveal } from '../js/materials.js';

// Every surface texture is drawn in code: no image files.
// Same API as makeLibrary() in js/materials.js, so js/build.js works unchanged.

let seed = 1;
export const reseed = (n) => { seed = n; };
export const rand = () => rnd();
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

export function canvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}
function tex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Soft value noise, tiled, painted as blotches.
export function blotches(g, S, n, r0, r1, color) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0);
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, color(rnd())); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
}
export function grain(g, x, y, w, h, base, dark, lines) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let i = 0; i < lines; i++) {
    const yy = y + rnd() * h, amp = 1 + rnd() * 3, f = 0.01 + rnd() * 0.03, ph = rnd() * 6;
    g.strokeStyle = dark(rnd()); g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    for (let xx = x; xx <= x + w; xx += 4) g.lineTo(xx, yy + Math.sin(xx * f + ph) * amp);
    g.stroke();
  }
  g.restore();
}

// name → { color canvas, bump canvas }
export const GEN = {
  oak_wood_planks(S) {
    const rows = 6, cols = 2;
    const col = canvas(S, (g) => {
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * S / cols / 2 + rnd() * 30;
        for (let c = -1; c < cols + 1; c++) {
          const l = 68 + rnd() * 10, h = 32 + rnd() * 6;
          grain(g, c * S / cols + off, r * S / rows, S / cols, S / rows, hsl(h, 38, l), (k) => hsl(h - 4, 40, l - 12 - k * 10, 0.35), 26);
        }
      }
      g.fillStyle = 'rgba(60,40,25,0.55)';
      for (let r = 0; r <= rows; r++) g.fillRect(0, r * S / rows - 1, S, 2);
    });
    const bump = canvas(S, (g) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.fillStyle = '#555';
      for (let r = 0; r <= rows; r++) g.fillRect(0, r * S / rows - 1.5, S, 3);
    });
    return { col, bump };
  },
  natural_walnut_veneer(S) {
    const col = canvas(S, (g) => grain(g, 0, 0, S, S, hsl(24, 34, 33), (k) => hsl(20, 40, 18 + k * 10, 0.4), 140));
    return { col };
  },
  marble_01(S) {
    const col = canvas(S, (g) => {
      g.fillStyle = hsl(40, 22, 90); g.fillRect(0, 0, S, S);
      blotches(g, S, 40, 30, 120, (k) => hsl(35, 18, 80 + k * 8, 0.25));
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = hsl(30, 12, 55 + rnd() * 15, 0.35); g.lineWidth = 0.6 + rnd() * 1.6;
        g.beginPath(); let x = rnd() * S, y = 0; g.moveTo(x, y);
        while (y < S) { x += (rnd() - 0.5) * 40; y += 10 + rnd() * 20; g.lineTo(x, y); }
        g.stroke();
      }
      // 800 mm tiles: the texture tile is 1.6 m, so a 2 × 2 grid with grout.
      g.fillStyle = 'rgba(150,140,125,0.6)';
      for (let i = 0; i <= 2; i++) { g.fillRect(i * S / 2 - 1, 0, 2, S); g.fillRect(0, i * S / 2 - 1, S, 2); }
    });
    const bump = canvas(S, (g) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.fillStyle = '#666';
      for (let i = 0; i <= 2; i++) { g.fillRect(i * S / 2 - 1.5, 0, 3, S); g.fillRect(0, i * S / 2 - 1.5, S, 3); }
    });
    return { col, bump };
  },
  white_stucco(S) {
    const col = canvas(S, (g) => { g.fillStyle = '#f2efe9'; g.fillRect(0, 0, S, S); blotches(g, S, 260, 4, 18, (k) => (k > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(200,190,175,0.04)')); });
    const bump = canvas(S, (g) => { g.fillStyle = '#888'; g.fillRect(0, 0, S, S); blotches(g, S, 1200, 1, 4, (k) => (k > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)')); });
    return { col, bump, bumpScale: 0.35 };
  },
  rough_linen(S) {
    const col = canvas(S, (g) => {
      g.fillStyle = '#ddd'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < S; i += 3) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; g.fillRect(i, 0, 1, S); g.fillRect(0, i, S, 1); }
    });
    return { col, bump: col, bumpScale: 0.5 };
  },
  poly_wool_herringbone(S) {
    const col = canvas(S, (g) => {
      g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, S, S);
      const w = S / 16;
      for (let y = -S; y < S * 2; y += w * 2) for (let x = -S; x < S * 2; x += w * 2) {
        g.fillStyle = hsl(35, 12, 62 + rnd() * 10);
        g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(0, 0, w * 2, w * 0.9); g.restore();
        g.fillStyle = hsl(35, 12, 70 + rnd() * 8);
        g.save(); g.translate(x + w, y); g.rotate(-Math.PI / 4); g.fillRect(0, 0, w * 2, w * 0.9); g.restore();
      }
    });
    return { col, bump: col, bumpScale: 0.8 };
  },
  leather_red_02(S) {
    const col = canvas(S, (g) => { g.fillStyle = hsl(14, 45, 32); g.fillRect(0, 0, S, S); blotches(g, S, 120, 4, 22, (k) => hsl(14, 40, 22 + k * 22, 0.35)); });
    const bump = canvas(S, (g) => { g.fillStyle = '#888'; g.fillRect(0, 0, S, S); blotches(g, S, 900, 1, 4, (k) => (k > 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')); });
    return { col, bump, bumpScale: 0.4 };
  },
  wood_textured_concrete(S) {
    const col = canvas(S, (g) => {
      for (let i = 0; i < 10; i++) grain(g, 0, i * S / 10, S, S / 10, hsl(35, 6, 74 + rnd() * 8), (k) => hsl(30, 6, 55 + k * 10, 0.25), 18);
      blotches(g, S, 30, 20, 80, () => 'rgba(90,85,80,0.08)');
    });
    return { col, bump: col, bumpScale: 0.8 };
  },
  rustic_stone_wall(S) {
    const col = canvas(S, (g) => {
      g.fillStyle = hsl(35, 10, 55); g.fillRect(0, 0, S, S);
      let y = 0;
      while (y < S) {
        const h = S / 8 + rnd() * S / 10; let x = -rnd() * 60;
        while (x < S) {
          const w = S / 6 + rnd() * S / 5;
          g.fillStyle = hsl(28 + rnd() * 15, 12 + rnd() * 10, 62 + rnd() * 18);
          g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, h - 6, 10); g.fill();
          x += w;
        }
        y += h;
      }
      blotches(g, S, 60, 6, 30, () => 'rgba(60,50,40,0.12)');
    });
    return { col, bump: col, bumpScale: 3 };
  },
  withered_grass(S) {
    return { col: canvas(S, (g) => { g.fillStyle = hsl(70, 18, 45); g.fillRect(0, 0, S, S); blotches(g, S, 60, 10, 60, (k) => hsl(60 + k * 30, 20, 35 + k * 20, 0.3)); }) };
  },
};

export function makeProcLibrary(renderer) {
  const S = 512;
  const cache = {};
  function set(name) {
    if (cache[name]) return cache[name];
    seed = [...name].reduce((a, c) => a + c.charCodeAt(0) * 7, 11);
    const gen = GEN[name] || GEN.white_stucco;
    const r = gen(S);
    return (cache[name] = { map: tex(r.col, true), bump: r.bump ? tex(r.bump, false) : null, bumpScale: r.bumpScale ?? 1 });
  }
  function pbr(name, tile, params = {}) {
    const t = set(name);
    const rep = 1 / tile;
    const c = (tx) => { const x = tx.clone(); x.repeat.set(rep, rep); x.needsUpdate = true; return x; };
    const { normalScale, noMap, roughness, ...rest } = params;
    const m = new THREE.MeshStandardMaterial({
      map: noMap ? null : c(t.map),
      bumpMap: t.bump ? c(t.bump) : null,
      bumpScale: t.bumpScale * 0.02,
      roughness: roughness ?? (name === 'marble_01' ? 0.25 : name === 'leather_red_02' ? 0.55 : 0.85),
      metalness: 0, envMapIntensity: 0.75, ...rest,
    });
    return reveal(m);
  }
  function solid(params) {
    return reveal(new THREE.MeshStandardMaterial({ envMapIntensity: 0.75, ...params }));
  }
  return { pbr, solid, set };
}
