import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OUTLINE, ROOMS, LAYOUTS, WALLS, OPENINGS, H, CEIL } from '../js/plan.js';
import { U } from '../js/materials.js';
import { buildHome } from '../js/build.js';
import { makeProcLibrary } from '../walk/proctex.js';
import { applyChoices, choose, loadChoices, LETTERS } from '../js/layouts.js';
import { SWATCHES, BY_ID, SLOTS, PRESETS, swatchTextures, applySwatch } from './swatches.js';
import { createTools } from '../js/tools.js';
import { solar, sunVector, compass, hhmm, today, dateStr, parseDate, niceDate } from '../js/sun.js';
import { loadDesign, saveDesign, clearDesign, objKey, findObj, loadCustoms } from '../js/design.js';
import { createArrange, clusterOf } from '../js/arrange.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const PI = Math.PI;
const CENTER = new THREE.Vector3(7.1, 0, 5.05);

// ------------------------------------------------------------------ renderer
const canvasEl = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 400);

// Fully revealed materials (same shaders as the scroll page).
const white = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat); white.needsUpdate = true;
U.uReveal.value = white; U.uOutside.value = 1; U.uLineFade.value = 0;
const lib = makeProcLibrary(renderer);
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;

// ------------------------------------------------------------------ a world: one copy of the flat with its own look and light
// The studio normally shows one world. Compare mode adds a second, so A and B can differ in materials, layouts, date and time.
function stage(scene) {
  const shape = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.15, bevelEnabled: false });
  g.rotateX(-PI / 2); g.translate(0, -1.4, 0);
  const plinth = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.55, metalness: 0.2 }));
  plinth.receiveShadow = true; scene.add(plinth);
  scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(OUTLINE.map(([x, z]) => new THREE.Vector3(x, -0.26, z))), new THREE.LineBasicMaterial({ color: 0xc9995a })));
  const c = document.createElement('canvas'); c.width = 2048; c.height = 160;
  const cx = c.getContext('2d'); cx.fillStyle = 'rgba(201,153,90,0.85)'; cx.font = '500 92px Geist, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText('E2-902  ·  PALLADIO KHARADI CENTRAL II', 1024, 84);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.375), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  label.position.set(6.4, -0.8, 10.102); scene.add(label);
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const gg = gc.getContext('2d'); gg.fillStyle = '#121214'; gg.fillRect(0, 0, 256, 256); gg.strokeStyle = 'rgba(201,153,90,0.10)'; gg.lineWidth = 2; gg.strokeRect(0, 0, 256, 256);
  const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(60, 60); gt.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.8 }));
  ground.rotation.x = -PI / 2; ground.position.set(CENTER.x, -1.4, CENTER.z); ground.receiveShadow = true; scene.add(ground);
  // Compass rose on the plinth so north is never in doubt.
  const nc = document.createElement('canvas'); nc.width = nc.height = 256;
  const n = nc.getContext('2d'); n.strokeStyle = n.fillStyle = 'rgba(201,153,90,0.9)'; n.lineWidth = 4;
  n.beginPath(); n.arc(128, 128, 100, 0, 7); n.stroke();
  n.beginPath(); n.moveTo(128, 30); n.lineTo(150, 128); n.lineTo(128, 112); n.lineTo(106, 128); n.closePath(); n.fill();
  n.font = '600 44px Geist, sans-serif'; n.textAlign = 'center'; n.fillText('N', 128, 205);
  const nt = new THREE.CanvasTexture(nc); nt.colorSpace = THREE.SRGBColorSpace;
  const rose = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: nt, transparent: true, depthWrite: false }));
  rose.rotation.x = -PI / 2;
  rose.rotation.z = -26.3 * PI / 180;   // matches SITE.north
  rose.position.set(15.6, -0.25, 8.6);
  scene.add(rose);
}

// Ghost occluders: the full-height walls, sills, lintels and the slab above, invisible but casting shadows.
// They make sunlight land only where it really would, even with the walls cut down and no ceiling shown.
function ghosts(scene) {
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const g = new THREE.Group(); g.name = 'ghosts';
  for (const P of WALLS) {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: H, bevelEnabled: false });
    geo.rotateX(-PI / 2);
    g.add(new THREE.Mesh(geo, mat));
  }
  for (const o of OPENINGS) {
    const [x0, z0, x1, z1] = o.rect;
    const box = (y0, y1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.add(m); };
    if (o.id === 'main') { box(0, H); continue; }   // the front door opens onto the enclosed common corridor: no sun through it
    if (o.sill > 0) box(0, o.sill);
    box(o.head, H);
  }
  // The slab above covers the whole outline, the sky deck included (the floor above has a deck too).
  const slab = new THREE.ExtrudeGeometry(new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: 0.2, bevelEnabled: false });
  slab.rotateX(-PI / 2); slab.translate(0, CEIL, 0);
  g.add(new THREE.Mesh(slab, mat));
  // Parapet along the deck railing's base and the ledge.
  for (const m of g.children) { m.castShadow = true; m.userData.ghost = true; }
  scene.add(g);
  return g;
}

