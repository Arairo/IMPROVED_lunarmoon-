// Terrain horizon sampling: synthetic surfaces with known answers, data gaps,
// the quality record every horizon carries, and convergence on real LOLA terrain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHorizon, rayHorizon, computeSiteHorizon, createTerrain, RAY_REFINE } from '../src/core/horizon.js';
import { MOON_RADIUS_M, RAD, sphereHorizonDip } from '../src/core/geo.js';
import { moonFixedState } from '../src/core/ephemeris.js';
import { loadTerrainSync } from './loadTerrain.js';
import { readGrid, readHiresTiles } from '../tools/lib/grids.mjs';

const DEG = Math.PI / 180;
// Great-circle distance (m) from the site at 0°N 0°E.
const distFromSite = (lat, lon) => {
  const a = Math.sin((lat * DEG) / 2) ** 2 + Math.cos(lat * DEG) * Math.sin((lon * DEG) / 2) ** 2;
  return 2 * MOON_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};
/** Synthetic terrain: height = f(distance from the site), on a grid of `cell` m. */
const synthetic = (f, cell = 20) => ({ heightAt(lat, lon) { const h = f(distFromSite(lat, lon)); return h == null ? null : { height: h, cell }; }, coverageLabel: () => 'synthetic' });
// Exact elevation angle of a point at height h, distance s, seen from mast height m.
const exactEl = (h, s, m = 2) => { const th = s / MOON_RADIUS_M, r1 = MOON_RADIUS_M + h, r0 = MOON_RADIUS_M + m; return Math.atan2(r1 * Math.cos(th) - r0, r1 * Math.sin(th)) * RAD; };

test('Flat plain: every direction sees the same horizon, just below level', () => {
  const h = computeHorizon(synthetic(() => 0), 0, 0, { azStepDeg: 10 });
  const els = Array.from(h.elevations);
  assert.ok(els.every((e) => Number.isFinite(e) && e <= 0 && e > -0.2), els.join(','));
  assert.ok(Math.max(...els) - Math.min(...els) < 1e-3);
  assert.equal(h.quality.tier, 'fine');
});

test('A ridge 100 km away: refinement finds its crest; without it the step can land on the flank', () => {
  // Gaussian ridge, 5,000 m high, ~1 km wide, all round the site at 100 km. Ray steps there are 1.5 km.
  const D = 100000, H = 5000, W = 600; // 5 km: curvature drops terrain ~2.9 km at 100 km
  const T = synthetic((s) => H * Math.exp(-(((s - D) / W) ** 2)));
  const truth = exactEl(H, D);
  let worstRough = 0, worstRefined = 0;
  for (const az of [0, 37, 90, 151, 222, 300]) {
    const rough = rayHorizon(T, 0, 0, az, { refine: false });
    const fine = rayHorizon(T, 0, 0, az, { refine: true });
    worstRough = Math.max(worstRough, truth - rough.el);
    worstRefined = Math.max(worstRefined, Math.abs(truth - fine.el));
    assert.ok(fine.el >= rough.el - 1e-9, 'refinement never lowers the skyline');
  }
  assert.ok(worstRefined < 0.02, `refined crest within 0.02° (got ${worstRefined.toFixed(3)}°)`);
  assert.ok(worstRough > worstRefined, `unrefined steps miss part of the crest (${worstRough.toFixed(3)}° low)`);
  assert.equal(RAY_REFINE, true, 'refinement is on by default');
});

test('Crater: a rim all round hides more of the sky than the plain outside it', () => {
  const T = synthetic((s) => (s < 8000 ? -1500 : s < 9000 ? 0 + 600 * (1 - Math.abs(s - 8500) / 500) : 0));
  const h = computeHorizon(T, 0, 0, { azStepDeg: 15 });
  const ground = -1500;
  const rimEl = Math.atan2(MOON_RADIUS_M + 600 - (MOON_RADIUS_M + ground + 2), 8500) * RAD; // flat-Earth estimate
  for (const e of h.elevations) assert.ok(Math.abs(e - rimEl) < 0.3, `${e} vs ${rimEl}`);
});

