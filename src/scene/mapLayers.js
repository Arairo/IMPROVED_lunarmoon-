// Whole-Moon map layers drawn over the 3D globe.
//
// Sunlight and Earth-in-view come from public/data/layers.{bin,json}
// (tools/build_map_layers.mjs: real LOLA skylines, Sun and Earth every 6 h
// through 2027): 1° cells everywhere, 5 km cells inside ~14° of each pole.
// Height and slope come from the LOLA global grid (public/data/global_dem.*).

import { getGlobalDem, loadGlobalDem, setGlobalDem } from '../core/globalDem.js';

const R = 1737400;
const DEG = Math.PI / 180;
const CAP_LAT = 76; // use the 5 km polar grids poleward of this

let cache = null;
export async function loadLayers(baseUrl) {
  if (cache) return cache;
  const [meta, buf] = await Promise.all([
    fetch(`${baseUrl}/layers.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`layers.json ${r.status}`)))),
    fetch(`${baseUrl}/layers.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`layers.bin ${r.status}`)))),
  ]);
  cache = parseLayers(meta, new Uint8Array(buf));
  return cache;
}

export function parseLayers(meta, bytes) {
  const G = meta.global.width * meta.global.height;
  const C = meta.south.size * meta.south.size;
  const sizes = { 'global.sun': G, 'global.earth': G, 'south.sun': C, 'south.earth': C, 'north.sun': C, 'north.earth': C };
  const out = { meta, global: {}, south: {}, north: {} };
  let o = 0;
  for (const key of meta.order) {
    const [grid, kind] = key.split('.');
    out[grid][kind] = bytes.subarray(o, o + sizes[key]);
    o += sizes[key];
  }
  return out;
}

function bilinear(arr, w, h, fc, fr, wrap) {
  let c0 = Math.floor(fc), r0 = Math.floor(fr);
  const tc = fc - c0, tr = fr - r0;
  r0 = Math.max(0, Math.min(h - 2, r0));
  const cl = (c) => (wrap ? ((c % w) + w) % w : Math.max(0, Math.min(w - 1, c)));
  const c1 = cl(c0 + 1);
  c0 = cl(c0);
  const v = (r, c) => arr[r * w + c];
  return ((v(r0, c0) * (1 - tc) + v(r0, c1) * tc) * (1 - tr) + (v(r0 + 1, c0) * (1 - tc) + v(r0 + 1, c1) * tc) * tr) / 2;
}

/** Percent of 2027 with the Sun's ('sun') or Earth's ('earth') centre above the skyline. */
export function layerPercent(layers, kind, lat, lon) {
  if (Math.abs(lat) >= CAP_LAT) {
    const grid = lat < 0 ? layers.south : layers.north;
    const m = lat < 0 ? layers.meta.south : layers.meta.north;
    const rho = 2 * R * Math.tan((90 - Math.abs(lat)) * DEG / 2);
    const x = rho * Math.sin(lon * DEG);
    const y = (lat < 0 ? 1 : -1) * rho * Math.cos(lon * DEG);
    const n = m.size, half = m.halfExtentM, cell = m.cellM;
    return bilinear(grid[kind], n, n, (x + half) / cell - 0.5, (half - y) / cell - 0.5, false);
  }
  const g = layers.meta.global;
  return bilinear(layers.global[kind], g.width, g.height, lon + 180 - 0.5, 90 - lat - 0.5, true);
}

/** Average ground slope (degrees) over one global-grid cell either side (~4 km). */
export function slopeAt(dem, lat, lon) {
  const d = 1 / 8; // global grid step, degrees
  const m = d * DEG * R;
  const cl = Math.max(Math.cos(lat * DEG), 0.05);
  const dzx = (dem.heightAt(lat, lon + d) - dem.heightAt(lat, lon - d)) / (2 * m * cl);
  const dzy = (dem.heightAt(Math.min(lat + d, 90), lon) - dem.heightAt(Math.max(lat - d, -90), lon)) / (2 * m);
  return Math.atan(Math.hypot(dzx, dzy)) / DEG;
}

const lerp = (a, b, t) => a + (b - a) * t;
function ramp(stops, v) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [v0, c0] = stops[i - 1], [v1, c1] = stops[i];
      const t = (v - v0) / (v1 - v0);
      return c0.map((x, k) => Math.round(lerp(x, c1[k], t)));
    }
  }
  return stops[stops.length - 1][1];
}

