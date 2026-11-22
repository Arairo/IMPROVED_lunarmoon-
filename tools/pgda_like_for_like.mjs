#!/usr/bin/env node
// Like-for-like comparison with NASA GSFC PGDA's average-visibility maps.
//
//   node tools/build_map_layers.mjs --like-pgda --out data-raw/pgda/ours_like_pgda.f32
//   node tools/pgda_like_for_like.mjs data-raw/pgda
//
// PGDA (Mazarico et al. 2011 method, products AVGVISIB_*_201608) average hourly steps
// over an 18.6-year lunar nutation cycle and count, for the Sun, the visible FRACTION of
// its disk, and for Earth, the time ANY part of its disk is above the terrain
// (https://pgda.gsfc.nasa.gov/products/69). The app's everyday statistics count disk
// centres for one year, so the main comparison in pgda_check.json is not like for like.
// This adds one that is: same quantities, a full cycle (2009 onward, 12-hour steps for the
// 5 km map, 3-hour steps at the sites), 2 m mast. Needs the PGDA files fetched by
// tools/pgda_fetch.py, so it runs in the PGDA workflow.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGrid, createTerrain, computeHorizon } from '../src/core/horizon.js';
import { createGlobalGrid } from '../src/core/globalDem.js';
import { moonFixedState } from '../src/core/ephemeris.js';
import { visibleDiskFraction } from '../src/core/power.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'public/data');
const inDir = process.argv[2] || 'data-raw/pgda';
const R = 1737400, DEG = Math.PI / 180, N = 184;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const f32 = (p) => new Float32Array(fs.readFileSync(p).buffer.slice(0));
const grid = (name) => createGrid(readJson(path.join(dataDir, `${name}.json`)), new Int16Array(fs.readFileSync(path.join(dataDir, `${name}.bin`)).buffer.slice(0)));

/** Element (r, c) of an n x n array read through one of 8 flips/transposes (as in build_hires_terrain.mjs). */
function variant(arr, n, v) {
  const out = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    let rr = r, cc = c;
    if (v & 4) [rr, cc] = [cc, rr];
    if (v & 1) rr = n - 1 - rr;
    if (v & 2) cc = n - 1 - cc;
    out[r * n + c] = arr[rr * n + cc];
  }
  return out;
}
const stats = (ours, pgda) => {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sad = 0, sd = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = -460000 + (c + 0.5) * 5000, y = 460000 - (r + 0.5) * 5000;
    if (Math.hypot(x, y) > 440000) continue; // PGDA's 75S map reaches ~455 km from the pole
    const pv = pgda[r * N + c], ov = ours[r * N + c];
    if (!Number.isFinite(pv) || pv < 0 || !Number.isFinite(ov)) continue;
    n++; sx += ov; sy += pv; sxx += ov * ov; syy += pv * pv; sxy += ov * pv; sad += Math.abs(ov - pv); sd += ov - pv;
  }
  const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return { r, n, meanAbsDiff: sad / n, meanDiff: sd / n, oursMean: sx / n, pgdaMean: sy / n };
};
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v]));

// ---- 1. Maps -----------------------------------------------------------------
const oursFile = path.join(inDir, 'ours_like_pgda.f32');
const maps = {};
if (fs.existsSync(oursFile)) {
  const o = f32(oursFile);
  const ours = { sun: o.subarray(0, N * N).map((v) => v * 100), earth: o.subarray(N * N).map((v) => v * 100) };
  for (const name of ['sun', 'earth']) {
    const p = path.join(inDir, `illum_${name}.f32`);
    if (!fs.existsSync(p)) continue;
    let arr = f32(p);
    const max = Math.max(...Array.from(arr).filter(Number.isFinite));
    if (max <= 1.0001) arr = arr.map((v) => v * 100);
    let best = null;
    for (let v = 0; v < 8; v++) { const s = { v, ...stats(ours[name], variant(arr, N, v)) }; if (!best || s.r > best.r) best = s; }
    maps[name] = round(best);
    console.log(`${name} (like for like) vs PGDA: r = ${best.r.toFixed(3)}, mean |diff| ${best.meanAbsDiff.toFixed(1)} pts, ours ${best.oursMean.toFixed(1)}% vs PGDA ${best.pgdaMean.toFixed(1)}%`);
  }
} else console.log(`no ${oursFile}: run build_map_layers.mjs --like-pgda first; sites only`);

