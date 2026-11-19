# How far the numbers can be trusted

Lunar Site Planner is a planning tool. This page lists every independent check
we run, what it found, and the error budget that follows from it. Every check
is automated, so you can re-run it with the tests or a GitHub workflow.

## 1. Checks against independent sources

| What | Against | Result | Re-run |
|---|---|---|---|
| Sun and Earth positions seen from the surface | NASA JPL Horizons, 48 site/time pairs (8 sites × 3 dates × Sun and Earth) | Worst elevation difference **0.005°**, median 0.001°, worst azimuth 0.02° (the Sun's disk is 0.53° wide) | *Validate against JPL Horizons* workflow; `public/data/validation.json` |
| Sun height at landing | Five Apollo landings (mission reports) | All within **0.35°**: Apollo 11 −0.10°, 12 +0.04°, 14 +0.04°, 15 −0.18°, 17 +0.35° | `npm test` (test/flown.spec.js) |
| Local sunset | Blue Ghost M1, Chandrayaan-3, SLIM (dates the teams reported) | Within **0.4 days** for all three | `npm test` |
| Year-long sunlight map, south pole | NASA Goddard PGDA average visibility, 120 m (Mazarico et al. method) | Correlation **r = 0.92**, mean difference 4.2 percentage points over 24,344 cells | *Add 20 m terrain and check against NASA PGDA* workflow; `public/data/pgda_check.json` |
| Year-long Earth-in-view map | NASA PGDA Earth visibility, 120 m | **r = 0.975**, mean difference 4.7 points | same |
| Sunlight at the Shackleton connecting ridge | NASA PGDA | Ours **66%** of 2027 with 20 m terrain vs PGDA **68%** (79% with our 240 m grid) | same |
| 20 m terrain tiles | Our 240 m LOLA grid (1 km beyond it) | Mean height difference **2.0–3.6 m** at every tile | same |
| Real shadows | LROC NAC controlled mosaic of the Peak Near Cabeus B Artemis III region, 8 images on 18 Sep 2017 | **93%** of 103,569 40 m cells agree (Cohen's κ **0.86**) with 20 m terrain; 88% (κ 0.76) with the 240 m grid. Almost every miss is a cell we call lit that is dark in the photo, along shadow edges: our shadows run slightly short | *Check shadows against an LROC photo* workflow |
| Flight burns | Apollo 11 | Leaving Earth orbit 3.16 vs 3.18 km/s; lunar orbit insertion 0.93 vs 0.94; descent 2.01 vs 2.06 | `npm test` (test/flight.spec.js) |
| Flight timelines | Apollo 11, IM-1, Chandrayaan-3, Blue Ghost M1, SLIM | Launch-to-landing time within a factor 0.55–1.6 of flown for the matching route | `npm test` |
| Launch time from the pad | Apollo 11 from Kennedy | Ours 15:40 UTC vs flown 13:32 UTC (2.1 h late; tested to under 3 h) | `npm test` |

## 2. Error budget

How big each source of error is, and what it does to the answers.

| Source | Size | Effect on the answer |
|---|---|---|
| Ephemeris (astronomy-engine, IAU lunar rotation) | ≤ 0.005° | None you can see: 1/100 of the Sun's width. |
| Terrain resolution: 240 m / 1 km grids | Ridges and crests are smoothed by tens of metres | At crests, sunlight shares can be **10–20 points too high** (ridge: 79% at 240 m vs 66% at 20 m). Craters and flat ground change by under 1 point. This is the dominant error, which is why we use 20 m tiles near the main south-polar sites and the Artemis III regions. |
| Terrain resolution: 20 m tiles | LOLA tracks are interpolated between shots; NASA's 5 m products quote 0.3–0.5 m RMS height error | Matters only within a few hundred metres of where the Sun or Earth grazes the skyline. |
| Sun as a disk vs a point | The Sun is 0.53° wide | We count "Sun up" when any part of the disk is up (window summaries) or its centre (year maps). The two differ by a few points at grazing sites. NASA PGDA reports the visible fraction of the disk. |
| Mast height | 2 m by default (settings) | Matters only at grazing sites, where a taller mast sees over nearby rises; change it in the spacecraft settings to test. |
| Time sampling | 20 min to 4 h steps by window length; 6 h for the year maps | Event times (sunrise, Earthset) are good to about half a step; the Lumi "when is sunset" search refines to ~30 s. |
| Region centres | Artemis III regions are 20 × 20 km (Mons Mouton Plateau ~66 km) | A centre is one point. Lighting changes a lot within a region; test spots inside the outline. |
| Flight model (patched conics) | Δv within ~0.05–0.1 km/s of Apollo 11; launch time within a few hours | Good for comparing routes and dates; not for navigation. The low-energy route is a typical transfer, not an optimised trajectory. |

## 3. What this tool is not

- Not mission-certified. Final site and date decisions use NASA's own analyses
  at 5 m or finer, with uncertainty maps.
- No thermal model, no surface hazard map (boulders, slopes under 20 m), no
  relay satellites.
- Far-side sites have no direct Earth link; the tool reports that rather than
  modelling a relay.

## 4. Data and references

- LOLA terrain: NASA LRO LOLA (PDS); 20 m: Barker et al. 2023, LDEM_80S_20MPP_ADJ (NASA GSFC PGDA product 90).
- Illumination reference: Mazarico et al. 2011, Icarus 211; PGDA AVGVISIB products.
- Artemis III region outlines: McClernan 2024, USGS data release doi:10.5066/P1MEQ6UK (from LROC QuickMap).
- LROC mosaic: Henriksen et al. 2023, European Lunar Symposium; NASA/GSFC/Arizona State University.
- Apollo landing sites: Wagner et al. 2017, Icarus 283.
- Ephemeris check: NASA JPL Horizons.
