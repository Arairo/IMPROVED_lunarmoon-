// Playback pacing for the flight animation (Beginner "Fly" and the Pro Flight tab).
//
// A flight lasts hours to months, but the parts worth watching (launch, the
// parking orbit, touchdown) are short. So each phase gets a screen time of its
// own, and the playback rate (flight time per screen second) then eases from one
// phase to the next instead of jumping. Orbits get time per lap, so a lap around
// Earth is always slow enough to follow. Where a phase holds too many laps to
// show at a readable speed (weeks in lunar orbit), it is marked as fast-forward
// so the view can say so instead of strobing.
//
// This only changes how the animation is paced. Every frame still shows the
// true position at its true time from flightPath().

import { MU_E, MU_M, R_M } from '../core/flight.js';

const LUNAR_ORBIT_KM = R_M + 100;
const period = (mu, a) => 2 * Math.PI * Math.sqrt((a * a * a) / mu) * 1000; // ms
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Laps a phase makes, and the length of one lap (ms), or null if it is not an orbit. */
function orbitOf(plan, ph) {
  const span = ph.end - ph.start;
  if (ph.id === 'parking') { const p = period(MU_E, plan.rpKm); return { laps: span / p, periodMs: p }; }
  if (ph.id === 'orbit') { const p = period(MU_M, LUNAR_ORBIT_KM); return { laps: span / p, periodMs: p }; }
  if (ph.id === 'loops' && plan.loops?.length) {
    const laps = plan.loops.reduce((s, l) => s + l.revs, 0);
    return { laps, periodMs: span / laps };
  }
  return null;
}

/** Screen seconds for each phase at 1x (Beginner scale). */
export function phaseSeconds(plan, ph) {
  const o = orbitOf(plan, ph);
  switch (ph.id) {
    case 'launch': return 1.6;
    case 'parking': return clamp(2.6 * o.laps, 2.5, 6); // ~2.6 s per lap around Earth
    case 'loops': return o ? clamp(1.8 * o.laps, 8, 18) : 8;
    case 'ascent': return 2.2;
    case 'coast': return plan.route === 'lowenergy' ? 6.5 : 5;
    case 'orbit': return clamp(0.6 * o.laps, 3, 6);
    case 'descent': return 3.2;
    default: return 3;
  }
}

// Laps per screen second above which the craft would look like it is jumping
// around the orbit (at 60 frames a second), so the view calls it a fast-forward.
const FAST_LAPS_PER_S = 3;

/**
 * Build the playback timeline for a flight plan.
 * @param {object} plan  from planFlight()
 * @param {{ scale?: number }} [opts]  scale multiplies every phase's screen time
 * @returns {{ duration: number, slots: {start: number, end: number}[], timeAt(u: number): number, isFastForward(u: number): boolean }}
 *   u runs 0..1 over `duration` screen seconds; timeAt(u) is the flight time (ms).
 */
export function flightTimeline(plan, { scale = 1 } = {}) {
  const phases = plan.phases;
  const secs = phases.map((ph) => phaseSeconds(plan, ph) * scale);
  const duration = secs.reduce((s, x) => s + x, 0);
  const slots = [];
  let acc = 0;
  for (const s of secs) { slots.push({ start: acc / duration, end: (acc + s) / duration }); acc += s; }

  // Each phase owns a run of cells on a fine grid of screen time.
  const N = 3000;
  const du = 1 / N;
  const phaseOf = new Int32Array(N);
  for (let i = 0, k = 0; i < N; i++) {
    const u = (i + 0.5) * du;
    while (k < phases.length - 1 && u >= slots[k].end) k++;
    phaseOf[i] = k;
  }
  const first = phases.map((_, k) => phaseOf.indexOf(k));
  const last = phases.map((_, k) => phaseOf.lastIndexOf(k) + 1);
  // Snap the slots to the grid so phase boundaries are exact.
  phases.forEach((_, k) => { slots[k] = { start: first[k] / N, end: last[k] / N }; });

  // Log of the playback rate: one level per phase, smoothed twice with a moving
  // average (~0.7 s wide) so it eases between phases instead of jumping.
  const half = Math.max(1, Math.round((0.35 / duration) * N));
  const smooth = (a) => {
    const pre = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) pre[i + 1] = pre[i] + a[i];
    const out = new Float64Array(N);
    for (let i = 0; i < N; i++) { const lo = Math.max(0, i - half), hi = Math.min(N, i + half + 1); out[i] = (pre[hi] - pre[lo]) / (hi - lo); }
    return out;
  };
  const spans = phases.map((ph) => Math.max(1, ph.end - ph.start));
  const cellS = du * duration; // screen seconds per cell
  const level = spans.map((s, k) => Math.log(s / ((last[k] - first[k]) * cellS)));
  let rate = null;
  // Smoothing moves flight time between neighbouring phases, so nudge each
  // phase's level until every phase again covers its own real duration.
  for (let iter = 0; iter < 60; iter++) {
    const raw = new Float64Array(N);
    for (let i = 0; i < N; i++) raw[i] = level[phaseOf[i]];
    rate = Array.from(smooth(smooth(raw)), Math.exp);
    let worst = 0;
    for (let k = 0; k < phases.length; k++) {
      let got = 0;
      for (let i = first[k]; i < last[k]; i++) got += rate[i] * cellS;
      const fix = Math.log(spans[k] / got);
      level[k] += fix;
      worst = Math.max(worst, Math.abs(fix));
    }
    if (worst < 1e-4) break;
  }

  // Integrate. A last per-phase rescale (now a tiny correction) makes every
  // phase start and end exactly on its slot (the captions and Pro scrubber rely on it).
  const T = new Float64Array(N + 1); // flight time at grid edge i
  const ff = new Uint8Array(N);
  T[0] = phases[0].start;
  for (let k = 0; k < phases.length; k++) {
    let sum = 0;
    for (let i = first[k]; i < last[k]; i++) sum += rate[i];
    const o = orbitOf(plan, phases[k]);
    // Only phases with too many laps to follow overall are fast-forwarded.
    const fastPhase = o && o.laps / secs[k] > FAST_LAPS_PER_S;
    let t = phases[k].start;
    for (let i = first[k]; i < last[k]; i++) {
      const dt = (rate[i] / sum) * spans[k];
      t += dt;
      T[i + 1] = t;
      if (fastPhase && dt / cellS / o.periodMs > FAST_LAPS_PER_S) ff[i] = 1;
    }
    T[last[k]] = phases[k].end;
  }

  return {
    duration,
    slots,
    timeAt(u) {
      if (!(u > 0)) return T[0];
      if (u >= 1) return T[N];
      const x = u * N, i = Math.floor(x), f = x - i;
      return T[i] + f * (T[i + 1] - T[i]);
    },
    isFastForward(u) {
      if (!(u > 0) || u >= 1) return false;
      return ff[Math.min(N - 1, Math.floor(u * N))] === 1;
    },
  };
}