const SUN_R = 13;
function createWorld(id) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d0f);
  scene.fog = new THREE.Fog(0x0d0d0f, 45, 120);
  scene.environment = envTex;
  const home = buildHome(scene, lib, { lines: false });
  home.ceilGroup.visible = false;
  stage(scene);
  const ghost = ghosts(scene);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 80 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  sun.target.position.copy(CENTER);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x302820, 0.5);
  scene.add(hemi);
  const lamps = [];
  for (const [x, z, i] of [[2.95, 7.6, 2.2], [2.0, 4.4, 3], [5.5, 3.4, 3.4], [7.3, 6.1, 3.8], [5.6, 8.7, 3.2], [8.5, 8.7, 1.5],
    [8.9, 2.3, 3], [12.2, 2.6, 3.4], [4.5, 1.2, 2.2], [9.9, 4.6, 1.6], [0.95, 1.6, 1.4], [11.9, 5.75, 1.4], [9.85, 6.5, 1.2]]) {
    const l = new THREE.PointLight(0xffc98a, 0, 7, 2); l.position.set(x, 2.1, z); scene.add(l); lamps.push([l, i]);
  }
  const envBase = new Map();
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { if (m.envMapIntensity !== undefined && !envBase.has(m)) envBase.set(m, m.envMapIntensity); }); });
  // Sun handle and the day's sun path.
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false }));
  scene.add(sunBall);
  const path = new THREE.Group(); scene.add(path);
  const helper = new THREE.Box3Helper(new THREE.Box3(), 0xc9995a); helper.visible = false; scene.add(helper);

  const resolveMat = (k) => (k.startsWith('K.') ? home.K : home.M)[k.slice(2)];
  const matSlot = new Map();
  for (const s of SLOTS) for (const k of s.mats) matSlot.set(resolveMat(k), s);

  const w = {
    id, scene, home, ghost, sun, hemi, lamps, envBase, sunBall, path, helper, matSlot, resolveMat,
    state: { slots: {}, date: today(), time: 17.5, wall: 2.1, layouts: {}, shade: true },
    moved: new Map(), exposure: 1, sol: null, hoursKey: '', hours: null,
    setSlot(key, sid) {
      const slot = SLOTS.find((s) => s.key === key), sw = BY_ID[sid];
      if (!slot || !sw || !slot.allow.includes(sw.cat)) return false;
      for (const k of slot.mats) applySwatch(resolveMat(k), sw, slot.tile);
      w.state.slots[key] = sid;
      return true;
    },
    setLayout(room, i) {
      w.state.layouts[room] = i;
      // A's layouts are the ones shared with the walk and scroll pages.
      if (w.id === 'A') choose(home, room, i); else home.setLayout(room, i);
    },
    setWall(h) {
      w.state.wall = h;
      for (const x of home.wallish) {
        const full = x.y1 - x.y0, hh = clamp(h - x.y0, 0, full);
        x.m.visible = hh > 0.002;
        x.m.scale.y = Math.max(hh, 1e-4) / (x.unit ? 1 : full);
      }
    },
    setShade(v) { w.state.shade = v; ghost.visible = v; },
    // Light from the real sun at this world's date and time.
    applyLight() {
      const s = solar(w.state.date, w.state.time);
      w.sol = s;
      const e = Math.sin(s.el * PI / 180);
      const day = smooth(-0.05, 0.35, e), up = smooth(0.05, 0.55, e);
      if (s.el > -1) {
        const dir = sunVector(Math.max(s.el, 0.5), s.az);
        sun.position.copy(CENTER).addScaledVector(dir, 30);
        sun.color.set(0xff8a3c).lerp(new THREE.Color(0xfff4e6), up);
        sun.intensity = (2.1 + 0.7 * (1 - up)) * smooth(-0.02, 0.1, e);
        sunBall.position.copy(CENTER).addScaledVector(sunVector(Math.max(s.el, 1), s.az), SUN_R);
        sunBall.material.color.set(0xff9a4a).lerp(new THREE.Color(0xfff2d0), up);
      } else {
        sun.position.copy(CENTER).addScaledVector(new THREE.Vector3(-0.35, 1, 0.5).normalize(), 30);
        sun.color.set(0x8095c4); sun.intensity = 0.45;
        sunBall.position.copy(CENTER).addScaledVector(sunVector(8, (s.az + 180) % 360), SUN_R);
        sunBall.material.color.set(0xcfd8ff);
      }
      hemi.color.set(0x28304a).lerp(new THREE.Color(0xe6eef5), day);
      hemi.intensity = 0.2 + 0.3 * day;
      for (const [m, b] of envBase) m.envMapIntensity = b * (0.25 + 0.4 * day);
      w.exposure = 0.95 - 0.08 * day;
      const lampK = 1 - smooth(0.0, 0.3, e);
      for (const [l, i] of lamps) l.intensity = i * lampK;
      home.M.glow.emissiveIntensity = 0.3 + 2.2 * lampK;
      w.drawPath();
    },
    // Dotted arc of today's sun with hour beads.
    drawPath() {
      const key = dateStr(w.state.date);
      if (w.pathKey === key) return;
      w.pathKey = key;
      path.clear();
      const s0 = solar(w.state.date, 12), pts = [], beads = [];
      for (let h = s0.sunrise; h <= s0.sunset + 0.001; h += 1 / 12) {
        const s = solar(w.state.date, h);
        pts.push(CENTER.clone().addScaledVector(sunVector(Math.max(s.el, 0), s.az), SUN_R));
      }
      for (let h = Math.ceil(s0.sunrise); h <= Math.floor(s0.sunset); h++) {
        const s = solar(w.state.date, h);
        beads.push([h, CENTER.clone().addScaledVector(sunVector(Math.max(s.el, 0), s.az), SUN_R)]);
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffc56b, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.7, fog: false }));
      line.computeLineDistances(); path.add(line);
      const bg = new THREE.SphereGeometry(0.09, 10, 8), bm = new THREE.MeshBasicMaterial({ color: 0xffc56b, toneMapped: false, fog: false });
      for (const [, p] of beads) { const b = new THREE.Mesh(bg, bm); b.position.copy(p); path.add(b); }
      w.beads = beads;
    },
  };
  return w;
}

// ------------------------------------------------------------------ worlds
const A = createWorld('A');
applyChoices(A.home);
Object.assign(A.state.layouts, Object.fromEntries(Object.keys(LAYOUTS).map((k) => [k, loadChoices()[k] | 0])));
let B = null;
let W = A;                 // the world the panels edit
let comparing = false;

// ------------------------------------------------------------------ post (single view)
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(A.scene, camera);
composer.addPass(renderPass);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.93));
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ camera
const controls = new OrbitControls(camera, canvasEl);   // registered after our own pointerdown (see below)
const fit = innerWidth / innerHeight < 0.8 ? 1.9 : 1;
camera.position.set(CENTER.x + 10 * fit, 21 * fit, CENTER.z + 22 * fit);
controls.target.copy(CENTER);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 9, maxDistance: 80, minPolarAngle: 0.25, maxPolarAngle: 1.22, screenSpacePanning: false });
controls.update();

