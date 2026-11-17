#!/usr/bin/env node
// Whole-Moon map layers with real terrain: the share of 2027 with the Sun's
// centre above the local skyline, and with Earth's centre above it.
//
//   node tools/build_map_layers.mjs [--year 2027] [--threads 4]
//
// Terrain: LOLA south-polar grids (240 m / 1 km) + the whole-Moon LOLA grid
// (public/data/global_dem.*). For each map cell we ray-cast the skyline in 72
// directions out to 300 km (2 m mast), then test the Sun and Earth against it
// every 6 hours for a year. Output (public/data/layers.{bin,json}):
//   global   360 x 180, 1° cells, lat +89.5..-89.5, lon -179.5..179.5
//   south    184 x 184, 5 km cells, south-polar stereographic, ±460 km (lat < ~-75°)
//   north    184 x 184, 5 km cells, north-polar stereographic, ±460 km
// Each grid stores sun %, earth % and both % (Sun and Earth up together) as
// Uint8 (value / 2 = percent). public/data/layer_skylines.{bin,json} keeps every
// cell's skyline (36 azimuths, int8 in 0.25° steps) so the browser can draw the
// map for any moment or any 30-day window.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = 1737400, DEG = Math.PI / 180;
const AZ = 72, MAST = 2, SKY_AZ = 36, SKY_STEP = 0.25;
const CAP_N = 184, CAP_CELL = 5000, CAP_HALF = (CAP_N * CAP_CELL) / 2;

// Cell centres for the three grids, flattened: [lat, lon] pairs.
function cells(kind) {
  const out = [];
  if (kind === 'global') {
    for (let r = 0; r < 180; r++) for (let c = 0; c < 360; c++) out.push([89.5 - r, -179.5 + c]);
  } else {
    const sgn = kind === 'south' ? -1 : 1;
    for (let r = 0; r < CAP_N; r++) for (let c = 0; c < CAP_N; c++) {
      const x = -CAP_HALF + (c + 0.5) * CAP_CELL, y = CAP_HALF - (r + 0.5) * CAP_CELL;
      const rho = Math.hypot(x, y);
      const colat = 2 * Math.atan(rho / (2 * R));
      // south: x = rho sin(lon), y = rho cos(lon); north: x = rho sin(lon), y = -rho cos(lon)
      const lon = Math.atan2(x, sgn < 0 ? y : -y) / DEG;
      out.push([sgn * (90 - colat / DEG), lon]);
    }
  }
  return out;
}

