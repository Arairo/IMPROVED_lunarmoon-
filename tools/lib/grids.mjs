// Node-side reading and writing of the shipped terrain grids, including the packed
// 20 m tiles (src/core/tileCodec.js). Used by the build tools and the tests.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createGrid } from '../../src/core/horizon.js';
import { deltaEncode, deltaDecode, TILE_EXT, TILE_ENCODING } from '../../src/core/tileCodec.js';

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/data');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const i16 = (buf) => new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

/** Heights of grid `name` (e.g. 'sp_fine', 'hires/ridge'), plain .bin or packed .i16z. */
export function readHeights(name, dataDir = DATA_DIR) {
  const meta = readJson(path.join(dataDir, `${name}.json`));
  const packed = path.join(dataDir, `${name}${TILE_EXT}`);
  if (meta.encoding && fs.existsSync(packed)) return { meta, heights: deltaDecode(i16(zlib.gunzipSync(fs.readFileSync(packed))), meta.size) };
  return { meta, heights: i16(fs.readFileSync(path.join(dataDir, `${name}.bin`))) };
}

export function readGrid(name, dataDir = DATA_DIR) {
  const { meta, heights } = readHeights(name, dataDir);
  return createGrid(meta, heights);
}

/** Every 20 m tile listed in hires/index.json, as grids. */
export function readHiresTiles(dataDir = DATA_DIR) {
  const p = path.join(dataDir, 'hires/index.json');
  if (!fs.existsSync(p)) return [];
  return readJson(p).tiles.map((t) => readGrid(`hires/${t.id}`, dataDir));
}

/** Write a 20 m tile packed (hires/<id>.i16z + .json); removes a stale unpacked .bin. */
export function writeTile(dir, id, meta, heights) {
  const m = { ...meta, encoding: TILE_ENCODING, file: `${id}${TILE_EXT}` };
  const packed = zlib.gzipSync(Buffer.from(deltaEncode(heights, meta.size).buffer), { level: 9 });
  fs.writeFileSync(path.join(dir, `${id}${TILE_EXT}`), packed);
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(m, null, 1));
  fs.rmSync(path.join(dir, `${id}.bin`), { force: true });
  return { meta: m, bytes: packed.length };
}