// ------------------------------------------------------------------ time and date (for the active world)
function setTime(h) {
  W.state.time = h = clamp(h, 5, 23.5);
  W.applyLight();
  syncDayUI();
  updateMood();
  if (comparing) drawBadges();
}
function setDate(dt) {
  if (!dt) return;
  W.state.date = dt;
  W.applyLight();
  buildDays();
  syncDayUI();
  queueHours();
  queueThumbs();
  if (comparing) drawBadges();
}
function syncDayUI() {
  const s = W.sol, st = W.state;
  $('#clock').textContent = hhmm(st.time);
  $('#timeSlider').value = st.time;
  $('#dateIn').value = dateStr(st.date);
  $('#sunInfo').innerHTML = `Sunrise <b>${hhmm(s.sunrise)}</b> · Sunset <b>${hhmm(s.sunset)}</b><br>` +
    (s.el > 0 ? `Sun ${Math.round(s.el)}° up, from the ${compass(s.az)} (${Math.round(s.az)}°)` : 'Sun below the horizon');
  document.querySelectorAll('.day').forEach((d) => d.classList.toggle('on', Math.abs(+d.dataset.t - st.time) < 0.35));
  document.querySelectorAll('#dateChips button').forEach((b) => b.classList.toggle('on', b.dataset.d === `${st.date.m}-${st.date.d}`));
  $('#shadeOn').checked = st.shade;
  document.querySelectorAll('#wallSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.h === st.wall));
}
// Day presets move with the date: an hour after sunrise, solar noon, before sunset, after dark.
function dayTimes() {
  const s = solar(W.state.date, 12);
  return [['Morning', s.sunrise + 1.2], ['Midday', s.noon], ['Evening', s.sunset - 0.6], ['Night', 21.5]];
}
function buildDays() {
  const el = $('#days');
  el.innerHTML = '';
  for (const [n, t] of dayTimes()) {
    const b = document.createElement('button');
    b.className = 'day'; b.dataset.t = t;
    b.innerHTML = `<canvas width="132" height="74"></canvas><span><b>${n}</b><small>${hhmm(t)}</small></span>`;
    b.addEventListener('click', () => animateTime(t));
    el.appendChild(b);
  }
  queueThumbs();
}
$('#timeSlider').addEventListener('input', (e) => setTime(+e.target.value));
$('#timeSlider').addEventListener('change', () => commit());
$('#dateIn').addEventListener('change', (e) => { setDate(parseDate(e.target.value)); commit(); });
{
  const y = today().y;
  const chips = [['21 Mar', 3, 21], ['21 Jun', 6, 21], ['23 Sep', 9, 23], ['21 Dec', 12, 21]];
  $('#dateChips').innerHTML = chips.map(([n, m, d]) => `<button data-d="${m}-${d}" data-m="${m}" data-dd="${d}">${n}</button>`).join('') + '<button data-today="1">Today</button>';
  $('#dateChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    setDate(b.dataset.today ? today() : { y, m: +b.dataset.m, d: +b.dataset.dd }); commit();
  }));
}
$('#shadeOn').addEventListener('change', (e) => { W.setShade(e.target.checked); queueThumbs(); commit(); });
document.querySelectorAll('#wallSeg button').forEach((b) => b.addEventListener('click', () => { W.setWall(+b.dataset.h); syncDayUI(); commit(); }));

// ------------------------------------------------------------------ direct sun hours per room
// From points on each room's floor, look towards the sun every 15 minutes and see whether walls or the slab block it.
const sunRay = new THREE.Raycaster();
let hoursTimer = null;
function queueHours() { clearTimeout(hoursTimer); hoursTimer = setTimeout(computeHours, 250); }
function computeHours() {
  const w = W, key = dateStr(w.state.date);
  if (w.hoursKey === key && w.hours) { drawHours(w.hours); return; }
  w.ghost.updateMatrixWorld(true);
  const occ = w.ghost.children;
  const s0 = solar(w.state.date, 12);
  const times = [];
  for (let h = s0.sunrise; h <= s0.sunset; h += 0.25) { const s = solar(w.state.date, h); if (s.el > 2) times.push([h, sunVector(s.el, s.az)]); }
  const out = [];
  for (const r of ROOMS) {
    let total = 0, n = 0, first = null, lastH = null;
    for (const [x0, z0, x1, z1] of r.rects.slice(0, 2)) {
      const nx = Math.max(2, Math.round((x1 - x0) / 0.8)), nz = Math.max(2, Math.round((z1 - z0) / 0.8));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const p = new THREE.Vector3(x0 + (i + 0.5) * (x1 - x0) / nx, 0.05, z0 + (j + 0.5) * (z1 - z0) / nz);
        let lit = 0;
        for (const [h, d] of times) {
          sunRay.set(p, d); sunRay.far = 40;
          if (!sunRay.intersectObjects(occ, false).length) { lit++; if (first === null || h < first) first = h; if (lastH === null || h > lastH) lastH = h; }
        }
        total += lit * 0.25; n++;
      }
    }
    out.push({ name: r.name, hours: total / n, from: first, to: lastH });
  }
  w.hours = out; w.hoursKey = key;
  drawHours(out);
}
function drawHours(list) {
  const max = Math.max(1, ...list.map((r) => r.hours));
  $('#sunHours').innerHTML = `<p class="lbl">Direct sun on ${niceDate(W.state.date)}</p>` + list.slice().sort((a, b) => b.hours - a.hours).map((r) =>
    `<div class="sh"><span>${r.name}</span><i><b style="width:${(r.hours / max) * 100}%"></b></i><em>${r.hours < 0.05 ? '–' : r.hours.toFixed(1) + ' h'}</em>${r.from !== null && r.hours >= 0.05 ? `<small>${hhmm(r.from)}–${hhmm(r.to + 0.25)}</small>` : ''}</div>`).join('') +
    '<p class="note">Average over each room\'s floor, from the walls, windows and the slab above. Neighbouring towers aren\'t modelled.</p>';
}

