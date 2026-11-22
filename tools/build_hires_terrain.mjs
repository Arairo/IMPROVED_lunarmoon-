#!/usr/bin/env node
// Turn the files from tools/pgda_fetch.py into app data, checking everything
// against the app's own LOLA grids first.
//
//   node tools/build_hires_terrain.mjs data-raw/pgda
//
// 1. 20 m terrain tiles (PGDA LDEM_80S_20MPP_ADJ, Barker et al. 2023): a 16 km grid
//    covering the Artemis III candidate regions, plus one around each south-polar site
//    outside them (tools/pgda_fetch.py picks the windows). Units and orientation are not assumed: every flip/transpose
//    is tried and the one that matches our 240 m LOLA grid best is kept; a tile
//    that does not match within 60 m (mean absolute difference) is rejected.
//    -> public/data/hires/<id>.{i16z,json} (packed, src/core/tileCodec.js) and hires/index.json
// 2. PGDA average Sun / Earth visibility maps vs our own 2027 map layers (5 km south
//    cap), and at each site vs our 2027 sunlight share with and without the 20 m tiles.
//    -> public/data/pgda_check.json
import fs from 'node:fs';
import path from 'node:path';
import { createGrid, createTerrain, computeHorizon } from '../src/core/horizon.js';
import { toSouthPolar } from '../src/core/geo.js';
import { readGrid, writeTile, sourceCommit } from './lib/grids.mjs';
import { createGlobalGrid } from '../src/core/globalDem.js';
import { moonFixedState } from '../src/core/ephemeris.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = path.join(root, 'public/data');
const inDir = process.argv[2] || 'data-raw/pgda';
const R = 1737400;
const DEG = Math.PI / 180;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const grid = (name) => readGrid(name, dataDir);
const f32 = (p) => new Float32Array(fs.readFileSync(p).buffer.slice(0));

const fine = grid('sp_fine');
const coarse = grid('sp_coarse');
const gmeta = readJson(path.join(dataDir, 'global_dem.json'));
const global = createGlobalGrid(gmeta, new Int16Array(fs.readFileSync(path.join(dataDir, 'global_dem.bin')).buffer.slice(0)));
const sites = readJson(path.join(root, 'src/data/sites.json'));
const polar = sites.filter((s) => s.lat <= -80);

const median = (a) => { const b = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };

/** Element (r, c) of an n x n array read through one of 8 flips/transposes. */
function variant(arr, n, v) {
  const out = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    let rr = r, cc = c;
    if (v & 4) [rr, cc] = [cc, rr];
    if (v & 1) cc = n - 1 - cc;
    if (v & 2) rr = n - 1 - rr;
    out[r * n + c] = arr[rr * n + cc];
  }
  return out;
}

function toMetres(a) {
  const m = median(a);
  let f = (v) => v;
  let unit = 'metres above 1737.4 km';
  if (Math.abs(m) > 1e6) { f = (v) => v - R; unit = 'radius in metres'; }
  else if (m > 1700 && m < 1760) { f = (v) => (v - 1737.4) * 1000; unit = 'radius in km'; }
  else if (Math.abs(m) < 20) { f = (v) => v * 1000; unit = 'km above 1737.4 km'; }
  return { data: a.map((v) => (Number.isFinite(v) ? f(v) : NaN)), unit };
}