async function main() {
  const year = Number(process.argv[process.argv.indexOf('--year') + 1] || 0) || 2027;
  const threads = Number(process.argv[process.argv.indexOf('--threads') + 1] || 0) || Math.max(1, os.cpus().length);
  // Sun and Earth directions in the Moon-fixed frame, every 6 h through the year.
  const { moonFixedState } = await import('../src/core/ephemeris.js');
  const t0 = Date.UTC(year, 0, 1), t1 = Date.UTC(year + 1, 0, 1), step = 6 * 3600000;
  const sun = [], earth = [];
  for (let t = t0; t < t1; t += step) {
    const s = moonFixedState(t);
    sun.push(...s.sun); earth.push(...s.earth);
  }
  const out = { global: null, south: null, north: null };
  for (const kind of ['global', 'south', 'north']) {
    const list = cells(kind);
    const chunk = Math.ceil(list.length / threads);
    const started = Date.now();
    const parts = await Promise.all(Array.from({ length: threads }, (_, k) => new Promise((resolve, reject) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { cells: list.slice(k * chunk, (k + 1) * chunk), sun, earth } });
      w.on('message', resolve); w.on('error', reject);
    })));
    const sunPct = new Uint8Array(list.length), earthPct = new Uint8Array(list.length), bothPct = new Uint8Array(list.length);
    const sky = new Int8Array(list.length * SKY_AZ);
    let o = 0;
    for (const p of parts) { sunPct.set(p.sun, o); earthPct.set(p.earth, o); bothPct.set(p.both, o); sky.set(p.sky, o * SKY_AZ); o += p.sun.length; }
    out[kind] = { sunPct, earthPct, bothPct, sky };
    console.log(`${kind}: ${list.length} cells in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  const bufs = [out.global.sunPct, out.global.earthPct, out.south.sunPct, out.south.earthPct, out.north.sunPct, out.north.earthPct, out.global.bothPct, out.south.bothPct, out.north.bothPct];
  fs.writeFileSync(path.join(root, 'public/data/layer_skylines.bin'), Buffer.concat(['global', 'south', 'north'].map((k) => Buffer.from(out[k].sky.buffer))));
  fs.writeFileSync(path.join(root, 'public/data/layer_skylines.json'), JSON.stringify({
    description: 'Terrain skyline of every map-layer cell (same cells and order as layers.json: global, then south, then north), 2 m mast, LOLA terrain.',
    azimuths: SKY_AZ, azimuthStartDeg: 0, stepDeg: SKY_STEP, dtype: 'int8', unit: 'elevation = value x stepDeg degrees; azimuth k = k x 360 / azimuths, clockwise from north',
    cells: { global: 64800, south: CAP_N * CAP_N, north: CAP_N * CAP_N },
  }, null, 1));
  fs.writeFileSync(path.join(root, 'public/data/layers.bin'), Buffer.concat(bufs.map((b) => Buffer.from(b.buffer))));
  const meta = {
    description: `Share of ${year} with the Sun's centre (sun) and Earth's centre (earth) above the local LOLA terrain skyline, 2 m mast, 6-hour sampling. Values are uint8 = percent x 2.`,
    year, stepHours: 6, mastM: MAST, azimuths: AZ,
    order: ['global.sun', 'global.earth', 'south.sun', 'south.earth', 'north.sun', 'north.earth', 'global.both', 'south.both', 'north.both'],
    global: { width: 360, height: 180, cellDeg: 1, rowOrder: 'row 0 at lat 89.5, column 0 at lon -179.5' },
    south: { size: CAP_N, cellM: CAP_CELL, halfExtentM: CAP_HALF, projection: 'south-polar stereographic: x = rho sin(lon), y = rho cos(lon), row 0 at +y' },
    north: { size: CAP_N, cellM: CAP_CELL, halfExtentM: CAP_HALF, projection: 'north-polar stereographic: x = rho sin(lon), y = -rho cos(lon), row 0 at +y' },
    terrain: 'NASA LRO LOLA: 240 m / 1 km south-polar grids and the LDEM_16-based global grid (8 px/deg)',
    built: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(root, 'public/data/layers.json'), JSON.stringify(meta, null, 2));
  console.log('wrote public/data/layers.{bin,json}');
}

async function work() {
  const { createGrid, createTerrain } = await import('../src/core/horizon.js');
  const { createGlobalGrid } = await import('../src/core/globalDem.js');
  const { destination } = await import('../src/core/geo.js');
  const dataDir = path.join(root, 'public/data');
  const grid = (n) => createGrid(JSON.parse(fs.readFileSync(path.join(dataDir, `${n}.json`))), new Int16Array(fs.readFileSync(path.join(dataDir, `${n}.bin`)).buffer.slice(0)));
  const gmeta = JSON.parse(fs.readFileSync(path.join(dataDir, 'global_dem.json')));
  const terrain = createTerrain([grid('sp_fine'), grid('sp_coarse')], createGlobalGrid(gmeta, new Int16Array(fs.readFileSync(path.join(dataDir, 'global_dem.bin')).buffer.slice(0))));
  const { cells: list, sun, earth } = workerData;
  const T = sun.length / 3;
  const sunOut = new Uint8Array(list.length), earthOut = new Uint8Array(list.length), bothOut = new Uint8Array(list.length);
  const skyOut = new Int8Array(list.length * SKY_AZ);
  const hz = new Float32Array(AZ);
  for (let k = 0; k < list.length; k++) {
    const [lat, lon] = list[k];
    const g = terrain.heightAt(lat, lon);
    const h0 = g ? g.height : 0;
    const r0 = R + h0 + MAST;
    for (let a = 0; a < AZ; a++) {
      let best = -90; // terrain is sampled everywhere (global grid), so the skyline comes from it
      for (let s = 1500; s < 300000; s *= 1.045) {
        const p = destination(lat, lon, (a * 360) / AZ, s);
        const h = terrain.heightAt(p.lat, p.lon);
        if (!h) continue;
        const th = s / R, r1 = R + h.height;
        const el = Math.atan2(r1 * Math.cos(th) - r0, r1 * Math.sin(th)) / DEG;
        if (el > best) best = el;
      }
      hz[a] = best;
    }
    // Local east/north/up and the site position.
    const cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG), co = Math.cos(lon * DEG), so = Math.sin(lon * DEG);
    const up = [cl * co, cl * so, sl], east = [-so, co, 0], north = [-sl * co, -sl * so, cl];
    const px = up[0] * r0, py = up[1] * r0, pz = up[2] * r0;
    let ns = 0, ne = 0;
    const test = (arr, i) => {
      const dx = arr[i * 3] - px, dy = arr[i * 3 + 1] - py, dz = arr[i * 3 + 2] - pz;
      const d = Math.hypot(dx, dy, dz);
      const u = (dx * up[0] + dy * up[1] + dz * up[2]) / d;
      const el = Math.asin(u) / DEG;
      if (el < -8) return false;
      const e = dx * east[0] + dy * east[1] + dz * east[2], n = dx * north[0] + dy * north[1] + dz * north[2];
      let az = Math.atan2(e, n) / DEG; if (az < 0) az += 360;
      const f = (az / 360) * AZ, i0 = Math.floor(f) % AZ, i1 = (i0 + 1) % AZ, t = f - Math.floor(f);
      return el > hz[i0] * (1 - t) + hz[i1] * t;
    };
    let nb = 0;
    for (let i = 0; i < T; i++) { const a = test(sun, i), b = test(earth, i); if (a) ns++; if (b) ne++; if (a && b) nb++; }
    sunOut[k] = Math.round((ns / T) * 200);
    earthOut[k] = Math.round((ne / T) * 200);
    bothOut[k] = Math.round((nb / T) * 200);
    // Every other azimuth (10° apart) for the browser, which interpolates between them.
    const per = AZ / SKY_AZ;
    for (let j = 0; j < SKY_AZ; j++) skyOut[k * SKY_AZ + j] = Math.max(-127, Math.min(127, Math.round(hz[j * per] / SKY_STEP)));
  }
  parentPort.postMessage({ sun: sunOut, earth: earthOut, both: bothOut, sky: skyOut });
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else work();
