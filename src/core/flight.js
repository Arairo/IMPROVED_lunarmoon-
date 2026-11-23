// Launch-to-landing planning model (patched conics).
//
// Works backwards from the plan's touchdown time: descent from a 100 km lunar
// orbit, the stay in lunar orbit, the coast from Earth (or the loops around
// Earth, or the long low-energy route), and the launch. Speeds come from
// vis-viva and Kepler's equation with the Moon's real distance on the day
// (astronomy-engine). A planning model, not navigation: given Apollo 11's own
// coast and orbit times it reproduces its burns within 50 m/s and its launch time
// within ~2 h; with default settings, trip lengths differ from flown missions by
// 0.2–10 days (test/flight.spec.js, docs/VALIDATION.md). Durations of the slow
// phases follow how recent missions flew; the low-energy path shape is a sketch.

import * as Astronomy from 'astronomy-engine';

export const MU_E = 398600.4418; // km^3/s^2
export const R_E = 6378.137;
export const MU_M = 4902.8;
export const R_M = 1737.4;
const AU_KM = 149597870.7;
const DAY = 86400000;
const G0 = 9.80665;
const LUNAR_ORBIT_ALT = 100;
// Powered-descent rule of thumb (see descentBudget).
export const DESCENT_LOSS_FACTOR = 1.12;
export const DESCENT_HOVER_KMS = 0.1;
const PERILUNE_ALT = 15;

export const LAUNCH_SITES = [
  { id: 'ksc', name: 'Kennedy Space Center, USA', short: 'Kennedy', lat: 28.573, lon: -80.649 },
  { id: 'shar', name: 'Satish Dhawan Space Centre, India', short: 'Sriharikota', lat: 13.72, lon: 80.23 },
  { id: 'wenchang', name: 'Wenchang Space Launch Site, China', short: 'Wenchang', lat: 19.614, lon: 110.951 },
  { id: 'tnsc', name: 'Tanegashima Space Center, Japan', short: 'Tanegashima', lat: 30.4, lon: 130.97 },
];

export const LANDERS = [
  { id: 'small', label: 'Small robotic lander', sub: '700 kg dry, like the CLPS landers', dryKg: 700, isp: 320 },
  { id: 'medium', label: 'Medium lander', sub: '2,000 kg dry, like Chang’e or Chandrayaan', dryKg: 2000, isp: 315 },
  { id: 'large', label: 'Large cargo lander', sub: '12,000 kg dry, methane–oxygen engine', dryKg: 12000, isp: 360 },
];

export const ROUTES = {
  direct: {
    id: 'direct', label: 'Direct', tagline: 'Fast and thirsty',
    blurb: 'Straight to the Moon in a few days, like Apollo and IM-1. Quick, but the lander has to brake hard to stop at the Moon.',
    like: 'Apollo 11, IM-1 Odysseus', defaults: { coastDays: 4, parkingHours: 2.7, lunarOrbitDays: 1 },
  },
  phasing: {
    id: 'phasing', label: 'Phasing loops', tagline: 'Patient and thrifty',
    blurb: 'Starts in a stretched Earth orbit and raises it loop by loop, then does the same at the Moon. Weeks longer, but small burns, so a smaller rocket will do.',
    like: 'Chandrayaan-3, Blue Ghost 1', defaults: { earthDays: 20, coastDays: 4.9, lunarOrbitDays: 17 },
  },
  lowenergy: {
    id: 'lowenergy', label: 'Low-energy', tagline: 'Slow and frugal',
    blurb: 'Swings out about 1.5 million km and lets the Sun’s pull bend the path back to the Moon. Months long, but it arrives slowly, so braking is cheapest.',
    like: 'SLIM, ispace HAKUTO-R', defaults: { transferDays: 100, lunarOrbitDays: 25 },
  },
};

