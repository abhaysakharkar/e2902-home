import * as THREE from 'three';
import { GEN, canvas, blotches, grain, reseed, rand } from '../walk/proctex.js';

// The material library. Every swatch is drawn in code.
// gen: a texture generator (or null for a flat colour), tint: multiplied over it.
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// Extra generators the walk page doesn't need.
const MORE = {
  plain(S) { return { col: canvas(S, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); }) }; },
  limewash(S) {
    const col = canvas(S, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); blotches(g, S, 140, 20, 90, (k) => (k > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(150,140,130,0.10)')); });
    return { col, bump: col, bumpScale: 0.3 };
  },
  terrazzo(S) {
    const col = canvas(S, (g) => {
      g.fillStyle = '#ece8e1'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) {
        const r = 1 + rand() * 7, h = [20, 30, 200, 0, 40][(rand() * 5) | 0];
        g.fillStyle = hsl(h, 10 + rand() * 30, 35 + rand() * 45); g.beginPath();
        g.ellipse(rand() * S, rand() * S, r, r * (0.5 + rand() * 0.5), rand() * 3, 0, 7); g.fill();
      }
    });
    return { col };
  },
  travertine(S) {
    const col = canvas(S, (g) => {
      g.fillStyle = hsl(36, 30, 78); g.fillRect(0, 0, S, S);
      for (let i = 0; i < 90; i++) { g.fillStyle = hsl(32, 28, 62 + rand() * 18, 0.35); g.fillRect(0, rand() * S, S, 1 + rand() * 4); }
      for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(110,90,70,0.25)'; g.fillRect(rand() * S, rand() * S, 2 + rand() * 10, 1 + rand() * 2); }
      g.fillStyle = 'rgba(120,105,90,0.5)'; for (let i = 0; i <= 2; i++) { g.fillRect(i * S / 2 - 1, 0, 2, S); g.fillRect(0, i * S / 2 - 1, S, 2); }
    });
    return { col, bump: col, bumpScale: 0.8 };
  },
  slate(S) {
    const col = canvas(S, (g) => { g.fillStyle = hsl(210, 6, 30); g.fillRect(0, 0, S, S); blotches(g, S, 160, 8, 40, (k) => hsl(210, 6, 22 + k * 18, 0.3)); g.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i <= 2; i++) { g.fillRect(i * S / 2 - 1, 0, 2, S); g.fillRect(0, i * S / 2 - 1, S, 2); } });
    return { col, bump: col, bumpScale: 1.2 };
  },
  boucle(S) {
    const col = canvas(S, (g) => { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, S, S); for (let i = 0; i < 6000; i++) { g.strokeStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '150,140,125'},0.5)`; g.lineWidth = 1; g.beginPath(); g.arc(rand() * S, rand() * S, 1.5 + rand() * 2.5, 0, 7); g.stroke(); } });
    return { col, bump: col, bumpScale: 2 };
  },
  velvet(S) {
    const col = canvas(S, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); blotches(g, S, 50, 40, 140, (k) => (k > 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)')); });
    return { col };
  },
  knit(S) {
    const col = canvas(S, (g) => {
      g.fillStyle = '#ddd'; g.fillRect(0, 0, S, S);
      const w = S / 32;
      for (let y = 0; y < S; y += w) for (let x = 0; x < S; x += w) { g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.2})`; g.beginPath(); g.ellipse(x + w / 2, y + w / 2, w * 0.28, w * 0.48, 0.5, 0, 7); g.fill(); }
    });
    return { col, bump: col, bumpScale: 1.5 };
  },
  slats(S) {
    const col = canvas(S, (g) => {
      const n = 12;
      for (let i = 0; i < n; i++) grain(g, i * S / n, 0, S / n, S, hsl(26, 36, 34 + rand() * 6), (k) => hsl(20, 40, 18 + k * 10, 0.35), 30);
      g.fillStyle = 'rgba(10,6,4,0.8)'; for (let i = 0; i < n; i++) g.fillRect(i * S / n, 0, 3, S);
    });
    const bump = canvas(S, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.fillStyle = '#000'; for (let i = 0; i < 12; i++) g.fillRect(i * S / 12, 0, 4, S); });
    return { col, bump, bumpScale: 3 };
  },
};
const ALLGEN = { ...GEN, ...MORE };

