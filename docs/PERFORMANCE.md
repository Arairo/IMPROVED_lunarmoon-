# Performance

Measured, not guessed. Numbers below are from a production build served locally
(`vite preview`, which gzips text but not the binary terrain files, like GitHub
Pages), loaded in headless Chromium. They are **transfer sizes**. Load and paint
*times* from this setup are not reported: it renders WebGL in software and the
machine was shared, so its timings say nothing about a real device. Real-device
Core Web Vitals (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1) from several regions are
still to be measured (see "Not done yet").

## What each page downloads (21 Nov 2026)

| Page | Before | After | What changed |
|---|---|---|---|
| Landing page (`/`) | 25 requests, **20.5 MB**, 2 third-party hosts | 18 requests, **4.8 MB**, no third-party hosts | Terrain grids no longer loaded here; 2k Earth image; fonts self-hosted |
| Beginner (`#beginner`) | 26 requests, **20.5 MB** | 18 requests, **4.8 MB** | Same; the grids load only if you pick a spot of your own |
| Professional (`#pro`) | 27 requests, **20.5 MB** | 26 requests, **19.3 MB** | Fonts and the Earth image only: Pro needs the grids (slope, nudges, custom points) |
| Terrain 3D (`planner.html`) | 41 requests, 24.1 MB | 39 requests, 24.1 MB | Unchanged (CesiumJS + terrain) |

Where the bytes went before: 14.6 MB of terrain grids (`global_dem.bin` 8.3 MB,
`sp_fine.bin` 4.5 MB, `sp_coarse.bin` 1.7 MB) fetched 1.2 s after every page
load, although listed sites use precomputed skylines; 5.4 MB of imagery; Google
Fonts CSS and font files from two other hosts.

### Changes

- **Terrain grids on demand** (`ensureTerrain` in `src/main.js`): Professional mode
  loads them shortly after start; any mode loads them when a custom point is chosen
  (a custom point uses the 5 km grid, flagged "approximate", until they arrive and is
  then recomputed). Beginner waits for them before moving on from a spot of your own.
- **Earth texture**: 2048 × 1024 (0.32 MB) instead of 4096 × 2048 (1.46 MB) where Earth is
  drawn small (3D Moon, flight, intro); `tools/make_earth_2k.py`. Terrain 3D keeps the 4k.
- **Fonts**: Inter, IBM Plex and Nunito are bundled from `@fontsource` (SIL Open Font
  License); the Google Fonts link is gone. Only the weights in use are fetched.

## Main-thread work

Timed in Node on the development machine (median of 3):

| Work | Time | How it runs now |
|---|---|---|
| 30-day scan of one site (30 min steps, DSN) | 91 ms | one go (under the 200 ms target) |
| 1-year scan (4 h steps) | 155 ms | one go |
| Skyline for a custom point (2°, as the app uses) | 19 ms | one go |
| Find the next good landing date | 107 ms | one go |
| Best spots: 38 sites + map candidates | ~3.2 s | already sliced into 25 ms pieces with progress and cancel |
| Landing-area check (25 touchdown points) | 382 ms | **now sliced** (was one block) |
| Safer aim (7 candidates × 13 points) | **1.7 s** | **now sliced** with cancel (was one block: the page froze) |

The slicing (`landingDispersionAsync`, `robustAimAsync` in `src/core/planning.js`)
runs the same code as the synchronous functions in ~25 ms pieces;
`test/planning.spec.js` checks the results are identical. A Web Worker was not used:
every touchdown point needs its own skyline from the 14.5 MB terrain grids, so a
worker would need its own copy of them (roughly doubling memory, worst on phones)
for work that slicing already keeps off the critical path.

## Graphics

- The flight view's `dispose()` now frees geometries, materials and textures,
  disconnects its resize observer and releases the WebGL context immediately. Switching
  routes 20 times in Beginner showed no context warnings before or after, so this is
  hygiene, not a measured fix.
- Renderers cap the device pixel ratio at 2. Three.js restores a lost WebGL context
  by itself.
- Without WebGL the 3D views show a notice and the app opens the 2D South-Pole Map.

## Baseline and fixes, 22 November 2026 (second audit)

`node test/perf-baseline.cjs http://localhost:4302/ out.json` on the production
build (`vite preview`), cold cache, headless Chromium with software WebGL, on a
shared 4-core cloud machine. Two profiles: **desktop** (1366 × 820, no throttling)
and **phone** (390 × 844, CPU 4× slower, 9 Mbit/s down, 40 ms latency). Raw numbers:
`docs/perf-baseline-2026-11-22.json`. "Usable" = the page's first real content (the
Check verdict in Professional mode), timed inside the page from navigation start.

| Page | Download | Usable (desktop / phone) | Layout shift (CLS) before → after |
|---|---|---|---|
| Landing | 4.8 MB, 20 requests | 1.3 s / 3.0 s | 0.39 → **0** |
| Beginner | 4.8 MB | 0.4 s / 1.8 s | 0.25 → **0** |
| Professional | 19.8 MB (incl. 2 20 m tiles, 0.45 MB) | 1.4–3.1 s / 3.1 s | 0.03 → 0.02 |
| Terrain 3D from Professional | 23.4 MB | 1.3 → **0.7 s** / 18.2 → **3.9 s** | 0.45 → **0.03** |

All pages are now within the "good" CLS limit (0.1). No third-party requests.

What was fixed, and why:

- **Layout shift.** The Professional app was laid out behind the landing intro and
  the Beginner walk, and its start-up movement counted as shift. `public/early.js`
  (a tiny plain script at the top of `<body>`, run before the first layout) now hides
  the app until Professional mode is opened. Terrain 3D opened from Professional mode
  first drew its full header (three rows) and then hid the duplicate buttons; the same
  script hides them before the first layout, and the header now fits one row.
- **Terrain 3D start.** The two terrain grids (14.5 MB) were downloaded one after the
  other and every number waited for them: about 18 s on the phone profile. They now
  download together in the background; listed sites show their numbers at once from
  precomputed skylines, and the 3D terrain (and any custom point's skyline) follows.
- **Measurement fix.** A first version of the script timed "usable" after the
  browser's load event, which waits for every image (the 2.6 MB Moon texture): it
  reported 11–12 s for Professional on the phone profile. Timed inside the page, the
  verdict shows at about 3 s.

Still to check on real hardware: the first hover after Start on the landing page
takes 650–900 ms to redraw here (target under 200 ms). The click itself responds in
under 60 ms; the cost is the next frame, which software WebGL plus the frosted-glass
cards make slow. A real GPU is expected to be far faster, but this needs a phone.

### Hosting decision

**Stay on GitHub Pages.** The measured costs are downloads (terrain grids, imagery,
CesiumJS) and drawing in the browser; a different static host serves the same bytes
and would not change either. A fair Cloudflare Pages comparison needs the same build
measured from Malaysia, Europe and North America, which this setup cannot do. If real
users report slow loads, run `test/perf-baseline.cjs` against both hosts from those
regions first (procedure in the second audit, section 9.3). See also `docs/HOSTING.md`.

## Not done yet

- Real-device measurements (a mid-range Android phone, an iPhone, integrated
  graphics) and Core Web Vitals from Malaysia, Europe and North America.
- Compressed GPU textures (KTX2) and tiled terrain with levels of detail: the 8.3 MB
  whole-Moon grid is one file; Pro would load faster with tiles fetched by region.
- A low-quality rendering mode for weak GPUs.
