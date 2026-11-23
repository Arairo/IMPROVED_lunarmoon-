// Site/date evaluation: one instant, a whole time window, and event search.
// This is the single source of numbers for the UI, the tests and the offline
// illumination-map tool, so every view agrees.

import { enuBasis } from './geo.js';
import { moonFixedState, topocentric } from './ephemeris.js';
import { computeHorizon, computeSiteHorizon, horizonAt } from './horizon.js';
import { DEFAULT_POWER_CONFIG, simulateBattery, solarPower } from './power.js';
import {
  DEFAULT_COMMS_CONFIG,
  dsnVisibility,
  earthAngularRadiusDeg,
  lightTimeS,
  linkBudget,
} from './comms.js';

export const DEFAULT_CONFIG = {
  mastHeightM: 2,
  power: DEFAULT_POWER_CONFIG,
  comms: DEFAULT_COMMS_CONFIG,
};

export const POLE_LIMIT_DEG = 89.9999;

/** Resolve terrain and horizon once per site so time scans stay cheap. */
export function prepareSite(site, terrainOrConfig, maybeConfig) {
  let terrain = null;
  let config = DEFAULT_CONFIG;
  if (terrainOrConfig && (typeof terrainOrConfig.sampleHeight === 'function' || typeof terrainOrConfig.heightAt === 'function' || terrainOrConfig.grids)) {
    terrain = terrainOrConfig;
    config = maybeConfig || DEFAULT_CONFIG;
  } else if (terrainOrConfig && (terrainOrConfig.mastHeightM !== undefined || terrainOrConfig.power || terrainOrConfig.comms)) {
    config = terrainOrConfig;
    terrain = maybeConfig || null;
  } else if (maybeConfig) {
    config = maybeConfig;
  }

  // At exactly ±90° azimuth and longitude are undefined; 1e-4° (about 3 m) away they are not.
  const lat = Math.max(-POLE_LIMIT_DEG, Math.min(POLE_LIMIT_DEG, site.lat));
  const mastHeight = config.mastHeightM ?? DEFAULT_CONFIG.mastHeightM;
  let horizon;
  if (terrain && typeof terrain.heightAt === 'function') {
    horizon = computeHorizon(terrain, lat, site.lon, { mastHeight });
  } else {
    horizon = computeSiteHorizon({ ...site, lat }, mastHeight);
  }
  return {
    ...site,
    lat,
    groundHeight: horizon.groundHeight,
    height: horizon.groundHeight + mastHeight,
    basis: enuBasis(lat, site.lon),
    horizon,
  };
}

/** Convenience wrapper: scan a standard multi-day window with adaptive time step. */
export function scanWindow(ctx, startMs, days, config = DEFAULT_CONFIG) {
  const stepMin = days <= 15 ? 20 : days <= 30 ? 30 : days <= 90 ? 90 : 240;
  const stepMs = stepMin * 60000;
  const endMs = startMs + days * 86400000;
  return scan(ctx, { startMs, endMs, stepMs }, config, { withDsn: true });
}

