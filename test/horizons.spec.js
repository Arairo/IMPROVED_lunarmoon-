// Ephemeris checks against NASA JPL Horizons (observer on the lunar surface,
// CENTER=coord@301, QUANTITIES=4: apparent azimuth and elevation). Reference
// values were fetched from the Horizons API; tools/validate-horizons.mjs
// re-runs a larger set wherever Horizons is reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSite, evaluate, DEFAULT_CONFIG } from '../src/core/analysis.js';

const CASES = [
  { what: 'Sun at the Apollo 11 landing', body: 'sun', utc: '1969-07-20T20:17:39.840Z', lat: 0.67416, lon: 23.47315, az: 88.8055, el: 10.7033 },
  { what: 'Earth from the Shackleton connecting ridge', body: 'earth', utc: '2027-01-01T00:00:00Z', lat: -89.45, lon: -137.31, az: 144.4607, el: -6.6957 },
  { what: 'Sun at Reiner Gamma', body: 'sun', utc: '2027-01-01T00:00:00Z', lat: 7.5, lon: -59.0, az: 258.8910, el: 51.2662 },
];
const TOL_DEG = 0.02;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

for (const c of CASES) {
  test(`JPL Horizons: ${c.what} within ${TOL_DEG}°`, () => {
    const ctx = prepareSite({ id: `h-${c.lat},${c.lon}`, name: c.what, lat: c.lat, lon: c.lon }, null, DEFAULT_CONFIG);
    const r = evaluate(Date.parse(c.utc), ctx, DEFAULT_CONFIG, { withDsn: false })[c.body];
    assert.ok(Math.abs(r.el - c.el) < TOL_DEG, `elevation ${r.el.toFixed(4)} vs Horizons ${c.el}`);
    assert.ok(angDiff(r.az, c.az) < TOL_DEG, `azimuth ${r.az.toFixed(4)} vs Horizons ${c.az}`);
  });
}
