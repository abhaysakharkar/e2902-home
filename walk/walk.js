import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WALLS, OUTLINE, ROOMS, SHOTS, LAYOUTS, H, CEIL } from '../js/plan.js';
import { applyChoices, choose, loadChoices, LETTERS } from '../js/layouts.js';
import { U } from '../js/materials.js';
import { buildHome, buildWorld } from '../js/build.js';
import { makeProcLibrary } from './proctex.js';
import { createTools } from '../js/tools.js';
import { loadDesign, applyDesign, onDesignChange, saveDesign, objKey, loadCustoms } from '../js/design.js';
import { createArrange, furnitureRoot } from '../js/arrange.js';
import { setupXR } from '../js/xr.js';
import { solar, sunVector, compass, hhmm, today, dateStr, parseDate } from '../js/sun.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const touch = matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 9000);
camera.rotation.order = 'YXZ';

// Everything is fully "revealed": no paper, no ink. (Same shaders as the scroll page.)
const white = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat); white.needsUpdate = true;
U.uReveal.value = white; U.uOutside.value = 1; U.uLineFade.value = 0;

// ------------------------------------------------------------------ build
const lib = makeProcLibrary(renderer);
const home = buildHome(scene, lib, { lines: false });
const world = buildWorld(scene, lib, home.M);
for (const w of home.wallish) { w.m.scale.y = w.unit ? H : 1; w.m.visible = true; }
applyChoices(home);
applyDesign(home, loadDesign());   // materials and moved furniture from the studio
home.ceilGroup.visible = true;
world.towerAbove.visible = true;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const envMats = new Set();
scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.envMapIntensity !== undefined && envMats.add(m)); });
const baseEnv = new Map([...envMats].map((m) => [m, m.envMapIntensity]));

// Dusk sky, drawn by a shader.
const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 uTop, uMid, uHor, uSun, uSunCol; varying vec3 vD;
    void main(){
      float h = vD.y;
      vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.18, h));
      c = mix(c, uTop, smoothstep(0.18, 0.75, h));
      float s = max(dot(normalize(vD), normalize(uSun)), 0.0);
      c += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
scene.add(sky);
scene.fog = new THREE.Fog(0xb08a74, 200, 2400);

