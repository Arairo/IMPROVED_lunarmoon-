# Public API (read-only)

Everything is static files on GitHub Pages: no server, no key, no rate limit
beyond GitHub's, and CORS is open, so a browser page, a notebook or a script
can fetch it directly. Base URL:

```
https://arairo.github.io/IMPROVED_lunarmoon-/api/v1/
```

| File | What it is |
|---|---|
| `index.json` | List of everything below |
| `sites.json`, `sites.geojson`, `sites.kml` | Every site in the app with its notes (lat/lon on the IAU 2015 Moon sphere) |
| `artemis_regions.geojson`, `.kml` | NASA's nine Artemis III candidate landing regions (Oct 2024). Outlines from the USGS release McClernan 2024, doi:10.5066/P1MEQ6UK, sourced from LROC QuickMap |
| `daily/{siteId}-2027.json` | Every day of 2027: share of the day with the Sun up, Earth up, both, a DSN station in view, a direct-to-Earth link, and solar energy |
| `maps/*.tif` | GeoTIFF lighting maps for 2027 (south and north polar caps at 5 km, whole Moon at 1°, south pole at 1 km). Projections IAU_2015:30135 / 30130 / 30100, the same as NASA PGDA's polar products |
| `lsp-engine.js` | The app's engine as one ES module: run any site, date and window yourself |

"Sun up" means part of the solar disk is above the LOLA terrain skyline seen
from a 2 m mast; "Earth up" means Earth's centre is. See the app's
*Accuracy, data and sources* panel and [VALIDATION.md](VALIDATION.md) for how
far the numbers can be trusted. It is a planning tool, not mission-certified.

## Versions, units and missing values

- **`api/v1`** is the major version. Within v1, fields are only ever **added**; nothing
  is renamed, removed or changes meaning or units. A breaking change gets a new
  `api/v2/` path, with v1 kept for at least six months and migration notes here.
- `index.json` carries `schemaVersion` (`1.1` since 21 Nov 2026: adds `datasets`).
- Units are in the field names or in each file's `units` field: shares are 0–1,
  angles in degrees, energy in watt-hours, times in UTC (ISO 8601).
- `null` means "not computed or not applicable" (for example no 20 m terrain at a
  site); it never means zero.
- Coordinates: planetocentric latitude, east-positive longitude, heights above the
  1737.4 km sphere. See [FRAMES.md](FRAMES.md).
- Every data file the site serves, with its SHA-256, source and generating script,
  is listed in `../../data/manifest.json` (linked from `index.json` as `datasets`).
  Check a download with `sha256sum`.
- Numbers come from the engine of the release that built the site. The engine
  changed on 21 Nov 2026 (skyline crest refinement): south-polar sunlight shares
  can be up to ~3 points lower than before at crests. See
  [VALIDATION.md](VALIDATION.md) section 3.

## Python

```python
import requests, pandas as pd

base = "https://arairo.github.io/IMPROVED_lunarmoon-/api/v1"
d = requests.get(f"{base}/daily/ridge-2027.json").json()
df = pd.DataFrame(d["days"], columns=d["columns"])
print(df[df.sun_and_earth > 0.9].head())          # days with Sun and Earth up >90% of the time

import rasterio                                   # GeoTIFF maps open in GDAL, QGIS, ArcGIS
with rasterio.open(f"{base}/maps/south_sun_disk_2027_1km.tif") as ds:
    print(ds.crs, ds.read(1).max())
```

## JavaScript (browser or Node 18+)

```js
import * as lsp from 'https://arairo.github.io/IMPROVED_lunarmoon-/api/v1/lsp-engine.js';

const site = lsp.sites.find((s) => s.id === 'ridge');
const ctx = lsp.prepareSite(site);
const now = lsp.evaluate(Date.now(), ctx);              // Sun, Earth, power, DSN and link right now
const win = lsp.scanWindow(ctx, Date.UTC(2027, 1, 1), 30); // a 30-day window
console.log(win.stats.litFraction, win.stats.longestDarkH);
console.log(lsp.scanToCsv(win, { site }));              // the same CSV as the app's Report step
const flight = lsp.planFlight(Date.UTC(2027, 1, 10, 12), { route: 'direct', launchSite: 'ksc' });
```

Sites in the list use their precomputed LOLA skylines (20 m terrain where we
have it). Arbitrary coordinates fall back to a coarse built-in terrain model in
the engine module; use the app (which loads the full terrain) for those.

## Rebuilding

`npm run build` writes `dist/api/v1` (engine, sites, regions, daily tables).
The GeoTIFFs live in `public/api/v1/maps` and are rebuilt with
`npm run api:maps` (needs `pip install rasterio`) after the map layers change.
