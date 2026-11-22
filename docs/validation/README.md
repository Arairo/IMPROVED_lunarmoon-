# Validation records

One JSON file per check, in a small shared format (second audit, section 6.2), so a
result can be traced to the code and data it came from:

| Field | Meaning |
|---|---|
| `schemaVersion` | Format version (1) |
| `kind` | What is checked (astronomy, terrain shadows, …) |
| `applicationCommit` | Git commit that produced the numbers, or `"not recorded"` for older runs |
| `datasetVersion` | SHA-256 of `public/data/manifest.json` (which lists every data file's checksum) |
| `validationDateUtc` | When the comparison was made |
| `reference` | The independent source, with product names and versions |
| `caseCount`, `sites`, `dates` | What was compared |
| `configuration` | Settings that affect the result (mast height, criteria, thresholds) |
| `metrics` | Error distributions (median, 95th percentile, maximum), not just a headline |
| `failedCases` | Every case outside the stated limit; an empty list means none |

| File | Check | Made by |
|---|---|---|
| `jpl-horizons.json` | Sun and Earth azimuth/elevation vs NASA JPL Horizons (154 cases) | `node tools/validation_records.mjs` (recomputed with the current code from stored JPL values) |
| `pgda.json` | Sunlight / Earth-visibility maps and sites vs NASA GSFC PGDA | same, from `public/data/pgda_check.json` (PGDA workflow) |
| `lroc.json` | Lit / shadowed pixels vs LROC photographs | same, from `public/data/lroc_check.json` (LROC workflow) |
| `azimuth-resolution.json` | Skyline sampling: 2°, 1°, 0.5° and shipped vs a 0.25° reference | `node tools/azimuth_resolution.mjs` |

Each record covers only what it says: the JPL check validates celestial positions at
those sites and times, not terrain, power or radio. See `docs/VALIDATION.md` for the
discussion. Re-run them when the model, a reference frame, the terrain or the data
pipeline changes.
