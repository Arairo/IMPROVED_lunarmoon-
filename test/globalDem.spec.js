import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalGrid } from '../src/core/globalDem.js';
import { createTerrain, computeHorizon } from '../src/core/horizon.js';
import { MOON_RADIUS_M } from '../src/core/geo.js';
import { parseLabel, decodeImage, downsample } from '../tools/build_global_dem.mjs';

function synth(ppd, fn) {
  const w = 360 * ppd, h = 180 * ppd;
  const data = new Int16Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) data[r * w + c] = fn(90 - (r + 0.5) / ppd, (c + 0.5) / ppd);
  return createGlobalGrid({ ppd, width: w, height: h }, data);
}

test('global grid indexes latitude from the north and longitude from 0° E, wrapping', () => {
  const g = synth(4, (lat, lon) => Math.round(lat * 10 + (lon < 180 ? lon : lon - 360)));
  assert.ok(Math.abs(g.heightAt(20, 30) - 230) < 3);
  assert.ok(Math.abs(g.heightAt(-45, -60) - (-510)) < 3, 'negative longitudes wrap to 300° E');
  assert.ok(Number.isFinite(g.heightAt(89.99, 0)) && Number.isFinite(g.heightAt(-89.99, 359.99)));
});

test('a synthetic mountain gives the horizon angle we expect from geometry', () => {
  // A 3 km high, ~10 km wide hill 50 km due east of a site on the equator.
  const site = { lat: 0, lon: 30 };
  const hillLon = 30 + (50000 / MOON_RADIUS_M) * (180 / Math.PI);
  const g = synth(32, (lat, lon) => Math.round(3000 * Math.exp(-(((lat) ** 2 + (lon - hillLon) ** 2) / (0.15 ** 2)))));
  const h = computeHorizon(createTerrain([], g), site.lat, site.lon, { mastHeight: 2 });
  const east = h.elevations[180]; // 90° azimuth at 0.5° steps
  const theta = 50000 / MOON_RADIUS_M;
  const expected = Math.atan2((MOON_RADIUS_M + 3000) * Math.cos(theta) - (MOON_RADIUS_M + 2), (MOON_RADIUS_M + 3000) * Math.sin(theta)) * 180 / Math.PI;
  assert.ok(Math.abs(east - expected) < 0.25, `east ${east.toFixed(2)} vs ${expected.toFixed(2)}`);
  assert.ok(h.elevations[540] < 0, 'looking west there is no hill, so the skyline dips below level');
  assert.match(h.source, /global grid/);
});

test('PDS label parsing, decoding and downsampling', () => {
  const lab = parseLabel('LINES = 2\nLINE_SAMPLES = 4\nSAMPLE_TYPE = LSB_INTEGER\nSAMPLE_BITS = 16\nSCALING_FACTOR = 0.5\nOFFSET = 1737400.\nMAXIMUM_LATITUDE = 90 <DEG>\nWESTERNMOST_LONGITUDE = 0 <DEG>\nMAP_RESOLUTION = 16 <PIX/DEG>');
  assert.deepEqual([lab.lines, lab.samples, lab.scale, lab.offset, lab.maxLat, lab.westLon, lab.ppd], [2, 4, 0.5, 1737400, 90, 0, 16]);
  const buf = Buffer.alloc(16);
  [2, 4, 6, 8, -2, -4, -6, -8].forEach((v, i) => buf.writeInt16LE(v, i * 2));
  const hts = decodeImage(buf, lab);
  assert.deepEqual(Array.from(hts), [1, 2, 3, 4, -1, -2, -3, -4]);
  const ds = downsample(hts, 4, 2, 2);
  assert.deepEqual([ds.w, ds.h, ...ds.data], [2, 1, 0, 0]);
});
