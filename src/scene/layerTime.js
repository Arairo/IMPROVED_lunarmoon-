// Map layers for a moment or a window: every map cell keeps its terrain skyline
// (public/data/layer_skylines.*, built by tools/build_map_layers.mjs), so the
// browser can test the Sun and Earth against all ~130,000 cells at once.
//   nowState(...)    -> which cells see the Sun / Earth at one instant
//   windowShare(...) -> share of a window (e.g. your 30 days) with Sun / Earth / both
// Cells and their order match layers.json: global 1° grid, then the south and
// north 5 km polar caps.

import { moonFixedState } from '../core/ephemeris.js';

const R = 1737400;
const DEG = Math.PI / 180;
export const CAP_LAT = 75.2;

/** Cell centres and local east/north/up vectors, in the same order as the layer files. */
export function buildCells(meta) {
  const g = meta.global, cap = meta.south;
  const G = g.width * g.height, C = cap.size * cap.size;
  const n = G + 2 * C;
  const lat = new Float32Array(n), lon = new Float32Array(n);
  let k = 0;
  for (let r = 0; r < g.height; r++) for (let c = 0; c < g.width; c++) { lat[k] = 89.5 - r; lon[k] = -179.5 + c; k++; }
  for (const sgn of [-1, 1]) {
    const half = cap.halfExtentM, cell = cap.cellM;
    for (let r = 0; r < cap.size; r++) for (let c = 0; c < cap.size; c++) {
      const x = -half + (c + 0.5) * cell, y = half - (r + 0.5) * cell;
      const rho = Math.hypot(x, y);
      const colat = 2 * Math.atan(rho / (2 * R));
      lon[k] = Math.atan2(x, sgn < 0 ? y : -y) / DEG;
      lat[k] = sgn * (90 - colat / DEG);
      k++;
    }
  }
  const up = new Float32Array(3 * n), east = new Float32Array(2 * n), north = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const cl = Math.cos(lat[i] * DEG), sl = Math.sin(lat[i] * DEG), co = Math.cos(lon[i] * DEG), so = Math.sin(lon[i] * DEG);
    up[3 * i] = cl * co; up[3 * i + 1] = cl * so; up[3 * i + 2] = sl;
    east[2 * i] = -so; east[2 * i + 1] = co;
    north[3 * i] = -sl * co; north[3 * i + 1] = -sl * so; north[3 * i + 2] = cl;
  }
  return { n, G, C, lat, lon, up, east, north, meta };
}

export function parseSkylines(json, bytes) {
  return { az: json.azimuths, step: json.stepDeg, data: bytes instanceof Int8Array ? bytes : new Int8Array(bytes.buffer ?? bytes) };
}

/** Is a direction (unit vector, or a position with `parallax`) above cell i's skyline? */
function above(cells, sky, i, vx, vy, vz, parallax) {
  const { up, east, north } = cells;
  let dx = vx, dy = vy, dz = vz;
  const ux = up[3 * i], uy = up[3 * i + 1], uz = up[3 * i + 2];
  if (parallax) { dx -= ux * R; dy -= uy * R; dz -= uz * R; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L; }
  const s = dx * ux + dy * uy + dz * uz;
  if (s < -0.5) return false; // far below any skyline
  const el = Math.asin(s) / DEG;
  const e = dx * east[2 * i] + dy * east[2 * i + 1];
  const nn = dx * north[3 * i] + dy * north[3 * i + 1] + dz * north[3 * i + 2];
  let az = Math.atan2(e, nn) / DEG;
  if (az < 0) az += 360;
  const A = sky.az, f = (az / 360) * A, i0 = Math.floor(f) % A, i1 = (i0 + 1) % A, t = f - Math.floor(f);
  const base = i * A;
  const h = (sky.data[base + i0] * (1 - t) + sky.data[base + i1] * t) * sky.step;
  return el > h;
}

