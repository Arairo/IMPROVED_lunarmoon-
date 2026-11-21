// Power, battery, radio and flight-model checks: units, limits, and that each
// result says what kind of answer it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import sites from '../src/data/sites.js';
import { simulateBattery, solarPower, DEFAULT_POWER_CONFIG } from '../src/core/power.js';
import { freeSpaceLossDb, linkBudget, linkAssumptions, DEFAULT_COMMS_CONFIG, RADIO_PRESETS } from '../src/core/comms.js';
import { prepareSite, evaluate, scan, DEFAULT_CONFIG } from '../src/core/analysis.js';
import { planFlight, descentBudget, DESCENT_LOSS_FACTOR } from '../src/core/flight.js';
import { AU_M } from '../src/core/geo.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (±${tol})`);

// ---- Battery ---------------------------------------------------------------
test('Battery: no load, no draw; a steady shortfall drains exactly (load - P) / efficiency', () => {
  const zero = simulateBattery(new Float32Array(10).fill(0), 1, { loadW: 0 });
  assert.equal(zero.neededWh, 0);
  // 10 h at 0 W against a 100 W load: 1,000 Wh delivered, 1,000/0.9 drawn from the cells.
  const need = simulateBattery(new Float32Array(10).fill(0), 1, { loadW: 100, dischargeEff: 0.9 });
  close(need.neededWh, 1000 / 0.9, 1e-6, 'needed');
  const lossless = simulateBattery(new Float32Array(10).fill(0), 1, { loadW: 100, chargeEff: 1, dischargeEff: 1 });
  close(lossless.neededWh, 1000, 1e-9);
});

test('Battery: state of charge stays within 0..capacity; reserve, empty time and unmet load are counted', () => {
  // 5 h of sun (300 W) then 10 h dark, 100 W load, 1 kWh battery starting half full.
  const w = Float32Array.from({ length: 15 }, (_, i) => (i < 5 ? 300 : 0));
  const r = simulateBattery(w, 1, { loadW: 100, capacityWh: 1000, initialFrac: 0.5, reserveFrac: 0.2, chargeEff: 0.95, dischargeEff: 0.95 });
  for (const v of r.socWh) assert.ok(v >= -1e-9 && v <= 1000 + 1e-9, `soc ${v}`);
  close(r.socWh[4], 1000, 1e-6, 'fills up and stops at capacity');
  assert.ok(r.spilledWh > 0, 'surplus beyond capacity is counted as spilled');
  // 1,000 Wh lasts 1000 * 0.95 / 100 = 9.5 h of the 10 h night.
  assert.ok(r.hoursEmpty >= 0.5 && r.hoursEmpty <= 1.5, `empty for ${r.hoursEmpty} h`);
  close(r.unmetWh, 50, 1e-6, 'last half hour of load not met');
  assert.ok(r.hoursBelowReserve > r.hoursEmpty);
  assert.equal(r.minSocFrac, 0);
});

test('Battery: charge and discharge power limits are respected; bad inputs are refused', () => {
  const r = simulateBattery(Float32Array.of(1100, 1100), 1, { loadW: 100, capacityWh: 10000, initialFrac: 0, chargeEff: 1, maxChargeW: 200 });
  close(r.socWh[1], 400, 1e-9, '200 W charge limit for 2 h');
  const d = simulateBattery(Float32Array.of(0), 1, { loadW: 500, capacityWh: 10000, dischargeEff: 1, maxDischargeW: 300 });
  close(d.unmetWh, 200, 1e-9, 'discharge limit leaves 200 W unmet');
  assert.throws(() => simulateBattery([0], 0, { loadW: 1 }), RangeError);
  assert.throws(() => simulateBattery([0], 1, { loadW: 1, chargeEff: 1.2 }), RangeError);
  assert.throws(() => simulateBattery([0], 1, { loadW: NaN }), RangeError);
});

test('Power: zero sunlight gives 0 W; full Sun at 1 AU gives area x efficiency x 1361 W/m²', () => {
  const cfg = { ...DEFAULT_POWER_CONFIG, mode: 'two_axis' };
  const dark = solarPower({ sunElDeg: -5, sunAzDeg: 0, horizonElDeg: 0, sunDistM: AU_M }, cfg);
  assert.equal(dark.watts, 0);
  const full = solarPower({ sunElDeg: 30, sunAzDeg: 0, horizonElDeg: 0, sunDistM: AU_M }, cfg);
  close(full.watts, 1361 * cfg.areaM2 * cfg.efficiency, 1e-6);
  // Sun centre exactly on the skyline: half the disk is up.
  const half = solarPower({ sunElDeg: 2, sunAzDeg: 0, horizonElDeg: 2, sunDistM: AU_M }, cfg);
  close(half.fraction, 0.5, 1e-9);
});

