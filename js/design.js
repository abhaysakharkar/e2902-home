import { SLOTS, BY_ID, applySwatch } from '../studio/swatches.js';

// One design shared by the scroll page, the walk and the studio.
// The studio writes it; the other pages read it on load and follow live changes from other tabs.
//   slots: surface → swatch id (materials)
//   moves: furniture key → [x, z, rotationY] for pieces dragged in the studio
// Layouts (A/B/C) live in js/layouts.js and fit-check pieces in js/tools.js; both are already shared.
export const DESIGN_KEY = 'e2902-design';

export function loadDesign() { try { return JSON.parse(localStorage.getItem(DESIGN_KEY)) || null; } catch { return null; } }
export function saveDesign(d) { try { localStorage.setItem(DESIGN_KEY, JSON.stringify(d)); } catch { /* storage off */ } }
export function clearDesign() { try { localStorage.removeItem(DESIGN_KEY); } catch { /* storage off */ } }

// A piece of furniture is identified by its layout group and its place in the build order, which is fixed.
const isLayout = (g) => g && /^[a-z]+:\d$/.test(g.name) && !g.name.startsWith('fit:');
export function objKey(o) { return isLayout(o.parent) ? `${o.parent.name}/${o.parent.children.indexOf(o)}` : null; }
export function findObj(home, key) {
  const [gname, idx] = key.split('/');
  const [room, i] = gname.split(':');
  return home.layouts[room]?.[+i]?.children[+idx] || null;
}

const resolve = (home, k) => (k.startsWith('K.') ? home.K : home.M)[k.slice(2)];

// Apply a design to a home built by buildHome. Safe to call again with a newer design.
export function applyDesign(home, d) {
  if (!d) return false;
  for (const s of SLOTS) {
    const sw = BY_ID[d.slots?.[s.key]];
    if (!sw || !s.allow.includes(sw.cat) || home._slots?.[s.key] === sw.id) continue;
    for (const k of s.mats) applySwatch(resolve(home, k), sw, s.tile);
    (home._slots ||= {})[s.key] = sw.id;
  }
  // Put earlier moves back, then apply the current ones.
  home._moved ||= new Map();
  for (const [o, [x, z, r]] of home._moved) { o.position.x = x; o.position.z = z; o.rotation.y = r; }
  home._moved.clear();
  for (const [key, [x, z, r]] of Object.entries(d.moves || {})) {
    const o = findObj(home, key);
    if (!o) continue;
    home._moved.set(o, [o.position.x, o.position.z, o.rotation.y]);
    o.position.x = x; o.position.z = z; o.rotation.y = r;
  }
  // Pieces removed in a custom arrangement.
  home._hidden ||= new Set();
  for (const o of home._hidden) o.visible = true;
  home._hidden.clear();
  for (const key of d.hidden || []) { const o = findObj(home, key); if (o) { o.visible = false; home._hidden.add(o); } }
  home._custom = { ...(d.custom || {}) };   // room → id of the custom layout in use
  return true;
}

// ---------------------------------------------------------------- custom layouts
// Saved arrangements of a room: a base layout (A/B/C) plus moved and removed pieces.
export const CUSTOM_KEY = 'e2902-custom';
export function loadCustoms() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; } catch { return []; } }
export function saveCustoms(list) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* storage off */ } }

// Call fn whenever another tab changes the shared design, layouts or fit-check pieces.
export function onDesignChange(fn) {
  addEventListener('storage', (e) => { if (['e2902-design', 'e2902-layouts', 'e2902-fit', 'e2902-custom'].includes(e.key)) fn(e.key); });
}
