import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLayers } from '../src/scene/mapLayers.js';
import { buildCells, parseSkylines, nowState, windowShare, cellIndexAt } from '../src/scene/layerTime.js';
import { moonFixedState } from '../src/core/ephemeris.js';

const meta = JSON.parse(fs.readFileSync('public/data/layers.json'));
const layers = parseLayers(meta, new Uint8Array(fs.readFileSync('public/data/layers.bin')));
const sky = parseSkylines(JSON.parse(fs.readFileSync('public/data/layer_skylines.json')), new Int8Array(fs.readFileSync('public/data/layer_skylines.bin').buffer.slice(0)));
const cells = buildCells(meta);

test('map cells: index lookup round-trips for the global grid and the polar caps', () => {
  for (const [lat, lon] of [[0.5, 0.5], [-45.5, 120.5], [-89.67, 129.78], [85.2, -40.1], [-77, 10]]) {
    const i = cellIndexAt(meta, lat, lon);
    assert.ok(Math.abs(cells.lat[i] - lat) < 1.2, `lat ${lat} -> ${cells.lat[i]}`);
  }
});

test('"Now" layer: sub-solar point lit, anti-solar point dark, Earth up on the near side only', () => {
  const ms = Date.UTC(2027, 2, 10, 12);
  const st = moonFixedState(ms);
  const v = nowState(cells, sky, ms);
  const at = (lat, lon) => v[cellIndexAt(meta, lat, lon)];
  const ss = st.subSolar;
  assert.equal(at(ss.lat, ss.lon) & 1, 1);
  assert.equal(at(-ss.lat, ss.lon > 0 ? ss.lon - 180 : ss.lon + 180) & 1, 0);
  assert.equal(at(0.5, 0.5) & 2, 2);
  assert.equal(at(0.5, 179.5) & 2, 0);
  assert.equal(at(-89.67, 129.78) & 1, 0, 'Shackleton floor is dark');
});

test('window share from the skylines agrees with the precomputed year map', async () => {
  const res = await windowShare(cells, sky, Date.UTC(2027, 0, 1), 365, { stepHours: 48 });
  let diff = 0;
  for (let i = 0; i < meta.global.width * meta.global.height; i++) diff += Math.abs(res.sun[i] - layers.global.sun[i]) / 2;
  const mean = diff / (meta.global.width * meta.global.height);
  assert.ok(mean < 4, `mean difference ${mean.toFixed(2)} points`);
});
