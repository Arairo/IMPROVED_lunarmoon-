// Lunar Site Planner engine as one ES module, for scripts and notebooks:
//
//   import * as lsp from 'https://arairo.github.io/IMPROVED_lunarmoon-/api/v1/lsp-engine.js';
//   const site = lsp.sites.find((s) => s.id === 'ridge');
//   const ctx = lsp.prepareSite(site);
//   const now = lsp.evaluate(Date.now(), ctx);           // Sun, Earth, power, DSN, link at one instant
//   const win = lsp.scanWindow(ctx, Date.UTC(2027, 0, 1), 30); // a 30-day window
//   console.log(win.stats, lsp.scanToCsv(win, { site }));
//
// Same code as the web app. Sites in the list use their precomputed LOLA
// skylines (20 m terrain where available); arbitrary coordinates fall back to
// a coarse built-in terrain model, so use the app for those.
export { DEFAULT_CONFIG, prepareSite, evaluate, scan, scanWindow, nextTransition } from '../core/analysis.js';
export { planFlight, compareRoutes, LAUNCH_SITES, LANDERS, ROUTES } from '../core/flight.js';
export { scanToCsv } from '../core/exportCsv.js';
export { default as sites } from '../data/sites.js';
export const version = '1';
