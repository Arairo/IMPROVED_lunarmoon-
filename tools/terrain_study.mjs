#!/usr/bin/env node
// How fine does the terrain need to be, and how far out? Measures it before we ship
// anything (docs/validation/terrain-study.{json,md}).
//
//   node tools/terrain_study.mjs data-raw/mosaic [--quick] [--out DIR]
//
// Needs the grids from tools/pgda_mosaic.py (NASA PGDA 20 m LOLA terrain cut to
// +-180 km around the pole, plus 40/60/120/240 m block means and 120/240 m block maxima),
// so it runs in the terrain-study workflow.
//
// For every south-polar site and for a fixed set of random points near the pole it
// builds the skyline several ways (different terrain resolution by distance band) and
// compares each with a reference: 20 m terrain all the way out to 180 km, sampled
// densely. It reports how much each choice moves the skyline and the sunlight / Earth
// shares (computed as NASA PGDA computes them: visible fraction of the Sun's disk, Earth
// when any of its disk shows, 18.6-year cycle, 3-hour steps, 2 m mast), and for the
// sites how each compares with PGDA's 60 m map. It also measures how much the answer
// changes when the point moves 60 m, which bounds what any terrain upgrade can promise.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createGrid, computeHorizon, tilesNear, HIRES_REACH_M } from '../src/core/horizon.js';
import { createGlobalGrid } from '../src/core/globalDem.js';
import { toSouthPolar, fromSouthPolar } from '../src/core/geo.js';
import { moonFixedState } from '../src/core/ephemeris.js';
import { visibleDiskFraction } from '../src/core/power.js';
import { deltaEncode } from '../src/core/tileCodec.js';
import { readGrid, readHiresTiles, sourceCommit } from './lib/grids.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'public/data');
const args = process.argv.slice(2);
const inDir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') || 'data-raw/mosaic';
const quick = args.includes('--quick');
const skipCheck = args.includes('--skip-check'); // local tests with stand-in grids only
const outArg = args.indexOf('--out');
const R = 1737400, DEG = Math.PI / 180;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const t00 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t00) / 1000).toFixed(0).padStart(5)} s]`, ...a);

// ---- Grids --------------------------------------------------------------------
function mosaic(name) {
  const meta = readJson(path.join(inDir, `${name}.json`));
  const buf = fs.readFileSync(path.join(inDir, `${name}.i16`));
  return createGrid(meta, new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2));
}
const M = {};
for (const name of ['m20', 'm40', 'm60', 'm120', 'm240', 'm120max', 'm240max']) {
  if (fs.existsSync(path.join(inDir, `${name}.json`))) { M[name] = mosaic(name); log(`${name}: ${M[name].meta.size}^2 cells of ${M[name].meta.cellSize} m`); }
}
if (!M.m20) throw new Error(`no ${inDir}/m20.json: run tools/pgda_mosaic.py first`);
const fine = readGrid('sp_fine', dataDir), coarse = readGrid('sp_coarse', dataDir);
const gm = readJson(path.join(dataDir, 'global_dem.json'));
const global = createGlobalGrid(gm, new Int16Array(fs.readFileSync(path.join(dataDir, 'global_dem.bin')).buffer.slice(0)));
const tiles = readHiresTiles(dataDir);
const tileIndex = readJson(path.join(dataDir, 'hires/index.json')).tiles;

// Sanity check: the mosaic must agree with the shipped 240 m grid and with the shipped
// 20 m tiles (same source), or something is flipped or scaled.
{
  let n = 0, sad = 0, sb = 0, tn = 0, tad = 0;
  for (let i = 0; i < 4000; i++) {
    const x = -150000 + ((i * 7919) % 300000), y = -150000 + ((i * 104729) % 300000);
    if (!M.m20.covers(x, y) || !fine.covers(x, y)) continue;
    const a = M.m20.sample(x, y), b = fine.sample(x, y);
    if (Number.isFinite(a) && Number.isFinite(b)) { n++; sad += Math.abs(a - b); sb += a - b; }
    for (const t of tiles) if (t.covers(x, y)) { const c = t.sample(x, y); if (Number.isFinite(a) && Number.isFinite(c)) { tn++; tad += Math.abs(a - c); } break; }
  }
  log(`mosaic vs 240 m grid: mean |diff| ${(sad / n).toFixed(1)} m, bias ${(sb / n).toFixed(1)} m (${n} points); vs shipped 20 m tiles ${tn ? (tad / tn).toFixed(2) : '-'} m (${tn} points)`);
  if (!skipCheck && !(sad / n < 60)) throw new Error('the 20 m mosaic does not match the 240 m grid: check orientation and units');
  if (!skipCheck && tn && !(tad / tn < 2)) throw new Error('the 20 m mosaic does not match the shipped 20 m tiles');
}

/** Bucketed lookup of the shipped 20 m tiles, as a grid-like object. */
function tileSet(list) {
  const B = 16000, buckets = new Map();
  for (const g of list) {
    const h = g.meta.halfExtent, cx = g.meta.centreX, cy = g.meta.centreY;
    for (let i = Math.floor((cx - h) / B); i <= Math.floor((cx + h) / B); i++) for (let j = Math.floor((cy - h) / B); j <= Math.floor((cy + h) / B); j++) {
      const k = `${i},${j}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(g);
    }
  }
  return {
    meta: { cellSize: 20, name: 'tiles' },
    covers: () => true,
    sample(x, y) {
      for (const g of buckets.get(`${Math.floor(x / B)},${Math.floor(y / B)}`) ?? []) if (g.covers(x, y)) { const v = g.sample(x, y); if (Number.isFinite(v)) return v; }
      return NaN;
    },
  };
}
const allTiles = tileSet(tiles);