// ---- 1. 20 m tiles --------------------------------------------------------
const hiresDir = path.join(dataDir, 'hires');
fs.mkdirSync(hiresDir, { recursive: true });
const index = [];
const tiles = [];
const windowsFile = path.join(inDir, 'windows.json');
const windowIds = fs.existsSync(windowsFile) ? readJson(windowsFile) : polar.map((s) => s.id);
// Tiles are replaced as a set: clear the old ones so none is left over.
for (const f of fs.readdirSync(hiresDir)) if (/\.(bin|i16z|json)$/.test(f)) fs.rmSync(path.join(hiresDir, f));
for (const id of windowIds) {
  const s = { id };
  const mp = path.join(inDir, `dem_${s.id}.json`);
  if (!fs.existsSync(mp)) { console.log(`${s.id}: no 20 m window`); continue; }
  const meta = readJson(mp);
  const n = meta.size, cell = meta.cellSize, half = (n * cell) / 2;
  const { data: raw, unit } = toMetres(f32(path.join(inDir, `dem_${s.id}.f32`)));
  let best = null, v0 = null;
  for (let v = 0; v < 8; v++) {
    const a = variant(raw, n, v);
    let sum = 0, bias = 0, k = 0, refCoarse = 0;
    for (let r = 4; r < n; r += 8) for (let c = 4; c < n; c += 8) {
      const h = a[r * n + c];
      if (!Number.isFinite(h)) continue;
      const x = meta.centreX - half + (c + 0.5) * cell, y = meta.centreY + half - (r + 0.5) * cell;
      // Check against the 240 m grid; sites beyond it (IM-1, Cabeus B, ~84 deg S
      // and further out) are checked against the 1 km grid instead.
      const g = fine.covers(x, y) ? fine : coarse.covers(x, y) ? coarse : null;
      if (!g) continue;
      if (g === coarse) refCoarse++;
      const ref = g.sample(x, y);
      if (!Number.isFinite(ref)) continue;
      sum += Math.abs(h - ref); bias += h - ref; k++;
    }
    const cand = { v, a, mae: sum / k, bias: bias / k, k, ref: refCoarse > k / 2 ? '1 km' : '240 m' };
    if (v === 0) v0 = cand;
    if (k > 100 && (!best || cand.mae < best.mae)) best = cand;
  }
  // The file's own orientation (variant 0) matched on every tile so far. On flat ground
  // the variants differ little, so only accept another one if it is clearly better.
  if (best && best.v !== 0 && v0?.k > 100 && v0.mae < 2 * best.mae) best = v0;
  const limit = best?.ref === '1 km' ? 100 : 60; // 1 km cells smooth out slopes, so allow more
  if (!best || best.mae > limit) { console.log(`${s.id}: REJECTED (best mean abs difference vs ${best?.ref ?? 'LOLA'} grid ${best?.mae?.toFixed(1)} m)`); continue; }
  const out = new Int16Array(n * n);
  let filled = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    let h = best.a[r * n + c];
    if (!Number.isFinite(h)) {
      const x = meta.centreX - half + (c + 0.5) * cell, y = meta.centreY + half - (r + 0.5) * cell;
      h = fine.covers(x, y) ? fine.sample(x, y) : coarse.sample(x, y);
      filled++;
    }
    out[r * n + c] = Number.isFinite(h) ? Math.round(h) : -32768;
  }
  let gmetaOut = {
    name: `hires_${s.id}`, kind: meta.kind ?? 'site', ...(meta.regions ? { regions: meta.regions } : {}), projection: 'south-polar-stereographic', radius: R,
    halfExtent: half, cellSize: cell, size: n, centreX: meta.centreX, centreY: meta.centreY,
    dtype: 'int16-le', noData: -32768, units: 'metres above 1737.4 km sphere',
    rowOrder: 'row 0 at +y, column 0 at -x (relative to centreX/centreY)',
    source: 'NASA GSFC PGDA: LOLA 20 m south-pole DEM, LDEM_80S_20MPP_ADJ (Barker et al. 2023)',
    sourceUnits: unit, orientationVariant: best.v,
    checkVs240m: { meanAbsDiffM: Math.round(best.mae * 10) / 10, biasM: Math.round(best.bias * 10) / 10, points: best.k, against: best.ref },
    gapsFilledFrom240m: filled,
  };
  gmetaOut = writeTile(hiresDir, s.id, gmetaOut, out).meta;
  index.push({ id: s.id, kind: gmetaOut.kind, ...(meta.regions ? { regions: meta.regions } : {}), centreX: meta.centreX, centreY: meta.centreY, halfExtent: half, cellSize: cell, size: n, meanAbsDiffM: gmetaOut.checkVs240m.meanAbsDiffM });
  tiles.push(createGrid(gmetaOut, out));
  console.log(`${s.id.padEnd(16)} 20 m tile ${n}x${n} (${unit}, variant ${best.v}): vs ${best.ref} grid mean |diff| ${best.mae.toFixed(1)} m, bias ${best.bias.toFixed(1)} m, ${filled} gaps filled`);
}
fs.writeFileSync(path.join(hiresDir, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), commit: sourceCommit(), note: 'kind "region": 16 km grid over the Artemis III candidate regions (regions = their codes); kind "site": around a south-polar site outside them. Packed: see src/core/tileCodec.js.', source: 'NASA GSFC PGDA LDEM_80S_20MPP_ADJ (Barker et al. 2023)', url: 'https://pgda.gsfc.nasa.gov/products/90', tiles: index }, null, 1));

