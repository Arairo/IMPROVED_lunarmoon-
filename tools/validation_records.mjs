#!/usr/bin/env node
// Machine-readable validation records (second audit 6.2), one per check, in
// docs/validation/*.json with the same small schema:
//   schemaVersion, kind, applicationCommit, datasetVersion, validationDateUtc,
//   reference, caseCount, sites, dates, configuration, metrics, failedCases
//
//   node tools/validation_records.mjs
//
// - jpl-horizons.json: recomputed now. The JPL Horizons reference values are stored
//   in public/data/validation.json (fetched by tools/validate-horizons.mjs); the app's
//   values are computed again with the current code, so this can be repeated offline
//   at any commit.
// - pgda.json, lroc.json: summaries of public/data/pgda_check.json and lroc_check.json,
//   which only the data workflows can regenerate (they need NASA's servers). Their
//   applicationCommit is the one recorded in those files, or "not recorded".
// - azimuth-resolution.json is written by tools/azimuth_resolution.mjs.
// Values are never invented: anything not recorded is written as "not recorded".
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepareSite, evaluate, DEFAULT_CONFIG } from '../src/core/analysis.js';
import { SITES as JPL_SITES } from './validate-horizons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'public/data');
const outDir = path.join(root, 'docs/validation');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
let commit = 'not recorded';
try { commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch {}
const datasetVersion = `public/data/manifest.json sha256 ${createHash('sha256').update(fs.readFileSync(path.join(data, 'manifest.json'))).digest('hex')}`;
const now = new Date().toISOString();
const quantile = (arr, q) => { const a = [...arr].sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const dist = (arr) => ({ n: arr.length, median: +quantile(arr, 0.5).toFixed(5), p95: +quantile(arr, 0.95).toFixed(5), max: +Math.max(...arr).toFixed(5) });
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const write = (name, rec) => { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, name), JSON.stringify(rec, null, 1)); console.log(`wrote docs/validation/${name}`); };

// ---- JPL Horizons: Sun and Earth positions ----------------------------------------
{
  const stored = readJson(path.join(data, 'validation.json'));
  const LIMIT = { elDeg: 0.01, azDeg: 0.05 };
  const rows = stored.rows.map((r) => {
    const site = JPL_SITES.find((s) => s.name === r.site);
    if (!site) return { ...r, error: 'site not in tools/validate-horizons.mjs' };
    const ev = evaluate(Date.parse(r.utc), prepareSite({ ...site, id: 'jpl' }, DEFAULT_CONFIG), DEFAULT_CONFIG, { withDsn: false });
    const ours = ev[r.body];
    return { site: r.site, utc: r.utc, body: r.body, refAz: r.refAz, refEl: r.refEl, az: +ours.az.toFixed(6), el: +ours.el.toFixed(6), dAz: angDiff(ours.az, r.refAz), dEl: Math.abs(ours.el - r.refEl) };
  });
  const ok = rows.filter((r) => !r.error);
  const byBody = (b) => ({ elevationDeg: dist(ok.filter((r) => r.body === b).map((r) => r.dEl)), azimuthDeg: dist(ok.filter((r) => r.body === b).map((r) => r.dAz)) });
  write('jpl-horizons.json', {
    schemaVersion: 1,
    kind: 'astronomy: Sun and Earth azimuth/elevation',
    applicationCommit: commit,
    datasetVersion,
    validationDateUtc: now,
    reference: `NASA JPL Horizons observer tables (CENTER=coord@301, QUANTITIES=4: apparent azimuth/elevation; COMMAND 10 Sun, 399 Earth), fetched ${stored.generated} by tools/validate-horizons.mjs`,
    caseCount: ok.length,
    sites: [...new Set(ok.map((r) => r.site))],
    dates: [...new Set(ok.map((r) => r.utc))],
    configuration: { engine: 'astronomy-engine + IAU lunar rotation model (src/core/ephemeris.js)', observerHeightM: 'site on the 1737.4 km sphere + 2 m mast (as the app)', limits: LIMIT, scope: 'Validates celestial positions at these sites and times only; terrain, power and radio are separate checks.' },
    metrics: { sun: byBody('sun'), earth: byBody('earth'), all: { elevationDeg: dist(ok.map((r) => r.dEl)), azimuthDeg: dist(ok.map((r) => r.dAz)) } },
    failedCases: [...rows.filter((r) => r.error), ...ok.filter((r) => r.dEl >= LIMIT.elDeg || r.dAz >= LIMIT.azDeg)],
    rows,
  });
}