// ------------------------------------------------------------------ mood meter
function lum([r, g, b]) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const MOOD_W = { walls: 0.3, floor: 0.2, feature: 0.1, upholstery: 0.15, woodwork: 0.1, bedding: 0.05, accents: 0.1 };
function moodOf(w) {
  let L = 0, Wm = 0, tot = 0;
  for (const [k, wt] of Object.entries(MOOD_W)) {
    const sw = BY_ID[w.state.slots[k]]; if (!sw) continue;
    const a = swatchTextures(sw).avg;
    L += lum(a) * wt; Wm += (a[0] - a[2]) * wt; tot += wt;
  }
  L /= tot || 1; Wm /= tot || 1;
  const e = Math.sin((w.sol ? w.sol.el : 0) * PI / 180);
  const day = smooth(-0.05, 0.4, e);
  const golden = e > -0.05 ? (1 - smooth(0.08, 0.45, e)) * smooth(-0.05, 0.05, e) : 0;
  const night = 1 - smooth(-0.08, 0.02, e);
  const bright = L * 0.7 + day * (1 - golden) * 0.7;
  const cozy = clamp(Wm * 2.2 + 0.15, 0, 1) * 0.55 + golden * 0.7 + night * 0.12;
  const moody = (1 - L) * 0.75 + night * 0.6;
  const s = bright + cozy + moody;
  const r = { cozy: Math.round(cozy / s * 100), bright: Math.round(bright / s * 100) };
  r.moody = 100 - r.cozy - r.bright;
  const top = Object.entries(r).sort((a, b) => b[1] - a[1])[0][0];
  return { r, top, golden, night };
}
function updateMood() {
  const { r, top, golden, night } = moodOf(W);
  for (const k of ['cozy', 'bright', 'moody']) { $(`#m-${k} b`).textContent = r[k] + '%'; $(`#m-${k} i`).style.width = r[k] + '%'; }
  const walls = BY_ID[W.state.slots.walls], floor = BY_ID[W.state.slots.floor];
  const light = night > 0.5 ? 'lamps after dark' : golden > 0.4 ? 'a low gold sun' : W.state.time < 11 ? 'soft morning light' : 'a high midday sun';
  const adj = { cozy: 'warm and soft', bright: 'airy and clean', moody: 'deep and quiet' }[top];
  $('#reading').innerHTML = `<b>${walls ? walls.name : ''} walls, ${floor ? floor.name.toLowerCase() : ''} floor</b> and ${light}: ${adj}. It reads <em>${top}</em>.`;
  document.querySelectorAll('.preset').forEach((p) => p.classList.toggle('on', p.dataset.k === top));
}

// ------------------------------------------------------------------ undo / redo + share
const undo = [], redo = [];
function snapshot() {
  return {
    w: W, slots: { ...W.state.slots }, time: W.state.time, date: { ...W.state.date }, wall: W.state.wall, shade: W.state.shade,
    layouts: { ...W.state.layouts }, moves: [...W.moved.keys()].map((o) => [o, o.position.x, o.position.z, o.rotation.y]),
    hidden: [...(W.home._hidden || [])], custom: { ...(W.home._custom || {}) },
  };
}
function restore(s) {
  const w = s.w;
  if (w === B && !comparing) return;
  setActive(w);
  for (const [k, id] of Object.entries(s.slots)) w.setSlot(k, id);
  for (const [k, i] of Object.entries(s.layouts)) w.setLayout(k, i);
  for (const [o, orig] of w.moved) { o.position.x = orig.x; o.position.z = orig.z; o.rotation.y = orig.ry; }
  for (const [o, x, z, ry] of s.moves) { o.position.x = x; o.position.z = z; o.rotation.y = ry; }
  for (const o of (w.home._hidden || [])) o.visible = true;
  w.home._hidden = new Set(s.hidden || []); for (const o of w.home._hidden) o.visible = false;
  w.home._custom = { ...(s.custom || {}) };
  if (w === A) arrange.select(null);
  w.setWall(s.wall); w.setShade(s.shade); w.state.date = s.date;
  setTime(s.time); buildDays(); queueHours();
  refreshUI();
}
let last = null;
// A's materials and dragged furniture are the shared design the walk and scroll pages show.
function saveShared() {
  const moves = {};
  for (const o of A.moved.keys()) { const k = objKey(o); if (k) moves[k] = [+o.position.x.toFixed(3), +o.position.z.toFixed(3), +o.rotation.y.toFixed(4)]; }
  saveDesign({ slots: { ...A.state.slots }, moves, hidden: [...(A.home._hidden || [])].map(objKey).filter(Boolean), custom: { ...(A.home._custom || {}) }, at: Date.now() });
}
function commit() {
  tools.furnitureChanged();
  saveShared();
  if (last) undo.push(last);
  if (undo.length > 60) undo.shift();
  redo.length = 0;
  last = snapshot();
  writeHash();
  queueThumbs();
  syncUndoButtons();
  if (comparing) drawBadges();
}
function syncUndoButtons() { $('#bUndo').disabled = !undo.length; $('#bRedo').disabled = !redo.length; }
$('#bUndo').addEventListener('click', () => { if (!undo.length) return; redo.push(last); last = undo.pop(); restore(last); writeHash(); syncUndoButtons(); queueThumbs(); });
$('#bRedo').addEventListener('click', () => { if (!redo.length) return; undo.push(last); last = redo.pop(); restore(last); writeHash(); syncUndoButtons(); queueThumbs(); });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#bRedo') : $('#bUndo')).click(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); $('#bRedo').click(); }
});

// Share link: A's materials, date, time, walls and layouts (not hand-moved furniture).
function writeHash() {
  const st = A.state;
  const s = Object.entries(st.slots).map(([k, v]) => `${k}.${v}`).join(',');
  const l = Object.keys(LAYOUTS).map((k) => (st.layouts[k] | 0)).join('');
  history.replaceState(null, '', `#s=${s}&d=${dateStr(st.date)}&t=${st.time.toFixed(2)}&w=${st.wall}&l=${l}`);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.has('s')) return false;
  for (const pair of p.get('s').split(',')) { const [k, v] = pair.split('.'); A.setSlot(k, v); }
  const l = p.get('l') || '';
  Object.keys(LAYOUTS).forEach((k, i) => { const v = +l[i]; if (v >= 0 && v <= 2) A.setLayout(k, v); });
  if (p.has('w')) A.setWall(+p.get('w'));
  if (p.has('d')) A.state.date = parseDate(p.get('d')) || A.state.date;
  if (p.has('t')) A.state.time = +p.get('t');
  return true;
}

// ------------------------------------------------------------------ UI: presets, moodboard, palette
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2400); };
let selected = 'upholstery';
let tab = 'fabric';

