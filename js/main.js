import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { SHOTS, ROOMS, LABELS, FILES, SPOTS, LAYOUTS, H, CUT, CEIL } from './plan.js';
import { applyChoices, choose, loadChoices, LETTERS } from './layouts.js';
import { RevealMap, U, makeLibrary, reveal } from './materials.js';
import { buildHome, buildWorld } from './build.js';
import { loadDesign, applyDesign, onDesignChange } from './design.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

// ------------------------------------------------------------------ renderer
// The walk always starts at the plan.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);
const canvas = $('#gl');
const gl2 = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
if (!gl2) { $('#nogl').hidden = false; $('#loader').remove(); throw new Error('WebGL2 unavailable'); }
const renderer = new THREE.WebGLRenderer({ canvas, context: gl2, antialias: true });
const mobile = matchMedia('(max-width: 760px)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xefebe2);
scene.fog = new THREE.Fog(0xd6d9d8, 160, 2200);
const camera = new THREE.PerspectiveCamera(10, innerWidth / innerHeight, 0.04, 9000);

// ------------------------------------------------------------------ loading
const manager = new THREE.LoadingManager();
const fill = $('#loadFill'), pct = $('#loadPct');
manager.onProgress = (_u, a, b) => { const p = Math.round(a / b * 100); fill.style.width = p + '%'; pct.textContent = p + '%'; };

const lib = makeLibrary(manager, renderer);
const map = new RevealMap();
const home = buildHome(scene, lib);
const world = buildWorld(scene, lib, home.M);
applyChoices(home);
applyDesign(home, loadDesign());   // materials and moved furniture from the studio
onDesignChange(() => { applyChoices(home); applyDesign(home, loadDesign()); });

// Furniture ink lines are skipped once their room is fully revealed.
scene.updateMatrixWorld(true);
const lineRooms = home.lineObjs.map((l) => {
  l.geometry.computeBoundingBox();
  const c = l.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(l.matrixWorld);
  return map.roomAt(c.x, c.z);
});

// Sky dome and image-based light.
const skyTex = new THREE.TextureLoader(manager).load('assets/sky/qwantani_late_afternoon_puresky.jpg');
skyTex.colorSpace = THREE.SRGBColorSpace;
const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 48, 24), reveal(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }), { outside: true }));
sky.rotation.y = -0.9;
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
new RGBELoader(manager).load('assets/sky/qwantani_late_afternoon_puresky_1k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
});

// Late afternoon sun from the west-north-west, coming in through the north glazing.
const sun = new THREE.DirectionalLight(0xffd3a1, 3.4);
sun.position.set(7.1 - 24, 11, 5 - 13);
sun.target.position.set(7.1, 0, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 70 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xeef1f2, 0xa39380, 0.7));
for (const [x, z, i] of [[3.0, 7.6, 1.2], [2.0, 4.4, 2], [5.6, 3.6, 2.4], [7.3, 6.1, 2.4], [6.0, 8.7, 2.2], [9.0, 2.2, 2], [12.2, 2.7, 2.2], [4.5, 1.2, 1.4], [10.0, 5.0, 1.2]]) {
  const l = new THREE.PointLight(0xffd8a6, i, 7.5, 2); l.position.set(x, 2.45, z); scene.add(l);
}

// ------------------------------------------------------------------ the walk
const shots = SHOTS.map((s) => ({ ...s }));
const N = shots.length;
const Y = new THREE.Vector3(0, 1, 0);
let planUp = new THREE.Vector3(0, 0, -1);

function planPose(final) {
  const a = innerWidth / innerHeight, fov = 9, tf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const cx = 7.1, cz = 5.05, W = 15.2, D = 11.0;
  if (a >= 0.85) {
    const frac = final ? 0.9 : (a > 1.25 ? 0.6 : 0.95), cfrac = final ? 0.5 : (a > 1.25 ? 0.655 : 0.5);
    const hv = Math.max(D * (final ? 1.22 : 1.3), W / (a * frac));
    const vw = hv * a, dist = hv / 2 / tf;
    const tx = cx - (cfrac - 0.5) * vw;
    const tz = cz - (final || a > 1.25 ? 0 : -0.12 * hv);
    planUp = new THREE.Vector3(0, 0, -1);
    return { pos: [tx, dist, tz + 0.001], look: [tx, 0, tz], fov };
  }
  // Portrait: turn the sheet so the long side runs down the screen, north to the left.
  const hv = Math.max(W * 1.06 / (final ? 0.8 : 0.6), D * 1.1 / a);
  const dist = hv / 2 / tf;
  const tx = cx + (final ? 0.0 : 0.2) * hv;
  planUp = new THREE.Vector3(1, 0, 0);
  return { pos: [tx - 0.001, dist, cz], look: [tx, 0, cz], fov };
}

