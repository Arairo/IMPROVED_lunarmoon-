# Second audit: baseline and Phase 1

The roadmap in `LUNAR_SITE_PLANNER_SECOND_AUDIT_AND_PRODUCT_ROADMAP.md` (22 November 2026)
was written from a source review without running anything. Each finding was checked
against the code on branch `claude/nice-mccarthy-mumgen` before changing it.

## Baseline (before Phase 1 changes)

| Item | Result |
|---|---|
| Runtime | Node 22.23.5, npm 10.9.9 |
| Resolved versions (lockfile) | Vite 8.3.8 (Rolldown 1.2.19), CesiumJS 1.138.0, Three.js 0.187.0, astronomy-engine 2.1.19, Tailwind 3.4.17 |
| `npm test` | 95 passed, 0 failed |
| `npx vite build` | succeeds |
| Browser smoke test (`test/smoke-e2e.cjs`, production build) | 9 of 9 journeys passed |
| `npm audit` (all, and `--omit=dev`) | 0 vulnerabilities |
| Generated (not hand-edited) files | `public/data/*` from the data workflows and `tools/`; `public/data/manifest.json` from `tools/build_manifest.mjs`; `src/data/precomputedHorizons.*` from `tools/build_site_horizons.mjs` |

## Findings checked

| Roadmap item | Status on checking | Evidence |
|---|---|---|
| 5.1 Deploy after a failed or cancelled upstream workflow | **Already fixed** (21 Nov 2026) | `.github/workflows/deploy.yml`: the build and browser jobs require `workflow_run.conclusion == 'success'` and `head_branch == 'main'`; deploy needs both jobs and runs only for `refs/heads/main`, never for pull requests. Nothing is downloaded from the upstream run: the deploy job builds from a fresh checkout of `main`, which already contains the data commit. Now locked in by `test/deployGate.spec.js`. |
| 5.2 Production-build browser tests in CI | **Already present; extended** | The `browser` job in `deploy.yml` builds, serves with `vite preview` and runs `test/smoke-e2e.cjs`, and deploy needs it. Added: both pages (`index.html`, `planner.html`) at desktop and phone sizes must load their JS, CSS, fonts and data with no console errors, uncaught exceptions or failed requests for the site's own files; a Terrain 3D round trip journey. |
| 5.3 `scan()` final interval past `endMs` | **Confirmed and fixed** | The last sample always counted a full step (25 h at 4 h steps integrated 28 h). Now each sample counts until the next one, the last only until `endMs`; all totals use those durations. The app's standard windows are whole numbers of steps: 360 statistics compared before and after (6 sites × 4 windows) are identical. Tests: `test/scanIntervals.spec.js`. Described in `docs/VALIDATION.md` ("Time sampling and totals"). |
| 5.4 Dependency and dev-server security | **Checked, nothing open** | See the 22 Nov 2026 entry in `SECURITY.md`. |
| 6.1 Terrain convergence | Covered for 0.5° rays stored every 2° (docs/VALIDATION.md §3); 1° and 2° ray spacing comparison is Phase 2 | |
| 6.2–7.2 | Phase 2–3, not started | |

## Other issues found and fixed along the way

- Terrain 3D used its own saved spacecraft settings rather than the Professional
  plan's, so the two pages could show different power and battery numbers for the
  same site. Opened from Professional mode it now uses (and hands back) that plan's
  settings; checked in the browser test.
- A dark-theme rule painted every `<input>`, which hid the coloured phase bar of the
  flight timeline behind a grey box.
- Terrain 3D's Sun and Earth rays are now checked against the engine's azimuth and
  elevation with Cesium's own coordinate formula (`test/terrain3dGeometry.spec.js`;
  the test fails on a flipped longitude or pole).

## Phase 1 results

Commands run on 22 November 2026 (production build served by `npx vite preview --port 4302`):

| Command | Result |
|---|---|
| `npm test` | 109 passed, 0 failed |
| `npx vite build` | succeeds |
| `node test/smoke-e2e.cjs http://localhost:4302/` | 13 of 13 passed (incl. both pages at desktop and phone size: JS, CSS, fonts and data loaded, no console errors or failed requests) |
| `node test/browser-e2e.cjs http://localhost:4302/planner.html` | 42 of 42 passed (a first run lost its browser part-way, while other jobs shared the machine; re-run alone) |
| `npm audit` / `npm audit --omit=dev` | 0 vulnerabilities |