// ---- 2. Sunlight per site with and without the 20 m tiles -----------------
const t0 = Date.UTC(2027, 0, 1), t1 = Date.UTC(2028, 0, 1);
const states = [];
for (let t = t0; t < t1; t += 6 * 3600000) states.push(moonFixedState(t));
function share(h, lat, lon) {
  const r0 = R + h.groundHeight + h.mastHeight;
  const cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG), co = Math.cos(lon * DEG), so = Math.sin(lon * DEG);
  const up = [cl * co, cl * so, sl], east = [-so, co, 0], north = [-sl * co, -sl * so, cl];
  const n = h.elevations.length;
  const test = (v) => {
    const d = [v[0] - up[0] * r0, v[1] - up[1] * r0, v[2] - up[2] * r0];
    const L = Math.hypot(...d);
    const el = Math.asin((d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / L) / DEG;
    let az = Math.atan2(d[0] * east[0] + d[1] * east[1], d[0] * north[0] + d[1] * north[1] + d[2] * north[2]) / DEG;
    if (az < 0) az += 360;
    const f = (az / 360) * n, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, t = f - Math.floor(f);
    return el > h.elevations[i0] * (1 - t) + h.elevations[i1] * t;
  };
  let sun = 0, earth = 0;
  for (const s of states) { if (test(s.sun)) sun++; if (test(s.earth)) earth++; }
  return { sun: Math.round((sun / states.length) * 1000) / 10, earth: Math.round((earth / states.length) * 1000) / 10 };
}
const base = createTerrain([fine, coarse], global);
const withHires = createTerrain([...tiles, fine, coarse], global);
const illumMeta = fs.existsSync(path.join(inDir, 'illum_meta.json')) ? readJson(path.join(inDir, 'illum_meta.json')) : null;
const pct = (v) => (v == null ? null : Math.round((v <= 1.0001 ? v * 100 : v) * 10) / 10);
const siteRows = [];
for (const s of polar) {
  const a = share(computeHorizon(base, s.lat, s.lon, { mastHeight: 2, azStepDeg: 2 }), s.lat, s.lon);
  const { x, y } = toSouthPolar(s.lat, s.lon);
  const hasTile = tiles.some((t) => t.covers(x, y));
  const b = hasTile ? share(computeHorizon(withHires, s.lat, s.lon, { mastHeight: 2, azStepDeg: 2 }), s.lat, s.lon) : null;
  const p = illumMeta?.sites?.[s.id] ?? {};
  const row = { id: s.id, name: s.name, ours240: a, ours20: b, pgdaSun60: pct(p.sun60m), pgdaSun60Detail: p.sun60mDetail ?? null, pgdaSun120: pct(p.sun120m), pgdaEarth120: pct(p.earth120m) };
  siteRows.push(row);
  console.log(`${s.id.padEnd(16)} sun 2027: 240 m ${a.sun}%  20 m ${b ? b.sun + '%' : '-'}  PGDA ${row.pgdaSun60 ?? row.pgdaSun120 ?? '-'}% | earth: 240 m ${a.earth}%  20 m ${b ? b.earth + '%' : '-'}  PGDA ${row.pgdaEarth120 ?? '-'}%`);
}

// ---- 3. Maps: PGDA vs our 5 km south-cap layer -------------------------------
const maps = {};
const layersMeta = readJson(path.join(dataDir, 'layers.json'));
const layersBin = fs.readFileSync(path.join(dataDir, 'layers.bin'));
const N = 184, G = 64800, C = N * N;
const ours = { sun: layersBin.subarray(2 * G, 2 * G + C), earth: layersBin.subarray(2 * G + C, 2 * G + 2 * C) };
for (const name of ['sun', 'earth']) {
  const p = path.join(inDir, `illum_${name}.f32`);
  if (!fs.existsSync(p)) continue;
  let arr = f32(p);
  const max = Math.max(...Array.from(arr).filter(Number.isFinite));
  if (max <= 1.0001) arr = arr.map((v) => v * 100);
  let best = null;
  for (let v = 0; v < 8; v++) {
    const a = variant(arr, N, v);
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sad = 0, sd = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const x = -460000 + (c + 0.5) * 5000, y = 460000 - (r + 0.5) * 5000;
      if (Math.hypot(x, y) > 440000) continue; // PGDA 75S map reaches ~455 km from the pole
      const pv = a[r * N + c], ov = ours[name][r * N + c] / 2;
      if (!Number.isFinite(pv) || pv < 0) continue;
      n++; sx += ov; sy += pv; sxx += ov * ov; syy += pv * pv; sxy += ov * pv; sad += Math.abs(ov - pv); sd += ov - pv;
    }
    const rr = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    if (!best || rr > best.r) best = { v, r: rr, n, meanAbsDiff: sad / n, meanDiff: sd / n, pgdaMean: sy / n, oursMean: sx / n };
  }
  maps[name] = Object.fromEntries(Object.entries(best).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v]));
  console.log(`${name} map vs PGDA: r = ${best.r.toFixed(3)} over ${best.n} cells (variant ${best.v}), mean |diff| ${best.meanAbsDiff.toFixed(1)} points, ours ${best.oursMean.toFixed(1)}% vs PGDA ${best.pgdaMean.toFixed(1)}%`);
}

fs.writeFileSync(path.join(dataDir, 'pgda_check.json'), JSON.stringify({
  generated: new Date().toISOString(),
  commit: sourceCommit(),
  note: `PGDA "average visibility" (Mazarico et al. 2011 method; product 201608) is a multi-year average of the visible fraction of the Sun's / Earth's disk at the surface. Ours is the share of ${layersMeta.year} with the disk centre above the skyline from a 2 m mast. Expect differences of several points; the comparison is about the pattern.`,
  products: illumMeta?.products ? Object.fromEntries(Object.entries(illumMeta.products).map(([k, v]) => [k, v.url])) : {},
  maps, sites: siteRows,
}, null, 1));
console.log('wrote public/data/hires/*, public/data/pgda_check.json');