// ---- 2. Sites, 20 m terrain where there is a tile -----------------------------
const fine = grid('sp_fine'), coarse = grid('sp_coarse');
const gm = readJson(path.join(dataDir, 'global_dem.json'));
const global = createGlobalGrid(gm, new Int16Array(fs.readFileSync(path.join(dataDir, 'global_dem.bin')).buffer.slice(0)));
const tiles = readJson(path.join(dataDir, 'hires/index.json')).tiles.map((t) => grid(`hires/${t.id}`));
const terrain = createTerrain([...tiles, fine, coarse], global);
const check = readJson(path.join(dataDir, 'pgda_check.json'));
const sitesById = Object.fromEntries(readJson(path.join(root, 'src/data/sites.json')).map((s) => [s.id, s]));
const t0 = Date.UTC(2009, 0, 1), t1 = t0 + 18.6 * 365.25 * 86400000;
const states = [];
for (let t = t0; t < t1; t += 3 * 3600000) states.push(moonFixedState(t));
const siteRows = [];
for (const row of check.sites) {
  const s = sitesById[row.id];
  if (!s) continue;
  const h = computeHorizon(terrain, s.lat, s.lon, { mastHeight: 2, azStepDeg: 2 });
  const r0 = R + h.groundHeight + 2;
  const cl = Math.cos(s.lat * DEG), sl = Math.sin(s.lat * DEG), co = Math.cos(s.lon * DEG), so = Math.sin(s.lon * DEG);
  const up = [cl * co, cl * so, sl], east = [-so, co, 0], north = [-sl * co, -sl * so, cl];
  const n = h.elevations.length;
  const look = (v, radius) => {
    const d = [v[0] - up[0] * r0, v[1] - up[1] * r0, v[2] - up[2] * r0], L = Math.hypot(...d);
    const el = Math.asin((d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / L) / DEG;
    let az = Math.atan2(d[0] * east[0] + d[1] * east[1], d[0] * north[0] + d[1] * north[1] + d[2] * north[2]) / DEG;
    if (az < 0) az += 360;
    const f = (az / 360) * n, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, t = f - Math.floor(f);
    return { el, hz: h.elevations[i0] * (1 - t) + h.elevations[i1] * t, rad: Math.asin(radius / L) / DEG };
  };
  let sun = 0, earth = 0;
  for (const st of states) {
    const a = look(st.sun, 695700e3); sun += visibleDiskFraction(a.el, a.hz, a.rad);
    const b = look(st.earth, 6371e3); if (b.el > b.hz - b.rad) earth++;
  }
  const out = { id: row.id, terrain: h.source, oursSun: Math.round((sun / states.length) * 1000) / 10, oursEarth: Math.round((earth / states.length) * 1000) / 10, pgdaSun120: row.pgdaSun120 ?? null, pgdaSun60: row.pgdaSun60 ?? null, pgdaEarth120: row.pgdaEarth120 ?? null };
  siteRows.push(out);
  console.log(`${row.id.padEnd(16)} sun ${out.oursSun}% (PGDA 120 m ${out.pgdaSun120 ?? '-'}%, 60 m ${out.pgdaSun60 ?? '-'}%) | earth ${out.oursEarth}% (PGDA ${out.pgdaEarth120 ?? '-'}%)`);
}

check.likeForLike = {
  generated: new Date().toISOString(),
  method: 'Same quantities as PGDA AVGVISIB: visible fraction of the solar disk; Earth counted when any part of its disk is above the terrain; averaged over an 18.6-year nutation cycle from 2009 (12-hour steps for the 5 km map, 3-hour steps at sites); 2 m mast. PGDA uses hourly steps and its own LOLA terrain at 60-240 m.',
  maps, sites: siteRows,
};
fs.writeFileSync(path.join(dataDir, 'pgda_check.json'), JSON.stringify(check, null, 1));
console.log('updated public/data/pgda_check.json (likeForLike)');