let posCurve, lookCurve, timeline, totalW, stopAt = {};
function layout() {
  for (const s of shots) if (s.plan) Object.assign(s, planPose(!!s.final));
  posCurve = new THREE.CatmullRomCurve3(shots.map((s) => new THREE.Vector3(...s.pos)), false, 'centripetal');
  lookCurve = new THREE.CatmullRomCurve3(shots.map((s) => new THREE.Vector3(...s.look)), false, 'centripetal');
  // Scroll timeline: [move into shot i][hold at shot i] ...
  timeline = []; totalW = 0;
  shots.forEach((s, i) => {
    if (i > 0) { timeline.push({ i, type: 'move', w: s.move || 1 }); totalW += s.move || 1; }
    if (s.hold) { timeline.push({ i, type: 'hold', w: s.hold }); totalW += s.hold; }
  });
  let acc = 0;
  for (const seg of timeline) {
    seg.t0 = acc / totalW; acc += seg.w; seg.t1 = acc / totalW;
    if (seg.type === 'hold' && shots[seg.i].stop) stopAt[shots[seg.i].stop] = { i: seg.i, t: (seg.t0 + seg.t1) / 2, t0: seg.t0, t1: seg.t1 };
  }
  document.getElementById('track').style.height = Math.round(totalW * (innerWidth < 760 ? 52 : 62)) + 'vh';
}

// Scroll position (0..1) → continuous shot index u.
function tToU(t) {
  for (const seg of timeline) {
    if (t > seg.t1 && seg !== timeline[timeline.length - 1]) continue;
    const l = clamp((t - seg.t0) / (seg.t1 - seg.t0));
    if (seg.type === 'hold') return seg.i;
    const v0 = shots[seg.i - 1].hold ? 0 : 1, v1 = shots[seg.i].hold ? 0 : 1;
    const h = (l ** 3 - 2 * l * l + l) * v0 + (-2 * l ** 3 + 3 * l * l) + (l ** 3 - l * l) * v1;
    return seg.i - 1 + h;
  }
  return N - 1;
}

const roomStop = ROOMS.map((r) => SHOTS.findIndex((s) => s.stop === r.key));
const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3(), tmpU = new THREE.Vector3();

function applyU(u) {
  const k = u / (N - 1);
  posCurve.getPoint(k, tmpP);
  lookCurve.getPoint(k, tmpL);
  const i = Math.min(N - 2, Math.floor(u)), f = u - i;
  const sf = smooth(0, 1, f);
  camera.fov = lerp(shots[i].fov, shots[i + 1].fov, sf);
  const upA = shots[i].plan ? planUp : Y, upB = shots[i + 1].plan ? planUp : Y;
  tmpU.copy(upA).lerp(upB, shots[i].plan ? smooth(0.1, 1, f) : smooth(0, 0.9, f)).normalize();
  camera.position.copy(tmpP);
  camera.up.copy(tmpU);
  camera.lookAt(tmpL);
  camera.updateProjectionMatrix();

  // Walls grow out of the drawing, and sink back into it at the end.
  let cut = CUT + (H - CUT) * smooth(0.05, 0.85, u);
  cut = lerp(cut, CUT, smooth(N - 2 + 0.35, N - 1, u));
  for (const w of home.wallish) {
    const full = w.y1 - w.y0;
    const h = clamp(cut - w.y0, 0, full);
    w.m.visible = h > 0.002;
    w.m.scale.y = Math.max(h, 0.0001) / (w.unit ? 1 : full);
    const capMat = h < full - 0.002 ? home.INK : w.base;
    for (const c of w.cap) w.mats[c] = capMat;
  }

  // Materials sweep across each room as the camera walks in.
  ROOMS.forEach((r, ri) => map.set(ri, smooth(roomStop[ri] - 1, roomStop[ri] - 0.05, u)));
  const deckI = roomStop[ROOMS.findIndex((r) => r.key === 'deck')];
  map.setOutside(smooth(deckI - 0.9, deckI + 0.2, u) * (1 - smooth(N - 2 + 0.15, N - 1.5, u)));
  U.uLineFade.value = smooth(N - 1.6, N - 1, u);
  const fade = U.uLineFade.value > 0;
  home.lineObjs.forEach((l, n) => { const r = lineRooms[n]; l.visible = fade || r < 0 || map.rooms[r].p < 1; });

  // Main door opens as the visitor arrives.
  const d = home.doors.main;
  const o = smooth(1.55, 2.6, u);
  d.piv.rotation.y = lerp(d.angClosed, d.angOpen, o);

  const inside = camera.position.y < CEIL - 0.03;
  home.ceilGroup.visible = inside;
  world.towerAbove.visible = inside;
}