/**
 * Terrain for one observer: bands of [grid, max distance from the observer in m],
 * tried in order; then the 1 km polar grid and the whole-Moon grid.
 */
function banded(ox, oy, bands) {
  const list = [...bands, [coarse, Infinity]];
  return {
    heightAt(lat, lon) {
      if (lat <= -60) {
        const { x, y } = toSouthPolar(lat, lon);
        const d = Math.hypot(x - ox, y - oy);
        for (const [g, maxD] of list) {
          if (d > maxD || !g.covers(x, y)) continue;
          const h = g.sample(x, y);
          if (Number.isFinite(h)) return { height: h, cell: g.meta.cellSize };
        }
      }
      return { height: global.heightAt(lat, lon), cell: global.cell, global: true };
    },
    coverageLabel: () => 'study',
  };
}

const INF = Infinity;
// name -> (point) => { bands, growth }
const VARIANTS = {
  // What ships today. Listed sites: every 20 m tile, then 240 m. Custom points: only the
  // tiles the browser loads (the one under the point and those within HIRES_REACH_M).
  shipped: (p) => ({ bands: [[allTiles, INF], [fine, INF]] }),
  shippedCustom: (p) => ({ bands: [[p.appTiles, INF], [fine, INF]] }),
  // 20 m out to a radius, then today's 240 m.
  near10: (p) => ({ bands: [[M.m20, 10000], [fine, INF]] }),
  near20: (p) => ({ bands: [[M.m20, 20000], [fine, INF]] }),
  near30: (p) => ({ bands: [[M.m20, 30000], [fine, INF]] }),
  // Today's 20 m tiles, then a finer middle grid made from the 20 m data.
  tiles_m60: (p) => ({ bands: [[allTiles, INF], [M.m60, INF]] }),
  tiles_m120: (p) => ({ bands: [[allTiles, INF], [M.m120, INF]] }),
  tiles_m240: (p) => ({ bands: [[allTiles, INF], [M.m240, INF]] }),
  tiles_m240max: (p) => ({ bands: [[allTiles, INF], [M.m240max, INF]] }),
  // 20 m near, finer middle grid beyond (what we could ship for any point).
  near5_m60: (p) => ({ bands: [[M.m20, 5000], [M.m60, INF]] }),
  near10_m60: (p) => ({ bands: [[M.m20, 10000], [M.m60, INF]] }),
  near10_m120: (p) => ({ bands: [[M.m20, 10000], [M.m120, INF]] }),
  near10_m40_30_m120: (p) => ({ bands: [[M.m20, 10000], [M.m40, 30000], [M.m120, INF]] }),
  near3_m60_50_m240: (p) => ({ bands: [[M.m20, 3000], [M.m60, 50000], [M.m240, INF]] }),
  near10_m60_50_m240: (p) => ({ bands: [[M.m20, 10000], [M.m60, 50000], [M.m240, INF]] }),
  near10_m120max: (p) => ({ bands: [[M.m20, 10000], [M.m120max, INF]] }),
  // Sampling only: the reference terrain with the app's usual ray steps.
  m20_appSteps: (p) => ({ bands: [[M.m20, INF]] }),
};
const REF = (p) => ({ bands: [[M.m20, INF]], growth: 0.003 });

