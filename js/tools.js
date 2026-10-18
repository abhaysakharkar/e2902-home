import * as THREE from 'three';
import { WALLS, OUTLINE, ROOMS, CEIL } from './plan.js';
import { ELECTRICAL, ETYPES } from './electrical-data.js';

// Shared tools for the walk and studio pages:
//   Electrical — services points from the electrical layout, with a furniture clash check
//   Tape       — click two points to measure
//   Fit check  — drop in a piece of real furniture by size and see its clearances
// The page supplies the scene, camera, canvas, home (from buildHome) and a few hooks.

const PI = Math.PI;
const FIT_KEY = 'e2902-fit';
const WALKWAY = 0.75;    // metres: under this a gap is flagged
const AGAINST = 0.03;    // metres: under this the piece is simply against something

export function ftin(m) {
  const inches = Math.round(m / 0.0254);
  const ft = Math.floor(inches / 12), inch = inches % 12;
  return ft ? `${ft}'-${inch}"` : `${inch}"`;
}
export const mm = (m) => `${Math.round(m * 1000).toLocaleString('en-IN')} mm`;

function inPoly(x, z, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const wallBoxes = WALLS.map((P) => { const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]); return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]; });
const inWall = (x, z) => WALLS.some((P, i) => { const b = wallBoxes[i]; return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && inPoly(x, z, P); });
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const roomName = (x, z) => { for (const r of ROOMS) for (const [a, b, c, d] of r.rects) if (x >= a && x <= c && z >= b && z <= d) return r.name; return 'the flat'; };