// ------------------------------------------------------------------ UI
const track = $('#track');
const labelsEl = $('#labels');
const labelEls = LABELS.map((L) => {
  const d = document.createElement('div');
  d.className = 'label';
  d.innerHTML = `<b>${L.t}</b>${L.d ? `<span>${L.d}</span>` : ''}`;
  labelsEl.appendChild(d);
  return d;
});
const spotsEl = $('#spots');
const tip = $('#tip');
const spotEls = SPOTS.map((s) => {
  const b = document.createElement('button');
  b.className = 'spot'; b.textContent = s.n; b.setAttribute('aria-label', `Note ${s.n}: ${s.t}`);
  const show = () => { tip.textContent = s.t; tip.dataset.on = '1'; tip._spot = s; };
  b.addEventListener('mouseenter', show); b.addEventListener('focus', show); b.addEventListener('click', show);
  b.addEventListener('mouseleave', () => { tip.dataset.on = ''; });
  spotsEl.appendChild(b);
  return b;
});

const stops = SHOTS.filter((s) => s.stop).map((s) => s.stop);
const ruler = $('#rulerTicks');
function buildRuler() {
  ruler.innerHTML = '';
  stops.forEach((k, n) => {
    const a = document.createElement('a');
    a.href = '#'; a.className = 'tick'; a.style.top = (stopAt[k].t * 100) + '%';
    a.innerHTML = `<span>${FILES[k].no} ${FILES[k].title.replace(' · option 1', '')}</span>`;
    a.addEventListener('click', (e) => { e.preventDefault(); goTo(stopAt[k].t); });
    ruler.appendChild(a);
  });
}
const card = $('#card');
let cardKey = null;
function fillCard(k) {
  const f = FILES[k];
  card.querySelector('.card__no').textContent = f.no + ' / 0' + stops.length;
  card.querySelector('.card__title').textContent = f.title;
  card.querySelector('.card__time').textContent = f.time;
  card.querySelector('.card__text').textContent = f.text;
  card.querySelector('.card__facts').innerHTML = f.facts.map((x) => `<li>${x}</li>`).join('');
  fillLayouts(k);
}
// Furniture layout switcher inside the room card.
function fillLayouts(k) {
  const el = card.querySelector('.card__lay');
  const cur = loadChoices()[k] | 0;
  el.innerHTML = `<span>Layout</span>` + LAYOUTS[k].map((label, i) => `<button class="${i === cur ? 'on' : ''}" data-i="${i}" title="${label}"><i>${LETTERS[i]}</i>${label}</button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { choose(home, k, +b.dataset.i); fillLayouts(k); }));
}

let lenis;
function trackLen() { return Math.max(1, track.offsetHeight - innerHeight); }
function goTo(t) { const y = t * trackLen(); lenis ? lenis.scrollTo(y, { duration: 2.2 }) : scrollTo(0, y); }
document.querySelectorAll('[data-to]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  const v = a.dataset.to;
  if (v === 'end') lenis ? lenis.scrollTo('#finale', { duration: 2 }) : $('#finale').scrollIntoView();
  else if (v === '0') goTo(0);
  else goTo(stopAt[v].t);
}));

const v3 = new THREE.Vector3();
function project(x, y, z) {
  v3.set(x, y, z).project(camera);
  return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight, front: v3.z < 1 };
}

const countEl = $('#count');
const hero = $('#hero'), hint = $('#hint'), hintFill = $('#hintFill'), countB = $('#count b'), rulerNow = $('#rulerNow');
function ui(t, u) {
  hero.style.opacity = 1 - smooth(0.002, 0.03, t);
  hero.style.visibility = t > 0.035 ? 'hidden' : 'visible';
  hint.style.opacity = 1 - smooth(0.01, 0.05, t);
  hintFill.style.width = clamp(t / 0.05) * 100 + '%';
  rulerNow.style.top = t * 100 + '%';
  countEl.style.opacity = smooth(0.02, 0.05, t);

  // Plan labels while the sheet is flat.
  const lo = Math.max(1 - smooth(0.03, 0.5, u), smooth(N - 1.25, N - 1, u));
  labelsEl.style.opacity = lo;
  if (lo > 0.01) LABELS.forEach((L, n) => { const p = project(L.p[0], 0.02, L.p[1]); labelEls[n].style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`; });

  // Room count + card.
  let cur = null, passed = 0;
  stops.forEach((k, n) => { const s = stopAt[k]; if (t >= s.t0 - 0.004) passed = n + 1; if (t > s.t0 - 0.006 && t < s.t1 + 0.004) cur = k; });
  countB.textContent = String(passed).padStart(2, '0');
  if (cur !== cardKey) {
    if (cur) { fillCard(cur); card.dataset.on = '1'; } else card.dataset.on = '';
    cardKey = cur;
  }

  // Numbered notes from the customisation drawing.
  let anySpot = false;
  SPOTS.forEach((s, n) => {
    const st = stopAt[s.room];
    const on = st && u > st.i - 0.35 && u < st.i + (s.room === 'kitchen' ? 1.35 : 0.35);
    const el = spotEls[n];
    if (on) {
      const p = project(...s.p);
      const vis = p.front && p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight;
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      el.dataset.on = vis ? '1' : '';
      if (vis) anySpot = true;
      if (tip._spot === s && tip.dataset.on) tip.style.transform = `translate(${p.x}px, ${p.y - 26}px) translate(-50%, -100%)`;
    } else el.dataset.on = '';
  });
  if (!anySpot) tip.dataset.on = '';
}

