import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WALLS, OUTLINE, OPENINGS, H, CEIL } from './plan.js';
import { reveal, lineMaterial, canvasTex, U } from './materials.js';

const PI = Math.PI;

// World-scale UVs: one UV unit = one metre, projected along the dominant normal.
function boxUV(geo, yScale = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i) * yScale, z = p.getZ(i);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function buildHome(scene, lib, opt = {}) {
  const drawLines = opt.lines !== false;
  const solids = [];   // meshes you could bump into (used by the walkable version)
  const LW = lineMaterial('#1b1a19', 0.95);   // walls: heavy ink
  const LF = lineMaterial('#3a3936', 0.5);    // furniture: lighter
  const LD = lineMaterial('#3a3936', 0.4);    // door swings
  const INK = new THREE.MeshBasicMaterial({ color: '#2a2826' });

  // ---------------------------------------------------------------- materials
  const M = {
    wall:    lib.pbr('white_stucco', 3.0, { color: 0xf3efe7, normalScale: 0.18 }),
    paint:   lib.solid({ color: 0xf4f1eb, roughness: 0.92 }),
    marble:  lib.pbr('marble_01', 1.6, { roughness: 0.35, envMapIntensity: 0.9 }),
    oak:     lib.pbr('oak_wood_planks', 1.8, { color: 0xe4e2e2 }),
    deck:    lib.pbr('oak_wood_planks', 1.4, { color: 0xa9927e }),
    walnut:  lib.pbr('natural_walnut_veneer', 1.1, {}),
    walnutL: lib.pbr('natural_walnut_veneer', 1.1, { color: 0xd8c0a4 }),
    linen:   lib.pbr('rough_linen', 0.5, { noMap: true, color: 0xe8e1d4 }),
    linenG:  lib.pbr('rough_linen', 0.5, { noMap: true, color: 0xa39c90 }),
    linenS:  lib.pbr('rough_linen', 0.5, { noMap: true, color: 0x93a08a }),
    linenT:  lib.pbr('rough_linen', 0.5, { noMap: true, color: 0xb8714f }),
    linenB:  lib.pbr('rough_linen', 0.5, { noMap: true, color: 0x7d8c99 }),
    curtain: lib.pbr('rough_linen', 0.6, { noMap: true, color: 0xf3eee4, side: THREE.DoubleSide }),
    rug:     lib.pbr('poly_wool_herringbone', 0.9, { color: 0xd9cfc0 }),
    rugK:    lib.pbr('poly_wool_herringbone', 0.9, { color: 0x9fb1c2 }),
    leather: lib.pbr('leather_red_02', 0.6, { color: 0xc98a5a }),
    feature: lib.pbr('wood_textured_concrete', 2.0, { color: 0xd9d4cc }),
    stone:   lib.pbr('rustic_stone_wall', 2.0, { color: 0xe6dccd }),
    grass:   lib.pbr('withered_grass', 8, { color: 0x8e9a6c }),
    quartzW: lib.solid({ color: 0xf1eee8, roughness: 0.22 }),
    sage:    lib.solid({ color: 0x8a9a82, roughness: 0.55 }),
    cream:   lib.solid({ color: 0xece6db, roughness: 0.5 }),
    granite: lib.solid({ color: 0x1b1b1c, roughness: 0.32 }),
    blackG:  lib.solid({ color: 0x0b0b0c, roughness: 0.12, metalness: 0.2 }),
    steel:   lib.solid({ color: 0xc9c9c6, roughness: 0.28, metalness: 1 }),
    steelF:  lib.solid({ color: 0xd2d3d1, roughness: 0.38, metalness: 0.55 }),
    blackM:  lib.solid({ color: 0x232323, roughness: 0.4, metalness: 0.7 }),
    brass:   lib.solid({ color: 0xc8a165, roughness: 0.3, metalness: 1 }),
    frame:   lib.solid({ color: 0x3b3b3a, roughness: 0.45, metalness: 0.6 }),
    white:   lib.solid({ color: 0xf7f6f3, roughness: 0.18 }),
    whiteM:  lib.solid({ color: 0xf1efea, roughness: 0.6 }),
    mirror:  lib.solid({ color: 0xc9cfd1, roughness: 0.12, metalness: 1, envMapIntensity: 0.35 }),
    leaf:    lib.solid({ color: 0x4f6b3e, roughness: 0.8, flatShading: true }),
    leafD:   lib.solid({ color: 0x3c5531, roughness: 0.8, flatShading: true }),
    pot:     lib.solid({ color: 0xb0603d, roughness: 0.85 }),
    potW:    lib.solid({ color: 0xe8e4dc, roughness: 0.7 }),
    tv:      lib.solid({ color: 0x0a0a0b, roughness: 0.1, metalness: 0.3 }),
    glow:    reveal(new THREE.MeshStandardMaterial({ color: 0xfff3dd, emissive: 0xffe2b0, emissiveIntensity: 1.6, roughness: 0.9 })),
    glass:   reveal(new THREE.MeshStandardMaterial({ color: 0xdfeaee, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }), { alpha: true }),
    glassF:  reveal(new THREE.MeshStandardMaterial({ color: 0xcfdde0, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }), { alpha: true }),
  };
  const tileTex = (base, grout, tw, th) => canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = grout; g.fillRect(0, 0, w, h);
    const nx = tw, ny = th;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const s = 0.94 + Math.random() * 0.06;
      g.fillStyle = base.replace('L', Math.round(s * 100) + '%');
      g.fillRect(i * w / nx + 2, j * h / ny + 2, w / nx - 4, h / ny - 4);
    }
  });
  const bathTile = tileTex('hsl(36, 12%, L)', '#c9c4bb', 2, 4); bathTile.repeat.set(1 / 1.2, 1 / 1.2);
  const subway = tileTex('hsl(40, 20%, L)', '#d8d2c6', 4, 8); subway.repeat.set(1 / 0.6, 1 / 0.6);
  M.tile = lib.solid({ map: bathTile, roughness: 0.3, color: 0xe2ddd5 });
  M.tileF = lib.solid({ map: bathTile, roughness: 0.6, color: 0xb9b4ab });
  M.subway = lib.solid({ map: subway, roughness: 0.25, color: 0xf4efe6 });

  // ---------------------------------------------------------------- helpers
  const wallish = [];   // things the plan cut slices through
  let target = scene;   // furniture goes into the current layout group
  const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const lineObjs = [];
  function lines(mesh, lm = LF, a = 28) { if (!drawLines) return mesh; const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, a), lm); mesh.add(l); if (lm !== LW) lineObjs.push(l); return mesh; }

  // Axis-aligned box from two corners. parent can be a Group for rotated furniture.
  function box(x0, y0, z0, x1, y1, z1, mat, o = {}) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    const g = boxUV(o.r ? new RoundedBoxGeometry(w, h, d, 3, Math.min(o.r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d));
    const m = shadow(new THREE.Mesh(g, mat));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (o.lines !== false) lines(m, o.lm || LF);
    if (o.noShadow) m.castShadow = false;
    (o.parent || target).add(m);
    solids.push(m);
    return m;
  }
  function cyl(x, y0, z, r, h, mat, o = {}) {
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg || 28);
    boxUV(g);
    const m = shadow(new THREE.Mesh(g, mat));
    m.position.set(x, y0 + h / 2, z);
    if (o.lines !== false) lines(m, o.lm || LF, 40);
    (o.parent || target).add(m);
    solids.push(m);
    return m;
  }
  function blob(x, y, z, sx, sy, sz, mat, parent) {
    const m = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    (parent || target).add(m);
    return m;
  }
  function group(x, z, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = rot;
    target.add(g);
    return g;
  }
  // Wall-type element that the plan cut can slice. Built at full height, scaled to the cut.
  function cutBox(x0, z0, x1, z1, y0, y1, mat = M.wall) {
    const g = boxUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0));
    g.translate(0, (y1 - y0) / 2, 0);
    const mats = [mat, mat, mat, mat, mat, mat];
    const m = shadow(new THREE.Mesh(g, mats));
    m.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
    lines(m, LW);
    scene.add(m);
    wallish.push({ m, y0, y1, mats, cap: [2], base: mat });
    return m;
  }

  // ---------------------------------------------------------------- shell
  for (const poly of WALLS) {
    const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.rotateX(-PI / 2);
    boxUV(g, H);
    const mats = [M.wall, M.wall];
    const m = shadow(new THREE.Mesh(g, mats));
    lines(m, LW, 20);
    scene.add(m);
    wallish.push({ m, y0: 0, y1: H, mats, cap: [0], base: M.wall, unit: true });
  }

  const outlineShape = () => new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)));
  // Floor slab; its top is the default marble floor.
  {
    const g = new THREE.ExtrudeGeometry(outlineShape(), { depth: 0.25, bevelEnabled: false });
    g.rotateX(-PI / 2); g.translate(0, -0.25, 0); boxUV(g);
    const m = new THREE.Mesh(g, M.marble); m.receiveShadow = true;
    lines(m, LW, 20);
    scene.add(m);
  }
  // Ceiling: faces down, so the plan camera never sees it.
  const ceilGroup = new THREE.Group(); scene.add(ceilGroup);
  {
    const s = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ShapeGeometry(s); g.rotateX(PI / 2); g.translate(0, CEIL, 0); boxUV(g);
    const m = new THREE.Mesh(g, M.paint); m.receiveShadow = true; m.castShadow = true;
    ceilGroup.add(m);
  }

  // Floor finishes laid over the slab.
  const floor = (x0, z0, x1, z1, mat, y = 0.006) => { const m = box(x0, 0, z0, x1, y, z1, mat, { lines: false }); m.castShadow = false; return m; };
  floor(0.2, 2.85, 3.7, 6.05, M.oak); floor(2.8, 6.04, 3.7, 6.2, M.oak);
  floor(7.45, 0.5, 10.5, 3.98, M.oak); floor(9.6, 3.97, 10.5, 4.1, M.oak);
  floor(10.7, 0.5, 13.75, 5.0, M.oak); floor(10.49, 4.1, 10.71, 5.0, M.oak);
  floor(1.85, 0.0, 7.2, 2.1, M.deck); floor(1.85, 2.1, 3.7, 2.76, M.deck); floor(7.2, 0, 14.2, 0.3, M.deck);
  floor(0.2, 0.45, 1.7, 2.75, M.tileF); floor(9.15, 5.65, 10.5, 7.4, M.tileF); floor(10.75, 5.1, 13.1, 6.45, M.tileF);
  floor(7.96, 7.53, 9.0, 9.95, M.tileF);

  // ---------------------------------------------------------------- openings
  const doors = {};
  for (const o of OPENINGS) {
    const [x0, z0, x1, z1] = o.rect;
    const alongX = (x1 - x0) >= (z1 - z0);
    if (o.sill > 0) cutBox(x0, z0, x1, z1, 0, o.sill);
    cutBox(x0, z0, x1, z1, o.head, H);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (o.type === 'window') {
      const t = 0.05;
      const fr = (a0, b0, a1, b1, y0, y1) => alongX ? box(a0, y0, cz - t / 2 + b0 * 0, a1, y1, cz + t / 2, M.frame, { lm: LW }) : box(cx - t / 2, y0, a0, cx + t / 2, y1, a1, M.frame, { lm: LW });
      const A0 = alongX ? x0 : z0, A1 = alongX ? x1 : z1;
      fr(A0, 0, A1, 0, o.sill, o.sill + 0.05); fr(A0, 0, A1, 0, o.head - 0.05, o.head);
      fr(A0, 0, A0 + 0.05, 0, o.sill, o.head); fr(A1 - 0.05, 0, A1, 0, o.sill, o.head);
      const n = Math.max(1, Math.round((A1 - A0) / 0.8));
      for (let i = 1; i < n; i++) { const a = A0 + (A1 - A0) * i / n; fr(a - 0.02, 0, a + 0.02, 0, o.sill, o.head); }
      const gl = alongX ? box(A0, o.sill, cz - 0.004, A1, o.head, cz + 0.004, M.glass, { lines: false }) : box(cx - 0.004, o.sill, A0, cx + 0.004, o.head, A1, M.glass, { lines: false });
      gl.castShadow = false;
    }
    if (o.type === 'slide') {
      const A0 = alongX ? x0 : z0, A1 = alongX ? x1 : z1, y0 = o.sill, y1 = o.head;
      const n = (A1 - A0) > 2 ? 3 : 2, pw = (A1 - A0) / n;
      for (let i = 0; i < n; i++) {
        // One panel slid behind its neighbour so the door reads as open.
        let a = A0 + i * pw; if (i === 1) a -= pw * 0.85;
        const off = (i % 2 ? 0.035 : -0.035);
        const gz = cz + off;
        box(a, y0, gz - 0.02, a + pw, y0 + 0.05, gz + 0.02, M.frame, { lm: LW });
        box(a, y1 - 0.05, gz - 0.02, a + pw, y1, gz + 0.02, M.frame, { lm: LW });
        box(a, y0, gz - 0.02, a + 0.05, y1, gz + 0.02, M.frame, { lm: LW });
        box(a + pw - 0.05, y0, gz - 0.02, a + pw, y1, gz + 0.02, M.frame, { lm: LW });
        const g = box(a + 0.05, y0 + 0.05, gz - 0.004, a + pw - 0.05, y1 - 0.05, gz + 0.004, M.glass, { lines: false }); g.castShadow = false;
      }
    }
  }

  // Door leaves, hinged as drawn. dir* are unit vectors along the leaf, open and closed.
  const DOORS = [
    { id: 'main',   hinge: [2.67, 9.03],  open: [0, -1], closed: [1, 0],  w: 1.03, mat: 'walnut', t: 0.05 },
    { id: 'parent', hinge: [3.68, 6.13],  open: [0, -1], closed: [-1, 0], w: 0.86 },
    { id: 'pbath',  hinge: [1.68, 2.8],   open: [0, -1], closed: [-1, 0], w: 0.71 },
    { id: 'kid',    hinge: [10.48, 4.04], open: [0, -1], closed: [-1, 0], w: 0.86 },
    { id: 'master', hinge: [10.62, 4.98], open: [1, 0],  closed: [0, -1], w: 0.86 },
    { id: 'cbath',  hinge: [10.48, 5.6],  open: [0, 1],  closed: [-1, 0], w: 0.71 },
    { id: 'mbath',  hinge: [11.66, 5.05], open: [0, 1],  closed: [1, 0],  w: 0.72 },
  ];
  for (const d of DOORS) {
    const piv = new THREE.Group();
    piv.position.set(d.hinge[0], 0, d.hinge[1]);
    scene.add(piv);
    const t = d.t || 0.038;
    // Leaf built along +x from the hinge; rotate the pivot to point it.
    const leaf = box(0.02, 0.01, -t / 2, d.w, 2.08, t / 2, d.mat === 'walnut' ? M.walnut : M.whiteM, { parent: piv });
    box(d.w - 0.12, 1.0, t / 2, d.w - 0.1, 1.05, t / 2 + 0.06, M.brass, { parent: piv, lines: false });
    box(d.w - 0.12, 1.0, -t / 2 - 0.06, d.w - 0.1, 1.05, -t / 2, M.brass, { parent: piv, lines: false });
    const angOpen = Math.atan2(-d.open[1], d.open[0]);
    const angClosed = Math.atan2(-d.closed[1], d.closed[0]);
    piv.rotation.y = angOpen;
    doors[d.id] = { piv, angOpen, angClosed };
    // Swing arc on the floor, the way a plan draws it.
    const pts = [];
    let a0 = angClosed, a1 = angOpen;
    let da = a1 - a0; if (da > PI) da -= 2 * PI; if (da < -PI) da += 2 * PI;
    for (let i = 0; i <= 24; i++) { const a = a0 + da * i / 24; pts.push(new THREE.Vector3(d.hinge[0] + Math.cos(a) * d.w, 0.012, d.hinge[1] - Math.sin(a) * d.w)); }
    pts.push(new THREE.Vector3(d.hinge[0], 0.012, d.hinge[1]));
    if (drawLines) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), LD));
  }
  // Door frames (architraves) around hinged doors.
  for (const o of OPENINGS.filter((o) => o.type === 'door')) {
    const [x0, z0, x1, z1] = o.rect, alongX = (x1 - x0) >= (z1 - z0), f = 0.05;
    if (alongX) { box(x0, 0, z0 - 0.01, x0 + f, 2.15, z1 + 0.01, M.walnutL); box(x1 - f, 0, z0 - 0.01, x1, 2.15, z1 + 0.01, M.walnutL); box(x0, 2.1, z0 - 0.01, x1, 2.15, z1 + 0.01, M.walnutL); }
    else { box(x0 - 0.01, 0, z0, x1 + 0.01, 2.15, z0 + f, M.walnutL); box(x0 - 0.01, 0, z1 - f, x1 + 0.01, 2.15, z1, M.walnutL); box(x0 - 0.01, 2.1, z0, x1 + 0.01, 2.15, z1, M.walnutL); }
  }

  // ---------------------------------------------------------------- furniture kit
  function bed(x, z, rot, w, l, duvet, pillow = M.linen) {
    const g = group(x, z, rot);
    box(-w / 2, 0.08, -l / 2, w / 2, 0.32, l / 2, M.walnut, { parent: g });
    box(-w / 2 + 0.02, 0.32, -l / 2 + 0.03, w / 2 - 0.02, 0.54, l / 2 - 0.02, M.linen, { parent: g, r: 0.05 });
    box(-w / 2 - 0.01, 0.5, -l / 2 + 0.55, w / 2 + 0.01, 0.6, l / 2 + 0.01, duvet, { parent: g, r: 0.04 });
    box(-w / 2 - 0.015, 0.47, l / 2 - 0.5, w / 2 + 0.015, 0.615, l / 2 - 0.15, M.linenT, { parent: g, r: 0.03 });
    const np = w > 1.2 ? 2 : 1;
    for (let i = 0; i < np; i++) {
      const px = np === 1 ? 0 : (i ? 1 : -1) * w / 4;
      box(px - w / np / 2 + 0.06, 0.54, -l / 2 + 0.08, px + w / np / 2 - 0.06, 0.68, -l / 2 + 0.5, pillow, { parent: g, r: 0.06 });
    }
    box(-w / 2 - 0.08, 0, -l / 2 - 0.09, w / 2 + 0.08, 1.15, -l / 2, M.linenG, { parent: g, r: 0.03 });
    return g;
  }
  function sideTable(x, z, lamp = true) {
    box(x - 0.22, 0.0, z - 0.2, x + 0.22, 0.5, z + 0.2, M.walnut);
    box(x - 0.2, 0.24, z - 0.205, x + 0.2, 0.25, z + 0.205, M.blackM, { lines: false });
    if (lamp) { cyl(x, 0.5, z, 0.06, 0.28, M.brass, { lines: false }); cyl(x, 0.74, z, 0.14, 0.2, M.glow, { r2: 0.1 }); }
  }
  // Wardrobe on rect, doors facing `face` (+x,-x,+z,-z).
  function wardrobe(x0, z0, x1, z1, face, h = 2.1, mat = M.walnut) {
    box(x0, 0, z0, x1, h, z1, mat);
    const alongX = face === '+z' || face === '-z';
    const A0 = alongX ? x0 : z0, A1 = alongX ? x1 : z1;
    const n = Math.max(1, Math.round((A1 - A0) / 0.5));
    const f = face[0] === '+' ? 1 : -1;
    const fz = alongX ? (f > 0 ? z1 : z0) : (f > 0 ? x1 : x0);
    for (let i = 0; i <= n; i++) {
      const a = A0 + (A1 - A0) * i / n;
      if (i > 0 && i < n) alongX ? box(a - 0.004, 0.05, fz - 0.003, a + 0.004, h - 0.05, fz + 0.003, M.blackM, { lines: false }) : box(fz - 0.003, 0.05, a - 0.004, fz + 0.003, h - 0.05, a + 0.004, M.blackM, { lines: false });
      if (i < n) {
        const ha = a + (A1 - A0) / n * (i % 2 ? 0.12 : 0.88);
        alongX ? box(ha - 0.01, 0.85, fz, ha + 0.01, 1.35, fz + f * 0.03, M.brass, { lines: false }) : box(fz, 0.85, ha - 0.01, fz + f * 0.03, 1.35, ha + 0.01, M.brass, { lines: false });
      }
    }
  }
  function plant(x, z, s = 1, tall = false) {
    cyl(x, 0, z, 0.16 * s, 0.34 * s, M.pot, { r2: 0.19 * s });
    if (tall) {
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * PI * 2, r = 0.05 * s;
        const m = box(-0.025 * s, 0, -0.008, 0.025 * s, (0.7 + Math.random() * 0.5) * s, 0.008, i % 2 ? M.leaf : M.leafD, { lines: false });
        m.position.set(x + Math.cos(a) * r, 0.3 * s, z + Math.sin(a) * r);
        m.geometry.translate(0, ((0.7) * s) / 2, 0);
        m.rotation.set(Math.sin(a) * 0.25, a, Math.cos(a) * 0.25);
      }
    } else {
      for (let i = 0; i < 6; i++) blob(x + (Math.random() - 0.5) * 0.25 * s, (0.5 + Math.random() * 0.35) * s, z + (Math.random() - 0.5) * 0.25 * s, 0.17 * s, 0.15 * s, 0.17 * s, i % 2 ? M.leaf : M.leafD);
    }
  }
  function chair(x, z, rot, seat = M.linenG) {
    const g = group(x, z, rot);
    box(-0.22, 0.43, -0.22, 0.22, 0.49, 0.22, seat, { parent: g, r: 0.02 });
    box(-0.22, 0.49, -0.24, 0.22, 0.92, -0.2, M.walnut, { parent: g });
    for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) box(a - 0.018, 0, b - 0.018, a + 0.018, 0.43, b + 0.018, M.walnut, { parent: g, lines: false });
    return g;
  }
  function art(x, y, z, w, h, axis, seed) {
    const tex = canvasTex(256, 256 * h / w, (g, W, Hh) => {
      const pal = [['#e9e1d3', '#c27a55', '#3f4b45', '#d8b26e'], ['#efe9df', '#6f8399', '#c9a77c', '#2c2c2c'], ['#f1ece4', '#8f9c86', '#b46b4a', '#e2c59a']][seed % 3];
      g.fillStyle = pal[0]; g.fillRect(0, 0, W, Hh);
      g.fillStyle = pal[1]; g.beginPath(); g.arc(W * 0.38, Hh * 0.42, W * 0.26, 0, PI * 2); g.fill();
      g.fillStyle = pal[2]; g.fillRect(W * 0.12, Hh * 0.62, W * 0.76, Hh * 0.08);
      g.fillStyle = pal[3]; g.fillRect(W * 0.58, Hh * 0.18, W * 0.24, Hh * 0.38);
    });
    const mat = lib.solid({ map: tex, roughness: 0.8 });
    const t = 0.03;
    if (axis === 'x') box(x - w / 2, y - h / 2, z - t / 2, x + w / 2, y + h / 2, z + t / 2, [M.blackM, M.blackM, M.blackM, M.blackM, mat, mat], { lm: LF });
    else box(x - t / 2, y - h / 2, z - w / 2, x + t / 2, y + h / 2, z + w / 2, [mat, mat, M.blackM, M.blackM, M.blackM, M.blackM], { lm: LF });
  }
  function downlight(x, z) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), M.glow);
    m.rotation.x = PI / 2; m.position.set(x, CEIL - 0.003, z);
    ceilGroup.add(m);
  }
  // Pleated curtain hung inside a window.
  function curtain(x, z, w, axis, h = 2.65) {
    const g = new THREE.PlaneGeometry(w, h, 40, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) / w * 40 * 0.5 * PI) * 0.035);
    g.computeVertexNormals(); boxUV(g);
    const m = shadow(new THREE.Mesh(g, M.curtain));
    m.position.set(x, 0.05 + h / 2, z);
    if (axis === 'z') m.rotation.y = PI / 2;
    scene.add(m);
  }
  function wc(x, z, rot) {
    const g = group(x, z, rot);
    box(-0.19, 0.0, -0.08, 0.19, 0.4, 0.42, M.white, { parent: g, r: 0.12 });
    box(-0.2, 0.39, -0.06, 0.2, 0.43, 0.44, M.white, { parent: g, r: 0.08 });
    box(-0.3, 0.0, -0.2, 0.3, 1.1, -0.06, M.tile, { parent: g });
    box(-0.11, 0.95, -0.061, 0.11, 1.05, -0.05, M.steel, { parent: g, lines: false });
  }
  function basin(x0, z0, x1, z1, face) {
    box(x0, 0.45, z0, x1, 0.82, z1, M.walnut);
    box(x0 - 0.01, 0.82, z0 - 0.01, x1 + 0.01, 0.86, z1 + 0.01, M.quartzW);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(cx - 0.2, 0.86, cz - 0.15, cx + 0.2, 0.98, cz + 0.15, M.white, { r: 0.08 });
    // Mirror on the wall behind.
    if (face === '+x') { box(x0 - 0.02, 1.15, cz - 0.3, x0 - 0.0, 1.85, cz + 0.3, M.mirror); box(x0, 0.98, cz - 0.015, x0 + 0.14, 1.12, cz + 0.015, M.steel, { lines: false }); }
    if (face === '-x') { box(x1, 1.15, cz - 0.3, x1 + 0.02, 1.85, cz + 0.3, M.mirror); box(x1 - 0.14, 0.98, cz - 0.015, x1, 1.12, cz + 0.015, M.steel, { lines: false }); }
    if (face === '-z') { box(cx - 0.3, 1.15, z1, cx + 0.3, 1.85, z1 + 0.02, M.mirror); box(cx - 0.015, 0.98, z1 - 0.14, cx + 0.015, 1.12, z1, M.steel, { lines: false }); }
    if (face === '+z') { box(cx - 0.3, 1.15, z0 - 0.02, cx + 0.3, 1.85, z0, M.mirror); box(cx - 0.015, 0.98, z0, cx + 0.015, 1.12, z0 + 0.14, M.steel, { lines: false }); }
  }
  function shower(x0, z0, x1, z1, glassAt) {
    floor(x0, z0, x1, z1, M.tile, 0.012);
    const [gx0, gz0, gx1, gz1] = glassAt;
    box(gx0, 0.02, gz0, gx1, 2.0, gz1, M.glass, { lines: false }).castShadow = false;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    cyl(cx, 2.15, cz, 0.13, 0.015, M.steel, { lines: false });
  }

  // ---------------------------------------------------------------- lobby
  downlight(2.95, 6.9); downlight(2.95, 8.2);

  // ---------------------------------------------------------------- parent's bedroom + bath
  curtain(2.78, 2.68, 1.85, 'x');
  downlight(2.0, 3.6); downlight(2.0, 5.2);
  // bath
  wc(0.42, 1.55, PI / 2);
  basin(0.2, 2.2, 0.62, 2.72, '+x');
  shower(0.2, 0.45, 1.7, 1.1, [0.2, 1.1, 1.2, 1.12]);
  box(0.2, 0, 0.45, 0.205, 2.1, 2.75, M.tile, { lines: false });
  box(1.695, 0, 0.45, 1.7, 2.1, 2.75, M.tile, { lines: false });
  downlight(0.95, 1.8);

  // ---------------------------------------------------------------- living
  box(3.95, 0, 2.25, 3.99, CEIL, 4.6, M.feature, { lines: false });
  box(3.99, 0.22, 2.4, 4.4, 0.58, 4.45, M.walnut);
  box(3.995, 0.98, 2.88, 4.04, 1.82, 4.02, M.tv);
  box(4.05, 0.58, 2.6, 4.3, 0.62, 2.85, M.brass, { lines: false });
  // console by the dining side
  box(3.95, 0.75, 4.89, 4.3, 0.8, 6.1, M.walnut); box(3.95, 0, 4.92, 4.28, 0.75, 4.97, M.blackM, { lines: false }); box(3.95, 0, 6.02, 4.28, 0.75, 6.07, M.blackM, { lines: false });
  art(3.97, 1.6, 5.5, 0.9, 1.1, 'z', 1);
  // robot vacuum dock (note 5)
  box(6.92, 0, 2.4, 7.2, 0.12, 2.62, M.whiteM); cyl(6.82, 0, 2.51, 0.17, 0.09, M.tv);
  downlight(4.9, 3.0); downlight(6.2, 3.0); downlight(4.9, 4.3); downlight(6.2, 4.3);

  // ---------------------------------------------------------------- sky deck
  // glass railing
  box(1.85, 0, 0.12, 7.2, 1.05, 0.14, M.glassF, { lines: false }).castShadow = false;
  box(1.85, 1.05, 0.1, 7.2, 1.1, 0.16, M.steel);
  for (let x = 1.9; x < 7.2; x += 1.06) box(x, 0, 0.1, x + 0.04, 1.05, 0.16, M.steel, { lines: false });
  box(7.2, 0, 0.0, 14.2, 0.45, 0.04, M.wall);
  box(1.85, 0, 0.3, 1.88, CEIL, 2.85, M.stone, { lines: false });
  downlight(3.0, 1.2); downlight(4.6, 1.2); downlight(6.2, 1.2);

  // ---------------------------------------------------------------- dining
  // crockery unit
  box(8.6, 0, 5.1, 9.0, 0.85, 7.05, M.walnut);
  box(8.58, 0.85, 5.08, 9.0, 0.88, 7.07, M.quartzW);
  box(8.7, 1.4, 5.1, 9.0, 2.2, 7.05, M.walnutL);
  box(8.695, 1.45, 5.15, 8.7, 2.15, 7.0, M.glassF, { lines: false });
  for (let i = 0; i < 4; i++) cyl(8.8, 0.88, 5.4 + i * 0.12, 0.03, 0.18 + (i % 2) * 0.1, i % 2 ? M.potW : M.pot, { lines: false });
  box(8.62, 0.88, 6.3, 8.95, 0.92, 6.9, M.walnutL);
  box(8.45, 0, 7.15, 9.0, 0.85, 7.4, M.walnut);
  downlight(5.0, 5.8); downlight(5.0, 6.8); downlight(8.3, 4.55); downlight(9.85, 4.55);
  // passage basin niche (common wash)
  basin(9.15, 5.1, 9.75, 5.55, '-z');

  // ---------------------------------------------------------------- kitchen (customised, option 1)
  const K = { base: lib.solid({ color: 0x8a9a82, roughness: 0.55 }), upper: lib.solid({ color: 0xece6db, roughness: 0.5 }), top: lib.solid({ color: 0xf1eee8, roughness: 0.22 }) };
  const base = (x0, z0, x1, z1, faceZ = null, faceX = null) => {
    box(x0, 0.1, z0, x1, 0.82, z1, K.base);
    box(x0 + 0.04, 0, z0 + 0.04, x1 - 0.04, 0.1, z1 - 0.04, M.blackM, { lines: false });
    box(x0 - 0.01, 0.82, z0 - 0.01, x1 + 0.01, 0.86, z1 + 0.01, K.top);
    // shutter grooves along the open face
    if (faceZ !== null) { for (let x = x0 + 0.6; x < x1 - 0.1; x += 0.6) box(x - 0.003, 0.12, faceZ - 0.003, x + 0.003, 0.8, faceZ + 0.003, M.blackM, { lines: false }); box(x0, 0.66, faceZ - 0.003, x1, 0.67, faceZ + 0.003, M.brass, { lines: false }); }
    if (faceX !== null) { for (let z = z0 + 0.6; z < z1 - 0.1; z += 0.6) box(faceX - 0.003, 0.12, z - 0.003, faceX + 0.003, 0.8, z + 0.003, M.blackM, { lines: false }); box(faceX - 0.003, 0.66, z0, faceX + 0.003, 0.67, z1, M.brass, { lines: false }); }
  };
  base(4.15, 7.53, 5.9, 7.97, 7.97);      // short run (top)
  base(3.85, 7.85, 4.15, 7.97);
  base(3.85, 7.97, 4.49, 9.33, null, 4.49); // west run, where the store was
  base(3.85, 9.33, 7.9, 9.95, 9.33);       // long run
  // backsplash
  box(4.15, 0.86, 7.53, 5.9, 1.45, 7.54, M.subway, { lines: false });
  box(3.85, 0.86, 7.85, 3.86, 1.45, 9.95, M.subway, { lines: false });
  box(3.85, 0.86, 9.94, 7.96, 1.45, 9.95, M.subway, { lines: false });
  // upper units
  box(4.15, 1.45, 7.53, 5.9, 2.2, 7.88, K.upper);
  box(3.85, 1.45, 9.6, 5.1, 2.2, 9.95, K.upper);
  box(5.95, 1.45, 9.6, 6.85, 2.2, 9.95, K.upper);
  // existing sink + purifier tap on the short run (note 2)
  box(4.8, 0.861, 7.6, 5.3, 0.866, 7.9, M.steel); box(4.83, 0.7, 7.63, 5.27, 0.866, 7.87, M.steel, { lines: false });
  cyl(5.05, 0.86, 7.58, 0.015, 0.3, M.steel, { lines: false }); box(5.035, 1.14, 7.58, 5.065, 1.16, 7.75, M.steel, { lines: false });
  cyl(5.45, 0.86, 7.62, 0.012, 0.28, M.blackM, { lines: false }); box(5.44, 1.12, 7.62, 5.46, 1.14, 7.72, M.blackM, { lines: false });
  // hob + chimney
  box(5.2, 0.86, 9.42, 5.78, 0.875, 9.88, M.blackG);
  for (const [a, b] of [[5.34, 9.53], [5.64, 9.53], [5.34, 9.77], [5.64, 9.77]]) cyl(a, 0.875, b, 0.07, 0.02, M.blackM, { lines: false });
  box(5.15, 1.55, 9.45, 5.85, 1.75, 9.95, M.steel); box(5.33, 1.75, 9.75, 5.67, CEIL, 9.95, M.steel);
  // Futura multi-function sink (note 3): black quartz, integrated drainer, pull-down tap
  box(6.95, 0.862, 9.38, 7.78, 0.872, 9.9, M.granite);
  box(6.99, 0.66, 9.42, 7.45, 0.873, 9.86, M.granite, { lines: false });
  for (let i = 0; i < 6; i++) box(7.5, 0.873, 9.45 + i * 0.07, 7.74, 0.876, 9.47 + i * 0.07, M.blackM, { lines: false });
  cyl(7.22, 0.87, 9.86, 0.025, 0.38, M.blackM, { lines: false });
  { const a = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 10, 24, PI), M.blackM); a.position.set(7.22, 1.25, 9.74); a.rotation.y = PI / 2; a.castShadow = true; scene.add(a); }
  // fridge
  box(7.0, 0, 7.55, 7.93, 1.85, 8.2, M.steelF); box(7.0, 1.2, 8.2, 7.93, 1.21, 8.205, M.blackM, { lines: false });
  box(7.44, 0.4, 8.2, 7.46, 1.6, 8.25, M.blackM, { lines: false }); box(7.48, 0.4, 8.2, 7.5, 1.6, 8.25, M.blackM, { lines: false });
  // utility: washing machine, dryer column, sink unit
  box(7.98, 0, 7.55, 8.58, 0.85, 8.15, M.white); { const d = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 10, 30), M.steel); d.position.set(8.28, 0.45, 8.16); scene.add(d); }
  box(8.4, 0.88, 7.55, 8.42, 0.9, 8.15, M.whiteM, { lines: false });
  box(8.6, 0, 7.55, 9.0, 2.1, 8.15, K.upper);
  base(7.98, 9.4, 9.0, 9.95, 9.4);
  box(8.2, 0.7, 9.48, 8.7, 0.866, 9.88, M.steel, { lines: false }); cyl(8.45, 0.86, 9.9, 0.015, 0.3, M.steel, { lines: false });
  box(7.98, 1.6, 9.7, 9.0, 1.63, 9.95, M.walnutL);
  // utility glass partition, slid open
  box(7.95, 0, 7.53, 7.97, 2.1, 7.6, M.frame, { lm: LW }); box(7.95, 0, 9.3, 7.97, 2.1, 9.36, M.frame, { lm: LW });
  box(7.955, 0.05, 7.6, 7.965, 2.05, 8.25, M.glassF, { lines: false }).castShadow = false;
  downlight(4.9, 8.65); downlight(6.3, 8.65); downlight(8.48, 8.75);

  // ---------------------------------------------------------------- kid's bedroom
  curtain(8.25, 0.62, 0.6, 'x'); curtain(9.65, 0.62, 0.6, 'x');
  downlight(8.9, 1.6); downlight(8.9, 3.0);

  // ---------------------------------------------------------------- master bedroom + bath
  curtain(11.6, 0.62, 0.7, 'x'); curtain(12.95, 0.62, 0.7, 'x');
  downlight(12.0, 1.4); downlight(12.0, 3.6); downlight(11.0, 4.6);
  // bath
  shower(10.75, 5.1, 11.6, 6.45, [11.6, 5.1, 11.62, 6.0]);
  wc(12.05, 6.4, PI);
  basin(12.5, 6.0, 13.1, 6.45, '+z');
  downlight(12.2, 5.7);
  // common bath
  wc(9.85, 7.36, PI);
  shower(9.15, 5.7, 9.75, 6.6, [9.75, 5.7, 9.77, 6.4]);
  downlight(9.85, 6.6);

  // ---------------------------------------------------------------- furniture layouts
  // Three layouts per room. Index 0 is the layout from the customised drawing.
  const layouts = {};
  function layout(key, i, fn) {
    const g = new THREE.Group(); g.name = `${key}:${i}`; g.visible = i === 0;
    scene.add(g);
    const prev = target; target = g; fn(); target = prev;
    (layouts[key] ||= [])[i] = g;
  }
  function sofa(x, z, rot, len, mat = M.linenG, cushion = mat) {
    const g = group(x, z, rot), h = len / 2;
    box(-h, 0.08, -0.45, h, 0.42, 0.45, mat, { parent: g, r: 0.04 });
    box(-h, 0.42, -0.45, h, 0.85, -0.22, mat, { parent: g, r: 0.06 });
    box(-h - 0.07, 0.08, -0.45, -h + 0.1, 0.62, 0.45, mat, { parent: g, r: 0.05 });
    box(h - 0.1, 0.08, -0.45, h + 0.07, 0.62, 0.45, mat, { parent: g, r: 0.05 });
    const n = Math.max(1, Math.round((len - 0.2) / 0.62)), cw = (len - 0.2) / n;
    for (let i = 0; i < n; i++) box(-h + 0.11 + i * cw, 0.42, -0.22, -h + 0.09 + (i + 1) * cw, 0.55, 0.42, cushion, { parent: g, r: 0.05 });
    return g;
  }
  function armchair(x, z, rot, mat = M.leather) {
    const g = group(x, z, rot);
    box(-0.36, 0.0, -0.36, 0.36, 0.4, 0.36, mat, { parent: g, r: 0.06 });
    box(-0.36, 0.4, -0.36, 0.36, 0.82, -0.18, mat, { parent: g, r: 0.06 });
    box(-0.38, 0, -0.36, -0.28, 0.6, 0.36, mat, { parent: g, r: 0.04 });
    box(0.28, 0, -0.36, 0.38, 0.6, 0.36, mat, { parent: g, r: 0.04 });
    return g;
  }
  function floorLamp(x, z) { cyl(x, 0, z, 0.15, 0.02, M.blackM, { lines: false }); cyl(x, 0.02, z, 0.012, 1.5, M.blackM, { lines: false }); cyl(x, 1.45, z, 0.2, 0.25, M.glow, { r2: 0.13 }); }
  function legs4(x0, z0, x1, z1, h, i = 0.08) { for (const [a, b] of [[x0 + i, z0 + i], [x1 - i, z0 + i], [x0 + i, z1 - i], [x1 - i, z1 - i]]) box(a - 0.025, 0, b - 0.025, a + 0.025, h, b + 0.025, M.blackM, { lines: false }); }
  function books(x0, x1, z0, z1, y0, rows) {
    for (let s = 0; s < rows; s++) {
      let z = z0;
      while (z < z1) { const w = 0.025 + Math.random() * 0.03, h = 0.2 + Math.random() * 0.12; box(x0, y0 + s * 0.44, z, x1, y0 + s * 0.44 + h, z + w, [M.linenT, M.linenB, M.linenS, M.linen][(Math.random() * 4) | 0], { lines: false }); z += w + 0.004 + (Math.random() < 0.1 ? 0.15 : 0); }
    }
  }
  function pendantGlobes(x, z) {
    for (const [dx, dz, y] of [[-0.25, -0.1, 1.72], [0.15, 0.12, 1.82], [0.05, -0.2, 1.62]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), M.glow); m.position.set(x + dx, y, z + dz); target.add(m);
      cyl(x + dx, y + 0.12, z + dz, 0.004, CEIL - y - 0.12, M.blackM, { lines: false });
    }
  }
  function linearPendant(x0, x1, z) {
    box(x0, 1.65, z - 0.04, x1, 1.7, z + 0.04, M.blackM); box(x0 + 0.02, 1.64, z - 0.03, x1 - 0.02, 1.65, z + 0.03, M.glow, { lines: false });
    cyl(x0 + 0.15, 1.7, z, 0.004, CEIL - 1.7, M.blackM, { lines: false }); cyl(x1 - 0.15, 1.7, z, 0.004, CEIL - 1.7, M.blackM, { lines: false });
  }
  function planter(x0, x1, z0 = 0.2, z1 = 0.5) {
    box(x0, 0, z0, x1, 0.45, z1, M.feature);
    for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.14) blob(x, 0.55 + Math.random() * 0.15, (z0 + z1) / 2, 0.14, 0.17, 0.12, Math.random() < 0.5 ? M.leaf : M.leafD, target);
  }

  // ---------------------------------------------------------------- lobby
  layout('lobby', 0, () => {
    box(2.2, 0.12, 6.25, 2.55, 1.0, 7.15, M.walnut); box(2.2, 0.12, 7.75, 2.55, 1.0, 8.95, M.walnut);
    box(2.2, 0.42, 7.2, 2.58, 0.48, 7.72, M.walnutL); box(2.22, 0.48, 7.2, 2.56, 0.56, 7.72, M.linenS, { r: 0.03 });
    box(2.2, 1.0, 6.25, 2.55, 1.03, 8.95, M.quartzW);
    box(2.2, 1.25, 7.15, 2.23, 2.15, 7.75, M.mirror);
  });
  layout('lobby', 1, () => {
    box(2.2, 0.8, 6.55, 2.5, 0.84, 8.65, M.walnut); box(2.2, 0.2, 6.6, 2.48, 0.23, 8.6, M.walnutL);
    legs4(2.2, 6.55, 2.5, 8.65, 0.8, 0.04);
    const mr = cyl(2.215, 1.55 - 0.015, 7.6, 0.38, 0.03, M.mirror); mr.rotation.z = PI / 2;
    cyl(2.38, 0.84, 6.85, 0.07, 0.25, M.potW, { r2: 0.05 }); blob(2.38, 1.18, 6.85, 0.12, 0.14, 0.12, M.leaf, target);
    plant(2.45, 8.85, 0.8, true);
  });
  layout('lobby', 2, () => {
    box(2.2, 0, 7.85, 2.6, 2.1, 8.92, M.walnut);
    for (const z of [8.2, 8.55]) box(2.6, 0.05, z - 0.003, 2.603, 2.05, z + 0.003, M.blackM, { lines: false });
    box(2.2, 0.4, 7.2, 2.6, 0.46, 7.8, M.walnutL); box(2.22, 0.46, 7.22, 2.58, 0.54, 7.78, M.linenT, { r: 0.03 });
    legs4(2.2, 7.2, 2.6, 7.8, 0.4, 0.04);
    box(2.2, 1.3, 6.35, 2.23, 2.0, 7.15, M.walnutL);
    for (let i = 0; i < 4; i++) box(2.23, 1.75, 6.5 + i * 0.18, 2.3, 1.78, 6.52 + i * 0.18, M.brass, { lines: false });
    plant(2.45, 6.45, 0.7);
  });

  // ---------------------------------------------------------------- parent's bedroom
  layout('parent', 0, () => {
    bed(2.635, 4.15, -PI / 2, 1.52, 2.03, M.linenB);
    sideTable(3.45, 3.12); sideTable(3.45, 5.18, true);
    wardrobe(0.2, 5.45, 1.7, 6.05, '-z');
    box(1.75, 0, 5.65, 2.45, 0.78, 6.05, M.walnutL); box(1.9, 1.0, 6.03, 2.3, 1.8, 6.05, M.mirror);
    box(0.2, 0.25, 3.85, 0.45, 0.6, 5.45, M.walnut);
    box(0.2, 1.0, 4.15, 0.25, 1.75, 5.15, M.tv);
    box(0.2, 0, 2.95, 0.62, 0.75, 3.55, M.walnutL); chair(0.85, 3.25, -PI / 2, M.linen);
    art(3.66, 1.75, 4.15, 1.0, 0.6, 'z', 0);
  });
  layout('parent', 1, () => {
    bed(1.33, 4.26, PI / 2, 1.52, 2.03, M.linenS, M.linen);
    sideTable(0.45, 3.22); sideTable(0.45, 5.25);
    wardrobe(1.1, 5.45, 2.7, 6.05, '-z');
    box(3.3, 0.25, 3.6, 3.7, 0.6, 5.0, M.walnut); box(3.65, 1.0, 3.75, 3.7, 1.75, 4.85, M.tv);
    plant(3.45, 3.1, 1.0, true);
    floor(0.9, 3.3, 2.9, 5.2, M.rug, 0.016);
    art(0.22, 1.65, 4.26, 1.0, 0.6, 'z', 2);
  });
  layout('parent', 2, () => {
    bed(2.68, 3.55, -PI / 2, 0.92, 1.95, M.linenB, M.linen);
    bed(2.68, 4.85, -PI / 2, 0.92, 1.95, M.linenT, M.linen);
    sideTable(3.47, 4.2);
    wardrobe(0.2, 3.3, 0.8, 5.4, '+x');
    box(0.25, 0, 5.65, 1.35, 0.78, 6.05, M.walnutL); box(0.45, 1.0, 6.03, 1.15, 1.7, 6.05, M.mirror);
    art(3.66, 1.8, 4.2, 0.9, 0.55, 'z', 1);
  });

  // ---------------------------------------------------------------- living
  layout('living', 0, () => {
    const s = sofa(6.75, 3.55, -PI / 2, 1.8);
    box(-0.8, 0.55, -0.3, -0.4, 0.88, -0.16, M.linenT, { parent: s, r: 0.05 });
    box(0.45, 0.55, -0.3, 0.85, 0.88, -0.16, M.linenS, { parent: s, r: 0.05 });
    floor(4.55, 2.75, 7.05, 4.6, M.rug, 0.018);
    cyl(5.45, 0, 3.7, 0.38, 0.36, M.walnut); cyl(5.45, 0.36, 3.7, 0.4, 0.03, M.quartzW);
    cyl(5.35, 0.39, 3.6, 0.08, 0.12, M.potW, { r2: 0.06 }); blob(5.35, 0.56, 3.6, 0.1, 0.08, 0.1, M.leaf, target);
    armchair(4.85, 2.95, PI * 0.78);
    plant(4.45, 2.5, 1.25, true);
    floorLamp(7.0, 2.55);
  });
  layout('living', 1, () => {
    sofa(6.75, 3.5, -PI / 2, 1.6, M.linenG);
    sofa(5.45, 4.4, PI, 1.2, M.linenG);
    floor(4.4, 2.7, 7.1, 4.9, M.rugK, 0.018);
    box(5.0, 0.33, 3.15, 6.0, 0.38, 3.85, M.walnut); box(5.05, 0, 3.2, 5.95, 0.33, 3.8, M.blackM);
    plant(4.45, 2.5, 1.25, true);
    floorLamp(7.0, 2.4);
  });
  layout('living', 2, () => {
    sofa(6.65, 3.6, -PI / 2, 1.4, M.linenG);
    armchair(5.0, 2.95, 0.35, M.leather); armchair(5.0, 4.3, PI - 0.35, M.leather);
    cyl(5.45, 0, 3.62, 0.3, 0.42, M.linenT);
    floor(4.5, 2.75, 7.05, 4.55, M.rug, 0.018);
    plant(4.45, 2.5, 1.1, true);
    floorLamp(7.0, 2.55);
  });

  // ---------------------------------------------------------------- sky deck
  layout('deck', 0, () => {
    box(2.55, 0.42, 0.65, 3.15, 0.5, 1.8, M.deck, { r: 0.02 });
    box(2.55, 0.5, 0.65, 2.65, 0.95, 1.8, M.deck, { r: 0.02 });
    box(2.65, 0.5, 0.7, 3.1, 0.62, 1.75, M.linenS, { r: 0.04 });
    for (const zz of [0.68, 1.77]) for (const xx of [2.6, 3.1]) cyl(xx, 0.5, zz, 0.008, CEIL - 0.5, M.blackM, { lines: false });
    cyl(5.65, 0, 0.95, 0.3, 0.5, M.blackM); cyl(5.65, 0.5, 0.95, 0.32, 0.025, M.deck);
    for (const [x, r] of [[4.95, PI / 2], [6.35, -PI / 2]]) {
      const c = group(x, 0.95, r);
      box(-0.33, 0.12, -0.3, 0.33, 0.4, 0.33, M.linen, { parent: c, r: 0.08 });
      box(-0.35, 0.12, -0.36, 0.35, 0.95, -0.22, M.leather, { parent: c, r: 0.08 });
      cyl(0, 0, 0, 0.25, 0.12, M.blackM, { parent: c, lines: false });
    }
    planter(1.85, 2.45); planter(6.55, 7.15);
    plant(3.45, 2.45, 1.1, true);
  });
  layout('deck', 1, () => {
    cyl(5.2, 0, 1.15, 0.25, 0.02, M.blackM, { lines: false }); cyl(5.2, 0.02, 1.15, 0.05, 0.7, M.blackM, { lines: false }); cyl(5.2, 0.72, 1.15, 0.5, 0.03, M.deck);
    chair(5.2, 0.5, 0, M.linen); chair(5.2, 1.8, PI, M.linen); chair(4.55, 1.15, PI / 2, M.linen); chair(5.85, 1.15, -PI / 2, M.linen);
    cyl(5.2, 0.75, 1.15, 0.06, 0.15, M.glow, { r2: 0.05 });
    box(1.9, 0.4, 0.6, 2.35, 0.46, 2.0, M.deck); legs4(1.9, 0.6, 2.35, 2.0, 0.4, 0.05); box(1.92, 0.46, 0.62, 2.33, 0.54, 1.98, M.linenS, { r: 0.03 });
    planter(2.7, 3.9); planter(6.55, 7.15);
    plant(6.9, 1.9, 1.0, true);
  });
  layout('deck', 2, () => {
    sofa(6.72, 1.0, -PI / 2, 1.3, M.linenG);
    box(5.5, 0.3, 0.7, 6.0, 0.35, 1.3, M.deck); box(5.55, 0, 0.75, 5.95, 0.3, 1.25, M.blackM);
    cyl(5.75, 0.35, 1.0, 0.08, 0.18, M.glow, { r2: 0.06 });
    box(2.0, 0.22, 0.55, 2.7, 0.32, 2.4, M.deck); legs4(2.0, 0.55, 2.7, 2.4, 0.22, 0.05);
    box(2.03, 0.32, 0.6, 2.67, 0.4, 2.35, M.linen, { r: 0.04 }); box(2.05, 0.4, 0.62, 2.65, 0.6, 0.85, M.linenT, { r: 0.05 });
    cyl(3.0, 0, 0.75, 0.2, 0.45, M.blackM);
    planter(3.3, 5.2);
  });

  // ---------------------------------------------------------------- dining
  layout('dining', 0, () => {
    box(6.65, 0.73, 5.7, 8.0, 0.77, 6.5, M.walnut); legs4(6.65, 5.7, 8.0, 6.5, 0.73, 0.1);
    chair(6.95, 5.45, 0); chair(7.7, 5.45, 0); chair(6.95, 6.75, PI); chair(7.7, 6.75, PI); chair(6.4, 6.1, PI / 2); chair(8.25, 6.1, -PI / 2);
    cyl(7.33, 0.77, 6.1, 0.1, 0.22, M.potW, { r2: 0.07 }); blob(7.33, 1.08, 6.1, 0.12, 0.12, 0.12, M.leaf, target);
    linearPendant(6.85, 7.8, 6.1);
  });
  layout('dining', 1, () => {
    cyl(7.3, 0, 6.05, 0.3, 0.03, M.blackM, { lines: false }); cyl(7.3, 0.03, 6.05, 0.08, 0.7, M.blackM); cyl(7.3, 0.73, 6.05, 0.6, 0.04, M.walnut);
    chair(7.3, 5.2, 0); chair(7.3, 6.9, PI); chair(6.45, 6.05, PI / 2); chair(8.15, 6.05, -PI / 2);
    cyl(7.3, 0.77, 6.05, 0.09, 0.2, M.pot, { r2: 0.06 });
    pendantGlobes(7.3, 6.05);
    plant(4.35, 7.05, 1.2, true);
  });
  layout('dining', 2, () => {
    box(6.0, 0.73, 5.4, 8.0, 0.77, 6.3, M.walnut); legs4(6.0, 5.4, 8.0, 6.3, 0.73, 0.1);
    box(6.5, 0.42, 4.95, 7.7, 0.47, 5.25, M.walnut); legs4(6.5, 4.95, 7.7, 5.25, 0.42, 0.06);
    chair(6.4, 6.6, PI); chair(7.0, 6.6, PI); chair(7.6, 6.6, PI); chair(5.75, 5.85, PI / 2); chair(8.25, 5.85, -PI / 2);
    for (const x of [6.6, 7.4]) cyl(x, 0.77, 5.85, 0.05, 0.25, M.potW, { r2: 0.03, lines: false });
    linearPendant(6.35, 7.65, 5.85);
  });

  // ---------------------------------------------------------------- kid's bedroom
  layout('kid', 0, () => {
    bed(7.885, 2.93, 0, 0.88, 1.92, M.linenS, M.linenT);
    wardrobe(8.36, 3.47, 9.6, 3.98, '-z');
    box(7.45, 0.72, 0.55, 7.95, 0.76, 1.95, M.walnutL); box(7.45, 0, 0.55, 7.95, 0.72, 0.6, M.walnutL); box(7.45, 0, 1.9, 7.95, 0.72, 1.95, M.walnutL);
    chair(8.15, 1.25, -PI / 2, M.linenT);
    box(7.5, 0.76, 0.75, 7.52, 1.06, 1.15, M.tv);
    box(10.15, 0, 0.55, 10.5, 1.8, 2.3, M.walnutL); books(10.18, 10.42, 0.6, 2.2, 0.05, 4);
    floor(8.5, 1.0, 9.8, 2.6, M.rugK, 0.016);
    art(8.95, 1.6, 3.45, 0.7, 0.5, 'x', 2);
  });
  layout('kid', 1, () => {
    // bunk bed along the east wall
    for (const [a, b] of [[9.45, 0.6], [10.45, 0.6], [9.45, 2.6], [10.45, 2.6]]) box(a - 0.03, 0, b - 0.03, a + 0.03, 1.75, b + 0.03, M.walnutL);
    box(9.45, 0.2, 0.6, 10.45, 0.28, 2.6, M.walnutL); box(9.48, 0.28, 0.63, 10.42, 0.46, 2.57, M.linenB, { r: 0.04 });
    box(9.45, 1.1, 0.6, 10.45, 1.18, 2.6, M.walnutL); box(9.48, 1.18, 0.63, 10.42, 1.34, 2.57, M.linenT, { r: 0.04 });
    box(9.42, 1.34, 0.6, 9.46, 1.6, 1.9, M.walnutL);
    for (let y = 0.4; y < 1.2; y += 0.28) box(9.4, y, 2.3, 9.44, y + 0.03, 2.6, M.walnutL, { lines: false });
    box(7.8, 0.72, 0.5, 9.3, 0.76, 1.1, M.walnutL); box(7.8, 0, 0.5, 7.84, 0.72, 1.1, M.walnutL); box(9.26, 0, 0.5, 9.3, 0.72, 1.1, M.walnutL);
    chair(8.55, 1.4, PI, M.linenT);
    wardrobe(8.36, 3.47, 9.4, 3.98, '-z');
    blob(7.95, 0.28, 2.7, 0.45, 0.3, 0.45, M.linenT, target);
    floor(7.8, 1.6, 9.3, 3.2, M.rugK, 0.016);
  });
  layout('kid', 2, () => {
    bed(8.47, 1.0, PI / 2, 0.92, 1.95, M.linenB, M.linen);
    box(10.0, 0.72, 1.0, 10.5, 0.76, 2.6, M.walnutL); box(10.0, 0, 1.0, 10.5, 0.72, 1.04, M.walnutL); box(10.0, 0, 2.56, 10.5, 0.72, 2.6, M.walnutL);
    box(10.45, 0.76, 1.55, 10.47, 1.06, 2.05, M.tv);
    chair(9.7, 1.8, PI / 2, M.linenS);
    box(7.45, 0, 1.9, 7.8, 1.8, 3.3, M.walnutL); books(7.48, 7.72, 1.95, 3.2, 0.05, 4);
    wardrobe(8.36, 3.47, 9.6, 3.98, '-z');
    armchair(8.6, 2.75, PI * 0.85, M.linenT);
    floor(8.0, 1.7, 9.6, 3.2, M.rug, 0.016);
  });

  // ---------------------------------------------------------------- master bedroom
  layout('master', 0, () => {
    bed(12.65, 2.37, -PI / 2, 1.8, 2.06, M.linen, M.linenG);
    sideTable(13.5, 1.22); sideTable(13.5, 3.52);
    wardrobe(13.15, 3.8, 13.75, 5.0, '-x');
    box(10.7, 0.25, 1.75, 11.05, 0.6, 3.95, M.walnut); box(10.7, 1.0, 2.2, 10.75, 1.82, 3.45, M.tv);
    box(10.7, 0.72, 0.55, 11.3, 0.76, 1.65, M.walnutL); box(10.7, 0, 0.55, 11.3, 0.72, 0.6, M.walnutL);
    chair(11.5, 1.1, -PI / 2, M.linen);
    floor(11.2, 1.25, 12.0, 3.5, M.rug, 0.016);
    plant(13.45, 0.8, 1.0, true);
  });
  layout('master', 1, () => {
    bed(11.75, 2.5, PI / 2, 1.8, 2.06, M.linenG, M.linen);
    sideTable(10.95, 1.3); sideTable(10.95, 3.7);
    box(13.35, 0.25, 1.6, 13.75, 0.6, 3.4, M.walnut); box(13.7, 1.0, 1.95, 13.75, 1.82, 3.05, M.tv);
    wardrobe(13.15, 3.8, 13.75, 5.0, '-x');
    armchair(13.0, 0.95, PI * 1.25, M.linenS);
    floor(11.0, 1.2, 13.0, 3.8, M.rug, 0.016);
    art(10.72, 1.75, 2.5, 1.2, 0.7, 'z', 0);
  });
  layout('master', 2, () => {
    bed(12.65, 2.37, -PI / 2, 1.8, 2.06, M.linenB, M.linen);
    sideTable(13.5, 1.22); sideTable(13.5, 3.52);
    wardrobe(10.7, 1.75, 11.3, 3.95, '+x');
    box(10.7, 0, 0.55, 11.3, 0.78, 1.6, M.walnutL); box(10.7, 1.0, 0.8, 10.73, 1.8, 1.4, M.mirror);
    box(11.6, 0.1, 0.58, 12.9, 0.42, 1.18, M.linenS, { r: 0.04 }); box(11.6, 0.42, 0.58, 11.85, 0.75, 1.18, M.linenS, { r: 0.05 });
    legs4(11.6, 0.58, 12.9, 1.18, 0.1, 0.06);
    box(13.15, 0, 3.85, 13.75, 0.45, 4.95, M.walnut);
    floor(11.4, 1.3, 12.2, 3.45, M.rugK, 0.016);
  });

  // Kitchen cabinetry is built in, so its options are finishes.
  const KITCHEN = [
    { base: { color: 0x8a9a82, map: null }, upper: 0xece6db, top: 0xf1eee8 },
    { base: { color: 0xffffff, map: M.walnut.map }, upper: 0x3a3a3c, top: 0xe9e6e0 },
    { base: { color: 0x2f3e55, map: null }, upper: 0xf4f2ee, top: 0xf7f5f1 },
  ];
  const current = {};
  function setLayout(key, i) {
    current[key] = i;
    if (key === 'kitchen') {
      const p = KITCHEN[i];
      K.base.color.set(p.base.color);
      if (K.base.map !== p.base.map) { K.base.map = p.base.map; K.base.needsUpdate = true; }
      K.upper.color.set(p.upper); K.top.color.set(p.top);
      return;
    }
    (layouts[key] || []).forEach((g, n) => { g.visible = n === i; });
  }

  return { M, K, wallish, doors, ceilGroup, INK, LW, lineObjs, solids, layouts, setLayout, current };
}