test('Energy and battery converge with the time step (rectangle sums, 30-day window)', () => {
  const ctx = prepareSite(sites.find((s) => s.id === 'a11'), null, DEFAULT_CONFIG);
  const start = Date.UTC(2026, 10, 16, 22), end = start + 30 * 86400000;
  const at = (min) => scan(ctx, { startMs: start, endMs: end, stepMs: min * 60000 }, DEFAULT_CONFIG, { withDsn: false }).stats;
  const fine = at(5), coarse = at(240), used = at(30);
  assert.ok(Math.abs(coarse.energyKWh / fine.energyKWh - 1) < 0.005, 'energy within 0.5% at 4 h steps');
  assert.ok(Math.abs(used.energyKWh / fine.energyKWh - 1) < 0.001, 'energy within 0.1% at 30 min steps');
  assert.ok(Math.abs(coarse.batteryKWh / fine.batteryKWh - 1) < 0.01, 'battery within 1% at 4 h steps');
  // Losses make the battery bigger than the bare energy deficit, never smaller.
  assert.ok(fine.batteryKWh > fine.batteryKWhNoLosses);
  close(fine.batteryKWh / fine.batteryKWhNoLosses, 1 / 0.95, 0.002, 'night-dominated: about 1/dischargeEff');
});

// ---- Radio -----------------------------------------------------------------
test('Link budget: free-space loss and Eb/N0 arithmetic', () => {
  // 384,400 km at 2.25 GHz: 20 log10(4 pi d f / c) = 211.19 dB.
  close(freeSpaceLossDb(384400e3, 2.25e9), 211.19, 0.02, 'FSPL');
  const lb = linkBudget(384400e3, 10, DEFAULT_COMMS_CONFIG);
  close(lb.ebn0, lb.cn0 - 10 * Math.log10(DEFAULT_COMMS_CONFIG.dataRateBps), 1e-9, 'Eb/N0 = C/N0 - 10 log R');
  close(lb.margin, lb.ebn0 - DEFAULT_COMMS_CONFIG.requiredEbN0Db, 1e-9, 'margin');
  close(lb.eirpDbw, 10 * Math.log10(RADIO_PRESETS.s_mga.txPowerW) + RADIO_PRESETS.s_mga.txGainDbi, 1e-9, 'EIRP');
  assert.equal(lb.grazing, 0);
  // Doubling the distance costs 6.02 dB.
  close(linkBudget(768800e3, 10).cn0, lb.cn0 - 20 * Math.log10(2), 1e-9);
  assert.ok(linkBudget(384400e3, 0).grazing > 5.9, 'grazing path adds ~6 dB');
});

test('Radio: messages use the configured DSN mask; line of sight, station geometry and link closure are separate', () => {
  const ctx = prepareSite(sites.find((s) => s.id === 'a11'), null, DEFAULT_CONFIG);
  const cfg = { ...DEFAULT_CONFIG, comms: { ...DEFAULT_COMMS_CONFIG, dsnMinElDeg: 89 } };
  // Find a time with Earth up (always, at Apollo 11) and no complex seeing the Moon above 89°.
  const r = evaluate(Date.UTC(2027, 0, 1), ctx, cfg);
  assert.equal(r.comms.lineOfSight, true);
  assert.equal(r.comms.stationSees, false);
  assert.ok(r.commsReasons.some((x) => x.includes('above 89°')), r.commsReasons.join(' | '));
  assert.ok(!r.commsReasons.some((x) => x.includes('10°')));
  assert.equal(r.comms.scheduled, null, 'DSN scheduling is not modelled');
  // Far side: no line of sight, so no link closes whatever the budget says.
  const far = evaluate(Date.UTC(2027, 0, 1), prepareSite(sites.find((s) => s.id === 'ce4'), null, DEFAULT_CONFIG), DEFAULT_CONFIG);
  assert.equal(far.comms.lineOfSight, false);
  assert.equal(far.comms.linkCloses, false);
  const a = linkAssumptions(DEFAULT_COMMS_CONFIG);
  assert.equal(a.dsnElevationMaskDeg, DEFAULT_COMMS_CONFIG.dsnMinElDeg);
  assert.ok(a.notModelled.some((x) => /scheduling/.test(x)));
  assert.match(a.kind, /theoretical/);
});

// ---- Flight ----------------------------------------------------------------
test('Flight: every burn says how it was obtained; the plan says what kind of model it is', () => {
  for (const route of ['direct', 'phasing', 'lowenergy']) {
    const p = planFlight(Date.UTC(2027, 3, 1), { route });
    for (const b of p.burns) assert.ok(['computed', 'assumed', 'rule of thumb'].includes(b.basis), `${route} ${b.id}: ${b.basis}`);
    assert.equal(p.burns.find((b) => b.id === 'pdi').basis, 'rule of thumb');
    assert.match(p.model.status, /preliminary/);
    assert.match(p.model.status, /not an optimised trajectory/);
    if (route === 'lowenergy') assert.equal(p.burns.find((b) => b.id === 'loi').basis, 'assumed');
  }
  // The descent rule of thumb: perilune speed x 1.12 + 0.1 km/s (see descentBudget).
  const d = descentBudget();
  assert.equal(DESCENT_LOSS_FACTOR, 1.12);
  assert.ok(d.powered > 1.9 && d.powered < 2.1, `descent ${d.powered.toFixed(2)} km/s (Apollo 11 flew ~2.06)`);
});