// cat: wood | stone | fabric | paint
export const SWATCHES = [
  // wood
  { id: 'honey-oak',  name: 'Honey oak',  cat: 'wood',   gen: 'oak_wood_planks',       tint: 0xffe2b8, rough: 0.75 },
  { id: 'white-oak',  name: 'White oak',  cat: 'wood',   gen: 'oak_wood_planks',       tint: 0xfff4ea, rough: 0.8 },
  { id: 'walnut',     name: 'Walnut',     cat: 'wood',   gen: 'natural_walnut_veneer', tint: 0xffffff, rough: 0.6 },
  { id: 'walnut-slat',name: 'Walnut slat',cat: 'wood',   gen: 'slats',                 tint: 0xffffff, rough: 0.6 },
  { id: 'smoked-oak', name: 'Smoked oak', cat: 'wood',   gen: 'oak_wood_planks',       tint: 0x9a8070, rough: 0.7 },
  { id: 'black-ash',  name: 'Black ash',  cat: 'wood',   gen: 'natural_walnut_veneer', tint: 0x4a4440, rough: 0.55 },
  { id: 'teak',       name: 'Teak deck',  cat: 'wood',   gen: 'oak_wood_planks',       tint: 0xc9a07a, rough: 0.8 },
  // stone
  { id: 'marble',     name: 'Ivory marble', cat: 'stone', gen: 'marble_01',            tint: 0xffffff, rough: 0.25 },
  { id: 'travertine', name: 'Travertine', cat: 'stone',  gen: 'travertine',            tint: 0xffffff, rough: 0.6 },
  { id: 'terrazzo',   name: 'Terrazzo',   cat: 'stone',  gen: 'terrazzo',              tint: 0xffffff, rough: 0.35 },
  { id: 'concrete',   name: 'Concrete',   cat: 'stone',  gen: 'wood_textured_concrete',tint: 0xd8d4ce, rough: 0.85 },
  { id: 'slate',      name: 'Slate',      cat: 'stone',  gen: 'slate',                 tint: 0xffffff, rough: 0.7 },
  { id: 'stone-wall', name: 'Stone wall', cat: 'stone',  gen: 'rustic_stone_wall',     tint: 0xece2d2, rough: 0.9 },
  { id: 'black-quartz', name: 'Black quartz', cat: 'stone', gen: 'plain',              tint: 0x1c1c1e, rough: 0.25 },
  // fabric
  { id: 'linen',      name: 'Linen',      cat: 'fabric', gen: 'rough_linen',           tint: 0xf2ece0, rough: 0.9 },
  { id: 'boucle',     name: 'Bouclé',     cat: 'fabric', gen: 'boucle',                tint: 0xffffff, rough: 0.95 },
  { id: 'oat-knit',   name: 'Oat knit',   cat: 'fabric', gen: 'knit',                  tint: 0xe8dcc6, rough: 0.95 },
  { id: 'rust-wool',  name: 'Rust wool',  cat: 'fabric', gen: 'rough_linen',           tint: 0xc0643a, rough: 0.9 },
  { id: 'navy-velvet',name: 'Navy velvet',cat: 'fabric', gen: 'velvet',                tint: 0x2c3a5c, rough: 0.6 },
  { id: 'olive',      name: 'Olive',      cat: 'fabric', gen: 'rough_linen',           tint: 0x7d8458, rough: 0.9 },
  { id: 'mustard',    name: 'Mustard',    cat: 'fabric', gen: 'velvet',                tint: 0xd2a23c, rough: 0.65 },
  { id: 'cognac',     name: 'Cognac leather', cat: 'fabric', gen: 'leather_red_02',    tint: 0xd89a6a, rough: 0.5 },
  { id: 'charcoal',   name: 'Charcoal felt', cat: 'fabric', gen: 'rough_linen',        tint: 0x45454a, rough: 0.95 },
  { id: 'herringbone',name: 'Herringbone', cat: 'fabric', gen: 'poly_wool_herringbone', tint: 0xf0e8dc, rough: 0.95 },
  // paint
  { id: 'sand-limewash', name: 'Sand limewash', cat: 'paint', gen: 'limewash', tint: 0xe9dcc6, rough: 0.95 },
  { id: 'chalk-white', name: 'Chalk white', cat: 'paint', gen: 'white_stucco', tint: 0xffffff, rough: 0.9 },
  { id: 'sage',       name: 'Sage',       cat: 'paint',  gen: 'limewash',              tint: 0xa9b39c, rough: 0.9 },
  { id: 'terracotta', name: 'Terracotta', cat: 'paint',  gen: 'limewash',              tint: 0xc9805e, rough: 0.9 },
  { id: 'blush',      name: 'Blush',      cat: 'paint',  gen: 'limewash',              tint: 0xe8c3b4, rough: 0.9 },
  { id: 'navy',       name: 'Deep navy',  cat: 'paint',  gen: 'plain',                 tint: 0x283550, rough: 0.7 },
  { id: 'charcoal-paint', name: 'Charcoal', cat: 'paint', gen: 'white_stucco',         tint: 0x4a4846, rough: 0.85 },
  { id: 'lacquer-sage', name: 'Sage lacquer', cat: 'paint', gen: 'plain',              tint: 0x8a9a82, rough: 0.5 },
  { id: 'lacquer-cream', name: 'Cream lacquer', cat: 'paint', gen: 'plain',            tint: 0xece6db, rough: 0.5 },
];
export const BY_ID = Object.fromEntries(SWATCHES.map((s) => [s.id, s]));

