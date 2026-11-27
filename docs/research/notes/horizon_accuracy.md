# Horizon accuracy: DEM resolution, horizon method, and their effect on sunlight fraction and Earth visibility at lunar south-polar sites

> **Read this first: how these notes were sourced (2026-11-25).** In this session WebFetch was blocked for every primary host tried: ntrs.nasa.gov, pgda.gsfc.nasa.gov, iopscience.iop.org, hou.usra.edu (LPSC and Artemis workshop abstracts), mdpi.com and arxiv.org. **I could not open any full text.** Every "Cited Finding" below comes from web-search result summaries of abstracts, landing pages and citing papers. They are reliable for headline numbers and citations, and **less reliable for method details** such as azimuth step or distance cut-off. Where summaries conflict or look garbled, I say so. Numbers marked "(computed)" in the Inferences come from my own geometry (Moon radius 1737.4 km), not from the literature. To check the method details, the cheapest step is to allow `ntrs.nasa.gov` and `pgda.gsfc.nasa.gov` in the session network settings and re-fetch the Barker 2021 accepted manuscript (NTRS 20205009660) and the PGDA product pages 69, 78 and 90.

## 1. How the main studies compute horizons (distance limits, resolution per band, azimuth step, curvature, solar disk)

### Takeaway
All the major LOLA-based studies use the same basic "horizon method". They precompute, for each grid point, a 360° horizon (maximum terrain elevation angle per azimuth) on a DEM, then compare the Sun or Earth position against it over an 18.6-year precession cycle, at time steps of 1 h (sometimes 6 h). The studies differ mainly in DEM resolution: 240 m (Mazarico 2011), 40 m (De Rosa 2012), 20 m with locally 2 m (Gläser 2014/2018), and 5 m (Barker 2021/2023). The exact distance cut-offs and distance bands could not be confirmed from accessible text, so treat any specific figure (for example "150 km") as unverified.

