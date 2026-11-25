// The validation records in docs/validation/ keep the shared format and agree with
// the current code (the JPL record is recomputed here, not trusted).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../docs/validation/', import.meta.url);
const KEYS = ['schemaVersion', 'kind', 'applicationCommit', 'datasetVersion', 'validationDateUtc', 'reference', 'caseCount', 'sites', 'dates', 'configuration', 'metrics', 'failedCases'];

test('Validation records: every file has the shared fields, real dates and no invented values', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.deepEqual(files.sort(), ['azimuth-resolution.json', 'jpl-horizons.json', 'lroc.json', 'pgda.json', 'terrain-study.json']);
  for (const f of files) {
    const r = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const k of KEYS) assert.ok(k in r, `${f}: missing ${k}`);
    assert.equal(r.schemaVersion, 1, f);
    assert.ok(Number.isFinite(Date.parse(r.validationDateUtc)), `${f}: date`);
    assert.ok(r.caseCount > 0, `${f}: cases`);
    assert.ok(Array.isArray(r.failedCases), `${f}: failedCases`);
    assert.ok(/^[0-9a-f]{40}$/.test(r.applicationCommit) || r.applicationCommit === 'not recorded', `${f}: commit`);
  }
});

test('JPL record: 154 cases, worst elevation under 0.01°, no failed cases', () => {
  const r = JSON.parse(readFileSync(new URL('jpl-horizons.json', dir), 'utf8'));
  assert.equal(r.caseCount, 154);
  assert.ok(r.metrics.all.elevationDeg.max < 0.01);
  assert.equal(r.failedCases.length, 0);
});