/** Everything about one site at one instant. */
export function evaluate(ms, ctx, config = DEFAULT_CONFIG, { withDsn = true } = {}) {
  const state = moonFixedState(ms);
  const topo = topocentric(state, ctx);
  const sunHorizon = horizonAt(ctx.horizon, topo.sun.az);
  const power = solarPower(
    { sunElDeg: topo.sun.el, sunAzDeg: topo.sun.az, horizonElDeg: sunHorizon, sunDistM: topo.sun.distM },
    config.power,
  );
  const earthHorizon = horizonAt(ctx.horizon, topo.earth.az);
  const clearance = topo.earth.el - earthHorizon;
  const earthRadius = earthAngularRadiusDeg(topo.earth.distM);
  // Two definitions, used for different questions:
  //  visible: any part of Earth's disk above the terrain (NASA PGDA's definition,
  //           used for "Earth visible" statistics);
  //  los:     Earth's centre above the terrain, required for a direct link.
  const visible = clearance > -earthRadius;
  const los = clearance > 0;
  const link = linkBudget(topo.earth.distM, clearance, config.comms);
  const dsn = withDsn ? dsnVisibility(ms, config.comms.dsnMinElDeg) : null;
  const dsnAny = dsn ? dsn.some((d) => d.visible) : true;

  let commsStatus = 'go';
  const commsReasons = [];
  if (!los) {
    commsStatus = 'no-go';
    commsReasons.push(clearance < -earthRadius ? 'Earth is below the local horizon' : 'Earth is partly hidden by terrain');
  } else {
    if (clearance < config.comms.minClearanceDeg) {
      commsStatus = 'marginal';
      commsReasons.push(`Earth only ${clearance.toFixed(1)}° above terrain (want ≥ ${config.comms.minClearanceDeg}°)`);
    }
    if (!dsnAny) {
      commsStatus = 'no-go';
      commsReasons.push(`No DSN complex has the Moon above ${config.comms.dsnMinElDeg}°`);
    }
    if (link.margin < 0) {
      commsStatus = 'no-go';
      commsReasons.push(`Link does not close at ${(config.comms.dataRateBps / 1000).toFixed(0)} kbps`);
    } else if (link.margin < config.comms.targetMarginDb && commsStatus === 'go') {
      commsStatus = 'marginal';
      commsReasons.push(`Link margin ${link.margin.toFixed(1)} dB (< ${config.comms.targetMarginDb} dB)`);
    }
  }
  const powerStatus = power.watts >= config.power.loadW ? 'go' : power.watts > 0 ? 'marginal' : 'no-go';

  return {
    ms,
    state,
    sun: { ...topo.sun, horizon: sunHorizon, clearance: topo.sun.el - sunHorizon, ...power },
    earth: {
      ...topo.earth,
      horizon: earthHorizon,
      clearance,
      radiusDeg: earthRadius,
      visible,
      los,
      lightTimeS: lightTimeS(topo.earth.distM),
    },
    link,
    dsn,
    dsnAny,
    // Three different questions, kept apart (see linkBudget):
    //  lineOfSight:  Earth's centre is above the local terrain (geometry only);
    //  stationSees:  a DSN complex has the Moon above its elevation mask (geometry only,
    //                not a booking: DSN time is scheduled separately and is not modelled);
    //  linkCloses:   the link budget closes at the chosen data rate under the stated
    //                assumptions (a paper calculation, not a guarantee).
    comms: {
      lineOfSight: los,
      stationSees: withDsn ? dsnAny : null,
      linkCloses: los && link.margin >= 0,
      scheduled: null,
    },
    commsStatus,
    commsReasons,
    powerStatus,
  };
}

/** Intervals where `flags` is set; each sample lasts until the next one (dtMs[i]). */
function runs(times, flags, dtMs) {
  const out = [];
  let start = null;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && start === null) start = times[i];
    if (!flags[i] && start !== null) {
      out.push([start, times[i]]);
      start = null;
    }
  }
  if (start !== null) out.push([start, times[times.length - 1] + dtMs[times.length - 1]]);
  return out;
}

/** Longest stretch (hours) with `flags` unset, and whether it touches the window edge. */
function longestGap(times, flags, dtMs) {
  let best = 0;
  let run = 0;
  let touchesEdge = false;
  let bestTouchesEdge = false;
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) {
      if (run === 0) touchesEdge = i === 0;
      run += dtMs[i];
      const edge = touchesEdge || i === flags.length - 1;
      if (run > best) {
        best = run;
        bestTouchesEdge = edge;
      }
    } else run = 0;
  }
  return { hours: best / 3600000, openEnded: bestTouchesEdge };
}

/**
 * Sample a site across [startMs, endMs). Returns typed-array series for charts,
 * operational intervals and summary statistics.
 */