// [value, [r, g, b, a]]
export const LAYERS = [
  {
    id: 'sun', label: 'Sunlight', unit: '%', sub: 'Share of 2027 in sunlight, with real terrain',
    stops: [[0, [20, 16, 60, 215]], [15, [76, 29, 149, 205]], [35, [217, 70, 39, 200]], [50, [245, 158, 11, 205]], [70, [253, 224, 71, 215]], [85, [254, 252, 232, 225]]],
    note: 'Most of the Moon gets ~50%: two weeks of day, two of night. Only polar ridges do better; crater floors near the poles get none.',
  },
  {
    id: 'earth', label: 'Earth in view', unit: '%', sub: 'Share of 2027 with Earth above the skyline',
    stops: [[0, [10, 14, 30, 200]], [5, [30, 41, 90, 200]], [40, [14, 116, 196, 200]], [80, [56, 189, 248, 205]], [100, [224, 242, 254, 215]]],
    note: 'The near side always sees Earth, the far side never does. Near the limb and at the poles, libration and terrain decide.',
  },
  {
    id: 'shadow', label: 'Never sunlit (2027)', unit: '', sub: 'Polar areas with no sunlight all year (5 km cells)',
    stops: [[0, [139, 92, 246, 235]]],
    note: 'Cells whose centre saw no Sun in 2027: candidates for permanently shadowed regions, where water ice can survive. Small cold traps are finer than these 5 km cells.',
  },
  {
    id: 'height', label: 'Height', unit: ' km', sub: 'LOLA elevation above the 1737.4 km sphere',
    stops: [[-9, [30, 27, 75, 205]], [-4, [37, 99, 235, 200]], [-1, [125, 211, 252, 190]], [0, [240, 240, 235, 185]], [2, [190, 160, 110, 195]], [5, [146, 64, 14, 205]], [10, [254, 243, 199, 215]]],
    note: 'The far-side South Pole–Aitken basin is the deep blue; the highest ground is on the far-side highlands.',
  },
  {
    id: 'slope', label: 'Slope', unit: '°', sub: 'Average ground slope over ~4 km (LOLA global grid)',
    stops: [[0, [22, 101, 52, 170]], [3, [74, 222, 128, 180]], [8, [250, 204, 21, 195]], [15, [234, 88, 12, 205]], [25, [190, 18, 60, 215]]],
    note: 'Landers usually need under ~10–15° under their legs. This map averages over kilometres, so local slopes can be much steeper.',
  },
];

export function layerValue(id, layers, dem, lat, lon) {
  if (id === 'sun' || id === 'earth') return layers ? layerPercent(layers, id, lat, lon) : null;
  if (id === 'shadow') {
    if (!layers || Math.abs(lat) < CAP_LAT - 6) return null;
    return layerPercent(layers, 'sun', lat, lon);
  }
  if (!dem) return null;
  if (id === 'height') return dem.heightAt(lat, lon) / 1000;
  if (id === 'slope') return slopeAt(dem, lat, lon);
  return null;
}

/** Equirectangular RGBA canvas (lon -180..180 left to right, lat +90 at top). */
export function renderLayerCanvas(id, layers, dem, width = 2048) {
  const def = LAYERS.find((l) => l.id === id);
  const w = width, h = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const px = img.data;
  for (let r = 0; r < h; r++) {
    const lat = 90 - ((r + 0.5) / h) * 180;
    for (let c = 0; c < w; c++) {
      const lon = -180 + ((c + 0.5) / w) * 360;
      const v = layerValue(id, layers, dem, lat, lon);
      let rgba = [0, 0, 0, 0];
      if (id === 'shadow') { if (v != null && v < 0.25) rgba = def.stops[0][1]; }
      else if (v != null && Number.isFinite(v)) rgba = ramp(def.stops, v);
      const i = (r * w + c) * 4;
      px[i] = rgba[0]; px[i + 1] = rgba[1]; px[i + 2] = rgba[2]; px[i + 3] = rgba[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function legendGradient(id) {
  const def = LAYERS.find((l) => l.id === id);
  if (def.stops.length < 2) return `rgba(${def.stops[0][1].slice(0, 3).join(',')},1)`;
  const lo = def.stops[0][0], hi = def.stops[def.stops.length - 1][0];
  return `linear-gradient(90deg, ${def.stops.map(([v, c]) => `rgb(${c.slice(0, 3).join(',')}) ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(', ')})`;
}

export async function ensureDem(baseUrl) {
  let dem = getGlobalDem();
  if (!dem) { dem = await loadGlobalDem(baseUrl); if (dem) setGlobalDem(dem); }
  return dem;
}