// ---- Points ---------------------------------------------------------------------
const sites = readJson(path.join(root, 'src/data/sites.json')).filter((s) => s.lat <= -80);
const pgda = Object.fromEntries(readJson(path.join(dataDir, 'pgda_check.json')).sites.map((r) => [r.id, r]));
const points = sites.map((s) => ({ id: s.id, kind: 'site', lat: s.lat, lon: s.lon }));
{
  // Fixed pseudo-random points poleward of ~85 S, inside the 180 km mosaic.
  let seed = 20261125;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < (quick ? 6 : 60); i++) {
    const rho = 150000 * Math.sqrt(rnd()), th = 2 * Math.PI * rnd();
    const { lat, lon } = fromSouthPolar(rho * Math.sin(th), rho * Math.cos(th));
    points.push({ id: `p${String(i).padStart(2, '0')}`, kind: 'random', lat, lon });
  }
}
for (const p of points) {
  const { x, y } = toSouthPolar(p.lat, p.lon);
  p.x = x; p.y = y;
  const onTile = tilesNear(tileIndex, x, y, -500).length > 0;
  p.onTile = onTile;
  const ids = new Set(onTile ? tilesNear(tileIndex, x, y, HIRES_REACH_M).map((t) => t.id) : []);
  p.appTiles = tileSet(tiles.filter((t) => ids.has(t.meta.name.replace(/^hires_/, ''))));
}
const usePoints = quick ? points.filter((p, i) => p.kind === 'random' || i < 6) : points;

// ---- Sun / Earth shares, as PGDA computes them ---------------------------------------
const t0 = Date.UTC(2009, 0, 1), t1 = t0 + 18.6 * 365.25 * 86400000;
const stepH = quick ? 12 : 3;
const states = [];
for (let t = t0; t < t1; t += stepH * 3600000) { const s = moonFixedState(t); states.push({ sun: s.sun, earth: s.earth }); }
log(`${states.length} Sun/Earth positions (${stepH}-hour steps over 18.6 years)`);

function shares(p, h) {
  const r0 = R + h.groundHeight + h.mastHeight;
  const cl = Math.cos(p.lat * DEG), sl = Math.sin(p.lat * DEG), co = Math.cos(p.lon * DEG), so = Math.sin(p.lon * DEG);
  const up = [cl * co, cl * so, sl], east = [-so, co, 0], north = [-sl * co, -sl * so, cl];
  const n = h.elevations.length, el = h.elevations;
  const look = (v, radius) => {
    const d0 = v[0] - up[0] * r0, d1 = v[1] - up[1] * r0, d2 = v[2] - up[2] * r0, L = Math.hypot(d0, d1, d2);
    const e = Math.asin((d0 * up[0] + d1 * up[1] + d2 * up[2]) / L) / DEG;
    let az = Math.atan2(d0 * east[0] + d1 * east[1], d0 * north[0] + d1 * north[1] + d2 * north[2]) / DEG;
    if (az < 0) az += 360;
    const f = (az / 360) * n, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, t = f - Math.floor(f);
    return { el: e, hz: el[i0] * (1 - t) + el[i1] * t, rad: Math.asin(radius / L) / DEG };
  };
  let sun = 0, earth = 0;
  for (const st of states) {
    const a = look(st.sun, 695700e3); sun += visibleDiskFraction(a.el, a.hz, a.rad);
    const b = look(st.earth, 6371e3); if (b.el > b.hz - b.rad) earth++;
  }
  return { sun: (100 * sun) / states.length, earth: (100 * earth) / states.length };
}

