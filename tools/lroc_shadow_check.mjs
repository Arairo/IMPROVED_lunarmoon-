// Compare real shadows in an LROC NAC mosaic with the shadows our terrain
// predicts at the moments the images were taken (see tools/lroc_fetch.py).
//   node tools/lroc_shadow_check.mjs data-raw/lroc
// Writes public/data/lroc_check.json and data-raw/lroc/panel.rgb (made into a
// PNG by `python3 tools/lroc_fetch.py data-raw/lroc --png`).
//
// Method, at 40 m: a pixel counts as lit in the photo if all four 20 m pixels
// are brighter than the Otsu threshold, shadowed if all four are darker, and
// is skipped otherwise. Predicted: the Sun's centre is above the terrain
// skyline (0.5 m above the ground) along the Sun's azimuth at all four image
// times; skipped if the times disagree or the Sun is within its own radius
// (0.27 deg) of the skyline. Done with the 20 m tile and again without it.
import fs from 'node:fs';
import path from 'node:path';
import { createGrid, createTerrain, rayHorizon } from '../src/core/horizon.js';
import { createGlobalGrid } from '../src/core/globalDem.js';
import { moonFixedState, topocentric } from '../src/core/ephemeris.js';
import { readHiresTiles } from './lib/grids.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = process.argv[2] || 'data-raw/lroc';
const rj = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const i16 = (p) => new Int16Array(fs.readFileSync(p).buffer.slice(0));
const data = path.join(root, 'public/data');
const grid = (n) => createGrid(rj(path.join(data, `${n}.json`)), i16(path.join(data, `${n}.bin`)));
const meta = rj(path.join(dir, 'lroc.json'));
const img = new Float32Array(fs.readFileSync(path.join(dir, 'lroc.f32')).buffer.slice(0));
// All 20 m tiles (the photo's site may sit on a site tile or a region tile).
const hires = readHiresTiles(data);
const global = createGlobalGrid(rj(path.join(data, 'global_dem.json')), i16(path.join(data, 'global_dem.bin')));
const fine = grid('sp_fine'), coarse = grid('sp_coarse');
const terrains = { m20: createTerrain([...hires, fine, coarse], global), m240: createTerrain([fine, coarse], global) };
const R = 1737400, DEG = Math.PI / 180, SUN_R = 0.267;
const n20 = meta.size, n = n20 / 2, cell = 40, half = meta.halfExtent;
const states = meta.imageTimes.map((t) => moonFixedState(Date.parse(t)));

