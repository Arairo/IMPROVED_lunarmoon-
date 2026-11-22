// Terrain 3D (src/planner/scene/moonScene.js) draws the Sun and Earth rays from the
// site with CesiumJS on its Moon sphere (Ellipsoid.MOON, 1737.4 km), starting 10 m
// above the ground. This rebuilds those rays with Cesium's own coordinate formula
// (Cartesian3.fromDegrees on a sphere) and checks they point where the engine says the
// Sun and Earth are (az/el from evaluate()), so the 3D picture and the numbers agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, prepareSite, DEFAULT_CONFIG } from '../src/core/analysis.js';
import { azEl } from '../src/core/geo.js';
import sitesData from '../src/data/sites.json' with { type: 'json' };

const CESIUM_MOON_RADIUS_M = 1737400; // Cesium.Ellipsoid.MOON radii (a sphere)
/** Cesium.Cartesian3.fromDegrees(lon, lat, h, Ellipsoid.MOON) for a spherical ellipsoid. */
const cesiumFromDegrees = (lon, lat, h) => {
  const r = CESIUM_MOON_RADIUS_M + h, la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
};
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('Terrain 3D rays point at the Sun and Earth positions the engine reports (within 0.05°)', () => {
  const ids = ['ridge', 'a3-mp', 'a3-hw', 'shackleton', 'im2'];
  const times = [Date.UTC(2027, 0, 10, 6), Date.UTC(2027, 5, 15, 12), Date.UTC(2028, 2, 3, 18)];
  let worst = 0, checked = 0;
  for (const id of ids) {
    const site = sitesData.find((s) => s.id === id);
    assert.ok(site, id);
    const ctx = prepareSite(site, DEFAULT_CONFIG);
    for (const ms of times) {
      const ev = evaluate(ms, ctx, DEFAULT_CONFIG);
      const base = cesiumFromDegrees(site.lon, site.lat, (ctx.horizon?.groundHeight ?? 0) + 10);
      // Local axes from where Cesium put the site (not from lat/lon): up is the sphere
      // normal, east is perpendicular to the spin axis, as Cesium's eastNorthUp frame.
      const n = Math.hypot(...base), up = base.map((v) => v / n);
      const e0 = [-up[1], up[0], 0], en = Math.hypot(...e0), east = e0.map((v) => v / en);
      const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
      const basis = { east, north, up };
      for (const body of ['sun', 'earth']) {
        const target = ev.state[body];
        const ray = azEl([target[0] - base[0], target[1] - base[1], target[2] - base[2]], basis);
        const dEl = Math.abs(ray.el - ev[body].el);
        const dAz = Math.cos((ev[body].el * Math.PI) / 180) * angDiff(ray.az, ev[body].az); // on-sky separation
        worst = Math.max(worst, dEl, dAz);
        checked++;
      }
    }
  }
  assert.equal(checked, 30);
  if (process.env.SHOW) console.log(`worst ${worst.toFixed(5)}°`);
  // The ray starts 10 m above the ground and the engine's mast is 2 m: an 8 m shift,
  // invisible for the Sun and about 0.0001° for Earth.
  assert.ok(worst < 0.05, `worst difference ${worst.toFixed(4)}°`);
});