### Cited Findings
**Mazarico et al. 2011 (Icarus 211:1066–1081, doi:10.1016/j.icarus.2010.10.030)**
- Used the horizon method on LOLA topography. Illumination of both poles out to 80° latitude was computed from horizon profiles, and the model was checked against LRO WAC images. — [NTRS 20120010094](https://ntrs.nasa.gov/citations/20120010094)
- Used 240 m/pixel LOLA polar DEMs and modelled a full ~18.6-year nutation/precession cycle. The PGDA summary says **1-hour steps**; a citing paper (Tong et al. 2023) describes the run as **240 m resolution with a 6-hour interval**. **These two descriptions conflict** (they may describe different product versions). — [PGDA product 69](https://pgda.gsfc.nasa.gov/products/69); [Tong et al. 2023, ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0019103522003943)
- Each surface point's local horizon is pre-calculated and stored, so the cost of each time step is small. A citing paper describes the method as discretizing and traversing all azimuths in advance, which decouples it from the time resolution and span. — [ResearchGate, Mazarico 2011](https://www.researchgate.net/publication/251730356_Illumination_conditions_of_the_lunar_polar_regions_using_LOLA_topography)
- A 2013 Mazarico presentation describes 240 m/px polar stereographic coverage from 65° to 90°. Illumination maps were later made available at **60 m/px down to 85° latitude**, in polar gnomonic projection. These 60 m products are the lineage of the PGDA 60 m maps we validate against. — [Mazarico LEAG 2013](https://www.hou.usra.edu/meetings/leag2013/presentations/mazarico.pdf); [ResearchGate summary](https://www.researchgate.net/publication/251730356_Illumination_conditions_of_the_lunar_polar_regions_using_LOLA_topography)
- Elsewhere this method is called the "maximum terrain height angle method", applied to a 240 m DEM built from more than 2600 LOLA tracks. — [arXiv 1208.5587 (De Rosa et al.), as summarised](https://arxiv.org/pdf/1208.5587)
- The search could not confirm the azimuth step, the maximum horizon distance or the solar-disk treatment. A search for "0.5° azimuth / 150 km" returned no confirmation. — [search summary of ResearchGate/ScienceDirect entries](https://www.sciencedirect.com/science/article/abs/pii/S0019103510004203)

**Bussey et al. 2010 (Icarus 208:558, Kaguya topography)**
- Modelled south-pole lighting from Kaguya laser-altimeter topography and checked it qualitatively against Clementine images. Results: a Shackleton-rim point lit ~86% of the year, and two sites less than 10 km apart lit ~94% combined. The study covered a single year (2020) and only 86–90°S. — [ADS 2010Icar..208..558B](https://ui.adsabs.harvard.edu/abs/2010Icar..208..558B); [Mazarico 2011 on ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0019103510004203)
- Mazarico 2011 found a similar ~85.5% for the same Shackleton-rim location. — [ResearchGate](https://www.researchgate.net/publication/251730356_Illumination_conditions_of_the_lunar_polar_regions_using_LOLA_topography)

**De Rosa et al. 2012 (PSS 74:224–246; arXiv:1208.5587), ESA Lunar Lander**
- Improved the DEM to **40 m/px** for ESA site selection. Focus: the ridge from the eastern rim of de Gerlache to the western rim of Shackleton ("Connecting Ridge"). Sites CR1, SR1, SV1 and GR1 correspond to Barker/Mazarico sites 1, 4, 7 and 11. — [arXiv 1208.5587 summary](https://arxiv.org/pdf/1208.5587); [Barker 2021 NTRS manuscript, as summarised](https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf)

**Gläser et al. 2014 (Icarus 243:78–90, doi:10.1016/j.icarus.2014.08.013)**
- Used a geometrically adjusted **20 m/px** LOLA DTM over a **20 × 20 km** area covering the Shackleton rim and Connecting Ridge. Ran a 19-year (precession-cycle) study **at surface level, 2 m and 10 m above ground**, and made several comparisons with NAC images. The paper also discusses the influence of data resolution and how to refine LOLA DTMs for illumination work. — [ADS 2014Icar..243...78G](https://ui.adsabs.harvard.edu/abs/2014Icar..243...78G); [DLR elib 94240](https://elib.dlr.de/94240)
- A **2 km × 2 km NAC DTM at 2 m/px** at Connecting Ridge was used. A citing paper describes the result as "overall 20 m/px and local 2 m/px". — [ResearchGate figure](https://www.researchgate.net/figure/A-2-km-x-2-km-NAC-DTM-at-the-Connecting-Ridge-with-a-2-m-per-pixel-resolution-is-shown_fig17_266398170); [arXiv 1208.5587 citing summary](https://arxiv.org/pdf/1208.5587)

**Gläser et al. 2018 (PSS 162:170–178; authors Gläser, Oberst, Neumann, Mazarico, Speyerer, Robinson)**
- Illumination in **1-hour increments from 2017-01-01 to 2037-01-01**, to cover the 18.6-year cycle. — [ADS 2018P&SS..162..170G](https://ui.adsabs.harvard.edu/abs/2018P&SS..162..170G)

**Speyerer & Robinson 2013 (Icarus 222:122–136); Speyerer et al. 2016 (Icarus 273:337–345)**
- 2013 study: an image-based method rather than a horizon model. About 7800 WAC images over ~1 year, map-projected at 100 m/px onto a 30 m LOLA DEM. — [ResearchGate](https://www.researchgate.net/publication/256719684_Persistently_illuminated_regions_at_the_lunar_poles_Ideal_sites_for_future_exploration); [PMC 6398960](https://pmc.ncbi.nlm.nih.gov/articles/PMC6398960/)
- 2016 study: simulated illumination with **three independent tools** using LOLA-derived DTMs, at surface level, for 50 × 50 km regions centred on the poles. — [ResearchGate](https://www.researchgate.net/publication/299344300_Optimized_traverse_planning_for_future_polar_prospectors_based_on_lunar_topography); [Semantic Scholar](https://www.semanticscholar.org/paper/Optimized-traverse-planning-for-future-polar-based-Speyerer-Lawrence/c18d687a2386bd5ee4ca00b0dfcce13eff0fa614)

**Barker et al. 2021 (PSS 203:105119) and Barker et al. 2023 (PSJ 4:183, doi:10.3847/psj/acf3e1)**
- 2021: **5 m/px** LDEMs from LOLA alone for sites 1, 4, 7 and 11, each 16 × 16 km. Track adjustment cut geolocation errors by more than 10×, to ~10–20 cm horizontally and ~2–4 cm vertically. — [ADS 2021P&SS..20305119B](https://ui.adsabs.harvard.edu/abs/2021P&SS..20305119B); [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0032063320303329)
- 2023: extends 5 m/px LOLA mapping to a larger south-polar area and adds a 20 m/px PSR map. The search summary's description of the extent ("out to 30° from the pole") looks garbled; check it. — [IOPscience](https://iopscience.iop.org/article/10.3847/PSJ/acf3e1); [NTRS 20230014419](https://ntrs.nasa.gov/citations/20230014419)
- The 13 Artemis III candidate regions were down-selected from 27 using these improved 5 m/px LOLA maps. This comes from a search summary and the attribution is uncertain; it may come from the LPSC 2023 Artemis Internal Science Team update rather than #2007. — [hou.usra.edu Artemis III 2023 #2007](https://www.hou.usra.edu/meetings/Artemis_III_2023/pdf/2007.pdf); [LPSC 2023 #1354](https://www.hou.usra.edu/meetings/lpsc2023/pdf/1354.pdf)

**Mazarico & Barker, Artemis III regions (Artemis III Science & Landing Site Workshop 2023, abstract #2007)**
- "Preferred Artemis regions from a solar illumination perspective": LOLA-topography simulations of the candidate regions. Earth visibility is not considered in that abstract. — [hou.usra.edu 2007.pdf](https://www.hou.usra.edu/meetings/Artemis_III_2023/pdf/2007.pdf)
- The NASA Lunar Surface Data Book (ACD-50044 Rev A) defines "Earth Visibility" in the LOLA products as **the percentage of model time steps in which a pixel is lit by any fraction of the Earth disc**. — [NTRS ACD-50044 Rev A](https://ntrs.nasa.gov/api/citations/20230007818/downloads/ACD-50044%20Lunar%20Surface%20Data%20Book%20Rev%20A.pdf)

**Newer methods (2023–2026)**
- Tong et al. 2023 (Icarus 390:115302): builds a **topographic pyramid in Cartesian space**, where higher layers have higher accuracy and smaller coverage, instead of gridded DTMs in gnomonic projection. It treats LOLA points as a triangulated network rather than gridding them first. The paper quantitatively discusses the effects of gridding/interpolation and of a coarser horizon, but the numbers were not retrievable. — [ScienceDirect S0019103522003943](https://www.sciencedirect.com/science/article/abs/pii/S0019103522003943)
- Huang et al. (EGU25-19657) apply the same method to LOLA gridded models, producing maps up to 5 m resolution. — [EGU25-19657](https://meetingorganizer.copernicus.org/EGU25/EGU25-19657.html)
- A 2026 A&A thermophysical model uses a **spoke-tracing horizon at 0.5° angular resolution and accounts for lunar curvature** in its horizon profiles. — [A&A 2026, aa61899-26](https://www.aanda.org/articles/aa/full_html/2026/10/aa61899-26/aa61899-26.html)
- A 2025 LROC NAC meter-scale DTM paper (PSJ) made solar-illumination and direct-to-Earth maps with the horizon method. A 2024 AGU abstract on "Enhanced Topography and Illumination Models for the Lunar South Pole" (shape-from-shading, SfS) describes Sun/Earth visibility statistics computed with standard 3-D rendering. — [PSJ ae10a4](https://iopscience.iop.org/article/10.3847/PSJ/ae10a4); [ADS 2024AGUFMP31D.2848B](https://ui.adsabs.harvard.edu/abs/2024AGUFMP31D.2848B/abstract); [PSJ ae5b70 (SfS)](https://iopscience.iop.org/article/10.3847/PSJ/ae5b70)
- Solar-disk treatment: at the poles the Sun's elevation is comparable to its angular diameter, so part of the visible disk sits below the horizon for significant parts of the day. This is why the partial disk has to be modelled. — [A&A 2026](https://www.aanda.org/articles/aa/full_html/2026/10/aa61899-26/aa61899-26.html)

### Inferences
- Our pipeline already follows the literature's architecture: precomputed horizon, Sun or Earth tested against it, partial solar disk, multi-year span. Our resolution choices are what differ. Our near field (20 m to 3 km) matches Gläser 2014/2018. Our 240 m middle band (3 to 180 km) matches the Mazarico 2011 resolution, which later work criticised for over-predicting sunlight (see section 4). PGDA's current 60 m maps probably use finer topography than 240 m for at least part of the horizon, but I could not confirm their banding.
- Because the PGDA reference is itself a horizon model, part of our residual is model-to-model disagreement, not error against ground truth (see section 3).

### Gaps
- Exact horizon distance limits, azimuth steps, and whether Mazarico 2011, Gläser 2014/2018 and the current PGDA 60 m products use multi-resolution far-field DEMs: not retrievable here. My unverified recollection is that Mazarico 2011 used ~0.5° azimuth sampling and a horizon extent of ~150 km. **Treat this as unconfirmed.**
- How the PGDA 60 m products handle the solar disk (fraction of disk vs. Sun centre) and observer height (0 m vs. a raised point): not confirmed. These choices matter at the level of points (see section 4).
- Speyerer 2016's three tools: names and agreement between them not retrievable.

## 2. Sensitivity to DEM resolution and horizon cut-off distance (near field vs. far field)

### Takeaway
The literature agrees that coarse or smoothed DEMs **over-predict** illumination, and that DEM noise tends to **raise** the horizon, which under-predicts it. I found no published table that gives sunlight-fraction error as a function of horizon cut-off distance. Simple geometry, however, sets the bands. A height error δh at distance d shifts the horizon by δh/d. Polar sunlight fraction changes by roughly 2 points per 0.1° of systematic horizon bias. On that basis, the 3–30 km band at 240 m is probably the largest remaining error source in our setup. Terrain beyond about 200–250 km can almost never rise above the local horizontal, but it can still matter for elevated ridge observers whose horizon sits below 0°.

### Cited Findings
- Coarse resolution over-predicts: a 2026 A&A paper says the Mazarico 2011 240 m/px model "tends to **overestimate** illumination at some locations due to the low resolution and smoothening of the topography" compared with higher-resolution models (Gläser et al. 2018). — [A&A 2026](https://www.aanda.org/articles/aa/full_html/2026/10/aa61899-26/aa61899-26.html)
- DEM noise raises the horizon: Barker 2021 propagated LDEM height errors with 100 statistical "clones" per site. Typical RMS errors were ~0.30–0.50 m in height and ~1.5–2.5° in slope. The paper notes that **perturbations are more likely to raise than to lower the horizon elevation**, because the horizon is a maximum over many samples. Including height errors bounds the min/max average illumination, longest day and longest night. — [Barker 2021, NTRS accepted manuscript (as summarised)](https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf); [LSIC presentation](https://lsic.jhuapl.edu/uploadedDocs/presentations/766-2.01_Barker_TRNworkshopBarkerLOLADay2.pdf); [ResearchGate](https://www.researchgate.net/publication/346314908_Improved_LOLA_elevation_maps_for_south_pole_landing_sites_Error_estimates_and_their_impact_on_illumination_conditions)
- The 5 m/px LOLA-only LDEM has artifacts and **real data in only ~10% of pixels** near the south pole. The rest is interpolated, so "5 m" does not mean 5 m of information everywhere. — [Semantic Scholar / presentation summary](https://www.semanticscholar.org/paper/Improved-LOLA-elevation-maps-for-south-pole-landing-Barker-Mazarico/946ed050535b8d56c13a5204b6fba9912080d9b1)
- Gläser 2014 explicitly discusses the influence of data resolution on illumination results and how to refine LOLA DTMs for illumination studies. The numbers were not retrievable. — [ADS 2014Icar..243...78G](https://ui.adsabs.harvard.edu/abs/2014Icar..243...78G)
- Tong 2023 quantifies the error from interpolating LOLA points to a grid and from using a coarser horizon. The abstract says these effects are "discussed quantitatively", but the values were not retrievable. — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0019103522003943)
- Far field matters at the pole: a NASA review (Fincannon 2007, NTRS 20070034951) reports, as summarised, that the illumination of the south-pole area depends mainly on **distant high ground in the Malapert region (~84–86°S)**, and that nearby terrain is less important than distant terrain for this effect. A JPL report names **Malapert A and Leibnitz B** (the latter ~6,055 m, the highest peak near the pole) as the peaks that block the Sun from the pole. Malapert is ~120 km from the pole. — [NTRS 20070034951](https://ntrs.nasa.gov/api/citations/20070034951/downloads/20070034951.pdf); [JPL IPN PR 42-176](https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.pdf); [Wikipedia: Peak of eternal light](https://en.wikipedia.org/wiki/Peak_of_eternal_light)
- The horizon method is considered valid at the poles because the blocking obstacles are distant, so parallax of the Sun relative to the horizon is negligible. The search summary did not say which paper states this; it was returned alongside the early GPU/parallel-computing lunar papers. — [ResearchGate 273675329 (attribution uncertain)](https://www.researchgate.net/publication/273675329_Analysis_of_illumination_conditions_at_the_lunar_south_pole_using_parallel_computing_techniques)
- Terrestrial horizon codes show the same sensitivity. HORAYZON (GMD 2022) uses a default horizon accuracy of 0.25° and warns that **simplifying remote terrain can break the accuracy requirement** because rays can miss mesh triangles. It agrees well with other methods for distances above 1 km, with larger deviations at shorter distances. — [GMD 15:6817](https://gmd.copernicus.org/articles/15/6817/2022/)

### Inferences
**Curvature (computed, R = 1737.4 km).** A surface point at distance d sits below the observer's local horizontal by d/(2R):
- 3 km → 0.05°
- 10 km → 0.17°
- 30 km → 0.50°
- 50 km → 0.82°
- 100 km → 1.65°
- 180 km → 2.97°
- 460 km → 7.6°

To reach 0° elevation for a surface observer, terrain must stand above the observer by d²/(2R):
- 50 km → 0.72 km
- 100 km → 2.9 km
- 150 km → 6.5 km
- 180 km → 9.3 km
- 250 km → 18 km
- 460 km → 61 km (impossible)

So beyond ~200–250 km, terrain can block a surface observer only when the Sun is below the local horizontal.

**Elevated observers depend more on the far field (computed).** An observer h above the surrounding mean surface has a geometric dip of √(2h/R):
- h = 1 km: dip 1.9°, geometric horizon at ~59 km
- h = 2 km: dip 2.75°, geometric horizon at ~83 km

The Sun at the south pole is always within about ±1.5–1.8° of the horizontal (axial tilt 1.54° plus 0.27° solar radius), plus the site's colatitude. On high ridges such as Connecting Ridge and the Shackleton rim, the azimuths that decide sunrise and sunset are therefore set by terrain at **tens to ~150 km**, at negative elevation angles. Our two worst sites are exactly the ones whose sunlight depends most on the mid and far field.

**Horizon error from smoothed heights (computed: δθ ≈ δh/d).**

| Height error δh | at 3 km | at 10 km | at 30 km | at 100 km | at 180 km |
|---|---|---|---|---|---|
| 20 m | 0.38° | 0.11° | 0.04° | 0.01° | – |
| 50 m | 0.95° | 0.29° | 0.10° | 0.03° | – |
| 200 m | – | 1.15° | 0.38° | 0.11° | 0.06° |

The height error allowed for a 0.05° (≈ 1/10 of the solar diameter) horizon error:

| Distance | 3 km | 10 km | 30 km | 50 km | 100 km | 180 km |
|---|---|---|---|---|---|---|
| Allowed δh | 2.6 m | 8.7 m | 26 m | 44 m | 87 m | 157 m |

A 240 m DEM can easily under-represent narrow crests and rims by tens of metres. That alone gives 0.1–1° of horizon bias in the 3–30 km band, but only ~0.03° at 100 km.

**From horizon bias to sunlight fraction (computed, rough model).** At a given azimuth, the Sun's elevation when it crosses that azimuth varies over the draconic year with amplitude ~1.54°. The fraction of crossings above a threshold near zero therefore changes by about 1/(π·1.54) ≈ **21% per degree**, or **~2 points per 0.1°** of horizon bias averaged over the decisive azimuths. An **~8-point over-prediction implies a systematic horizon under-estimate of roughly 0.3–0.4°** over the sunrise/sunset azimuths. That is consistent with smoothed rims and crests at 3–30 km in a 240 m DEM, and too large to come from terrain beyond 100 km (which gives ≤0.03–0.1° for plausible errors).

**Suggested banding.** These figures follow from the geometry above, not from any paper.

| Distance from site | Suggested resolution |
|---|---|
| Within ~10–15 km | 20 m, or finer where available |
| ~15–50 km | 60 m (or 40 m) |
| ~50–150 km | ≤120 m |
| ~150–250 km | 240 m |
| Beyond ~250 km | 1 km+ (the 3.8 km global layer is effectively irrelevant for surface sites; it matters only for strongly elevated observers) |

This puts the extra cost where δh/d is largest. A cheaper first experiment: for Connecting Ridge and the Shackleton rim peak, recompute the horizon with 20 m terrain out to 10, 20 and 40 km. Plot the per-azimuth horizon difference against the current run. The cut-off at which the sunlight fraction stops moving (for example, less than 0.5 point) is the empirical answer for our sites.

**Peak-preserving downsampling.** A max-based (or max-preserving) downsampling of the coarse bands would directly address the "smoothed distant peaks" bias. Mean or bilinear resampling systematically lowers summits and rim crests, which lowers the horizon and over-predicts sunlight. Max-pooling over-raises the horizon instead (compare Barker's noise-raises-horizon effect). A reasonable compromise is to keep both the mean and the max pyramids and bound the answer between them.

### Gaps
- No primary source found that quantifies sunlight-fraction change against horizon cut-off distance (for example, 50, 100 or 150 km) or against far-field resolution at the lunar south pole. Tong 2023 and Gläser 2014 likely contain resolution-sensitivity numbers, but the full text was inaccessible.
- The Barker 2021 per-site illumination spreads (percentage points from the 100 clones) and the Δz = 5 m results were not retrievable. A search summary only says that raising the point to Δz = 5 m "greatly improves" illumination.

## 3. Agreement of modelled illumination with LROC WAC/NAC images, and what limits it

### Takeaway
Published validations are mostly **qualitative**: simulated renderings or illumination maps visually match WAC, NAC or Clementine images. I found no widely quoted single "percent agreement" figure. Image-based (WAC) and DEM-based results differ by a few points at the best sites, for known reasons: WAC resolution (~100 m) misses lit features smaller than ~100 m, and coarse DEMs smooth terrain. Expect a ±3–5 point spread between independent high-quality methods at peak-illumination sites.

### Cited Findings
- Mazarico 2011 validated its LOLA horizon model against LRO WAC images (abstract; no number retrieved). — [NTRS 20120010094](https://ntrs.nasa.gov/citations/20120010094)
- Bussey 2010: simulated and Clementine images matched well enough to support Kaguya-based lighting models (qualitative). — [ADS](https://ui.adsabs.harvard.edu/abs/2010Icar..208..558B)
- Gläser 2014 made several NAC-image comparisons to cross-validate its 20 m DTM results. A later Gläser presentation compares simulated illumination with NAC images for a new 5 m/px LOLA model and an older model at the same resolution. — [ADS](https://ui.adsabs.harvard.edu/abs/2014Icar..243...78G); [ResearchGate](https://www.researchgate.net/publication/266398170_Illumination_conditions_at_the_lunar_south_pole_using_high_resolution_Digital_Terrain_Models_from_LOLA)
- Speyerer & Robinson 2013 (WAC image time series, 100 m/px): found localised regions illuminated **~94% of the year**, with the longest eclipse only **43 h**. — [ResearchGate](https://www.researchgate.net/publication/256719684_Persistently_illuminated_regions_at_the_lunar_poles_Ideal_sites_for_future_exploration)
- Gläser et al. argue that the WAC study's lower resolution compared with the LOLA DTM **under-estimates** illumination, because lit areas smaller than ~100 m may not be detected by WAC. A conflicting, apparently garbled summary attributes the under-estimation to the LOLA DTM instead. A comparison statement about darkness periods being "up to seventy percent shorter" than in Speyerer & Robinson 2013 could not be placed in context. — [PMC 6398960 / search summary](https://pmc.ncbi.nlm.nih.gov/articles/PMC6398960/); [NTRS 20170007365 (Gläser 2018 manuscript)](https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf)
- Spread between independent estimates at the best south-pole sites:

| Source | Method | Best-site illumination |
|---|---|---|
| Bussey 2010 | Kaguya topography | ~86% (Shackleton rim) |
| Mazarico 2011 | 240 m LOLA horizon | ~85.5% (same point) |
| Speyerer & Robinson 2013 | WAC image series | ~94% |
| Gläser 2014 | 20 m DTM | 92.27% at 2 m height; 95.65% at 10 m |
| Gläser 2018 | 20 m DTM, candidate lander/rover sites | 77.1–88.0% (maximum on the Shackleton–de Gerlache ridge) |

  Gläser 2018 gives 69.5–82.9% for the high-illumination regions as a whole. — [ADS Bussey](https://ui.adsabs.harvard.edu/abs/2010Icar..208..558B); [ResearchGate Mazarico](https://www.researchgate.net/publication/251730356_Illumination_conditions_of_the_lunar_polar_regions_using_LOLA_topography); [ADS Gläser 2014](https://ui.adsabs.harvard.edu/abs/2014Icar..243...78G); [ADS Gläser 2018](https://ui.adsabs.harvard.edu/abs/2018P&SS..162..170G)
- A 2023 Remote Sensing paper analyses south-polar illumination from multi-temporal high-resolution orbital images, which is directly relevant to model and image agreement. Its numbers were not retrievable. — [Remote Sensing 15(24):5691](https://doi.org/10.3390/rs15245691)

### Inferences
- The literature spread at ridge sites (the same location differing by ~5–10 points between methods, time spans and heights) is about the size of our residual 8-point error. Our ridge residual is therefore at the level of disagreement between the published models themselves. It is not obviously "our error". Matching PGDA to better than ~3–5 points at Connecting Ridge and the Shackleton rim requires matching PGDA's **conventions**, not only its resolution: observer height, point versus pixel-centre elevation, disk treatment, and time span (see section 4).
- Several of these numbers differ in time span (one year vs. 18.6–20 years), height (0 vs. 2 vs. 10 m) and "point" vs. "pair of sites". Compare like with like.

### Gaps
- No quantitative pixel-wise agreement statistic (for example, % of pixels where model and WAC agree on lit/unlit) was retrievable for any LOLA model. The Remote Sensing 2023 and Gläser 2014 full texts are the likely sources.

## 4. Systematic biases at high ridges and peaks; local terrain; lander/mast height

### Takeaway
Two opposing biases act at ridges. Smoothing of distant rims and peaks lowers the modelled horizon, which **over-predicts** sun; coarse DEMs like 240 m are documented to do this. DEM noise and cell-max effects **raise** the horizon, which under-predicts. On top of that, illumination on narrow crests is very sensitive to observer height: Gläser found **+3.4 points from 2 m to 10 m** at Connecting Ridge. A model that puts the observer on a sharper (20 m) crest than the reference's 60 m pixel-centre elevation will over-predict relative to that reference.

### Cited Findings
- Coarse (240 m) models over-estimate illumination at some locations because of smoothing. — [A&A 2026](https://www.aanda.org/articles/aa/full_html/2026/10/aa61899-26/aa61899-26.html)
- DEM height perturbations are more likely to raise the horizon. — [Barker 2021 (summary)](https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf)
- Height above the surface at Connecting Ridge (Gläser 2014, 19-year run): **92.27% at 2 m** and **95.65% at 10 m**; longest continuous darkness typically **3–5 days**. — [ADS](https://ui.adsabs.harvard.edu/abs/2014Icar..243...78G); [EPSC 2014 abstract](https://elib.dlr.de/94242/1/EPSC2014-136-1.pdf)
- Barker et al.: raising the point to **Δz = 5 m "greatly improves"** illumination at the LOLA 5 m sites (exact numbers not retrieved). — [Barker LPSC 2020 e-poster / search summary](https://www.hou.usra.edu/meetings/lpsc2020/eposter/1730.pdf)
- A JPL study (IPN Progress Report 42-176, ~2009, GSSR radar topography) computed illumination and communication maps for a **2 m height** case. — [JPL IPN PR 42-176](https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.pdf)
- Mobility helps: earlier rover simulations, as quoted in Speyerer 2016, show that a small amount of mobility keeps a rover lit **94.4%** of the year, with a longest eclipse of **101 h**. — [Speyerer 2016 (ResearchGate summary)](https://www.researchgate.net/publication/299344300_Optimized_traverse_planning_for_future_polar_prospectors_based_on_lunar_topography)

### Inferences
**Observer elevation, the most likely culprit for ridge over-prediction against a 60 m reference (computed).** Lowering the observer by Δz raises the horizon at distance d by Δz/d:

| Observer lowered by | at 500 m | at 1 km | at 3 km |
|---|---|---|---|
| 2 m | 0.23° | – | – |
| 10 m | – | 0.57° | 0.19° |
| 20 m | 2.3° | 1.15° | 0.38° |

On a narrow crest, a 60 m pixel-centre or pixel-mean elevation can sit 5–20 m below the 20 m-DEM crest point. That alone can produce ~0.2–1° of near-field horizon difference, which section 2 maps to several points. We should check:
- (a) which elevation PGDA assigns to the pixel (and at what height above it);
- (b) whether our site elevation comes from the 20 m DEM at the exact coordinate;
- (c) whether we add any lander or mast height;
- (d) whether the PGDA pixel containing our coordinate is centred on the crest.

A quick diagnostic: run our model at the PGDA pixel centre with the elevation lowered by 5, 10 and 20 m, and with 0 m vs. 2 m height, and see whether the 8-point gap closes.

**The two biases, in practice.** Gläser's 2 m to 10 m gain implies roughly 0.4 points per metre of height on a ridge top. Any 0 m vs. 2 m mismatch between our model and the reference is worth ~1–3 points at these sites. If our first ray steps start right at the observer on a 20 m bilinear surface, a few-metre near-field bias is easy to introduce in either direction. Compare against Barker's DEM-noise effect: a noisier local DEM raises the horizon and under-predicts.

**Sites where the reference is weakest.** Connecting Ridge and the Shackleton rim peak are where the model literature disagrees most, at ~85–95% depending on method and height. Treat the PGDA value there as having its own few-point uncertainty.

### Gaps
- No source found that quantifies "local terrain within tens of metres" (boulders, metre-scale crests) on sunlight fraction. The Gläser 2014 2 m NAC DTM work probably does, but it was inaccessible.
- PGDA's observer-height convention for the 60 m maps: unconfirmed.

## 5. Earth visibility (direct-to-Earth line of sight): sensitivity to resolution

### Takeaway
Earth visibility is dominated by terrain in a **narrow azimuth sector toward the nearside**. Because Earth's elevation swings much more than the Sun's (libration of about ±6.7°), it is roughly **4× less sensitive per degree of horizon error** than sunlight fraction. The **definition** matters a lot: LOLA/PGDA count a time step as visible if **any fraction of Earth's disc** is visible. Most Artemis regions see Earth ~50% of the time; the nearside half of Mons Malapert sees it ~100%.

### Cited Findings
- LOLA product definition: "Earth Visibility" is the percentage of model time steps in which a pixel is lit by **any fraction of the Earth disc**. — [NASA Lunar Surface Data Book ACD-50044 Rev A](https://ntrs.nasa.gov/api/citations/20230007818/downloads/ACD-50044%20Lunar%20Surface%20Data%20Book%20Rev%20A.pdf)
- Mazarico & Barker (2023 abstract): Earth visibility is challenging for most Artemis III regions (~50%), except the nearside half of the Mons Malapert region (~100%). Connecting Ridge, de Gerlache and Slater are the most appealing regions for off-season traverses. — [hou.usra.edu Artemis III 2023 #2007](https://www.hou.usra.edu/meetings/Artemis_III_2023/pdf/2007.pdf)
- Sites 007 and 011 (PSJ 2022): about 50% of the area within the 2 km landing zone has Earth visibility ~50–60% of the time. — [PSJ ac88c2](https://iopscience.iop.org/article/10.3847/PSJ/ac88c2)
- IEEE GRSL 2025 ("Lunar Terrain-Driven Earth Visibility Analysis for South Polar Moon-Based Observations", LOLA): terrain reduces Earth visibility by **up to 80%** in crater-rim and high-latitude regions compared with a smooth Moon. The paper identifies a **14° maximum horizon-elevation threshold** for complete Earth visibility; the best sites are near the central meridian at 80–82.5°S. — [ADS 2025IGRSL..22L1520W](https://ui.adsabs.harvard.edu/abs/2025IGRSL..22L1520W/abstract)
- Mazarico 2011 produced pole-wide illumination and Earth-visibility maps by horizon analysis of the LOLA DEM. LOLA-based products answer geometric line of sight only, not a propagation or link budget. — [LunarRF preprint, Oct 2026](https://arxiv.org/pdf/2610.34554)
- A 2026 JGR Planets study (Wueller et al.) found 130 candidate landing sites with PSR access within 2 km. Sites HW04 and HW10 offer continuous Sun and Earth visibility exceeding 25 days. — [JGR Planets 2025JE009434](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009434)

### Inferences
**Sensitivity (computed).** Earth's elevation from a polar site oscillates with amplitude ~6.7° over a ~27-day period. These are standard libration values; I did not source them in this session. The time fraction above a horizon near the middle of that range therefore changes by ~1/(π·6.7) ≈ **4.8% per degree**, compared with ~21% per degree for the Sun. A 0.3° horizon bias that costs ~6 points of sunlight costs only ~1.5 points of Earth visibility.

**Definition offset (computed).** Earth's disc is about 1.9° across from the Moon. "Any part of disc" vs. "centre of disc" therefore shifts the effective threshold by ~0.95°, which is **~4–5 points** of Earth-visibility fraction. Make sure our Earth metric uses PGDA's "any fraction" definition, or report it explicitly as different.

**Where resolution matters for Earth visibility.**
- Only the ~±8° (libration in longitude) azimuth sector around the sub-Earth direction matters. A site-specific multi-resolution refinement could put fine terrain in that wedge only, which is cheap.
- At many south-polar sites that wedge contains the Malapert massif (~120 km), so mid-to-far-field accuracy (≤120–240 m out to ~150 km) matters more for Earth visibility than the 3 km near field, except where a nearby rim blocks the nearside.
- For a DTE mast, a 2–10 m height changes the near-field horizon by 0.1–0.6° at 1 km (section 4 table). That can matter where the blocking terrain is a nearby rim, but hardly at all where it is Malapert.

### Gaps
- No study found that directly quantifies Earth-visibility error as a function of DEM resolution or mast height at the south pole.
- PGDA's Earth-visibility time span and ephemeris settings were not confirmed.

## 6. Efficient horizon algorithms for many points, and their accuracy trade-offs

### Takeaway
The standard scheme is to precompute per-point horizons once, then evaluate time series cheaply. Three acceleration routes are documented:
- **multi-resolution topographic pyramids** (Tong 2023);
- **GPU/OpenCL ray tracing** (~8–12× speed-ups reported in early lunar work);
- **ray-tracing horizon codes with mesh simplification** (HORAYZON), which warns that simplifying distant terrain can miss thin features.

Choose azimuth steps of about 0.25–0.5°, comparable to the 0.53° solar disc.

### Cited Findings
- Precompute-and-store horizons (Mazarico 2011), which decouples horizon cost from time span and step. — [ResearchGate](https://www.researchgate.net/publication/251730356_Illumination_conditions_of_the_lunar_polar_regions_using_LOLA_topography)
- Tong et al. 2023: a Cartesian topographic **pyramid**, with high-accuracy, small-coverage layers near the point and coarser, larger layers farther out. It works directly on the LOLA point network rather than a pre-gridded DEM, and quantifies the cost of gridding and of a coarser horizon. — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0019103522003943)
- Early lunar GPU work (TU Berlin/DLR group, ~2014): ray-tracing illumination in OpenCL on the GPU, **~8–12× faster** than sequential CPU code. GPU horizon computation was considered but not pursued at the time; later GPU work allowed larger areas and longer periods. — [ResearchGate 273675329](https://www.researchgate.net/publication/273675329_Analysis_of_illumination_conditions_at_the_lunar_south_pole_using_parallel_computing_techniques); [ResearchGate 263165257](https://www.researchgate.net/publication/263165257_Calculation_of_illumination_conditions_at_the_lunar_south_pole_-_parallel_programming_approach)
- HORAYZON v1.2 (GMD 2022): ray-tracing horizon and sky-view-factor code with a default **0.25°** horizon accuracy. **Simplifying remote terrain can violate the accuracy requirement** because rays miss mesh triangles. It agrees with other methods for distances above 1 km. — [GMD 15:6817](https://gmd.copernicus.org/articles/15/6817/2022/)
- A&A 2026 lunar thermophysical model: spoke tracing at 0.5° angular resolution, with curvature included. — [A&A 2026](https://www.aanda.org/articles/aa/full_html/2026/10/aa61899-26/aa61899-26.html)
- LunarRF (preprint, Oct 2026): a GPU batch terrain line-of-sight engine for south-pole coverage. Horizon cut-off not confirmed. — [arXiv 2610.34554](https://arxiv.org/pdf/2610.34554)
- Several LOLA-based papers (LROC NAC DTM PSJ 2025, the AGU 2024 SfS work) use the horizon method or standard 3-D rendering (GPU rasterisation) for Sun and Earth statistics. — [PSJ ae10a4](https://iopscience.iop.org/article/10.3847/PSJ/ae10a4); [ADS AGU 2024](https://ui.adsabs.harvard.edu/abs/2024AGUFMP31D.2848B/abstract)

### Inferences
**Ray-march step and azimuth sampling (computed).**
- At distance d, a 0.5° azimuth step leaves gaps of d × 0.0087: ~87 m at 10 km, ~870 m at 100 km. Narrow summits or rim notches can be missed or straddled in the far field.
- With a single-ray-per-azimuth march, consider taking the max over sub-rays (for example, 3 sub-rays per 0.5° bin) in the 10–150 km band, or using max-pooled coarse layers (see section 2). Either avoids missing narrow summits, the same effect HORAYZON warns about.
- The ray-march step should scale with distance (for example, step ≈ resolution of the band, never coarser). A step larger than the cell size in the 3–30 km band would compound the 240 m smoothing bias.

**Cost model for extending fine terrain (computed).**
- Per-point cost scales with Σ(band length / band resolution) per azimuth:
  - 20 m to 3 km: 150 samples
  - 240 m from 3 to 180 km: ~740 samples
  - 1 km from 180 to 460 km: 280 samples
- Pushing 20 m out to 15 km adds ~600 samples per azimuth (roughly doubling cost).
- 60 m from 15 to 50 km adds ~580 samples.
- This is affordable for 22 sites, or for a few thousand route points on GPU or WebGPU. For dense rover-route maps, reuse horizons between neighbouring points (horizons vary slowly with position for far terrain), and only recompute the near-field part per point. This is the logic behind pyramid methods.

**Validation plan.** Treat Connecting Ridge and the Shackleton rim peak as regression tests. Add a per-azimuth horizon diff against a "gold" run (20 m out to 40 km, 60 m to 150 km, 0.25° azimuth with sub-rays). Then decide the band boundaries empirically using the 0.05°-horizon / 0.5-point-sunlight criterion.

### Gaps
- No lunar paper found that benchmarks horizon accuracy against cut-off distance or pyramid level with published numbers. Tong 2023 probably contains them but was inaccessible.
- WebGPU or browser-specific lunar horizon implementations: none found in the literature.
