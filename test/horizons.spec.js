// Ephemeris checks against NASA JPL Horizons (observer on the lunar surface,
// CENTER=coord@301, QUANTITIES=4: apparent azimuth and elevation). Reference
// values were fetched from the Horizons API; tools/validate-horizons.mjs
// re-runs a larger set wherever Horizons is reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareSite, evaluate, DEFAULT_CONFIG } from '../src/core/analysis.js';
import { moonFixedState, epochStatus, CHECKED_PERIOD } from '../src/core/ephemeris.js';
import { SITES } from '../tools/validate-horizons.mjs';

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

// Every reference value from the last JPL Horizons run (the "Validate against JPL
// Horizons" workflow saved them in public/data/validation.json with the date it ran).
// Re-checked offline here so an engine change that moves any of them fails the tests.
test('JPL Horizons scoreboard: all stored comparisons still agree (el 0.01°, az 0.05°)', () => {
  const v = JSON.parse(readFileSync(new URL('../public/data/validation.json', import.meta.url), 'utf8'));
  assert.ok(v.rows.length >= 48, `${v.rows.length} stored comparisons`);
  let worstEl = 0, worstAz = 0;
  for (const r of v.rows) {
    const site = SITES.find((s) => s.name === r.site);
    assert.ok(site, `site "${r.site}" is in the tool's list`);
    const ctx = prepareSite({ id: `v-${site.lat},${site.lon}`, ...site }, null, DEFAULT_CONFIG);
    const ours = evaluate(Date.parse(r.utc), ctx, DEFAULT_CONFIG, { withDsn: false })[r.body];
    const dEl = Math.abs(ours.el - r.refEl);
    // Azimuth is ill-defined when the body is near the zenith; weight it by cos(el).
    const dAz = angDiff(ours.az, r.refAz) * Math.cos((r.refEl * Math.PI) / 180);
    worstEl = Math.max(worstEl, dEl); worstAz = Math.max(worstAz, dAz);
    assert.ok(dEl < 0.01, `${r.site} ${r.utc} ${r.body}: el ${ours.el.toFixed(4)} vs ${r.refEl}`);
    assert.ok(dAz < 0.05, `${r.site} ${r.utc} ${r.body}: az ${ours.az.toFixed(4)} vs ${r.refAz}`);
  }
  assert.ok(worstEl < 0.006, `worst elevation difference ${worstEl.toFixed(4)}° (published: 0.005°)`);
});

test('Time handling: UTC milliseconds in, smooth across year ends and leap days, invalid times refused', () => {
  // Across a UTC year boundary and a leap day the Sun direction moves smoothly
  // (the Moon turns ~0.5° per hour): no jumps from calendar arithmetic.
  for (const iso of ['2026-12-31T23:59:30Z', '2028-02-29T00:00:00Z', '2028-03-01T00:00:00Z']) {
    const t = Date.parse(iso);
    const a = moonFixedState(t - 60000).sun, b = moonFixedState(t + 60000).sun;
    const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
    const deg = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
    assert.ok(deg > 0.005 && deg < 0.05, `${iso}: Sun moved ${deg.toFixed(4)}° in 2 minutes`);
  }
  // A Date and the same instant in milliseconds give the same answer.
  assert.deepEqual(moonFixedState(new Date('2027-01-01T00:00:00Z')).sun, moonFixedState(Date.parse('2027-01-01T00:00:00Z')).sun);
  for (const bad of [NaN, Infinity, undefined, 'not a date']) assert.throws(() => moonFixedState(bad), RangeError);
});

test('Dates outside the checked period are labelled, not refused', () => {
  assert.equal(epochStatus(Date.parse('2027-06-01T00:00:00Z')).status, 'checked');
  assert.equal(epochStatus(Date.parse('1969-07-20T20:17:40Z')).status, 'checked');
  assert.equal(epochStatus(CHECKED_PERIOD.toMs).status, 'unchecked');
  assert.match(epochStatus(Date.parse('2045-01-01T00:00:00Z')).note, /1969–2028/);
  assert.equal(epochStatus(NaN).status, 'invalid');
  // Still computed outside the period (finite numbers), just labelled.
  assert.ok(Number.isFinite(moonFixedState(Date.parse('2045-01-01T00:00:00Z')).sun[0]));
});
