// Planning helpers built on the analysis engine: nudge a site, find the next
// usable landing window, and estimate how much the answer depends on exactly
// where inside one terrain cell the lander sits. No new physics here: every
// number comes from prepareSite() + scan().

import { prepareSite, scan } from './analysis.js';
import { destination } from './geo.js';

const DAY = 86400000;
const HOUR = 3600000;

export const DIRECTIONS = { N: 0, E: 90, S: 180, W: 270 };

/** A new custom site `km` kilometres from `site` towards `dir` (N, E, S or W). */
export function nudgeSite(site, dir, km) {
  const az = DIRECTIONS[dir];
  if (az === undefined) throw new Error(`Unknown direction ${dir}`);
  const p = destination(site.lat, site.lon, az, km * 1000);
  const base = site.baseName || site.short || site.name;
  const label = `${km} km ${dir}`;
  return {
    id: `custom-${p.lat.toFixed(4)},${p.lon.toFixed(4)}`,
    name: `${base}, ${label}`,
    short: `${base} · ${label}`,
    baseName: base,
    lat: p.lat,
    lon: p.lon,
    group: 'computed',
    nudged: true,
  };
}

/**
 * Headline numbers for a site over `days` from `startMs`, sampled hourly
 * (no DSN: it is the same for every lunar site).
 */
export function windowStats(site, startMs, config, days = 30, stepMs = HOUR) {
  const ctx = prepareSite(site, null, config);
  const sc = scan(ctx, { startMs, endMs: startMs + days * DAY, stepMs }, config, { withDsn: false });
  const { lit, los, dtH } = sc.series;
  let both = 0, total = 0;
  for (let i = 0; i < lit.length; i++) { total += dtH[i]; if (lit[i] && los[i]) both += dtH[i]; }
  return {
    sun: sc.stats.litFraction,
    earth: sc.stats.earthCentreFraction,
    both: both / total,
    darkH: sc.stats.longestDarkH,
    avgPowerW: sc.stats.avgPowerW,
    // The skyline came from the 5 km grid or a rough mast adjustment (terrain not loaded).
    approximate: ctx.horizon?.quality?.tier === 'coarse' || ctx.horizon?.quality?.tier === 'none',
  };
}

const pct = (f) => `${Math.round(f * 100)}%`;
// Difference of the two rounded percentages, so "54% → 56%" always reads "+2".
const delta = (a, b) => Math.round(b * 100) - Math.round(a * 100);
const signed = (d) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`;
const hours = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.round(h)} h`);

/** One plain sentence describing what changed between two windowStats results. */
export function describeChange(what, before, after) {
  const parts = [];
  const ds = delta(before.sun, after.sun);
  const de = delta(before.earth, after.earth);
  if (ds) parts.push(`sunlight ${pct(before.sun)} → ${pct(after.sun)} (${signed(ds)})`);
  if (de) parts.push(`Earth in view ${pct(before.earth)} → ${pct(after.earth)} (${signed(de)})`);
  if (hours(before.darkH) !== hours(after.darkH)) parts.push(`longest night ${hours(before.darkH)} → ${hours(after.darkH)}`);
  if (!parts.length) return `${what}: almost nothing changes over the next 30 days.`;
  return `${what}: ${parts.join(', ')}.`;
}

/**
 * First time from `fromMs` (within `searchDays`) at which the Sun is up and
 * Earth's centre is above the terrain, and both stay that way for at least
 * `minDays`. Returns { ms, endMs } or null. Resolution: `stepMs` (default 2 h).
 */
export function findNextWindow(site, fromMs, config, { minDays = 3, searchDays = 365, stepMs = 2 * HOUR } = {}) {
  const ctx = prepareSite(site, null, config);
  const sc = scan(ctx, { startMs: fromMs, endMs: fromMs + (searchDays + minDays) * DAY, stepMs }, config, { withDsn: false });
  const { times, lit, los } = sc.series;
  const n = times.length;
  const need = Math.ceil((minDays * DAY) / stepMs);
  // run[i] = how many consecutive samples from i onwards have both Sun and Earth up.
  const run = new Int32Array(n + 1);
  for (let i = n - 1; i >= 0; i--) run[i] = lit[i] && los[i] ? run[i + 1] + 1 : 0;
  const lastStart = fromMs + searchDays * DAY;
  for (let i = 0; i < n && times[i] <= lastStart; i++) {
    if (run[i] >= need) return { ms: times[i], endMs: times[Math.min(n - 1, i + run[i] - 1)] + stepMs };
  }
  return null;
}