// Sun, sky light, and the lamps inside.
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.target.position.set(7.1, 0, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
scene.add(hemi);
const lamps = [];
for (const [x, z, i] of [[2.95, 7.6, 2.2], [2.0, 4.4, 3], [5.5, 3.4, 3.4], [7.3, 6.1, 3.8], [5.6, 8.7, 3.2], [8.5, 8.7, 1.5],
  [8.9, 2.3, 3], [12.2, 2.6, 3.4], [4.5, 1.2, 2.2], [9.9, 4.6, 1.6], [0.95, 1.6, 1.4], [11.9, 5.75, 1.4], [9.85, 6.5, 1.2]]) {
  const l = new THREE.PointLight(0xffc98a, i, 7, 2); l.position.set(x, 2.2, z); scene.add(l); lamps.push([l, i]);
}

// ------------------------------------------------------------------ time of day
const MOODS = {
  evening: { sunPos: [-24, 4.5, -10], sunCol: 0xff8a4a, sunI: 2.6, top: 0x1d2c4f, mid: 0x6d6a8c, hor: 0xf09a62, sunGlow: 0xffb070,
    hemiSky: 0x6a7090, hemiGnd: 0x2b2018, hemiI: 0.35, env: 0.3, exp: 1.0, lamps: 0.75, glow: 2.4, city: 1.1, fog: 0x9b8094 },
  day: { sunPos: [-18, 22, -9], sunCol: 0xfff1de, sunI: 3.2, top: 0x4f7fbf, mid: 0x9fc0e0, hor: 0xe6e8e4, sunGlow: 0xfff3d8,
    hemiSky: 0xe7eef2, hemiGnd: 0xa39380, hemiI: 0.75, env: 0.9, exp: 1.08, lamps: 0.15, glow: 0.6, city: 0, fog: 0xd6d9d8 },
};
MOODS.night = { sunCol: 0x8fa3d6, sunI: 0.35, top: 0x05070f, mid: 0x0d1428, hor: 0x23243a, sunGlow: 0x000000,
  hemiSky: 0x2a3150, hemiGnd: 0x120e0a, hemiI: 0.18, env: 0.15, exp: 0.95, lamps: 1, glow: 2.6, city: 1.4, fog: 0x15182a };
// The real sun over Kharadi: date + clock time. The two palettes above are blended by how high the sun is.
const sunState = { date: today(), time: 17.5 };
{ const s = solar(sunState.date, 12); sunState.time = Math.round((s.sunset - 0.6) * 4) / 4; }   // golden hour today
let lightsOn = true;
const mixC = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
const mixN = (a, b, k) => a + (b - a) * k;
const CTR = new THREE.Vector3(7.1, 0, 5);
function applyMood() {
  const s = solar(sunState.date, sunState.time);
  const e = Math.sin(s.el * Math.PI / 180);
  const kd = smooth(0.12, 0.55, e), kn = 1 - smooth(-0.1, 0.02, e);
  const E = MOODS.evening, D = MOODS.day, N = MOODS.night;
  const pick = (k) => {
    const v = typeof E[k] === 'number' && k.match(/Col|top|mid|hor|Glow|Sky|Gnd|fog/) ? mixC(E[k], D[k], kd) : mixN(E[k], D[k], kd);
    return v instanceof THREE.Color ? v.lerp(new THREE.Color(N[k]), kn) : mixN(v, N[k], kn);
  };
  const dir = s.el > -1 ? sunVector(Math.max(s.el, 0.5), s.az) : new THREE.Vector3(-0.3, 1, 0.45).normalize();
  sun.position.copy(CTR).addScaledVector(dir, 30);
  if (s.el > -1) { sun.color.copy(pick('sunCol')); sun.intensity = pick('sunI') * smooth(-0.03, 0.08, e); }
  else { sun.color.set(N.sunCol); sun.intensity = N.sunI; }   // moonlight
  skyU.uTop.value.copy(pick('top')); skyU.uMid.value.copy(pick('mid')); skyU.uHor.value.copy(pick('hor')); skyU.uSunCol.value.copy(pick('sunGlow'));
  skyU.uSun.value.copy(s.el > -1 ? dir : new THREE.Vector3(0, -1, 0));
  hemi.color.copy(pick('hemiSky')); hemi.groundColor.copy(pick('hemiGnd')); hemi.intensity = pick('hemiI');
  const env = pick('env');
  for (const [mat, b] of baseEnv) mat.envMapIntensity = b * env;
  renderer.toneMappingExposure = pick('exp');
  const on = lightsOn ? 1 : 0;
  for (const [l, i] of lamps) l.intensity = i * pick('lamps') * on;
  home.M.glow.emissiveIntensity = lightsOn ? pick('glow') : 0;
  world.city.material.emissiveIntensity = pick('city');
  scene.fog.color.copy(pick('fog'));
  $('#moodName').textContent = hhmm(sunState.time);
  $('#lightsName').textContent = lightsOn ? 'on' : 'off';
  $('#sunTime').value = sunState.time;
  $('#sunDate').value = dateStr(sunState.date);
  $('#sunInfoW').innerHTML = `Sunrise <b>${hhmm(s.sunrise)}</b> · Sunset <b>${hhmm(s.sunset)}</b><br>${s.el > 0 ? `Sun ${Math.round(s.el)}° up, from the ${compass(s.az)}` : 'Sun below the horizon'}`;
}
function smooth(a, b, v) { const x = Math.min(1, Math.max(0, (v - a) / (b - a))); return x * x * (3 - 2 * x); }
// T jumps between golden hour and midday on the chosen date.
function toggleDay() {
  const s = solar(sunState.date, 12);
  const golden = s.sunset - 0.6;
  sunState.time = Math.abs(sunState.time - golden) < 0.5 ? Math.round(s.noon * 4) / 4 : Math.round(golden * 4) / 4;
  applyMood();
}
applyMood();

// ------------------------------------------------------------------ post: a little bloom on lamps and the sun
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.5, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ collision grid
// 4 cm cells over the flat. Blocked: outside the slab, inside a wall, or under furniture.
const RES = 0.04, X0 = -0.5, Z0 = -0.5, GW = Math.ceil(15.2 / RES), GH = Math.ceil(11.2 / RES);
const blocked = new Uint8Array(GW * GH);
function inPoly(x, z, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const wallBoxes = WALLS.map((P) => { const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]); return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]; });
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
  const x = X0 + (i + 0.5) * RES, z = Z0 + (j + 0.5) * RES;
  let b = !inPoly(x, z, OUTLINE);
  for (let w = 0; !b && w < WALLS.length; w++) { const bb = wallBoxes[w]; if (x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3] && inPoly(x, z, WALLS[w])) b = true; }
  blocked[j * GW + i] = b ? 1 : 0;
}
const baseBlocked = blocked.slice();
scene.updateMatrixWorld(true);
const bb = new THREE.Box3();
const blockBox = (b) => {
  const i0 = Math.max(0, Math.floor((b.min.x - X0) / RES)), i1 = Math.min(GW - 1, Math.floor((b.max.x - X0) / RES));
  const j0 = Math.max(0, Math.floor((b.min.z - Z0) / RES)), j1 = Math.min(GH - 1, Math.floor((b.max.z - Z0) / RES));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * GW + i] = 1;
};
// Only furniture in the layouts currently shown counts.
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const _v = new THREE.Vector3();
// Footprint of a mesh as a convex quad on the floor (its local box, turned the way the mesh is turned).
function footprint(m) {
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox, pts = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const [x, z] of [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]]) {
    for (const y of [b.min.y, b.max.y]) { _v.set(x, y, z).applyMatrix4(m.matrixWorld); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    _v.set(x, b.min.y, z).applyMatrix4(m.matrixWorld); pts.push([_v.x, _v.z]);
  }
  return { pts, y0, y1 };
}
const solidBoxes = () => home.solids.filter(shown).map(footprint).filter((f) => f.y1 >= 0.3 && f.y0 <= 1.2);
function blockQuad(f) {
  const xs = f.pts.map((p) => p[0]), zs = f.pts.map((p) => p[1]);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - X0) / RES)), i1 = Math.min(GW - 1, Math.floor((Math.max(...xs) - X0) / RES));
  const j0 = Math.max(0, Math.floor((Math.min(...zs) - Z0) / RES)), j1 = Math.min(GH - 1, Math.floor((Math.max(...zs) - Z0) / RES));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inPoly(X0 + (i + 0.5) * RES, Z0 + (j + 0.5) * RES, f.pts)) blocked[j * GW + i] = 1;
}
function rebuildCollision() {
  blocked.set(baseBlocked);
  for (const f of solidBoxes()) blockQuad(f);                          // rugs, floors and wall units overhead are skipped
  for (const w of home.wallish) { if (w.unit) continue; bb.setFromObject(w.m); if (bb.min.y < 1.2) blockBox(bb); } // window sills, glazing walls
}
rebuildCollision();

