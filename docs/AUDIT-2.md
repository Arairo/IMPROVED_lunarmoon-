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

See the end of this file's commit for exact commands; summary:

| Check | Result |
|---|---|
| `npm test` | 109 passed, 0 failed |
| `npx vite build` | succeeds |
| `node test/smoke-e2e.cjs` (production build) | being re-run with the new entry-point checks |

Phase 2 (scientific reliability) has not been started.
