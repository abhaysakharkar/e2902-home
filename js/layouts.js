import { LAYOUTS } from './plan.js';

// Remembers which layout each room shows. Shared by the scroll page and the walk,
// so a choice made in one shows up in the other. Browser storage only; safe to lose.
const KEY = 'e2902-layouts';

export function loadChoices() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function saveChoices(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode: fine */ }
}
export function applyChoices(home) {
  const c = loadChoices();
  for (const k of Object.keys(LAYOUTS)) home.setLayout(k, c[k] | 0);
  return c;
}
export function choose(home, room, i) {
  const c = loadChoices();
  c[room] = i;
  saveChoices(c);
  home.setLayout(room, i);
}
export const LETTERS = ['A', 'B', 'C'];
