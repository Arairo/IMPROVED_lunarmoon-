#!/usr/bin/env node
// Validation scoreboard: compares the engine's Sun and Earth azimuth and
// elevation with NASA JPL Horizons for many lunar sites and dates.
//
//   node tools/validate-horizons.mjs               # prints a Markdown table
//   node tools/validate-horizons.mjs --json out.json
//
// Needs internet access to ssd.jpl.nasa.gov (run it locally or with the
// "Validate against JPL Horizons" GitHub Actions workflow).
// Horizons: observer on the Moon (CENTER=coord@301), QUANTITIES=4 = apparent
// azimuth and elevation; COMMAND 10 = Sun, 399 = Earth; east-positive longitude.
import fs from 'node:fs';
import { prepareSite, evaluate, DEFAULT_CONFIG } from '../src/core/analysis.js';

export const SITES = [
  { name: 'Shackleton connecting ridge', lat: -89.45, lon: -137.31 },
  { name: 'Ridge high point near Shackleton', lat: -88.81, lon: 123.6 },
  { name: 'IM-2 Athena (Mons Mouton)', lat: -84.8, lon: 29.2 },
  { name: 'Chandrayaan-3 Vikram', lat: -69.373, lon: 32.319 },
  { name: 'Apollo 11', lat: 0.67416, lon: 23.47315 },
  { name: 'Apollo 17', lat: 20.18809, lon: 30.77475 },
  { name: 'Reiner Gamma', lat: 7.5, lon: -59.0 },
  { name: "Chang'e 4 (far side)", lat: -45.4446, lon: 177.5991 },
  // Added 21 Nov 2026 to widen the check: north pole, far-side equator, western limb.
  { name: 'Peary crater rim (north pole)', lat: 88.6, lon: 33.0 },
  { name: 'Daedalus (far side)', lat: -5.9, lon: 179.4 },
  { name: 'Mare Orientale (western limb)', lat: -19.4, lon: -92.8 },
];
// The first three are the original scoreboard. Added 21 Nov 2026: Apollo 11's
// touchdown time, a UTC year boundary, a leap day, and a date past the checked period.
export const TIMES = ['2026-11-16T22:00:00Z', '2027-06-01T06:00:00Z', '2028-03-15T12:00:00Z',
  '1969-07-20T20:17:40Z', '2026-12-31T23:59:30Z', '2028-02-29T12:00:00Z', '2030-01-01T00:00:00Z'];
const BODIES = [{ key: 'sun', command: '10' }, { key: 'earth', command: '399' }];

const jd = (ms) => ms / 86400000 + 2440587.5;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Parse azimuth and elevation from a Horizons text response (CSV_FORMAT=YES). */
export function parseHorizons(text) {
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!block) throw new Error('No $$SOE/$$EOE block in the Horizons response');
  const line = block.trim().split('\n')[0];
  const f = line.split(',').map((s) => s.trim());
  const az = Number(f[3]);
  const el = Number(f[4]);
  if (!Number.isFinite(az) || !Number.isFinite(el)) throw new Error(`Unexpected Horizons line: ${line}`);
  return { az, el };
}

async function horizons(command, site, ms) {
  const q = new URLSearchParams({
    format: 'text', COMMAND: command, CENTER: 'coord@301', COORD_TYPE: 'GEODETIC',
    SITE_COORD: `${site.lon},${site.lat},0`, TLIST: jd(ms).toFixed(9), QUANTITIES: '4', CSV_FORMAT: 'YES',
  });
  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${q}`);
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`);
  return parseHorizons(await res.text());
}

async function main() {
  const rows = [];
  for (const site of SITES) {
    const ctx = prepareSite({ id: `v-${site.lat},${site.lon}`, ...site }, null, DEFAULT_CONFIG);
    for (const utc of TIMES) {
      const ms = Date.parse(utc);
      const ours = evaluate(ms, ctx, DEFAULT_CONFIG, { withDsn: false });
      for (const b of BODIES) {
        const ref = await horizons(b.command, site, ms);
        rows.push({ site: site.name, utc, body: b.key, az: ours[b.key].az, el: ours[b.key].el, refAz: ref.az, refEl: ref.el,
          dAz: angDiff(ours[b.key].az, ref.az), dEl: Math.abs(ours[b.key].el - ref.el) });
        await sleep(400); // be polite to the Horizons API
      }
    }
  }
  const worstEl = Math.max(...rows.map((r) => r.dEl));
  const worstAz = Math.max(...rows.map((r) => r.dAz));
  const medianEl = rows.map((r) => r.dEl).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  const out = [
    `## Engine vs NASA JPL Horizons (${rows.length} comparisons)`,
    '',
    `Worst elevation difference ${worstEl.toFixed(4)}°, worst azimuth difference ${worstAz.toFixed(4)}°, median elevation difference ${medianEl.toFixed(4)}°.`,
    '',
    '| Site | UTC | Body | Horizons az / el | Ours az / el | Δel |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.site} | ${r.utc.slice(0, 16)} | ${r.body} | ${r.refAz.toFixed(4)}° / ${r.refEl.toFixed(4)}° | ${r.az.toFixed(4)}° / ${r.el.toFixed(4)}° | ${r.dEl.toFixed(4)}° |`),
  ].join('\n');
  console.log(out);
  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt > 0) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ generated: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'not recorded', worstEl, worstAz, medianEl, rows }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
