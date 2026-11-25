# Terrain resolution study

Generated 2026-11-25T14:59:31.530Z by tools/terrain_study.mjs (commit 31f5669).

Skylines (0.5 deg azimuth steps, 2 m mast) from NASA PGDA LDEM_80S_20MPP_ADJ cut to +-180 km and block-averaged copies of it, in distance bands from the observer; beyond 180 km the app's 1 km polar grid and whole-Moon grid. Reference: 20 m everywhere, ray steps 0.3% of distance (the app uses 1.5%). Shares as NASA PGDA AVGVISIB: visible fraction of the Sun's disk, Earth when any of its disk is above the skyline, 18.6-year cycle from 2009.

Differences are in percentage points of the sunlight (or Earth-in-view) share, against the reference.

| Variant | Terrain | Sites: sun median / max | Random points: sun median / 90% / max | Earth max (sites / points) | Sites vs PGDA 60 m: median / max |
|---|---|---|---|---|---|
| shipped | tiles, then sp_fine | 0 / 4.05 | 0.08 / 1.32 / 12.47 | 2.62 / 24.96 | 1.07 / 7.97 |
| shippedCustom | tiles near the point, then sp_fine | - / - | 0.09 / 1.32 / 12.47 | - / 24.96 | - / - |
| near10 | m20 to 10 km, then sp_fine | 0.01 / 0.07 | 0.01 / 0.05 / 0.08 | 0.19 / 0.06 | 1.03 / 7.97 |
| near20 | m20 to 20 km, then sp_fine | 0 / 0.07 | 0.01 / 0.03 / 0.04 | 0.09 / 0.06 | 1.06 / 7.97 |
| near30 | m20 to 30 km, then sp_fine | 0 / 0.06 | 0.01 / 0.03 / 0.04 | 0.05 / 0.06 | 1.07 / 7.97 |
| tiles_m60 | tiles, then m60 | 0 / 4.05 | 0.02 / 0.44 / 3.23 | 2.62 / 2.86 | 1.07 / 7.97 |
| tiles_m120 | tiles, then m120 | 0 / 4.05 | 0.02 / 0.83 / 7.18 | 2.62 / 5.39 | 1.07 / 7.97 |
| tiles_m240 | tiles, then m240 | 0 / 4.05 | 0.12 / 2.29 / 12.46 | 2.62 / 24.92 | 1.07 / 7.97 |
| tiles_m240max | tiles, then m240max | 0 / 4.05 | 0.2 / 1.89 / 16.22 | 2.62 / 25.19 | 1.07 / 7.98 |
| near5_m60 | m20 to 5 km, then m60 | 0 / 0.02 | 0 / 0.01 / 0.02 | 0.07 / 0.06 | 1.06 / 7.97 |
| near10_m60 | m20 to 10 km, then m60 | 0 / 0.02 | 0 / 0.01 / 0.02 | 0.05 / 0.03 | 1.06 / 7.97 |
| near10_m120 | m20 to 10 km, then m120 | 0 / 0.03 | 0.01 / 0.02 / 0.03 | 0.11 / 0.05 | 1.06 / 7.97 |
| near10_m40_30_m120 | m20 to 10 km, then m40 to 30 km, then m120 | 0 / 0.03 | 0 / 0.02 / 0.02 | 0.03 / 0.03 | 1.07 / 7.97 |
| near3_m60_50_m240 | m20 to 3 km, then m60 to 50 km, then m240 | 0 / 0.04 | 0.01 / 0.03 / 0.05 | 0.07 / 0.08 | 1.06 / 7.97 |
| near10_m60_50_m240 | m20 to 10 km, then m60 to 50 km, then m240 | 0 / 0.03 | 0.01 / 0.02 / 0.04 | 0.05 / 0.03 | 1.06 / 7.97 |
| near10_m120max | m20 to 10 km, then m120max | 0.01 / 0.09 | 0.02 / 0.1 / 0.13 | 0.35 / 0.96 | 1.12 / 7.98 |
| m20_appSteps | m20 | 0 / 0.01 | 0 / 0 / 0.01 | 0.01 / 0.02 | 1.07 / 7.97 |
| reference | 20 m to 180 km, dense steps | 0 | 0 | 0 | 1.07 / 7.98 |

