// Terrain horizon from LOLA elevation grids.
//
// The Moon has no atmosphere, so there is no refraction: the horizon at a site
// is purely geometric, the highest elevation angle at which terrain (or the
// curve of the sphere itself) cuts the sky in each direction. We march rays
// outward along great circles over the LOLA grids and keep the steepest angle.

import precomputedData from '../data/precomputedHorizons.js';
import { sampleDemHeight } from './dem.js';
import { MOON_RADIUS_M, RAD, destination, sphereHorizonDip, toSouthPolar } from './geo.js';
import { getGlobalDem } from './globalDem.js';

export const AZ_STEP_DEG = 0.5;
export const AZ_COUNT = Math.round(360 / AZ_STEP_DEG);
export const precomputedHorizons = precomputedData;

/** Wrap one south-polar stereographic int16 grid (see tools/build_polar_dem.py). */
export function createGrid(meta, heights) {
  const { halfExtent: half, cellSize: cell, size: n } = meta;
  const data = heights instanceof Int16Array ? heights : new Int16Array(heights);
  if (data.length !== n * n) throw new Error(`${meta.name}: expected ${n * n} cells, got ${data.length}`);
  const margin = half - 1.5 * cell;
  const noData = meta.noData ?? -32768;
  // Polar grids are centred on the pole; local 20 m tiles carry their own centre.
  const cx = meta.centreX ?? 0;
  const cy = meta.centreY ?? 0;
  return {
    meta,
    covers(x, y) {
      return Math.abs(x - cx) < margin && Math.abs(y - cy) < margin;
    },
    /** Bilinear height (m) at projected x/y, NaN on no-data; caller checks covers() first. */
    sample(x, y) {
      const fc = (x - cx + half) / cell - 0.5;
      const fr = (half - (y - cy)) / cell - 0.5;
      const c0 = Math.floor(fc);
      const r0 = Math.floor(fr);
      const tc = fc - c0;
      const tr = fr - r0;
      const i = r0 * n + c0;
      const h00 = data[i];
      const h01 = data[i + 1];
      const h10 = data[i + n];
      const h11 = data[i + n + 1];
      if (h00 === noData || h01 === noData || h10 === noData || h11 === noData) return NaN;
      return (h00 * (1 - tc) + h01 * tc) * (1 - tr) + (h10 * (1 - tc) + h11 * tc) * tr;
    },
  };
}

/**
 * Combine grids finest-first into one terrain sampler. The south-polar grids
 * win where they have data; `global` (a whole-Moon LOLA grid) fills the rest.
 */
export function createTerrain(grids, global = null) {
  const ordered = [...grids].sort((a, b) => a.meta.cellSize - b.meta.cellSize);
  return {
    grids: ordered,
    global,
    /** { height, cell } at lat/lon, or null where no grid has data. */
    heightAt(lat, lon) {
      if (lat <= -60) {
        const { x, y } = toSouthPolar(lat, lon);
        for (const g of ordered) {
          if (!g.covers(x, y)) continue;
          const height = g.sample(x, y);
          if (!Number.isNaN(height)) return { height, cell: g.meta.cellSize };
        }
      }
      const gl = this.global || getGlobalDem();
      return gl ? { height: gl.heightAt(lat, lon), cell: gl.cell, global: true } : null;
    },
    coverageLabel(lat, lon) {
      const h = this.heightAt(lat, lon);
      if (!h) return null;
      const size = h.cell >= 1000 ? `${Number((h.cell / 1000).toFixed(1))} km` : `${Math.round(h.cell)} m`;
      return h.global ? `LOLA ${size} global grid` : `LOLA ${size} grid`;
    },
  };
}

