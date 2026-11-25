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
import { decodeTile } from './tileCodec.js';

export const AZ_STEP_DEG = 0.5;
/** Ray step = max(half the local grid cell, this fraction of the distance). */
export const RAY_GROWTH = 0.015;
/**
 * Re-sample finely around the highest point found along each ray. Without it the
 * growing steps can step over the crest that forms the skyline: on the 19 south-polar
 * sites the yearly sunlight share was up to 2.8 points too high (see docs/VALIDATION.md,
 * "Horizon sampling convergence"). Costs about 10% more time.
 */
export const RAY_REFINE = true;
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
  // With dozens of 20 m tiles, look tiles up by position instead of trying each one.
  // Rebuilt whenever tiles are added (addHiresTileTo pushes onto `grids`).
  let lookup = null, lookupLen = -1;
  const BUCKET = 8000;
  const key = (i, j) => `${i},${j}`;
  const buildLookup = () => {
    const buckets = new Map(), rest = [];
    for (const g of ordered) {
      if (g.meta.centreX == null) { rest.push(g); continue; }
      const h = g.meta.halfExtent, cx = g.meta.centreX, cy = g.meta.centreY;
      for (let i = Math.floor((cx - h) / BUCKET); i <= Math.floor((cx + h) / BUCKET); i++) {
        for (let j = Math.floor((cy - h) / BUCKET); j <= Math.floor((cy + h) / BUCKET); j++) {
          const k = key(i, j);
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push(g);
        }
      }
    }
    lookupLen = ordered.length;
    return { buckets, rest, local: ordered.length - rest.length };
  };
  const trySample = (g, x, y) => {
    if (!g.covers(x, y)) return null;
    const height = g.sample(x, y);
    return Number.isNaN(height) ? null : { height, cell: g.meta.cellSize };
  };
  return {
    grids: ordered,
    global,
    /** { height, cell } at lat/lon, or null where no grid has data. */
    heightAt(lat, lon) {
      if (lat <= -60) {
        const { x, y } = toSouthPolar(lat, lon);
        if (lookupLen !== ordered.length) lookup = buildLookup();
        if (lookup.local > 4) {
          // Local tiles are finer than the polar grids, so they are tried first.
          for (const g of lookup.buckets.get(key(Math.floor(x / BUCKET), Math.floor(y / BUCKET))) ?? []) {
            const r = trySample(g, x, y);
            if (r) return r;
          }
          for (const g of lookup.rest) {
            const r = trySample(g, x, y);
            if (r) return r;
          }
        } else {
          for (const g of ordered) {
            const r = trySample(g, x, y);
            if (r) return r;
          }
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
export function rayHorizon(terrain, lat, lon, az, { ground = terrain.heightAt(lat, lon), mastHeight = 2, maxDistM = 300000, growth = RAY_GROWTH, refine = RAY_REFINE, stats = null } = {}) {
  if (!ground) return { el: -90, dist: 0 };
  const r0 = MOON_RADIUS_M + ground.height + mastHeight;
  const minStep = ground.cell / 2;
  let best = -90;
  let bestDist = 0;
  let bestCell = ground.cell;
  let prevS = 0, bestPrevS = 0, bestNextS = 0;
  const elAt = (s) => {
    const p = destination(lat, lon, az, s);
    const h = terrain.heightAt(p.lat, p.lon);
    if (!h) return null;
    if (stats) { stats.samples++; if (h.cell > stats.coarsestCellM) stats.coarsestCellM = h.cell; if (h.cell < stats.finestCellM) stats.finestCellM = h.cell; }
    const theta = s / MOON_RADIUS_M;
    const r1 = MOON_RADIUS_M + h.height;
    return { el: Math.atan2(r1 * Math.cos(theta) - r0, r1 * Math.sin(theta)) * RAD, cell: h.cell };
  };
  let s = Math.max(60, ground.cell * 0.75);
  let gapStart = -1;
  while (s < maxDistM) {
    const r = elAt(s);
    if (r) {
      gapStart = -1;
      if (bestNextS === 0 && bestDist > 0 && s > bestDist) bestNextS = s;
      if (r.el > best) { best = r.el; bestDist = s; bestCell = r.cell; bestPrevS = prevS; bestNextS = 0; }
    } else {
      // No grid has data here. Skip short gaps; after 30 km of nothing we have
      // walked off the grids, so stop.
      if (gapStart < 0) gapStart = s;
      else if (s - gapStart > 30000) break;
    }
    prevS = s;
    const step = Math.max(minStep, s * growth);
    if (stats && step > stats.maxStepM) stats.maxStepM = step;
    s += step;
  }
  // The steps grow with distance (1.5% of it by default), so the true top of the
  // ridge that forms the horizon can fall between two samples. Re-sample the
  // stretch either side of the highest sample at half the local grid cell.
  if (refine && bestDist > 0) {
    // The crest lies between the samples either side of the best one.
    const a = bestPrevS || Math.max(0, bestDist - 2 * bestCell), b = Math.min(bestNextS || bestDist + 2 * bestCell, maxDistM);
    const d = Math.max(bestCell / 2, (b - a) / 200);
    for (let x = a + d; x < b; x += d) {
      const r = elAt(x);
      if (r && r.el > best) { best = r.el; bestDist = x; }
    }
  }
  return { el: best, dist: bestDist };
}

export function computeHorizon(terrain, lat, lon, { mastHeight = 2, maxDistM = 300000, azStepDeg = AZ_STEP_DEG, growth = RAY_GROWTH, refine = RAY_REFINE } = {}) {
  // At exactly +-90 deg every great-circle ray leaves along one meridian; 1e-4 deg (~3 m) away they don't.
  lat = Math.max(-89.9999, Math.min(89.9999, lat));
  const count = Math.round(360 / azStepDeg);
  const elevations = new Float32Array(count);
  const distances = new Float32Array(count);
  const ground = terrain?.heightAt(lat, lon) ?? null;
  const dip = sphereHorizonDip(mastHeight);
  if (!ground) {
    elevations.fill(dip);
    distances.fill(Math.sqrt(2 * MOON_RADIUS_M * mastHeight));
    return { elevations, distances, groundHeight: 0, mastHeight, source: 'smooth sphere (no terrain data)', terrain: false, quality: horizonQuality({ method: 'sphere' }) };
  }
  const stats = { samples: 0, maxStepM: 0, finestCellM: Infinity, coarsestCellM: 0 };
  for (let i = 0; i < count; i++) {
    const r = rayHorizon(terrain, lat, lon, i * azStepDeg, { ground, mastHeight, maxDistM, growth, refine, stats });
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
    quality: horizonQuality({ method: 'rays', siteCellM: ground.cell, azStepDeg, growth, refine, maxDistM, ...stats }),
  };
}

/**
 * What a horizon was computed from, so results can say how much to trust it.
 * tier: 'fine' (≤ 20 m at the site), 'standard' (LOLA polar/global grid ray-cast),
 * 'coarse' (5 km compact grid, used only before the full terrain has loaded),
 * 'none' (smooth sphere: no terrain at all).
 */
export function horizonQuality({ method, siteCellM = null, azStepDeg = null, growth = null, refine = false, maxDistM = null, maxStepM = null, finestCellM = null, coarsestCellM = null, samples = null, note = null }) {
  let tier, text;
  if (method === 'sphere') {
    tier = 'none';
    text = 'No terrain data here: the horizon is a smooth sphere, so hills and craters that block the Sun or Earth are missing.';
  } else if (method === 'compact') {
    tier = 'coarse';
    text = 'Approximate horizon from a 5 km grid, used until the detailed terrain has loaded. Shadows from smaller hills are missing.';
  } else if (method === 'mast-approx') {
    tier = 'coarse';
    text = 'Approximate horizon for this mast height, used until the detailed terrain has loaded.';
  } else {
    tier = siteCellM != null && siteCellM <= 20 ? 'fine' : 'standard';
    const cell = (m) => (m == null ? '?' : m >= 1000 ? `${+(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
    text = `LOLA terrain, ${cell(siteCellM)} at the site; farther away the grid is ${cell(coarsestCellM)} and ray steps grow to ${cell(maxStepM)}. Skyline sampled every ${azStepDeg}° of azimuth.`;
  }
  return {
    tier,
    method,
    text: note ? `${text} ${note}` : text,
    siteCellM, azStepDeg, growth, refine, maxDistM,
    maxStepM: maxStepM == null ? null : Math.round(maxStepM),
    finestCellM: Number.isFinite(finestCellM) ? finestCellM : null,
    coarsestCellM: coarsestCellM || null,
    samples,
    interpolation: method === 'sphere' ? null : 'bilinear heights; skyline linear between azimuth samples',
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

/** Mast height the precomputed skylines were built for (tools/build_site_horizons.mjs). */
export const PRECOMPUTED_MAST_M = 2;

/**
 * The precomputed skyline for this site, or null. Matched by id AND position: another
 * place that happens to reuse an id (the planner's "best-2" is not sites.json's) must
 * not get a skyline computed 20 km away.
 */
export function precomputedFor(site) {
  const pre = precomputedHorizons[site?.id];
  if (!pre) return null;
  if (pre.lat != null && pre.lon != null) {
    const dLat = (site.lat - pre.lat) * 30323; // metres per degree of latitude on the Moon
    const dLon = ((((site.lon - pre.lon + 540) % 360) - 180)) * 30323 * Math.cos(site.lat * Math.PI / 180);
    if (Math.hypot(dLat, dLon) > 50) return null;
  }
  return pre;
}

/**
 * Compute or look up the compact 180-sample (2°) site horizon.
 *
 * Precomputed skylines are for a 2 m mast. For any other mast the skyline is recomputed
 * from the loaded terrain: near terrain (often only tens of metres away on the 20 m tiles)
 * moves by degrees when the mast changes, so no fixed offset is right. Until the terrain
 * has loaded, the precomputed skyline is shifted by a rough offset and flagged approximate
 * (quality tier 'coarse'), and the caller is expected to load the terrain and recompute.
 */
export function computeSiteHorizon(site, mastHeight = PRECOMPUTED_MAST_M) {
  const pre = precomputedFor(site);
  const sameMast = Math.abs(mastHeight - PRECOMPUTED_MAST_M) < 1e-6;
  if (pre && sameMast) {
    const el180 = pre.el180.slice();
    // Older entries don't record their sampling; recover the site cell from the label.
    const m = /([\d.]+)\s*(km|m)\b/.exec(pre.source || '');
    const siteCellM = pre.siteCellM ?? (m ? Number(m[1]) * (m[2] === 'km' ? 1000 : 1) : null);
    return {
      el180,
      groundHeight: pre.groundHeight,
      mastHeight,
      source: pre.source,
      terrain: pre.terrain,
      quality: horizonQuality({ method: pre.terrain ? 'rays' : 'sphere', siteCellM, azStepDeg: 2, growth: pre.growth ?? RAY_GROWTH, refine: !!pre.refine, maxDistM: 300000, maxStepM: pre.maxStepM ?? null, coarsestCellM: pre.coarsestCellM ?? null, note: pre.refine ? null : 'Built before ridge-crest refinement: sunlight may read slightly high.' }),
    };
  }
  if (sharedTerrain && sharedTerrain.heightAt(site.lat, site.lon)) {
    const full = computeHorizon(sharedTerrain, site.lat, site.lon, { mastHeight, azStepDeg: 2 });
    return { el180: Array.from(full.elevations), groundHeight: Math.round(full.groundHeight), mastHeight, source: full.source, terrain: true, quality: full.quality };
  }
  if (pre) {
    // Other mast, terrain not loaded yet: a rough shift (right only for terrain ~5 km away).
    const shift = (mastHeight - PRECOMPUTED_MAST_M) * 0.012;
    return {
      el180: pre.el180.map((v) => v - shift),
      groundHeight: pre.groundHeight,
      mastHeight,
      source: pre.source,
      terrain: pre.terrain,
      quality: horizonQuality({ method: 'mast-approx', siteCellM: pre.siteCellM ?? null, azStepDeg: 2, coarsestCellM: pre.coarsestCellM ?? null, note: `Skyline built for a ${PRECOMPUTED_MAST_M} m mast and roughly adjusted to ${mastHeight} m until the terrain has loaded.` }),
    };
  }
  const h0 = sampleDemHeight(site.lat, site.lon);
  const dip = sphereHorizonDip(mastHeight);
  if (h0 == null && getGlobalDem()) {
    // Outside the polar grid: ray-cast over the whole-Moon LOLA grid.
    const full = computeHorizon(createTerrain([], getGlobalDem()), site.lat, site.lon, { mastHeight, maxDistM: 200000 });
    return { el180: Array.from({ length: 180 }, (_, k) => full.elevations[k * 4]), groundHeight: Math.round(full.groundHeight), mastHeight, source: full.source, terrain: true, quality: { ...full.quality, azStepDeg: 2 } };
  }
  if (h0 == null) {
    return {
      el180: new Array(180).fill(dip),
      groundHeight: 0,
      mastHeight,
      source: 'smooth sphere (no terrain loaded here yet)',
      terrain: false,
      quality: horizonQuality({ method: 'sphere' }),
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
    source: 'approximate: LOLA 5 km south-polar grid',
    terrain: true,
    quality: horizonQuality({ method: 'compact', siteCellM: 5000, azStepDeg: 2, maxDistM: 180000, maxStepM: 4500, coarsestCellM: 5000 }),
  };
}

/** Horizon elevation (deg) at any azimuth, linearly interpolated. */
export function horizonAt(horizon, azDeg) {
  if (horizon.el180) {
    const n = horizon.el180.length;
    const f = ((((azDeg % 360) + 360) % 360) / 360) * n;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const t = f - Math.floor(f);
    return horizon.el180[i0] * (1 - t) + horizon.el180[i1] * t;
  }
  if (horizon.elevations) {
    // Any azimuth step: computeHorizon may have been called with azStepDeg other than 0.5.
    const n = horizon.elevations.length;
    const f = ((((azDeg % 360) + 360) % 360) / 360) * n;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const t = f - Math.floor(f);
    return horizon.elevations[i0] * (1 - t) + horizon.elevations[i1] * t;
  }
  return 0;
}

// ---- 20 m LOLA tiles (PGDA LDEM_80S_20MPP_ADJ): a 16 km grid over everything within ----
// 160 km of the pole and the Artemis III candidate regions, plus windows around the other
// south-polar sites. Packed files (src/core/tileCodec.js), loaded only when a point on them
// is in use and added to the shared terrain. Every tile within HIRES_REACH_M of the point
// is loaded: docs/validation/terrain-study.md found that 20 m terrain out to 10 km, then
// the 240 m grid, gives the same sunlight and Earth shares as 20 m terrain all the way out
// (within 0.1 point), while 240 m terrain near the point was off by up to 12 / 25 points.
export const HIRES_REACH_M = 10000;
const hiresIndex = new Map(); // baseUrl -> promise of hires/index.json (null when missing)
const hiresLoaded = new Map();
async function hiresIndexFor(baseUrl) {
  if (!hiresIndex.has(baseUrl)) {
    hiresIndex.set(baseUrl, fetch(`${baseUrl}/hires/index.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  const index = await hiresIndex.get(baseUrl);
  // A failed fetch (offline for a moment) must not switch 20 m terrain off for the session.
  if (!index) hiresIndex.delete(baseUrl);
  return index;
}
/** Index entries of the tiles that cover (x, y) or come within `reach` metres of it. */
export function tilesNear(tiles, x, y, reach = HIRES_REACH_M) {
  return tiles.filter((t) => Math.abs(x - t.centreX) < t.halfExtent + reach && Math.abs(y - t.centreY) < t.halfExtent + reach);
}
function loadHiresTile(tile, baseUrl) {
  if (!hiresLoaded.has(tile.id)) {
    hiresLoaded.set(tile.id, (async () => {
      const meta = await fetch(`${baseUrl}/hires/${tile.id}.json`).then((r) => r.json());
      const file = meta.file ?? `${tile.id}.bin`;
      const buf = await fetch(`${baseUrl}/hires/${file}`).then((r) => { if (!r.ok) throw new Error(`${file} ${r.status}`); return r.arrayBuffer(); });
      return createGrid(meta, meta.encoding ? await decodeTile(buf, meta.size) : new Int16Array(buf));
    })().catch(() => { hiresLoaded.delete(tile.id); return null; }));
  }
  return hiresLoaded.get(tile.id);
}
async function hiresTilesFor(lat, lon, baseUrl) {
  if (lat > -78) return [];
  const index = await hiresIndexFor(baseUrl);
  if (!index) return [];
  const { x, y } = toSouthPolar(lat, lon);
  // Only when the site itself is on 20 m terrain (not just near the edge of a tile).
  if (!tilesNear(index.tiles, x, y, -500).length) return [];
  const grids = await Promise.all(tilesNear(index.tiles, x, y).map((t) => loadHiresTile(t, baseUrl)));
  return grids.filter(Boolean);
}

/** Add the 20 m tiles around (lat, lon), if any, to a terrain object in place. True if any was added. */
export async function addHiresTileTo(terrain, lat, lon, baseUrl) {
  if (!terrain) return false;
  const grids = await hiresTilesFor(lat, lon, baseUrl);
  const fresh = grids.filter((g) => !terrain.grids.includes(g));
  if (!fresh.length) return false;
  terrain.grids.push(...fresh);
  terrain.grids.sort((a, b) => a.meta.cellSize - b.meta.cellSize);
  return true;
}

export async function ensureHiresTile(lat, lon, baseUrl) {
  if (!sharedTerrain) return false;
  return addHiresTileTo(sharedTerrain, lat, lon, baseUrl);
}