// ------------------------------------------------------------------ loop
let tNow = 0, uNow = 0;
function readT() { return clamp((lenis ? lenis.scroll : scrollY) / trackLen()); }

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  layout();
  buildRuler();
  applyU(uNow);
}
addEventListener('resize', resize);

function frame(time) {
  lenis && lenis.raf(time);
  tNow = readT();
  uNow = tToU(tNow);
  applyU(uNow);
  ui(tNow, uNow);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

layout();
buildRuler();
applyU(0);

manager.onLoad = () => {
  // Compile everything up front so the first scroll doesn't stutter.
  renderer.compile(scene, camera);
  document.body.classList.add('ready');
  const ld = $('#loader');
  ld.classList.add('done');
  setTimeout(() => ld.remove(), 1400);
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9, smoothWheel: true });
  }
  if (window.gsap) {
    gsap.from('.hero__title .mask > span', { yPercent: 110, duration: 1.3, ease: 'expo.out', stagger: 0.09, delay: 0.25 });
    gsap.from('.hero__kicker, .hero__lede, .titleblock, .topbar, .hint', { opacity: 0, y: 14, duration: 1.1, ease: 'power3.out', stagger: 0.06, delay: 0.55 });
    gsap.from('.label', { opacity: 0, duration: 1.2, stagger: 0.03, delay: 0.7 });
    if (window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      gsap.utils.toArray('#finale [data-rise]').forEach((el) => gsap.from(el, { opacity: 0, y: 30, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));
      gsap.from('#finale .mask > span', { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '#finale', start: 'top 70%' } });
    }
  }
  requestAnimationFrame(frame);
};

// Debug hook for checking camera poses: ?u=7.5 jumps the walk to a shot index.
const qu = new URLSearchParams(location.search).get('u');
if (qu !== null) {
  const target = parseFloat(qu);
  manager.onLoad = ((orig) => () => {
    orig();
    let lo = 0, hi = 1;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; tToU(m) < target ? (lo = m) : (hi = m); }
    requestAnimationFrame(() => (lenis ? lenis.scrollTo(lo * trackLen(), { immediate: true }) : scrollTo(0, lo * trackLen())));
  })(manager.onLoad);
}
window.__walk = { setT: (t) => (lenis ? lenis.scrollTo(t * trackLen(), { immediate: true }) : scrollTo(0, t * trackLen())), tToU: (t) => tToU(t), get u() { return uNow; }, camera, renderer, scene };