function skyline(p, v, { mast = 2, lat = p.lat, lon = p.lon } = {}) {
  const { bands, growth } = v(p);
  const { x, y } = toSouthPolar(lat, lon);
  const opts = { mastHeight: mast, maxDistM: 300000 };
  if (growth) opts.growth = growth;
  return computeHorizon(banded(x, y, bands), lat, lon, opts);
}

const diffStats = (a, b) => {
  let s2 = 0, mx = 0, sm = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s2 += d * d; sm += d; if (Math.abs(d) > Math.abs(mx)) mx = d; }
  return { rmsDeg: Math.sqrt(s2 / a.length), maxDeg: mx, meanDeg: sm / a.length };
};
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

// ---- Run ------------------------------------------------------------------------
const rows = [];
for (const p of usePoints) {
  const tp = Date.now();
  const ref = skyline(p, REF);
  const refShares = shares(p, ref);
  const row = { id: p.id, kind: p.kind, lat: r2(p.lat), lon: r2(p.lon), onTile: p.onTile, groundM: Math.round(ref.groundHeight), ref: { sun: r2(refShares.sun), earth: r2(refShares.earth) }, variants: {} };
  if (p.kind === 'site') {
    const pg = pgda[p.id] || {};
    row.pgdaSun60 = pg.pgdaSun60 ?? null; row.pgdaSun120 = pg.pgdaSun120 ?? null; row.pgdaEarth120 = pg.pgdaEarth120 ?? null;
    // At the surface instead of a 2 m mast.
    const m0 = shares(p, skyline(p, REF, { mast: 0.1 }));
    row.refMast0 = { sun: r2(m0.sun), earth: r2(m0.earth) };
    // Move the point 60 m in 8 directions: how much does the answer change?
    const around = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * 45) * DEG, q = fromSouthPolar(p.x + 60 * Math.sin(a), p.y + 60 * Math.cos(a));
      around.push(shares(p, skyline({ ...p, lat: q.lat, lon: q.lon }, (pp) => ({ bands: [[M.m20, 10000], [M.m60, INF]] }), { lat: q.lat, lon: q.lon })).sun);
    }
    row.sunWithin60m = { min: r2(Math.min(...around)), max: r2(Math.max(...around)) };
  }
  for (const [name, v] of Object.entries(VARIANTS)) {
    if (name === 'shippedCustom' && p.kind === 'site') continue;
    const h = skyline(p, v);
    const s = shares(p, h);
    const d = diffStats(h.elevations, ref.elevations);
    row.variants[name] = { sun: r2(s.sun), earth: r2(s.earth), dSun: r2(s.sun - refShares.sun), dEarth: r2(s.earth - refShares.earth), rmsDeg: Math.round(d.rmsDeg * 1000) / 1000, maxDeg: Math.round(d.maxDeg * 1000) / 1000, meanDeg: Math.round(d.meanDeg * 1000) / 1000 };
  }
  rows.push(row);
  const sh = row.variants.shipped;
  log(`${p.id.padEnd(16)} ref sun ${row.ref.sun.toFixed(1).padStart(5)}% earth ${row.ref.earth.toFixed(1).padStart(5)}% | shipped ${sh.dSun >= 0 ? '+' : ''}${sh.dSun.toFixed(1)} pts, skyline rms ${sh.rmsDeg.toFixed(3)} deg${row.pgdaSun60 != null ? ` | PGDA 60 m ${row.pgdaSun60}%` : ''}${row.sunWithin60m ? ` | 60 m away ${row.sunWithin60m.min}-${row.sunWithin60m.max}%` : ''} (${((Date.now() - tp) / 1000).toFixed(1)} s)`);
}

