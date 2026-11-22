// Pro progress kept across the Terrain 3D round trip (src/ui/session.js): a saved
// snapshot comes back intact, and stale or malformed ones are never applied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotSession, validateSession, mergeConfig, SESSION_VERSION } from '../src/ui/session.js';

const app = () => ({
  site: { id: 'ridge', name: 'Connecting ridge', short: 'Ridge', lat: -89.45, lon: -137.31, group: 'computed' },
  windowStartMs: Date.UTC(2027, 5, 15, 12), timeMs: Date.UTC(2027, 5, 16), windowDays: 90, view: 'polar', mode: 'explorer',
  config: { mastHeightM: 2, power: { loadW: 250, efficiency: 0.29, batteryWh: null }, comms: { preset: 's_mga' } },
  scenarios: [{ site: { id: 'im2', lat: -84.79, lon: 29.2 }, startMs: Date.UTC(2027, 0, 1), windowDays: 30, label: 'IM-2', configKey: JSON.stringify({ power: { loadW: 120 } }) }],
});

test('Snapshot round-trips through JSON and validation', () => {
  const snap = snapshotSession(app(), { step: 2 });
  const back = validateSession(JSON.stringify(snap), snap.savedAt + 1000);
  assert.equal(back.site.id, 'ridge');
  assert.equal(back.windowDays, 90);
  assert.equal(back.view, 'polar');
  assert.equal(back.step, 2);
  assert.equal(back.config.power.loadW, 250);
  assert.equal(back.scenarios.length, 1);
  assert.equal(back.scenarios[0].config.power.loadW, 120);
});

test('Stale, future, wrong-version or malformed snapshots are refused', () => {
  const snap = snapshotSession(app(), { step: 1 });
  assert.equal(validateSession(snap, snap.savedAt + 13 * 3600000), null, 'older than 12 h');
  assert.equal(validateSession(snap, snap.savedAt - 3600000), null, 'from the future');
  assert.equal(validateSession({ ...snap, v: SESSION_VERSION + 1 }, snap.savedAt), null);
  assert.equal(validateSession('{not json', snap.savedAt), null);
  assert.equal(validateSession({ ...snap, site: { lat: 'x', lon: 0 } }, snap.savedAt), null);
  assert.equal(validateSession({ ...snap, windowStartMs: NaN }, snap.savedAt), null);
  const odd = validateSession({ ...snap, windowDays: 7, step: 9, view: 'nowhere', scenarios: [{ site: null }] }, snap.savedAt);
  assert.equal(odd.windowDays, 30);
  assert.equal(odd.step, 0);
  assert.equal(odd.view, 'globe');
  assert.equal(odd.scenarios.length, 0);
});

test('Saved settings only fill existing keys of the same type', () => {
  const target = { mastHeightM: 2, power: { loadW: 120, batteryWh: null, mode: 'vertical_tracking' } };
  mergeConfig(target, { mastHeightM: 5, extra: 1, power: { loadW: '999', batteryWh: 800, mode: 'fixed' } });
  assert.deepEqual(target, { mastHeightM: 5, power: { loadW: 120, batteryWh: 800, mode: 'fixed' } });
  mergeConfig(target, { mastHeightM: Infinity, power: null });
  assert.equal(target.mastHeightM, 5);
});
