// Fixes from the independent calculation audit (25 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeSiteHorizon, computeHorizon, createTerrain, horizonAt, precomputedFor, setSharedTerrain, getSharedTerrain } from '../src/core/horizon.js';
import { readGrid, readHiresTiles } from '../tools/lib/grids.mjs';

const sites = JSON.parse(readFileSync(new URL('../src/data/sites.json', import.meta.url), 'utf8'));
const ridge = sites.find((s) => s.id === 'ridge');

test('precomputed skylines are matched by id AND position', () => {
  assert.ok(precomputedFor(ridge), 'the listed site gets its skyline');
  // The planner reuses ids such as best-2 for other places: those must not.
  const best2 = sites.find((s) => s.id === 'best-2');
  assert.equal(precomputedFor({ ...best2, lat: -89.3001, lon: 133.0908 }), null);
  // 10 m away is still the same place.
  assert.ok(precomputedFor({ ...ridge, lat: ridge.lat + 10 / 30323 }));
});

test('a mast other than 2 m is recomputed from the terrain, not shifted by a fixed offset', () => {
  const saved = getSharedTerrain();
  try {
    setSharedTerrain(null);
    const rough = computeSiteHorizon(ridge, 10);
    assert.equal(rough.quality.tier, 'coarse', 'flagged approximate until the terrain loads');
    assert.match(rough.quality.text, /mast/);
    const two = computeSiteHorizon(ridge, 2);
    assert.notEqual(two.quality.tier, 'coarse', 'the 2 m precomputed skyline is the real one');

    const terrain = createTerrain([...readHiresTiles(), readGrid('sp_fine'), readGrid('sp_coarse')]);
    setSharedTerrain(terrain);
    const live = computeSiteHorizon(ridge, 10);
    assert.notEqual(live.quality.tier, 'coarse');
    assert.equal(live.mastHeight, 10);
    const direct = computeHorizon(terrain, ridge.lat, ridge.lon, { mastHeight: 10, azStepDeg: 2 });
    assert.deepEqual(live.el180.map((v) => Math.round(v * 1000)), Array.from(direct.elevations, (v) => Math.round(v * 1000)));
    // The old fixed offset (0.012 deg per metre) was far off on this ridge.
    const offset = two.el180.map((v) => v - 8 * 0.012);
    const worst = Math.max(...live.el180.map((v, i) => Math.abs(v - offset[i])));
    assert.ok(worst > 0.5, `a 10 m mast moves the ridge skyline by more than the offset did (worst ${worst.toFixed(2)} deg)`);
  } finally {
    setSharedTerrain(saved);
  }
});

test('horizonAt works for any azimuth step', () => {
  const elevations = Float32Array.from({ length: 180 }, (_, i) => i); // 2 deg steps
  assert.equal(horizonAt({ elevations }, 100), 50);
  assert.equal(horizonAt({ elevations }, 101), 50.5);
  assert.equal(horizonAt({ el180: Array.from({ length: 90 }, (_, i) => i) }, 8), 2); // 4 deg steps
});

test('a skyline at exactly the pole matches one a few metres away', () => {
  const terrain = createTerrain([readGrid('sp_fine'), readGrid('sp_coarse')]);
  const at = computeHorizon(terrain, -90, 0, { azStepDeg: 10 });
  const near = computeHorizon(terrain, -89.9999, 0, { azStepDeg: 10 });
  const worst = Math.max(...Array.from(at.elevations, (v, i) => Math.abs(v - near.elevations[i])));
  assert.ok(worst < 0.01, `worst ${worst}`);
});