/** Moon position (km) and velocity (km/s), geocentric J2000 equatorial. */
export function moonState(ms) {
  const s = Astronomy.GeoMoonState(Astronomy.MakeTime(new Date(ms)));
  const k = AU_KM / 86400;
  return { r: [s.x * AU_KM, s.y * AU_KM, s.z * AU_KM], v: [s.vx * k, s.vy * k, s.vz * k] };
}
export function sunDir(ms) {
  const v = Astronomy.GeoVector(Astronomy.Body.Sun, Astronomy.MakeTime(new Date(ms)), false);
  const n = Math.hypot(v.x, v.y, v.z);
  return [v.x / n, v.y / n, v.z / n];
}

const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const unit = (v) => scale(v, 1 / norm(v));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const visViva = (mu, r, a) => Math.sqrt(mu * (2 / r - 1 / a));
const circ = (mu, r) => Math.sqrt(mu / r);
const period = (mu, a) => 2 * Math.PI * Math.sqrt((a * a * a) / mu);

/** Seconds from perigee to radius r on the outbound leg of an ellipse. */
export function timeToRadius(rp, ra, r, mu = MU_E) {
  const a = (rp + ra) / 2, e = (ra - rp) / (ra + rp);
  const E = Math.acos(Math.max(-1, Math.min(1, (1 - r / a) / e)));
  return (E - e * Math.sin(E)) * Math.sqrt((a * a * a) / mu);
}

/** Apogee radius that reaches the Moon's distance rM `coastDays` after perigee. */
export function apogeeForCoast(rp, rM, coastDays) {
  let lo = rM * 1.0001, hi = rM * 60;
  const want = coastDays * 86400;
  if (timeToRadius(rp, lo, rM) <= want) return lo; // as slow as an ellipse can get
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (timeToRadius(rp, mid, rM) > want) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** Speed at the Moon's distance relative to the Moon (v-infinity), km/s. */
function arrivalVinf(rp, ra, rM, vMoon) {
  const a = (rp + ra) / 2, e = (ra - rp) / (ra + rp);
  const v = visViva(MU_E, rM, a);
  const h = Math.sqrt(MU_E * a * (1 - e * e));
  const vt = h / rM, vr = Math.sqrt(Math.max(0, v * v - vt * vt));
  return Math.hypot(vr, vt - vMoon);
}

const captureToCircular = (vinf, r) => Math.sqrt(vinf * vinf + (2 * MU_M) / r) - circ(MU_M, r);

/** Descent from the 100 km orbit: lower the low point to 15 km, then powered descent with steering losses and a short hover. */
export function descentBudget() {
  const rLo = R_M + LUNAR_ORBIT_ALT, rPe = R_M + PERILUNE_ALT, a = (rLo + rPe) / 2;
  const doi = circ(MU_M, rLo) - visViva(MU_M, rLo, a);
  const vPeri = visViva(MU_M, rPe, a);
  // Rule of thumb, not physics: the perilune speed plus ~12% for gravity and steering
  // losses and 0.1 km/s (~60 s) of hover. Calibrated so Apollo 11's descent comes out
  // at 2.01 km/s vs 2.06 flown (test/flight.spec.js). A real descent needs a guidance
  // simulation with the lander's thrust and mass.
  const powered = vPeri * DESCENT_LOSS_FACTOR + DESCENT_HOVER_KMS;
  const halfOrbitMs = (period(MU_M, a) / 2) * 1000;
  return { doi, powered, halfOrbitMs };
}

/**
 * Plan the flight for a touchdown at `touchdownMs`.
 * opts: { route, lander, launchSite, coastDays, earthDays, transferDays, lunarOrbitDays, parkingAltKm }
 */
// Where you launch from matters twice. (1) Earth's spin gives a free push of
// 0.465 km/s x cos(inclination) to a rocket heading east, and the parking orbit
// can't be tilted less than the launch site's latitude, nor less than the
// Moon's declination (the trans-lunar burn happens roughly opposite the Moon).
// (2) The rocket must lift off when Earth's rotation carries the pad into that
// orbit's plane, so the launch time of day depends on the site's longitude.
const V_EQ = 0.4651; // km/s, Earth's surface speed at the equator
const ASCENT_NO_SPIN = 9.75; // km/s to a 200 km orbit incl. gravity/drag losses, without Earth's spin
export function launchGeometry(site, tTliMs, rMoon, parkingHours, align = true, eitherSide = false) {
  const D = Math.PI / 180;
  const n = norm(rMoon);
  const decP = -Math.asin(rMoon[2] / n); // TLI point is roughly opposite the Moon
  const raP = Math.atan2(-rMoon[1], -rMoon[0]);
  const phi = Math.abs(site.lat) * D;
  const inc = Math.max(phi, Math.abs(decP), 0.5 * D);
  const boost = V_EQ * Math.cos(inc);
  const out = { latDeg: site.lat, moonDecDeg: -decP / D, inclDeg: inc / D, spinBoostKms: boost, ascentDv: ASCENT_NO_SPIN - boost, launchMs: null, parkingHours };
  if (!align) return out;
  const nodeOffset = (u) => Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u));
  const asinC = (x) => Math.asin(Math.max(-1, Math.min(1, x)));
  const uP = asinC(Math.sin(decP) / Math.sin(inc));
  const uS = asinC(Math.sin(site.lat * D) / Math.sin(inc));
  const target = tTliMs - parkingHours * 3600000;
  const latest = tTliMs - 0.75 * 3600000;
  const siteRa = (ms) => (Astronomy.SiderealTime(Astronomy.MakeTime(new Date(ms))) * 15 + site.lon) * D;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const SID_DAY = 86164091; // ms
  let best = null;
  for (const up of [uP, Math.PI - uP]) {
    const node = raP - nodeOffset(up);
    for (const us of [uS, Math.PI - uS]) {
      const need = node + nodeOffset(us);
      let t = target + (wrap(need - siteRa(target)) / (2 * Math.PI)) * SID_DAY;
      if (!eitherSide) while (t > latest) t -= SID_DAY;
      if (!best || Math.abs(t - target) < Math.abs(best - target)) best = t;
    }
  }
  out.launchMs = best;
  out.parkingHours = (tTliMs - best) / 3600000;
  return out;
}

