#!/usr/bin/env python3
"""Fetch NASA PGDA products for the south pole (runs in GitHub Actions, which can
reach pgda.gsfc.nasa.gov; GDAL reads only the parts of the files it needs).

  python3 tools/pgda_fetch.py OUT_DIR

Writes to OUT_DIR:
  dem_<id>.f32 + dem_<id>.json       20 m LOLA terrain windows (Barker et al. 2023,
                                      LDEM_80S_20MPP_ADJ): a 16 km grid of tiles covering
                                      each Artemis III candidate region (id reg_<i>_<j>),
                                      plus a window around each south-polar site that
                                      those tiles do not already cover
  windows.json                       the list of windows
  illum_sun.f32, illum_earth.f32     PGDA average Sun / Earth visibility resampled to
                                      the app's 184 x 184, 5 km south-cap grid (+-460 km)
  illum_meta.json                    file info, units and point values at each site
No orientation is assumed beyond the polar stereographic definition; the Node
step (tools/build_hires_terrain.mjs) checks it against the app's own LOLA grids.
"""
import time
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
# A local copy (the workflow downloads the whole file first: one 2.6 GB download is far
# quicker and steadier than hundreds of ranged reads from NASA's server).
LOCAL_DEM = os.environ.get('LDEM20_LOCAL', 'data-raw/ldem20.tif')
SUN_URL = '/vsicurl/https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608.TIF'
EARTH_URL = '/vsicurl/https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608_EARTH.TIF'
SUN85_URL = '/vsicurl/https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608.TIF'
HALF = 10040.0  # 20 m window around each site outside the 16 km grid: 10 km all round (+2 cells)
# docs/validation/terrain-study.md: 20 m terrain out to 10 km from the observer, then the
# 240 m grid, matches 20 m terrain all the way out to within 0.1 point of sunlight; the
# 240 m grid alone near a point was off by up to 12 points (sunlight) and 25 (Earth).
# So the 16 km grid of 20 m tiles covers everything within POLAR_CAP of the pole, and the
# app loads the tiles within 10 km of a point (HIRES_REACH_M in src/core/horizon.js).
POLAR_CAP = 160000.0  # metres from the pole (about 84.7 deg S)
TILE = 16000.0  # region tiles: a fixed 16 km grid in polar stereographic metres
OVERLAP = 40.0  # each region tile reads 2 extra cells per side so neighbours join up
MARGIN = 1000.0  # region tiles cover each region's outline plus this margin
REGIONS = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'artemis_regions.geojson')))['features']


def xy(lat, lon):
    rho = 2 * R * math.tan(math.pi / 4 + math.radians(lat) / 2)
    return rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))