export function scan(ctx, { startMs, endMs, stepMs = 20 * 60000 }, config = DEFAULT_CONFIG, { withDsn = true } = {}) {
  const spanMs = endMs - startMs;
  if (!(spanMs > 0) || !(stepMs > 0)) throw new RangeError('scan: endMs must be after startMs and stepMs > 0');
  // Samples at startMs + i * stepMs; each stands for the time until the next sample,
  // and the last one only until endMs (a window that is not a whole number of steps
  // is not rounded up). Windows shorter than two steps use two equal halves.
  if (spanMs < 2 * stepMs) stepMs = spanMs / 2;
  const n = Math.ceil(spanMs / stepMs - 1e-9);
  const dtMs = new Float64Array(n);
  for (let i = 0; i < n; i++) dtMs[i] = Math.min(stepMs, endMs - (startMs + i * stepMs));
  const dtH = Float64Array.from(dtMs, (d) => d / 3600000);
  const times = new Float64Array(n);
  const sunEl = new Float32Array(n);
  const sunAz = new Float32Array(n);
  const sunHorizon = new Float32Array(n);
  const sunFrac = new Float32Array(n);
  const watts = new Float32Array(n);
  const earthEl = new Float32Array(n);
  const earthAz = new Float32Array(n);
  const earthClear = new Float32Array(n);
  const margin = new Float32Array(n);
  const lit = new Uint8Array(n);
  const los = new Uint8Array(n);
  const visible = new Uint8Array(n);
  const dsnAny = new Uint8Array(n);
  const dte = new Uint8Array(n);
  let energyWh = 0;
  let cumulative = 0;
  let peak = 0;
  let maxDrawdownWh = 0;
  for (let i = 0; i < n; i++) {
    const ms = startMs + i * stepMs;
    const r = evaluate(ms, ctx, config, { withDsn });
    times[i] = ms;
    sunEl[i] = r.sun.el;
    sunAz[i] = r.sun.az;
    sunHorizon[i] = r.sun.horizon;
    sunFrac[i] = r.sun.fraction;
    watts[i] = r.sun.watts;
    earthEl[i] = r.earth.el;
    earthAz[i] = r.earth.az;
    earthClear[i] = r.earth.clearance;
    margin[i] = r.earth.los ? r.link.margin : -99;
    lit[i] = r.sun.fraction > 0 ? 1 : 0;
    los[i] = r.earth.los ? 1 : 0;
    visible[i] = r.earth.visible ? 1 : 0;
    dsnAny[i] = r.dsnAny ? 1 : 0;
    dte[i] = r.earth.los && r.dsnAny && r.link.margin >= 0 ? 1 : 0;
    energyWh += r.sun.watts * dtH[i];
    // Battery sizing: deepest cumulative energy deficit against the load.
    cumulative += (r.sun.watts - config.power.loadW) * dtH[i];
    if (cumulative > peak) peak = cumulative;
    maxDrawdownWh = Math.max(maxDrawdownWh, peak - cumulative);
  }
  // Shares of the window: each sample weighted by the time it stands for.
  const mean = (arr) => { let a = 0; for (let i = 0; i < n; i++) a += arr[i] * dtMs[i]; return a / spanMs; };
  const pc = { ...DEFAULT_POWER_CONFIG, ...config.power };
  const battery = simulateBattery(watts, dtH, { loadW: pc.loadW, chargeEff: pc.chargeEff, dischargeEff: pc.dischargeEff });
  // A battery of a chosen size: state of charge, time below reserve, time empty.
  const sim = pc.batteryWh > 0
    ? (({ socWh, ...rest }) => rest)(simulateBattery(watts, dtH, { loadW: pc.loadW, capacityWh: pc.batteryWh, reserveFrac: pc.reserveFrac, chargeEff: pc.chargeEff, dischargeEff: pc.dischargeEff }))
    : null;
  const dark = longestGap(times, lit, dtMs);
  const blackout = longestGap(times, dte, dtMs);
  const hidden = longestGap(times, los, dtMs);
  const stats = {
    days: (endMs - startMs) / 86400000,
    litFraction: mean(lit),
    fullSunFraction: mean(Array.from(sunFrac, (f) => (f >= 0.99 ? 1 : 0))),
    avgPowerW: energyWh / (spanMs / 3600000),
    // Hours covered by the samples: always exactly the window (checked in tests).
    integratedHours: dtH.reduce((a, b) => a + b, 0),
    energyKWh: energyWh / 1000,
    maxSunEl: Math.max(...sunEl),
    minSunEl: Math.min(...sunEl),
    longestDarkH: dark.hours,
    longestDarkOpenEnded: dark.openEnded,
    // Battery to carry the load through the worst stretch, counting charge and
    // discharge losses (config.power.chargeEff / dischargeEff). An energy estimate,
    // not a battery design. batteryKWhNoLosses is the bare energy deficit.
    batteryKWh: battery.neededWh / 1000,
    batteryKWhNoLosses: maxDrawdownWh / 1000,
    batterySim: sim,
    // The deficit is cut off by the window edge: the true battery need may be larger.
    batteryOpenEnded: maxDrawdownWh > 0 && (watts[0] < config.power.loadW || watts[n - 1] < config.power.loadW),
    earthVisibleFraction: mean(visible),
    earthCentreFraction: mean(los),
    dsnFraction: mean(dsnAny),
    dteFraction: mean(dte),
    longestEarthHiddenH: hidden.hours,
    longestBlackoutH: blackout.hours,
    longestBlackoutOpenEnded: blackout.openEnded,
    minEarthEl: Math.min(...earthEl),
    maxEarthEl: Math.max(...earthEl),
  };
  return {
    startMs,
    endMs,
    stepMs,
    series: { times, dtH, sunEl, sunAz, sunHorizon, sunFrac, watts, earthEl, earthAz, earthClear, margin, lit, los, visible, dsnAny, dte },
    intervals: { lit: runs(times, lit, dtMs), los: runs(times, los, dtMs), dte: runs(times, dte, dtMs) },
    stats,
  };
}