export function planFlight(touchdownMs, opts = {}) {
  const route = ROUTES[opts.route] ? opts.route : 'direct';
  const R = ROUTES[route];
  const d = { ...R.defaults, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v != null)) };
  const lander = LANDERS.find((l) => l.id === (opts.lander || 'small')) || LANDERS[0];
  const site = LAUNCH_SITES.find((l) => l.id === (opts.launchSite || 'ksc')) || LAUNCH_SITES[0];
  const rp = R_E + (opts.parkingAltKm ?? (route === 'phasing' ? 170 : 200));
  const rLo = R_M + LUNAR_ORBIT_ALT;
  const desc = descentBudget();

  const tPdi = touchdownMs - 12 * 60000;
  const tDoi = tPdi - desc.halfOrbitMs;
  const tLoi = touchdownMs - d.lunarOrbitDays * DAY;
  const moonAtLoi = moonState(tLoi);
  const rM = norm(moonAtLoi.r);
  const vMoon = norm(moonAtLoi.v);

  const burns = [];
  const phases = [];
  let tTli, tLaunch, ra = null, loops = [], tliDv, vinf, coastDays;
  if (route === 'lowenergy') {
    coastDays = d.transferDays;
    tTli = tLoi - d.transferDays * DAY;
    tLaunch = launchGeometry(site, tTli, moonAtLoi.r, 1.2).launchMs;
    const c3 = -0.7; // km^2/s^2, typical for low-energy transfers
    tliDv = Math.sqrt(c3 + (2 * MU_E) / rp) - circ(MU_E, rp);
    vinf = 0.3; // arrives slowly: the Sun has already done the work
    burns.push({ id: 'tli', label: 'Leave Earth (rocket upper stage)', dv: tliDv, byLander: false, t: tTli, basis: 'assumed' });
    burns.push({ id: 'tcm', label: 'Course corrections on the way', dv: 0.05, byLander: true, t: tTli + 0.5 * coastDays * DAY, basis: 'assumed' });
  } else {
    coastDays = Math.max(3, Math.min(4.95, d.coastDays));
    ra = apogeeForCoast(rp, rM, coastDays);
    tTli = tLoi - timeToRadius(rp, ra, rM) * 1000;
    if (route === 'direct' && opts.alignLaunch !== false) {
      // Lift off at the pad's nearest pass under the orbit plane, keep the
      // usual parking-orbit wait, and let the coast to the Moon absorb the shift.
      tLaunch = launchGeometry(site, tTli, moonAtLoi.r, d.parkingHours, true, true).launchMs;
      tTli = tLaunch + d.parkingHours * 3600000;
      coastDays = Math.max(3, Math.min(4.95, (tLoi - tTli) / DAY));
      ra = apogeeForCoast(rp, rM, coastDays);
    }
    const a = (rp + ra) / 2;
    const vPeri = visViva(MU_E, rp, a);
    vinf = arrivalVinf(rp, ra, rM, vMoon);
    if (route === 'direct') {
      tliDv = vPeri - circ(MU_E, rp);
      burns.push({ id: 'tli', label: 'Leave Earth (rocket upper stage)', dv: tliDv, byLander: false, t: tTli });
    } else {
      // Phasing: the rocket leaves the lander in a 170 x 36,500 km orbit; the lander
      // raises the apogee loop by loop, then makes the final push at perigee.
      const ra0 = R_E + 36500;
      const steps = [ra0, R_E + 51000, R_E + 71000, R_E + 127000, R_E + 230000];
      const want = d.earthDays * 86400;
      const P = steps.map((x) => period(MU_E, (rp + x) / 2));
      const total = P.reduce((s, x) => s + x, 0);
      loops = steps.map((x, i) => ({ ra: x, revs: Math.max(1, Math.round((want * (P[i] / total)) / P[i])), periodS: P[i] }));
      const earthS = loops.reduce((s, l) => s + l.revs * l.periodS, 0);
      tLaunch = tTli - earthS * 1000 - 0.03 * DAY;
      tliDv = vPeri - visViva(MU_E, rp, (rp + ra0) / 2);
      let t = tLaunch + 0.03 * DAY;
      for (let i = 0; i < loops.length; i++) {
        t += loops[i].revs * loops[i].periodS * 1000;
        loops[i].endMs = t;
      }
      burns.push({ id: 'raise', label: `Raise the orbit in ${loops.length} perigee burns`, dv: visViva(MU_E, rp, (rp + steps[steps.length - 1]) / 2) - visViva(MU_E, rp, (rp + ra0) / 2), byLander: true, t: tLaunch + 0.03 * DAY });
      burns.push({ id: 'tli', label: 'Final push towards the Moon', dv: vPeri - visViva(MU_E, rp, (rp + steps[steps.length - 1]) / 2), byLander: true, t: tTli });
    }
    burns.push({ id: 'tcm', label: 'Course corrections on the way', dv: 0.03, byLander: true, t: tTli + 0.5 * coastDays * DAY, basis: 'assumed' });
  }
  const geo = launchGeometry(site, tTli, moonAtLoi.r, (tTli - tLaunch) / 3600000, false);
  burns.unshift({ id: 'ascent', label: `Launch into a ${geo.inclDeg.toFixed(0)}° parking orbit (Earth’s spin gives ${geo.spinBoostKms.toFixed(2)} km/s free)`, dv: geo.ascentDv, byLander: false, t: tLaunch, basis: 'assumed' });
  const loi = captureToCircular(vinf, rLo);
  burns.push({ id: 'loi', label: route === 'phasing' ? 'Capture at the Moon and lower the orbit to 100 km' : 'Brake into a 100 km lunar orbit', dv: loi, byLander: true, t: tLoi, basis: route === 'lowenergy' ? 'assumed' : 'computed' });
  burns.push({ id: 'doi', label: 'Lower the orbit’s low point to 15 km', dv: desc.doi, byLander: true, t: tDoi });
  burns.push({ id: 'pdi', label: 'Powered descent and landing', dv: desc.powered, byLander: true, t: tPdi, basis: 'rule of thumb' });
  for (const b of burns) b.basis ??= 'computed';

  const landerDv = burns.filter((b) => b.byLander).reduce((s, b) => s + b.dv, 0);
  const ve = (G0 * lander.isp) / 1000;
  const propKg = lander.dryKg * (Math.exp(landerDv / ve) - 1) * 1.05; // 5% reserve
  const totalDv = burns.reduce((s, b) => s + b.dv, 0);

  phases.push({ id: 'launch', label: 'Launch', start: tLaunch, end: tLaunch + 0.01 * DAY });
  if (route === 'direct') phases.push({ id: 'parking', label: 'Parking orbit around Earth', start: tLaunch + 0.01 * DAY, end: tTli });
  if (route === 'phasing') phases.push({ id: 'loops', label: 'Loops around Earth, raising the orbit', start: tLaunch + 0.01 * DAY, end: tTli });
  if (route === 'lowenergy') phases.push({ id: 'ascent', label: 'Straight onto the long route', start: tLaunch + 0.01 * DAY, end: tTli });
  phases.push({ id: 'coast', label: route === 'lowenergy' ? 'The long way round: out and back with the Sun’s help' : 'Coasting to the Moon', start: tTli, end: tLoi });
  phases.push({ id: 'orbit', label: route === 'phasing' ? 'Lunar orbit, lowering it step by step' : 'Lunar orbit, waiting for the landing pass', start: tLoi, end: tDoi });
  phases.push({ id: 'descent', label: 'Descent to the surface', start: tDoi, end: touchdownMs });

  const events = [
    { id: 'launch', label: `Launch from ${site.short}`, t: tLaunch },
    { id: 'tli', label: route === 'phasing' ? 'Final push towards the Moon' : 'Leave Earth orbit', t: tTli },
    { id: 'loi', label: 'Arrive in lunar orbit', t: tLoi },
    { id: 'doi', label: 'Start the descent orbit', t: tDoi },
    { id: 'pdi', label: 'Powered descent begins', t: tPdi },
    { id: 'touchdown', label: 'Touchdown', t: touchdownMs },
  ];

  return {
    route, routeInfo: R, lander, launchSite: site, params: { ...d, coastDays },
    launchGeom: { ...geo, parkingHours: route === 'phasing' ? null : (tTli - tLaunch) / 3600000 },
    touchdownMs, launchMs: tLaunch, tliMs: tTli, loiMs: tLoi, doiMs: tDoi, pdiMs: tPdi,
    rpKm: rp, raKm: ra, moonDistKm: rM, vinf, loops,
    burns, landerDv, totalDv, propKg, wetKg: lander.dryKg + propKg,
    doorToDoorDays: (touchdownMs - tLaunch) / DAY,
    phases, events,
    model: flightModelInfo(route),
  };
}

