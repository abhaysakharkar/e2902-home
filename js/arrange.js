import * as THREE from 'three';
import { ROOMS, LAYOUTS } from './plan.js';
import { LETTERS } from './layouts.js';
import { objKey, findObj, loadCustoms, saveCustoms } from './design.js';

// Arrange: pick a piece, place it precisely, and save a room's arrangement as a custom layout.
// Shared by the studio and the walk. The page passes hooks for the parts that differ:
//   moved()            Map of moved objects → original [x, z, rotY]
//   markMoved(obj)     remember obj's original position before it first moves
//   setLayout(room, i) switch a room's base layout (A/B/C)
//   layoutOf(room)     the room's current base layout index
//   commit()           persist (shared design, undo, collision…)
//   roomHint()         the room to show when nothing is selected

const PI = Math.PI;
const STEP = 0.05;
export const isLayoutGroup = (o) => o && o.isGroup && /^[a-z]+:\d$/.test(o.name) && !o.name.startsWith('fit:');
export function furnitureRoot(o) {
  while (o && o.parent && !isLayoutGroup(o.parent)) o = o.parent;
  return o && isLayoutGroup(o.parent) ? o : null;
}
// The piece you picked plus its own parts: a wardrobe's handles, a table's legs, the lamp on a side table,
// the leaves of a plant. Neighbours that merely touch it (a chair by a plant) stay put, and a rug never drags the sofa.
const _sz = new THREE.Vector3(), _p = new THREE.Vector3(), _inv = new THREE.Matrix4();
// An object's box in its own (unrotated) frame, so turned pieces aren't judged by an oversized world box.
function localBox(o) {
  if (o.isMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); return o.geometry.boundingBox; }
  const pos = o.position.clone(), rot = o.rotation.clone(), par = o.parent;
  o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.parent = null; o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  o.position.copy(pos); o.rotation.copy(rot); o.parent = par; o.updateMatrixWorld(true);
  return b;
}
// Is a world point over this object's own footprint (plus a margin)?
function over(o, lb, p, m) {
  _p.copy(p).applyMatrix4(_inv.copy(o.matrixWorld).invert());
  return _p.x >= lb.min.x - m && _p.x <= lb.max.x + m && _p.z >= lb.min.z - m && _p.z <= lb.max.z + m;
}
export function clusterOf(picked) {
  const sibs = picked.parent.children.filter((c) => c.visible);
  picked.parent.updateMatrixWorld(true);
  const box = new Map(sibs.map((s) => [s, new THREE.Box3().setFromObject(s)]));
  const local = new Map();
  const lb = (s) => { if (!local.has(s)) local.set(s, localBox(s)); return local.get(s); };
  // Rugs and mats: thin, on the floor and big (a lamp's base is thin too, but small).
  const flat = (s) => { const b = box.get(s); return b.max.y - b.min.y < 0.05 && b.min.y < 0.06 && (b.max.x - b.min.x) * (b.max.z - b.min.z) > 0.5; };
  const centre = (s) => box.get(s).getCenter(new THREE.Vector3());
  if (flat(picked)) return [picked];
  // Two parts belong to the same piece when they touch and one sits over the other's own footprint
  // (legs under a top, a vase on it, handles on a wardrobe face, a lamp's base, pole and shade).
  const joined = (a, b) => {
    if (!box.get(a).clone().expandByScalar(0.02).intersectsBox(box.get(b))) return false;
    return over(a, lb(a), centre(b), 0.02) || over(b, lb(b), centre(a), 0.02);
  };
  const out = [picked], seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    for (const s of sibs) if (!seen.has(s) && !flat(s) && joined(out[i], s)) { seen.add(s); out.push(s); }
  }
  return out;
}
const roomName = (key) => ROOMS.find((r) => r.key === key)?.name || key;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cm = (m) => `${Math.round(m * 100)}`;

