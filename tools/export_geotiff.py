"""Write the app's 2027 lighting maps as GeoTIFFs for GIS and scripts.

  python3 tools/export_geotiff.py            # -> public/api/v1/maps/*.tif

Uses GDAL through rasterio. Projections are the IAU standard Moon ones, the
same as NASA PGDA's polar products:
  IAU_2015:30135  south polar stereographic, sphere R = 1737.4 km
  IAU_2015:30130  north polar stereographic
  IAU_2015:30100  lat/lon (global map)
Values are percent of 2027 (Float32), from public/data/layers.* and
public/data/sp_illum_2027.json.
"""
import json, os, sys
import numpy as np
import rasterio
from rasterio.transform import from_origin

ROOT = os.path.join(os.path.dirname(__file__), '..')
DATA = os.path.join(ROOT, 'public', 'data')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'public', 'api', 'v1', 'maps')
os.makedirs(OUT, exist_ok=True)

meta = json.load(open(os.path.join(DATA, 'layers.json')))
raw = np.fromfile(os.path.join(DATA, 'layers.bin'), dtype=np.uint8)
dims = {'global': (meta['global']['height'], meta['global']['width']),
        'south': (meta['south']['size'],) * 2, 'north': (meta['north']['size'],) * 2}
arrays, off = {}, 0
for name in meta['order']:
    h, w = dims[name.split('.')[0]]
    arrays[name] = raw[off:off + h * w].reshape(h, w).astype(np.float32) / 2.0
    off += h * w
assert off == raw.size, (off, raw.size)

WHAT = {'sun': "Sun's centre above the LOLA skyline", 'earth': "Earth's centre above the LOLA skyline",
        'both': 'Sun and Earth both above the skyline'}
written = []

def write(path, arr, crs, transform, desc, extra=None):
    with rasterio.open(path, 'w', driver='GTiff', height=arr.shape[0], width=arr.shape[1], count=1,
                       dtype='float32', crs=crs, transform=transform, nodata=-1, compress='deflate', predictor=3) as ds:
        ds.write(arr, 1)
        tags = dict(DESCRIPTION=desc, UNITS='percent of 2027', SOURCE='Lunar Site Planner, NASA LRO LOLA terrain',
                    MAST_M=str(meta['mastM']), STEP_HOURS=str(meta['stepHours']))
        tags.update(extra or {})
        ds.update_tags(**tags)
        ds.set_band_description(1, desc)
    written.append(os.path.basename(path))

for cap, code in (('south', 'IAU_2015:30135'), ('north', 'IAU_2015:30130')):
    m = meta[cap]
    tr = from_origin(-m['halfExtentM'], m['halfExtentM'], m['cellM'], m['cellM'])
    for k in ('sun', 'earth', 'both'):
        write(os.path.join(OUT, f'{cap}_{k}_2027_5km.tif'), arrays[f'{cap}.{k}'], code, tr,
              f'{WHAT[k]}, share of 2027, {cap} polar cap at 5 km')

g = meta['global']
tr = from_origin(-180, 90, g['cellDeg'], g['cellDeg'])
for k in ('sun', 'earth', 'both'):
    write(os.path.join(OUT, f'global_{k}_2027_1deg.tif'), arrays[f'global.{k}'], 'IAU_2015:30100', tr,
          f'{WHAT[k]}, share of 2027, whole Moon at 1 degree')

il = json.load(open(os.path.join(DATA, 'sp_illum_2027.json')))
n, half, cell, sc = il['size'], il['halfExtent'], il['cellSize'], il['scale']
tr = from_origin(-half, half, cell, cell)
for key, desc in (('illum', 'Average visible fraction of the solar disk'), ('earth', "Share of time with Earth's centre above the skyline")):
    a = np.array(il[key], dtype=np.float32).reshape(n, n) / sc * 100
    write(os.path.join(OUT, f'south_{"sun_disk" if key == "illum" else "earth"}_2027_1km.tif'), a, 'IAU_2015:30135', tr,
          f'{desc}, 2027, within 75 km of the south pole at 1 km', {'STEP_HOURS': str(il['stepMs'] / 3600000)})
dark = np.array(il['darkH'], dtype=np.float32).reshape(n, n)
write(os.path.join(OUT, 'south_longest_dark_2027_1km.tif'), dark, 'IAU_2015:30135', tr,
      'Longest continuous stretch without any sunlight in 2027 (hours), within 75 km of the south pole at 1 km',
      {'UNITS': 'hours'})

json.dump({'files': written, 'crs': {'south': 'IAU_2015:30135', 'north': 'IAU_2015:30130', 'global': 'IAU_2015:30100'},
           'note': 'Percent of 2027 unless the file says hours. GeoTIFF, Float32, nodata -1. Built by tools/export_geotiff.py.'},
          open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
print('\n'.join(written))