// Otsu threshold on the valid 20 m pixels.
const vals = Array.from(img).filter((v) => v > -9999);
const lo = vals.reduce((a, b) => Math.min(a, b), Infinity), hi = vals.reduce((a, b) => Math.max(a, b), -Infinity), bins = 256, hist = new Float64Array(bins);
for (const v of vals) hist[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins))]++;
let best = 0, thrBin = 0, sumAll = 0, wB = 0, sumB = 0;
for (let i = 0; i < bins; i++) sumAll += i * hist[i];
for (let i = 0; i < bins; i++) {
  wB += hist[i]; if (!wB) continue;
  const wF = vals.length - wB; if (!wF) break;
  sumB += i * hist[i];
  const mB = sumB / wB, mF = (sumAll - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
  if (between > best) { best = between; thrBin = i; }
}
const thr = lo + ((thrBin + 0.5) / bins) * (hi - lo);

const toLatLon = (x, y) => { const rho = Math.hypot(x, y); return { lat: -(90 - (2 * Math.atan(rho / (2 * R))) / DEG), lon: Math.atan2(x, y) / DEG }; };
const result = {};
const photo = new Int8Array(n * n).fill(-1); // 1 lit, 0 shadow, -1 skip
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  let lit = 0, k = 0;
  for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const v = img[(2 * r + dr) * n20 + 2 * c + dc]; if (v > -9999) { k++; lit += v > thr ? 1 : 0; } }
  if (k === 4 && (lit === 4 || lit === 0)) photo[r * n + c] = lit === 4 ? 1 : 0;
}
let pred20 = null;
for (const [key, T] of Object.entries(terrains)) {
  const pred = new Int8Array(n * n).fill(-1);
  const m = { n: 0, agree: 0, litLit: 0, litDark: 0, darkLit: 0, darkDark: 0, skippedPhoto: 0, skippedPred: 0 };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c;
    if (photo[i] < 0) { m.skippedPhoto++; continue; }
    const x = meta.centreX - half + (c + 0.5) * cell, y = meta.centreY + half - (r + 0.5) * cell;
    const { lat, lon } = toLatLon(x, y);
    const ground = T.heightAt(lat, lon);
    if (!ground) { m.skippedPred++; continue; }
    let out = null;
    for (const st of states) {
      const sun = topocentric(st, { lat, lon, height: ground.height + 0.5 }).sun;
      const h = rayHorizon(T, lat, lon, sun.az, { ground, mastHeight: 0.5, maxDistM: 200000 });
      const margin = sun.el - h.el;
      const p = Math.abs(margin) < SUN_R ? -1 : margin > 0 ? 1 : 0;
      if (p < 0 || (out != null && out !== p)) { out = -1; break; }
      out = p;
    }
    if (out < 0) { m.skippedPred++; continue; }
    pred[i] = out;
    m.n++;
    if (out === photo[i]) m.agree++;
    if (out === 1 && photo[i] === 1) m.litLit++; else if (out === 1) m.litDark++;
    else if (photo[i] === 1) m.darkLit++; else m.darkDark++;
  }
  const po = m.agree / m.n;
  const pLitPred = (m.litLit + m.litDark) / m.n, pLitPhoto = (m.litLit + m.darkLit) / m.n;
  const pe = pLitPred * pLitPhoto + (1 - pLitPred) * (1 - pLitPhoto);
  result[key] = { ...m, agreement: Math.round(po * 1000) / 10, kappa: Math.round(((po - pe) / (1 - pe)) * 1000) / 1000 };
  console.log(key, JSON.stringify(result[key]));
  if (key === 'm20') pred20 = pred;
}

// Picture: the photo (left) and agreement (right) at 40 m.
const W = n * 2 + 8, H = n, rgb = new Uint8Array(W * H * 3).fill(255);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  let v = 0, k = 0;
  for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const q = img[(2 * r + dr) * n20 + 2 * c + dc]; if (q > -9999) { v += q; k++; } }
  const g = k ? Math.max(0, Math.min(255, Math.round(((v / k - lo) / (hi - lo)) ** 0.6 * 255))) : 40;
  let o = (r * W + c) * 3; rgb[o] = rgb[o + 1] = rgb[o + 2] = g;
  const i = r * n + c, p = pred20[i], ph = photo[i];
  const col = p < 0 || ph < 0 ? [70, 72, 80] : p === ph ? (p ? [250, 204, 21] : [30, 41, 90]) : p ? [239, 68, 68] : [56, 189, 248];
  o = (r * W + n + 8 + c) * 3; rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2];
}
fs.writeFileSync(path.join(dir, 'panel.rgb'), rgb);
fs.writeFileSync(path.join(dir, 'panel.json'), JSON.stringify({ width: W, height: H }));

fs.writeFileSync(path.join(data, 'lroc_check.json'), JSON.stringify({
  generated: new Date().toISOString(),
  product: meta.product, url: meta.url, images: meta.images, imageTimes: meta.imageTimes,
  site: meta.site, region: 'Peak Near Cabeus B (Artemis III candidate region)',
  gridM: cell, areaKm: (2 * half) / 1000, otsuThreshold: thr,
  with20m: result.m20, with240m: result.m240,
  legend: { yellow: 'lit in both', navy: 'shadow in both', red: 'we said lit, photo is dark', blue: 'we said shadow, photo is lit', grey: 'skipped (mixed pixel, Sun on the skyline, or the four image times disagree)' },
  method: 'Photo: Otsu threshold on the 20 m mosaic, 40 m cells kept only when all four 20 m pixels agree. Prediction: Sun centre above the LOLA skyline 0.5 m above the ground at all four image times, skipped within the Sun radius of the skyline. Same comparison with and without the 20 m terrain tile.',
  citation: 'Henriksen et al. (2023), Optimized Illuminated Terrain Coverage of the Candidate Artemis III Landing Sites with LROC NAC Controlled Mosaics, European Lunar Symposium. NASA/GSFC/Arizona State University.',
}, null, 1));
