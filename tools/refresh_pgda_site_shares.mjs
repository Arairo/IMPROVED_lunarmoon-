#!/usr/bin/env node
// Recompute OUR per-site 2027 sunlight / Earth shares in public/data/pgda_check.json
// with the current horizon engine, keeping NASA PGDA's values and the map
// comparison as they are. Use this after a change to the horizon engine; the PGDA
// numbers themselves only come from tools/build_hires_terrain.mjs (needs the
// downloaded PGDA files, see .github/workflows/pgda.yml).
//
//   node tools/refresh_pgda_site_shares.mjs
//
// Same method as build_hires_terrain.mjs: 2 m mast, skyline every 2°, the Sun's /
// Earth's centre above the skyline, every 6 h through 2027.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGrid, createTerrain, computeHorizon, RAY_REFINE, RAY_GROWTH } from '../src/core/horizon.js';
import { createGlobalGrid } from '../src/core/globalDem.js';
import { moonFixedState } from '../src/core/ephemeris.js';
import { readGrid, readHiresTiles } from './lib/grids.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'public/data');
const R = 1737400, DEG = Math.PI / 180;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const grid = (name) => readGrid(name, dataDir);

const fine = grid('sp_fine'), coarse = grid('sp_coarse');
const gmeta = readJson(path.join(dataDir, 'global_dem.json'));
const global = createGlobalGrid(gmeta, new Int16Array(fs.readFileSync(path.join(dataDir, 'global_dem.bin')).buffer.slice(0)));
const tiles = readHiresTiles(dataDir);
const base = createTerrain([fine, coarse], global);
const withHires = createTerrain([...tiles, fine, coarse], global);

const states = [];
for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 6 * 3600000) states.push(moonFixedState(t));
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

const file = path.join(dataDir, 'pgda_check.json');
const check = readJson(file);
const sites = readJson(path.join(root, 'src/data/sites.json'));
for (const row of check.sites) {
  const s = sites.find((x) => x.id === row.id);
  if (!s) continue;
  const before = { ours240: row.ours240, ours20: row.ours20 };
  row.ours240 = share(computeHorizon(base, s.lat, s.lon, { mastHeight: 2, azStepDeg: 2 }), s.lat, s.lon);
  if (row.ours20) row.ours20 = share(computeHorizon(withHires, s.lat, s.lon, { mastHeight: 2, azStepDeg: 2 }), s.lat, s.lon);
  console.log(`${row.id.padEnd(16)} 240 m ${JSON.stringify(before.ours240)} -> ${JSON.stringify(row.ours240)}   20 m ${JSON.stringify(before.ours20)} -> ${JSON.stringify(row.ours20)}`);
}
check.sitesRecomputed = { at: new Date().toISOString(), engine: { growth: RAY_GROWTH, refine: RAY_REFINE }, by: 'tools/refresh_pgda_site_shares.mjs' };
fs.writeFileSync(file, JSON.stringify(check, null, 1));
console.log('updated', path.relative(root, file));
