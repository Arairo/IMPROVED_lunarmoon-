#!/usr/bin/env node
// How much do results depend on the skyline's azimuth spacing? (second audit 6.1)
//
//   node tools/azimuth_resolution.mjs            -> docs/validation/azimuth-resolution.json
//
// For every listed site south of 84° S (19 in Nov 2026, incl. seven Artemis III region centres)
// the skyline is cast with rays every 2°, 1° and 0.5° (refined, as shipped) and,
// separately, as shipped (0.5° rays, stored every 2°). Each is compared with a reference
// cast every 0.25° with 5x finer ray steps, on the same LOLA terrain (20 m tiles where
// they exist, then 240 m / 1 km). Measured over 2027 every 2 hours:
//   - sunlit share (Sun's centre above the skyline) and Earth-in-view share (Earth's centre);
//   - false lit / false shadowed: share of time steps lit in one and dark in the other;
//   - skyline error: largest elevation difference at the reference azimuths.
// This tests the sampling, not the terrain: the reference uses the same DEM.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTerrain, computeHorizon, RAY_GROWTH } from '../src/core/horizon.js';
import { createGlobalGrid } from '../src/core/globalDem.js';
import { moonFixedState } from '../src/core/ephemeris.js';
import { MOON_RADIUS_M, RAD } from '../src/core/geo.js';
import { readGrid, readHiresTiles, DATA_DIR } from './lib/grids.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEG = Math.PI / 180;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const gm = readJson(path.join(DATA_DIR, 'global_dem.json'));
const gb = fs.readFileSync(path.join(DATA_DIR, 'global_dem.bin'));
const global = createGlobalGrid(gm, new Int16Array(gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)));
const terrain = createTerrain([...readHiresTiles(), readGrid('sp_fine'), readGrid('sp_coarse')], global);
const sites = readJson(path.join(root, 'src/data/sites.json')).filter((s) => s.lat <= -84);

const START = Date.UTC(2027, 0, 1), END = Date.UTC(2028, 0, 1), STEP = 2 * 3600000;
const states = [];
for (let t = START; t < END; t += STEP) states.push(moonFixedState(t));

