#!/usr/bin/env python3
"""Cut a south-pole mosaic out of NASA PGDA's 20 m LOLA terrain (LDEM_80S_20MPP_ADJ,
Barker et al. 2023) and make coarser copies of it, for tools/terrain_study.mjs.
Runs in GitHub Actions (the dev sandbox can't reach NASA).

  python3 tools/pgda_mosaic.py SOURCE OUT_DIR [HALF_KM]

SOURCE is a local copy of LDEM_80S_20MPP_ADJ.TIF or its URL (read through /vsicurl/).
Writes to OUT_DIR, each as raw int16 (little-endian, metres above the 1737.4 km sphere,
-32768 = no data, row 0 at +y) plus a JSON description that src/core/horizon.js
createGrid() understands:
  m20.i16                    the 20 m terrain, +-HALF_KM km around the pole (default 180)
  m40/m60/m120/m240.i16      block means of it (2x2, 3x3, 6x6, 12x12 cells)
  m120max/m240max.i16        block maxima (keeps ridge tops; a test of a cheap fix)
"""
import json, math, os, sys, warnings
import numpy as np
from osgeo import gdal

gdal.UseExceptions()
warnings.simplefilter('ignore', RuntimeWarning)  # all-empty blocks in nanmean/nanmax
gdal.SetConfigOption('GDAL_HTTP_MAX_RETRY', '6')
gdal.SetConfigOption('GDAL_HTTP_RETRY_DELAY', '3')
gdal.SetConfigOption('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.TIF,.tif')

src, out = sys.argv[1], sys.argv[2]
half = float(sys.argv[3]) * 1000 if len(sys.argv) > 3 else 180000.0
os.makedirs(out, exist_ok=True)
ds = gdal.Open(src if os.path.exists(src) else '/vsicurl/' + src)
band = ds.GetRasterBand(1)
gt = ds.GetGeoTransform()
u = 1000.0 if abs(gt[1]) < 5 else 1.0  # projected units: km or m
cell = abs(gt[1]) * u
nd = band.GetNoDataValue()
scale, offset = band.GetScale() or 1, band.GetOffset() or 0
print('source', ds.RasterXSize, ds.RasterYSize, 'cell', cell, 'm, geotransform', gt, 'nodata', nd,
      'scale', scale, 'offset', offset, 'block', band.GetBlockSize(), flush=True)
if abs(cell - 20) > 0.01:
    sys.exit(f'expected a 20 m grid, got {cell} m')

n = int(round(2 * half / cell))
n -= n % 12  # so every coarser copy divides evenly
x0 = int(round((-half / u - gt[0]) / gt[1]))
y0 = int(round((half / u - gt[3]) / gt[5]))
if x0 < 0 or y0 < 0 or x0 + n > ds.RasterXSize or y0 + n > ds.RasterYSize:
    sys.exit('the requested square does not fit inside the source grid')
# centre of the cut, in metres (cell edges at x0 and x0 + n)
cx = (gt[0] + (x0 + n / 2) * gt[1]) * u
cy = (gt[3] + (y0 + n / 2) * gt[5]) * u
print(f'cutting {n} x {n} cells at ({x0}, {y0}); centre offset ({cx:.1f}, {cy:.1f}) m', flush=True)


# Units: the build tools found metres above 1737.4 km; check once on the middle of the cut.
probe = band.ReadAsArray(x0 + n // 2 - 500, y0 + n // 2 - 500, 1000, 1000).astype(np.float64) * scale + offset
if nd is not None and not math.isnan(nd):
    probe[probe == nd] = np.nan
med = float(np.nanmedian(probe))
if abs(med) > 1e6:
    to_metres, unit = (lambda a: a * scale + offset - 1737400.0), 'radius in metres'
elif 1700 < med < 1760:
    to_metres, unit = (lambda a: (a * scale + offset - 1737.4) * 1000), 'radius in km'
elif abs(med) < 20 and np.nanmax(np.abs(probe)) < 20:
    to_metres, unit = (lambda a: (a * scale + offset) * 1000), 'km above 1737.4 km'
else:
    to_metres, unit = (lambda a: a * scale + offset), 'metres above 1737.4 km'
print('source units:', unit, '(median of the middle 20 km:', med, ')', flush=True)


m20 = np.full((n, n), -32768, dtype=np.int16)
STRIP = 600
for r in range(0, n, STRIP):
    rows = min(STRIP, n - r)
    for attempt in range(6):
        try:
            a = band.ReadAsArray(x0, y0 + r, n, rows).astype(np.float64)
            break
        except RuntimeError as e:
            print(f'read failed at row {r} (try {attempt + 1}/6):', str(e)[:160], flush=True)
    else:
        sys.exit('reading kept failing')
    bad = ~np.isfinite(a)
    if nd is not None and not math.isnan(nd):
        bad |= a == nd
    a[bad] = np.nan
    a = to_metres(a)
    ok = np.isfinite(a)
    strip = np.full(a.shape, -32768, dtype=np.int16)
    strip[ok] = np.clip(np.round(a[ok]), -32767, 32767).astype(np.int16)
    m20[r:r + rows] = strip
    if (r // STRIP) % 5 == 0:
        print(f'  rows {r}-{r + rows}: {ok.mean() * 100:.2f}% data', flush=True)


def write(name, arr, cell_m, how):
    arr.tofile(os.path.join(out, f'{name}.i16'))
    good = arr != -32768
    meta = {
        'name': name, 'projection': 'south-polar-stereographic', 'radius': 1737400,
        'halfExtent': arr.shape[0] * cell_m / 2, 'cellSize': cell_m, 'size': arr.shape[0],
        'centreX': cx, 'centreY': cy, 'dtype': 'int16-le', 'noData': -32768,
        'units': 'metres above 1737.4 km sphere', 'rowOrder': 'row 0 at +y, column 0 at -x',
        'source': 'NASA GSFC PGDA LDEM_80S_20MPP_ADJ (Barker et al. 2023)', 'resampling': how,
        'coverage': float(good.mean()),
        'minHeight': int(arr[good].min()) if good.any() else None, 'maxHeight': int(arr[good].max()) if good.any() else None,
    }
    json.dump(meta, open(os.path.join(out, f'{name}.json'), 'w'), indent=1)
    print(f'{name}: {arr.shape[0]}^2 cells of {cell_m:g} m, {good.mean() * 100:.3f}% data', flush=True)


write('m20', m20, cell, 'none (source cells)')


def pool(arr, k, how):
    """Mean or max over k x k blocks, ignoring no-data; no data only where a whole block is empty."""
    m = arr.shape[0] // k
    outa = np.full((m, m), -32768, dtype=np.int16)
    step = 300  # output rows per pass, to bound memory
    for r in range(0, m, step):
        rr = min(step, m - r)
        b = arr[r * k:(r + rr) * k].astype(np.float32).reshape(rr, k, m, k)
        b[b == -32768] = np.nan
        with np.errstate(all='ignore'):
            v = np.nanmean(b, axis=(1, 3)) if how == 'mean' else np.nanmax(b, axis=(1, 3))
        ok = np.isfinite(v)
        o = np.full(v.shape, -32768, dtype=np.int16)
        o[ok] = np.round(v[ok]).astype(np.int16)
        outa[r:r + rr] = o
    return outa


for k in (2, 3, 6, 12):
    write(f'm{int(cell * k)}', pool(m20, k, 'mean'), cell * k, f'mean of {k}x{k} 20 m cells')
for k in (6, 12):
    write(f'm{int(cell * k)}max', pool(m20, k, 'max'), cell * k, f'maximum of {k}x{k} 20 m cells')