// Surfaces you can restyle. allow = swatch categories that make sense there.
// mats: keys into home.M / home.K. tile: metres per texture repeat. anchor: where its tag points.
export const SLOTS = [
  { key: 'floor',    name: 'Floor',          mats: ['M.marble'],          allow: ['wood', 'stone'],          tile: 1.6, anchor: [4.6, 0, 6.6],  initial: 'marble' },
  { key: 'bedfloor', name: 'Bedroom floors', mats: ['M.oak'],             allow: ['wood', 'stone'],          tile: 1.8, anchor: [12.0, 0, 4.4], initial: 'honey-oak' },
  { key: 'walls',    name: 'Walls',          mats: ['M.wall'],            allow: ['paint', 'stone'],         tile: 3.0, anchor: [7.2, 1.6, 3.3], initial: 'chalk-white' },
  { key: 'feature',  name: 'Feature wall',   mats: ['M.feature'],         allow: ['wood', 'stone', 'paint'], tile: 2.0, anchor: [3.97, 1.4, 3.4], initial: 'concrete' },
  { key: 'upholstery', name: 'Upholstery',   mats: ['M.linenG'],          allow: ['fabric'],                 tile: 0.5, anchor: [6.8, 0.5, 3.6], initial: 'linen' },
  { key: 'accents',  name: 'Accents',        mats: ['M.linenT', 'M.leather'], allow: ['fabric'],             tile: 0.5, anchor: [4.9, 0.5, 2.95], initial: 'rust-wool' },
  { key: 'bedding',  name: 'Bedding',        mats: ['M.linen', 'M.linenB', 'M.linenS'], allow: ['fabric'],   tile: 0.5, anchor: [12.6, 0.6, 2.4], initial: 'linen' },
  { key: 'rugs',     name: 'Rugs',           mats: ['M.rug', 'M.rugK'],   allow: ['fabric'],                 tile: 0.9, anchor: [5.4, 0, 4.3], initial: 'herringbone' },
  { key: 'woodwork', name: 'Woodwork',       mats: ['M.walnut', 'M.walnutL'], allow: ['wood', 'paint'],      tile: 1.1, anchor: [13.4, 1.4, 4.4], initial: 'walnut' },
  { key: 'shutters', name: 'Kitchen shutters', mats: ['K.base'],          allow: ['wood', 'paint'],          tile: 1.1, anchor: [5.5, 0.5, 9.33], initial: 'lacquer-sage' },
  { key: 'counter',  name: 'Countertop',     mats: ['K.top', 'M.quartzW'], allow: ['stone'],                 tile: 1.2, anchor: [4.2, 0.86, 8.6], initial: 'marble' },
  { key: 'deck',     name: 'Deck',           mats: ['M.deck'],            allow: ['wood', 'stone'],          tile: 1.4, anchor: [4.4, 0, 1.2], initial: 'teak' },
];