// ---------------------------------------------------------------------------
// Outside: the tower we live in, the city of Kharadi below, hills on the horizon.
// ---------------------------------------------------------------------------
export function buildWorld(scene, lib, M) {
  const PIv = Math.PI;
  const out = (m) => reveal(m, { outside: true });
  const facadeTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#d6cfc2'; g.fillRect(0, 0, w, h);
    for (let f = 0; f < 2; f++) {
      const y = f * h / 2;
      g.fillStyle = '#7d8f99'; g.fillRect(0, y + h * 0.17, w, h * 0.28);
      g.fillStyle = '#c8c1b4'; for (let i = 0; i < 4; i++) g.fillRect(i * w / 4, y + h * 0.17, 6, h * 0.28);
    }
  });
  facadeTex.repeat.set(1 / 4, 1 / 6);
  const facade = out(new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.7, envMapIntensity: 0.8 }));

  // Our tower: floors below and above this flat.
  const shape = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)));
  const below = new THREE.ExtrudeGeometry(shape, { depth: 26.5, bevelEnabled: false });
  below.rotateX(-PIv / 2); below.translate(0, -26.75, 0); boxUV(below);
  const towerBelow = new THREE.Mesh(below, facade); towerBelow.receiveShadow = true; scene.add(towerBelow);
  const above = new THREE.ExtrudeGeometry(shape, { depth: 30, bevelEnabled: false });
  above.rotateX(-PIv / 2); above.translate(0, H + 0.02, 0); boxUV(above);
  const towerAbove = new THREE.Mesh(above, facade); towerAbove.castShadow = true; scene.add(towerAbove);
  // Neighbouring wings of the same society.
  const wing = (x, z, w, d, h) => {
    const g = boxUV(new THREE.BoxGeometry(w, h, d)); g.translate(x, -27 + h / 2, z);
    const m = new THREE.Mesh(g, facade); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  };
  wing(-26, 4, 18, 14, 66); wing(56, -8, 16, 14, 60); wing(10, 46, 30, 14, 60); wing(-18, -48, 20, 15, 54);

  // City blocks, merged into one mesh.
  const litCells = [];
  const cityTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9c0b0'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 6; i++) {
      const lit = Math.random() < 0.3;
      if (lit) litCells.push([i, j]);
      g.fillStyle = lit && Math.random() < 0.4 ? '#e8cf9a' : (Math.random() < 0.5 ? '#76858d' : '#8a979c');
      g.fillRect(i * w / 6 + 6, j * h / 8 + 7, w / 6 - 12, h / 8 - 14);
    }
  });
  cityTex.repeat.set(1 / 20, 1 / 24);
  const cityGlow = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (const [i, j] of litCells) { g.fillStyle = Math.random() < 0.5 ? '#ffcf86' : '#ffe6b8'; g.fillRect(i * w / 6 + 6, j * h / 8 + 7, w / 6 - 12, h / 8 - 14); }
  });
  cityGlow.repeat.copy(cityTex.repeat);
  const parts = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 520; i++) {
    const a = rnd() * PIv * 2, r = 140 + Math.pow(rnd(), 0.7) * 1100;
    const x = 7 + Math.cos(a) * r, z = 5 + Math.sin(a) * r;
    const tall = rnd() < 0.25;
    const w = 14 + rnd() * 26, d = 12 + rnd() * 22, h = tall ? 45 + rnd() * 60 : 9 + rnd() * 25;
    const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rnd() * PIv); g.translate(x, -27 + h / 2, z);
    parts.push(boxUV(g));
  }
  const merged = mergeBoxes(parts);
  const city = new THREE.Mesh(merged, out(new THREE.MeshStandardMaterial({ map: cityTex, roughness: 0.85, envMapIntensity: 0.9, emissiveMap: cityGlow, emissive: 0xffffff, emissiveIntensity: 0 })));
  city.receiveShadow = false; scene.add(city);
  // Trees as scattered blobs.
  const treeGeo = new THREE.IcosahedronGeometry(1, 0);
  const trees = new THREE.InstancedMesh(treeGeo, out(new THREE.MeshStandardMaterial({ color: 0x5d7346, roughness: 0.9, flatShading: true })), 900);
  const o = new THREE.Object3D();
  for (let i = 0; i < 900; i++) {
    const a = rnd() * PIv * 2, r = 50 + rnd() * 700;
    o.position.set(7 + Math.cos(a) * r, -27 + 2 + rnd() * 2, 5 + Math.sin(a) * r);
    const s = 2.5 + rnd() * 3.5; o.scale.set(s, s * 1.1, s); o.rotation.set(rnd(), rnd(), 0); o.updateMatrix();
    trees.setMatrixAt(i, o.matrix);
  }
  scene.add(trees);
  // Ground.
  const ground = new THREE.Mesh(boxUV(new THREE.PlaneGeometry(5000, 5000).rotateX(-PIv / 2)), out(new THREE.MeshStandardMaterial({ color: 0x8d9277, roughness: 1 })));
  ground.position.y = -27; ground.receiveShadow = true; scene.add(ground);
  // Hills ring.
  const hg = new THREE.CylinderGeometry(2600, 2600, 260, 160, 6, true);
  const hp = hg.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i), ang = Math.atan2(hp.getZ(i), hp.getX(i));
    if (y > 0) hp.setY(i, y * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(ang * 7) * Math.cos(ang * 3.3 + 1))));
  }
  hg.computeVertexNormals();
  const hills = new THREE.Mesh(hg, out(new THREE.MeshStandardMaterial({ color: 0x8f9a8e, roughness: 1, side: THREE.BackSide })));
  hills.position.set(7, -27 + 100, 5); scene.add(hills);
  return { towerAbove, city, facade, ground, hills };
}

function mergeBoxes(geos) {
  let n = 0; for (const g of geos) n += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}
