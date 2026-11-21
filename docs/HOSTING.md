# Hosting

**Recommendation (21 Nov 2026): stay on GitHub Pages for now.** No measurement
shows a delivery problem, and a move has one hard blocker (the tutorial video)
and costs setup work. Revisit when the items under "When to revisit" happen.

## The build against each host's limits

`npm run build` produces **701 files, 135 MB** (tutorial videos 65 MB, data
52 MB, CesiumJS 14 MB, API 1.3 MB, app code 3.9 MB).

| Limit | GitHub Pages | Cloudflare Pages (free) | This build |
|---|---|---|---|
| Site size | 1 GB | — | 135 MB: fine |
| Files | — | 20,000 | 701: fine |
| Largest single file | 100 MB (git) | **25 MiB** | **`tutorial/pro-tutorial.mp4` 26.8 MiB: too big for Cloudflare** |
| Bandwidth | ~100 GB/month (soft) | no stated cap on static assets | see below |
| Response headers (CSP, cache) | not settable | `_headers` file | ready: `docs/hosting/_headers.example` |

Limits are as given in the project's improvement plan (20 Nov 2026), from the
GitHub and Cloudflare documentation linked there; check the current pages before
relying on them.

**Bandwidth.** After the Phase 5 changes a visit to the landing page or Beginner
downloads ~4.8 MB, Professional ~19 MB (most of it the terrain grids), Terrain 3D
~24 MB. GitHub's soft limit of ~100 GB a month is therefore roughly 5,000
Professional visits or 20,000 Beginner visits a month, ignoring browser caching.
That is far above current use, but a classroom or conference demo could reach it.

## What a move would need

1. **Videos:** re-encode `pro-tutorial.mp4` below 25 MiB (the videos are due to be
   redone anyway), or host the videos elsewhere (Cloudflare R2, YouTube).
2. **Base path:** the GitHub build serves from `/IMPROVED_lunarmoon-/` (`BASE_PATH`
   in `deploy.yml`); a Cloudflare site would serve from `/`. Build without
   `BASE_PATH` and re-check `planner.html`, the CesiumJS assets
   (`tools/fix-cesium-path.mjs`), the API base URL in `tools/build_api.mjs` and
   `docs/API.md`, and every download link.
3. **Headers:** copy `docs/hosting/_headers.example` to `public/_headers`. Its two
   Content-Security-Policies (a strict one for the app, one allowing `eval` and
   `blob:` workers for the CesiumJS page) were tested **enforced** against the
   production build in Chromium, through the intro, Beginner, Professional mode,
   the Flight view, the printable report and Terrain 3D: **no violations**. Not
   tested: loading Cesium ion assets with a personal token. Start with
   `Content-Security-Policy-Report-Only` on the real host and watch for reports.
4. **Benchmark first:** deploy the same build to both hosts and compare document
   time to first byte, transfer sizes (is `.bin` compressed?), cache hits and Core
   Web Vitals from Malaysia, Europe and North America, cold and warm cache. This could
   not be done from the development sandbox, whose network blocks the live site.
5. Keep GitHub Pages running until the new host has passed `test/smoke-e2e.cjs`
   against its preview URL; switching back is then just DNS or a link change.

## When to revisit

- Visits approach GitHub's bandwidth guideline, or users in Asia report slow loads.
- Security headers (CSP) become a requirement, for a journal or an institution.
- The terrain moves to tiles (see `docs/PERFORMANCE.md`): object storage such as R2
  with range requests would then make sense.
