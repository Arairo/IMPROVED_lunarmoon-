#!/usr/bin/env node
// Data manifest: every file in public/data with its size and SHA-256, grouped into
// datasets with their source, resolution, frame, units, generating script and limits.
//
//   node tools/build_manifest.mjs           # writes public/data/manifest.json
//   node tools/build_manifest.mjs --check   # exits 1 if the manifest is out of date
//
// Run it after any data workflow or tool changes a file (test/manifest.spec.js fails
// otherwise). Descriptions below are written by hand from each file's own metadata
// and the tool that made it; checksums and sizes are computed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'public/data');
const out = path.join(dataDir, 'manifest.json');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));

const SPHERE = 'heights in metres above the 1737.4 km LOLA reference sphere';
const POLAR = 'south-polar stereographic on the 1737.4 km sphere, metres';
const NASA = 'NASA data: no US copyright (public domain); credit the source';
const OURS = 'MIT (this project), derived from NASA data';

const hires = read('hires/index.json');
function hiresCoverage(tiles) {
  const region = tiles.filter((t) => t.kind === 'region');
  const codes = [...new Set(region.flatMap((t) => t.regions ?? []))].sort();
  const site = tiles.length - region.length;
  return region.length
    ? `${region.length} tiles of 16 × 16 km covering the Artemis III candidate regions ${codes.join(', ')}; ${site} more around other south-polar sites`
    : `${tiles.length} tiles of 16 × 16 km around south-polar sites`;
}
const DATASETS = [
  {
    id: 'lola-sp-240m', title: 'LOLA south-polar terrain, 240 m', files: ['sp_fine.json', 'sp_fine.bin'],
    provider: 'NASA LRO LOLA', source: read('sp_fine.json').source, resolutionM: 240, coverage: '±180 km around the south pole',
    frame: POLAR, units: `int16 little-endian, ${SPHERE}`, noData: read('sp_fine.json').noData ?? -32768,
    generator: 'tools/build_polar_dem.py (Build global terrain workflow)', licence: NASA,
    limitations: 'Interpolated between LOLA tracks; crests smoothed by tens of metres.',
  },
  {
    id: 'lola-sp-1km', title: 'LOLA south-polar terrain, 1 km', files: ['sp_coarse.json', 'sp_coarse.bin'],
    provider: 'NASA LRO LOLA', source: read('sp_coarse.json').source, resolutionM: 1000, coverage: '±460 km around the south pole (to about 75° S)',
    frame: POLAR, units: `int16 little-endian, ${SPHERE}`, noData: read('sp_coarse.json').noData ?? -32768,
    generator: 'tools/build_polar_dem.py', licence: NASA, limitations: 'Used beyond the 240 m grid only.',
  },
  {
    id: 'lola-global-ldem16', title: 'LOLA whole-Moon terrain', files: ['global_dem.json', 'global_dem.bin'],
    provider: 'NASA LRO LOLA', source: read('global_dem.json').source, resolutionM: 3790, coverage: 'whole Moon',
    frame: 'equirectangular, 8 pixels per degree, east-positive longitude', units: `int16 little-endian, ${SPHERE}`,
    generator: 'tools/build_global_dem.mjs', licence: NASA,
    limitations: 'Block-averaged; site skylines north of 80° S are built from the full LDEM_16 (1.9 km) in CI instead.',
  },
  {
    id: 'lola-pgda-20m-tiles', title: 'LOLA 20 m tiles: Artemis III candidate regions and south-polar sites', files: ['hires/index.json', ...hires.tiles.flatMap((t) => [`hires/${t.id}.json`, `hires/${read(`hires/${t.id}.json`).file ?? `${t.id}.bin`}`])],
    provider: 'NASA GSFC PGDA', source: `${hires.source} (${hires.url})`, resolutionM: 20, coverage: hiresCoverage(hires.tiles),
    frame: POLAR, units: `int16, ${SPHERE}; packed losslessly (src/core/tileCodec.js: difference from the row above, gzip)`, noData: -32768,
    generator: 'tools/build_hires_terrain.mjs (Add 20 m terrain and check against NASA PGDA workflow)', licence: NASA,
    limitations: `Each tile checked against the 240 m grid: mean height difference ${Math.min(...hires.tiles.map((t) => t.meanAbsDiffM))}–${Math.max(...hires.tiles.map((t) => t.meanAbsDiffM))} m; tiles failing a 60 m check (100 m against the 1 km grid) are rejected.`,
  },
  {
    id: 'compact-south-pole', title: 'Compact south-polar terrain and lighting (5 km / 2 km)', files: ['compactDem.json', 'compactIllum.json'],
    provider: 'this project', source: 'derived from the LOLA south-polar grids', resolutionM: 5000, coverage: 'south pole',
    frame: POLAR, units: 'heights in metres; lighting shares × 1000', generator: 'build scripts in tools/', licence: OURS,
    limitations: 'Used only before the detailed terrain loads; results from it are labelled "approximate".',
  },
  {
    id: 'site-skylines', title: 'Precomputed site skylines', files: ['precomputedHorizons.json'],
    provider: 'this project', source: 'ray-cast over the LOLA grids above (2 m mast, skyline every 2°)', resolutionM: null, coverage: 'every listed site',
    frame: 'azimuth clockwise from north, elevation in degrees', units: 'degrees', generator: 'tools/build_site_horizons.mjs', licence: OURS,
    limitations: 'See docs/VALIDATION.md section 3 for sampling convergence.',
  },
  {
    id: 'map-layers-2027', title: 'Sunlight and Earth-visibility map layers, 2027', files: ['layers.json', 'layers.bin', 'layer_skylines.json', 'layer_skylines.bin'],
    provider: 'this project', source: read('layers.json').terrain || 'LOLA grids above', resolutionM: 5000, coverage: 'whole Moon (1°) and both polar caps (5 km)',
    frame: 'see layers.json', units: 'uint8 = percent × 2; skylines int8 × 0.25°', generator: 'tools/build_map_layers.mjs', licence: OURS,
    limitations: 'Skyline in 72 directions (5° apart) with the app ray-caster; 6-hour sampling; disk centre, not disk fraction.',
  },
  {
    id: 'sunlight-map-1km-2027', title: 'South-pole sunlight and Earth-visibility map, 1 km, 2027', files: ['sp_illum_2027.json'],
    provider: 'this project', source: read('sp_illum_2027.json').description, resolutionM: 1000, coverage: '±75 km around the south pole',
    frame: POLAR, units: 'shares × 1000', generator: 'tools/illumination_map.mjs', licence: OURS,
    limitations: 'Average visible fraction of the solar disk, 3-hour sampling; drives the best-spot search and the Beginner sunlight map.',
  },
  {
    id: 'artemis-iii-regions', title: 'Artemis III candidate landing regions', files: ['artemis_regions.geojson'],
    provider: 'USGS', source: 'McClernan 2024, USGS data release doi:10.5066/P1MEQ6UK (from LROC QuickMap)', resolutionM: null, coverage: '9 regions',
    frame: 'GeoJSON longitude/latitude, degrees', units: 'degrees', generator: 'Artemis III regions workflow', licence: 'USGS data: public domain',
    limitations: 'Outlines as released in Oct 2024.',
  },
  {
    id: 'validation-results', title: 'Validation results', files: ['validation.json', 'pgda_check.json', 'lroc_check.json', 'lroc_check.png'],
    provider: 'this project', source: 'NASA JPL Horizons; NASA GSFC PGDA illumination maps; LROC NAC controlled mosaic', resolutionM: null, coverage: 'see docs/VALIDATION.md',
    frame: '—', units: '—', generator: 'tools/validate-horizons.mjs, tools/build_hires_terrain.mjs, tools/refresh_pgda_site_shares.mjs, tools/lroc_shadow_check.mjs', licence: OURS,
    limitations: 'Each file records when it was generated.',
  },
  {
    id: 'imagery', title: 'Moon and Earth imagery (display only)', files: ['moonGlobal.jpg', 'moon_wac_global_4k.jpg', 'spPolar.jpg', 'sp_wac_450m.jpg', 'sp_wac_geo.jpg', 'earth_blue_marble_4k.jpg', 'earth_blue_marble_2k.jpg'],
    provider: 'NASA', source: 'LRO LROC WAC mosaics (NASA/GSFC/Arizona State University); NASA Blue Marble', resolutionM: null, coverage: '—',
    frame: '—', units: 'JPEG', generator: 'tools/build_imagery.py (Moon), tools/make_earth_2k.py (2k Earth)', licence: NASA, limitations: 'Pictures only; no numbers are read from them.',
  },
  {
    id: 'site-list', title: 'Site list', files: ['sites.json'], provider: 'this project', source: 'mission reports, NASA and USGS (see each site)', resolutionM: null,
    coverage: '—', frame: 'planetocentric latitude, east-positive longitude', units: 'degrees', generator: 'hand-edited (src/data/sites.json)', licence: OURS, limitations: 'Region centres are single points.',
  },
];

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dataDir, f))).digest('hex');
const listed = new Set(['manifest.json']);
const datasets = DATASETS.map((d) => ({
  ...d,
  files: d.files.filter((f) => fs.existsSync(path.join(dataDir, f))).map((f) => { listed.add(f); return { path: `data/${f}`, bytes: fs.statSync(path.join(dataDir, f)).size, sha256: sha256(f) }; }),
}));
const all = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else all.push(path.relative(dataDir, p).split(path.sep).join('/')); } };
walk(dataDir);
const unlisted = all.filter((f) => !listed.has(f)).sort();

const manifest = {
  manifestVersion: 1,
  description: 'Every data file the app and API serve, with SHA-256 checksums. Verify a download with: sha256sum <file>.',
  datasets,
  unlistedFiles: unlisted,
};
const json = `${JSON.stringify(manifest, null, 1)}\n`;
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== json) { console.error('public/data/manifest.json is out of date: run node tools/build_manifest.mjs'); process.exit(1); }
  console.log('manifest up to date');
} else {
  fs.writeFileSync(out, json);
  console.log(`wrote public/data/manifest.json: ${datasets.length} datasets, ${datasets.reduce((s, d) => s + d.files.length, 0)} files${unlisted.length ? `; NOT described: ${unlisted.join(', ')}` : ''}`);
}