def info(ds):
    gt = ds.GetGeoTransform()
    unit = 1000.0 if abs(gt[1]) < 5 else 1.0  # projected units in km or m
    b = ds.GetRasterBand(1)
    nd = b.GetNoDataValue()
    if nd is not None and math.isnan(nd):
        nd = 'nan'
    return {
        'size': [ds.RasterXSize, ds.RasterYSize],
        'geotransform': gt,
        'unitToMetres': unit,
        'noData': nd,
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
        # NASA's server sometimes returns an empty range read; retry a few times.
        for attempt in range(5):
            try:
                a = ds.GetRasterBand(1).ReadAsArray(xs0, ys0, xs1 - xs0, ys1 - ys0).astype(np.float32)
                break
            except RuntimeError as e:
                print(f'window read failed (try {attempt + 1}/5):', str(e)[:160], flush=True)
                time.sleep(3 * (attempt + 1))
        else:
            raise RuntimeError('window read kept failing')
        nd = meta['noData']
        if nd is not None and nd != 'nan':
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
        for attempt in range(3):
            try:
                v = float(ds.GetRasterBand(1).ReadAsArray(px, py, 1, 1)[0, 0])
                break
            except RuntimeError as e:
                print('point read failed, retrying:', str(e)[:120], flush=True)
        else:
            return None
        if meta['noData'] is not None and meta['noData'] != 'nan' and v == meta['noData']:
            return None
        return v * (meta['scale'] or 1) + (meta['offset'] or 0)
    return None


# --- 20 m terrain windows --------------------------------------------------
dem = gdal.Open(LOCAL_DEM if os.path.exists(LOCAL_DEM) else DEM_URL)
dmeta = info(dem)
print('DEM', json.dumps(dmeta, default=str)[:900], flush=True)
def tag(k):
    return f"m{-k}" if k < 0 else str(k)


def region_tiles():
    """16 km grid cells touching each region's outline (+ MARGIN), shared between regions."""
    tiles = {}
    for f in REGIONS:
        pts = [xy(lat, lon) for lon, lat in f['geometry']['coordinates'][0]]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        for i in range(math.floor((min(xs) - MARGIN) / TILE), math.floor((max(xs) + MARGIN) / TILE) + 1):
            for j in range(math.floor((min(ys) - MARGIN) / TILE), math.floor((max(ys) + MARGIN) / TILE) + 1):
                t = tiles.setdefault((i, j), {'id': f'reg_{tag(i)}_{tag(j)}', 'x': (i + 0.5) * TILE, 'y': (j + 0.5) * TILE, 'regions': []})
                t['regions'].append(f['properties']['RegionCode'])
    return list(tiles.values())


REG = region_tiles()


def polar_tiles():
    """16 km grid cells within POLAR_CAP of the pole that the region tiles don't already cover."""
    have = {t['id'] for t in REG}
    out = []
    k = math.ceil(POLAR_CAP / TILE)
    for i in range(-k, k):
        for j in range(-k, k):
            # nearest point of the cell [i*TILE, (i+1)*TILE] x [j*TILE, (j+1)*TILE] to the pole
            nx = min(max(0.0, i * TILE), (i + 1) * TILE)
            ny = min(max(0.0, j * TILE), (j + 1) * TILE)
            if math.hypot(nx, ny) > POLAR_CAP:
                continue
            tid = f'reg_{tag(i)}_{tag(j)}'
            if tid in have:
                continue
            out.append({'id': tid, 'x': (i + 0.5) * TILE, 'y': (j + 0.5) * TILE, 'regions': []})
    return out


POLAR_TILES = polar_tiles()
REG = REG + POLAR_TILES
print(f'{len(POLAR_TILES)} extra tiles cover everything within {POLAR_CAP / 1000:.0f} km of the pole', flush=True)


def covered(x, y, r=HALF - 40.0):
    """True if the square +-r (10 km) around (x, y) lies inside the region tiles."""
    return all(any(abs(px - t['x']) <= TILE / 2 and abs(py - t['y']) <= TILE / 2 for t in REG)
               for px in (x - r, x, x + r) for py in (y - r, y, y + r))


windows = [{**t, 'kind': 'region' if t['regions'] else 'polar', 'half': TILE / 2 + OVERLAP} for t in REG]
for s in POLAR:
    x, y = xy(s['lat'], s['lon'])
    if covered(x, y):
        print(f"{s['id']}: inside the region tiles, no separate window", flush=True)
        continue
    windows.append({'id': s['id'], 'x': x, 'y': y, 'kind': 'site', 'half': HALF})
print(f"{len(REG)} region tiles, {len(windows) - len(REG)} site windows", flush=True)

done = []
for w in windows:
    try:
        a, n, cx, cy = window(dem, dmeta, w['x'], w['y'], w['half'])
    except RuntimeError as e:
        print(f"{w['id']}: SKIPPED, could not read the 20 m window ({e})", flush=True)
        continue
    good = np.isfinite(a)
    print(f"{w['id']}: {n}x{n}, {good.mean() * 100:.1f}% data, median {np.nanmedian(a) if good.any() else float('nan'):.3f}", flush=True)
    a.tofile(os.path.join(OUT, f"dem_{w['id']}.f32"))
    json.dump({'id': w['id'], 'kind': w['kind'], 'regions': w.get('regions'), 'size': n,
               'cellSize': abs(dmeta['geotransform'][1]) * dmeta['unitToMetres'],
               'centreX': cx, 'centreY': cy, 'coverage': float(good.mean()), 'file': dmeta},
              open(os.path.join(OUT, f"dem_{w['id']}.json"), 'w'), default=str)
    done.append(w['id'])
json.dump(done, open(os.path.join(OUT, 'windows.json'), 'w'))

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
    if m['noData'] is not None and m['noData'] != 'nan':
        arr[arr == m['noData']] = np.nan
    arr = arr * (m['scale'] or 1) + (m['offset'] or 0)  # stored as scaled integers
    print(name, 'grid min/max/mean', np.nanmin(arr), np.nanmax(arr), np.nanmean(arr), flush=True)
    arr.tofile(os.path.join(OUT, f'illum_{name}.f32'))
    for s in POLAR:
        meta['sites'].setdefault(s['id'], {})[name + '120m'] = point(ds, m, *xy(s['lat'], s['lon']))

def neighbourhood(ds, meta, x, y, r=1):
    """Centre pixel, median and zero count of the (2r+1)^2 pixels around (x, y).
    A single 60 m pixel can sit in a gap or a tiny pit (the ridge read 0% here while
    the 120 m map gives 67.7%), so the comparison uses the 3x3 median and keeps the
    centre value and the zero count for inspection."""
    gt, u = meta['geotransform'], meta['unitToMetres']
    px = int((x / u - gt[0]) / gt[1]); py = int((y / u - gt[3]) / gt[5])
    x0, y0 = px - r, py - r
    if x0 < 0 or y0 < 0 or x0 + 2 * r + 1 > ds.RasterXSize or y0 + 2 * r + 1 > ds.RasterYSize:
        return {'error': 'outside the product', 'px': px, 'py': py, 'size': [ds.RasterXSize, ds.RasterYSize]}
    a, last = None, None
    # NASA's server sometimes returns an empty range read: retry with a growing pause.
    for attempt in range(6):
        try:
            a = ds.GetRasterBand(1).ReadAsArray(x0, y0, 2 * r + 1, 2 * r + 1)
            if a is not None:
                break
            last = 'empty read'
        except RuntimeError as e:
            last = str(e)[:160]
        print(f'neighbourhood read failed (try {attempt + 1}/6): {last}', flush=True)
        time.sleep(2 * (attempt + 1))
    if a is None:
        v = point(ds, meta, x, y)  # last resort: the single pixel, as before
        return {'error': f'3x3 read failed: {last}', 'centre': v, 'median': v, 'zeros': None, 'n': 1 if v is not None else 0} if v is not None else {'error': f'read failed: {last}'}
    a = a.astype(np.float64)
    nd = meta['noData']
    if nd is not None and nd != 'nan':
        a[a == nd] = np.nan
    a = a * (meta['scale'] or 1) + (meta['offset'] or 0)
    good = a[np.isfinite(a)]
    if not good.size:
        return {'error': 'all no-data'}
    return {'centre': float(a[r, r]), 'median': float(np.median(good)), 'zeros': int((good == 0).sum()), 'n': int(good.size)}


try:
    ds85 = gdal.Open(SUN85_URL)
    m85 = info(ds85)
    meta['products']['sun85'] = {'url': SUN85_URL.replace('/vsicurl/', ''), **m85}
    print('sun85', json.dumps(m85, default=str)[:900], flush=True)
    for s in POLAR:
        nb = neighbourhood(ds85, m85, *xy(s['lat'], s['lon']))
        meta['sites'][s['id']]['sun60m'] = nb.get('median') if nb else None
        meta['sites'][s['id']]['sun60mDetail'] = nb
        print(f"{s['id']}: 60 m 3x3 {nb}", flush=True)
except RuntimeError as e:
    print('60 m Sun map unavailable, using the 120 m one only:', e, flush=True)
json.dump(meta, open(os.path.join(OUT, 'illum_meta.json'), 'w'), indent=1, default=str)
print(json.dumps(meta['sites'], indent=1), flush=True)