## Phase 2: scientific reliability (22 Nov 2026)

| Roadmap item | What was done | Evidence |
|---|---|---|
| 6.1 Azimuth resolution and convergence | Skylines cast every 2°, 1°, 0.5° and as shipped, compared with a 0.25° reference at 19 sites through 2027, counting false lit / false shadowed time | `tools/azimuth_resolution.mjs`, `docs/validation/azimuth-resolution.json`, `docs/VALIDATION.md` §3. Shipped: worst 0.19 sunlight points, 0.3% of time steps falsely lit, 0.14% falsely shadowed; no site over 0.5 points |
| 6.1 Resolution disclosed | Each skyline's `quality` record (DEM cell at the site and far away, largest ray step, azimuth spacing, refinement) is shown in the Check step ("How this was worked out") and exported | `src/core/horizon.js` `horizonQuality`; report JSON `site.terrainQuality` |
| 6.2 Validation records | One JSON per check with commit, dataset hash, settings, error distribution and failed cases; JPL recomputed with the current code | `tools/validation_records.mjs`, `docs/validation/`, `test/validationRecords.spec.js`. Data workflows now record their commit |
| 6.2 Re-run after data changes | LROC shadow check re-run with the 20 m region tiles (its fetch script had to stop reading a tile that no longer exists) | 93.5% agreement, κ 0.870 (was 93.2% / 0.865) |
| 6.3 Kinds of uncertainty | The 250 m range is labelled positional sensitivity, not an error bar; report and JSON list terrain, model, input and reference uncertainty separately, saying which are not quantified | `docs/VALIDATION.md` "Kinds of uncertainty"; JSON `uncertainty` |
| 6.4 Power and battery | Illustrative Nominal / Conservative / Degraded settings (labelled, editable battery efficiency); tests for energy conservation, limits with losses, and that the worse scenarios never look better | `POWER_SCENARIOS` in `src/core/power.js`; `test/powerCommsEdges.spec.js` |
| 6.5 Communications | Tests: grazing loss at the clearance limit and at 0°, DSN mask boundary, partly visible Earth is not line of sight, `scheduled` stays `null` | `test/powerCommsEdges.spec.js` |
| 6.6 Flight | Claims reviewed: the model already labels each burn computed / assumed / rule of thumb and lists what it leaves out; no wording found that implies navigation-grade results | `src/core/flight.js` `flightModelInfo` |

New finding: against NASA PGDA's *finest* map at each site (60 m where it covers
the site), our site sunlight differs by a median 1.2 points (worst 8.1); against
the 120 m map only, worst 16.5. Mixing resolutions exaggerated the differences.

## Phase 3: data and product experience (22 Nov 2026)

| Roadmap item | What was done |
|---|---|
| 7.1 Manifest | Each dataset has a content version, coordinate reference, horizontal and vertical datum, and its generation date and pipeline commit where the generator recorded them (`"not recorded"` otherwise; never guessed) |
| 7.2 Exports | JSON: build version and commit, datasets, coordinates and frame, window, sampling step and integration rule, all settings, the matching example scenario, uncertainty kinds, validation references. CSV header states how rows add up |
| 8.1 First visit | The landing page already says what the tool is and offers two ways in after Start; the trust chips now say how it is checked and open About |
| 8.2 Summary → evidence → assumptions → detail | Check step: screening result, then the evidence lines, then an "Assuming …" line with Change, then "How this was worked out" folded away |
| 8.3 Suitability wording | GO / GO WITH CARE / NO GO kept (familiar, used in Beginner) but labelled a screening at touchdown with your settings, with what each means ("Favourable under these assumptions", "Possible, but limited: further analysis needed", "Not favourable in this scenario"); never a landing approval |
| 8.4 Two levels | Beginner and Professional use the same engine and the same rules (`verdicts` in `src/experience/walk.js`) |
| 8.5–8.6 Design and accessibility | Report opens as a column beside the Moon (the view shrinks, nothing is covered); axe: 0 violations on eight views (`docs/ACCESSIBILITY.md`) |

