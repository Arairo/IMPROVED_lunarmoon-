# Frames, time and units

How positions, times and angles are defined in the engine (`src/core/`). Read this before
changing anything in `ephemeris.js`, `geo.js` or `horizon.js`; a change to any of these
must come with a source and a regression test.

## Time

- **Input:** every engine function takes time as **UTC milliseconds since 1970** (a JavaScript
  `Date` or its `getTime()`). Date fields in the UI are read as UTC (`Date.parse(value + ':00Z')`),
  never local time.
- **Inside:** astronomy-engine converts UTC to Terrestrial Time with its own ΔT model
  (`Astronomy.MakeTime`). The engine never adds its own time-scale offsets.
- **Leap seconds:** JavaScript time ignores them (a UTC day is always 86,400 s), so an instant
  can be off by up to 1 s near a leap second. The Moon turns 0.0085° in a minute, so that is
  about 0.0001°: far below anything the tool reports.
- **Invalid times:** `moonFixedState` throws a `RangeError` for a non-finite time rather than
  returning NaN.
- **Checked period:** 1969–2028 (`CHECKED_PERIOD` in `ephemeris.js`): JPL Horizons comparisons
  in 1969 and 2026–2028, flown missions 1969–2025. Dates outside it are still computed, but the
  app and the JSON report label them as not independently checked (`epochStatus`).

## Frames

- **Ephemeris:** Sun and Moon positions from astronomy-engine (VSOP87 for the Sun, an
  ELP/MPP02-style series for the Moon), in the J2000 mean equator (EQJ).
- **Moon body-fixed frame:** EQJ is rotated into the Moon's frame with the IAU/WGCCRE lunar
  rotation model (pole right ascension and declination, prime meridian angle W, with the
  E1–E13 libration terms): `M = Rz(W) · Rx(90° − dec) · Rz(90° + ra)` (`eqjToMoonFixed`).
  This approximates the Mean Earth / polar axis frame that LOLA terrain uses. The combined
  effect of the ephemeris and this frame is measured against JPL Horizons: worst 0.007° in
  elevation over the 154 stored comparisons (`test/horizons.spec.js`).
- **Axes:** x towards 0° N 0° E, z towards the north pole, y completing a right-handed set
  (towards 0° N 90° E).
- **Topocentric:** east-north-up at the site (`enuBasis`). Elevation is measured from the
  local horizontal plane of the 1737.4 km sphere; azimuth from north, clockwise (east = 90°).
  Topocentric parallax is included: the site is up to 1,737 km from the Moon's centre, which
  moves Earth by up to ~0.26°.

## Surface coordinates and heights

- **Latitude:** planetocentric, degrees, north positive.
- **Longitude:** degrees, **east positive**, −180 to 180 (Horizons `SITE_COORD` uses the same).
- **Heights:** metres above the **1737.4 km reference sphere** (`MOON_RADIUS_M`, the LOLA
  reference radius, also Cesium's Moon). Site height = terrain height + mast height (2 m default).
- **South-polar grids:** polar stereographic on the same sphere (`toSouthPolar`), metres.

## Units in code

| Quantity | Unit | Example names |
|---|---|---|
| Time | UTC milliseconds | `ms`, `startMs`, `touchdownMs` |
| Angles | degrees (radians only inside maths helpers) | `lat`, `lon`, `az`, `el`, `azStepDeg` |
| Distances, heights | metres (`…M`), kilometres only in `flight.js` (`…Km`) | `maxDistM`, `rpKm` |
| Power / energy | watts / watt-hours | `powerW`, `batteryKWh` (kilowatt-hours where named so) |

## Terrain horizon sampling

See `docs/VALIDATION.md` section 3 and `horizonQuality()` in `src/core/horizon.js`. Every horizon
records its grid sizes, largest ray step, azimuth spacing and whether crest refinement was used,
and has a tier: `fine`, `standard`, `coarse` or `none`.
