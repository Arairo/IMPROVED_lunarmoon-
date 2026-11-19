"""Fetch an LROC NAC controlled mosaic and put it on one of our 20 m terrain
tiles, so tools/lroc_shadow_check.mjs can compare real shadows with predicted
ones. Run in GitHub Actions (needs GDAL and network access to pds.lroc.im-ldi.com).

  python3 tools/lroc_fetch.py data-raw/lroc            # warp the mosaic
  python3 tools/lroc_fetch.py data-raw/lroc --png      # write the comparison PNG

The mosaic: NAC_ROI_CABEUSPKLOB_P836S2912 (Peak Near Cabeus B, one of NASA's
Artemis III candidate regions), 8 NAC images from 2017-09-18 12:15-18:07 UTC,
controlled to LOLA, 20 m/px version. Henriksen et al. (2023), ELS.
"""
import json, os, sys
from datetime import datetime, timedelta, timezone
import numpy as np
from osgeo import gdal

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(__file__), '..')
SITE = 'a3-cb'
URL = ('https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/BDR/NAC_ROI/'
       'CABEUSPKLOB/NAC_ROI_CABEUSPKLOB_P836S2912_20M.IMG')
# Image IDs carry the spacecraft clock in seconds; the first one started at 12:15:45.682 UTC.
IMAGES = ['M1260376212', 'M1260383231', 'M1260390268', 'M1260397299']
T0 = datetime(2017, 9, 18, 12, 15, 45, 682000, tzinfo=timezone.utc)
times = [(T0 + timedelta(seconds=int(i[1:]) - int(IMAGES[0][1:]))).isoformat().replace('+00:00', 'Z') for i in IMAGES]

if '--png' in sys.argv:
    meta = json.load(open(os.path.join(OUT, 'panel.json')))
    w, h = meta['width'], meta['height']
    rgb = np.fromfile(os.path.join(OUT, 'panel.rgb'), dtype=np.uint8).reshape(h, w, 3)
    mem = gdal.GetDriverByName('MEM').Create('', w, h, 3, gdal.GDT_Byte)
    for b in range(3):
        mem.GetRasterBand(b + 1).WriteArray(rgb[:, :, b])
    gdal.GetDriverByName('PNG').CreateCopy(os.path.join(ROOT, 'public', 'data', 'lroc_check.png'), mem)
    print('wrote public/data/lroc_check.png', w, h)
    sys.exit(0)

tile = json.load(open(os.path.join(ROOT, 'public', 'data', 'hires', f'{SITE}.json')))
cx, cy, half = tile['centreX'], tile['centreY'], tile['halfExtent']
src = gdal.Open('/vsicurl/' + URL)
if src is None:
    sys.exit('could not open ' + URL)
print(gdal.Info(src, format='json')['coordinateSystem']['wkt'][:300])
b = src.GetRasterBand(1)
print('band', gdal.GetDataTypeName(b.DataType), 'nodata', b.GetNoDataValue(), 'scale', b.GetScale(), 'offset', b.GetOffset())
dst_srs = '+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs'
warped = gdal.Warp(os.path.join(OUT, 'lroc_tile.tif'), src, dstSRS=dst_srs, outputBounds=(cx - half, cy - half, cx + half, cy + half),
                   xRes=20, yRes=20, resampleAlg='average', outputType=gdal.GDT_Float32, dstNodata=-9999)
a = warped.GetRasterBand(1).ReadAsArray().astype(np.float32)
nd = b.GetNoDataValue()
if nd is not None:
    a[a == nd] = -9999
a[~np.isfinite(a)] = -9999
valid = a > -9999
print('warped', a.shape, 'valid', round(valid.mean() * 100, 1), '%', 'value range', float(a[valid].min()) if valid.any() else None, float(a[valid].max()) if valid.any() else None)
a.tofile(os.path.join(OUT, 'lroc.f32'))
json.dump({'site': SITE, 'size': a.shape[0], 'cellSize': 20, 'centreX': cx, 'centreY': cy, 'halfExtent': half,
           'rowOrder': 'row 0 at +y', 'noData': -9999, 'imageTimes': times, 'images': IMAGES,
           'product': 'NAC_ROI_CABEUSPKLOB_P836S2912_20M', 'url': URL},
          open(os.path.join(OUT, 'lroc.json'), 'w'), indent=1)