// ---- NASA GSFC PGDA: average Sun / Earth visibility --------------------------------
{
  const p = readJson(path.join(data, 'pgda_check.json'));
  // Our finest skyline against PGDA's finest map at the site (60 m where it covers the
  // site, else 120 m): finer terrain lowers sunlight on crests, so mixing resolutions
  // exaggerates differences (e.g. Malapert: PGDA 38.1% at 120 m, 27.9% at 60 m).
  const sites = p.sites.map((s) => {
    const ours = s.ours20?.sun ?? s.ours240?.sun ?? null;
    const ref = s.pgdaSun60 ?? s.pgdaSun120 ?? null;
    return { id: s.id, ours20mSun: s.ours20?.sun ?? null, ours240mSun: s.ours240?.sun ?? null, pgdaSun120: s.pgdaSun120, pgdaSun60: s.pgdaSun60, pgdaEarth120: s.pgdaEarth120,
      comparedWith: s.pgdaSun60 != null ? 'PGDA 60 m' : 'PGDA 120 m', diffPts: ours != null && ref != null ? +(ours - ref).toFixed(1) : null };
  });
  const diffs = sites.filter((s) => s.diffPts != null).map((s) => Math.abs(s.diffPts));
  const diffs120 = sites.filter((s) => s.pgdaSun120 != null).map((s) => Math.abs((s.ours20mSun ?? s.ours240mSun) - s.pgdaSun120));
  write('pgda.json', {
    schemaVersion: 1,
    kind: 'terrain + illumination: average sunlight / Earth visibility maps',
    applicationCommit: p.commit || 'not recorded',
    datasetVersion,
    validationDateUtc: p.generated,
    reference: `NASA GSFC PGDA average visibility (Mazarico et al. 2011 method, product 201608): ${Object.values(p.products || {}).join(', ')}`,
    caseCount: (p.maps?.sun?.n ?? 0) + (p.maps?.earth?.n ?? 0) + sites.length,
    sites: sites.map((s) => s.id),
    dates: { ours: 'calendar year 2027, 6-hour steps (main comparison); 18.6-year cycle from 2009 (like for like)', pgda: 'multi-year average' },
    configuration: { mastHeightM: 2, mapGrid: '184 x 184 cells of 5 km, within 440 km of the south pole', note: p.note, likeForLikeMethod: p.likeForLike?.method ?? 'not recorded' },
    metrics: { mapsMain: p.maps, mapsLikeForLike: p.likeForLike?.maps ?? 'not recorded', sitesSunAbsDiffPtsVsFinestPgda: diffs.length ? dist(diffs) : null, sitesSunAbsDiffPtsVsPgda120: diffs120.length ? dist(diffs120) : null },
    failedCases: sites.filter((s) => s.diffPts != null && Math.abs(s.diffPts) > 10).map((s) => ({ ...s, threshold: 'more than 10 points from PGDA at its finest resolution here (quantities differ: Sun centre for 2027 vs disk fraction over many years; see docs/VALIDATION.md)' })),
    perSite: sites,
  });
}

// ---- LROC NAC: lit / shadowed pixels in photos --------------------------------------
{
  const l = readJson(path.join(data, 'lroc_check.json'));
  const m = (c) => ({ agreementPct: c.agreement, kappa: c.kappa, pixels: c.n, litPredictedLitPhoto: c.litLit, falseLit: c.litDark, falseShadow: c.darkLit, darkDark: c.darkDark });
  write('lroc.json', {
    schemaVersion: 1,
    kind: 'terrain shadows vs photographs',
    applicationCommit: l.commit || 'not recorded',
    datasetVersion,
    validationDateUtc: l.generated,
    reference: `LROC images ${l.images.join(', ')} (${l.product}), ${l.url}`,
    caseCount: l.with20m.n,
    sites: [l.site],
    dates: l.imageTimes,
    configuration: { gridM: l.gridM, areaKm: l.areaKm, threshold: `Otsu ${l.otsuThreshold}`, method: l.method, note: 'Run before the 20 m region tiles (22 Nov 2026) replaced the site tile here; re-run the "Check shadows against an LROC photo" workflow to refresh.' },
    metrics: { with20m: m(l.with20m), with240m: m(l.with240m) },
    failedCases: [],
  });
}
