import test from 'node:test';
import assert from 'node:assert/strict';
import { planFlight, compareRoutes, timeToRadius, moonState, siteDirection, flightPath, touchdownChecks, FLOWN_FLIGHTS, MU_E, R_E } from '../src/core/flight.js';
import { prepareSite, evaluate, DEFAULT_CONFIG } from '../src/core/analysis.js';

const H = 3600000, D = 86400000;

test('flight: Apollo 11 burns match the mission (TLI, lunar orbit insertion, descent)', () => {
  const T = Date.parse('1969-07-20T20:17Z'), loi = Date.parse('1969-07-19T17:22Z'), tli = Date.parse('1969-07-16T16:22Z');
  const p = planFlight(T, { route: 'direct', coastDays: (loi - tli) / D, lunarOrbitDays: (T - loi) / D, parkingAltKm: 191, alignLaunch: false });
  const dv = Object.fromEntries(p.burns.map((b) => [b.id, b.dv]));
  assert.ok(Math.abs(dv.tli - 3.18) < 0.1, `TLI ${dv.tli.toFixed(3)} km/s vs 3.18`);
  assert.ok(Math.abs(dv.loi - 0.94) < 0.1, `LOI ${dv.loi.toFixed(3)} km/s vs 0.94`);
  assert.ok(Math.abs(dv.doi + dv.pdi - 2.06) < 0.15, `descent ${(dv.doi + dv.pdi).toFixed(3)} km/s vs 2.06`);
  assert.ok(Math.abs(p.tliMs - tli) < 60000, 'TLI time back-solved from the coast');
});

test('flight: Apollo 11’s TLI speed reaches the Moon’s distance in about the flown 73 hours', () => {
  const rp = R_E + 191, v = Math.sqrt(MU_E / rp) + 3.18;
  const a = 1 / (2 / rp - (v * v) / MU_E), ra = 2 * a - rp;
  const rM = Math.hypot(...moonState(Date.parse('1969-07-19T17:22Z')).r);
  const hours = timeToRadius(rp, ra, rM) / 3600;
  assert.ok(Math.abs(hours - 73) < 12, `${hours.toFixed(1)} h (patched conics ignore the Moon's pull on the way in)`);
});

test('flight: each route’s default timeline is close to the missions that flew it', () => {
  for (const f of FLOWN_FLIGHTS) {
    const T = Date.parse(f.touchdown);
    const p = planFlight(T, { route: f.route });
    const flown = (T - Date.parse(f.launch)) / D;
    const ratio = p.doorToDoorDays / flown;
    assert.ok(ratio > 0.55 && ratio < 1.6, `${f.name}: model ${p.doorToDoorDays.toFixed(1)} d vs flown ${flown.toFixed(1)} d`);
  }
});

test('flight: events run in order and slower routes brake less at the Moon', () => {
  const T = Date.UTC(2027, 2, 10, 12);
  const plans = compareRoutes(T);
  for (const p of plans) {
    for (let i = 1; i < p.events.length; i++) assert.ok(p.events[i].t > p.events[i - 1].t, `${p.route}: ${p.events[i].id}`);
    assert.equal(p.events.at(-1).t, T);
    assert.ok(p.propKg > 0 && Number.isFinite(p.propKg));
  }
  const loi = (r) => plans.find((p) => p.route === r).burns.find((b) => b.id === 'loi').dv;
  assert.ok(loi('lowenergy') < loi('direct'));
  assert.ok(plans.find((p) => p.route === 'lowenergy').doorToDoorDays > plans.find((p) => p.route === 'phasing').doorToDoorDays);
  assert.ok(planFlight(T, { lander: 'large' }).propKg > planFlight(T, { lander: 'small' }).propKg);
});

test('flight: the Moon’s near-side centre faces Earth; the path ends at the site', () => {
  const ms = Date.UTC(2027, 2, 10, 12);
  const s = siteDirection(0, 0, ms);
  const m = moonState(ms).r, n = Math.hypot(...m);
  assert.ok((s[0] * m[0] + s[1] * m[1] + s[2] * m[2]) / n < -0.98);
  const p = planFlight(ms, { route: 'direct' });
  p.siteDir = siteDirection(-89.45, -137.31, ms);
  const path = flightPath(p, 300);
  const end = path.at(-1).pos, mc = moonState(ms).r;
  const d = Math.hypot(end[0] - mc[0], end[1] - mc[1], end[2] - mc[2]);
  assert.ok(Math.abs(d - 1737.4) < 1, `ends ${d.toFixed(1)} km from the Moon's centre`);
});

test('flight: touchdown checks read the site analysis', () => {
  const site = { id: 'a11', lat: 0.67408, lon: 23.47297 };
  const ctx = prepareSite(site, null, DEFAULT_CONFIG);
  const p = planFlight(Date.parse('1969-07-20T20:17Z'), { route: 'direct' });
  const checks = touchdownChecks(p, (ms) => evaluate(ms, ctx, DEFAULT_CONFIG, { withDsn: false }));
  const light = checks.find((c) => c.id === 'light');
  assert.ok(light.ok, light.text); // Apollo 11 landed with the Sun 10.8° high
  assert.ok(checks.find((c) => c.id === 'radio').ok);
});

test('flight: the launch site changes the launch time and the free push from Earth’s spin', () => {
  const T = Date.UTC(2027, 1, 10, 12);
  const ksc = planFlight(T, { route: 'direct', launchSite: 'ksc' });
  const shar = planFlight(T, { route: 'direct', launchSite: 'shar' });
  assert.notEqual(ksc.launchMs, shar.launchMs);
  assert.ok(shar.launchGeom.spinBoostKms > ksc.launchGeom.spinBoostKms, 'lower latitude, bigger boost');
  assert.ok(ksc.launchGeom.inclDeg >= 28.5 && shar.launchGeom.inclDeg >= 13.7, 'orbit tilt at least the pad latitude');
});

test('flight: Apollo 11’s launch time from Kennedy comes out within 3 hours of the real one', () => {
  const T = Date.parse('1969-07-20T20:17Z'), loi = Date.parse('1969-07-19T17:22Z'), tli = Date.parse('1969-07-16T16:22Z');
  const p = planFlight(T, { route: 'direct', coastDays: (loi - tli) / D, lunarOrbitDays: (T - loi) / D, parkingAltKm: 191, parkingHours: 2.83 });
  const err = Math.abs(p.launchMs - Date.parse('1969-07-16T13:32Z')) / H;
  assert.ok(err < 3, `${err.toFixed(1)} h`);
});