const isBlocked = (x, z) => {
  const i = Math.floor((x - X0) / RES), j = Math.floor((z - Z0) / RES);
  return i < 0 || j < 0 || i >= GW || j >= GH || blocked[j * GW + i] === 1;
};
const R = 0.17;
const RING = Array.from({ length: 10 }, (_, k) => [Math.cos(k / 10 * Math.PI * 2) * R, Math.sin(k / 10 * Math.PI * 2) * R]);
const free = (x, z) => !isBlocked(x, z) && RING.every(([dx, dz]) => !isBlocked(x + dx, z + dz));

// ------------------------------------------------------------------ player
const EYE = 1.6;
const player = { x: 3.1, z: 8.6, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0 };
const stops = SHOTS.filter((s) => s.stop);
function teleport(x, z, lookX, lookZ) {
  if (!free(x, z)) {
    // Nudge to the nearest free spot.
    for (let r = 0.04; r < 1.2; r += 0.04) for (let a = 0; a < 6.28; a += 0.4) if (free(x + Math.cos(a) * r, z + Math.sin(a) * r)) { x += Math.cos(a) * r; z += Math.sin(a) * r; r = 9; break; }
  }
  player.x = x; player.z = z; player.vx = player.vz = 0;
  if (lookX !== undefined) { player.yaw = Math.atan2(-(lookX - x), -(lookZ - z)); player.pitch = -0.08; }
}
teleport(3.15, 8.7, 3.6, 5.5);

