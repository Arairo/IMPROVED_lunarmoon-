import test from 'node:test';
import assert from 'node:assert/strict';
import { planFlight, MU_E } from '../src/core/flight.js';
import { flightTimeline } from '../src/experience/flightPacing.js';

const START = Date.UTC(2026, 10, 16, 22);
const ROUTES = ['direct', 'phasing', 'lowenergy'];

test('Flight playback: every phase starts and ends on its own slot, and time only moves forward', () => {
  for (const route of ROUTES) {
    const plan = planFlight(START, { route });
    const tl = flightTimeline(plan);
    assert.equal(tl.timeAt(0), plan.launchMs);
    assert.equal(tl.timeAt(1), plan.touchdownMs);
    plan.phases.forEach((ph, k) => {
      assert.ok(Math.abs(tl.timeAt(tl.slots[k].start) - ph.start) < 1, `${route} ${ph.id} start`);
      assert.ok(Math.abs(tl.timeAt(tl.slots[k].end) - ph.end) < 1, `${route} ${ph.id} end`);
    });
    let prev = -Infinity;
    for (let i = 0; i <= 2000; i++) { const t = tl.timeAt(i / 2000); assert.ok(t >= prev, `${route} monotonic`); prev = t; }
  }
});

test('Flight playback: speed eases between phases instead of jumping (60 fps frames)', () => {
  for (const route of ROUTES) {
    const tl = flightTimeline(planFlight(START, { route }));
    const n = Math.round(tl.duration * 60);
    let prev = null, worst = 1;
    for (let f = 1; f <= n; f++) {
      const r = tl.timeAt(f / n) - tl.timeAt((f - 1) / n);
      if (prev > 0 && r > 0) worst = Math.max(worst, r / prev, prev / r);
      prev = r;
    }
    // The old pacing jumped ~40x in one frame from the parking orbit to the coast.
    assert.ok(worst < 1.3, `${route}: worst frame-to-frame speed change ${worst.toFixed(2)}x`);
  }
});

test('Flight playback: a lap of the parking orbit takes over 2 s to watch; weeks in lunar orbit are a fast-forward', () => {
  const direct = planFlight(START, { route: 'direct' });
  const tl = flightTimeline(direct);
  const k = direct.phases.findIndex((p) => p.id === 'parking');
  const lapMs = 2 * Math.PI * Math.sqrt(direct.rpKm ** 3 / MU_E) * 1000;
  const laps = (direct.phases[k].end - direct.phases[k].start) / lapMs;
  const secs = (tl.slots[k].end - tl.slots[k].start) * tl.duration;
  assert.ok(secs / laps > 2, `${(secs / laps).toFixed(1)} s per lap`);
  // Apollo-like direct flights have about a day in lunar orbit: shown, not skipped.
  for (let i = 0; i <= 1000; i++) assert.equal(tl.isFastForward(i / 1000), false);
  // The low-energy route waits weeks in lunar orbit: hundreds of laps.
  const le = planFlight(START, { route: 'lowenergy' });
  const tle = flightTimeline(le);
  const o = le.phases.findIndex((p) => p.id === 'orbit');
  const mid = (tle.slots[o].start + tle.slots[o].end) / 2;
  assert.equal(tle.isFastForward(mid), true);
  assert.equal(tle.isFastForward(tle.slots[o].end + 0.01), false); // descent is shown in full
});