function buildPresets() {
  const el = $('#presets');
  el.innerHTML = '';
  for (const [k, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'preset'; b.dataset.k = k;
    const strip = ['walls', 'floor', 'upholstery', 'accents'].map((s) => `<i style="background-image:url(${swatchTextures(BY_ID[p.slots[s]]).thumb})"></i>`).join('');
    b.innerHTML = `<span class="strip">${strip}</span><b>${p.name}</b><small>${p.sub}</small>`;
    b.addEventListener('click', () => applyPreset(k));
    el.appendChild(b);
  }
}
function applyPreset(k) {
  const p = PRESETS[k];
  for (const [s, id] of Object.entries(p.slots)) W.setSlot(s, id);
  // Times follow the real sun on the chosen date.
  const s = solar(W.state.date, 12);
  animateTime({ cozy: s.sunset - 0.6, bright: s.noon, moody: 21.8 }[k] ?? p.time);
  refreshUI();
}
let timeAnim = null;
function animateTime(to) {
  cancelAnimationFrame(timeAnim);
  const from = W.state.time, t0 = performance.now();
  const step = (now) => {
    const k = smooth(0, 1, (now - t0) / 1400);
    setTime(from + (to - from) * k);
    if (k < 1) timeAnim = requestAnimationFrame(step); else commit();
  };
  timeAnim = requestAnimationFrame(step);
}

function buildMoodboard() {
  const el = $('#board');
  el.innerHTML = '';
  for (const s of SLOTS) {
    const sw = BY_ID[W.state.slots[s.key]];
    const b = document.createElement('button');
    b.className = 'cell' + (s.key === selected ? ' on' : '');
    b.innerHTML = `<i style="background-image:url(${swatchTextures(sw).thumb})"></i><small>${s.name}</small><b>${sw.name}</b>`;
    b.addEventListener('click', () => selectSlot(s.key));
    b.addEventListener('dragover', (e) => e.preventDefault());
    b.addEventListener('drop', (e) => { e.preventDefault(); dropOn(s, e.dataTransfer.getData('text/plain')); });
    el.appendChild(b);
  }
}
function selectSlot(key) {
  selected = key;
  const s = SLOTS.find((x) => x.key === key);
  if (!s.allow.includes(tab)) tab = s.allow[0];
  refreshUI();
}
function buildPalette() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const el = $('#swatches');
  el.innerHTML = '';
  if (tab === 'furniture') { buildFurniture(el); return; }
  const s = SLOTS.find((x) => x.key === selected);
  for (const sw of SWATCHES.filter((x) => x.cat === tab)) {
    const b = document.createElement('button');
    const ok = s.allow.includes(sw.cat);
    b.className = 'sw' + (W.state.slots[selected] === sw.id ? ' on' : '') + (ok ? '' : ' dim');
    b.draggable = true;
    b.title = ok ? `${sw.name} → ${s.name}` : `${sw.name} doesn't go on ${s.name.toLowerCase()}; drag it onto another surface`;
    b.innerHTML = `<i style="background-image:url(${swatchTextures(sw).thumb})"></i><small>${W.state.slots[selected] === sw.id ? '• ' : ''}${sw.name}</small>`;
    b.addEventListener('click', () => dropOn(s, sw.id));
    b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', sw.id); e.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('dragging'); });
    b.addEventListener('dragend', () => document.body.classList.remove('dragging'));
    el.appendChild(b);
  }
}
function buildFurniture(el) {
  for (const r of ROOMS) {
    const row = document.createElement('div');
    row.className = 'frow';
    const cur = W.state.layouts[r.key] | 0, custom = W === A ? (A.home._custom || {})[r.key] : null;
    row.innerHTML = `<span>${r.name}</span>` + LAYOUTS[r.key].map((n, i) => `<button class="${!custom && i === cur ? 'on' : ''}" data-i="${i}" title="${n}"><i>${LETTERS[i]}</i>${n}</button>`).join('') +
      (W === A ? loadCustoms().filter((c) => c.room === r.key).map((c) => `<button class="${c.id === custom ? 'on' : ''}" data-c="${c.id}"><i>★</i>${c.name}</button>`).join('') : '');
    row.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => { if (W === A) arrange.chooseBase(r.key, +b.dataset.i); else { W.setLayout(r.key, +b.dataset.i); commit(); } buildPalette(); }));
    row.querySelectorAll('button[data-c]').forEach((b) => b.addEventListener('click', () => { arrange.applyCustom(b.dataset.c); buildPalette(); }));
    el.appendChild(row);
  }
  const reset = document.createElement('button');
  reset.className = 'reset'; reset.textContent = 'Put moved furniture back';
  reset.addEventListener('click', () => {
    for (const [o, orig] of W.moved) { o.position.x = orig.x; o.position.z = orig.z; o.rotation.y = orig.ry; } W.moved.clear();
    for (const o of (W.home._hidden || [])) o.visible = true; W.home._hidden = new Set(); W.home._custom = {};
    if (W === A) arrange.select(null);
    commit(); buildPalette();
  });
  el.appendChild(reset);
}
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; buildPalette(); }));

function dropOn(slot, id, w = W) {
  const sw = BY_ID[id];
  if (!slot || !sw) return;
  if (!slot.allow.includes(sw.cat)) { toast(`${sw.name} doesn't go on ${slot.name.toLowerCase()}`); return; }
  setActive(w);
  w.setSlot(slot.key, id);
  selected = slot.key;
  refreshUI();
  commit();
}
function refreshUI() { buildMoodboard(); buildPalette(); updateMood(); buildTags(); syncDayUI(); }

