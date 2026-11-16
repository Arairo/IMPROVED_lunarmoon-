// Scenario Comparison Lab: multi-site & launch-slip evaluation and CSV export.
import { esc, fmtHours, fmtLatLon, pct } from './format.js';
import { SYNODIC_MONTH_DAYS } from '../core/constants.js';
import { prepareSite, scanWindow } from '../core/analysis.js';
import { renderCompareLab } from './compareLab.js';

export const COLUMNS = [
  { key: 'litFraction', label: 'Sunlit', fmt: (v) => pct(v, 1), better: 'high', tol: 0.03 },
  { key: 'avgPowerW', label: 'Avg power', fmt: (v) => `${v.toFixed(0)} W`, better: 'high', tolRel: 0.05 },
  { key: 'longestDarkH', label: 'Longest dark', fmt: fmtHours, better: 'low', tol: 12, open: 'longestDarkOpenEnded' },
  { key: 'batteryKWh', label: 'Battery', fmt: (v) => `${v.toFixed(1)} kWh`, better: 'low', tolRel: 0.1, tol: 0.2, open: 'batteryOpenEnded' },
  { key: 'earthCentreFraction', label: 'Earth in view', fmt: (v) => pct(v, 1), better: 'high', tol: 0.03 },
  { key: 'dteFraction', label: 'DTE link', fmt: (v) => pct(v, 1), better: 'high', tol: 0.03 },
  { key: 'longestBlackoutH', label: 'Longest blackout', fmt: fmtHours, better: 'low', tol: 12, open: 'longestBlackoutOpenEnded' },
];

// Illustrative screening thresholds
export const CRITERIA = {
  minLit: 0.5,
  maxDarkH: 120,
  minDte: 0.4,
  maxBlackoutH: 168,
};

export function verdictFor(stats) {
  const powerOk = stats.litFraction >= CRITERIA.minLit && stats.longestDarkH <= CRITERIA.maxDarkH;
  const commsOk = stats.dteFraction >= CRITERIA.minDte && stats.longestBlackoutH <= CRITERIA.maxBlackoutH;
  if (powerOk && commsOk) return { status: 'go', text: 'Meets both' };
  if (stats.dteFraction === 0) return { status: 'no-go', text: 'No DTE link' };
  if (stats.litFraction < 0.2) return { status: 'no-go', text: 'Too dark' };
  if (powerOk) return { status: 'marginal', text: 'Comms-limited' };
  if (commsOk) return { status: 'marginal', text: 'Power-limited' };
  return { status: 'no-go', text: 'Neither' };
}

let scenarioSeq = 0;

export function addScenario(app, site, startMs, label) {
  const configKey = JSON.stringify(app.config);
  const dup = app.scenarios.find((s) => s.site.id === site.id && s.site.lat === site.lat && s.site.lon === site.lon && s.startMs === startMs && s.windowDays === app.windowDays && s.configKey === configKey);
  if (dup) return dup;
  const ctx = prepareSite(site, app.config);
  const sc = scanWindow(ctx, startMs, app.windowDays, app.config);
  const item = { id: `sc-${++scenarioSeq}`, site, startMs, windowDays: app.windowDays, label, scan: sc, configKey };
  app.scenarios.push(item);
  const countEl = document.getElementById('headerCompareCount');
  if (countEl) { countEl.textContent = String(app.scenarios.length); countEl.classList.add('has-items'); }
  const btn = document.getElementById('modeCompareBtn');
  if (btn) { btn.classList.remove('is-bump'); void btn.offsetWidth; btn.classList.add('is-bump'); }
  return item;
}

export function renderCompareTable(container, app, onOpenScenario) {
  renderCompareLab(container, app, onOpenScenario, addScenario);
}

export function scenariosToCsv(scenarios) {
  const OPEN = COLUMNS.filter((c) => c.open);
  const head = ['label', 'lat', 'lon', 'window_start_utc', 'window_days', ...COLUMNS.map((c) => c.key), ...OPEN.map((c) => `${c.key}_cut_by_window`), 'screening'];
  const rows = scenarios.map((s) => [
    `"${s.label.replace(/"/g, '""')}"`,
    (s.site.lat ?? 0).toFixed(5),
    (s.site.lon ?? 0).toFixed(5),
    new Date(s.startMs).toISOString(),
    s.windowDays,
    ...COLUMNS.map((c) => (+s.scan.stats[c.key]).toFixed(4)),
    ...OPEN.map((c) => (s.scan.stats[c.open] && s.scan.stats[c.key] > 0 ? 'yes' : 'no')),
    verdictFor(s.scan.stats).text,
  ]);
  return [head.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function exportCompareCsv(scenarios) {
  if (!scenarios || !scenarios.length) return false;
  const csv = scenariosToCsv(scenarios);
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lunar-site-scenarios.csv';
  a.click();
  return true;
}