/** What the flight numbers are, and are not, for reports and the Flight tab. */
export function flightModelInfo(route) {
  return {
    class: 'patched conics: two-body legs around Earth and the Moon joined at the Moon\u2019s sphere of influence',
    status: 'preliminary planning estimate; not a navigation solution and not an optimised trajectory',
    burnBasis: { computed: 'from orbital mechanics (vis-viva, capture from arrival speed)', assumed: 'a fixed allowance typical of flown missions', 'rule of thumb': 'calibrated to Apollo 11, not derived' },
    assumptions: [
      'impulsive burns (no finite-burn or changing-mass losses except in the descent rule of thumb)',
      '100 km circular lunar orbit, descent from 15 km perilune',
      `descent \u0394v = perilune speed \u00d7 ${DESCENT_LOSS_FACTOR} + ${DESCENT_HOVER_KMS} km/s`,
      'propellant from the rocket equation with a 5% reserve',
      `launch to a 200 km parking orbit: ${ASCENT_NO_SPIN} km/s including gravity and drag losses, minus the boost from Earth\u2019s spin at the pad`,
      ...(route === 'lowenergy' ? ['low-energy route: launch energy C3 = \u22120.7 km\u00b2/s\u00b2 and 0.3 km/s arrival speed assumed; the drawn path is a sketch'] : []),
      ...(route === 'phasing' ? ['phasing route: a fixed ladder of five apogees, as flown by Chandrayaan-3'] : []),
    ],
    notModelled: ['Sun and Earth pull during lunar orbit (third-body perturbations)', 'navigation errors and real correction burns', 'finite thrust and gravity turn during launch', 'launch vehicle performance limits'],
    checkedAgainst: 'Apollo 11 burns (within ~0.05 km/s) and flown timelines of Apollo 11, IM-1, Chandrayaan-3, Blue Ghost M1 and SLIM (test/flight.spec.js, test/flown.spec.js)',
  };
}

