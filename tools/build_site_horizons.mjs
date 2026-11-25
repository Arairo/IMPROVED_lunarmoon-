#!/usr/bin/env node
// Rebuild every listed site's terrain horizon from LOLA: the 240 m / 1 km
// south-polar grids where they reach, and the whole-Moon LOLA grid elsewhere.
//
//   node tools/build_site_horizons.mjs [data-raw/ldem_16.img] [--only-hires]
//
// 20 m tiles in public/data/hires/ (tools/build_hires_terrain.mjs) are used first
// where present. --only-hires rebuilds just the sites that have a 20 m tile and
// keeps every other site as it is. --polar rebuilds just the sites at or south of
// 80° S, whose skylines come entirely from the committed south-polar grids, so the
// result doesn't depend on which whole-Moon grid is available.
//
// With an LDEM image the full-resolution map is used (best); without one it
// falls back to public/data/global_dem.bin. Writes src/data/precomputedHorizons.{js,json}
// and public/data/precomputedHorizons.json (180 samples, 2° apart, 2 m mast).
import fs from 'node:fs';
import path from 'node:path';
import { createGrid, createTerrain, computeHorizon } from '../src/core/horizon.js';
import { createGlobalGrid } from '../src/core/globalDem.js';
import { loadLdem } from './build_global_dem.mjs';
import { toSouthPolar } from '../src/core/geo.js';
import { readHiresTiles } from './lib/grids.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = path.join(root, 'public/data');
const grid = (name) => createGrid(JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8')), new Int16Array(fs.readFileSync(path.join(dataDir, `${name}.bin`)).buffer.slice(0)));

function globalGrid(imgPath) {
  if (imgPath) {
    const src = loadLdem(imgPath);
    const data = Int16Array.from(src.heights, (v) => Math.round(v));
    return createGlobalGrid({ ppd: src.ppd, width: src.w, height: src.h }, data);
  }
  const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'global_dem.json'), 'utf8'));
  return createGlobalGrid(meta, new Int16Array(fs.readFileSync(path.join(dataDir, 'global_dem.bin')).buffer.slice(0)));
}

const args = process.argv.slice(2);
const onlyHires = args.includes('--only-hires');
const polarOnly = args.includes('--polar');
const imgArg = args.find((a) => !a.startsWith('--'));
const hiresIndex = path.join(dataDir, 'hires/index.json');
const tiles = fs.existsSync(hiresIndex) ? readHiresTiles(dataDir) : [];
/** True if the site stands on one of the 20 m tiles. */
const onHires = (s) => { const { x, y } = toSouthPolar(s.lat, s.lon); return tiles.some((t) => t.covers(x, y)); };
const sites = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sites.json'), 'utf8'));
const terrain = createTerrain([...tiles, grid('sp_fine'), grid('sp_coarse')], globalGrid(imgArg));
const out = onlyHires || polarOnly ? JSON.parse(fs.readFileSync(path.join(root, 'src/data/precomputedHorizons.json'), 'utf8')) : {};
for (const s of sites) {
  if (onlyHires && !onHires(s)) continue;
  if (polarOnly && s.lat > -80) continue;
  const h = computeHorizon(terrain, s.lat, s.lon, { mastHeight: 2 });
  const q = h.quality;
  out[s.id] = {
    // Where it was computed: the app checks these, so another place reusing the id never gets this skyline.
    lat: s.lat, lon: s.lon,
    groundHeight: Math.round(h.groundHeight),
    source: h.source,
    terrain: h.terrain,
    // How it was sampled (see horizonQuality in src/core/horizon.js).
    siteCellM: q.siteCellM, coarsestCellM: q.coarsestCellM, maxStepM: q.maxStepM, growth: q.growth, refine: q.refine,
    el180: Array.from({ length: 180 }, (_, k) => Math.round(h.elevations[k * 4] * 100) / 100),
  };
  const maxEl = Math.max(...out[s.id].el180);
  console.log(`${s.id.padEnd(16)} ${h.source.padEnd(24)} ground ${String(out[s.id].groundHeight).padStart(6)} m, highest skyline ${maxEl.toFixed(2)}°`);
}
const json = JSON.stringify(out);
fs.writeFileSync(path.join(root, 'src/data/precomputedHorizons.json'), json);
fs.writeFileSync(path.join(root, 'src/data/precomputedHorizons.js'), `export default ${json};\n`);
fs.writeFileSync(path.join(dataDir, 'precomputedHorizons.json'), json);
console.log(`wrote horizons for ${sites.length} sites`);