Moving a site 60 m changes its sunlight share by a median 1.61 points (worst 42.73).

## Download size if shipped as 16 km packed tiles

| Grid | Average tile | Whole +-180 km | A 50 km disc |
|---|---|---|---|
| m20 | 183 KB | 90 MB | 5.5 MB |
| m40 | 66 KB | 33 MB | 2 MB |
| m60 | 36 KB | 18 MB | 1.1 MB |
| m120 | 13 KB | 6 MB | 0.4 MB |
| m240 | 5 KB | 2 MB | 0.1 MB |

## Sites

| Site | Reference sun / Earth | Shipped | near10_m60 | PGDA 60 m | At the surface | 60 m away |
|---|---|---|---|---|---|---|
| a3-cb | 33.84 / 30.45 | 32.54 (-1.3) | 33.84 (+0) | - | 33.19 | 33.59-54.38 |
| a3-hw | 9.49 / 44.09 | 9.53 (+0.04) | 9.49 (+0.01) | 9.1 | 2.99 | 6.02-13.16 |
| a3-ma | 19.92 / 52.24 | 19.93 (+0.01) | 19.93 (+0.01) | 27.9 | 12.34 | 4.69-37.27 |
| a3-mp | 24.31 / 65.81 | 24.31 (+0) | 24.31 (+0) | 25.6 | 22.7 | 19.73-25.99 |
| a3-mm | 20.24 / 41.85 | 20.23 (+0) | 20.23 (+0) | 21.7 | 17.48 | 15.78-23.11 |
| a3-n1 | 30.01 / 35.79 | 30.01 (+0) | 30.01 (+0) | 28.6 | 29.4 | 28.97-31.21 |
| a3-n2 | 40.92 / 68.88 | 40.92 (+0) | 40.92 (+0) | - | 39.69 | 39.82-41.43 |
| a3-g2 | 36.1 / 54.86 | 36.11 (+0) | 36.11 (+0) | 37.2 | 35.84 | 35.67-36.07 |
| a3-sp | 1.88 / 41.44 | 1.88 (+0) | 1.88 (+0) | 2.9 | 1.74 | 1.69-2.05 |
| ridge | 61.41 / 48.76 | 61.41 (+0) | 61.41 (+0) | 55.5 | 31.12 | 47.94-85.27 |
| peak-shackleton | 61.49 / 56.78 | 61.52 (+0.03) | 61.51 (+0.02) | 55.6 | 23.69 | 41.69-84.42 |
| shackleton | 0 / 0 | 0 (+0) | 0 (+0) | 0 | 0 | 0-0 |
| best-1 | 63.86 / 61.24 | 63.89 (+0.04) | 63.87 (+0.01) | 59.4 | 50.62 | 50.99-74.46 |
| best-2 | 49.36 / 53.94 | 49.4 (+0.05) | 49.37 (+0.01) | 50 | 44.17 | 42.99-69.4 |
| degerlache | 0.02 / 0 | 0.02 (+0) | 0.02 (+0) | 0.1 | 0.02 | 0.01-0.02 |
| shoemaker | 0 / 24.22 | 0 (+0) | 0 (+0) | 0 | 0 | 0-0 |
| haworth | 0 / 0.77 | 0 (+0) | 0 (+0) | 0 | 0 | 0-0 |
| faustini | 0 / 1.7 | 0 (+0) | 0 (+0) | 0 | 0 | 0-0 |
| nobile | 34.45 / 29.85 | 34.49 (+0.04) | 34.46 (+0) | 35.7 | 34.44 | 34.42-34.49 |
| lcross | 0 / 18.64 | 0 (+0) | 0 (+0) | 0 | 0 | 0-0 |
| im1 | 42.89 / 100 | 38.84 (-4.05) | 42.89 (+0) | - | 42.73 | 42.64-43.17 |
| im2 | 45.33 / 93.64 | 45.33 (+0) | 45.34 (+0.01) | 46.4 | 44.82 | 44.61-45.46 |