// Floor footprint of a mesh: its local box turned the way the mesh is turned.
const _v = new THREE.Vector3();
function footprint(m) {
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox, pts = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const [x, z] of [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]]) {
    for (const y of [b.min.y, b.max.y]) { _v.set(x, y, z).applyMatrix4(m.matrixWorld); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    _v.set(x, b.min.y, z).applyMatrix4(m.matrixWorld); pts.push([_v.x, _v.z]);
  }
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { m, pts, y0, y1, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
}

export function createTools(o) {
  const { scene, camera, canvas, home } = o;
  const mode = o.mode || 'walk';
  const root = new THREE.Group(); root.name = 'tools'; scene.add(root);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const listeners = [];
  const changed = () => listeners.forEach((f) => f());

  // ---------------------------------------------------------------- DOM
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('../css/tools.css', import.meta.url).href; document.head.appendChild(css);
  const labels = document.createElement('div'); labels.className = 'tl-labels'; document.body.appendChild(labels);
  const tip = document.createElement('div'); tip.className = 'tl-tip'; document.body.appendChild(tip);
  const card = document.createElement('div'); card.className = 'tl-card' + (o.cardClass ? ' ' + o.cardClass : '');
  card.innerHTML = `
    <div class="tl-tabs">${(o.extraTabs || []).map((t) => `<button data-t="${t.key}">${t.label}</button>`).join('')}<button data-t="elec">Electrical</button><button data-t="tape">Tape</button><button data-t="fit">Fit check</button><button class="tl-x" title="Close">×</button></div>
    ${(o.extraTabs || []).map((t) => `<div class="tl-body" data-b="${t.key}"></div>`).join('')}
    <div class="tl-body" data-b="elec">
      <label class="tl-sw"><input type="checkbox" id="tlElecOn"> Show points on the walls and ceiling</label>
      <div class="tl-legend" id="tlLegend"></div>
      <p class="tl-h">Clashes with furniture <b id="tlClashN">0</b></p>
      <ul class="tl-list" id="tlClashes"></ul>
      <p class="tl-note">Appliance points (PP, P) sit behind their appliances by design, so they are not listed. From the builder's electrical layout, with the kitchen points moved per your customised drawing (gold ring). Points may shift on site.</p>
    </div>
    <div class="tl-body" data-b="tape">
      <label class="tl-sw"><input type="checkbox" id="tlTapeOn"> Measure: click two points</label>
      <p class="tl-note">Hold <b>Shift</b> to keep the line straight along a wall or upright. Right-click or Backspace removes the last one.</p>
      <ul class="tl-list" id="tlTapes"></ul>
      <button class="tl-btn ghost" id="tlTapeClear">Clear all</button>
    </div>
    <div class="tl-body" data-b="fit">
      <div class="tl-presets" id="tlPresets"></div>
      <div class="tl-form">
        <input id="tlName" placeholder="Name, e.g. Urban Ladder sofa" maxlength="40">
        <div class="tl-dims"><label>W<input id="tlW" type="number" min="10" max="600" value="210"></label><label>D<input id="tlD" type="number" min="10" max="600" value="90"></label><label>H<input id="tlH" type="number" min="5" max="280" value="85"></label><span>cm</span></div>
        <button class="tl-btn" id="tlAdd">${mode === 'walk' ? 'Place in front of me' : 'Place in the room'}</button>
      </div>
      <ul class="tl-list" id="tlFits"></ul>
      <p class="tl-note">Clearances are shown on the floor. <span class="amber">Amber</span> = under 75 cm to walk past, <span class="red">red</span> = overlapping. ${mode === 'studio' ? 'Drag a piece to move it; R turns it.' : 'Use the arrows to nudge, ⟳ to turn.'}</p>
    </div>`;
  (o.container || document.body).appendChild(card);
  const $c = (s) => card.querySelector(s);
  let tab = null;
  function openTab(t) {
    tab = t;
    card.classList.toggle('open', !!t);
    card.querySelectorAll('.tl-tabs button[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    card.querySelectorAll('.tl-body').forEach((b) => (b.hidden = b.dataset.b !== t));
    if (t === 'elec' && !elecOn) setElec(true);
    if (t !== 'tape') setTape(false);
    if (t === 'tape') setTape(true);
    o.onOpen && o.onOpen(t);
  }
  card.querySelectorAll('.tl-tabs button[data-t]').forEach((b) => b.addEventListener('click', () => openTab(tab === b.dataset.t ? null : b.dataset.t)));
  $c('.tl-x').addEventListener('click', () => openTab(null));

  // ---------------------------------------------------------------- space: walls + furniture on the floor
  let quads = [];
  function refreshSpace() {
    scene.updateMatrixWorld(true);
    quads = home.solids.filter(shown).map(footprint).filter((f) => f.y1 >= 0.3 && f.y0 <= 1.2);
  }
  const quadAt = (x, z, skip) => quads.find((q) => !(skip && skip.has(q.m)) && x >= q.box[0] && x <= q.box[2] && z >= q.box[1] && z <= q.box[3] && inPoly(x, z, q.pts));
  const blocked = (x, z, skip) => !inPoly(x, z, OUTLINE) || inWall(x, z) || !!quadAt(x, z, skip);
  function castFloor(x, z, dx, dz, max, skip) {
    for (let t = 0.005; t < max; t += 0.01) if (blocked(x + dx * t, z + dz * t, skip)) return t;
    return max;
  }

  // ---------------------------------------------------------------- electrical
  const elecGroup = new THREE.Group(); elecGroup.visible = false; root.add(elecGroup);
  const typeOn = Object.fromEntries(Object.keys(ETYPES).map((k) => [k, true]));
  const points = [];
  // Nearest wall face for wall-mounted points.
  const edges = [];
  for (const P of WALLS) for (let i = 0; i < P.length; i++) edges.push([P[i], P[(i + 1) % P.length]]);
  function snap(x, z) {
    let best = null;
    for (const [[ax, az], [bx, bz]] of edges) {
      const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L));
      const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, px, pz, ex, ez };
    }
    if (!best || best.d > 0.9) return null;
    // Normal pointing back into the room the label sits in.
    let nx = -best.ez, nz = best.ex; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if ((x - best.px) * nx + (z - best.pz) * nz < 0) { nx = -nx; nz = -nz; }
    if (best.d < 0.002) { // label right on the line: face whichever side is open
      if (inWall(best.px + nx * 0.05, best.pz + nz * 0.05)) { nx = -nx; nz = -nz; }
    }
    return { x: best.px + nx * 0.012, z: best.pz + nz * 0.012, nx, nz };
  }
  const ringGeo = new THREE.RingGeometry(0.07, 0.11, 28); ringGeo.rotateX(PI / 2);
  const dotGeo = new THREE.CircleGeometry(0.04, 20); dotGeo.rotateX(PI / 2);
  const goldRing = new THREE.MeshBasicMaterial({ color: 0xd8a85a, toneMapped: false, side: THREE.DoubleSide });
  const mats = Object.fromEntries(Object.entries(ETYPES).map(([k, t]) => [k, new THREE.MeshBasicMaterial({ color: t.color, toneMapped: false, side: THREE.DoubleSide })]));
  const clashMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false });
  const markers = [];
  for (const p of ELECTRICAL) {
    const g = new THREE.Group();
    const y = p.h / 1000;
    let n = null;
    if (p.mount === 'wall') {
      const s = snap(p.x, p.z);
      if (s) { n = [s.nx, s.nz]; g.position.set(s.x, y, s.z); } else g.position.set(p.x, y, p.z);
      const w = p.type === 'switch' ? 0.16 : 0.09, h = p.type === 'switch' ? 0.11 : 0.09;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.014), mats[p.type]);
      if (n) plate.rotation.y = Math.atan2(n[0], n[1]);
      g.add(plate);
      if (p.custom) { const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.008), goldRing); r.rotation.y = plate.rotation.y; r.position.set(n ? -n[0] * 0.004 : 0, 0, n ? -n[1] * 0.004 : 0); g.add(r); }
      plate.userData.point = p; markers.push(plate);
    } else {
      g.position.set(p.x, CEIL - 0.006, p.z);
      const ring = new THREE.Mesh(ringGeo, mats[p.type]); g.add(ring);
      const dot = new THREE.Mesh(dotGeo, mats[p.type]); g.add(dot);
      ring.userData.point = p; markers.push(ring);
      if (p.type === 'fan') ring.scale.setScalar(2.2);
      if (p.custom) { const r = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.14, 28).rotateX(PI / 2), goldRing); r.position.y = -0.001; g.add(r); }
      if (mode === 'studio') {
        // In the dollhouse the ceiling is gone, so drop a faint line to the floor.
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -(CEIL - 0.01), 0)]);
        const drop = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: ETYPES[p.type].color, dashSize: 0.06, gapSize: 0.08, transparent: true, opacity: 0.45 }));
        drop.computeLineDistances(); g.add(drop);
      }
    }
    g.userData.point = p;
    elecGroup.add(g);
    points.push({ p, g, n, clash: null });
  }
  let elecOn = false;
  function setElec(v) { elecOn = v; elecGroup.visible = v; $c('#tlElecOn').checked = v; labelsDirty = true; }
  $c('#tlElecOn').addEventListener('change', (e) => setElec(e.target.checked));
  function buildLegend() {
    const counts = {};
    for (const { p } of points) counts[p.type] = (counts[p.type] || 0) + 1;
    $c('#tlLegend').innerHTML = Object.entries(ETYPES).map(([k, t]) => `<button class="${typeOn[k] ? 'on' : ''}" data-k="${k}"><i style="background:${t.color}"></i>${t.name}<small>${counts[k] || 0}</small></button>`).join('');
    $c('#tlLegend').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { typeOn[b.dataset.k] = !typeOn[b.dataset.k]; applyTypes(); buildLegend(); }));
  }
  function applyTypes() { for (const pt of points) pt.g.visible = typeOn[pt.p.type]; }
  buildLegend();

  // A wall point is blocked if furniture stands in front of it at its height.
  function checkClashes() {
    const list = [];
    for (const pt of points) {
      const p = pt.p;
      pt.clash = null;
      if (p.mount !== 'wall' || !pt.n || p.h > 2000 || !['switch', 'socket', 'panel'].includes(p.type)) continue;
      if (/^(PP|P\d|RO)/.test(p.id)) continue;   // appliance points are meant to sit behind the fridge, washer, hob or purifier
      const y = p.h / 1000;
      const x = pt.g.position.x + pt.n[0] * 0.1, z = pt.g.position.z + pt.n[1] * 0.1;
      const q = quads.find((q) => x >= q.box[0] && x <= q.box[2] && z >= q.box[1] && z <= q.box[3] && inPoly(x, z, q.pts) && q.y1 > y - 0.04 && q.y0 < y + 0.04);
      if (q) { pt.clash = q.m.userData.fitName || 'furniture'; list.push(pt); }
    }
    for (const pt of points) pt.g.children[0].material = pt.clash ? clashMat : mats[pt.p.type];
    $c('#tlClashN').textContent = list.length;
    $c('#tlClashes').innerHTML = list.length ? list.map((pt, i) => `<li data-i="${i}"><b>${pt.p.id}</b> at ${pt.p.h} mm is behind ${pt.clash === 'furniture' ? 'furniture' : `the ${pt.clash}`} in ${roomName(pt.g.position.x, pt.g.position.z)}<small>${pt.p.desc}</small></li>`).join('') : '<li class="ok">Nothing blocks a switchboard or socket in this layout.</li>';
    $c('#tlClashes').querySelectorAll('li[data-i]').forEach((li) => li.addEventListener('click', () => { const pt = list[+li.dataset.i]; o.onFocus && o.onFocus(pt.g.position.x, pt.g.position.z, pt.n); }));
    clashes = list;
    labelsDirty = true;
  }
  let clashes = [];

  // ---------------------------------------------------------------- tape measure
  const tapes = [];
  let tapeOn = false, tapeA = null, rubber = null;
  const tapeMat = new THREE.LineBasicMaterial({ color: 0xffd27a, depthTest: false, transparent: true, toneMapped: false });
  const endMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, depthTest: false, transparent: true, toneMapped: false });
  const endGeo = new THREE.SphereGeometry(0.025, 12, 8);
  function setTape(v) {
    tapeOn = v; $c('#tlTapeOn').checked = v;
    card.classList.toggle('measuring', v);
    document.body.classList.toggle('tl-measuring', v);
    if (!v) { tapeA = null; if (rubber) { root.remove(rubber.obj); rubber = null; } }
  }
  $c('#tlTapeOn').addEventListener('change', (e) => setTape(e.target.checked));
  function makeTape(a, b) {
    const obj = new THREE.Group();
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), tapeMat); line.renderOrder = 10; obj.add(line);
    for (const p of [a, b]) { const s = new THREE.Mesh(endGeo, endMat); s.position.copy(p); s.renderOrder = 10; obj.add(s); }
    root.add(obj);
    return obj;
  }
  function tapeText(a, b) {
    const d = a.distanceTo(b), dh = Math.abs(b.y - a.y), dxz = Math.hypot(b.x - a.x, b.z - a.z);
    let s = `<b>${ftin(d)}</b> · ${mm(d)}`;
    if (dh > 0.05 && dxz > 0.05) s += `<small>across ${ftin(dxz)} · up ${ftin(dh)}</small>`;
    return s;
  }
  function addTape(a, b) {
    tapes.push({ a, b, obj: makeTape(a, b) });
    if (tapes.length > 12) { const t = tapes.shift(); root.remove(t.obj); }
    listTapes(); labelsDirty = true;
  }
  function listTapes() {
    $c('#tlTapes').innerHTML = tapes.map((t, i) => `<li>${tapeText(t.a, t.b)}<button data-i="${i}" title="Remove">×</button></li>`).join('') || '<li class="ok">No measurements yet.</li>';
    $c('#tlTapes').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const [t] = tapes.splice(+b.dataset.i, 1); root.remove(t.obj); listTapes(); labelsDirty = true; }));
  }
  $c('#tlTapeClear').addEventListener('click', () => { tapes.splice(0).forEach((t) => root.remove(t.obj)); listTapes(); labelsDirty = true; });
  listTapes();
  function undoTape() {
    if (tapeA) { tapeA = null; if (rubber) { root.remove(rubber.obj); rubber = null; } return; }
    const t = tapes.pop(); if (t) { root.remove(t.obj); listTapes(); labelsDirty = true; }
  }
  // Shift: lock to the strongest axis so the tape runs straight.
  function constrain(a, b, shift) {
    if (!shift) return b;
    const d = b.clone().sub(a), ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
    const out = a.clone();
    if (ax >= ay && ax >= az) out.x = b.x; else if (ay >= az) out.y = b.y; else out.z = b.z;
    return out;
  }

  // ---------------------------------------------------------------- fit check
  const PRESETS = [
    ['3-seat sofa', 210, 90, 85], ['L-sofa (long side)', 260, 160, 85], ['Queen bed', 165, 210, 100], ['King bed', 195, 215, 100],
    ['Single bed', 95, 200, 90], ['Wardrobe', 180, 60, 210], ['Dining table, 6', 180, 90, 75], ['Dining table, 4', 120, 80, 75],
    ['TV unit', 180, 40, 50], ['Study desk', 120, 60, 75], ['Armchair', 80, 85, 90], ['Fridge (double door)', 70, 75, 185],
  ];
  $c('#tlPresets').innerHTML = PRESETS.map((p, i) => `<button data-i="${i}">${p[0]}<small>${p[1]}×${p[2]}</small></button>`).join('');
  $c('#tlPresets').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const [n, w, d, h] = PRESETS[+b.dataset.i];
    $c('#tlName').value = n; $c('#tlW').value = w; $c('#tlD').value = d; $c('#tlH').value = h;
  }));
  // Fit pieces live in a group named like a layout group, so the studio's drag and R-to-turn work on them.
  const fitGroup = new THREE.Group(); fitGroup.name = 'fit:0'; scene.add(fitGroup);
  const fitMats = { ok: new THREE.MeshStandardMaterial({ color: 0x3fbfae, transparent: true, opacity: 0.55, roughness: 0.6 }), bad: new THREE.MeshStandardMaterial({ color: 0xff4b3a, transparent: true, opacity: 0.6, roughness: 0.6 }) };
  const fits = [];
  let fitDirty = true;
  function saveFits() { try { localStorage.setItem(FIT_KEY, JSON.stringify(fits.map((f) => ({ name: f.name, w: f.w, d: f.d, h: f.h, x: +f.mesh.position.x.toFixed(3), z: +f.mesh.position.z.toFixed(3), rot: +f.mesh.rotation.y.toFixed(4) })))); } catch { /* storage off: fine */ } }
  function addFit(name, w, d, h, x, z, rot = 0, save = true) {
    const geo = new THREE.BoxGeometry(w / 100, h / 100, d / 100);
    const mesh = new THREE.Mesh(geo, fitMats.ok);
    mesh.position.set(x, h / 200, z); mesh.rotation.y = rot;
    mesh.castShadow = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
    mesh.userData.fitName = name || 'piece';
    fitGroup.add(mesh);
    home.solids.push(mesh);
    const f = { name: name || 'Piece', w, d, h, mesh, gaps: [], last: '' };
    fits.push(f);
    fitDirty = true;
    if (save) saveFits();
    listFits(); changed();
    return f;
  }
  function removeFit(f) {
    fitGroup.remove(f.mesh);
    home.solids.splice(home.solids.indexOf(f.mesh), 1);
    fits.splice(fits.indexOf(f), 1);
    f.gaps.forEach((g) => root.remove(g.obj));
    saveFits(); listFits(); changed(); fitDirty = true;
  }
  function listFits() {
    $c('#tlFits').innerHTML = fits.map((f, i) => `<li data-i="${i}"><b>${esc(f.name)}</b> <small>${f.w}×${f.d}×${f.h} cm · ${roomName(f.mesh.position.x, f.mesh.position.z)}</small><span class="tl-status" id="tlFitS${i}"></span>
      <span class="tl-nudge"><button data-a="l">←</button><button data-a="u">↑</button><button data-a="dn">↓</button><button data-a="r">→</button><button data-a="rot" title="Turn 90°">⟳</button><button data-a="x" title="Remove">×</button></span></li>`).join('') || '<li class="ok">Pick a preset or type a size, then place it.</li>';
    $c('#tlFits').querySelectorAll('li[data-i]').forEach((li) => li.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const f = fits[+li.dataset.i], m = f.mesh, s = 0.1;
      ({ l: () => (m.position.x -= s), r: () => (m.position.x += s), u: () => (m.position.z -= s), dn: () => (m.position.z += s), rot: () => (m.rotation.y += PI / 2), x: () => removeFit(f) })[b.dataset.a]();
      if (b.dataset.a !== 'x') { fitDirty = true; saveFits(); changed(); }
    })));
    fitDirty = true;
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $c('#tlAdd').addEventListener('click', () => {
    const w = clampN($c('#tlW').value, 10, 600), d = clampN($c('#tlD').value, 10, 600), h = clampN($c('#tlH').value, 5, 280);
    const at = o.placeAt ? o.placeAt() : { x: 7, z: 5, rot: 0 };
    addFit($c('#tlName').value.trim() || `${w}×${d} piece`, w, d, h, at.x, at.z, at.rot || 0);
  });
  const clampN = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v || a)));
  try { for (const f of JSON.parse(localStorage.getItem(FIT_KEY)) || []) addFit(f.name, f.w, f.d, f.h, f.x, f.z, f.rot, false); } catch { /* none saved */ }

  // Clearances: from each side of the piece, how far to the nearest wall or furniture.
  const gapMat = { ok: new THREE.LineBasicMaterial({ color: 0x9be7d8, depthTest: false, transparent: true }), warn: new THREE.LineBasicMaterial({ color: 0xffb340, depthTest: false, transparent: true }) };
  function measureFits() {
    refreshSpace();
    for (const f of fits) {
      f.gaps.forEach((g) => root.remove(g.obj)); f.gaps = [];
      const m = f.mesh, skip = new Set([m]);
      const c = Math.cos(m.rotation.y), s = Math.sin(m.rotation.y);
      const hw = f.w / 200, hd = f.d / 200;
      // local axes in world xz: +x → (c, -s), +z → (s, c)
      const ax = [c, -s], az = [s, c];
      const P = (lx, lz) => [m.position.x + ax[0] * lx + az[0] * lz, m.position.z + ax[1] * lx + az[1] * lz];
      // Overlap: sample the footprint.
      let overlap = null;
      for (let i = -2; i <= 2 && !overlap; i++) for (let j = -2; j <= 2 && !overlap; j++) {
        const [x, z] = P(hw * i / 2.2, hd * j / 2.2);
        if (!inPoly(x, z, OUTLINE) || inWall(x, z)) overlap = 'a wall';
        else { const q = quadAt(x, z, skip); if (q && q.y1 > 0.3) overlap = q.m.userData.fitName ? `the ${q.m.userData.fitName}` : 'furniture'; }
      }
      m.material = overlap ? fitMats.bad : fitMats.ok;
      const sides = [['right', ax, hw, hd, az], ['left', [-ax[0], -ax[1]], hw, hd, az], ['back', [-az[0], -az[1]], hd, hw, ax], ['front', az, hd, hw, ax]];
      let tight = 0;
      if (!overlap) for (const [name, dir, half, along, alongAxis] of sides) {
        let best = 9, bx = 0, bz = 0;
        for (const k of [-0.8, 0, 0.8]) {
          const cx = m.position.x + dir[0] * half + alongAxis[0] * along * k;
          const cz = m.position.z + dir[1] * half + alongAxis[1] * along * k;
          const t = castFloor(cx, cz, dir[0], dir[1], 3, skip);
          if (t < best) { best = t; bx = cx; bz = cz; }
        }
        if (best >= 3) continue;
        const warn = best > AGAINST && best < WALKWAY;
        if (warn) tight++;
        if (best <= AGAINST) continue;
        const a = new THREE.Vector3(bx, 0.03, bz), b = new THREE.Vector3(bx + dir[0] * best, 0.03, bz + dir[1] * best);
        const obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), warn ? gapMat.warn : gapMat.ok); obj.renderOrder = 9;
        root.add(obj);
        f.gaps.push({ obj, mid: a.clone().lerp(b, 0.5), d: best, warn });
      }
      f.status = overlap ? `overlaps ${overlap}` : tight ? `${tight} side${tight > 1 ? 's' : ''} under 75 cm` : 'fits, all clear';
      f.cls = overlap ? 'red' : tight ? 'amber' : 'ok';
    }
    fits.forEach((f, i) => { const el = card.querySelector(`#tlFitS${i}`); if (el) { el.textContent = f.status; el.className = 'tl-status ' + f.cls; } });
    checkClashes();
    labelsDirty = true;
  }

  // ---------------------------------------------------------------- picking + input
  function pickables() {
    const a = [];
    scene.traverseVisible((m) => {
      if (!m.isMesh || m.userData.ghost || m.parent === root || m.parent?.parent === elecGroup) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if (m.geometry.boundingSphere.radius > 60) return;   // sky, ground, city
      a.push(m);
    });
    return a;
  }
  function rayAt(x, y) { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray; }
  function surfaceAt(x, y) { const h = rayAt(x, y).intersectObjects(pickables(), false)[0]; return h ? h.point.clone() : null; }

  // Returns true when the click was used by a tool.
  function click(x, y, e) {
    if (!tapeOn) return false;
    if (e && e.button === 2) { undoTape(); return true; }
    let p = surfaceAt(x, y);
    if (!p) return true;
    if (!tapeA) {
      tapeA = p;
      rubber = { obj: makeTape(p, p.clone()) };
    } else {
      p = constrain(tapeA, p, e && e.shiftKey);
      root.remove(rubber.obj); rubber = null;
      if (p.distanceTo(tapeA) > 0.01) addTape(tapeA, p);
      tapeA = null;
    }
    return true;
  }
  // Returns true when hovering something a tool owns (so the page can skip its own hint).
  function hover(x, y, e) {
    if (tapeOn && tapeA) {
      let p = surfaceAt(x, y);
      if (p) {
        p = constrain(tapeA, p, e && e.shiftKey);
        root.remove(rubber.obj); rubber.obj = makeTape(tapeA, p); rubber.b = p;
        showTip(x, y, tapeText(tapeA, p));
      }
      return true;
    }
    if (tapeOn) { showTip(x, y, 'Click the first point'); return true; }
    if (elecOn) {
      const h = rayAt(x, y).intersectObjects(markers.filter((m) => shown(m)), false)[0];
      if (h) {
        const p = h.object.userData.point, pt = points.find((q) => q.p === p);
        showTip(x, y, `<b>${p.id}</b> <span class="tl-type" style="color:${ETYPES[p.type].color}">${ETYPES[p.type].name.replace(/s$/, '')}</span><small>${p.desc}</small><small>${p.mount === 'ceiling' ? 'Ceiling' : `${p.h} mm from floor (${ftin(p.h / 1000)})`}</small>${p.custom ? '<small class="gold">Changed in your customised layout</small>' : ''}${pt && pt.clash ? `<small class="red">Blocked by ${pt.clash === 'furniture' ? 'furniture' : 'the ' + pt.clash}</small>` : ''}`);
        return true;
      }
    }
    tip.classList.remove('on');
    return false;
  }
  function showTip(x, y, html) {
    tip.innerHTML = html; tip.style.transform = `translate(${Math.min(x + 16, innerWidth - 300)}px, ${y + 16}px)`; tip.classList.add('on');
  }
  function hideTip() { tip.classList.remove('on'); }
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Backspace' && tapeOn) { e.preventDefault(); undoTape(); }
  });

  // ---------------------------------------------------------------- labels
  let labelsDirty = true;
  const v3 = new THREE.Vector3();
  function project(p) { v3.copy(p).project(camera); return v3.z < 1 && v3.z > -1 ? [(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight] : null; }
  const pool = [];
  function label(i, html, cls) {
    let el = pool[i];
    if (!el) { el = document.createElement('div'); labels.appendChild(el); pool[i] = el; }
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.className = 'tl-label ' + (cls || '');
    return el;
  }
  const camPos = new THREE.Vector3();
  function drawLabels() {
    let n = 0;
    const put = (pos, html, cls) => { const s = project(pos); if (!s) return; const el = label(n++, html, cls); el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%, -50%)`; el.style.display = ''; };
    camera.getWorldPosition(camPos);
    for (const t of tapes) put(t.a.clone().lerp(t.b, 0.5), tapeText(t.a, t.b), 'tape');
    for (const f of fits) {
      put(f.mesh.position.clone().setY(f.h / 100 + 0.12), `${esc(f.name)}<small>${f.status || ''}</small>`, 'fit ' + (f.cls || ''));
      for (const g of f.gaps) put(g.mid, `${Math.round(g.d * 100)} cm`, 'gap' + (g.warn ? ' warn' : ''));
    }
    if (elecOn) {
      const near = mode === 'walk' ? 5.5 : 0;
      for (const pt of points) {
        if (!pt.g.visible) continue;
        const show = pt.clash || (near && pt.g.position.distanceTo(camPos) < near);
        if (show) put(pt.g.position.clone().add(new THREE.Vector3(0, pt.p.mount === 'ceiling' ? -0.12 : 0.11, 0)), pt.p.id, 'pt' + (pt.clash ? ' red' : ''));
      }
    }
    for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
  }

  // Track moves made by the page (studio drag / R) so clearances follow.
  const lastPos = new Map();
  function update() {
    let moved = false;
    for (const f of fits) {
      const k = `${f.mesh.position.x.toFixed(3)},${f.mesh.position.z.toFixed(3)},${f.mesh.rotation.y.toFixed(3)}`;
      if (lastPos.get(f) !== k) { lastPos.set(f, k); moved = true; }
    }
    if (moved) { saveFits(); fitDirty = true; }
    if (fitDirty) { fitDirty = false; measureFits(); }
    drawLabels();
  }

  refreshSpace(); checkClashes(); listFits();
  card.querySelectorAll('.tl-body').forEach((b) => (b.hidden = true));   // start folded: just the tab row
  return {
    card, open: openTab, update, click, hover, hideTip,
    bodyOf: (key) => card.querySelector(`.tl-body[data-b="${key}"]`),
    get tab() { return tab; },
    get measuring() { return tapeOn; },
    // Call after the page changes furniture (layouts, studio drag) so clearances and clashes refresh.
    furnitureChanged() { fitDirty = true; },
    onChange(f) { listeners.push(f); },
    fits,
  };
}