// ------------------------------------------------------------------ floating tags (single view only)
const TAGGED = ['upholstery', 'feature', 'walls', 'floor', 'bedding'];
const tagsEl = $('#tags'), svg = $('#leaders');
function buildTags() {
  tagsEl.innerHTML = '';
  for (const k of TAGGED) {
    const s = SLOTS.find((x) => x.key === k), sw = BY_ID[W.state.slots[k]];
    const d = document.createElement('button');
    d.className = 'tag' + (k === selected ? ' on' : ''); d.dataset.k = k;
    d.innerHTML = `<i style="background-image:url(${swatchTextures(sw).thumb})"></i><b>${sw.name}</b><small>${s.name}</small>`;
    d.addEventListener('click', () => selectSlot(k));
    d.addEventListener('dragover', (e) => e.preventDefault());
    d.addEventListener('drop', (e) => { e.preventDefault(); dropOn(s, e.dataTransfer.getData('text/plain')); });
    tagsEl.appendChild(d);
  }
}
const v3 = new THREE.Vector3();
const hourLabels = $('#hourLabels');
function placeOverlays() {
  // Hour labels along the sun path.
  let html = '';
  if (!comparing && !document.body.classList.contains('clean') && W.beads) for (const [h, p] of W.beads) {
    v3.copy(p).project(camera);
    if (v3.z > 1) continue;
    html += `<span style="transform:translate(${(v3.x * 0.5 + 0.5) * innerWidth}px,${(-v3.y * 0.5 + 0.5) * innerHeight - 14}px) translate(-50%,-100%)">${h}</span>`;
  }
  if (hourLabels._h !== html) { hourLabels.innerHTML = html; hourLabels._h = html; }
  if (comparing) return;
  const tags = [...tagsEl.children];
  const Wd = innerWidth, n = tags.length;
  const left = Wd < 900 ? 16 : 360, right = Wd < 900 ? Wd - 16 : Wd - 300;
  let lines = '';
  tags.forEach((t, i) => {
    const s = SLOTS.find((x) => x.key === t.dataset.k);
    v3.set(...s.anchor).project(camera);
    const ax = (v3.x * 0.5 + 0.5) * Wd, ay = (-v3.y * 0.5 + 0.5) * innerHeight;
    const tx = left + (right - left) * (i + 0.5) / n, ty = Wd < 900 ? 64 : 22;
    t.style.transform = `translate(${tx}px, ${ty}px) translateX(-50%)`;
    lines += `<line x1="${tx}" y1="${ty + t.offsetHeight}" x2="${ax}" y2="${ay}"/><circle cx="${ax}" cy="${ay}" r="3.5"/>`;
  });
  svg.innerHTML = lines;
}

// ------------------------------------------------------------------ daylight thumbnails
let thumbTimer = null;
function queueThumbs() { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderThumbs, 900); }
function renderThumbs() {
  const keep = W.state.time;
  W.sunBall.visible = false; W.path.visible = false;
  const w = renderer.domElement.width, h = renderer.domElement.height;
  if (!w || !h) { W.sunBall.visible = true; W.path.visible = true; return; }   // page hidden or not laid out yet
  const aspect = camera.aspect;
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  const times = dayTimes();
  document.querySelectorAll('.day canvas').forEach((c, i) => {
    W.state.time = times[i][1]; W.applyLight();
    renderer.toneMappingExposure = W.exposure;
    renderer.render(W.scene, camera);
    const g = c.getContext('2d'), cw = w * 0.62, ch = cw * 74 / 132;
    g.drawImage(renderer.domElement, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, 132, 74);
  });
  W.state.time = keep; W.applyLight();
  W.sunBall.visible = true; W.path.visible = true;
  camera.aspect = aspect; camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ compare: two worlds side by side
function copyState(from, to) {
  for (const [k, id] of Object.entries(from.state.slots)) to.setSlot(k, id);
  for (const k of Object.keys(LAYOUTS)) to.setLayout(k, from.state.layouts[k] | 0);
  to.state.date = { ...from.state.date }; to.state.time = from.state.time;
  to.setWall(from.state.wall); to.setShade(from.state.shade);
  to.applyLight();
}
function setActive(w) {
  if (!w || w === W) return;
  W.helper.visible = false;
  W = w;
  buildDays(); refreshUI(); queueHours();
  document.querySelectorAll('.cmp-badge').forEach((b) => b.classList.toggle('on', b.dataset.w === W.id));
}
function enterCompare() {
  if (!B) {
    toast('Building the second copy…');
    B = createWorld('B');
    for (const k of Object.keys(LAYOUTS)) B.home.setLayout(k, 0);
  }
  copyState(A, B);
  comparing = true;
  // Each half is narrow, so step the camera back to keep the whole flat in view.
  const d = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).add(d.multiplyScalar(1.55));
  document.body.classList.add('comparing');
  tools.open(null);
  resize();
  setActive(B);
  drawBadges();
  toast('B is a copy of A. Change B, then compare. Click a side to edit it.');
}
function exitCompare() {
  comparing = false;
  const d = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).add(d.multiplyScalar(1 / 1.55));
  document.body.classList.remove('comparing');
  setActive(A);
  resize();
}
$('#bCompare').addEventListener('click', () => (comparing ? exitCompare() : enterCompare()));
function badgeText(w) {
  const st = w.state, m = moodOf(w);
  const walls = BY_ID[st.slots.walls], floor = BY_ID[st.slots.floor], up = BY_ID[st.slots.upholstery];
  const lay = Object.keys(LAYOUTS).map((k) => LETTERS[st.layouts[k] | 0]).join('');
  return `<b>${w.id}</b><span>${niceDate(st.date)} · ${hhmm(st.time)} · ${m.top} ${m.r[m.top]}%</span><small>${walls.name} walls · ${floor.name} floor · ${up.name} sofa · layouts ${lay}</small>`;
}
function drawBadges() {
  for (const w of [A, B]) { const el = document.querySelector(`.cmp-badge[data-w="${w.id}"] .cmp-text`); if (el) el.innerHTML = badgeText(w); }
  document.querySelectorAll('.cmp-badge').forEach((b) => b.classList.toggle('on', b.dataset.w === W.id));
}
document.querySelectorAll('.cmp-badge').forEach((b) => b.addEventListener('click', (e) => { if (e.target.closest('button')) return; setActive(b.dataset.w === 'A' ? A : B); }));
$('#cmpAtoB').addEventListener('click', () => { copyState(A, B); setActive(B); refreshUI(); drawBadges(); commit(); });
$('#cmpBtoA').addEventListener('click', () => { copyState(B, A); setActive(A); refreshUI(); drawBadges(); writeHash(); commit(); });
$('#cmpExit').addEventListener('click', exitCompare);
$('#cmpSeason').addEventListener('click', () => {
  // A quick study: same look, June vs December at the same clock time.
  const y = today().y;
  copyState(A, B);
  A.state.date = { y, m: 6, d: 21 }; B.state.date = { y, m: 12, d: 21 };
  A.applyLight(); B.applyLight();
  setActive(A); buildDays(); syncDayUI(); queueHours(); drawBadges(); commit();
});

// Which world (and which part of the screen) a pointer is over.
function sideAt(x) { return comparing && x > innerWidth / 2 ? B : A; }
function toNdc(x, y) {
  if (!comparing) return ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  const half = innerWidth / 2, lx = x > half ? x - half : x;
  return ndc.set(lx / half * 2 - 1, -(y / innerHeight) * 2 + 1);
}

