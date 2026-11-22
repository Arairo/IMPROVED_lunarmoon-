// scan() integrates over exactly the requested window: the last sample only counts
// until endMs, so a window that is not a whole number of steps is not rounded up
// (second audit, 22 Nov 2026). Energy, averages, shares, battery and the longest
// dark / blackout spells all use the time each sample actually stands for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, scanWindow, evaluate, prepareSite, DEFAULT_CONFIG } from '../src/core/analysis.js';
import { simulateBattery } from '../src/core/power.js';
import { windowStats } from '../src/core/planning.js';
import sitesData from '../src/data/sites.json' with { type: 'json' };

const H = 3600000;
const site = sitesData.find((s) => s.id === 'ridge');
const ctx = prepareSite(site, DEFAULT_CONFIG);
const T0 = Date.UTC(2027, 5, 14, 0);
const run = (hours, stepH) => scan(ctx, { startMs: T0, endMs: T0 + hours * H, stepMs: stepH * H }, DEFAULT_CONFIG, { withDsn: false });
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

/** Independent left-point sum: each sample until the next one, the last until the end. */
function reference(hours, stepH) {
  const end = T0 + hours * H;
  let t = T0, e = 0, lit = 0;
  const step = hours < 2 * stepH ? (hours / 2) * H : stepH * H;
  while (t < end - 1e-6) {
    const dt = Math.min(step, end - t) / H;
    const r = evaluate(t, ctx, DEFAULT_CONFIG, { withDsn: false });
    e += r.sun.watts * dt;
    if (r.sun.fraction > 0) lit += dt;
    t += step;
  }
  return { energyWh: e, litFraction: lit / hours };
}

for (const [label, hours, stepH] of [
  ['divisible (24 h, 4 h steps)', 24, 4],
  ['not divisible (25 h, 4 h steps)', 25, 4],
  ['ends one minute past a step (24 h 1 min, 4 h steps)', 24 + 1 / 60, 4],
  ['shorter than one step (3 h, 4 h steps)', 3, 4],
  ['very short (2 min, 20 min steps)', 2 / 60, 1 / 3],
  ['long, not divisible (30.5 days, 30 min steps)', 30.5 * 24, 0.5],
]) {
  test(`scan: ${label}: covers exactly the window, totals match an independent sum`, () => {
    const sc = run(hours, stepH);
    const { times, dtH } = sc.series;
    close(sc.stats.integratedHours, hours, 1e-9, 'hours covered');
    // No sample starts at or after the end, and none reaches past it.
    for (let i = 0; i < times.length; i++) {
      assert.ok(times[i] < sc.endMs, `sample ${i} starts after the end`);
      assert.ok(times[i] + dtH[i] * H <= sc.endMs + 1e-3, `sample ${i} runs past the end`);
      assert.ok(dtH[i] > 0, `sample ${i} has no duration`);
    }
    const ref = reference(hours, stepH);
    close(sc.stats.energyKWh * 1000, ref.energyWh, 1e-6 * Math.max(1, ref.energyWh), 'energy');
    close(sc.stats.avgPowerW, ref.energyWh / hours, 1e-6 * Math.max(1, ref.energyWh), 'average power');
    close(sc.stats.litFraction, ref.litFraction, 1e-9, 'sunlit share');
    assert.ok(sc.stats.longestDarkH <= hours + 1e-9, 'longest dark spell fits in the window');
    for (const [a, b] of sc.intervals.lit) assert.ok(a >= sc.startMs && b <= sc.endMs + 1e-3, 'interval inside the window');
  });
}

test('scan: the 25 h case used to integrate 28 h; the battery uses the shortened last step', () => {
  const sc = run(25, 4);
  assert.equal(sc.series.times.length, 7);
  close(sc.series.dtH[6], 1, 1e-12, 'last step is 1 h');
  // Battery from the scan equals one simulated with the same per-sample hours.
  const pc = DEFAULT_CONFIG.power;
  const b = simulateBattery(sc.series.watts, sc.series.dtH, { loadW: pc.loadW, chargeEff: pc.chargeEff, dischargeEff: pc.dischargeEff });
  close(sc.stats.batteryKWh, b.neededWh / 1000, 1e-12, 'battery');
});

test('scan: the standard windows (15, 30, 90, 365 days) are whole numbers of steps: results unchanged', () => {
  for (const days of [15, 30, 90, 365]) {
    const sc = scanWindow(ctx, T0, days, DEFAULT_CONFIG);
    assert.ok(sc.series.dtH.every((h) => Math.abs(h - sc.stepMs / H) < 1e-12), `${days} d: every step full length`);
    close(sc.stats.integratedHours, days * 24, 1e-9, `${days} d covered`);
  }
});

test('scan: refuses an empty or backwards window', () => {
  assert.throws(() => scan(ctx, { startMs: T0, endMs: T0, stepMs: H }), RangeError);
  assert.throws(() => scan(ctx, { startMs: T0, endMs: T0 - H, stepMs: H }), RangeError);
  assert.throws(() => scan(ctx, { startMs: T0, endMs: T0 + H, stepMs: 0 }), RangeError);
});

test('simulateBattery: per-sample hours give the same result as one step when equal, and are checked', () => {
  const w = Float32Array.from([0, 0, 300, 300, 0, 50]);
  const a = simulateBattery(w, 2, { loadW: 120 });
  const b = simulateBattery(w, new Float64Array(6).fill(2), { loadW: 120 });
  assert.equal(a.neededWh, b.neededWh);
  assert.throws(() => simulateBattery(w, [1, 2], { loadW: 120 }), RangeError);
  assert.throws(() => simulateBattery(w, [1, 1, 1, 1, 1, 0], { loadW: 120 }), RangeError);
});

test('windowStats: "Sun and Earth together" is weighted by time too', () => {
  const ws = windowStats(site, T0, DEFAULT_CONFIG, 1.1, H); // 26.4 h at 1 h steps
  assert.ok(ws.both >= 0 && ws.both <= 1);
  assert.ok(ws.both <= Math.min(ws.sun, ws.earth) + 1e-9);
});