// Presets, mirroring the video's three moods, tuned for this flat.
export const PRESETS = {
  cozy:   { name: 'Cozy',   sub: 'golden hour', time: 18.5, slots: { floor: 'travertine', bedfloor: 'honey-oak', walls: 'sand-limewash', feature: 'walnut-slat', upholstery: 'boucle', accents: 'rust-wool', bedding: 'linen', rugs: 'oat-knit', woodwork: 'walnut', shutters: 'lacquer-sage', counter: 'marble', deck: 'teak' } },
  bright: { name: 'Bright', sub: 'midday',      time: 12.8, slots: { floor: 'marble', bedfloor: 'white-oak', walls: 'chalk-white', feature: 'marble', upholstery: 'linen', accents: 'mustard', bedding: 'boucle', rugs: 'herringbone', woodwork: 'white-oak', shutters: 'lacquer-cream', counter: 'terrazzo', deck: 'white-oak' } },
  moody:  { name: 'Moody',  sub: 'after dark',  time: 22.2, slots: { floor: 'slate', bedfloor: 'smoked-oak', walls: 'charcoal-paint', feature: 'walnut-slat', upholstery: 'navy-velvet', accents: 'cognac', bedding: 'charcoal', rugs: 'rust-wool', woodwork: 'black-ash', shutters: 'navy', counter: 'black-quartz', deck: 'smoked-oak' } },
};

// Textures and swatch thumbnails, made once per swatch.
const texCache = {};
export function swatchTextures(sw) {
  if (texCache[sw.id]) return texCache[sw.id];
  reseed([...sw.id].reduce((a, c) => a + c.charCodeAt(0) * 13, 7));
  const r = ALLGEN[sw.gen](512);
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  // Average colour (with tint) for the mood meter.
  const g = r.col.getContext('2d'), d = g.getImageData(0, 0, 512, 512).data;
  let R = 0, G = 0, Bc = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 97) { R += d[i]; G += d[i + 1]; Bc += d[i + 2]; n++; }
  const tint = new THREE.Color(sw.tint);
  const avg = [R / n / 255 * tint.r, G / n / 255 * tint.g, Bc / n / 255 * tint.b];
  // Thumbnail: texture with the tint multiplied on top.
  const thumb = document.createElement('canvas'); thumb.width = thumb.height = 96;
  const tg = thumb.getContext('2d');
  tg.drawImage(r.col, 0, 0, 256, 256, 0, 0, 96, 96);
  tg.globalCompositeOperation = 'multiply'; tg.fillStyle = '#' + tint.getHexString(); tg.fillRect(0, 0, 96, 96);
  return (texCache[sw.id] = { map: mk(r.col, true), bump: r.bump ? mk(r.bump, false) : null, bumpScale: r.bumpScale ?? 1, avg, thumb: thumb.toDataURL() });
}

// Restyle a shared material in place, keeping its tiling.
export function applySwatch(mat, sw, tile) {
  const t = swatchTextures(sw), rep = 1 / tile;
  const clone = (tx) => { if (!tx) return null; const c = tx.clone(); c.repeat.set(rep, rep); c.needsUpdate = true; return c; };
  mat.map = sw.gen === 'plain' ? null : clone(t.map);
  mat.bumpMap = clone(t.bump);
  mat.bumpScale = t.bumpScale * 0.02;
  mat.normalMap = null; mat.roughnessMap = null; mat.metalnessMap = null; mat.aoMap = null;
  mat.color.set(sw.tint);
  mat.roughness = sw.rough;
  mat.metalness = 0;
  mat.needsUpdate = true;   // maps may have been added or removed, so recompile
}