/** Elevation (deg) of the skyline at azimuth `az`, linear between samples `stepDeg` apart. */
const skyAt = (prof, stepDeg, az) => { const f = az / stepDeg, k = prof.length, i0 = Math.floor(f) % k, t = f - Math.floor(f); return prof[i0] * (1 - t) + prof[(i0 + 1) % k] * t; };
/** Per time step: [sunUp, earthUp] booleans for a profile. */
function flags(prof, stepDeg, s, ground) {
  const r0 = MOON_RADIUS_M + ground + 2;
  const cl = Math.cos(s.lat * DEG), sl = Math.sin(s.lat * DEG), co = Math.cos(s.lon * DEG), so = Math.sin(s.lon * DEG);
  const up = [cl * co, cl * so, sl], east = [-so, co, 0], north = [-sl * co, -sl * so, cl];
  const look = (v) => {
    const d = [v[0] - up[0] * r0, v[1] - up[1] * r0, v[2] - up[2] * r0], L = Math.hypot(...d);
    const el = Math.asin((d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / L) * RAD;
    let az = Math.atan2(d[0] * east[0] + d[1] * east[1], d[0] * north[0] + d[1] * north[1] + d[2] * north[2]) * RAD;
    if (az < 0) az += 360;
    return el > skyAt(prof, stepDeg, az);
  };
  return states.map((st) => [look(st.sun), look(st.earth)]);
}

const VARIANTS = [
  { id: 'rays-2deg', label: 'Rays every 2°, refined', azStepDeg: 2, store: 1 },
  { id: 'rays-1deg', label: 'Rays every 1°, refined', azStepDeg: 1, store: 1 },
  { id: 'rays-0.5deg', label: 'Rays every 0.5°, refined', azStepDeg: 0.5, store: 1 },
  { id: 'shipped', label: 'Shipped: rays every 0.5°, refined, stored every 2°', azStepDeg: 0.5, store: 4 },
];
const REF = { azStepDeg: 0.25, growth: RAY_GROWTH / 5 };

const perSite = [];
const t0 = Date.now();
for (const s of sites) {
  const ref = computeHorizon(terrain, s.lat, s.lon, { mastHeight: 2, ...REF });
  const refProf = Array.from(ref.elevations);
  const rf = flags(refProf, REF.azStepDeg, s, ref.groundHeight);
  const share = (f, k) => (100 * f.filter((x) => x[k]).length) / f.length;
  const row = { id: s.id, name: s.name, lat: s.lat, lon: s.lon, siteCellM: ref.quality.siteCellM, reference: { sun: +share(rf, 0).toFixed(2), earth: +share(rf, 1).toFixed(2) }, variants: {} };
  for (const v of VARIANTS) {
    const h = computeHorizon(terrain, s.lat, s.lon, { mastHeight: 2, azStepDeg: v.azStepDeg });
    const stepDeg = v.azStepDeg * v.store;
    const prof = Array.from(h.elevations).filter((_, i) => i % v.store === 0);
    const f = flags(prof, stepDeg, s, h.groundHeight);
    let falseLit = 0, falseDark = 0;
    for (let i = 0; i < f.length; i++) { if (f[i][0] && !rf[i][0]) falseLit++; if (!f[i][0] && rf[i][0]) falseDark++; }
    let skyErr = 0;
    for (let i = 0; i < refProf.length; i++) skyErr = Math.max(skyErr, Math.abs(skyAt(prof, stepDeg, i * REF.azStepDeg) - refProf[i]));
    row.variants[v.id] = {
      sunErrPts: +(share(f, 0) - row.reference.sun).toFixed(2),
      earthErrPts: +(share(f, 1) - row.reference.earth).toFixed(2),
      falseLitPct: +((100 * falseLit) / f.length).toFixed(2),
      falseShadowPct: +((100 * falseDark) / f.length).toFixed(2),
      maxSkylineErrDeg: +skyErr.toFixed(2),
    };
  }
  perSite.push(row);
  process.stdout.write('.');
}
console.log(` ${perSite.length} sites in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const summary = {};
for (const v of VARIANTS) {
  const col = perSite.map((r) => r.variants[v.id]);
  const absMax = (k) => Math.max(...col.map((c) => Math.abs(c[k])));
  const absMean = (k) => col.reduce((a, c) => a + Math.abs(c[k]), 0) / col.length;
  summary[v.id] = {
    label: v.label,
    worstSunErrPts: +absMax('sunErrPts').toFixed(2), meanSunErrPts: +absMean('sunErrPts').toFixed(2),
    worstEarthErrPts: +absMax('earthErrPts').toFixed(2),
    worstFalseLitPct: +absMax('falseLitPct').toFixed(2), worstFalseShadowPct: +absMax('falseShadowPct').toFixed(2),
    worstSkylineErrDeg: +absMax('maxSkylineErrDeg').toFixed(2),
  };
  console.log(`${v.label.padEnd(52)} sun worst ${summary[v.id].worstSunErrPts} (mean ${summary[v.id].meanSunErrPts}) · earth worst ${summary[v.id].worstEarthErrPts} · false lit ${summary[v.id].worstFalseLitPct}% · false shadow ${summary[v.id].worstFalseShadowPct}% · skyline ${summary[v.id].worstSkylineErrDeg}°`);
}

// Sites where the shipped setting is off by more than 0.5 points are listed as failed cases.
const failedCases = perSite.filter((r) => Math.abs(r.variants.shipped.sunErrPts) > 0.5 || Math.abs(r.variants.shipped.earthErrPts) > 0.5)
  .map((r) => ({ id: r.id, ...r.variants.shipped, threshold: '0.5 percentage points' }));
let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch {}
const manifestSha = createHash('sha256').update(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'))).digest('hex');
const record = {
  schemaVersion: 1,
  kind: 'horizon sampling: azimuth spacing',
  applicationCommit: commit,
  datasetVersion: `public/data/manifest.json sha256 ${manifestSha}`,
  validationDateUtc: new Date().toISOString(),
  reference: `Same LOLA terrain, skyline every ${REF.azStepDeg}° with ray steps ${REF.growth * 100}% of the distance, refined (an internal convergence reference, not independent data)`,
  caseCount: perSite.length * states.length,
  sites: perSite.map((r) => r.id),
  dates: { start: new Date(START).toISOString(), end: new Date(END).toISOString(), stepHours: STEP / 3600000 },
  configuration: { mastHeightM: 2, sunCriterion: "Sun's centre above the skyline", earthCriterion: "Earth's centre above the skyline", terrain: '20 m PGDA tiles where present, LOLA 240 m / 1 km south-polar grids, LDEM_16 beyond', variants: VARIANTS.map(({ id, label, azStepDeg, store }) => ({ id, label, rayAzStepDeg: azStepDeg, storedAzStepDeg: azStepDeg * store, growth: RAY_GROWTH, refine: true })) },
  metrics: summary,
  failedCases,
  perSite,
};
const out = path.join(root, 'docs/validation/azimuth-resolution.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(record, null, 1));
console.log(`wrote ${path.relative(root, out)} (${failedCases.length} failed cases)`);