/** Load the shipped grids in a browser (or any fetch-capable runtime). */
export async function loadTerrain(baseUrl, names = ['sp_fine', 'sp_coarse']) {
  const grids = await Promise.all(
    names.map(async (name) => {
      const [meta, buf] = await Promise.all([
        fetch(`${baseUrl}/${name}.json`).then((r) => {
          if (!r.ok) throw new Error(`${name}.json ${r.status}`);
          return r.json();
        }),
        fetch(`${baseUrl}/${name}.bin`).then((r) => {
          if (!r.ok) throw new Error(`${name}.bin ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      return createGrid(meta, new Int16Array(buf));
    }),
  );
  return createTerrain(grids);
}

/**
 * Horizon elevation profile at a site.
 * Returns { elevations: Float32Array(AZ_COUNT) in deg, distances (m to the
 * horizon-forming terrain), groundHeight, mastHeight, source }.
 * Without terrain data the profile is the bare-sphere dip for the mast height.
 */
/**
 * Highest terrain elevation angle (deg) seen from (lat, lon) looking along one
 * azimuth, and its distance (m). -90 when nothing is found.
 */
export function rayHorizon(terrain, lat, lon, az, { ground = terrain.heightAt(lat, lon), mastHeight = 2, maxDistM = 300000 } = {}) {
  if (!ground) return { el: -90, dist: 0 };
  const r0 = MOON_RADIUS_M + ground.height + mastHeight;
  const minStep = ground.cell / 2;
  let best = -90;
  let bestDist = 0;
  let s = Math.max(60, ground.cell * 0.75);
  while (s < maxDistM) {
    const p = destination(lat, lon, az, s);
    const h = terrain.heightAt(p.lat, p.lon);
    if (h) {
      const theta = s / MOON_RADIUS_M;
      const r1 = MOON_RADIUS_M + h.height;
      const el = Math.atan2(r1 * Math.cos(theta) - r0, r1 * Math.sin(theta)) * RAD;
      if (el > best) { best = el; bestDist = s; }
    } else if (s > 20000) break; // walked off the grids
    s += Math.max(minStep, s * 0.015);
  }
  return { el: best, dist: bestDist };
}

export function computeHorizon(terrain, lat, lon, { mastHeight = 2, maxDistM = 300000, azStepDeg = AZ_STEP_DEG } = {}) {
  const count = Math.round(360 / azStepDeg);
  const elevations = new Float32Array(count);
  const distances = new Float32Array(count);
  const ground = terrain?.heightAt(lat, lon) ?? null;
  const dip = sphereHorizonDip(mastHeight);
  if (!ground) {
    elevations.fill(dip);
    distances.fill(Math.sqrt(2 * MOON_RADIUS_M * mastHeight));
    return { elevations, distances, groundHeight: 0, mastHeight, source: 'smooth sphere (no terrain data)', terrain: false };
  }
  for (let i = 0; i < count; i++) {
    const r = rayHorizon(terrain, lat, lon, i * azStepDeg, { ground, mastHeight, maxDistM });
    elevations[i] = r.el > -90 ? r.el : dip;
    distances[i] = r.dist;
  }
  return {
    elevations,
    distances,
    groundHeight: ground.height,
    mastHeight,
    source: terrain.coverageLabel(lat, lon),
    terrain: true,
  };
}

// Full-resolution terrain shared by the app once loaded (240 m / 1 km polar
// grids + whole-Moon LOLA). Until then, unlisted points use the compact grid.
let sharedTerrain = null;
export const setSharedTerrain = (t) => { sharedTerrain = t; };
export const getSharedTerrain = () => sharedTerrain;

/**
 * Average ground slope (deg) at a site from central differences over one cell
 * either side, with the baseline used; null where there is no terrain.
 */
export function groundSlope(lat, lon, terrain = sharedTerrain) {
  const c = terrain?.heightAt(lat, lon);
  if (!c) return null;
  const d = Math.max(c.cell, 100);
  const h = (az) => terrain.heightAt(destination(lat, lon, az, d).lat, destination(lat, lon, az, d).lon)?.height;
  const n = h(0), sth = h(180), e = h(90), w = h(270);
  if ([n, sth, e, w].some((v) => v == null)) return null;
  const gx = (e - w) / (2 * d), gy = (n - sth) / (2 * d);
  return { slopeDeg: Math.atan(Math.hypot(gx, gy)) * RAD, baselineM: 2 * d, cell: c.cell };
}

/** Compute or look up compact 180-sample site horizon with mast adjustment. */
export function computeSiteHorizon(site, mastHeight = 2) {
  const pre = precomputedHorizons[site.id];
  const mastDelta = (mastHeight - 2) * 0.012;
  if (pre) {
    const el180 = pre.el180.map((v) => v - mastDelta);
    return {
      el180,
      groundHeight: pre.groundHeight,
      mastHeight,
      source: pre.source,
      terrain: pre.terrain,
    };
  }
  if (!pre && sharedTerrain && sharedTerrain.heightAt(site.lat, site.lon)) {
    const full = computeHorizon(sharedTerrain, site.lat, site.lon, { mastHeight, azStepDeg: 2 });
    return { el180: Array.from(full.elevations), groundHeight: Math.round(full.groundHeight), mastHeight, source: full.source, terrain: true };
  }
  const h0 = sampleDemHeight(site.lat, site.lon);
  const dip = sphereHorizonDip(mastHeight);
  if (h0 == null && getGlobalDem()) {
    // Outside the polar grid: ray-cast over the whole-Moon LOLA grid.
    const full = computeHorizon(createTerrain([], getGlobalDem()), site.lat, site.lon, { mastHeight, maxDistM: 200000 });
    return { el180: Array.from({ length: 180 }, (_, k) => full.elevations[k * 4]), groundHeight: Math.round(full.groundHeight), mastHeight, source: full.source, terrain: true };
  }
  if (h0 == null) {
    return {
      el180: new Array(180).fill(dip),
      groundHeight: 0,
      mastHeight,
      source: 'smooth sphere (outside polar DEM)',
      terrain: false,
    };
  }
  const r0 = MOON_RADIUS_M + h0 + mastHeight;
  const el180 = new Array(180);
  for (let k = 0; k < 180; k++) {
    const az = k * 2;
    let best = -90;
    for (let s = 4000; s <= 180000; s += 4500) {
      const p = destination(site.lat, site.lon, az, s);
      const h1 = sampleDemHeight(p.lat, p.lon);
      if (h1 != null) {
        const theta = s / MOON_RADIUS_M;
        const r1 = MOON_RADIUS_M + h1;
        const el = Math.atan2(r1 * Math.cos(theta) - r0, r1 * Math.sin(theta)) * RAD;
        if (el > best) best = el;
      }
    }
    el180[k] = best > -90 ? best : dip;
  }
  return {
    el180,
    groundHeight: Math.round(h0),
    mastHeight,
    source: 'LOLA south-polar grid',
    terrain: true,
  };
}

/** Horizon elevation (deg) at any azimuth, linearly interpolated. */
export function horizonAt(horizon, azDeg) {
  if (horizon.el180) {
    const f = (((azDeg % 360) + 360) % 360) / 2;
    const i0 = Math.floor(f) % 180;
    const i1 = (i0 + 1) % 180;
    const t = f - Math.floor(f);
    return horizon.el180[i0] * (1 - t) + horizon.el180[i1] * t;
  }
  if (horizon.elevations) {
    const f = (((azDeg % 360) + 360) % 360) / AZ_STEP_DEG;
    const i0 = Math.floor(f) % AZ_COUNT;
    const i1 = (i0 + 1) % AZ_COUNT;
    const t = f - Math.floor(f);
    return horizon.elevations[i0] * (1 - t) + horizon.elevations[i1] * t;
  }
  return 0;
}

// ---- 20 m LOLA tiles (PGDA LDEM_80S_20MPP_ADJ) around south-polar sites ----
// Loaded one at a time, only when a site inside a tile is in use, and added to
// the shared terrain so nudges and the landing-area check see 20 m detail.
let hiresIndex;
const hiresLoaded = new Map();
async function hiresTileFor(lat, lon, baseUrl) {
  if (lat > -80) return null;
  if (hiresIndex === undefined) {
    try { const r = await fetch(`${baseUrl}/hires/index.json`); hiresIndex = r.ok ? await r.json() : null; } catch { hiresIndex = null; }
  }
  if (!hiresIndex) return null;
  const { x, y } = toSouthPolar(lat, lon);
  const tile = hiresIndex.tiles.find((t) => Math.abs(x - t.centreX) < t.halfExtent - 2000 && Math.abs(y - t.centreY) < t.halfExtent - 2000);
  if (!tile) return null;
  if (!hiresLoaded.has(tile.id)) {
    hiresLoaded.set(tile.id, (async () => {
      const [meta, buf] = await Promise.all([
        fetch(`${baseUrl}/hires/${tile.id}.json`).then((r) => r.json()),
        fetch(`${baseUrl}/hires/${tile.id}.bin`).then((r) => r.arrayBuffer()),
      ]);
      return createGrid(meta, new Int16Array(buf));
    })().catch(() => { hiresLoaded.delete(tile.id); return null; }));
  }
  return hiresLoaded.get(tile.id);
}

/** Add the 20 m tile around (lat, lon), if there is one, to a terrain object in place. True if it was added. */
export async function addHiresTileTo(terrain, lat, lon, baseUrl) {
  if (!terrain) return false;
  const grid = await hiresTileFor(lat, lon, baseUrl);
  if (!grid || terrain.grids.includes(grid)) return false;
  terrain.grids.push(grid);
  terrain.grids.sort((a, b) => a.meta.cellSize - b.meta.cellSize);
  return true;
}

export async function ensureHiresTile(lat, lon, baseUrl) {
  if (!sharedTerrain) return false;
  return addHiresTileTo(sharedTerrain, lat, lon, baseUrl);
}
