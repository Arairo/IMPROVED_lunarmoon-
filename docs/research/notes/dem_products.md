# Lunar south-pole elevation (DEM) products for sunlight, Earth-visibility and slope calculations

Research date: 2026-11-25. Scope: poleward of about 80°S (60°S where a product reaches that far).

**How these notes were sourced.** The two most important hosts, pgda.gsfc.nasa.gov and pds-geosciences.wustl.edu, could not be opened from this research session (DNS blocked by the session's network allowlist; the same hosts are reachable from the project's GitHub Actions runner, see `tools/pgda_fetch.py`). Product-page facts below therefore come from search-engine extracts of those pages, from the NTRS and IOP copies of the papers, and from secondary sources. They are cited, but **file sizes, exact file names and extents should be re-checked against the live PGDA/PDS listings before you depend on them**. Kilometre extents marked "(computed)" are my own, from the polar stereographic formula ρ = 2R·tan(colatitude/2) with R = 1737.4 km. That formula comes from the [ODE GDRDEM help page](https://ode.rsl.wustl.edu/Moon/pagehelp/Content/Missions_Instruments/Lunar%20Reconnaissance%20Orbiter%20(LRO)/LOLA/GDR/GDRDEM.htm).

Computed half-widths of a pole-centred polar stereographic square (R = 1737.4 km; surface arc distance from the pole in brackets): 89°S 30.3 km · 88°S 60.7 km · 87.5°S 75.8 km · 87°S 91.0 km · 86°S 121.3 km · 85°S 151.7 km · 84°S 182.1 km · 83°S 212.5 km · 80°S 304.0 km (303.2) · 75°S 457.5 km (454.9) · 60°S 931.1 km (909.7). The app's current 240 m field to 180 km therefore stops at about 84.1°S, and its 1 km field to 460 km stops at about 75°S.

---

## Q1. Which LOLA polar DEMs exist, and what extent does each cover?

### Takeaway
The current reference set is NASA Goddard PGDA **product 90** (Barker et al. 2023, PSJ 4:183). It has a nested family of orbit-adjusted LOLA DEMs: 20 m over 80–90°S (about 606 × 606 km, ±304 km), 10 m to about 83°S, and 60/120/240 m grids reaching 60°S (±931 km). It also provides per-pixel height-error and effective-resolution rasters, all as cloud-optimized GeoTIFFs. Two 5 m LOLA-only products sit inside that set. **PGDA 78** (Barker et al. 2021) covers individual 16 × 16 km to 20 × 20 km site fields. **PGDA 81** is a 5 m mosaic of 97 fields covering 87–90°S (about ±91 km). The older PDS GDR polar files (LDEM_875S_5M, LDEM_85S_10M, LDEM_80S_20M and others) are superseded by the "_ADJ" products.

### Cited Findings

**Catalogue (south pole only)**

| Product / file | Pixel | Coverage | Format & size | Where | Notes |
|---|---|---|---|---|---|
| **LDEM_80S_20MPP_ADJ** (PGDA 90) | 20 m | 80–90°S, about 606 × 606 km | COG GeoTIFF, about 2.6 GB (height) | `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF` | "Reference topographic product" of Barker et al. 2023. Has _ERR (height error) and _EFFRES (effective resolution) companion rasters. Renamed from PDS LDEM_80S_20M. |
| **LDEM_83S_10MPP_ADJ** (PGDA 90) | 10 m | to about 83°S (one secondary source says 237 × 257 km, see Gaps) | COG, about 4.8 GB (height) | PGDA product 90 page | Renamed from LDEM_85S_10M; maximum latitude changed from 85° to 83°S. |
| **LDEM_80S_80MPP_ADJ** (PGDA 90) | 80 m | 80–90°S | COG | PGDA product 90 page | Cited by third-party repos only; not verified on the PGDA page. |
| **LDEM_60S_60MPP_ADJ / _120MPP_ADJ / _240MPP_ADJ** (PGDA 90) | 60 / 120 / 240 m | 60–90°S, ±931.2 km from the pole | COG; the 240 m file is about 210 MB | PGDA product 90 page | Also _ERR, _EFFRES and _HILL rasters, plus LDSM slope maps. |
| **ldem_87s_5mpp** (PGDA 81, "South Pole LOLA DEM Mosaic") | 5 m | 87–90°S (computed ±91 km) | GeoTIFF: height about 3.3 GB, hillshade about 820 MB, count map ldec_87s_5mpp about 140 MB | `pgda.gsfc.nasa.gov/products/81` | Mosaic of 97 fields of 20 × 20 km with 2 km overlaps. RMS residual against the individual fields is 30–55 cm. |
| **PGDA 78 site DEMs** (Barker et al. 2021) | 5 m | Barker 2021: four 16 × 16 km regions; the product page now lists more sites | GeoTIFF, south polar stereographic | `pgda.gsfc.nasa.gov/products/78` | Sites include Connecting Ridge, Shackleton Rim, Peak near Shackleton, de Gerlache Rim, Leibnitz Beta Plateau, Malapert Massif, Haworth, Shoemaker, DM1 Amundsen rim and DM2 Nobile rim 2. About 90% of pixels are interpolated. |
| **LDEM_875S_5M** (PDS GDR, legacy) | 5 m | 87.5–90°S | PDS IMG (int16) + JP2 + LBL/XML | PDS Geosciences LOLA GDR `polar/` directory; MIT mirror `imbrium.mit.edu/DATA/LOLA_GDR/POLAR/` | Legacy, not orbit-adjusted. |
| **LDEM_85S_10M, LDEM_80S_20M** (PDS GDR, legacy) | 10 / 20 m | 85–90°S / 80–90°S | PDS IMG/JP2 | PDS / imbrium | Superseded by the _ADJ versions in PGDA 90. |
| **LDEM_85S_40M, LDEM_80S_40M, LDEM_80S_80M, LDEM_75S_240M (+ FLOAT_IMG)** (PDS GDR, legacy) | 40–240 m | 85, 80 and 75°S caps | PDS IMG/JP2/LBL; FLOAT_IMG variant | imbrium browse and DATA trees | Older, coarser, not orbit-adjusted. |

Sources for the table rows:
- Barker et al. 2023 describe new profiles and maps "including uncertainty estimates, over larger areas (out to 30° from the south pole) and at different pixel scales (10–240 m pixel⁻¹)", plus new roughness and PSR maps. Citation: Barker, M. K., et al. (2023), "A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter (LOLA)," *Planet. Sci. J.* 4:183, doi:10.3847/PSJ/acf3e1. — [IOP](https://iopscience.iop.org/article/10.3847/PSJ/acf3e1); [NTRS preprint](https://ntrs.nasa.gov/api/citations/20230014419/downloads/BarkernewviewSTIupdated.pdf)
- "The reference topographic product in this study is the 80°–90° 20 m/pix south" LDEM. The paper's table maps old to new names (LDEM_85S_10M → LDEM_83S_10MPP_ADJ with maximum latitude changed from 85° to 83°S; LDEM_80S_20M → LDEM_80S_20MPP_ADJ). It also lists LDEM_60S_60MPP_ADJ, LDEM_60S_120MPP_ADJ and LDEM_60S_240MPP_ADJ, all covering ±931.2 km from the pole. — [NTRS preprint](https://ntrs.nasa.gov/api/citations/20230014419/downloads/BarkernewviewSTIupdated.pdf); [IOP abstract page](https://iopscience.iop.org/article/10.3847/PSJ/acf3e1/meta)
- PGDA product 90 lists GeoTIFFs for each product: surface height, effective resolution, height error, hillshade and slope. The 20 m height file is about 2.6 GB, the 10 m height file about 4.8 GB and LDEM_60S_240MPP_ADJ about 210 MB. "All TIF files are cloud-optimized GeoTiffs (COGs) with south polar stereographic X/Y coordinates in meters". MOON_ME frame, referenced to JPL DE421. A 20 m PSR map is included. — [PGDA product 90](https://pgda.gsfc.nasa.gov/products/90)
- The 20 m height file's exact HTTPS path, `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF`, is the one the project already reads with GDAL `/vsicurl` range requests. — local file `/home/user/IMPROVED_lunarmoon-/tools/pgda_fetch.py` (DEM_URL)
- One secondary description: "an 80°S map covering an area of 606 × 606 km with a 20-meter resolution, (ii) an 83°S map covering an area of 237 × 257 km with a 10-meter resolution". — [ResearchGate entry for Barker et al. 2023 / citing paper](https://www.researchgate.net/publication/374316325_A_New_View_of_the_Lunar_South_Pole_from_the_Lunar_Orbiter_Laser_Altimeter_LOLA)
- PGDA 81: 5 m/pix GeoTIFFs with south polar stereographic X/Y in metres, 87–90°S, built from 97 individual 20 × 20 km fields with 2 km overlaps (overlap regions contain non-integer counts), typical RMS residual 30–55 cm against the individual fields. Files: ldem_87s_5mpp about 3.3 GB, hillshade about 820 MB, ldec_87s_5mpp count map about 140 MB. Method reference is Barker et al. 2021. — [PGDA product 81](https://pgda.gsfc.nasa.gov/products/81)
- NASA's Lunar Surface Data Book (M2M-30044, 2025) describes PGDA 81 as "5 meters per pixel resolution covering much of the South Pole", poleward of 87°, and lists PGDA 78 as the "South Pole LOLA Hi-Res" 5 m product. — [NTRS M2M-30044](https://ntrs.nasa.gov/api/citations/20250002845/downloads/M2M-30044%20Lunar%20Surface%20Data%20Book%20Baseline_Final.pdf)
- PGDA 78 site list: Connecting Ridge, Shackleton Rim, Peak near Shackleton, de Gerlache Rim, Leibnitz Beta Plateau, Malapert Massif, Haworth, Shoemaker, DM1 Amundsen rim, DM2 Nobile rim 2. — [PGDA product 78](https://pgda.gsfc.nasa.gov/products/78)
- Barker et al. 2021 derived "new high-resolution DEMs of four 16 × 16 km regions surrounding high-priority lunar south pole landing sites using exclusively laser altimetry data". Raw LOLA returns are binned into 5 m pixels after track adjustment. Citation: Barker, M. K., et al. (2021), "Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions," *Planet. Space Sci.* 203, 105119, doi:10.1016/j.pss.2020.105119. — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0032063320303329); [NTRS full text](https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf)
- Legacy PDS GDR polar files: the LDEM_875S_5M, LDEM_85S_40M and LDEM_80S_40M browse pages exist on the MIT LOLA mirror. The polar products use polar stereographic projection "at latitudes from 45 degrees to the poles", and JPEG2000 was adopted for GDRs in February 2010. — [imbrium South Pole browse](https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE); [LDEM_875S_5M browse](http://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE/LDEM_875S_5M.html); [LDEM_85S_40M browse](http://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE/LDEM_85S_40M.html); [LDEM_80S_40M browse](https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE/LDEM_80S_40M.html); [LOLA archive SIS](https://imbrium.mit.edu/DOCUMENT/archsis.htm)
- LDEM_80S_80M is distributed as .JP2, .IMG and PDS labels under data set LRO-L-LOLA-4-GDR-V1.0. — [NASA NESC-RP-23-01853](https://nescacademy.nasa.gov/workshop/FlightSim/downloads/NESC-RP-23-01853%20Expansion%20of%20Check-Cases%20for%206DOF%20Simulation%20(Vol.%20I)%20(09-19-24%20NRB)%20RP%20FINAL.pdf)
- A float-format 240 m south polar file exists at `http://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/FLOAT_IMG/LDEM_75S_240M_FLOAT.IMG`. — [arXiv 2003.12640 appendix](https://arxiv.org/pdf/2003.12640)
- PDS GDR polar files come in .img and .jp2. One community guide calls the 5 m file a 16-bit greyscale image in polar stereographic projection. — [finkh 3D workflow](https://finkh.wordpress.com/3d-workflow/)
- Related PGDA products. PGDA 92 is "Large-scale Lunar Elevation Models to Support Optical Navigation": approach-navigation DEMs around 30 m/pix along the landing path. It notes that existing south-pole products are 5–30 m/pix poleward of 80°S and that SLDEM2015 is about 60 m/pix. — [PGDA 92](https://pgda.gsfc.nasa.gov/products/92). PGDA 98 covers large-scale roughness of the lunar poles. — [PGDA 98](https://pgda.gsfc.nasa.gov/products/98); [PSJ paper](https://iopscience.iop.org/article/10.3847/PSJ/adbc9d)
- The illumination maps the app is validated against are PGDA product 69 (Lunar Polar Illumination). Files include AVGVISIB_85S_060M_201608.TIF (60 m, 85–90°S), AVGVISIB_75S_120M_201608.TIF and the _EARTH variant. The page offers COG links for GIS use. — [PGDA 69](https://pgda.gsfc.nasa.gov/products/69); file URLs in `/home/user/IMPROVED_lunarmoon-/tools/pgda_fetch.py`. The underlying method is Mazarico et al. (2011), *Icarus* 211, 1066–1081, and the maps are "published at 60 m per pixel down to 85°". — [Double Shadows, PSJ](https://iopscience.iop.org/article/10.3847/PSJ/ac9e5b)

### Inferences
- **The PGDA 90 family alone can replace all three of the app's LOLA grids.** The 20 m file covers ±304 km, well past the 180 km mid-field. The 60/120/240 m _ADJ files cover ±931 km, past the 460 km outer field. Rough uncompressed float32 sizes (computed): 20 m about 30,400² px ≈ 3.7 GB (2.6 GB as COG, matching the reported figure); 60 m at 60°S ≈ 31,040² px ≈ 3.9 GB; 120 m ≈ 0.96 GB; 240 m ≈ 0.24 GB (the reported COG is 210 MB, consistent).
- The 5 m files are 30,336² to 36,400² pixels, 1–5 GB each. That is fine for offline preprocessing but not for in-browser fetch. The reported LDEM_875S_5M size of 30,336 × 30,336 at 5 m gives ±75.84 km, which matches the computed 87.5°S half-width of 75.8 km. This is a useful sanity check that the legacy grid is pole-centred.
- The 4.8 GB size reported for the 10 m file fits a full pole-centred 83°S square (±212.5 km, about 42,500² px, 7.2 GB uncompressed float32) better than the "237 × 257 km" quoted by one secondary source (about 2.4 GB uncompressed). Treat the 237 × 257 km figure as doubtful until checked against the file header.
- PGDA's 60 m illumination maps (product 69, 2016 update) predate the 2023 _ADJ DEMs. One source says Mazarico 2011 used DEMs of about 240 m (see Q3 Gaps). The app's 8-point worst-site disagreement may therefore come partly from PGDA's own terrain, not only from the app's 240 m mid-field.

### Gaps
- I could not open the PGDA 90 file list. Unconfirmed: whether LDEM_80S_40MPP_ADJ or LDEM_80S_80MPP_ADJ, or a 30 m product, exist (the brief mentioned 30 m and 120 m mosaics; only the 60S 60/120/240 m and 80S 20 m / 83S 10 m files are confirmed). Also unconfirmed: the exact _ERR, _EFFRES, _HILL and LDSM file names and sizes for each product.
- No primary source gives the exact outer boundary of PGDA 81 beyond "87–90°S", or whether the GeoTIFF is a full square of ±91 km.
- The full current PDS Geosciences LOLA GDR `polar/` listing (all south files, sizes, release dates) could not be retrieved because the host is blocked. One extract says the MIT browse page lists files "from 30 m/pixel near 75°S to 400 m/pixel at 45°S"; I could not verify individual names.
- The site list and per-site file sizes for PGDA 78 beyond the names above were not retrievable. Barker 2021 says four 16 × 16 km regions, PGDA 81 says 20 × 20 km fields; the product page may have grown since 2021.

---

## Q2. What fraction of pixels is constrained by LOLA shots, and what are published height errors?

### Takeaway
At 5 m, about 90% of pixels are interpolated. Only about 10% contain a LOLA return, so the true resolution is set by track spacing, not the grid. Barker et al. 2021 report typical RMS height uncertainty of about 0.30–0.50 m and slope uncertainty of 1.5–2.5° at 5 m inside their site fields. Track adjustment reduced orbit geolocation errors by more than 10×. For the 20 m 80–90°S product, Barker 2023 give an effective-resolution raster (EFFRES) and a height-error raster (ERR). Effective resolution degrades away from the pole; one source says most of the Artemis zone poleward of 84°S is close to 20 m. No source I could reach states one pole-wide "percent constrained" number for the 20 m or 10 m products.

### Cited Findings
- "About 90% of pixels in the 5 m/pixel polar LDEMs are interpolated, because of LOLA's track spacing." — [PGDA product 78](https://pgda.gsfc.nasa.gov/products/78)
- The 5 m/pix LDEM "contains artifacts and has data in only ~10% of pixels near the south pole". This motivated the track-adjusted Barker et al. 2021 products. — [NTRS Barker et al. 2021 full text](https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf); [LEAG 2021 abstract](https://www.hou.usra.edu/meetings/leag2021/pdf/5033.pdf)
- Barker et al. 2021: "by iteratively adjusting the LOLA tracks to the LOLA-based digital elevation model, the authors reduce the orbital geolocation errors by over a factor of 10". About 10–20 cm horizontal and 2–4 cm vertical uncertainty remains per 16 × 16 km region. "The LDEM surface height and slope uncertainties have typical RMS values of ~0.30–0.50 m and ~1.5–2.5°, respectively". Errors were estimated from a Monte Carlo ensemble of 100 fractal "clones". Height errors were propagated to horizon elevation and illumination. — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0032063320303329); [NTRS](https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf)
- A constant horizontal geolocation error becomes a larger vertical error as slope increases, so the largest improvements are on steep terrain. — [ScienceDirect abstract](https://www.sciencedirect.com/science/article/abs/pii/S0032063320303329)
- PGDA 81 mosaic: RMS residual about 30–55 cm against the individual 20 × 20 km fields. A count map (ldec_87s_5mpp) records the number of LOLA returns per pixel, so you can measure the constrained fraction directly. — [PGDA product 81](https://pgda.gsfc.nasa.gov/products/81)
- Barker 2023 define effective resolution as the diameter of the largest circle that fits between LOLA laser spots. It worsens with distance from the pole, and RMS height error rises with effective resolution. The paper has a figure of effective resolution within 10° of the pole. Per-pixel LDEM_80S_20MPP_ADJ_EFFRES.TIF and LDEM_80S_20MPP_ADJ_ERR.TIF are distributed. — [NTRS preprint](https://ntrs.nasa.gov/api/citations/20230014419/downloads/BarkernewviewSTIupdated.pdf); [PGDA 90](https://pgda.gsfc.nasa.gov/products/90)
- "Most of the Artemis zone poleward of 84°S has an effective resolution near 20 m" (search extract attributed to Barker et al. 2023). — [IOP abstract page](https://iopscience.iop.org/article/10.3847/PSJ/acf3e1/meta)
- A third-party 2026 preprint notes that between tracks near 80°S the 20 m DEM is interpolated, and only close to the pole are all 20 m cells constrained by measurements. It does not quantify the fraction. — [LunarRF, arXiv 2610.34554](https://arxiv.org/pdf/2610.34554)
- SfS validation paper (2025/26): the Barker 2021 LOLA DEM is "the most reliable elevation reference", though it lacks the small-scale detail present in stereo and SfS models. — [Enhanced Topography Models…, PSJ](https://iopscience.iop.org/article/10.3847/PSJ/ae5b70)
- For comparison, older NAC stereo DTMs have RMS residuals typically about 0.25 pixel. The USGS 4 m NAC south-pole DEM agrees with the LOLA 5 m grid within the expected 2 m for 56% of differences. — [USGS V&V report](https://astrogeology.usgs.gov/search/map/moon_lro_south_pole_dem_verification_and_validation_report)

### Inferences
- **For horizon angles, the shot-constrained fraction matters more than the nominal pixel size.** A 0.3–0.5 m height error is negligible at 3–30 km (0.5 m at 3 km ≈ 0.01°). Missing ridge crests are not: a crest that falls between LOLA tracks is interpolated low. That bias is systematic, not random, and it pushes predicted sunlight up. It also fits the suspicion that coarse grids smooth distant ridges.
- You can compute an exact "percent constrained" number for the app's region of interest offline. Threshold the _EFFRES raster (for example, effective resolution ≤ 2× the pixel) or the ldec count map (count ≥ 1) over the 3–200 km annulus around each site. This takes one GDAL pass in the existing GitHub Actions job.
- Sun's semi-diameter is about 0.27°. At 30 km a 10 m height error is about 0.019°, and at 200 km about 0.003° (ignoring curvature). So for the 30–200 km far field, a 60–120 m _ADJ grid with metre-level errors is already well inside the tolerance that matters. Missing peaks below the effective resolution are the limiting factor.

### Gaps
- No pole-wide numeric "fraction of pixels with ≥1 LOLA shot" was found for LDEM_80S_20MPP_ADJ, LDEM_83S_10MPP_ADJ or the 60S grids. The paper's figures and the EFFRES/ERR rasters hold it, but I could not read the full text tables.
- Typical _ERR values for the 20 m and 10 m products (for example, median RMS height error inside 84°S and at 80°S) were not retrievable. The 0.3–0.5 m figure applies to the 5 m site fields of Barker 2021, not to the 20 m pole-wide product.
- Barker 2021 numeric illumination differences per site (how much the height error changes average illumination) were not in the extracts.

---

## Q3. Are there improved or newer products (2022–2026)?

### Takeaway
Yes, but mostly as regional patches, not pole-wide grids.
- **PGDA 104** (2026, PSJ): LOLA plus LRO NAC shape-from-shading DEMs at 5 m over the 13 Artemis III candidate regions, more than 4,500 km² in total, on Zenodo, 26.6 GB.
- **PGDA 106** (2026, PSJ): deep-learning super-resolution, 320 → 20 m.
- **LROC NAC stereo DTMs**: 1–4 m over a few sites (Shackleton–de Gerlache ridge, Shackleton rim, Connecting Ridge, Malapert), plus a 2025 PSJ set of 1 m DTMs from six stereo pairs.
- **ShadowCam SfS DEMs** for PSRs: research results only, no archive product found.
- **SLDEM2015** stops at 60°S, so it is not usable at the pole.
- **Chang'e-2 CE2TMap2015** is a global 20 m DEM, but its polar quality and coverage are unverified, and its LOLA offsets are large.

### Cited Findings
**LOLA + NAC shape-from-shading (PGDA 104)**
- "Enhanced Topography Models for Selected Lunar South Pole Regions with Shape-from-Shading", PSJ (doi 10.3847/PSJ/ae5b70). The PGDA page is dated April 2026 and the PGDA home page lists it as "Enhanced 5 m/px Topography Models…". — [PGDA 104](https://pgda.gsfc.nasa.gov/products/104); [IOP](https://iopscience.iop.org/article/10.3847/PSJ/ae5b70); [PGDA home](https://pgda.gsfc.nasa.gov/)
- Zenodo archive: "Geospatial products (surface elevation, input data, derived products) for each of the 13 Artemis Candidate Landing Regions released in 2022, distributed as 32-bit raster compressed GeoTiffs in Moon (2015) South Polar Stereographic projection and with a pixel size of 5 meters". 26.6 GB in total (for example, the Amundsen Rim archive is 1.8 GB and Leibnitz Beta Plateau 1.1 GB). More than 4,500 km² and about 2 × 10⁸ pixels. — [Zenodo 17954508](https://zenodo.org/records/17954508)
- Bundle adjustment reduced residuals from 11.41 ± 11.25 px to 0.33 ± 0.12 px. Effective resolution is close to 5 m/pixel in illuminated areas, and the LOLA 5 m DEMs are the reference. — [IOP](https://iopscience.iop.org/article/10.3847/PSJ/ae5b70)
- Caveat from a third-party review: a 5 m raster "is not necessarily 5 m measured ground detail", and these are "enhanced regional reconstructions, not continuous blanket 5 m terrain over 80–90°S". — [cosmolabe issue #389](https://github.com/AaronPlave/cosmolabe/issues/389)
- Earlier SfS refinement work on LOLA and NAC DEMs for Artemis sites. — [ResearchGate: Shape-from-shading Refinement of LOLA and LROC NAC DEMs](https://www.researchgate.net/publication/380954053_Shape-from-shading_Refinement_of_LOLA_and_LROC_NAC_Digital_Elevation_Models_Applications_to_Upcoming_Human_and_Robotic_Exploration_of_the_Moon); [LPSC 2024 abstract](https://www.hou.usra.edu/meetings/lpsc2024/pdf/2676.pdf)

**Deep-learning super-resolution (PGDA 106)**
- "Improving Lunar Topography with Deep Learning Schrödinger Bridges" by Repasky, Mazarico, Barker, Bertone, Sabaka and Xie (PSJ 2026; PGDA page dated 05-08-2026). It targets a 16× gain from a 320 m a priori DEM to a 20 m reconstruction using optical images, and reports a 5–6 m reconstruction error on a 20 m holdout test set. The page notes that LOLA polar DEMs are the geodetic reference but are limited by altimetric sampling density. — [PGDA 106](https://pgda.gsfc.nasa.gov/products/106); [arXiv 2606.14638](https://arxiv.org/pdf/2606.14638); [IOP](https://iopscience.iop.org/article/10.3847/PSJ/ae6244)

**LROC NAC stereo DTMs near the pole**
- NAC_DTM_SHACKRDGE02 (Shackleton–de Gerlache connecting ridge): 3.5 m/px, centre near −89.5°, project date 2024-04-23. — [LROC RDR viewer](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_SHACKRDGE02)
- NAC_DTM_ESALL_SR12 (Shackleton rim, with confidence map) and NAC_DTM_ESALL_CR1 (Connecting Ridge) were produced for the ESA Lunar Lander project. — [cosmolabe issue #389](https://github.com/AaronPlave/cosmolabe/issues/389) (third-party); the ESA Lunar Lander project released 2 m pixel⁻¹ DTMs as part of the NAC suite — [PSJ ae10a4](https://iopscience.iop.org/article/10.3847/PSJ/ae10a4)
- NAC_DTM_MALAPERT02 and NAC_DTM_MALAPERT03 are cited for Mons Malapert (search extract attributed to a 2025 Malapert traverse paper). — [Kring et al. 2025, JGR Planets](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2024JE008905)
- LROC released "three new NAC stereo-based DTMs covering regions near the lunar south pole that are considered as potential landing sites". — [LROC news 709](https://lroc.im-ldi.com/news/709); production and availability overview — [LPI 2020 abstract](https://www.hou.usra.edu/meetings/lunarsurface2020/pdf/5084.pdf)
- 2025 PSJ: "LROC NAC-derived Meter-scale Topography of the Moon's South Polar Landing Sites". It reports 1 m/pixel DTMs from six NAC stereo pairs with ±1.0 m vertical precision. The DTMs resolve features at roughly the 10 m scale, and the SfS versions smooth at metre baselines. — [IOP PSJ ae10a4](https://iopscience.iop.org/article/10.3847/PSJ/ae10a4)
- USGS "Moon LRO South Pole DEM from Narrow Angle Camera": 4 m post spacing, about 1,065 km², about 66.6 M cells, a mosaic of 57 NAC stereo models registered to LOLA. — [Astropedia product](https://astrogeology.usgs.gov/search/map/moon_lro_south_pole_dem_from_narrow_angle_camera); [V&V report](https://astrogeology.usgs.gov/search/map/moon_lro_south_pole_dem_verification_and_validation_report); [Rosiek et al. LPSC 2013](https://www.lpi.usra.edu/meetings/lpsc2013/pdf/2583.pdf)
- Gläser et al. 2014 built a 2 m NAC DTM of about 2 × 2 km at Connecting Ridge. It has gaps "especially in craters, where no image information are available due to shadowing". — [ResearchGate figure, Gläser et al. 2014](https://www.researchgate.net/figure/A-2-km-x-2-km-NAC-DTM-at-the-Connecting-Ridge-with-a-2-m-per-pixel-resolution-is-shown_fig17_266398170)
- UCL MADNet single-image 1 m DTMs for Artemis sites (EPSC 2024). The listed coverage percentages (Haworth 20.12%, Malapert Massif 40.77%, Nobile Rim 1 40.35%) appear to describe NAC DTM coverage of each region. — [ADS 2024EPSC...17.1170M](https://ui.adsabs.harvard.edu/abs/2024EPSC...17.1170M/abstract)

**ShadowCam (PSRs)**
- Jia, Wu, Mahanti (ISPRS 2024) present a pipeline that models secondary illumination, optimises a low-resolution LOLA DEM with that model, then refines it to ShadowCam pixel resolution. — [ISPRS Archives XLVIII-3-2024-245](https://isprs-archives.copernicus.org/articles/XLVIII-3-2024/245/2024/)
- A 2025 follow-up validated on the Shackleton PSR reports 0.34–1.56 m geometric accuracy. — [ScienceDirect S0094576525006459](https://www.sciencedirect.com/science/article/pii/S0094576525006459); see also [Icarus S0019103525000417](https://www.sciencedirect.com/science/article/abs/pii/S0019103525000417). There are also regional ShadowCam + NAC controlled mosaics. — [Remote Sensing 18(3):525](https://doi.org/10.3390/rs18030525)

**SLDEM2015 (Kaguya TC + LOLA)**
- Covers ±60° latitude at 512 px/deg (about 59 m at the equator) with typical vertical accuracy of 3–4 m. Map radius 1,737,400 m. Built from 43,200 SELENE TC DEMs and 4.5 billion LOLA heights. Citation: Barker et al. (2016), *Icarus* 273, 346–355, doi:10.1016/j.icarus.2015.07.039 (online 2015). — [PGDA 54](https://pgda.gsfc.nasa.gov/products/54); [USGS Astropedia](https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_dem_merge_60n60s_59m); [ODE SLDEM help](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/SLDEM.htm); [NTRS](https://ntrs.nasa.gov/citations/20170002253)
- "LOLA data coverage is sufficiently dense for most purposes at latitudes outside this range", which is why SLDEM stops at 60°. — [ODE SLDEM help](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/SLDEM.htm)

**Chang'e-2**
- CE2TMap2015 is a global 20 m DEM from 7 m CE-2 stereo imagery. A preliminary comparison with LOLA gave a 43 m mean elevation difference (SD 110 m). A geometric assessment used SLDEM2015 as the reference to find gross errors. — [Remote Sensing 12(3):526](https://mdpi.com/2072-4292/12/3/526); [EPSC2014-344](https://meetingorganizer.copernicus.org/EPSC2014/EPSC2014-344.pdf). The 20 m CE-2 DTM is publicly available from NAOC. — [Remote Sensing 15:2643](https://mdpi-res.com/d_attachment/remotesensing/remotesensing-15-02643/article_deploy/remotesensing-15-02643.pdf)

### Inferences
- None of the 2022–2026 products is a pole-wide replacement for LOLA in the 30–200 km far field. PGDA 104 and the NAC DTMs are near-field patches (tens of km) inside Artemis regions. The LOLA _ADJ family stays the geodetic backbone.
- For Earth line-of-sight and sunlight at ridge sites, the main gain from SfS and NAC products is in the first few km (local horizon, slopes, landing-area hazards), not the distant skyline.
- Do not use SLDEM2015 or Chang'e-2 south of 80°S. SLDEM2015 does not cover it, and the Chang'e-2 offsets of tens of metres against LOLA would bias horizons.

### Gaps
- I found **no LROC NAC DTM product IDs** for Haworth, de Gerlache rim (other than the connecting-ridge DTM), Nobile/Mons Mouton, or Shackleton beyond ESALL_SR12. The LROC RDR DTM index (data.lroc.im-ldi.com / pds.lroc.im-ldi.com RDR `DTM` directory) needs a direct query. NAC_DTM_ESALL_SR12, ESALL_CR1 and MALAPERT02/03 come from third-party or secondary citations and need verifying on the portal.
- No archived, downloadable **ShadowCam-derived DEM** product was found. All results are research papers.
- I could not confirm whether **CE2TMap2015** covers 80–90°S, or with what quality.
- No primary statement was found on the DEM resolution behind the PGDA 69 illumination maps. One abstract says Mazarico 2011's elevation models were about 240 m ([Gläser et al. 2014 abstract](https://www.sciencedirect.com/science/article/abs/pii/S0019103514004278)). What the 2016 update used is unknown.
- PGDA 104 licence (the Zenodo record's licence field) and per-region grid sizes were not retrieved.

---

## Q4. Which products are best for the 3–30 km near field and the 30–200 km far field of a horizon calculation?

### Takeaway
- **Near field (3–30 km)**: use LDEM_80S_20MPP_ADJ (PGDA 90) everywhere poleward of 80°S. Where available, upgrade to the 10 m LDEM_83S_10MPP_ADJ or the 5 m PGDA 81 mosaic (87–90°S). Inside Artemis regions, the PGDA 104 SfS 5 m DEMs are the best within a few km.
- **Far field (30–200 km)**: LDEM_80S_20MPP_ADJ already covers ±304 km. Resampling it to about 60–80 m (or using LDEM_60S_60MPP_ADJ / 120MPP) would replace the app's 240 m mid-field directly. The _ADJ 60/120 m grids (±931 km) can also replace the 1 km field to 460 km.

### Cited Findings
- The 20 m 80–90°S LDEM is Barker 2023's "reference topographic product". — [NTRS preprint](https://ntrs.nasa.gov/api/citations/20230014419/downloads/BarkernewviewSTIupdated.pdf)
- The 60/120/240 m _ADJ grids cover ±931.2 km (to 60°S). — [NTRS preprint](https://ntrs.nasa.gov/api/citations/20230014419/downloads/BarkernewviewSTIupdated.pdf); [PGDA 90](https://pgda.gsfc.nasa.gov/products/90)
- Effective resolution degrades away from the pole. Most of the area poleward of 84°S is close to 20 m. — [IOP PSJ acf3e1](https://iopscience.iop.org/article/10.3847/PSJ/acf3e1/meta)
- The 5 m PGDA 81 mosaic covers 87–90°S. About 90% of 5 m pixels are interpolated (PGDA 78). — [PGDA 81](https://pgda.gsfc.nasa.gov/products/81); [PGDA 78](https://pgda.gsfc.nasa.gov/products/78)
- SfS 5 m DEMs cover only the 13 Artemis candidate regions. — [Zenodo 17954508](https://zenodo.org/records/17954508)
- Height errors propagate into horizon elevation and illumination (Barker 2021 analysis). — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0032063320303329)
- The app already uses 20 m _ADJ tiles within 8 km windows and 16 km region tiles, and the 240 m and 1 km grids beyond that. — `/home/user/IMPROVED_lunarmoon-/tools/pgda_fetch.py`, `/home/user/IMPROVED_lunarmoon-/src/core/constants.js`

### Inferences
- **Most likely cause of the 8-point error: the 240 m mid-field (3 to 180 km), not the near field.** Between 3 and about 30 km a 240 m cell spans 0.5–5° of azimuth and can lower a ridge crest by tens of metres. At 10 km a 20 m drop is about 0.11°, roughly 40% of the solar semi-diameter. That is enough to move sunlight fraction by several points at grazing-Sun sites.
- **Suggested nesting:**
  - 20 m _ADJ from 0 to about 30–50 km, where the effective resolution is genuinely close to 20 m poleward of 84°S.
  - 60–80 m (resampled from the 20 m, or LDEM_60S_60MPP_ADJ) from about 30 to 300 km.
  - LDEM_60S_120MPP_ADJ or _240MPP_ADJ from 300 to 900 km, then the global grid.
  - Optionally, PGDA 104 SfS or PGDA 81 5 m within 3 km at Artemis sites.
- Use max-pooling, not mean-pooling, when downsampling the far field for horizons. This keeps ridge crests and removes the low bias that averaging adds. (General technique; not from a cited source.)
- For sites close to the 80°S edge of the 20 m product (the app's tooling lists IM-1 and Cabeus B among sites "beyond" its 240 m grid), the equatorward part of the horizon runs past 80°S. Fill those azimuths from the 60S _ADJ grids (60/120 m) rather than the 1 km grid.

### Gaps
- No published side-by-side test was found showing how much nested 20 m vs 240 m horizons change sunlight fraction at specific south-pole sites. Barker 2021 has error propagation for 5 m fields, but I did not see its numbers.
- The effective-resolution values in the 80–84°S band and beyond 80°S on the 60 m grids are not quantified in the sources I reached.

---

## Q5. Practical issues: sizes, formats, automated HTTPS download, and pitfalls

### Takeaway
- **Format**: PGDA products are float GeoTIFFs; the product 90 and 69 files are cloud-optimized (COGs) in south polar stereographic X/Y metres. GDAL `/vsicurl` HTTP range reads work on them (the project already does this from GitHub Actions). PDS GDR files are headerless int16 IMG with detached labels: height = DN × 0.5 m, OFFSET 1,737,400 m = reference radius.
- **Size**: multi-GB files must be cut and preprocessed offline, not fetched by the browser.
- **Pitfalls**:
  - km vs m units in FLOAT_IMG and other older files.
  - Whether OFFSET is added (radius) or not (height).
  - The pole sits at the corner of the four central pixels.
  - Polar stereographic scale is 1 only at the pole.
  - Old vs new product names.
  - "5 m" does not mean 5 m of measured detail.

### Cited Findings
- PDS LOLA IMG files are "simple binary arrays of 16-bit signed integers, without any headers or compression". HEIGHT = (DATA VALUE × SCALING_FACTOR) + OFFSET, with SCALING_FACTOR 0.5 and OFFSET 1737400. — [PDS Geosciences LOLA FAQ](https://pds-geosciences.wustl.edu/missions/lro/lola_faq.htm)
- The ODE GDRDEM help gives the clearer split: HEIGHT = DN × SCALING_FACTOR, and PLANETARY_RADIUS = DN × SCALING_FACTOR + OFFSET. Colatitude from pixel distance r to the pole is 2·arctan(0.5·r/1,737,400), with the pole at the centre of the four central pixels. — [ODE GDRDEM help](https://ode.rsl.wustl.edu/Moon/pagehelp/Content/Missions_Instruments/Lunar%20Reconnaissance%20Orbiter%20(LRO)/LOLA/GDR/GDRDEM.htm)
- The USGS LOLA 118 m GeoTIFF also stores int16 with scale 0.5 ("pixel values must be halved"). — [Astropedia LOLA DEM 118 m](https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m)
- The polar stereographic definition used is latitude of origin −90, central meridian 0, scale factor 1 (community description for LDEM_875S_5M). — [finkh 3D workflow](https://finkh.wordpress.com/3d-workflow/)
- PGDA 90: COGs, south polar stereographic X/Y in metres, MOON_ME frame / DE421. — [PGDA 90](https://pgda.gsfc.nasa.gov/products/90). PGDA 69 offers COG links usable in GIS without downloading first. — [PGDA 69](https://pgda.gsfc.nasa.gov/products/69)
- PGDA 104 SfS DEMs use the "Moon (2015) South Polar Stereographic" projection and 32-bit compressed GeoTIFF. — [Zenodo 17954508](https://zenodo.org/records/17954508)
- SLDEM2015 values refer to a radius of 1,737,400 m. — [USGS Astropedia SLDEM2015](https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_dem_merge_60n60s_59m)
- Product renames: LDEM_85S_10M → LDEM_83S_10MPP_ADJ (latitude limit changed), LDEM_80S_20M → LDEM_80S_20MPP_ADJ. — [NTRS preprint](https://ntrs.nasa.gov/api/citations/20230014419/downloads/BarkernewviewSTIupdated.pdf)
- The project's own loader handles three unit conventions in polar files: metres, "radius in km" (values about 1700–1760, converted as (v − 1737.4) × 1000) and "km above 1737.4 km". It picks the orientation that best matches the 240 m grid. — `/home/user/IMPROVED_lunarmoon-/tools/build_hires_terrain.mjs` (lines 10, 60–61)
- The project reads PGDA COGs with GDAL `/vsicurl` (with retries) from GitHub Actions, "which can reach pgda.gsfc.nasa.gov; GDAL reads only the parts of the files it needs". — `/home/user/IMPROVED_lunarmoon-/tools/pgda_fetch.py`
- USGS also publishes LOLA RDR shots as Cloud-Optimized Point Clouds (COPC) via STAC (DOI 10.5066/P9V5JIWH). These are useful for checking which cells are shot-constrained. — [USGS STAC LOLA](https://stac.astrogeology.usgs.gov/docs/data/moon/lola/)
- LROC RDR products (NAC DTMs, ROI mosaics) are on HTTPS PDS volumes under `pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/`. The project already pulls a NAC_ROI BDR from there. — `/home/user/IMPROVED_lunarmoon-/tools/` (URL `https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/BDR/NAC_ROI/...`); viewer pages at [data.lroc.im-ldi.com](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_SHACKRDGE02)
- Licence and attribution:
  - One project cites PDS LOLA data as free to use with attribution to the NASA/LOLA team and the PDS Geosciences Node. — [lunar-landing-site-navigator README](https://github.com/ninjabaloney06-sketch/lunar-landing-site-navigator) (secondary)
  - The app currently labels LOLA "Public domain (NASA)". — `/home/user/IMPROVED_lunarmoon-/src/experience/trust.js`
- Citations to use:
  - Barker et al. 2021, PSS 203:105119.
  - Barker et al. 2023, PSJ 4:183.
  - Barker et al. 2016, Icarus 273:346 (SLDEM2015).
  - Mazarico et al. 2011, Icarus 211:1066.
  - The PSJ SfS paper (doi 10.3847/PSJ/ae5b70) plus Zenodo 17954508.
  - Repasky et al. 2026, PSJ (doi 10.3847/PSJ/ae6244).
  - — sources as linked above.

### Inferences
- **Browser strategy**: do not fetch any of these products in the browser. Keep the current pattern: GitHub Actions + GDAL `/vsicurl` windowed reads → small packed tiles or precomputed per-site horizon profiles (azimuth → elevation angle) served as static assets. A 360° × 0.1° horizon profile per site is a few KB, compared with GBs of DEM.
- Whether pgda.gsfc.nasa.gov sends CORS headers is unknown (see Gaps). Even if it does, files of 2.6–4.8 GB with 512-px COG blocks would mean many range requests per site in the browser.
- **Stereographic scale.** The scale factor is sec²(colatitude/2) (computed): 1.0077 at 80°S, 1.0173 at 75°S, 1.0718 at 60°S. A "20 m" grid cell is about 19.85 m on the ground at 80°S, and a "240 m" cell about 224 m at 60°S. Correct for this in slope and horizon-distance calculations far from the pole, or compute distances on the sphere.
- **Sign and orientation.** For the south pole the project uses x = ρ·sin(lon), y = ρ·cos(lon) (`tools/pgda_fetch.py`). The north-pole convention flips the sign of y. Check orientation for each file against a known landmark or against the existing grid, as `build_hires_terrain.mjs` already does.
- PGDA 104 uses "Moon (2015) South Polar Stereographic" (IAU 2015 sphere). This should match R = 1737.4 km, but confirm the WKT and false easting/northing from the file before mosaicking with PGDA 90.

### Gaps
- I could not confirm whether pgda.gsfc.nasa.gov, pds-geosciences.wustl.edu, imbrium.mit.edu or pds.lroc.im-ldi.com send `Access-Control-Allow-Origin` (needed for direct browser fetch), or whether any of them rate-limits automated download. pgda.gsfc.nasa.gov and pds-geosciences.wustl.edu must be added to this session's allowed network hosts to check this here.
- No explicit licence statement was found on the PGDA product pages or in the PDS policy (NASA-produced data is generally treated as public domain, but no primary page was retrieved). The Zenodo licence for PGDA 104 data was not retrieved.
- Exact COG block size, compression and nodata value for the PGDA 90 files were not retrieved. The project's `pgda_fetch.py` logs these via `info()`, so they can be read from the last CI run's metadata.
