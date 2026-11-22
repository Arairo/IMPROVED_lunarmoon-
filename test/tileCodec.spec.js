// The packed 20 m tiles (src/core/tileCodec.js) must unpack to exactly the heights
// that were packed: checked on random data, on edge values, and on every shipped tile
// through both the Node (zlib) and the browser (DecompressionStream) paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { deltaEncode, deltaDecode, decodeTile, TILE_EXT } from '../src/core/tileCodec.js';
import { createTerrain, tilesNear } from '../src/core/horizon.js';
import { toSouthPolar, fromSouthPolar } from '../src/core/geo.js';
import { DATA_DIR, readHeights, readHiresTiles } from '../tools/lib/grids.mjs';

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test('Delta packing round-trips exactly, including wrap-around and no-data', () => {
  const n = 37;
  const a = new Int16Array(n * n);
  let seed = 7;
  for (let i = 0; i < a.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; a[i] = (seed % 65536) - 32768; }
  a[0] = -32768; a[1] = 32767; a[n] = 32767; a[n + 1] = -32768; // largest possible jumps
  assert.ok(same(deltaDecode(deltaEncode(a, n), n), a));
});

test('Every shipped 20 m tile unpacks to the same heights in Node and in the browser path', async () => {
  const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'hires/index.json'), 'utf8'));
  assert.ok(index.tiles.length > 0);
  for (const t of index.tiles) {
    const meta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `hires/${t.id}.json`), 'utf8'));
    assert.equal(meta.file, `${t.id}${TILE_EXT}`, t.id);
    assert.equal(meta.size, t.size, t.id);
    const file = fs.readFileSync(path.join(DATA_DIR, 'hires', meta.file));
    const viaBrowser = await decodeTile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), meta.size);
    const { heights } = readHeights(`hires/${t.id}`);
    assert.equal(heights.length, meta.size * meta.size, t.id);
    assert.ok(same(viaBrowser, heights), `${t.id}: browser and Node unpacking differ`);
    // Re-packing gives back the same bytes after unpacking (the format is stable).
    const again = new Int16Array(zlib.gunzipSync(zlib.gzipSync(Buffer.from(deltaEncode(heights, meta.size).buffer))).buffer.slice(0));
    assert.ok(same(deltaDecode(again, meta.size), heights), t.id);
    // Plausible lunar heights (m about the 1737.4 km sphere) apart from no-data.
    let lo = Infinity, hi = -Infinity;
    for (const v of heights) if (v !== -32768) { if (v < lo) lo = v; if (v > hi) hi = v; }
    assert.ok(lo > -10000 && hi < 10000, `${t.id}: heights ${lo}..${hi}`);
  }
});

test('Terrain lookup by position gives the same heights as trying every tile', () => {
  const tiles = readHiresTiles();
  const fast = createTerrain(tiles);
  // Reference: plain first-match over the tiles, finest first (what createTerrain did before).
  const slow = (lat, lon) => {
    const { x, y } = toSouthPolar(lat, lon);
    for (const g of tiles) if (g.covers(x, y)) { const h = g.sample(x, y); if (!Number.isNaN(h)) return h; }
    return null;
  };
  let checked = 0;
  for (const g of tiles) {
    const { centreX: cx, centreY: cy, halfExtent: h } = g.meta;
    for (const [fx, fy] of [[0, 0], [0.7, -0.3], [-0.99, 0.99], [1.01, 0.2]]) {
      const x = cx + fx * h, y = cy + fy * h;
      const { lat: pLat, lon: pLon } = fromSouthPolar(x, y);
      const a = fast.heightAt(pLat, pLon);
      const b = slow(pLat, pLon);
      assert.equal(a?.global ? null : a?.height ?? null, b, `${g.meta.name} at ${fx},${fy}`);
      checked++;
    }
  }
  assert.ok(checked >= 4 * tiles.length);
});

test('A site near a tile edge gets the neighbouring tiles too', () => {
  const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'hires/index.json'), 'utf8')).tiles;
  const t = index[0];
  const near = tilesNear(index, t.centreX + t.halfExtent - 100, t.centreY);
  assert.ok(near.some((u) => u.id === t.id));
  assert.equal(tilesNear(index, t.centreX + t.halfExtent + 5000, t.centreY, 3000).some((u) => u.id === t.id), false);
});
