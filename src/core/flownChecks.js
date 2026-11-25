// Checks against what actually flew: the engine's Sun position at real
// landings and its sunrise/sunset times against what mission teams reported.
// Used by the tests (so every build re-checks them) and by the "How we know
// it's right" panel.

import { prepareSite, evaluate, scanWindow, DEFAULT_CONFIG } from './analysis.js';

const DAY = 86400000;

// Sun elevation above a level horizon at touchdown, from the Apollo mission
// reports / Apollo Lunar Surface Journal. (Apollo 16 is left out: its landing
// came 5 h 42 min late and published figures differ on which time they mean.)
export const APOLLO_SUN = [
  { id: 'a11', name: 'Apollo 11', utc: '1969-07-20T20:17:40Z', reportedDeg: 10.8 },
  { id: 'a12', name: 'Apollo 12', utc: '1969-11-19T06:54:35Z', reportedDeg: 5.1 },
  { id: 'a14', name: 'Apollo 14', utc: '1971-02-05T09:18:11Z', reportedDeg: 10.3 },
  { id: 'a15', name: 'Apollo 15', utc: '1971-07-30T22:16:29Z', reportedDeg: 12.2 },
  { id: 'a17', name: 'Apollo 17', utc: '1972-12-11T19:54:57Z', reportedDeg: 13.0 },
];

// Day/night events that mission teams reported (dates in UTC).
export const FLOWN_EVENTS = [
  { id: 'bg1', name: 'Blue Ghost Mission 1', event: 'sunset', from: '2025-03-02T08:34Z', reported: '2025-03-16', note: 'Firefly photographed the lunar sunset on 16 March 2025 and kept working a few hours into the night.' },
  { id: 'ch3', name: 'Chandrayaan-3', event: 'sunset', from: '2023-08-23T12:33Z', reported: '2023-09-04', note: 'Landed on 23 August 2023, early in the lunar morning; ISRO put Vikram to sleep on 4 September, ahead of nightfall.' },
  { id: 'slim', name: 'SLIM', event: 'sunset', from: '2024-01-19T15:20Z', reported: '2024-01-31', note: 'JAXA put SLIM into dormancy as lunar night fell at the end of January 2024.' },
];

export function apolloChecks(sites) {
  return APOLLO_SUN.map((a) => {
    const site = sites.find((s) => s.id === a.id);
    const ctx = prepareSite(site, null, DEFAULT_CONFIG);
    const ours = evaluate(Date.parse(a.utc), ctx, DEFAULT_CONFIG, { withDsn: false }).sun.el;
    return { ...a, oursDeg: ours, diffDeg: ours - a.reportedDeg };
  });
}

/** First change of the requested kind after `from`: one 20-day scan at scanWindow's 30-minute steps (no refinement). */
export function flownEventChecks(sites) {
  return FLOWN_EVENTS.map((f) => {
    const site = sites.find((s) => s.id === f.id);
    const ctx = prepareSite(site, null, DEFAULT_CONFIG);
    const start = Date.parse(f.from);
    const sc = scanWindow(ctx, start, 20, DEFAULT_CONFIG);
    const { times, lit } = sc.series;
    let ms = null;
    for (let i = 1; i < times.length; i++) {
      const rise = !lit[i - 1] && lit[i];
      if ((f.event === 'sunset' && lit[i - 1] && !lit[i]) || (f.event === 'sunrise' && rise)) { ms = times[i]; break; }
    }
    const days = ms == null ? null : (ms - Date.parse(`${f.reported}T12:00Z`)) / DAY;
    return { ...f, oursMs: ms, diffDays: days };
  });
}