function dirs(ms) {
  const st = moonFixedState(ms);
  const sl = Math.hypot(...st.sun);
  return { sun: st.sun.map((v) => v / sl), earth: st.earth };
}

/** Bit 1 = Sun's centre above the skyline, bit 2 = Earth's centre above it. */
export function nowState(cells, sky, ms, out = new Uint8Array(cells.n)) {
  const { sun, earth } = dirs(ms);
  for (let i = 0; i < cells.n; i++) {
    out[i] = (above(cells, sky, i, sun[0], sun[1], sun[2], false) ? 1 : 0) | (above(cells, sky, i, earth[0], earth[1], earth[2], true) ? 2 : 0);
  }
  return out;
}

/** Share of [startMs, startMs + days) with the Sun, Earth and both up, as uint8 = percent x 2. */
export async function windowShare(cells, sky, startMs, days, { stepHours = 6, onProgress, isCancelled } = {}) {
  const steps = Math.max(1, Math.round((days * 24) / stepHours));
  const ns = new Uint16Array(cells.n), ne = new Uint16Array(cells.n), nb = new Uint16Array(cells.n);
  const st = new Uint8Array(cells.n);
  for (let k = 0; k < steps; k++) {
    nowState(cells, sky, startMs + k * stepHours * 3600000, st);
    for (let i = 0; i < cells.n; i++) { const v = st[i]; if (v & 1) ns[i]++; if (v & 2) ne[i]++; if (v === 3) nb[i]++; }
    if (k % 8 === 7) {
      onProgress?.((k + 1) / steps);
      await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
      if (isCancelled?.()) return null;
    }
  }
  const pct = (a) => Uint8Array.from(a, (v) => Math.round((v / steps) * 200));
  return { sun: pct(ns), earth: pct(ne), both: pct(nb), steps };
}

/** Index of the map cell that holds a point (nearest cell, polar caps poleward of CAP_LAT). */
export function cellIndexAt(meta, lat, lon) {
  const g = meta.global, cap = meta.south;
  const G = g.width * g.height, C = cap.size * cap.size;
  if (Math.abs(lat) >= CAP_LAT) {
    const rho = 2 * R * Math.tan(((90 - Math.abs(lat)) * DEG) / 2);
    const x = rho * Math.sin(lon * DEG);
    const y = (lat < 0 ? 1 : -1) * rho * Math.cos(lon * DEG);
    const c = Math.min(cap.size - 1, Math.max(0, Math.floor((x + cap.halfExtentM) / cap.cellM)));
    const r = Math.min(cap.size - 1, Math.max(0, Math.floor((cap.halfExtentM - y) / cap.cellM)));
    return (lat < 0 ? G : G + C) + r * cap.size + c;
  }
  const r = Math.min(g.height - 1, Math.max(0, Math.floor(90 - lat)));
  const c = ((Math.floor(lon + 180) % g.width) + g.width) % g.width;
  return r * g.width + c;
}

/** For an equirectangular texture of `width` x width/2: the cell under every pixel. */
export function pixelCells(meta, width) {
  const h = width / 2;
  const idx = new Int32Array(width * h);
  for (let r = 0; r < h; r++) {
    const lat = 90 - ((r + 0.5) / h) * 180;
    for (let c = 0; c < width; c++) idx[r * width + c] = cellIndexAt(meta, lat, -180 + ((c + 0.5) / width) * 360);
  }
  return idx;
}

/** Paint per-cell values through a 256-entry RGBA lookup table. */
export function paintCells(canvas, pix, values, lut) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < pix.length; i++) px[i] = lut[values[pix[i]]];
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Little-endian packed RGBA lookup from a function value -> [r, g, b, a]. */
export function makeLut(fn) {
  const lut = new Uint32Array(256);
  for (let v = 0; v < 256; v++) { const [r, g, b, a] = fn(v); lut[v] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; }
  return lut;
}