// ---- Summary ----------------------------------------------------------------------
const quant = (arr, q) => { const b = arr.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : null; };
const summary = {};
for (const name of Object.keys(VARIANTS)) {
  const out = {};
  for (const kind of ['site', 'random']) {
    const rs = rows.filter((r) => r.kind === kind && r.variants[name]);
    if (!rs.length) continue;
    const dS = rs.map((r) => Math.abs(r.variants[name].dSun)), dE = rs.map((r) => Math.abs(r.variants[name].dEarth)), rms = rs.map((r) => r.variants[name].rmsDeg);
    out[kind] = { n: rs.length, sunMedianAbsPts: r2(quant(dS, 0.5)), sunP90AbsPts: r2(quant(dS, 0.9)), sunMaxAbsPts: r2(Math.max(...dS)), sunMeanSignedPts: r2(rs.reduce((a, r) => a + r.variants[name].dSun, 0) / rs.length), earthMedianAbsPts: r2(quant(dE, 0.5)), earthMaxAbsPts: r2(Math.max(...dE)), skylineRmsMedianDeg: Math.round(quant(rms, 0.5) * 1000) / 1000 };
    if (kind === 'site') {
      const vp = rs.filter((r) => r.pgdaSun60 != null).map((r) => Math.abs(r.variants[name].sun - r.pgdaSun60));
      out.site.vsPgda60MedianAbsPts = r2(quant(vp, 0.5)); out.site.vsPgda60MaxAbsPts = r2(Math.max(...vp));
    }
  }
  summary[name] = out;
}
{
  const rs = rows.filter((r) => r.kind === 'site' && r.pgdaSun60 != null);
  const vp = rs.map((r) => Math.abs(r.ref.sun - r.pgdaSun60));
  summary.reference = { site: { n: rs.length, vsPgda60MedianAbsPts: r2(quant(vp, 0.5)), vsPgda60MaxAbsPts: r2(Math.max(...vp)) } };
  const spread = rows.filter((r) => r.sunWithin60m).map((r) => r.sunWithin60m.max - r.sunWithin60m.min);
  summary.positionSensitivity = { site: { medianSpreadPts: r2(quant(spread, 0.5)), maxSpreadPts: r2(Math.max(...spread)), note: 'range of the sunlight share over 8 points 60 m from each site' } };
}

// Download cost of each middle grid if shipped as packed 16 km tiles (same codec as hires/).
const cost = {};
for (const name of ['m20', 'm40', 'm60', 'm120', 'm240']) {
  const g = M[name]; if (!g) continue;
  const n = g.meta.size, cells = Math.round(16000 / g.meta.cellSize), data = readGridData(name);
  let bytes = 0, count = 0;
  for (let r0 = 0; r0 + cells <= n; r0 += cells) for (let c0 = 0; c0 + cells <= n; c0 += cells) {
    const t = new Int16Array(cells * cells);
    for (let r = 0; r < cells; r++) t.set(data.subarray((r0 + r) * n + c0, (r0 + r) * n + c0 + cells), r * cells);
    bytes += zlib.gzipSync(Buffer.from(deltaEncode(t, cells).buffer), { level: 9 }).length; count++;
    if (quick && count > 40) break;
  }
  cost[name] = { tileKm: 16, tiles: count, avgTileKB: Math.round(bytes / count / 1024), wholeGridMB: Math.round(((bytes / count) * (n / cells) ** 2) / 1048576), discOf50kmMB: Math.round(((bytes / count) * (Math.PI * 50 ** 2) / 256) / 1048576 * 10) / 10 };
}
function readGridData(name) { const buf = fs.readFileSync(path.join(inDir, `${name}.i16`)); return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2); }

