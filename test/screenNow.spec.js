// The live "Now" pill and the Check step must give the same answer for the same moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { screenNow, scan, prepareSite, evaluate, DEFAULT_CONFIG } from '../src/core/analysis.js';
import { verdicts } from '../src/experience/walk.js';

const now = (powerStatus, commsStatus, los) => ({ powerStatus, commsStatus, sun: { fraction: powerStatus === 'no-go' ? 0 : 1 }, earth: { los } });

test('screenNow: NO GO when either power is gone or Earth is hidden', () => {
  assert.equal(screenNow(now('go', 'no-go', false)), 'red'); // Sun up, Earth hidden (was GO WITH CARE)
  assert.equal(screenNow(now('no-go', 'go', true)), 'red');
  assert.equal(screenNow(now('no-go', 'no-go', false)), 'red');
});
test('screenNow: GO only when both are fine; anything limited is GO WITH CARE', () => {
  assert.equal(screenNow(now('go', 'go', true)), 'green');
  assert.equal(screenNow(now('marginal', 'go', true)), 'amber');
  assert.equal(screenNow(now('go', 'marginal', true)), 'amber');
  assert.equal(screenNow(now('go', 'no-go', true)), 'amber'); // Earth in view, no DSN antenna right now
});
test('screenNow never says GO when the Check step says NO GO for the same moment', () => {
  const site = { id: 't', name: 't', lat: -89.45, lon: -137.31 };
  const ctx = prepareSite(site, DEFAULT_CONFIG);
  const start = Date.UTC(2027, 0, 1);
  for (let d = 0; d < 60; d += 1.5) {
    const t0 = start + d * 86400000;
    const v = verdicts(scan(ctx, { startMs: t0, endMs: t0 + 30 * 86400000, stepMs: 3 * 3600000 }, DEFAULT_CONFIG, { withDsn: false }));
    const n = screenNow(evaluate(t0, ctx, DEFAULT_CONFIG, { withDsn: false }));
    if (v.overall === 'red') assert.equal(n, 'red', `day ${d}`);
    if (n === 'red') assert.equal(v.overall, 'red', `day ${d}`);
  }
});
