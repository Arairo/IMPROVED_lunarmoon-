#!/usr/bin/env python3
"""Downscale NASA Blue Marble (public/data/earth_blue_marble_4k.jpg) to 2048 x 1024.

Earth is drawn small in the 3D Moon, flight and intro views (never more than a few
hundred pixels across), so the 4k image (1.5 MB) only costs download time there.
The Terrain 3D page keeps the 4k one.

    python3 tools/make_earth_2k.py
"""
from pathlib import Path
from PIL import Image

data = Path(__file__).resolve().parent.parent / "public" / "data"
im = Image.open(data / "earth_blue_marble_4k.jpg").convert("RGB")
im.resize((2048, 1024), Image.LANCZOS).save(data / "earth_blue_marble_2k.jpg", quality=84, optimize=True, progressive=True)
print("wrote", data / "earth_blue_marble_2k.jpg", (data / "earth_blue_marble_2k.jpg").stat().st_size, "bytes")
