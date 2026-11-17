#!/usr/bin/env python3
"""Fetch NASA PGDA products for the south pole (runs in GitHub Actions, which can
reach pgda.gsfc.nasa.gov; GDAL reads only the parts of the files it needs).

  python3 tools/pgda_fetch.py OUT_DIR

Writes to OUT_DIR:
  dem_<site>.f32 + dem_<site>.json   20 m LOLA terrain windows (Barker et al. 2023,
                                      LDEM_80S_20MPP_ADJ) around each south-polar site
  illum_sun.f32, illum_earth.f32     PGDA average Sun / Earth visibility resampled to
                                      the app's 184 x 184, 5 km south-cap grid (+-460 km)
  illum_meta.json                    file info, units and point values at each site
No orientation is assumed beyond the polar stereographic definition; the Node
step (tools/build_hires_terrain.mjs) checks it against the app's own LOLA grids.
"""
import json, math, sys, os
import numpy as np
from osgeo import gdal

gdal.UseExceptions()
gdal.SetConfigOption('GDAL_HTTP_MAX_RETRY', '5')
gdal.SetConfigOption('GDAL_HTTP_RETRY_DELAY', '3')
gdal.SetConfigOption('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.TIF,.tif')

R = 1737400.0
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
SITES = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'sites.json')))
SITES = SITES if isinstance(SITES, list) else SITES.get('sites', [])
POLAR = [s for s in SITES if s['lat'] <= -80]
DEM_URL = '/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF'
SUN_URL = '/vsicurl/https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608.TIF'
EARTH_URL = '/vsicurl/https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608_EARTH.TIF'
SUN85_URL = '/vsicurl/https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608.TIF'
HALF = 8000.0  # 20 m window: +-8 km around each site


def xy(lat, lon):
    rho = 2 * R * math.tan(math.pi / 4 + math.radians(lat) / 2)
    return rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))


def info(ds):
    gt = ds.GetGeoTransform()
    unit = 1000.0 if abs(gt[1]) < 5 else 1.0  # projected units in km or m
    b = ds.GetRasterBand(1)
    return {
        'size': [ds.RasterXSize, ds.RasterYSize],
        'geotransform': gt,
        'unitToMetres': unit,
        'noData': b.GetNoDataValue(),
        'dtype': gdal.GetDataTypeName(b.DataType),
        'scale': b.GetScale(), 'offset': b.GetOffset(),
        'block': b.GetBlockSize(),
        'wkt': ds.GetProjection()[:600],
    }


def window(ds, meta, x, y, half):
    gt, u = meta['geotransform'], meta['unitToMetres']
    px = (x / u - gt[0]) / gt[1]
    py = (y / u - gt[3]) / gt[5]
    n = int(round(2 * half / (abs(gt[1]) * u)))
    x0, y0 = int(round(px - n / 2)), int(round(py - n / 2))
    xs0, ys0 = max(0, x0), max(0, y0)
    xs1, ys1 = min(ds.RasterXSize, x0 + n), min(ds.RasterYSize, y0 + n)
    out = np.full((n, n), np.nan, dtype=np.float32)
    if xs1 > xs0 and ys1 > ys0:
        a = ds.GetRasterBand(1).ReadAsArray(xs0, ys0, xs1 - xs0, ys1 - ys0).astype(np.float32)
        nd = meta['noData']
        if nd is not None:
            a[a == nd] = np.nan
        out[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] = a
    # centre of the window in metres (cell centres)
    cx = (gt[0] + (x0 + n / 2) * gt[1]) * u
    cy = (gt[3] + (y0 + n / 2) * gt[5]) * u
    return out, n, cx, cy


def point(ds, meta, x, y):
    gt, u = meta['geotransform'], meta['unitToMetres']
    px = int((x / u - gt[0]) / gt[1])
    py = int((y / u - gt[3]) / gt[5])
    if 0 <= px < ds.RasterXSize and 0 <= py < ds.RasterYSize:
        v = float(ds.GetRasterBand(1).ReadAsArray(px, py, 1, 1)[0, 0])
        return None if meta['noData'] is not None and v == meta['noData'] else v
    return None


# --- 20 m terrain windows --------------------------------------------------
dem = gdal.Open(DEM_URL)
dmeta = info(dem)
print('DEM', json.dumps(dmeta, default=str)[:900], flush=True)
for s in POLAR:
    x, y = xy(s['lat'], s['lon'])
    a, n, cx, cy = window(dem, dmeta, x, y, HALF)
    good = np.isfinite(a)
    print(f"{s['id']}: {n}x{n}, {good.mean() * 100:.1f}% data, median {np.nanmedian(a) if good.any() else float('nan'):.3f}", flush=True)
    a.tofile(os.path.join(OUT, f"dem_{s['id']}.f32"))
    json.dump({'id': s['id'], 'size': n, 'cellSize': abs(dmeta['geotransform'][1]) * dmeta['unitToMetres'],
               'centreX': cx, 'centreY': cy, 'coverage': float(good.mean()), 'file': dmeta},
              open(os.path.join(OUT, f"dem_{s['id']}.json"), 'w'), default=str)

# --- PGDA illumination, resampled to the app's 5 km south cap --------------
meta = {'products': {}, 'sites': {}}
CAP = 460000.0
for name, url in (('sun', SUN_URL), ('earth', EARTH_URL)):
    ds = gdal.Open(url)
    m = info(ds)
    u = m['unitToMetres']
    meta['products'][name] = {'url': url.replace('/vsicurl/', ''), **m}
    print(name, json.dumps(m, default=str)[:900], flush=True)
    w = gdal.Warp('', ds, format='MEM', outputBounds=(-CAP / u, -CAP / u, CAP / u, CAP / u),
                  width=184, height=184, resampleAlg='average', dstNodata=-9999)
    arr = w.GetRasterBand(1).ReadAsArray().astype(np.float32)
    arr[arr == -9999] = np.nan
    if m['noData'] is not None:
        arr[arr == m['noData']] = np.nan
    print(name, 'grid min/max/mean', np.nanmin(arr), np.nanmax(arr), np.nanmean(arr), flush=True)
    arr.tofile(os.path.join(OUT, f'illum_{name}.f32'))
    for s in POLAR:
        meta['sites'].setdefault(s['id'], {})[name + '120m'] = point(ds, m, *xy(s['lat'], s['lon']))

ds85 = gdal.Open(SUN85_URL)
m85 = info(ds85)
meta['products']['sun85'] = {'url': SUN85_URL.replace('/vsicurl/', ''), **m85}
for s in POLAR:
    meta['sites'][s['id']]['sun60m'] = point(ds85, m85, *xy(s['lat'], s['lon']))
json.dump(meta, open(os.path.join(OUT, 'illum_meta.json'), 'w'), indent=1, default=str)
print(json.dumps(meta['sites'], indent=1), flush=True)