export function createArrange({ scene, home, body, hooks }) {
  let sel = null;            // array of objects (one piece and what touches it)
  let selRoom = null;
  const helper = new THREE.Box3Helper(new THREE.Box3(), 0xffd27a); helper.visible = false; scene.add(helper);
  home._hidden ||= new Set();
  home._custom ||= {};

  // ---------------------------------------------------------------- selection + moves
  const boxOf = (objs) => { const b = new THREE.Box3(); objs.forEach((o) => b.expandByObject(o)); return b; };
  function select(root) {
    sel = root ? clusterOf(root) : null;
    selRoom = root ? root.parent.name.split(':')[0] : null;
    refreshBox(); render();
  }
  function refreshBox() { if (!sel) { helper.visible = false; return; } helper.box.copy(boxOf(sel)); helper.visible = true; }
  function touch() { for (const o of sel) hooks.markMoved(o); }
  function moveBy(dx, dz) { if (!sel) return; touch(); for (const o of sel) { o.position.x += dx; o.position.z += dz; } changed(); }
  function rotate(a) {
    if (!sel) return; touch();
    const c = boxOf(sel).getCenter(new THREE.Vector3());
    const cs = Math.cos(a), sn = Math.sin(a);
    for (const o of sel) {
      const x = o.position.x - c.x, z = o.position.z - c.z;
      o.position.x = c.x + x * cs + z * sn; o.position.z = c.z - x * sn + z * cs;
      o.rotation.y += a;
    }
    changed();
  }
  // Room rectangle around the piece, for wall gaps and "against wall".
  function rectOf() {
    if (!sel) return null;
    const c = boxOf(sel).getCenter(new THREE.Vector3());
    for (const r of ROOMS) for (const rc of r.rects) if (c.x >= rc[0] && c.x <= rc[2] && c.z >= rc[1] && c.z <= rc[3]) return rc;
    return ROOMS.find((r) => r.key === selRoom)?.rects[0] || null;
  }
  function gaps() {
    const b = boxOf(sel), rc = rectOf();
    if (!rc) return null;
    return { N: b.min.z - rc[1], S: rc[3] - b.max.z, W: b.min.x - rc[0], E: rc[2] - b.max.x, w: b.max.x - b.min.x, d: b.max.z - b.min.z };
  }
  function againstWall() {
    const g = gaps(); if (!g) return;
    const side = Object.entries({ N: g.N, S: g.S, W: g.W, E: g.E }).sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0][0];
    const gap = 0.01;
    ({ N: () => moveBy(0, -(g.N - gap)), S: () => moveBy(0, g.S - gap), W: () => moveBy(-(g.W - gap), 0), E: () => moveBy(g.E - gap, 0) })[side]();
  }
  function removeSel() {
    if (!sel) return;
    for (const o of sel) { o.visible = false; home._hidden.add(o); }
    select(null); hooks.commit();
  }
  function resetSel() {
    if (!sel) return;
    const m = hooks.moved();
    for (const o of sel) { const p = m.get(o); if (p) { o.position.x = p[0]; o.position.z = p[1]; o.rotation.y = p[2]; } }
    changed();
  }
  function restoreRemoved(room) {
    for (const o of [...home._hidden]) if (!room || o.parent.name.startsWith(room + ':')) { o.visible = true; home._hidden.delete(o); }
    hooks.commit(); render();
  }
  let pending = null;
  function changed() { refreshBox(); render(); clearTimeout(pending); pending = setTimeout(hooks.commit, 250); }

  // ---------------------------------------------------------------- custom layouts
  function roomGroups(room) { return home.layouts[room] || []; }
  function resetRoom(room) {
    // Put the room's moved pieces back and bring back removed ones.
    const m = hooks.moved();
    for (const g of roomGroups(room)) for (const o of g.children) {
      const p = m.get(o); if (p) { o.position.x = p[0]; o.position.z = p[1]; o.rotation.y = p[2]; m.delete(o); }
      if (home._hidden.has(o)) { o.visible = true; home._hidden.delete(o); }
    }
  }
  function saveCustom(room, name, id) {
    const base = hooks.layoutOf(room);
    const g = roomGroups(room)[base];
    const moves = {}, hidden = [];
    for (const o of g.children) {
      const k = objKey(o);
      if (hooks.moved().has(o)) moves[k] = [+o.position.x.toFixed(3), +o.position.z.toFixed(3), +o.rotation.y.toFixed(4)];
      if (home._hidden.has(o)) hidden.push(k);
    }
    const list = loadCustoms();
    const c = id ? list.find((x) => x.id === id) : null;
    if (c) Object.assign(c, { base, moves, hidden, at: Date.now(), name: name || c.name });
    else list.push({ id: 'c' + Date.now().toString(36), room, name: name || `My ${roomName(room).toLowerCase()}`, base, moves, hidden, at: Date.now() });
    saveCustoms(list);
    home._custom[room] = c ? c.id : list[list.length - 1].id;
    hooks.commit(); render();
    return home._custom[room];
  }
  function applyCustom(id) {
    const c = loadCustoms().find((x) => x.id === id);
    if (!c) return;
    resetRoom(c.room);
    hooks.setLayout(c.room, c.base);
    for (const [k, [x, z, r]] of Object.entries(c.moves || {})) {
      const o = findObj(home, k); if (!o) continue;
      hooks.markMoved(o); o.position.x = x; o.position.z = z; o.rotation.y = r;
    }
    for (const k of c.hidden || []) { const o = findObj(home, k); if (o) { o.visible = false; home._hidden.add(o); } }
    home._custom[c.room] = c.id;
    select(null); hooks.commit(); render(c.room);
  }
  function chooseBase(room, i) {
    resetRoom(room);
    hooks.setLayout(room, i);
    delete home._custom[room];
    select(null); hooks.commit(); render(room);
  }
  function deleteCustom(id) {
    const list = loadCustoms(), c = list.find((x) => x.id === id);
    if (!c || !confirm(`Delete the custom layout "${c.name}"?`)) return;
    saveCustoms(list.filter((x) => x !== c));
    if (home._custom[c.room] === id) { delete home._custom[c.room]; hooks.commit(); }
    render(c.room);
  }

  // ---------------------------------------------------------------- UI
  let shownRoom = null;
  function render(forceRoom) {
    const room = forceRoom || selRoom || hooks.roomHint() || shownRoom || 'living';
    shownRoom = room;
    const base = hooks.layoutOf(room), active = home._custom[room];
    const customs = loadCustoms().filter((c) => c.room === room);
    const activeC = customs.find((c) => c.id === active);
    const hiddenHere = [...home._hidden].filter((o) => o.parent.name.startsWith(room + ':')).length;
    const g = sel ? gaps() : null;
    const gapTxt = g ? ['N', 'S', 'W', 'E'].map((k) => `${k} <b class="${g[k] < 0.03 ? 'tight' : g[k] < 0.75 && g[k] >= 0.03 ? 'warn' : ''}">${g[k] < 0.03 ? '0' : cm(g[k])}</b>`).join(' · ') : '';
    body.innerHTML = `
      <div class="ar-room"><span>Arranging</span> <select class="ar-pick">${ROOMS.map((r) => `<option value="${r.key}" ${r.key === room ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>
      <div class="ar-lays">
        ${LAYOUTS[room].map((n, i) => `<button class="${!activeC && i === base ? 'on' : ''}" data-base="${i}" title="${esc(n)}"><i>${LETTERS[i]}</i>${esc(n)}</button>`).join('')}
        ${customs.map((c) => `<span class="ar-c ${c.id === active ? 'on' : ''}"><button data-cid="${c.id}" title="Based on ${LETTERS[c.base]}"><i>★</i>${esc(c.name)}</button><button class="ar-del" data-del="${c.id}" title="Delete">×</button></span>`).join('')}
      </div>
      ${sel ? `
      <div class="ar-sel">
        <p class="ar-h">Selected piece <small>${cm(g.w)} × ${cm(g.d)} cm</small></p>
        <p class="ar-gaps">Gap to walls (cm): ${gapTxt}</p>
        <div class="ar-pad">
          <button data-a="w" title="West 5 cm">←</button><button data-a="n" title="North 5 cm">↑</button><button data-a="s" title="South 5 cm">↓</button><button data-a="e" title="East 5 cm">→</button>
          <button data-a="ccw" title="Turn 15° left">⟲15°</button><button data-a="cw" title="Turn 15° right">⟳15°</button><button data-a="r90" title="Turn 90°">↻90°</button>
        </div>
        <div class="ar-row"><button data-a="wall">Against wall</button><button data-a="reset">Reset piece</button><button data-a="del" class="danger">Remove</button><button data-a="done">Done</button></div>
      </div>` : `<p class="ar-hint">${hooks.pickHint || 'Click a piece of furniture to pick it up.'}</p>`}
      ${hiddenHere ? `<p class="ar-removed">${hiddenHere} piece${hiddenHere > 1 ? 's' : ''} removed here · <button data-a="restore">Bring back</button></p>` : ''}
      <div class="ar-save">
        <input class="ar-name" maxlength="32" placeholder="Name this arrangement" value="${activeC ? esc(activeC.name) : ''}">
        <div>${activeC ? `<button class="tl-btn" data-a="update">Update “${esc(activeC.name)}”</button><button class="tl-btn ghost" data-a="saveas">Save as new</button>` : '<button class="tl-btn" data-a="saveas">Save as custom layout</button>'}</div>
      </div>
      <p class="tl-note">Custom layouts keep the base layout plus where each piece sits and what you removed. They show up on every page, next to A/B/C.</p>`;
    body.querySelector('.ar-pick').addEventListener('change', (e) => { select(null); render(e.target.value); });
    body.querySelectorAll('[data-base]').forEach((b) => b.addEventListener('click', () => chooseBase(room, +b.dataset.base)));
    body.querySelectorAll('[data-cid]').forEach((b) => b.addEventListener('click', () => applyCustom(b.dataset.cid)));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteCustom(b.dataset.del)));
    const name = () => body.querySelector('.ar-name').value.trim();
    const act = {
      w: () => moveBy(-STEP, 0), e: () => moveBy(STEP, 0), n: () => moveBy(0, -STEP), s: () => moveBy(0, STEP),
      ccw: () => rotate(PI / 12), cw: () => rotate(-PI / 12), r90: () => rotate(PI / 2),
      wall: againstWall, reset: resetSel, del: removeSel, done: () => select(null), restore: () => restoreRemoved(room),
      saveas: () => saveCustom(room, name()), update: () => saveCustom(room, name(), active),
    };
    body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act[b.dataset.a]()));
  }
  render();

  return {
    select, render, moveBy, rotate, applyCustom, chooseBase, refreshBox,
    get selection() { return sel; },
    get room() { return shownRoom; },
    // After the page moves the selection itself (drag), refresh the box and gaps.
    dragged() { if (sel) { refreshBox(); render(); } },
  };
}
