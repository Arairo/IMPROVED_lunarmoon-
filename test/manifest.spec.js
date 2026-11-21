// The data manifest must match the files actually shipped, and describe every one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCoordinates } from '../src/core/sites.js';

const dataUrl = new URL('../public/data/', import.meta.url);

test('Data manifest: every file listed with the right size and SHA-256, nothing undescribed', () => {
  const m = JSON.parse(readFileSync(new URL('manifest.json', dataUrl), 'utf8'));
  assert.equal(m.manifestVersion, 1);
  assert.deepEqual(m.unlistedFiles, [], 'every data file belongs to a described dataset');
  let n = 0;
  for (const d of m.datasets) {
    for (const k of ['id', 'title', 'provider', 'source', 'generator', 'licence', 'limitations']) assert.ok(d[k], `${d.id}: ${k}`);
    for (const f of d.files) {
      const url = new URL(f.path.replace(/^data\//, ''), dataUrl);
      assert.ok(existsSync(url), f.path);
      const buf = readFileSync(url);
      assert.equal(buf.length, f.bytes, `${f.path} size (run node tools/build_manifest.mjs)`);
      assert.equal(createHash('sha256').update(buf).digest('hex'), f.sha256, `${f.path} checksum (run node tools/build_manifest.mjs)`);
      n++;
    }
  }
  assert.ok(n > 60, `${n} files checked`);
});

test('Coordinates: valid forms parse; impossible or malformed input is refused', () => {
  assert.deepEqual(parseCoordinates('89.45S, 137.3W'), { lat: -89.45, lon: -137.3 });
  assert.deepEqual(parseCoordinates('0, 270'), { lat: 0, lon: -90 }, '0–360 longitude is folded to ±180');
  for (const bad of ['91, 0', '-90.5, 10', '0, 540', 'abc', '', '1e5, 2', 'NaN, NaN', 'Infinity, 0', '45', '45, 10, 3', null, undefined]) {
    assert.equal(parseCoordinates(bad), null, `"${bad}" refused`);
  }
});