const keys = {};
let locked = false;     // classic pointer-lock look (C toggles it)
let lockForArrange = false, rLook = false;
const arranging = () => tools.tab === 'arr';   // (only called from events and frames, after setup)
let wantLock = false;
let playing = false;
const mouse = { x: 0, y: 0, over: false };
// Free look: the pointer's position offsets the view from the heading (player.yaw), so reaching for a
// panel and coming back never leaves you facing somewhere else.
const aim = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (e.code === 'Escape' && !locked) { playing ? pause() : document.body.classList.contains('entered') && enter(); }
  if (e.code === 'KeyC' && !touch) {
    wantLock = !wantLock;
    if (wantLock && playing) gl.requestPointerLock(); else if (locked) document.exitPointerLock();
    $('#lockName').textContent = wantLock ? 'locked' : 'free';
  }
  if (e.code === 'KeyL') { lightsOn = !lightsOn; applyMood(); }
  if (e.code === 'KeyT') toggleDay();
  if (e.code === 'KeyM') $('#map').classList.toggle('big');
  if (e.code === 'KeyR' && arrange.selection) arrange.rotate(Math.PI / 2);
  if (e.code === 'KeyG') tools.open('arr');
  if (e.code === 'KeyE') tools.open('elec');
  if (e.code === 'KeyQ') tools.open('tape');
  if (e.code === 'KeyF' && layKey) setRoomLayout(layKey, ((loadChoices()[layKey] | 0) + 1) % 3);
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= stops.length) { const s = stops[n - 1]; teleport(s.pos[0], s.pos[2], s.look[0], s.look[2]); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

const gl = $('#gl'), intro = $('#intro');
// Free-cursor walking: the mouse turns the view while the pointer stays visible,
// so the layout buttons, room list, map and toggles can be clicked without leaving the walk.
function enter() {
  intro.classList.add('gone');
  document.body.classList.add('playing', 'entered');
  playing = true;
  if (wantLock && !touch) gl.requestPointerLock();
}
function pause() {
  intro.classList.remove('gone');
  document.body.classList.remove('playing');
  playing = false;
  for (const k in keys) keys[k] = false;
}
$('#enter').addEventListener('click', enter);
gl.addEventListener('click', () => { if (!touch && playing && wantLock && !locked) gl.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === gl;
  document.body.classList.toggle('locked', locked);
  // Esc in locked mode releases the mouse; treat that as pause, like before.
  if (!locked && wantLock && playing && !arranging()) pause();
});
document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.over = e.target === gl;
  if (locked) {
    player.yaw -= e.movementX * 0.0022;
    player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.35, 1.35);
  } else if (playing && arranging()) {
    // Arrange: the view holds still so you can point at furniture; hold the right button and drag to look around.
    if (rLook) { player.yaw -= e.movementX * 0.004; player.pitch = clamp(player.pitch - e.movementY * 0.003, -1.2, 1.2); }
  } else if (playing && mouse.over && !arrDrag) {
    aim.tx = -(e.clientX / innerWidth * 2 - 1) * 0.95;   // about 55° either side
    aim.ty = -(e.clientY / innerHeight * 2 - 1) * 0.5;
  }
});
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) mouse.over = false; });
addEventListener('blur', () => { mouse.over = false; for (const k in keys) keys[k] = false; });

// Touch: left half is a joystick, right half drags the view.
const joy = { id: null, x: 0, y: 0, dx: 0, dy: 0 }, look = { id: null, x: 0, y: 0 };
const stick = $('#stick'), knob = $('#knob');
gl.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && joy.id === null) { Object.assign(joy, { id: t.identifier, x: t.clientX, y: t.clientY, dx: 0, dy: 0 }); stick.style.cssText = `left:${t.clientX}px;top:${t.clientY}px;opacity:1`; }
    else if (look.id === null) Object.assign(look, { id: t.identifier, x: t.clientX, y: t.clientY });
  }
}, { passive: true });
gl.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      joy.dx = clamp((t.clientX - joy.x) / 50, -1, 1); joy.dy = clamp((t.clientY - joy.y) / 50, -1, 1);
      knob.style.transform = `translate(${joy.dx * 34}px, ${joy.dy * 34}px)`;
    } else if (t.identifier === look.id) {
      player.yaw -= (t.clientX - look.x) * 0.005; player.pitch = clamp(player.pitch - (t.clientY - look.y) * 0.005, -1.3, 1.3);
      look.x = t.clientX; look.y = t.clientY;
    }
  }
}, { passive: true });
const endTouch = (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.id = null; joy.dx = joy.dy = 0; stick.style.opacity = 0; knob.style.transform = ''; }
    if (t.identifier === look.id) look.id = null;
  }
};
gl.addEventListener('touchend', endTouch); gl.addEventListener('touchcancel', endTouch);

