// Whole-Moon terrain from NASA LRO LOLA's global elevation map (LDEM, simple
// cylindrical). Used wherever the finer south-polar grids do not reach: the
// Apollo sites, Chandrayaan-3, the far side, the north pole.
//
// File format (built by tools/build_global_dem.mjs): int16 little-endian
// heights in metres above the 1737.4 km reference sphere, row 0 at +90° lat,
// column 0 at 0° E, cell centres at (r + 0.5) / ppd and (c + 0.5) / ppd.

import { MOON_RADIUS_M } from './geo.js';

export function createGlobalGrid(meta, heights) {
  const ppd = meta.ppd;
  const w = meta.width, h = meta.height;
  const data = heights instanceof Int16Array ? heights : new Int16Array(heights);
  if (data.length !== w * h) throw new Error(`global DEM: expected ${w * h} cells, got ${data.length}`);
  const cell = (MOON_RADIUS_M * Math.PI) / 180 / ppd; // metres per cell at the equator
  return {
    meta,
    cell,
    /** Bilinear height (m) at lat/lon (deg). */
    heightAt(lat, lon) {
      const fr = Math.min(h - 1.000001, Math.max(0, (90 - lat) * ppd - 0.5));
      let fc = ((((lon % 360) + 360) % 360) * ppd) - 0.5;
      if (fc < 0) fc += w;
      const r0 = Math.floor(fr), c0 = Math.floor(fc);
      const r1 = Math.min(h - 1, r0 + 1), c1 = (c0 + 1) % w;
      const tr = fr - r0, tc = fc - c0;
      const a = data[r0 * w + c0], b = data[r0 * w + c1], c = data[r1 * w + c0], d = data[r1 * w + c1];
      return (a * (1 - tc) + b * tc) * (1 - tr) + (c * (1 - tc) + d * tc) * tr;
    },
  };
}

/** Fetch the shipped global grid; resolves to null when it is not there (yet). */
export async function loadGlobalDem(baseUrl) {
  try {
    const metaRes = await fetch(`${baseUrl}/global_dem.json`);
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const binRes = await fetch(`${baseUrl}/global_dem.bin`);
    if (!binRes.ok) return null;
    return createGlobalGrid(meta, new Int16Array(await binRes.arrayBuffer()));
  } catch {
    return null;
  }
}

// The app shares one loaded grid.
let shared = null;
export const setGlobalDem = (g) => { shared = g; };
export const getGlobalDem = () => shared;
