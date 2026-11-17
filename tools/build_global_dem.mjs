#!/usr/bin/env node
// Pack NASA LRO LOLA's global elevation map (PDS "LDEM_<ppd>.IMG", simple
// cylindrical) into the web format read by src/core/globalDem.js.
//
//   node tools/build_global_dem.mjs data-raw/ldem_16.img [--ppd 8]
//
// Reads the PDS label next to the image (ldem_16.lbl / LDEM_16.LBL) when it is
// there; otherwise uses the documented LDEM_16 layout. Output:
//   public/data/global_dem.bin   int16 LE metres above the 1737.4 km sphere
//   public/data/global_dem.json  layout + provenance
// The runtime file is block-averaged to --ppd (default 8 px/deg, ~3.8 km).
import fs from 'node:fs';
import path from 'node:path';

const REF_RADIUS = 1737400;

export function parseLabel(text) {
  const get = (k) => { const m = new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\r\\n<]+)`, 'mi').exec(text); return m ? m[1].trim() : null; };
  const num = (k) => { const v = get(k); return v == null ? null : Number(v.replace(/[^0-9eE.+-]/g, '')); };
  return {
    lines: num('LINES'), samples: num('LINE_SAMPLES'), bits: num('SAMPLE_BITS'), type: get('SAMPLE_TYPE'),
    scale: num('SCALING_FACTOR'), offset: num('OFFSET'), maxLat: num('MAXIMUM_LATITUDE'),
    westLon: num('WESTERNMOST_LONGITUDE'), ppd: num('MAP_RESOLUTION'),
  };
}

/** Decode the raw image into Float32 heights (m above the reference sphere). */
export function decodeImage(buf, lab) {
  const n = lab.lines * lab.samples;
  if (buf.length < n * 2) throw new Error(`image is ${buf.length} bytes, expected ${n * 2}`);
  const big = /MSB|SUN|MAC/i.test(lab.type || '');
  const out = new Float32Array(n);
  const base = (lab.offset ?? REF_RADIUS) - REF_RADIUS; // LDEM offset is the 1737.4 km sphere, so this is 0
  for (let i = 0; i < n; i++) out[i] = (big ? buf.readInt16BE(i * 2) : buf.readInt16LE(i * 2)) * (lab.scale ?? 0.5) + base;
  return out;
}

/** Block-average to a coarser grid (factor must divide both sides). */
export function downsample(src, w, h, factor) {
  const W = w / factor, H = h / factor;
  const out = new Int16Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    let s = 0;
    for (let i = 0; i < factor; i++) for (let j = 0; j < factor; j++) s += src[(r * factor + i) * w + c * factor + j];
    out[r * W + c] = Math.round(s / (factor * factor));
  }
  return { data: out, w: W, h: H };
}

export function loadLdem(imgPath) {
  const dir = path.dirname(imgPath), stem = path.basename(imgPath, path.extname(imgPath));
  const lblPath = [`${stem}.lbl`, `${stem}.LBL`, `${stem.toUpperCase()}.LBL`].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  const lab = lblPath ? parseLabel(fs.readFileSync(lblPath, 'utf8')) : {};
  // Documented LDEM_16 layout, used for anything the label does not give.
  const ppdFromName = Number((/ldem_(\d+)/i.exec(stem) || [])[1]) || 16;
  const L = {
    lines: lab.lines || 180 * ppdFromName, samples: lab.samples || 360 * ppdFromName, type: lab.type || 'LSB_INTEGER',
    scale: lab.scale ?? 0.5, offset: lab.offset ?? REF_RADIUS, maxLat: lab.maxLat ?? 90, westLon: lab.westLon ?? 0, ppd: lab.ppd || ppdFromName,
  };
  if (L.maxLat !== 90 || L.westLon !== 0) throw new Error(`unexpected layout: max lat ${L.maxLat}, west lon ${L.westLon}`);
  const heights = decodeImage(fs.readFileSync(imgPath), L);
  // Sanity: the Moon's relief runs from about -9.1 km (Antoniadi) to +10.8 km (Selenean summit).
  let min = Infinity, max = -Infinity;
  for (const v of heights) { if (v < min) min = v; if (v > max) max = v; }
  if (!(min > -10000 && min < -8000 && max > 9500 && max < 11500)) throw new Error(`implausible heights ${min}..${max} m: wrong byte order or scale?`);
  return { heights, w: L.samples, h: L.lines, ppd: L.ppd, min, max, label: lblPath ? path.basename(lblPath) : 'none (documented LDEM layout)' };
}

async function main() {
  const img = process.argv[2];
  if (!img) { console.error('usage: node tools/build_global_dem.mjs <ldem_16.img> [--ppd 8]'); process.exit(1); }
  const at = process.argv.indexOf('--ppd');
  const outPpd = at > 0 ? Number(process.argv[at + 1]) : 8;
  const src = loadLdem(img);
  const factor = src.ppd / outPpd;
  if (!Number.isInteger(factor) || factor < 1) throw new Error(`cannot go from ${src.ppd} to ${outPpd} px/deg`);
  const ds = downsample(src.heights, src.w, src.h, factor);
  const outDir = path.resolve('public/data');
  fs.writeFileSync(path.join(outDir, 'global_dem.bin'), Buffer.from(ds.data.buffer));
  const meta = {
    name: 'global_dem', projection: 'simple cylindrical (equirectangular)', ppd: outPpd, width: ds.w, height: ds.h,
    dtype: 'int16-le', units: 'metres above the 1737.4 km reference sphere', rowOrder: 'row 0 at +90 lat, column 0 at 0 E, cell centres at +0.5',
    minHeight: Math.round(src.min), maxHeight: Math.round(src.max),
    source: `NASA LRO LOLA global elevation map LDEM_${src.ppd} (PDS Geosciences Node), block-averaged to ${outPpd} px/deg`,
    built: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'global_dem.json'), JSON.stringify(meta, null, 2));
  console.log(`global_dem: ${ds.w}x${ds.h} at ${outPpd} px/deg, heights ${meta.minHeight}..${meta.maxHeight} m, label: ${src.label}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