test('Missing data: a gap in the grid is skipped, not read as a hole or a wall', () => {
  // A 2,000 m ridge at 50 km behind a stretch of no data between 20 and 40 km.
  const ridge = (s) => 2000 * Math.exp(-(((s - 50000) / 800) ** 2));
  const withGap = synthetic((s) => (s > 20000 && s < 40000 ? null : ridge(s)));
  const full = synthetic(ridge);
  const a = computeHorizon(withGap, 0, 0, { azStepDeg: 30 }), b = computeHorizon(full, 0, 0, { azStepDeg: 30 });
  for (let i = 0; i < a.elevations.length; i++) {
    assert.ok(Number.isFinite(a.elevations[i]));
    assert.ok(Math.abs(a.elevations[i] - b.elevations[i]) < 1e-6);
  }
  // No terrain at the site at all: a smooth sphere, flagged as such.
  const none = computeHorizon(synthetic(() => null), 0, 0);
  assert.equal(none.terrain, false);
  assert.equal(none.quality.tier, 'none');
  assert.ok(Math.abs(none.elevations[0] - sphereHorizonDip(2)) < 1e-6);
});

test('Every horizon says how it was made: grid sizes, steps, azimuth spacing, tier', () => {
  const T = loadTerrainSync();
  const h = computeHorizon(T, -89.45, -137.31, { azStepDeg: 2 });
  const q = h.quality;
  assert.equal(q.tier, 'standard');
  assert.equal(q.siteCellM, 240);
  assert.equal(q.coarsestCellM, 1000);
  assert.equal(q.azStepDeg, 2);
  assert.equal(q.refine, true);
  assert.ok(q.maxStepM > 3000 && q.maxStepM < 5000, `largest ray step ${q.maxStepM} m`);
  assert.match(q.text, /240 m at the site/);
  // Precomputed sites record that they were built with refinement.
  const pre = computeSiteHorizon({ id: 'ridge', lat: -89.45, lon: -137.31 });
  assert.equal(pre.quality.tier, 'fine');
  assert.equal(pre.quality.refine, true);
  // A south-polar point with nothing loaded yet falls back to the 5 km grid: flagged coarse.
  const rough = computeSiteHorizon({ id: 'custom-x', lat: -86.2, lon: 40 });
  assert.equal(rough.quality.tier, 'coarse');
  assert.match(rough.source, /approximate/);
});

// Convergence on real terrain (LOLA 20 m tile + 240 m / 1 km grids): the shipped
// sampling (0.5° rays, refined, stored every 2°) against a 4x finer computation.
test('Convergence: shipped skyline sampling is within 0.5 points of a 4x finer one (2027 sunlight)', () => {
  const T = createTerrain([...readHiresTiles(), readGrid('sp_fine'), readGrid('sp_coarse')]);
  const states = [];
  for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 12 * 3600000) states.push(moonFixedState(t));
  const share = (prof, stepDeg, lat, lon, g) => {
    const r0 = MOON_RADIUS_M + g + 2;
    const cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG), co = Math.cos(lon * DEG), so = Math.sin(lon * DEG);
    const up = [cl * co, cl * so, sl], east = [-so, co, 0], north = [-sl * co, -sl * so, cl];
    let n = 0;
    for (const st of states) {
      const v = st.sun, d = [v[0] - up[0] * r0, v[1] - up[1] * r0, v[2] - up[2] * r0], L = Math.hypot(...d);
      const el = Math.asin((d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / L) * RAD;
      let az = Math.atan2(d[0] * east[0] + d[1] * east[1], d[0] * north[0] + d[1] * north[1] + d[2] * north[2]) * RAD;
      if (az < 0) az += 360;
      const f = az / stepDeg, k = prof.length, i0 = Math.floor(f) % k, t = f - Math.floor(f);
      if (el > prof[i0] * (1 - t) + prof[(i0 + 1) % k] * t) n++;
    }
    return (100 * n) / states.length;
  };
  // Golden values (2027, Sun's centre, 2 m mast, 20 m tile), recorded 21 Nov 2026 after
  // crest refinement; see docs/VALIDATION.md section 3. Before refinement: 66.4% and 51.0%.
  const golden = { ridge: [-89.45, -137.31, 63.6], 'best-2': [-89.8008, -155.556, 49.8] };
  for (const [id, [lat, lon, expect]] of Object.entries(golden)) {
    const shipped = computeHorizon(T, lat, lon, { mastHeight: 2 });
    const ref = computeHorizon(T, lat, lon, { mastHeight: 2, azStepDeg: 0.25, growth: 0.003 });
    const a = share(Array.from(shipped.elevations).filter((_, i) => i % 4 === 0), 2, lat, lon, shipped.groundHeight);
    const b = share(Array.from(ref.elevations), 0.25, lat, lon, ref.groundHeight);
    assert.ok(Math.abs(a - b) < 0.5, `${id}: shipped ${a.toFixed(1)}% vs fine ${b.toFixed(1)}%`);
    assert.ok(Math.abs(a - expect) < 1.0, `${id}: ${a.toFixed(1)}% vs recorded ${expect}% (12 h steps here, 6 h in the record)`);
  }
});