/**
 * How sensitive the answer is to the exact landing point: the same window at
 * the site and 250 m (about one 240 m terrain cell) north, south, east and west.
 * Returns { sun: [min, max], earth: [min, max] }.
 */
export function positionRange(site, startMs, config, { metres = 250, days = 30 } = {}) {
  // The centre is computed live like the four around it (not looked up by id), so all
  // five rest on the same terrain.
  const pts = [{ ...site, id: `${site.id}-r0` }, ...Object.keys(DIRECTIONS).map((d) => {
    const p = destination(site.lat, site.lon, DIRECTIONS[d], metres);
    return { ...site, id: `${site.id}-r${d}`, lat: p.lat, lon: p.lon };
  })];
  const all = pts.map((p) => windowStats(p, startMs, config, days, 2 * HOUR));
  const span = (k) => [Math.min(...all.map((s) => s[k])), Math.max(...all.map((s) => s[k]))];
  return { sun: span('sun'), earth: span('earth'), approximate: all.some((s) => s.approximate) };
}

/**
 * Landing calendar: for each UTC day from `fromMs` (midnight), how good a
 * touchdown at `hourUtc` that day would be. Each day gets
 *   both  – hours the Sun and Earth then stay up together (capped at `capDays`),
 *   sun   – whether the Sun is up at touchdown,
 *   earth – whether Earth's centre is above the terrain at touchdown,
 *   rating – 'green' (Sun + Earth for ≥ minDays), 'amber' (Sun up, Earth hidden or
 *            together for less than minDays), 'red' (Sun down: no power).
 * Same rules as "Find the next good date", sampled every `stepMs` (2 h).
 */
export function landingCalendar(site, fromMs, days, config, { hourUtc = 12, minDays = 3, capDays = 14, stepMs = 2 * HOUR } = {}) {
  const d0 = Math.floor(fromMs / DAY) * DAY;
  const start = d0 + hourUtc * HOUR;
  const ctx = prepareSite(site, null, config);
  const sc = scan(ctx, { startMs: start, endMs: start + (days + capDays) * DAY, stepMs }, config, { withDsn: false });
  const { times, lit, los } = sc.series;
  const n = times.length;
  const run = new Int32Array(n + 1);
  for (let i = n - 1; i >= 0; i--) run[i] = lit[i] && los[i] ? run[i + 1] + 1 : 0;
  const out = [];
  for (let k = 0; k < days; k++) {
    const i = Math.round((k * DAY) / stepMs);
    if (i >= n) break;
    const bothH = Math.min(capDays * 24, (run[i] * stepMs) / HOUR);
    const sun = !!lit[i];
    const earth = !!los[i];
    const rating = !sun ? 'red' : bothH >= minDays * 24 ? 'green' : 'amber';
    out.push({ ms: times[i], dayMs: d0 + k * DAY, sun, earth, bothH, rating });
  }
  return out;
}

/**
 * Launch-date curve: for each day from `fromMs` (same time of day), the share
 * of the following `windowDays` with the Sun up AND Earth's centre above the
 * terrain. One scan, then a sliding window, so a whole year is cheap.
 * Returns [{ ms, both, sun, earth }].
 */
export function launchDateSeries(site, fromMs, days, config, { windowDays = 30, stepMs = 2 * HOUR } = {}) {
  const ctx = prepareSite(site, null, config);
  const sc = scan(ctx, { startMs: fromMs, endMs: fromMs + (days + windowDays) * DAY, stepMs }, config, { withDsn: false });
  const { times, lit, los } = sc.series;
  const n = times.length;
  const pb = new Float64Array(n + 1), ps = new Float64Array(n + 1), pe = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    pb[i + 1] = pb[i] + (lit[i] && los[i] ? 1 : 0);
    ps[i + 1] = ps[i] + (lit[i] ? 1 : 0);
    pe[i + 1] = pe[i] + (los[i] ? 1 : 0);
  }
  const w = Math.round((windowDays * DAY) / stepMs);
  const out = [];
  for (let d = 0; d < days; d++) {
    const i = Math.round((d * DAY) / stepMs);
    const j = Math.min(n, i + w);
    if (j - i < w * 0.9) break;
    out.push({ ms: times[i], both: (pb[j] - pb[i]) / (j - i), sun: (ps[j] - ps[i]) / (j - i), earth: (pe[j] - pe[i]) / (j - i) });
  }
  return out;
}

