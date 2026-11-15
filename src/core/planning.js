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
  const { lit, los } = sc.series;
  let both = 0;
  for (let i = 0; i < lit.length; i++) if (lit[i] && los[i]) both++;
  return {
    sun: sc.stats.litFraction,
    earth: sc.stats.earthCentreFraction,
    both: both / lit.length,
    darkH: sc.stats.longestDarkH,
    avgPowerW: sc.stats.avgPowerW,
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
  if (Math.abs(after.darkH - before.darkH) >= 1) parts.push(`longest night ${hours(before.darkH)} → ${hours(after.darkH)}`);
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
  const pts = [site, ...Object.keys(DIRECTIONS).map((d) => {
    const p = destination(site.lat, site.lon, DIRECTIONS[d], metres);
    return { ...site, id: `${site.id}-r${d}`, lat: p.lat, lon: p.lon };
  })];
  const all = pts.map((p) => windowStats(p, startMs, config, days, 2 * HOUR));
  const span = (k) => [Math.min(...all.map((s) => s[k])), Math.max(...all.map((s) => s[k]))];
  return { sun: span('sun'), earth: span('earth') };
}