const result = {
  generated: new Date().toISOString(), commit: sourceCommit(), quick,
  method: 'Skylines (0.5 deg azimuth steps, 2 m mast) from NASA PGDA LDEM_80S_20MPP_ADJ cut to +-180 km and block-averaged copies of it, in distance bands from the observer; beyond 180 km the app\'s 1 km polar grid and whole-Moon grid. Reference: 20 m everywhere, ray steps 0.3% of distance (the app uses 1.5%). Shares as NASA PGDA AVGVISIB: visible fraction of the Sun\'s disk, Earth when any of its disk is above the skyline, 18.6-year cycle from 2009.',
  variants: Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, v({ appTiles: { meta: { name: 'tiles near the point', cellSize: 20 } } }).bands.map(([g, d]) => `${g.meta.name ?? g.meta.cellSize + ' m'} ${d === INF ? '' : `to ${d / 1000} km`}`.trim()).join(', then ')])),
  summary, cost, rows,
};
const outDir = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(root, 'docs/validation');
fs.writeFileSync(path.join(outDir, 'terrain-study.json'), JSON.stringify(result, null, 1));

// Readable table
const L = [];
L.push('# Terrain resolution study', '', `Generated ${result.generated} by tools/terrain_study.mjs (commit ${String(result.commit).slice(0, 7)}).`, '', result.method, '');
L.push('Differences are in percentage points of the sunlight (or Earth-in-view) share, against the reference.', '');
L.push('| Variant | Terrain | Sites: sun median / max | Random points: sun median / 90% / max | Earth max (sites / points) | Sites vs PGDA 60 m: median / max |', '|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(summary)) {
  if (k === 'reference' || k === 'positionSensitivity') continue;
  const s = v.site || {}, p = v.random || {};
  L.push(`| ${k} | ${result.variants[k]} | ${s.sunMedianAbsPts ?? '-'} / ${s.sunMaxAbsPts ?? '-'} | ${p.sunMedianAbsPts ?? '-'} / ${p.sunP90AbsPts ?? '-'} / ${p.sunMaxAbsPts ?? '-'} | ${s.earthMaxAbsPts ?? '-'} / ${p.earthMaxAbsPts ?? '-'} | ${s.vsPgda60MedianAbsPts ?? '-'} / ${s.vsPgda60MaxAbsPts ?? '-'} |`);
}
L.push(`| reference | 20 m to 180 km, dense steps | 0 | 0 | 0 | ${summary.reference.site.vsPgda60MedianAbsPts} / ${summary.reference.site.vsPgda60MaxAbsPts} |`, '');
L.push(`Moving a site 60 m changes its sunlight share by a median ${summary.positionSensitivity.site.medianSpreadPts} points (worst ${summary.positionSensitivity.site.maxSpreadPts}).`, '');
L.push('## Download size if shipped as 16 km packed tiles', '', '| Grid | Average tile | Whole +-180 km | A 50 km disc |', '|---|---|---|---|');
for (const [k, c] of Object.entries(cost)) L.push(`| ${k} | ${c.avgTileKB} KB | ${c.wholeGridMB} MB | ${c.discOf50kmMB} MB |`);
L.push('', '## Sites', '', '| Site | Reference sun / Earth | Shipped | near10_m60 | PGDA 60 m | At the surface | 60 m away |', '|---|---|---|---|---|---|---|');
for (const r of rows.filter((x) => x.kind === 'site')) {
  const f = (v) => (v ? `${v.sun} (${v.dSun >= 0 ? '+' : ''}${v.dSun})` : '-');
  L.push(`| ${r.id} | ${r.ref.sun} / ${r.ref.earth} | ${f(r.variants.shipped)} | ${f(r.variants.near10_m60)} | ${r.pgdaSun60 ?? '-'} | ${r.refMast0?.sun ?? '-'} | ${r.sunWithin60m ? `${r.sunWithin60m.min}-${r.sunWithin60m.max}` : '-'} |`);
}
fs.writeFileSync(path.join(outDir, 'terrain-study.md'), L.join('\n') + '\n');
log(`wrote ${outDir}/terrain-study.{json,md}`);
console.log(L.join('\n'));
