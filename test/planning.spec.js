import test from 'node:test';
import assert from 'node:assert/strict';
import { nudgeSite, windowStats, describeChange, findNextWindow, positionRange } from '../src/core/planning.js';
import { surfaceDistance } from '../src/core/geo.js';
import { DEFAULT_CONFIG } from '../src/core/analysis.js';

const RIDGE = { id: 'ridge', name: 'Shackleton connecting ridge', short: 'Connecting ridge', lat: -89.45, lon: -137.31 };
const FLOOR = { id: 'shackleton', name: 'Shackleton crater floor', lat: -89.67, lon: 129.8 };
const T0 = Date.UTC(2026, 10, 16, 22);

test('nudgeSite moves the requested distance in the requested direction', () => {
  for (const [dir, km] of [['N', 1], ['S', 0.25], ['E', 5], ['W', 10]]) {
    const s = nudgeSite(RIDGE, dir, km);
    const d = surfaceDistance(RIDGE.lat, RIDGE.lon, s.lat, s.lon);
    assert.ok(Math.abs(d - km * 1000) < 1, `${dir} ${km} km moved ${d.toFixed(1)} m`);
  }
  assert.ok(nudgeSite(RIDGE, 'N', 1).lat > RIDGE.lat, 'north increases latitude');
  assert.ok(nudgeSite(RIDGE, 'S', 1).lat < RIDGE.lat, 'south decreases latitude');
  assert.throws(() => nudgeSite(RIDGE, 'X', 1));
});

test('describeChange reports rounded differences consistently', () => {
  const a = { sun: 0.544, earth: 0.544, darkH: 0 };
  const b = { sun: 0.544, earth: 0.556, darkH: 0 };
  assert.equal(describeChange('Moved', a, b), 'Moved: Earth in view 54% → 56% (+2).');
  assert.match(describeChange('Moved', a, a), /almost nothing changes/);
});

test('findNextWindow finds a window at the sunny ridge and none in a permanently shadowed crater', () => {
  const w = findNextWindow(RIDGE, T0, DEFAULT_CONFIG, { minDays: 3 });
  assert.ok(w, 'ridge has a 3-day window within a year');
  assert.ok(w.endMs - w.ms >= 3 * 86400000);
  assert.equal(findNextWindow(FLOOR, T0, DEFAULT_CONFIG, { minDays: 1 }), null);
});

test('windowStats and positionRange return fractions in [0, 1]', () => {
  const s = windowStats(RIDGE, T0, DEFAULT_CONFIG);
  for (const k of ['sun', 'earth', 'both']) assert.ok(s[k] >= 0 && s[k] <= 1, k);
  assert.ok(s.both <= Math.min(s.sun, s.earth) + 1e-9, 'both cannot exceed either');
  const r = positionRange(RIDGE, T0, DEFAULT_CONFIG);
  assert.ok(r.sun[0] <= r.sun[1] && r.earth[0] <= r.earth[1]);
});

test('landingCalendar rates each day with the same rules as findNextWindow', async () => {
  const { landingCalendar } = await import('../src/core/planning.js');
  const cal = landingCalendar(RIDGE, T0, 35, DEFAULT_CONFIG, { hourUtc: 22 });
  assert.equal(cal.length, 35);
  for (const d of cal) {
    assert.ok(['green', 'amber', 'red'].includes(d.rating));
    if (d.rating === 'red') assert.equal(d.sun, false);
    if (d.rating === 'green') assert.ok(d.sun && d.earth && d.bothH >= 72);
  }
  // Day 0 matches findNextWindow from the same instant.
  const nw = findNextWindow(RIDGE, cal[0].ms, DEFAULT_CONFIG, { minDays: 3 });
  if (cal[0].rating === 'green') assert.ok(nw && nw.ms - cal[0].ms < 2 * 3600000);
  // Over a full lunar day the ridge has at least one green and the crater floor none.
  assert.ok(cal.some((d) => d.rating === 'green'));
  assert.ok(landingCalendar(FLOOR, T0, 35, DEFAULT_CONFIG).every((d) => d.rating === 'red'));
});

test('describeChange never reports a change that rounds to nothing', () => {
  const a = { sun: 0.5, earth: 0.5, darkH: 348.2 };
  const b = { sun: 0.5, earth: 0.5, darkH: 349.0 };
  assert.match(describeChange('Slip', a, b), /almost nothing changes/);
});

test('launchDateSeries matches windowStats for a launch day', async () => {
  const { launchDateSeries, windowStats } = await import('../src/core/planning.js');
  const series = launchDateSeries(RIDGE, T0, 60, DEFAULT_CONFIG);
  assert.equal(series.length, 60);
  const k = 17;
  const ws = windowStats(RIDGE, series[k].ms, DEFAULT_CONFIG, 30, 2 * 3600000);
  assert.ok(Math.abs(series[k].both - ws.both) < 0.01, `${series[k].both} vs ${ws.both}`);
  assert.ok(series.every((d) => d.both >= 0 && d.both <= d.sun + 1e-9 && d.both <= d.earth + 1e-9));
});