// HUD buttons
$('#btnMood').addEventListener('click', () => $('#sunPop').classList.toggle('on'));
$('#sunTime').addEventListener('input', (e) => { sunState.time = +e.target.value; applyMood(); });
$('#sunDate').addEventListener('change', (e) => { const d = parseDate(e.target.value); if (d) { sunState.date = d; applyMood(); } });
document.querySelectorAll('#sunChips button').forEach((b) => b.addEventListener('click', () => {
  sunState.date = b.dataset.today ? today() : { y: today().y, m: +b.dataset.m, d: +b.dataset.d }; applyMood();
}));
$('#btnLights').addEventListener('click', () => { lightsOn = !lightsOn; applyMood(); });
$('#btnLock').addEventListener('click', () => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' })));
const roomList = $('#rooms');
stops.forEach((s, n) => {
  const b = document.createElement('button');
  b.innerHTML = `<i>${n + 1}</i>${ROOMS.find((r) => r.key === s.stop).name}`;
  b.addEventListener('click', () => teleport(s.pos[0], s.pos[2], s.look[0], s.look[2]));
  roomList.appendChild(b);
});

// ------------------------------------------------------------------ minimap
const mapC = $('#mapc'), mg = mapC.getContext('2d');
const MS = 13; // px per metre at base size
const mapBase = document.createElement('canvas');
mapBase.width = 15.2 * MS * 2; mapBase.height = 11.2 * MS * 2;
{
  const g = mapBase.getContext('2d'), k = MS * 2, P = (x, z) => [(x - X0) * k, (z - Z0) * k];
  g.fillStyle = 'rgba(239,235,226,0.92)'; g.beginPath(); OUTLINE.forEach(([x, z], i) => g[i ? 'lineTo' : 'moveTo'](...P(x, z))); g.closePath(); g.fill();
  g.fillStyle = '#1d1d1f';
  for (const W of WALLS) { g.beginPath(); W.forEach(([x, z], i) => g[i ? 'lineTo' : 'moveTo'](...P(x, z))); g.closePath(); g.fill(); }
}
const mapFurn = document.createElement('canvas');
mapFurn.width = mapBase.width; mapFurn.height = mapBase.height;
function drawFurniture() {
  const g = mapFurn.getContext('2d'), k = MS * 2, P = (x, z) => [(x - X0) * k, (z - Z0) * k];
  g.clearRect(0, 0, mapFurn.width, mapFurn.height);
  g.fillStyle = 'rgba(29,29,31,0.18)';
  for (const f of solidBoxes()) { g.beginPath(); f.pts.forEach(([x, z], i) => g[i ? 'lineTo' : 'moveTo'](...P(x, z))); g.closePath(); g.fill(); }
}
drawFurniture();
function drawMap() {
  const W = mapC.width, Hh = mapC.height, k = W / (15.2 * MS * 2) * MS * 2;
  mg.clearRect(0, 0, W, Hh);
  mg.drawImage(mapBase, 0, 0, W, Hh);
  mg.drawImage(mapFurn, 0, 0, W, Hh);
  const px = (player.x - X0) * k, pz = (player.z - Z0) * k;
  mg.save(); mg.translate(px, pz); mg.rotate(-player.yaw);
  const gr = mg.createRadialGradient(0, 0, 0, 0, 0, 3.2 * k);
  gr.addColorStop(0, 'rgba(184,138,74,0.55)'); gr.addColorStop(1, 'rgba(184,138,74,0)');
  mg.fillStyle = gr; mg.beginPath(); mg.moveTo(0, 0); mg.arc(0, 0, 3.2 * k, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); mg.closePath(); mg.fill();
  mg.fillStyle = '#c43428'; mg.beginPath(); mg.arc(0, 0, Math.max(3, 0.18 * k), 0, Math.PI * 2); mg.fill();
  mg.restore();
}
function sizeMap() {
  const big = $('#map').classList.contains('big');
  const w = Math.round((big ? Math.min(innerWidth * 0.8, 760) : (innerWidth < 700 ? 150 : 230)) * devicePixelRatio);
  mapC.width = w; mapC.height = Math.round(w * 11.2 / 15.2);
}
sizeMap();
new MutationObserver(sizeMap).observe($('#map'), { attributes: true, attributeFilter: ['class'] });
mapC.addEventListener('click', (e) => {
  const r = mapC.getBoundingClientRect();
  const x = X0 + (e.clientX - r.left) / r.width * 15.2, z = Z0 + (e.clientY - r.top) / r.height * 11.2;
  if (inPoly(x, z, OUTLINE)) teleport(x, z);
});

// ------------------------------------------------------------------ loop
const roomEl = $('#room');
let lastRoom = '';
function roomAt(x, z) {
  for (const r of ROOMS) for (const [a, b, c, d] of r.rects) if (x >= a && x <= c && z >= b && z <= d) {
    if (r.key === 'kitchen' && x > 7.96) return { name: 'Utility', key: 'kitchen' };
    if (r.key === 'dining' && x > 9.0 && z < 5.55) return { name: 'Passage', key: null };
    if (r.key === 'dining' && x > 9.1 && z > 5.6) return { name: 'Bath', key: null };
    if (r.key === 'parent' && z < 2.75) return { name: 'Bath', key: null };
    if (r.key === 'master' && z > 5.05) return { name: 'Bath', key: null };
    return { name: r.name, key: r.key };
  }
  return { name: '', key: null };
}

// ------------------------------------------------------------------ furniture layouts
const layEl = $('#layout'), layName = $('#layName'), layBtns = $('#layBtns');
let layKey = null;
function showLayouts(key) {
  layKey = key;
  layEl.classList.toggle('off', !key);
  if (!key) return;
  const cur = loadChoices()[key] | 0, custom = (home._custom || {})[key];
  layName.textContent = ROOMS.find((r) => r.key === key).name;
  layBtns.innerHTML = '';
  LAYOUTS[key].forEach((label, i) => {
    const b = document.createElement('button');
    b.className = !custom && i === cur ? 'on' : '';
    b.innerHTML = '<i>' + LETTERS[i] + '</i>' + label;
    b.addEventListener('click', () => setRoomLayout(key, i));
    layBtns.appendChild(b);
  });
  for (const c of loadCustoms().filter((x) => x.room === key)) {
    const b = document.createElement('button');
    b.className = c.id === custom ? 'on' : '';
    b.innerHTML = '<i>★</i>' + c.name.replace(/[<>&]/g, '');
    b.addEventListener('click', () => arrange.applyCustom(c.id));
    layBtns.appendChild(b);
  }
}
// Choosing A/B/C puts the room back as drawn for that layout (moves and removals in it are cleared).
function setRoomLayout(key, i) { arrange.chooseBase(key, i); }
// Save the walk's furniture edits into the shared design, then refresh collision and the map.
function walkCommit() {
  const d = loadDesign() || { slots: {} };
  const moves = {};
  for (const o of home._moved.keys()) { const k = objKey(o); if (k) moves[k] = [+o.position.x.toFixed(3), +o.position.z.toFixed(3), +o.rotation.y.toFixed(4)]; }
  Object.assign(d, { moves, hidden: [...home._hidden].map(objKey).filter(Boolean), custom: { ...home._custom }, at: Date.now() });
  saveDesign(d);
  scene.updateMatrixWorld(true);
  rebuildCollision(); drawFurniture();
  tools.furnitureChanged();
  if (!free(player.x, player.z)) teleport(player.x, player.z);   // step aside if a piece landed on you
  layKey = null;   // refresh the layout chips
}

// ------------------------------------------------------------------ tools: electrical, tape, fit check
const tools = createTools({
  scene, camera, canvas: gl, home, mode: 'walk', cardClass: 'walk',
  extraTabs: [{ key: 'arr', label: 'Arrange' }],
  // New fit-check pieces land 1.6 m in front of you.
  // Arrange needs a visible, clickable mouse: release a locked mouse while it is open, restore it after.
  onOpen: (t) => {
    const on = t === 'arr';
    document.body.classList.toggle('arranging', on);
    if (on) {
      aim.tx = aim.x; aim.ty = aim.y;   // keep the current view
      if (wantLock) { lockForArrange = true; wantLock = false; if (locked) document.exitPointerLock(); $('#lockName').textContent = 'free'; }
    } else if (lockForArrange) { lockForArrange = false; wantLock = true; $('#lockName').textContent = 'locked'; }
    gl.style.cursor = '';
  },
  placeAt: () => { const y = player.yaw + aim.x; return { x: player.x - Math.sin(y) * 1.6, z: player.z - Math.cos(y) * 1.6, rot: Math.round(y / (Math.PI / 2)) * (Math.PI / 2) }; },   // squared to the walls
  // Clicking a clash walks you to a spot in front of that point.
  onFocus: (x, z, n) => teleport(x + (n ? n[0] : 0) * 1.4, z + (n ? n[1] : 0) * 1.4, x, z),
});
tools.onChange(() => { rebuildCollision(); drawFurniture(); if (!free(player.x, player.z)) teleport(player.x, player.z); });
// Studio open in another tab? Follow its changes live.
onDesignChange((key) => {
  if (key === 'e2902-fit') return;   // fit pieces load on the next visit
  applyChoices(home);
  applyDesign(home, loadDesign());
  scene.updateMatrixWorld(true);
  rebuildCollision(); drawFurniture(); tools.furnitureChanged();
  showLayouts(layKey); layKey = null;
  if (!free(player.x, player.z)) teleport(player.x, player.z);
});
// ------------------------------------------------------------------ Arrange: pick up furniture, place it, save custom layouts
home._moved ||= new Map(); home._hidden ||= new Set(); home._custom ||= {};
const arrange = createArrange({
  scene, home, body: tools.bodyOf('arr'),
  hooks: {
    moved: () => home._moved,
    markMoved: (o) => { if (!home._moved.has(o)) home._moved.set(o, [o.position.x, o.position.z, o.rotation.y]); },
    setLayout: (room, i) => choose(home, room, i),
    layoutOf: (room) => loadChoices()[room] | 0,
    commit: walkCommit,
    roomHint: () => roomAt(player.x, player.z).key,
    pickHint: 'Click a piece of furniture to pick it up, then drag it across the floor. R turns it 90°. Hold the right mouse button and drag to look around; WASD still walks.',
  },
});
let arrDrag = null;
const pickRay = new THREE.Raycaster(), pickNdc = new THREE.Vector2(), dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function furnitureAt(x, y) {
  pickNdc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  pickRay.setFromCamera(pickNdc, camera);
  const meshes = []; scene.traverseVisible((m) => { if (m.isMesh && m !== sky) meshes.push(m); });
  for (const h of pickRay.intersectObjects(meshes, false)) {
    if (h.distance > 12) return null;
    const root = furnitureRoot(h.object);
    return root ? { root, point: h.point } : null;   // the first thing hit decides (a wall in the way blocks it)
  }
  return null;
}
const toolXY = (e) => (locked ? [innerWidth / 2, innerHeight / 2] : [e.clientX, e.clientY]);
gl.addEventListener('mousedown', (e) => {
  if (!playing || e.button !== 0) return;
  if (tools.tab !== 'arr') return;
  const f = furnitureAt(...toolXY(e));
  if (!f) { arrange.select(null); return; }
  arrange.select(f.root);
  dragPlane.constant = -f.point.y;
  const start = new THREE.Vector3(); pickRay.ray.intersectPlane(dragPlane, start);
  arrDrag = { cluster: arrange.selection, start, orig: arrange.selection.map((o) => [o.position.x, o.position.z]), moved: false };
});
document.addEventListener('mousemove', (e) => {
  if (!arrDrag) return;
  const [x, y] = toolXY(e);
  pickNdc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  pickRay.setFromCamera(pickNdc, camera);
  const at = new THREE.Vector3();
  if (!pickRay.ray.intersectPlane(dragPlane, at)) return;
  const dx = at.x - arrDrag.start.x, dz = at.z - arrDrag.start.z;
  if (!arrDrag.moved && Math.hypot(dx, dz) < 0.02) return;
  if (!arrDrag.moved) { for (const o of arrDrag.cluster) if (!home._moved.has(o)) home._moved.set(o, [o.position.x, o.position.z, o.rotation.y]); arrDrag.moved = true; }
  arrDrag.cluster.forEach((o, i) => { o.position.x = arrDrag.orig[i][0] + dx; o.position.z = arrDrag.orig[i][1] + dz; });
  arrange.dragged();
});
addEventListener('mouseup', () => { if (arrDrag) { const m = arrDrag.moved; arrDrag = null; if (m) walkCommit(); } });
gl.addEventListener('mousedown', (e) => { if (playing && tools.measuring) tools.click(...toolXY(e), e); });
gl.addEventListener('contextmenu', (e) => { if (tools.measuring || arranging()) e.preventDefault(); });
// Arrange: right button held = look around; hovering furniture shows a hand.
gl.addEventListener('mousedown', (e) => { if (e.button === 2 && arranging()) rLook = true; });
addEventListener('mouseup', (e) => { if (e.button === 2) rLook = false; });
let hoverT = 0;
gl.addEventListener('mousemove', (e) => {
  if (!arranging() || rLook) return;
  if (arrDrag) { gl.style.cursor = 'grabbing'; return; }
  const now = performance.now(); if (now - hoverT < 60) return; hoverT = now;
  gl.style.cursor = furnitureAt(e.clientX, e.clientY) ? 'grab' : 'default';
});
document.addEventListener('mousemove', (e) => { if (playing && (mouse.over || locked)) tools.hover(...toolXY(e), e); else tools.hideTip(); });

// ------------------------------------------------------------------ VR / AR
const facadeMeshes = []; scene.traverse((m) => { if (m.isMesh && m.material === world.facade) facadeMeshes.push(m); });
const xr = setupXR({
  renderer, scene, camera, home, free, player, overlay: $('#xrOverlay'),
  worldObjects: () => [sky, world.city, world.ground, world.hills, world.towerAbove, ...facadeMeshes, ...scene.children.filter((c) => c.isInstancedMesh)],
  onButton: (i) => {
    if (i === 4) { const r = roomAt(player.x, player.z); if (r.key) setRoomLayout(r.key, ((loadChoices()[r.key] | 0) + 1) % 3); }
    if (i === 5) { lightsOn = !lightsOn; applyMood(); }
  },
  onStart: (m) => { document.body.classList.add('in-xr'); $('#xrPop').classList.remove('on'); },
  onEnd: () => { document.body.classList.remove('in-xr'); teleport(player.x, player.z); },
});
xr.ready.then((s) => {
  const vr = $('#xrVR'), ad = $('#xrDoll'), at = $('#xrTrue');
  vr.disabled = !s.vr; ad.disabled = at.disabled = !s.ar;
  const secure = window.isSecureContext;
  $('#xrStatus').innerHTML = !navigator.xr
    ? (secure ? 'This browser has no WebXR. Open this page in the Quest browser, or Chrome on an Android phone.' : 'WebXR needs a secure page. Open it over <b>https</b> (see the README), or on this computer at localhost.')
    : `${s.vr ? 'VR ready.' : 'No VR headset here.'} ${s.ar ? 'AR ready.' : 'No AR on this device (Android Chrome with ARCore, or a Quest 3 for passthrough).'}`;
});
const xrGo = (m) => xr.start(m).catch((e) => { $('#xrStatus').textContent = `Couldn't start: ${e.message}`; });
$('#btnXR').addEventListener('click', () => $('#xrPop').classList.toggle('on'));
$('#xrVR').addEventListener('click', () => xrGo('vr'));
$('#xrDoll').addEventListener('click', () => xrGo('ar-doll'));
$('#xrTrue').addEventListener('click', () => { teleport(3.15, 8.7, 3.15, 6.0); xrGo('ar-true'); });   // you stand at the front door, facing in
document.querySelectorAll('#xrOverlay [data-n]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); xr.nudge(b.dataset.n); }));
$('#xrExit').addEventListener('click', (e) => { e.stopPropagation(); xr.end(); });
$('#xrPlace').addEventListener('click', (e) => { e.stopPropagation(); xr.placeHere(); });

const clock = new THREE.Clock();
const edgeL = $('#edgeL'), edgeR = $('#edgeR');
function frame(time, xrFrame) {
  const dt = Math.min(clock.getDelta(), 0.05);
  // In a headset or AR session the XR module moves the viewer; the page just keeps room state and renders.
  if (xr.update(dt, xrFrame)) {
    const rn = roomAt(player.x, player.z);
    if (rn.key !== layKey) showLayouts(rn.key);
    tools.update();
    renderer.render(scene, camera);
    return;
  }
  // Free cursor: resting near the left or right edge keeps turning, so you can spin all the way round.
  let edge = 0;
  // Over a panel (or locked / touch), ease the view back to straight ahead.
  if (!(playing && !locked && !touch && mouse.over) && !arranging()) { aim.tx = 0; aim.ty = 0; }
  const lk = 1 - Math.exp(-dt * 7);
  aim.x += (aim.tx - aim.x) * lk; aim.y += (aim.ty - aim.y) * lk;
  if (playing && !locked && !touch && mouse.over && !arranging()) {
    const nx = mouse.x / innerWidth * 2 - 1;
    edge = Math.sign(nx) * Math.max(0, Math.abs(nx) - 0.8) / 0.2;
    player.yaw -= Math.sign(edge) * edge * edge * 2.4 * dt;
  }
  edgeL.style.opacity = edge < 0 ? Math.min(1, -edge * 1.5) : 0;
  edgeR.style.opacity = edge > 0 ? Math.min(1, edge * 1.5) : 0;
  // Input → wish direction in the player's frame.
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyA || keys.ArrowLeft) s -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1;
  f -= joy.dy; s += joy.dx;
  if (!playing) f = s = 0;   // paused: the intro is up, keys do nothing
  const len = Math.hypot(f, s);
  const speed = (keys.ShiftLeft || keys.ShiftRight ? 3.0 : 1.55) * Math.min(1, len);
  if (len > 1) { f /= len; s /= len; }
  const viewYaw = player.yaw + aim.x;   // walk where you're looking
  const sinY = Math.sin(viewYaw), cosY = Math.cos(viewYaw);
  const wx = (-sinY * f + cosY * s) * speed, wz = (-cosY * f - sinY * s) * speed;
  const k = 1 - Math.exp(-dt * 10);
  player.vx += (wx - player.vx) * k; player.vz += (wz - player.vz) * k;
  // Slide along walls: try each axis on its own.
  const nx = player.x + player.vx * dt, nz = player.z + player.vz * dt;
  if (free(nx, player.z)) player.x = nx; else player.vx = 0;
  if (free(player.x, nz)) player.z = nz; else player.vz = 0;

  const v = Math.hypot(player.vx, player.vz);
  if (len > 0.1 && Math.abs(aim.x) > 0.001) { const d = aim.x * Math.min(1, dt * 2.5); player.yaw += d; aim.x -= d; aim.tx -= d; }
  player.bob += v * dt * 5.2;
  camera.position.set(player.x, EYE + Math.sin(player.bob) * 0.022 * Math.min(1, v / 1.5), player.z);
  camera.rotation.set(clamp(player.pitch + aim.y, -1.35, 1.35), viewYaw, 0);
  // Debug: window.__walk3d.top = true shows the whole flat from above (ceiling off).
  const top = window.__walk3d && window.__walk3d.top;
  home.ceilGroup.visible = world.towerAbove.visible = !top;
  if (top) { camera.position.set(7.1, 17, 5.2); camera.rotation.set(-Math.PI / 2, 0, 0); }

  const rn = roomAt(player.x, player.z);
  if (rn.name !== lastRoom) { roomEl.textContent = rn.name || 'E2-902'; roomEl.classList.remove('pop'); void roomEl.offsetWidth; roomEl.classList.add('pop'); lastRoom = rn.name; }
  if (rn.key !== layKey) showLayouts(rn.key);
  drawMap();
  tools.update();
  composer.render();
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); sizeMap();
});

renderer.compile(scene, camera);
document.body.classList.add('ready');
renderer.setAnimationLoop(frame);   // (setAnimationLoop also drives VR/AR frames)
window.__walk3d = { player, teleport, camera, renderer, scene, free, setRoomLayout, home, tools, xr };
