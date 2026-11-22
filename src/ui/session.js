// Professional-mode progress kept for the browser tab (sessionStorage), so going to
// Terrain 3D (a separate page) and back does not lose the site, date, window, step,
// view, compare list or spacecraft assumptions. Nothing leaves the browser.

export const SESSION_KEY = 'lsp.proSession';
export const SESSION_VERSION = 1;
const MAX_AGE_MS = 12 * 3600000;

const siteRef = (s) => (s ? { id: s.id, name: s.name, short: s.short, lat: s.lat, lon: s.lon, group: s.group } : null);

/** Plain snapshot of the Pro state (no computed results: they are recomputed on restore). */
export function snapshotSession(app, extra = {}) {
  return {
    v: SESSION_VERSION,
    savedAt: Date.now(),
    site: siteRef(app.site),
    windowStartMs: app.windowStartMs,
    timeMs: app.timeMs,
    windowDays: app.windowDays,
    view: app.view || 'globe',
    mode: app.mode === 'compare' ? 'compare' : 'explorer',
    config: app.config ? JSON.parse(JSON.stringify(app.config)) : null,
    scenarios: (app.scenarios || []).map((s) => ({ site: siteRef(s.site), startMs: s.startMs, windowDays: s.windowDays, label: s.label, config: s.configKey ? JSON.parse(s.configKey) : null })),
    ...extra,
  };
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const okSite = (s) => s && finite(s.lat) && finite(s.lon) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 360;

/**
 * Check a stored snapshot; returns it cleaned, or null if it is missing, stale,
 * from another version or malformed (a bad value is never applied).
 */
export function validateSession(raw, now = Date.now()) {
  let s = raw;
  if (typeof raw === 'string') { try { s = JSON.parse(raw); } catch { return null; } }
  if (!s || s.v !== SESSION_VERSION || !finite(s.savedAt) || now - s.savedAt > MAX_AGE_MS || now < s.savedAt - 60000) return null;
  if (!okSite(s.site) || !finite(s.windowStartMs) || !finite(s.timeMs)) return null;
  return {
    ...s,
    windowDays: [15, 30, 90, 365].includes(s.windowDays) ? s.windowDays : 30,
    view: ['globe', 'polar', 'flight'].includes(s.view) ? s.view : 'globe',
    mode: s.mode === 'compare' ? 'compare' : 'explorer',
    step: Number.isInteger(s.step) && s.step >= 0 && s.step <= 4 ? s.step : 0,
    scenarios: Array.isArray(s.scenarios) ? s.scenarios.filter((c) => okSite(c?.site) && finite(c.startMs)).slice(0, 12) : [],
  };
}

/**
 * Copy saved settings into `target` only where the key already exists with the same
 * type, so an old or edited snapshot can't add or break settings.
 */
export function mergeConfig(target, saved) {
  if (!target || !saved || typeof saved !== 'object') return target;
  for (const k of Object.keys(target)) {
    if (!(k in saved)) continue;
    const a = target[k], b = saved[k];
    if (a && typeof a === 'object' && !Array.isArray(a)) mergeConfig(a, b);
    else if (typeof a === typeof b && (typeof b !== 'number' || Number.isFinite(b))) target[k] = b;
    else if (a === null && (b === null || typeof b === 'number')) target[k] = b;
  }
  return target;
}

export function saveSession(snapshot) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot)); return true; } catch { return false; }
}

export function loadSession() {
  try { return validateSession(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
