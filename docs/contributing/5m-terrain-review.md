# 5 m terrain: review of the fork and what is needed before it can be merged

For: Pratyush (fork `27coder/IMPROVED_lunarmoon-`, commits `bbcaaad` and `e41743c`, 22 Nov 2026)
From: Ammar (project owner), with a review done by reading the code, checking NASA's pages and measuring on the current data.
Use: give this whole file to your coding assistant together with the repository. Everything it needs to know is here.

---

## 0. TL;DR

The idea is good: NASA's 5 m south-pole terrain (four times finer than our 20 m tiles) is a real upgrade and fits the project's terrain-resolution study. **But the fork can't be merged as it is**:

1. It breaks CI: 86 of 180 checksums in `public/data/manifest.json` don't match the files (rebuilt on Windows with CRLF line endings).
2. It would never download any 5 m data: both NASA URLs are wrong (missing folders), and 7 of the 9 site-to-file matches point at the wrong place on the Moon.
3. It credits 5 m terrain in the app before any 5 m data exists.
4. It changes the ground slope the app shows (4 of 22 polar sites change label) without a test, evidence or note.
5. Smaller: shell injection pattern in the workflow, a mislabelled LROC "5 m" result, no new tests, nothing stops a mostly-empty tile from being labelled 5 m.

Please redo it on a fresh branch from the latest `main`, following sections 3–7, and open a pull request to `Arairo/IMPROVED_lunarmoon-`. CI must be green.

---

## 1. Project context (read first)