// ------------------------------------------------------------------ picking, dragging furniture, dragging the sun
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pickables(w) { const a = []; w.scene.traverseVisible((o) => { if (o.isMesh && o !== w.sunBall && !o.userData.ghost && o.parent !== w.path) a.push(o); }); return a; }
function pick(x, y, w = sideAt(x)) {
  toNdc(x, y); ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(pickables(w), false)) {
    const m = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material;
    return { w, hit: h, mat: m, slot: w.matSlot.get(m) || null, furn: furnitureRoot(h.object) };
  }
  return null;
}
const isLayoutGroup = (o) => o && o.isGroup && /^[a-z]+:\d$/.test(o.name);
function furnitureRoot(o) {
  while (o && o.parent && !isLayoutGroup(o.parent)) o = o.parent;
  return o && isLayoutGroup(o.parent) ? o : null;
}
function showBox(w, objs) {
  if (!objs) { w.helper.visible = false; return; }
  const b = new THREE.Box3(); objs.forEach((o) => b.expandByObject(o)); w.helper.box.copy(b); w.helper.visible = true;
}

let drag = null, lastCluster = null;
const tip = $('#tip');
canvasEl.addEventListener('pointerdown', (e) => {
  if (!comparing && tools.measuring) { tools.click(e.clientX, e.clientY, e); e.stopImmediatePropagation(); return; }
  if (e.button !== 0) return;
  const w = sideAt(e.clientX);
  setActive(w);
  toNdc(e.clientX, e.clientY); ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(w.sunBall).length) {
    controls.enabled = false;
    drag = { kind: 'sun', x: e.clientX, t: w.state.time };
    return;
  }
  const p = pick(e.clientX, e.clientY, w);
  if (p && p.furn) {
    controls.enabled = false;
    floorPlane.constant = -p.hit.point.y;   // drag at the height you grabbed, so the piece stays under the cursor
    const start = new THREE.Vector3(); ray.ray.intersectPlane(floorPlane, start);
    const cl = clusterOf(p.furn);
    drag = { kind: 'furn', w, p, cluster: cl, start, orig: cl.map((o) => [o.position.x, o.position.z]), x: e.clientX, y: e.clientY, moved: false };
  } else {
    drag = { kind: 'orbit', p, x: e.clientX, y: e.clientY };
  }
}, { capture: true }); // capture: runs before OrbitControls, so a furniture grab doesn't also orbit
addEventListener('pointermove', (e) => {
  if (drag && drag.kind === 'sun') { setTime(drag.t + (e.clientX - drag.x) / innerWidth * 14); return; }
  if (drag && drag.kind === 'furn') {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
    if (!drag.moved) return;
    toNdc(e.clientX, e.clientY); ray.setFromCamera(ndc, camera);
    const at = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floorPlane, at)) return;
    const dx = at.x - drag.start.x, dz = at.z - drag.start.z;
    drag.cluster.forEach((o, i) => {
      if (!drag.w.moved.has(o)) drag.w.moved.set(o, { x: o.position.x, z: o.position.z, ry: o.rotation.y });
      o.position.x = clamp(drag.orig[i][0] + dx, -0.3, 14.5); o.position.z = clamp(drag.orig[i][1] + dz, -0.3, 10.4);
    });
    showBox(drag.w, drag.cluster);
    tip.classList.remove('on');
    return;
  }
  if (drag) return;
  if (!comparing && e.target === canvasEl && tools.hover(e.clientX, e.clientY, e)) { tip.classList.remove('on'); return; }
  tools.hideTip();
  if (e.target !== canvasEl) return;
  const p = pick(e.clientX, e.clientY);
  const w = sideAt(e.clientX);
  if (!p || (!p.slot && !p.furn)) { tip.classList.remove('on'); showBox(w, null); canvasEl.style.cursor = ''; return; }
  const sw = p.slot && BY_ID[w.state.slots[p.slot.key]];
  tip.innerHTML = (comparing ? `<em>${w.id}</em> ` : '') + (sw ? `<b>${sw.name}</b> · ${p.slot.name}` : '<b>Furniture</b>') + `<small>${p.furn ? 'drag to move · R to rotate' : ''}${p.furn && p.slot ? ' · ' : ''}${p.slot ? 'click to restyle, or drop a swatch' : ''}</small>`;
  tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`;
  tip.classList.add('on');
  canvasEl.style.cursor = p.furn ? 'grab' : 'pointer';
  if (p.furn) { lastCluster = clusterOf(p.furn); showBox(w, lastCluster); } else showBox(w, null);
});
addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  controls.enabled = true;
  if (d.kind === 'sun') { commit(); return; }
  if (d.kind === 'furn' && d.moved) { lastCluster = d.cluster; showBox(d.w, null); if (d.w === A && !comparing) arrange.select(d.p.furn); commit(); return; }
  const click = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5;
  if (click && d.p && d.p.slot) selectSlot(d.p.slot.key);
  if (click && d.p && d.p.furn && d.w === A && !comparing && furnRootOk(d.p.furn)) { arrange.select(d.p.furn); if (!tools.tab || tools.tab === 'arr') tools.open('arr'); }
  if (d.kind === 'furn') lastCluster = d.cluster;
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey) return;
  if (arrange.selection && !comparing) {
    const s = e.shiftKey ? 0.01 : 0.05;
    const k = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
    if (k) { e.preventDefault(); arrange.moveBy(...k); return; }
    if (e.key.toLowerCase() === 'r') { arrange.rotate(PI / 2); return; }
    if (e.key === 'Escape') { arrange.select(null); return; }
  }
  if (e.key.toLowerCase() !== 'r' || !lastCluster) return;
  const b = new THREE.Box3(); lastCluster.forEach((o) => b.expandByObject(o));
  const c = b.getCenter(new THREE.Vector3());
  for (const o of lastCluster) {
    if (!W.moved.has(o)) W.moved.set(o, { x: o.position.x, z: o.position.z, ry: o.rotation.y });
    const x = o.position.x - c.x, z = o.position.z - c.z;
    o.position.x = c.x + z; o.position.z = c.z - x;
    o.rotation.y += PI / 2;
  }
  showBox(W, lastCluster);
  commit();
});
canvasEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  const p = pick(e.clientX, e.clientY);
  if (p && p.slot) { tip.innerHTML = `Drop on <b>${p.slot.name}</b>${comparing ? ` in ${p.w.id}` : ''}`; tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`; tip.classList.add('on'); }
});
canvasEl.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  tip.classList.remove('on');
  const p = pick(e.clientX, e.clientY);
  const id = e.dataTransfer.getData('text/plain');
  if (!p || !p.slot) { toast('Drop it on a floor, wall, sofa, bed or rug'); return; }
  dropOn(p.slot, id, p.w);
});
canvasEl.addEventListener('pointerleave', () => tip.classList.remove('on'));

