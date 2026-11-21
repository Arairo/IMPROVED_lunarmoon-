// Solar power model for a lander at a lunar site.
//
// Irradiance above the atmosphere-free surface is the solar constant scaled by
// the Sun's actual distance. At the poles the Sun skims the horizon, so the
// fraction of the solar disk that clears the local terrain matters as much as
// elevation: a ridge 0.2 deg high can cut power in half.

import { AU_M, DEG, RAD, clamp } from './geo.js';

export const SOLAR_CONSTANT_W_M2 = 1361; // TSI at 1 AU (Kopp & Lean 2011)
const SUN_RADIUS_M = 695700e3;

export const PANEL_MODES = {
  vertical_tracking: {
    label: 'Vertical, azimuth-tracking',
    hint: 'Mast-mounted array that turns to face the Sun. Standard choice at the poles, where the Sun stays low.',
  },
  horizontal: {
    label: 'Horizontal (top deck)',
    hint: 'Flat on the lander deck. Fine near the equator, nearly useless at the poles.',
  },
  fixed_vertical: {
    label: 'Vertical, fixed facing',
    hint: 'Body-mounted side panel that faces one azimuth.',
  },
  two_axis: {
    label: 'Two-axis tracking',
    hint: 'Always normal to the Sun (upper bound).',
  },
};

// Example lander, not a specific spacecraft. Every value is an assumption the user
// can change in the spacecraft settings, and every report includes them.
export const DEFAULT_POWER_CONFIG = {
  mode: 'vertical_tracking',
  areaM2: 2.0,
  efficiency: 0.29, // triple-junction GaAs cells at beginning of life (~28-30%); no temperature or ageing loss
  fixedAzDeg: 0,
  loadW: 120, // continuous survival + ops load used to size the battery (one load for every mission phase)
  // Battery: energy in and out each lose this share (typical lithium-ion, ~90% round trip).
  chargeEff: 0.95,
  dischargeEff: 0.95,
  // Optional: a battery of this usable size (Wh) is simulated (state of charge, empty spells).
  batteryWh: null,
  reserveFrac: 0.2, // keep this share of the battery in reserve when simulating one
};

/**
 * Battery state of charge through a power series (W at a fixed step).
 * Charging stores (P - load) x chargeEff; discharging draws (load - P) / dischargeEff.
 * Capacity, charge/discharge power limits and a reserve are respected: the battery
 * never goes below 0 or above its capacity. With capacityWh = Infinity it returns
 * the battery size that would be needed (deepest drawdown, starting full).
 * A planning estimate, not a battery design: no temperature, ageing or voltage limits.
 */
export function simulateBattery(watts, stepH, { loadW, capacityWh = Infinity, initialFrac = 1, reserveFrac = 0, chargeEff = 0.95, dischargeEff = 0.95, maxChargeW = Infinity, maxDischargeW = Infinity }) {
  if (!(stepH > 0) || !(loadW >= 0)) throw new RangeError('simulateBattery: stepH must be > 0 and loadW >= 0');
  if (!(chargeEff > 0 && chargeEff <= 1 && dischargeEff > 0 && dischargeEff <= 1)) throw new RangeError('simulateBattery: efficiencies must be in (0, 1]');
  const finite = Number.isFinite(capacityWh);
  let soc = finite ? capacityWh * initialFrac : 0; // infinite: track drawdown from a running peak
  let peak = soc, needWh = 0, minSoc = soc, unmetWh = 0, spilledWh = 0, belowReserveH = 0, emptyH = 0;
  const socWh = new Float32Array(watts.length);
  const reserveWh = finite ? capacityWh * reserveFrac : 0;
  for (let i = 0; i < watts.length; i++) {
    const net = watts[i] - loadW;
    if (net >= 0) {
      const inW = Math.min(net, maxChargeW) * chargeEff;
      const room = finite ? capacityWh - soc : Infinity;
      const stored = Math.min(inW * stepH, room);
      soc += stored;
      spilledWh += net * stepH - stored / chargeEff;
    } else {
      const wantW = -net;
      const fromBattW = Math.min(wantW, maxDischargeW);
      const drawWh = (fromBattW / dischargeEff) * stepH;
      const avail = finite ? soc : Infinity;
      const drawn = Math.min(drawWh, avail);
      soc -= drawn;
      unmetWh += (wantW - fromBattW) * stepH + (drawWh - drawn) * dischargeEff;
    }
    if (!finite) { if (soc > peak) peak = soc; needWh = Math.max(needWh, peak - soc); }
    else { if (soc < reserveWh - 1e-9) belowReserveH += stepH; if (soc <= 1e-9) emptyH += stepH; }
    minSoc = Math.min(minSoc, soc);
    socWh[i] = soc;
  }
  return finite
    ? { capacityWh, socWh, minSocFrac: minSoc / capacityWh, unmetWh, spilledWh, hoursBelowReserve: belowReserveH, hoursEmpty: emptyH }
    : { neededWh: needWh, spilledWh: 0 };
}

export function sunAngularRadiusDeg(distM) {
  return Math.asin(SUN_RADIUS_M / distM) * RAD;
}

/**
 * Fraction (0..1) of a disk of angular radius `radiusDeg`, centred `centerElDeg`,
 * that lies above a locally flat horizon at `horizonElDeg` (circular segment).
 */
export function visibleDiskFraction(centerElDeg, horizonElDeg, radiusDeg) {
  const u = clamp((centerElDeg - horizonElDeg) / radiusDeg, -1, 1);
  if (u >= 1) return 1;
  if (u <= -1) return 0;
  return 1 - (Math.acos(u) - u * Math.sqrt(1 - u * u)) / Math.PI;
}

/** Cosine of the angle between the panel normal and the Sun. */
export function incidenceCos(mode, sunElDeg, sunAzDeg, fixedAzDeg = 0) {
  const el = sunElDeg * DEG;
  switch (mode) {
    case 'horizontal':
      return Math.max(0, Math.sin(el));
    case 'fixed_vertical':
      return Math.max(0, Math.cos(el) * Math.cos((sunAzDeg - fixedAzDeg) * DEG));
    case 'two_axis':
      return 1;
    case 'vertical_tracking':
    default:
      return Math.max(0, Math.cos(el));
  }
}

/** Instantaneous array output. */
export function solarPower({ sunElDeg, sunAzDeg, horizonElDeg, sunDistM }, config = DEFAULT_POWER_CONFIG) {
  const radius = sunAngularRadiusDeg(sunDistM);
  const fraction = visibleDiskFraction(sunElDeg, horizonElDeg, radius);
  const irradiance = SOLAR_CONSTANT_W_M2 * (AU_M / sunDistM) ** 2;
  const cosInc = incidenceCos(config.mode, sunElDeg, sunAzDeg, config.fixedAzDeg);
  const watts = irradiance * fraction * cosInc * config.areaM2 * config.efficiency;
  return { watts, fraction, irradiance, cosInc, sunRadiusDeg: radius };
}