/** The three routes for the same touchdown, for the side-by-side card. */
export function compareRoutes(touchdownMs, opts = {}) {
  return Object.keys(ROUTES).map((route) => planFlight(touchdownMs, { ...opts, route, coastDays: undefined, earthDays: undefined, transferDays: undefined, lunarOrbitDays: undefined }));
}

/** Lighting and radio checks at touchdown, using the app's own site analysis. */
export function touchdownChecks(plan, evaluateAt) {
  const at = evaluateAt(plan.touchdownMs);
  const before = evaluateAt(plan.touchdownMs - 15 * 60000);
  const sunEl = at.sun.el;
  const lightOk = sunEl >= 5 && sunEl <= 20;
  const polar = Math.abs(plan.site?.lat ?? 0) > 75;
  const polarNote = polar && sunEl > 0 && sunEl < 5 ? ' Near the poles the Sun never climbs above about 2°, so polar landers rely on laser rangefinders and their own lights to spot hazards.' : '';
  return [
    {
      id: 'light', ok: lightOk, warn: !lightOk && sunEl > 0,
      title: 'Sun angle for the landing cameras',
      text: sunEl <= 0 ? `The Sun is below the horizon at touchdown (${sunEl.toFixed(1)}°): no light to see hazards, no power.`
        : lightOk ? `Sun ${sunEl.toFixed(1)}° high: long enough shadows to show boulders and craters (Apollo aimed for 5–14°).`
          : sunEl < 5 ? `Sun only ${sunEl.toFixed(1)}° high: very long shadows can hide the ground. Apollo aimed for 5–14°.${polarNote}`
            : `Sun ${sunEl.toFixed(1)}° high: short shadows make small hazards harder to spot. Apollo aimed for 5–14°.`,
    },
    {
      id: 'power', ok: at.sun.fraction > 0.5, warn: false,
      title: 'Power on arrival',
      text: at.sun.fraction > 0.5 ? 'The Sun is above the local skyline at touchdown, so the solar panels start charging straight away.' : 'The Sun is hidden by the skyline at touchdown: the lander lands on battery.',
    },
    {
      id: 'radio', ok: at.earth.visible && before.earth.visible, warn: at.earth.visible !== before.earth.visible,
      title: 'Radio during the descent',
      text: at.earth.visible && before.earth.visible ? 'Earth is in view for the last 15 minutes and at touchdown, so the team can follow the landing live.'
        : at.earth.visible ? 'Earth comes into view only just before touchdown: part of the descent is out of contact.'
          : 'Earth is hidden at touchdown: the landing happens out of contact and the team waits for news.',
    },
  ];
}