## Phase 4: performance and hosting (22 Nov 2026)

| Roadmap item | What was done | Evidence |
|---|---|---|
| 9.1 Repeatable baseline | `test/perf-baseline.cjs`: desktop and throttled-phone profiles, cold cache; transfer, FCP, LCP, CLS, time until usable, slowest click response, 20 m tile downloads, heap; conditions recorded | `docs/perf-baseline-2026-11-22.json`, `docs/PERFORMANCE.md` |
| 9.2 Justified optimisations only | Layout shift (all pages now ≤ 0.04, landing and Beginner 0); Terrain 3D first numbers on the phone profile 18.2 s → 3.9 s (grids in parallel, precomputed skylines first) | same; Terrain 3D browser test 42/42 after the change |
| 9.3 Hosting | Stay on GitHub Pages: the costs are downloads and in-browser drawing, which another static host would not change; a fair multi-region comparison is not possible from this setup | `docs/PERFORMANCE.md` "Hosting decision", `docs/HOSTING.md` |

Open: real-device checks (the first hover after Start redraws slowly under software
WebGL), and Core Web Vitals from real users in several regions.

## Final checks (22 Nov 2026)

| Command | Result |
|---|---|
| `npm test` | 117 passed |
| `node test/smoke-e2e.cjs` (production build) | 13 of 13 |
| `node test/browser-e2e.cjs …/planner.html` | 42 of 42 |
| axe, WCAG 2.1 AA, eight views | 0 violations |

## Third review (ChatGPT, 23 Nov 2026): immediate corrections

| Item | Status on checking | What was done |
|---|---|---|
| P0 scan/battery durations incompatible | **Already fixed** in the second audit (`simulateBattery` takes one duration per sample since 22 Nov; `main` includes it) | Tightened: durations must be finite and positive (Infinity was accepted); tests for scalar, varying and invalid durations (`test/scanIntervals.spec.js`) |
| P1.1–1.2 Browser tests on the deployed artifact and base path | Confirmed: the browser job built its own copy at `/` | One job now builds with `BASE_PATH=/<repo>/`, serves that `dist` under the same path, runs the smoke test, and only then uploads it to Pages (`test/deployGate.spec.js` checks the order) |
| P1.3 Audit development dependencies | Missing | `npm audit --audit-level=high` (all dependencies) added next to the runtime-only audit; 0 vulnerabilities today |
| P1.4 Non-divisible custom window | Covered by unit tests; added one through `scanWindow` (7.3 days at 20 min steps) | |
| P1.5 Both interfaces after the scanner fix | Smoke test 13/13 under the Pages base path (Beginner, Professional, Terrain 3D, phone) | |
| P2.1 Low-energy flight schematic | The path was drawn without saying so | "Schematic path" label in the flight caption during the low-energy coast, and in the model note |
| P2.2 "Good to hours" claim | Overstated for whole timelines | Measured: given Apollo 11's own timings, burns within 19/14/45 m/s and launch within 2.1 h; with default settings, trip lengths 0.2–9.5 days from five flown missions. Wording in the app, `src/core/flight.js` and VALIDATION.md now says exactly this. The note also wrongly said the launch site changes nothing (it moves launch time by up to 6.6 h, trip by ~0.3 d, fuel by ~5 kg) |
| P2.3 Near-threshold warnings | Missing | "Close to the line" in the Check step, report and JSON when the Sun's or Earth's centre is within 0.5° of the skyline, Earth within 0.5° of the wanted clearance, or sunset/earthset within 12 h of the 7-day / 3-day rules |
| P2.4 Terrain resolution visible | Shown only when coarse | One line under every Check result ("Terrain at the site: NASA LOLA 20 m …; skyline every 2°") and a row in the report |

Found while checking: dragging the flight timeline slider always jumped back to the
start (introduced 21 Nov 2026 with the flight-pacing change: `stop()` reset the slider
before the handler read it). Fixed, and the smoke test now drags it.