// ------------------------------------------------------------------ toolbar
$('#bShot').addEventListener('click', () => {
  render();
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png'); a.download = comparing ? 'e2902-compare.png' : 'e2902-mood.png'; a.click();
});
$('#bLink').addEventListener('click', async () => {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); toast('Link copied: it opens with these materials, light and layouts'); }
  catch { toast('Copy the address bar to share this look'); }
});
$('#bEye').addEventListener('click', () => document.body.classList.toggle('clean'));
$('#bOriginal').addEventListener('click', () => {
  if (!confirm('Go back to the original materials and furniture positions on all three pages? Layouts and fit-check pieces stay.')) return;
  clearDesign();
  location.href = location.pathname;
});
$('#bHelp').addEventListener('click', () => $('#help').classList.toggle('on'));
$('#help').addEventListener('click', () => $('#help').classList.remove('on'));
$('#bRec').addEventListener('click', () => {
  if (!window.MediaRecorder || !canvasEl.captureStream) { toast('Recording needs Chrome, Edge or Firefox'); return; }
  const stream = canvasEl.captureStream(30);
  const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = 'e2902-orbit.webm'; a.click(); document.body.classList.remove('recording'); };
  document.body.classList.add('recording', 'clean');
  controls.autoRotate = true; controls.autoRotateSpeed = 7.5;
  rec.start();
  setTimeout(() => { rec.stop(); controls.autoRotate = false; document.body.classList.remove('clean'); }, 8000);
});

// ------------------------------------------------------------------ tools: electrical, tape, fit check (on A)
const tools = createTools({
  scene: A.scene, camera, canvas: canvasEl, home: A.home, mode: 'studio', cardClass: 'studio ui',
  extraTabs: [{ key: 'arr', label: 'Arrange' }],
  placeAt: () => {
    ndc.set(0, 0); ray.setFromCamera(ndc, camera);
    const at = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), at);
    return { x: clamp(at.x, 0.5, 13.5), z: clamp(at.z, 0.5, 9.5), rot: 0 };
  },
  onFocus: (x, z) => { const d = camera.position.clone().sub(controls.target); controls.target.set(x, 0, z); camera.position.copy(controls.target).add(d.setLength(Math.min(d.length(), 12))); },
});
// Arrange: precise placement and custom layouts (on A).
const furnRootOk = (o) => o && o.parent && !o.parent.name.startsWith('fit:');
const arrange = createArrange({
  scene: A.scene, home: A.home, body: tools.bodyOf('arr'),
  hooks: {
    moved: () => ({ get: (o) => { const p = A.moved.get(o); return p && [p.x, p.z, p.ry]; }, has: (o) => A.moved.has(o), delete: (o) => A.moved.delete(o) }),
    markMoved: (o) => { if (!A.moved.has(o)) A.moved.set(o, { x: o.position.x, z: o.position.z, ry: o.rotation.y }); },
    setLayout: (room, i) => A.setLayout(room, i),
    layoutOf: (room) => A.state.layouts[room] | 0,
    commit: () => { commit(); if (tab === 'furniture') buildPalette(); },
    roomHint: () => null,
    pickHint: 'Click a piece in the model to pick it, or drag it. Arrows nudge 5 cm (Shift: 1 cm), R turns it.',
  },
});
canvasEl.addEventListener('contextmenu', (e) => { if (tools.measuring) e.preventDefault(); });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || comparing) return;
  if (e.key === 'e' || e.key === 'E') tools.open('elec');
  if (e.key === 'q' || e.key === 'Q') tools.open('tape');
});

// ------------------------------------------------------------------ render
function resize() {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = (comparing ? innerWidth / 2 : innerWidth) / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
function render() {
  if (!comparing) {
    renderer.setScissorTest(false);
    renderPass.scene = A.scene;
    renderer.toneMappingExposure = A.exposure;
    composer.render();
    return;
  }
  // Side by side: same camera, each half its own world. (No bloom in compare.)
  const half = innerWidth / 2;
  renderer.setScissorTest(true);
  for (const [w, x] of [[A, 0], [B, half]]) {
    renderer.setViewport(x, 0, half, innerHeight);
    renderer.setScissor(x, 0, half, innerHeight);
    renderer.toneMappingExposure = w.exposure;
    renderer.render(w.scene, camera);
  }
}

// ------------------------------------------------------------------ start
for (const s of SLOTS) A.setSlot(s.key, s.initial);
A.setWall(2.1);
// The saved shared design (from an earlier visit), unless a share link says otherwise.
{
  const d = loadDesign();
  if (d && !new URLSearchParams(location.hash.slice(1)).has('s')) {
    for (const [k, id] of Object.entries(d.slots || {})) A.setSlot(k, id);
    for (const [key, [x, z, r]] of Object.entries(d.moves || {})) {
      const o = findObj(A.home, key);
      if (!o) continue;
      A.moved.set(o, { x: o.position.x, z: o.position.z, ry: o.rotation.y });
      o.position.x = x; o.position.z = z; o.rotation.y = r;
    }
    A.home._hidden = new Set();
    for (const key of d.hidden || []) { const o = findObj(A.home, key); if (o) { o.visible = false; A.home._hidden.add(o); } }
    A.home._custom = { ...(d.custom || {}) };
  }
}
{ const s = solar(A.state.date, 12); A.state.time = Math.round((s.sunset - 0.6) * 4) / 4; }   // golden hour today
readHash();   // a shared link overrides the defaults
A.applyLight();
buildPresets();
buildDays();
refreshUI();
queueHours();
last = snapshot();
syncUndoButtons();

function frame() {
  controls.update();
  tools.update();
  render();
  placeOverlays();
  requestAnimationFrame(frame);
}
renderer.compile(A.scene, camera);
document.body.classList.add('ready');
requestAnimationFrame(frame);
setTimeout(renderThumbs, 400);
window.__studio = { tools, get W() { return W; }, A, get B() { return B; }, setTime, setDate, enterCompare, exitCompare, camera, controls, pick, clusterOf, renderThumbs, computeHours };
