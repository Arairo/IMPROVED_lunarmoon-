import test from 'node:test';
import assert from 'node:assert/strict';
import sites from '../src/data/sites.js';
import { apolloChecks, flownEventChecks } from '../src/core/flownChecks.js';

test('Sun elevation at the Apollo landings matches the mission reports within 0.5°', () => {
  for (const c of apolloChecks(sites)) assert.ok(Math.abs(c.diffDeg) < 0.5, `${c.name}: ours ${c.oursDeg.toFixed(2)}° vs reported ${c.reportedDeg}°`);
});

test('Sunsets at Blue Ghost, Chandrayaan-3 and SLIM fall on the days the missions reported', () => {
  for (const c of flownEventChecks(sites)) {
    assert.ok(c.oursMs != null, `${c.name}: no ${c.event} found`);
    assert.ok(Math.abs(c.diffDays) <= 1, `${c.name}: ours ${new Date(c.oursMs).toISOString()} vs reported ${c.reported}`);
  }
});