/**
 * Next time `predicate(evaluation)` changes value after `ms`, refined by
 * bisection to ~30 s. Returns { ms, from, to } or null within `maxDays`.
 */
export function nextTransition(ctx, ms, predicate, config = DEFAULT_CONFIG, { maxDays = 40, stepMin = 15 } = {}) {
  const test = (t) => predicate(evaluate(t, ctx, config, { withDsn: false }));
  const from = test(ms);
  const step = stepMin * 60000;
  const limit = ms + maxDays * 86400000;
  let a = ms;
  for (let t = ms + step; t <= limit; t += step) {
    if (test(t) !== from) {
      let lo = a;
      let hi = t;
      while (hi - lo > 30000) {
        const mid = Math.round((lo + hi) / 2);
        if (test(mid) === from) lo = mid;
        else hi = mid;
      }
      return { ms: hi, from, to: !from };
    }
    a = t;
  }
  return null;
}

/**
 * Screening for one moment, with the same rule as the Check step at touchdown:
 * NO GO when there is no solar power or Earth is hidden by terrain; GO when power and
 * the radio link are both fine; otherwise GO WITH CARE (partial Sun, Earth low, a
 * thin link margin, or no Deep Space Network antenna in view right now).
 * @returns {'green'|'amber'|'red'}
 */
export function screenNow(e) {
  if (!(e.sun.fraction > 0) || !e.earth.los) return 'red'; // as isSunUp / isEarthUp and the scan's lit / los
  if (e.powerStatus === 'go' && e.commsStatus === 'go') return 'green';
  return 'amber';
}

export const isSunUp = (e) => e.sun.fraction > 0;
export const isEarthUp = (e) => e.earth.los;