**What the app is.** Lunar Site Planner (live: https://arairo.github.io/IMPROVED_lunarmoon-/) answers: will a lander at this lunar site and date get sunlight for power and Earth in view for radio? It runs entirely in the browser (Vite, vanilla JS, Three.js, CesiumJS for "Terrain 3D"). There is no server. Citable release: DOI 10.5281/zenodo.24435109.

**How terrain is used.**
- `src/core/horizon.js` casts rays outward in every direction over terrain grids to find the skyline (the horizon elevation at each azimuth). `createTerrain()` combines grids finest-first; `heightAt(lat, lon)` returns `{ height, cell }` from the finest grid that covers a point.
- Grids, finest first: 20 m tiles (`public/data/hires/*.i16z`, PGDA product 90, Barker et al. 2023), the 240 m and 1 km south-polar grids (`sp_fine`, `sp_coarse`), and the global LDEM_16 grid.
- The 20 m tiles are a 16 km grid covering all nine Artemis III candidate regions, plus a 16 km tile around each other south-polar site. Their files are packed losslessly (`src/core/tileCodec.js`: each value minus the one above, then gzip). Metadata: `hires/<id>.json` and `hires/index.json`.
- In the browser, a site's tiles are fetched on demand (`hiresTilesFor` / `addHiresTileTo` in `horizon.js`); listed sites use precomputed skylines (`src/data/precomputedHorizons.json`, built by `tools/build_site_horizons.mjs`).
- Projection everywhere: south polar stereographic on a sphere of radius 1737.4 km, x/y in metres, heights in metres above 1737.4 km. Row 0 at +y, column 0 at −x.

**Data pipeline (runs in GitHub Actions, because the dev sandbox can't reach NASA).**
- `.github/workflows/pgda.yml` ("Add 20 m terrain and check against NASA PGDA"): GDAL container → `tools/pgda_fetch.py` reads only the needed windows from NASA GeoTIFFs (`/vsicurl/`) → `tools/build_hires_terrain.mjs` checks each window against our 240 m / 1 km grids (orientation, units, mean height difference), packs it and writes `hires/index.json` → like-for-like comparison with NASA's illumination maps → `tools/build_site_horizons.mjs --only-hires` → `tools/build_manifest.mjs` → `npm test` → commit.
- `.github/workflows/probe-nasa-data.yml`: reads NASA pages/files and prints them (changes nothing). Use it to check URLs (`mode: head` runs `gdalinfo`).
- `.github/workflows/lroc-check.yml`: compares predicted shadows with LRO photos (`tools/lroc_fetch.py`, `tools/lroc_shadow_check.mjs`).

**Validation (the project's credibility depends on it).** `docs/VALIDATION.md` and machine-readable records in `docs/validation/*.json` (`tools/validation_records.mjs`, `tools/azimuth_resolution.mjs`). Current headline results: Sun/Earth positions within 0.007° of JPL Horizons (154 cases); south-cap sunlight map r = 0.92 vs NASA PGDA; site sunlight within a median 1.2 points of PGDA's finest map; LROC shadows 93.5% agreement (κ 0.870) with 20 m terrain.

**Project rules.**
- Plain, honest wording. Never claim "mission-grade", "certified" or more accuracy than a test shows. Say what was measured and how.
- Every scientific change needs a test and a line in `docs/VALIDATION.md`. Don't change numbers the app shows without evidence.
- `npm test`, `npx vite build`, the browser smoke test and (for Terrain 3D changes) the long browser test must pass. CI runs them.
- Don't commit raw downloads (`data-raw/` is ignored). Don't commit secrets or personal details.
- Keep files with LF line endings.
- Tip: commit with your GitHub "noreply" email (GitHub → Settings → Emails) if you don't want your personal email in the public history.

---

## 2. What the fork does well (keep these)

- `tools/fetch_5m_spots.py`: reads only sub-windows with GDAL range requests, retries failed reads, writes the same `dem_<id>.f32/.json` format the packer expects.
- 5 m tiles get their own ids (`<site>_5m`), so they can't overwrite 20 m tiles with the same site id.
- `--keep` / `--append` in `build_hires_terrain.mjs` and the `windows.json` merge: tiles can be added without deleting the others.
- `tilesNear()` accepting a per-tile margin function.
- The LROC check gaining a 5 m tier (needs the fix in 4.6).
- `test/deployGate.spec.js` normalising CRLF so it passes on Windows.
- `tools/README.md` (add a macOS/Linux `$PWD` variant next to the Windows `%cd%` one).

---

## 3. Facts from NASA (checked 23 Nov 2026 through the probe workflow)

### Product 78: High-Resolution LOLA Topography for Lunar South Pole Sites (Barker et al. 2021)
- Page: https://pgda.gsfc.nasa.gov/products/78 · README: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README
- 5 m/pixel GeoTIFFs, south polar stereographic, metres, MOON_ME frame of DE421, sphere 1737.4 km. X/Y follow the "pixel-registered" convention (coordinates are pixel centres; GDAL's geotransform still gives the outer corner).
- **Each site is in its own folder.** Correct URL pattern:
  `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/<SITE>/<SITE>_final_adj_5mpp_surf.tif`
  Verified: `…/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif` is a real GeoTIFF, 3200 × 3200 px, 5 m, origin (−19000, −4000): a 16 × 16 km square.
  The fork's URL without the folder (`…/LOLA_5mpp/Site01_final_adj_5mpp_surf.tif`) returns an **HTML page with HTTP 200**, not a 404. Always check that the response is really a GeoTIFF (GDAL opens it, raster size and pixel size are as expected).
- Other files per site (useful for validation): `_toterr.tif` total height uncertainty (m, RMS), `_slp.tif` slope (°), `_slperr.tif` slope uncertainty (°), `_ldec.tif` LOLA shot count per pixel, and 100 "clones" (statistical realisations of the terrain).
- Stated accuracy: median RMS height error ~0.30–0.50 m, median RMS slope error ~1.5–2.5°. **About 90% of 5 m pixels are interpolated** (LOLA shots are sparser than 5 m), and interpolation error grows away from the pole. So "5 m" is the pixel size, not 5 m of measured detail everywhere. This must be said in the app and docs.
- Sites (as listed by NASA):

| NASA id | NASA name |
|---|---|
| Site01 | Connecting ridge |
| Site04 | Shackleton rim |
| Site06 | Nobile rim 1 |
| Site07 | Peak near Shackleton |
| Site11 | de Gerlache rim |
| Site20 | Leibnitz beta plateau (Site20v2: extended boundaries) |
| Site23 | Malapert massif |
| Site42 | de Gerlache-Kocher massif |
| Haworth | Haworth |
| Shoemaker | Shoemaker |
| DM1 | Amundsen rim |
| DM2 | Nobile rim 2 |
| SL2 | de Gerlache rim |
| SL3 | Connecting ridge extension |
| NPA | Cabeus exterior wall 1 |
| NPB | Amundsen 1 |
| NPC | Idel'son L crater 1 |
| NPD | Malapert crater 1 |
| LM1 | Shackleton Rim B |
| LM2–LM6, LM8 | Shoemaker Rim A–F |
| LM7 | Faustini Rim A |

### Product 81: South Pole LOLA DEM Mosaic, 87°S–90°S (Barker et al. 2021 method)
- Page: https://pgda.gsfc.nasa.gov/products/81
- **Correct URL:** `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/87S/ldem_87s_5mpp.tif` (the fork leaves out `87S/`; that URL returns HTML).
- Verified: 40000 × 40000 px, 5 m, origin (−100000, 100000): covers ±100 km around the pole. 3.47 GB, so read sub-windows only. Same sphere and projection.
- Built from 97 fields of 20 × 20 km with the Product 78 method, blended; typical RMS residual 30–55 cm against the individual fields.

### The fork's site matches, checked

| Our site id (src/data/sites.json) | Fork used | That file is actually | Use instead (verify coverage, 4.2) |
|---|---|---|---|
| ridge | Site01 | Connecting ridge ✓ | Site01 (or the 87S mosaic) |
| a3-ma | Site23 | Malapert massif ✓ | Site23 |
| peak-shackleton | Site06 | Nobile rim 1 ✗ | Site07, or the mosaic |
| degerlache | Site04 | Shackleton rim ✗ | the mosaic (the site is a crater centre) |
| a3-g2 | Site04 | Shackleton rim ✗ | SL2 or Site11 (de Gerlache rim), or the mosaic |
| haworth, a3-hw | Site11 | de Gerlache rim ✗ | `Haworth` |
| nobile, a3-n1 | Site20 | Leibnitz beta plateau ✗ | Site06 (Nobile rim 1) for a3-n1; check coverage for `nobile` (crater centre) |
| (not in fork) a3-n2 | | | DM2 (Nobile rim 2) |
| (not in fork) shoemaker | | | `Shoemaker` |
| best-1, best-2, shackleton | mosaic (wrong URL) | | the mosaic with the correct URL |

Don't trust a name match: pick the file by **coverage**, as in 4.2.

---

## 4. Required fixes

### 4.1 Line endings and the manifest (CI blocker)
- Add `.gitattributes` at the repo root:
  ```
  * text=auto eol=lf
  public/data/** -text
  *.i16z binary
  *.bin binary
  ```
  (`-text` stops Git converting the data files, so their checksums are the same on every OS.)
- Re-checkout (or `git rm --cached -r . && git reset --hard`) so files have LF, then run `node tools/build_manifest.mjs` and `node tools/build_manifest.mjs --check`.
- Acceptance: `npm test` passes, including `Data manifest: every file listed with the right size and SHA-256`.

### 4.2 Choosing the 5 m source by coverage, not by name
In `tools/fetch_5m_spots.py`:
- Keep a list of candidate sources: the 87S mosaic plus the Product 78 site files with the correct folder URLs (section 3).
- For each requested site: compute its polar-stereographic x/y (same formula as now), open each candidate with GDAL, and use its geotransform to test whether the whole requested window (`±radius`) lies inside the file's extent with at least 200 m to spare. Use the first candidate that contains it (prefer the mosaic inside 87°S for consistency, then site files). If none contains it, skip the site and log why.
- After reading: compute the share of finite, non-nodata pixels. **Reject the window if under 95%.** Never let missing 5 m pixels be filled from the 240 m grid and still call it a 5 m tile.
- Check each opened file is really a GeoTIFF of 5 m pixels (`abs(gt[1]) == 5`, units metres); fail loudly otherwise (NASA returns HTML pages with status 200 for missing files).
- Record in the sidecar JSON: `sourceUrl`, `product` ("PGDA product 78, site <NASA id>" or "PGDA product 81 mosaic"), `coverage`, the window extent, and the file's `Last-Modified` if available.
- Add `--dry-run`: print, for each site, the chosen source and the coverage test, without reading pixels. Run it in the workflow log before the real fetch.
- Optional, very useful: also read the matching `_toterr.tif` window and store its median and 95th percentile (height uncertainty) in the sidecar.

### 4.3 Packing and checking 5 m tiles (`tools/build_hires_terrain.mjs`)
- For tiles with `cellSize <= 5`:
  - check against the **20 m** data where it overlaps (in addition to 240 m): require mean |difference| ≤ 3 m and |bias| ≤ 1.5 m against 20 m, and the orientation variant must be 0 (no flips: the file is properly georeferenced). Reject otherwise.
  - Do not fill gaps from 240 m: if the tile has gaps, reject it (4.2 should already have).
  - Record `checkVs20m` and `checkVs240m` in the tile JSON and `index.json`.
- `index.json` `source`/`url` currently name only product 90; make them per tile (`product`, `url` fields) or list all products used.
- Keep the 5 m tile size modest: 10 × 10 km (2000 × 2000) packs to about 1.6 MB. Report the packed size of every tile in the log.

### 4.4 Ground slope: keep the current number, add the lander-scale one separately
The fork changed `groundSlope()` so 20 m terrain uses a 50 m baseline instead of 200 m. Measured on our current data, **4 of 22 polar sites change label** (e.g. connecting ridge 1.1° gentle → 5.7° moderate; Shoemaker 6.0° moderate → 12.1° steep). On 20 m data a ±25 m difference spans only 1.25 grid cells, so part of this is interpolation noise, not real slope.
- Revert the default (`d = Math.max(c.cell, 100)`, i.e. a baseline of at least 200 m).
- If you want lander-scale slope: add it as a **separate** value, computed only on 5 m terrain (baseline 20 m), and show it next to the 200 m slope with its baseline ("Slope over 20 m (5 m terrain): x°"). Better still, use NASA's own `_slp.tif` and `_slperr.tif` for the 5 m sites (they come with an uncertainty).
- Tests (see 6) and a line in `docs/VALIDATION.md` (error budget table) are required.

### 4.5 Workflow
In `.github/workflows/pgda.yml`:
- Don't put `${{ github.event.inputs.spots }}` directly into the `run:` script (GitHub's script-injection pattern). Pass inputs through `env:` and quote them:
  ```yaml
  env:
    SPOTS: ${{ inputs.spots }}
  run: docker run … python3 tools/fetch_5m_spots.py data-raw/pgda --spots "$SPOTS"
  ```
  and validate in Python that every id matches `^[a-z0-9-]+$`.
- Default `include_5m` to `false` until the 5 m tiles have passed validation (section 5); then switch it on.
- Run `fetch_5m_spots.py --dry-run` first and print the plan to the job summary.

### 4.6 LROC check
In `tools/lroc_shadow_check.mjs`, add the `m5` tier **only if a 5 m tile actually covers the LROC comparison box** (centre x −180000, y 70000, ±8000 m; Peak Near Cabeus B). Today none of the planned 5 m sites covers it, so `m5` would silently equal `m20` and be reported as a 5 m result. If you want a 5 m LROC result, add a 5 m source covering that box (check NPA, "Cabeus exterior wall 1", by coverage) and report it as a separate tier.

### 4.7 Wording and credits
- Remove the 5 m credits (`src/experience/trust.js` sources list, the Cesium credit in `src/planner/scene/moonScene.js`) until 5 m tiles are actually shipped. Then add them with the correct product names, URLs and citation: Barker, M.K., et al. (2021), Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions, Planetary & Space Science 203, 105119, doi:10.1016/j.pss.2020.105119.
- Wherever 5 m is mentioned, say it plainly: "5 m pixels; most pixels are interpolated between LOLA laser shots; height uncertainty about 0.3–0.5 m (NASA)".
- Add the dataset to `tools/build_manifest.mjs` (the 20 m tile dataset title, coverage and limitations text) so `public/data/manifest.json` describes the 5 m tiles correctly.

### 4.8 Performance
5 m tiles make rays take smaller steps near the site and add up to ~8 MB of memory per tile in the browser. Measure before and after (section 5.5) and keep: Professional mode usable within 4 s on the phone profile, the landing-area check under 2 s on desktop.

---

## 5. Validation that must be done and written down

Put every result in `docs/VALIDATION.md` (with date and commit) and, where there is a record file, regenerate it.

1. **Tile acceptance table** (new section in VALIDATION.md "5 m terrain"): per 5 m tile: NASA source file, coverage %, mean |diff| and bias vs 20 m and vs 240 m, orientation variant, packed size, median and p95 height uncertainty from `_toterr` (if read).
2. **Effect on results**: for every site with a 5 m tile, the 2027 sunlight share and Earth-in-view share from 240 m, 20 m and 5 m terrain (method as in `tools/build_hires_terrain.mjs` section 2 / `refresh_pgda_site_shares.mjs`). Explain any change over 2 points.
3. **Against NASA PGDA**: re-run the PGDA workflow so `public/data/pgda_check.json` includes the 5 m sites; regenerate `docs/validation/pgda.json` with `node tools/validation_records.mjs`. Report whether 5 m moves our site values closer to PGDA's 60 m values (median and worst difference, before vs after).
4. **Sampling convergence**: run `node tools/azimuth_resolution.mjs` after adding the tiles (it uses all tiles); the shipped setting must stay within 0.5 points of the reference at every site, or the failed cases must be explained. Note that rays on 5 m terrain start with 2.5 m steps.
5. **Performance**: `node test/perf-baseline.cjs http://localhost:4302/ before.json` on `main` and `… after.json` on your branch (production build, `npx vite preview --port 4302`). Report transfer size, time until usable (desktop and phone profile) and memory, and the time for a custom-point skyline and the landing-area check on a 5 m site (time `computeHorizon` and `landingDispersion` in Node).
6. **Height uncertainty** (if you read `_toterr`/clones): optional but valuable for the LPSC study: the spread of sunlight share across a few clones at one site (e.g. 10 clones at the connecting ridge).
7. **Precomputed skylines and golden values**: after `build_site_horizons.mjs --only-hires`, sites on 5 m tiles change. `test/horizonSampling.spec.js` has golden sunlight values for `ridge` (63.6%) and `best-2` (49.8%) at 20 m. Either keep the test on 20 m tiles explicitly or update the golden values **with the evidence from item 2**, never just to make the test pass.
8. **README and abstract**: update any number that changes (README "Real terrain at every site", `docs/outreach/lpsc2027-abstract.md` method and results) with the new values and date.

---

## 6. Tests to add (all must pass in `npm test`)

Add a new file `test/terrain5m.spec.js` (Node test runner, same style as the existing specs), plus additions where noted:

1. **5 m tiles in the index are well-formed** (skip cleanly if there are none): `cellSize === 5`, `kind === 'spot_5m'`, `coverage >= 0.95`, `checkVs20m.meanAbsDiffM <= 3`, `|checkVs20m.biasM| <= 1.5`, `orientationVariant === 0`, `product` and `url` name PGDA product 78 or 81.
2. **Terrain lookup prefers 5 m**: build a terrain with a synthetic 5 m tile over a synthetic 20 m tile; `heightAt` returns `cell: 5` inside the 5 m tile and `cell: 20` just outside it; the bucketed lookup in `createTerrain` agrees with a plain first-match lookup (as in `test/tileCodec.spec.js`).
3. **Round trip**: every shipped tile, 5 m included, unpacks to the same heights in Node and the browser path (already covered by `test/tileCodec.spec.js`: confirm it runs over the new tiles).
4. **Adaptive margin**: `tilesNear` with a function margin returns a 5 m tile only when the point is inside it by the margin, and still returns 20 m neighbours within 3 km.
5. **Slope**:
   - on a synthetic plane of known slope (e.g. 7°), `groundSlope` returns 7° ± 0.1° at every grid size and reports its baseline;
   - the default baseline on 20 m terrain is still ≥ 200 m (guards 4.4);
   - if you add a lander-scale slope: it is only returned on ≤ 5 m terrain, with its baseline.
6. **Source choice (Python)**: make the coverage test in `fetch_5m_spots.py` a pure function (extent + point + radius → bool) and add a tiny check runnable without GDAL, e.g. `python3 tools/fetch_5m_spots.py --self-test`, covering: inside, outside, on the edge, partly outside. Run it in the workflow.
7. **Workflow inputs**: a static test like `test/deployGate.spec.js` that fails if `pgda.yml` contains `${{ github.event.inputs` or `${{ inputs` inside a `run:` block.
8. **Browser**: `node test/smoke-e2e.cjs http://localhost:4302/` (13/13) and, because Terrain 3D uses the same tiles, `node test/browser-e2e.cjs http://localhost:4302/planner.html` (42/42).

---

## 7. How to submit

1. Sync the fork with the latest `Arairo/IMPROVED_lunarmoon-` `main` (GitHub "Sync fork"), then create a branch, e.g. `feature/5m-terrain`.
2. Make the fixes in sections 4–6 in small commits with clear messages.
3. Run locally (Node 22): `npm ci`, `npm test`, `npx vite build`, `node tools/build_manifest.mjs --check`, then `npx vite preview --port 4302` and the two browser tests. Paste the outputs in the pull request.
4. Run the PGDA workflow **on your branch in your fork** (Actions → "Add 20 m terrain and check against NASA PGDA" → include 5 m), check its summary and the tile acceptance numbers, then the LROC workflow if 4.6 applies.
5. Open a pull request to `Arairo/IMPROVED_lunarmoon-` `main` with: what changed, the validation tables from section 5, the test outputs, and anything you could not verify.
6. Don't merge your own PR; Ammar reviews it.

### Acceptance checklist (copy into the PR)
- [ ] `.gitattributes` added; manifest check passes on Linux CI
- [ ] Correct NASA URLs (with folders); sources chosen by coverage; tiles under 95% coverage rejected; no 240 m gap filling for 5 m tiles
- [ ] 5 m tiles checked against 20 m (≤ 3 m mean, ≤ 1.5 m bias, variant 0) and recorded
- [ ] `groundSlope` default unchanged; any lander-scale slope separate, tested and documented
- [ ] Workflow inputs passed through `env`; `include_5m` off by default until validated; dry run printed
- [ ] LROC `m5` only when a 5 m tile covers the box
- [ ] Credits and wording only for data actually shipped, with citation and the "mostly interpolated" caveat
- [ ] VALIDATION.md "5 m terrain" section with the tables in section 5; `docs/validation/*.json` regenerated
- [ ] Performance before/after reported
- [ ] `npm test`, build, smoke 13/13, Terrain 3D 42/42 all pass (outputs pasted)