// ---- Geometry for drawing the flight (km, geocentric J2000 equatorial) ----

function kepler(M, e) {
  let E = M;
  for (let i = 0; i < 30; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** Even sampling inside every phase, so short phases (the descent) get as many points as long ones. */
export function phaseTimes(plan, perPhase = 160) {
  const out = [];
  const loPeriod = period(MU_M, R_M + LUNAR_ORBIT_ALT) * 1000;
  for (const ph of plan.phases) {
    const span = ph.end - ph.start;
    let n = perPhase;
    // Orbits need enough points per revolution to draw as rings, not stars.
    if (ph.id === 'orbit') n = Math.min(6000, Math.max(perPhase, Math.round((span / loPeriod) * 40)));
    if (ph.id === 'parking') n = Math.max(perPhase, Math.round((span / (period(MU_E, plan.rpKm) * 1000)) * 80));
    if (ph.id === 'loops') n = Math.min(3000, Math.max(perPhase, plan.loops.reduce((s, l) => s + l.revs, 0) * 120));
    for (let i = 0; i < n; i++) out.push(ph.start + (i / n) * span);
  }
  out.push(plan.touchdownMs);
  return out;
}

/** Sampled path: [{ t, pos: [x,y,z] km, phase, near: 'earth'|'moon'|null }]. */
export function flightPath(plan, n = 900, sampleTimes = null) {
  const out = [];
  const m = moonState(plan.loiMs);
  const nrm = unit(cross(m.r, m.v));
  const uArr = unit(m.r);
  const rp = plan.rpKm;
  const tStart = plan.launchMs, tEnd = plan.touchdownMs;
  const span = tEnd - tStart;
  const times = sampleTimes ? [...sampleTimes] : [];
  // Denser sampling near the start and end, where things happen quickly.
  for (let i = 0; !sampleTimes && i <= n; i++) {
    const s = i / n;
    const w = s < 0.5 ? 0.5 * Math.pow(2 * s, 1.6) : 1 - 0.5 * Math.pow(2 * (1 - s), 1.6);
    times.push(tStart + w * span);
  }
  // Orbit plane basis with perigee direction pHat.
  let pHat, qHat, coastPos;
  if (plan.route !== 'lowenergy') {
    const ra = plan.raKm, a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), pp = a * (1 - e * e);
    const nuA = Math.acos(Math.max(-1, Math.min(1, (pp / plan.moonDistKm - 1) / e)));
    // pHat = uArr rotated by -nuA about nrm.
    const qA = cross(nrm, uArr);
    pHat = add(scale(uArr, Math.cos(nuA)), scale(qA, -Math.sin(nuA)));
    qHat = cross(nrm, pHat);
    const nMean = Math.sqrt(MU_E / (a * a * a));
    coastPos = (t) => {
      const M = nMean * ((t - plan.tliMs) / 1000);
      const E = kepler(M, e);
      const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
      const r = a * (1 - e * Math.cos(E));
      return add(scale(pHat, r * Math.cos(nu)), scale(qHat, r * Math.sin(nu)));
    };
  } else {
    // Schematic low-energy route: out roughly away from the Sun to ~1.5 million km
    // and back to where the Moon will be. The real shape depends on the Sun's pull.
    const sd = sunDir(plan.tliMs);
    const away = unit(add(scale(sd, -1), scale(nrm, -dot(sd, nrm) * -1)));
    pHat = unit(add(away, scale(cross(nrm, away), 0.4)));
    qHat = cross(nrm, pHat);
    const far = add(scale(away, 1.45e6), scale(cross(nrm, away), 3.5e5));
    const p0 = scale(pHat, rp);
    const c1 = add(scale(away, 0.9e6), scale(cross(nrm, away), -6e5));
    const c2 = add(far, scale(cross(nrm, away), 9e5));
    coastPos = (t) => {
      const s = Math.max(0, Math.min(1, (t - plan.tliMs) / (plan.loiMs - plan.tliMs)));
      const p3 = moonState(t > plan.loiMs - DAY ? t : plan.loiMs).r;
      const u = 1 - s;
      return add(add(scale(p0, u * u * u), scale(c1, 3 * u * u * s)), add(scale(c2, 3 * u * s * s), scale(p3, s * s * s)));
    };
  }
  const site = plan.siteDir || [0, 0, -1];
  for (const t of times) {
    let pos, phase, near = null;
    if (t < plan.tliMs) {
      phase = plan.route === 'phasing' ? 'loops' : plan.route === 'direct' ? 'parking' : 'ascent';
      near = 'earth';
      if (plan.route === 'phasing' && plan.loops.length) {
        // Which loop are we on?
        let start = plan.launchMs + 0.03 * DAY, L = plan.loops[0];
        for (const lp of plan.loops) { if (t <= lp.endMs) { L = lp; break; } start = lp.endMs; }
        const a = (rp + L.ra) / 2, e = (L.ra - rp) / (L.ra + rp);
        const M = Math.sqrt(MU_E / (a * a * a)) * ((t - start) / 1000);
        const E = kepler(M % (2 * Math.PI), e);
        const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
        const r = a * (1 - e * Math.cos(E));
        pos = add(scale(pHat, r * Math.cos(nu)), scale(qHat, r * Math.sin(nu)));
      } else {
        const w = circ(MU_E, rp) / rp; // rad/s
        const th = -w * ((plan.tliMs - t) / 1000);
        pos = add(scale(pHat, rp * Math.cos(th)), scale(qHat, rp * Math.sin(th)));
      }
    } else if (t < plan.loiMs) {
      phase = 'coast';
      pos = coastPos(t);
    } else {
      const mc = moonState(t).r;
      near = 'moon';
      if (t < plan.doiMs) {
        phase = 'orbit';
        const rLo = R_M + LUNAR_ORBIT_ALT;
        const w = circ(MU_M, rLo) / rLo;
        const th = w * ((t - plan.loiMs) / 1000);
        // Polar orbit through the site direction, for the picture.
        const s1 = unit(site), s2 = unit(cross(nrm, s1));
        pos = add(mc, add(scale(s1, rLo * Math.cos(th)), scale(s2, rLo * Math.sin(th))));
      } else {
        phase = 'descent';
        const f = (t - plan.doiMs) / (plan.touchdownMs - plan.doiMs);
        const alt = LUNAR_ORBIT_ALT * (1 - f) ** 1.5;
        const s1 = unit(site), s2 = unit(cross(nrm, s1));
        const th = (1 - f) * 0.3; // ~500 km of downrange travel, like Apollo's powered descent
        pos = add(mc, add(scale(s1, (R_M + alt) * Math.cos(th)), scale(s2, -(R_M + alt) * Math.sin(th))));
      }
    }
    out.push({ t, pos, phase, near });
  }
  return out;
}

/** The landing site as a geocentric unit direction at touchdown (for drawing). */
export function siteDirection(lat, lon, ms) {
  // Moon-fixed -> J2000 using the IAU rotation (inverse of ephemeris.eqjToMoonFixed).
  const axis = Astronomy.RotationAxis(Astronomy.Body.Moon, Astronomy.MakeTime(new Date(ms)));
  const D = Math.PI / 180;
  const cl = Math.cos(lat * D);
  let v = [cl * Math.cos(lon * D), cl * Math.sin(lon * D), Math.sin(lat * D)];
  const rotZ = (x, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [c * x[0] + s * x[1], -s * x[0] + c * x[1], x[2]]; };
  const rotX = (x, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [x[0], c * x[1] + s * x[2], -s * x[1] + c * x[2]]; };
  v = rotZ(v, -axis.spin * D);
  v = rotX(v, -(Math.PI / 2 - axis.dec * D));
  v = rotZ(v, -(Math.PI / 2 + axis.ra * 15 * D));
  return v;
}

// Flown missions used as checks (public timelines).
export const FLOWN_FLIGHTS = [
  { id: 'a11', name: 'Apollo 11', route: 'direct', launch: '1969-07-16T13:32Z', tli: '1969-07-16T16:22Z', loi: '1969-07-19T17:22Z', touchdown: '1969-07-20T20:17Z', tliDv: 3.18, loiDv: 0.94, descentDv: 2.06, note: 'TLI by the Saturn V third stage; LOI by the service module (two burns).' },
  { id: 'im1', name: 'IM-1 Odysseus', route: 'direct', launch: '2024-02-15T06:05Z', loi: '2024-02-21T11:11Z', touchdown: '2024-02-22T23:24Z', note: 'Falcon 9 put it straight on its way to the Moon.' },
  { id: 'ch3', name: 'Chandrayaan-3', route: 'phasing', launch: '2023-07-14T09:05Z', tli: '2023-07-31T18:30Z', loi: '2023-08-05T13:45Z', touchdown: '2023-08-23T12:33Z', note: 'Five Earth-bound orbit raises, then lunar orbit lowered in steps.' },
  { id: 'bg1', name: 'Blue Ghost Mission 1', route: 'phasing', launch: '2025-01-15T06:11Z', loi: '2025-02-13T08:45Z', touchdown: '2025-03-02T08:34Z', note: '25 days in Earth orbit, a 4-day transit, 16 days in lunar orbit.' },
  { id: 'slim', name: 'SLIM', route: 'lowenergy', launch: '2023-09-06T23:42Z', loi: '2023-12-25T07:51Z', touchdown: '2024-01-19T15:20Z', note: 'A lunar swing-by and a long loop out before capture.' },
];