/** Points spread evenly over a disc (sunflower pattern), centre first. */
export function discPoints(site, radiusM, n) {
  const pts = [{ lat: site.lat, lon: site.lon, dist: 0, az: 0 }];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 1; i < n; i++) {
    const r = radiusM * Math.sqrt(i / (n - 1));
    const az = ((i * golden * 180) / Math.PI) % 360;
    const p = destination(site.lat, site.lon, az, r);
    pts.push({ lat: p.lat, lon: p.lon, dist: r, az });
  }
  return pts;
}

const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/**
 * Landing dispersion: a lander aimed at `site` touches down somewhere within
 * `radiusM`. Samples that disc and reports, over the next `days`, the spread of
 * time with the Sun and Earth up together: worst (min), P10, median, best, and
 * the worst spot. Each point gets its own terrain horizon.
 */
export function landingDispersion(site, startMs, config, opts = {}) {
  return runSync(dispersionSteps(site, startMs, config, opts));
}

// The work as a generator that yields after each touchdown point, so the same
// code runs either straight through (runSync) or in slices that let the page
// stay responsive (runSliced). Both give identical results.
function* dispersionSteps(site, startMs, config, { radiusM = 500, n = 25, days = 30 } = {}) {
  const pts = [];
  for (const [i, p] of discPoints(site, radiusM, n).entries()) {
    pts.push({ ...p, ...windowStats({ ...site, id: `${site.id}-d${i}`, lat: p.lat, lon: p.lon }, startMs, config, days, 2 * HOUR) });
    yield;
  }
  const both = pts.map((p) => p.both).sort((a, b) => a - b);
  const worst = pts.reduce((w, p) => (p.both < w.both ? p : w), pts[0]);
  return { radiusM, points: pts, centre: pts[0], min: both[0], p10: quantile(both, 0.1), p50: quantile(both, 0.5), max: both[both.length - 1], worst, approximate: pts.some((p) => p.approximate) };
}

function runSync(gen) {
  for (;;) { const r = gen.next(); if (r.done) return r.value; }
}

/**
 * Run a step generator in ~25 ms slices, yielding to the browser between them.
 * Resolves with the result, or null if `isCancelled()` turns true (a newer
 * request replaced this one).
 */
async function runSliced(gen, { isCancelled = () => false, sliceMs = 25 } = {}) {
  let t0 = performance.now();
  for (;;) {
    if (isCancelled()) return null;
    const r = gen.next();
    if (r.done) return r.value;
    if (performance.now() - t0 > sliceMs) { await new Promise((res) => setTimeout(res, 0)); t0 = performance.now(); }
  }
}

/** landingDispersion without blocking the page; null if cancelled. */
export function landingDispersionAsync(site, startMs, config, opts = {}, control = {}) {
  return runSliced(dispersionSteps(site, startMs, config, opts), control);
}
/** robustAim without blocking the page (about 1.7 s of work on a fast laptop); null if cancelled. */
export function robustAimAsync(site, startMs, config, opts = {}, control = {}) {
  return runSliced(aimSteps(site, startMs, config, opts), control);
}

/**
 * A safer place to aim: of the centre and six points half a radius away, the
 * aim whose own landing disc has the best worst-case (P10) time with the Sun
 * and Earth together. Returns { aim: {lat, lon, dist, az}, dispersion } for
 * the best candidate (the centre if nothing beats it).
 */
export function robustAim(site, startMs, config, opts = {}) {
  return runSync(aimSteps(site, startMs, config, opts));
}

function* aimSteps(site, startMs, config, { radiusM = 500, n = 13, days = 30 } = {}) {
  const cands = [{ lat: site.lat, lon: site.lon, dist: 0, az: 0 }];
  for (let k = 0; k < 6; k++) {
    const az = k * 60;
    const p = destination(site.lat, site.lon, az, radiusM / 2);
    cands.push({ lat: p.lat, lon: p.lon, dist: radiusM / 2, az });
  }
  let best = null;
  for (const [i, c] of cands.entries()) {
    const d = yield* dispersionSteps({ ...site, id: `${site.id}-a${i}`, lat: c.lat, lon: c.lon }, startMs, config, { radiusM, n, days });
    if (!best || d.p10 > best.dispersion.p10 + 1e-9) best = { aim: c, dispersion: d };
  }
  return best;
}
