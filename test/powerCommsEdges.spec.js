// Edge cases for the power and radio models (second audit 6.4 and 6.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateBattery, POWER_SCENARIOS, matchScenario, DEFAULT_POWER_CONFIG } from '../src/core/power.js';
import { grazingLossDb, dsnVisibility, DEFAULT_COMMS_CONFIG } from '../src/core/comms.js';
import { evaluate, prepareSite, scanWindow, DEFAULT_CONFIG } from '../src/core/analysis.js';
import sitesData from '../src/data/sites.json' with { type: 'json' };

const ridge = sitesData.find((s) => s.id === 'ridge');
const T = Date.UTC(2027, 5, 15, 12);

test('Battery energy is conserved: with 100% efficiency, surplus - deficit = change in charge + spilled - unmet', () => {
  const watts = Float64Array.from({ length: 200 }, (_, i) => 300 * Math.max(0, Math.sin(i / 9)));
  const dt = Float64Array.from({ length: 200 }, (_, i) => 0.5 + (i % 3) * 0.25); // uneven steps
  const cap = 900, start = 0.6;
  const r = simulateBattery(watts, dt, { loadW: 120, capacityWh: cap, initialFrac: start, chargeEff: 1, dischargeEff: 1 });
  let net = 0;
  for (let i = 0; i < watts.length; i++) net += (watts[i] - 120) * dt[i];
  const dSoc = r.socWh[r.socWh.length - 1] - cap * start;
  assert.ok(Math.abs(net - (dSoc + r.spilledWh - r.unmetWh)) < 1e-6 * Math.max(1, Math.abs(net)), `${net} vs ${dSoc + r.spilledWh - r.unmetWh}`);
  assert.ok(r.unmetWh > 0 && r.spilledWh > 0, 'test exercises both a full and an empty battery');
});

test('Battery with losses never stores more than it is given and never goes outside 0..capacity', () => {
  const watts = Float64Array.from({ length: 300 }, (_, i) => (i % 40 < 22 ? 400 : 0));
  const r = simulateBattery(watts, 1, { loadW: 150, capacityWh: 2000, initialFrac: 0.5, chargeEff: 0.9, dischargeEff: 0.9, maxChargeW: 200, maxDischargeW: 140 });
  let prev = 1000;
  for (let i = 0; i < watts.length; i++) {
    const s = r.socWh[i];
    assert.ok(s >= -1e-3 && s <= 2000 + 1e-3, `soc ${s}`); // socWh is stored as float32
    const surplus = Math.max(0, watts[i] - 150);
    assert.ok(s - prev <= Math.min(surplus, 200) * 0.9 + 1e-3, `step ${i}: stored more than allowed`);
    assert.ok(prev - s <= (140 / 0.9) + 1e-3, `step ${i}: drew past the discharge limit`);
    prev = s;
  }
  assert.ok(r.unmetWh > 0, 'a 140 W discharge limit under a 150 W load leaves some load unmet');
});

test('Example scenarios: labelled illustrative values; Conservative and Degraded never look better than Nominal', () => {
  assert.equal(matchScenario(DEFAULT_POWER_CONFIG), 'nominal');
  assert.equal(matchScenario({ ...DEFAULT_POWER_CONFIG, loadW: 133 }), 'custom');
  const stats = (id) => {
    const config = { ...DEFAULT_CONFIG, power: { ...DEFAULT_POWER_CONFIG, ...POWER_SCENARIOS[id] } };
    return scanWindow(prepareSite(ridge, config), T, 30, config).stats;
  };
  const nom = stats('nominal'), con = stats('conservative'), deg = stats('degraded');
  for (const s of [con, deg]) {
    assert.ok(s.avgPowerW <= nom.avgPowerW + 1e-9, 'power not higher');
    assert.ok(s.batteryKWh >= nom.batteryKWh - 1e-9, 'battery not smaller');
  }
  assert.equal(con.litFraction, nom.litFraction, 'sunlight itself does not depend on the spacecraft');
  for (const s of Object.values(POWER_SCENARIOS)) assert.ok(s.label && s.note, 'every scenario explains itself');
});

test('Radio: grazing loss is 0 at or above the clearance, at most 6 dB below, and has no division by zero at 0°', () => {
  assert.equal(grazingLossDb(2, 2), 0);
  assert.equal(grazingLossDb(5, 2), 0);
  assert.ok(Math.abs(grazingLossDb(1, 2) - 3) < 1e-12);
  assert.equal(grazingLossDb(-1, 2), 6);
  assert.equal(grazingLossDb(0, 0), 0);
  assert.equal(grazingLossDb(-0.1, 0), 6);
  for (let c = -3; c <= 3; c += 0.25) assert.ok(Number.isFinite(grazingLossDb(c, 0)) && Number.isFinite(grazingLossDb(c, 2)));
});

test('Radio: a DSN station exactly at its elevation mask counts as seeing the Moon; just below does not', () => {
  const els = dsnVisibility(T, -90).map((d) => d.el);
  const k = 0;
  assert.equal(dsnVisibility(T, els[k])[k].visible, true);
  assert.equal(dsnVisibility(T, els[k] + 1e-6)[k].visible, false);
});

test('Earth grazing the skyline: partly visible is not line of sight; there is never an invented schedule', () => {
  const ctx = prepareSite(ridge, DEFAULT_CONFIG);
  const ev = evaluate(T, ctx, DEFAULT_CONFIG);
  const r = ev.earth.radiusDeg;
  const flat = (el) => ({ ...ctx, horizon: { ...ctx.horizon, el180: new Float32Array(180).fill(el), elevations: null } });
  const half = evaluate(T, flat(ev.earth.el + 0.5 * r), DEFAULT_CONFIG);
  assert.equal(half.earth.visible, true, 'half the disk above the terrain');
  assert.equal(half.earth.los, false, 'centre below the terrain: no line of sight');
  assert.equal(half.comms.lineOfSight, false);
  assert.match(half.commsReasons.join(" "), /partly hidden/i);
  const below = evaluate(T, flat(ev.earth.el + 1.5 * r), DEFAULT_CONFIG);
  assert.equal(below.earth.visible, false);
  for (const e of [ev, half, below]) assert.equal(e.comms.scheduled, null, 'no DSN schedule is modelled');
});
