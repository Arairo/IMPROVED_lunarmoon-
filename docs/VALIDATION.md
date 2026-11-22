# How far the numbers can be trusted

Lunar Site Planner is a planning tool. This page lists every independent check
we run, what it found, and the error budget that follows from it. Every check
is automated, so you can re-run it with the tests or a GitHub workflow.

## 1. Checks against independent sources

| What | Against | Result | Re-run |
|---|---|---|---|
| Sun and Earth positions seen from the surface | NASA JPL Horizons, 154 site/time pairs (11 sites × 7 dates from 1969 to 2030 × Sun and Earth; widened from 48 on 21 Nov 2026) | Worst elevation difference **0.007°** (0.0067°, Sun at Apollo 11 in 1969), median 0.001°, worst azimuth 0.02° (the Sun's disk is 0.53° wide) | *Validate against JPL Horizons* workflow; `public/data/validation.json` |
| Sun height at landing | Five Apollo landings (mission reports) | All within **0.35°**: Apollo 11 −0.10°, 12 +0.04°, 14 +0.04°, 15 −0.18°, 17 +0.35° | `npm test` (test/flown.spec.js) |
| Local sunset | Blue Ghost M1, Chandrayaan-3, SLIM (dates the teams reported) | Within **0.4 days** for all three | `npm test` |
| Year-long sunlight map, south pole | NASA Goddard PGDA average visibility, 120 m (Mazarico et al. method) | Correlation **r = 0.92**, mean difference 4.0 percentage points over 24,344 cells. Ours averages 33.3% vs PGDA 31.5%: about 2 points sunnier (3 points before the 22 Nov 2026 rebuild with the app's ray-caster and crest refinement; r unchanged). Map from `tools/build_map_layers.mjs`, skyline in 72 directions | *Add 20 m terrain and check against NASA PGDA* workflow; `public/data/pgda_check.json` |
| Year-long Earth-in-view map | NASA PGDA Earth visibility, 120 m | **r = 0.97** (0.971; 0.975 before the rebuild), mean difference 5.0 points. Ours averages 1.8 points below PGDA: we count Earth's centre, PGDA the visible fraction of its 2°-wide disc, so higher (more accurate) skylines lower ours further | same |
| Like for like with NASA PGDA (same quantities) | PGDA average visibility, 120 m: visible **fraction** of the Sun's disk, Earth counted when **any part** of its disk is up, averaged over an 18.6-year nutation cycle | Computed the same way (cycle from 2009): sunlight map **r = 0.92**, mean difference 3.8 points (ours +1.5); Earth map **r = 0.977**, mean difference 4.6 points (ours +2.3). At sites with 20 m terrain, Earth agrees within ~1 point at most sites (Haworth 44.1% vs 43.9%, Nobile 29.9% vs 29.9%, IM-2 93.9% vs 93.6%). On crests sunlight falls as terrain gets finer: Malapert Massif 19.9% (our 20 m) vs 28.2% (PGDA 60 m) vs 38.1% (PGDA 120 m); Best-lit #2 64.0% vs 68.0% vs 79.7% | *Add 20 m terrain and check against NASA PGDA* workflow (`tools/pgda_like_for_like.mjs`); `pgda_check.json` → `likeForLike` |
| Sunlight at each south-polar site, against PGDA's finest map there | PGDA average Sun visibility at 60 m (85° S product) where it covers the site, else 120 m | Over 22 sites: median difference **1.2 points**, worst 8.1 (no site over 10). Against the 120 m map only: median 1.6, worst 16.5 (Malapert Massif), because finer terrain lowers sunlight on crests. Ours: Sun's centre, 2027, our finest terrain at the site (20 m where tiled). Record: `docs/validation/pgda.json` | `tools/validation_records.mjs` from `pgda_check.json` |
| Sunlight at the Shackleton connecting ridge | NASA PGDA | Ours **64%** (63.6%) of 2027 with 20 m terrain vs PGDA **68%** (74% with our 240 m grid). Until 21 Nov 2026 this read 66% / 79%: the skyline ray-caster could step over the crest that hides the Sun (section 3). PGDA's figure is a multi-year average of the visible *fraction of the disk*; ours is the disk *centre* in 2027, which reads lower at a site where the Sun grazes the skyline | same; site rows recomputed with `tools/refresh_pgda_site_shares.mjs` |
| 20 m terrain tiles | Our 240 m LOLA grid (1 km beyond it) | Mean height difference **2.0–3.6 m** at every tile | same |
| Real shadows | LROC NAC controlled mosaic of the Peak Near Cabeus B Artemis III region, 8 images on 18 Sep 2017 | **93.2%** of 103,587 40 m cells agree (Cohen's κ **0.865**) with 20 m terrain; 88.6% (κ 0.774) with the 240 m grid (re-run 21 Nov 2026 after the ridge-crest refinement; before it: 93.0% / κ 0.86 and 87.7% / κ 0.76). Almost every miss is a cell we call lit that is dark in the photo, along shadow edges: our shadows run slightly short. Split by kind (20 m): of the cells the photo shows **dark**, we call **12.3% lit** (7,008 of 56,851); of the cells it shows **lit**, we call **0.07% dark** (35 of 46,736). With 240 m: 20.8% and 0%. So the tool errs towards too much sunlight, never towards too little. | *Check shadows against an LROC photo* workflow |
| Flight burns | Apollo 11 | Leaving Earth orbit 3.16 vs 3.18 km/s; lunar orbit insertion 0.93 vs 0.94; descent 2.01 vs 2.06 | `npm test` (test/flight.spec.js) |
| Flight timelines | Apollo 11, IM-1, Chandrayaan-3, Blue Ghost M1, SLIM | Launch-to-landing time within a factor 0.55–1.6 of flown for the matching route | `npm test` |
| Launch time from the pad | Apollo 11 from Kennedy | Ours 15:40 UTC vs flown 13:32 UTC (2.1 h late; tested to under 3 h) | `npm test` |

## 2. Error budget

How big each source of error is, and what it does to the answers.

| Source | Size | Effect on the answer |
|---|---|---|
| Ephemeris (astronomy-engine, IAU lunar rotation) | ≤ 0.007° | None you can see: 1/100 of the Sun's width. |
| Skyline sampling (ray steps, 2° azimuth storage) | Up to 0.9° on one skyline; typically under 0.2° | Yearly sunlight share within **0.2 points**, Earth within **0.1 points** of a 4× finer computation on the same terrain (section 3). Before 21 Nov 2026 (no crest refinement) up to 2.8 points too sunny. |
| Terrain resolution: 240 m / 1 km grids | Ridges and crests are smoothed by tens of metres | At crests, sunlight shares can be **10–20 points too high** (ridge: 74% at 240 m vs 64% at 20 m). Craters and flat ground change by under 1 point. This is the dominant error, which is why we use 20 m tiles near the main south-polar sites and the Artemis III regions. |
| Terrain resolution: 20 m tiles | LOLA tracks are interpolated between shots; NASA's 5 m products quote 0.3–0.5 m RMS height error. Coverage: all nine Artemis III candidate regions (64 tiles of 16 km) plus 12 other sites; one tile at the northern edge of Haworth (centre x −40 km, y 104 km) was not produced in the November 2026 run, so that 1–2 km strip uses the 240 m grid. Each tile is checked against the coarser grid: median 2.8 m mean difference; 9 tiles beyond the 240 m grid differ by 9–24 m from the smoother 1 km grid | Matters only within a few hundred metres of where the Sun or Earth grazes the skyline. |
| Sun as a disk vs a point | The Sun is 0.53° wide | We count "Sun up" when any part of the disk is up (window summaries) or its centre (year maps). The two differ by a few points at grazing sites. NASA PGDA reports the visible fraction of the disk. |
| Mast height | 2 m by default (settings) | Matters only at grazing sites, where a taller mast sees over nearby rises; change it in the spacecraft settings to test. |
| Time sampling | 20 min to 4 h steps by window length; 6 h for the year maps | Event times (sunrise, Earthset) are good to about half a step; the Lumi "when is sunset" search refines to ~30 s. |
| Energy and battery sums | Rectangle sums at the window's time step | Against 5-minute sampling: energy within 0.1% at 30-minute steps and 0.5% at 4-hour steps; battery within 1% (`test/models.spec.js`). |
| Battery model | Constant load (120 W default), 95% charge and 95% discharge efficiency (assumed, settable) | "Battery needed" is the deepest energy shortfall including those losses, about 5% more than the bare deficit. No temperature, ageing, voltage or depth-of-discharge limits: an energy estimate, not a battery design. A battery of a chosen size can be simulated (`batteryWh`): state of charge, hours below reserve, hours empty. |
| Solar array | 2 m², 29% cells, mast-mounted and turning to face the Sun (defaults, settable) | Beginning-of-life efficiency; no temperature, dust or ageing losses, so power reads high for an old or hot array. |
| Radio link | First-order budget: free-space loss, fixed 2 dB other losses, up to 6 dB at grazing | Says whether a link *could* close on paper. Pointing error, Earth weather at the station, Doppler and DSN scheduling are not modelled; "direct link" time is not a booking. |
| Region centres | Artemis III regions are 20 × 20 km (Mons Mouton Plateau ~66 km) | A centre is one point. Lighting changes a lot within a region; test spots inside the outline. Example: the Malapert Massif centre sits on a ~4° slope, so with 20 m terrain it sees the Sun 22% of 2027, against 38% in NASA's 120 m map and 43% with our coarser grid, which both smooth the slope away. |
| Flight model (patched conics) | Δv within ~0.05–0.1 km/s of Apollo 11; launch time within a few hours | Good for comparing routes and dates; not for navigation. The low-energy route is a typical transfer, not an optimised trajectory. Each burn is labelled *computed* (orbital mechanics), *assumed* (a fixed allowance: course corrections; low-energy launch energy and arrival speed) or *rule of thumb* (powered descent = perilune speed × 1.12 + 0.1 km/s, calibrated to Apollo 11). |

### Kinds of uncertainty (and which ones the app reports)

These are different things and the app keeps them apart:

| Kind | What it means | Reported? |
|---|---|---|
| Positional sensitivity | How much the answer changes if the lander sets down a little elsewhere: the What if step and the report show the same 30 days at the site and 250 m north, south, east and west | Yes, as a range. It is **not** an error bar or a confidence interval |
| Terrain uncertainty | Errors in LOLA heights, grid size and interpolation | Not quantified per site. Grid size at the site is shown (terrain quality); sampling effects are measured (section 3) |
| Model uncertainty | Simplifications: Sun's centre vs disk, no thermal or dust model, simple link budget, patched-conic flights | Not quantified; listed in the table above and in exported assumptions |
| Input uncertainty | Your spacecraft settings (array, load, battery efficiency, radio) | Not quantified; change the settings to see the effect |
| Reference / validation error | Observed differences against independent data (JPL, PGDA, LROC) | Yes, in section 1 and `docs/validation/`, for the sites and dates tested only |

The JSON report carries the same split under `uncertainty`.

## 3. Horizon sampling convergence

The skyline is found by marching rays outward over the LOLA grids. Steps start at
half a grid cell and grow to 1.5% of the distance (1.5 km at 100 km), so far-off
crests can fall between two samples. Since 21 Nov 2026 each ray re-samples the
stretch either side of its highest sample at half the local grid cell
(`RAY_REFINE` in `src/core/horizon.js`).

We compared each setting with a much finer computation on the same terrain
(skyline every 0.25°, steps 0.3% of the distance, refined) at the 19 sites south
of 84° S, counting the Sun's and Earth's centre above the skyline every 2 hours
through 2027 (numbers from 21 Nov 2026; `test/horizonSampling.spec.js` repeats the check for two sites on every test run):

| Setting | Worst sunlight error | Mean | Worst Earth error | Worst skyline error | Time per site |
|---|---|---|---|---|---|
| Shipped before (0.5° rays stored every 2°, no refinement) | 2.79 points | 0.25 | 1.32 | 1.9° | 0.13 s |
| 0.5°, steps 0.5% of distance, no refinement | 2.74 | 0.22 | 1.32 | 1.9° | 0.30 s |
| 0.25°, no refinement | 2.76 | 0.24 | 1.32 | 1.9° | 0.25 s |
| **Shipped now** (0.5° rays, refined, stored every 2°) | **0.18** | 0.02 | **0.09** | 0.86° | 0.13 s |
| 0.5°, refined | 0.07 | 0.01 | 0.05 | 0.89° | 0.12 s |
| 0.25°, refined | 0.02 | 0.00 | 0.05 | 0.04° | 0.22 s |

Finer steps alone hardly help; refining around the crest does. A crest narrower than the ray step that no sample touches can still be missed; on real LOLA grids (which smooth features to at least two cells) the table above bounds the effect. Rays also no longer stop at the first stretch without data: they skip gaps of up to 30 km. The largest
changes were at the Shackleton connecting ridge (66.4% → 63.6% with 20 m
terrain), Best-lit #3 (51.0% → 49.8%) and, on the 240 m grid, Peak Near Cabeus B
(43.8% → 35.5%): part of what looked like a 240 m-vs-20 m difference there was
the ray steps. Craters and flat ground did not change.

Rebuilt with refinement (22 Nov 2026): every site skyline (sites north of
80° S by *Build global terrain*, skyline changes at most 0.5°), the year-long map
layers (which now use the app's ray-caster instead of their own coarser one;
south-cap average sunlight 36.8% → 36.0%) and the 1 km south-pole map. The LROC
shadow check was re-run too: agreement rose at both resolutions (section 1).

Each horizon result now carries a `quality` record (grid size at the site and
farther out, largest ray step, azimuth spacing, refinement, method) and a tier:
`fine` (20 m at the site), `standard` (240 m / 1 km / global grid), `coarse`
(a 5 km grid used only before the detailed terrain has loaded) or `none` (smooth
sphere: no terrain). Coarse and no-terrain results are flagged in the app and in
exported reports.

### Azimuth spacing

How much do the results depend on how often the skyline is sampled around the
compass? For the 19 listed sites south of 84° S (including seven Artemis III
region centres), each setting is compared with a reference sampled every 0.25°
with five times finer ray steps, on the same terrain, every 2 hours through 2027
(`tools/azimuth_resolution.mjs`, record in `docs/validation/azimuth-resolution.json`).
"False lit" is the share of time steps a setting calls the Sun's centre up when
the reference has it hidden; "false shadowed" the reverse.

| Setting | Worst sunlight error, points | Worst Earth error, points | Worst false lit | Worst false shadowed | Worst skyline error |
|---|---|---|---|---|---|
| Rays every 2°, refined | 0.19 (mean 0.03) | 0.09 | 0.3% | 0.14% | 0.86° |
| Rays every 1°, refined | 0.05 (mean 0.01) | 0.04 | 0.14% | 0.09% | 1.34° |
| Rays every 0.5°, refined | 0.06 (mean 0.01) | 0.04 | 0.09% | 0.02% | 0.89° |
| Shipped: rays every 0.5°, refined, stored every 2° | 0.19 (mean 0.03) | 0.09 | 0.3% | 0.14% | 0.86° |

Rays every 1° are as good as every 0.5° for these yearly shares; storing the
skyline every 2° (as the app does, to keep the download small) adds up to about
0.2 points. The skyline error is the largest single-azimuth difference: narrow
spikes between samples barely change how long the Sun is up. This measures the
sampling only: the terrain itself is checked against NASA data in section 1. The
DEM cell size (20 m, 240 m, …) and the ray step along each ray are different things:
rays start at half a cell and grow to 1.5% of the distance (largest step recorded
in each skyline's `quality` record).

### Time sampling and totals

Every window is sampled at fixed steps (20 min for 15 days, 30 min for 30 days,
90 min for 90 days, 4 h for a year; Terrain 3D uses 10 min to 3 h). Each sample
stands for the time until the next one, and the last one only until the end of
the window. Energy, average power, the battery estimate, the sunlit / Earth-in-view
shares and the longest dark or blackout spell all add up those actual durations, so
they always cover exactly the window you chose.

Until 22 November 2026 the last sample was always counted as a full step, so a
window that was not a whole number of steps was slightly overcounted (a 25-hour
window at 4-hour steps was integrated as 28 hours). None of the app's standard
windows were affected (they are whole numbers of steps), so no published number
changed; `test/scanIntervals.spec.js` checks divisible, non-divisible, shorter-than-
one-step and very short windows against an independent sum.

## 4. What this tool is not

- Not mission-certified. Final site and date decisions use NASA's own analyses
  at 5 m or finer, with uncertainty maps.
- No thermal model, no surface hazard map (boulders, slopes under 20 m), no
  relay satellites.
- Far-side sites have no direct Earth link; the tool reports that rather than
  modelling a relay.

## 5. Data and references

- LOLA terrain: NASA LRO LOLA (PDS); 20 m: Barker et al. 2023, LDEM_80S_20MPP_ADJ (NASA GSFC PGDA product 90).
- Illumination reference: Mazarico et al. 2011, Icarus 211; PGDA AVGVISIB products.
- Artemis III region outlines: McClernan 2024, USGS data release doi:10.5066/P1MEQ6UK (from LROC QuickMap).
- LROC mosaic: Henriksen et al. 2023, European Lunar Symposium; NASA/GSFC/Arizona State University.
- Apollo landing sites: Wagner et al. 2017, Icarus 283.
- Ephemeris check: NASA JPL Horizons.
