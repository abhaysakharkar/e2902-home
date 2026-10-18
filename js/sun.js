import * as THREE from 'three';

// Where the sun really is over E2-902.
// Site: Palladio Kharadi Central II, Kharadi, Pune. North: the drawings' compass points 26.3° clockwise
// from the top of the sheet (both the dimension drawing and the electrical layout agree).
export const SITE = { lat: 18.5515, lon: 73.9476, tz: 5.5, north: 26.3 };

const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;

function dayOfYear(y, m, d) {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// NOAA's solar position equations. date = {y, m, d}; hour = local clock time (IST), decimal hours.
// Returns elevation and azimuth (degrees, azimuth clockwise from true north) plus sunrise, solar noon and sunset (local hours).
export function solar(date, hour, site = SITE) {
  const N = dayOfYear(date.y, date.m, date.d);
  const leap = (date.y % 4 === 0 && date.y % 100 !== 0) || date.y % 400 === 0;
  const g = 2 * Math.PI / (leap ? 366 : 365) * (N - 1 + (hour - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = rad(site.lat);
  const tst = hour * 60 + eqt + 4 * site.lon - 60 * site.tz;   // true solar time, minutes
  const ha = rad(tst / 4 - 180);
  const cz = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  const az = (deg(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat))) + 180 + 360) % 360;
  const cosH0 = Math.cos(rad(90.833)) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const H0 = deg(Math.acos(Math.max(-1, Math.min(1, cosH0))));
  const toLocal = (minUTC) => (minUTC / 60 + site.tz + 24) % 24;
  return {
    el: 90 - deg(zen), az,
    sunrise: toLocal(720 - 4 * (site.lon + H0) - eqt),
    noon: toLocal(720 - 4 * site.lon - eqt),
    sunset: toLocal(720 - 4 * (site.lon - H0) - eqt),
  };
}

// Unit vector towards the sun in model space (x right on the sheet, z down the sheet, y up).
export function sunVector(el, az, site = SITE, out = new THREE.Vector3()) {
  const f = rad(site.north);
  const north = [Math.sin(f), -Math.cos(f)], east = [Math.cos(f), Math.sin(f)];
  const ce = Math.cos(rad(el)), a = rad(az);
  return out.set(ce * (Math.sin(a) * east[0] + Math.cos(a) * north[0]), Math.sin(rad(el)), ce * (Math.sin(a) * east[1] + Math.cos(a) * north[1]));
}

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (az) => DIRS[Math.round(az / 22.5) % 16];
export const hhmm = (h) => { h = ((h % 24) + 24) % 24; let hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh++; mm = 0; } return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
export function today() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; }
export const dateStr = (dt) => `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return y && m && d ? { y, m, d } : null; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const niceDate = (dt) => `${dt.d} ${MON[dt.m - 1]}`;
