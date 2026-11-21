# LPSC 2027 abstract draft (two pages max in LPI's template)

**Title:** LUNAR SITE PLANNER: AN OPEN, VALIDATED BROWSER TOOL FOR SUN, EARTH,
POWER AND FLIGHT PLANNING AT THE ARTEMIS III CANDIDATE REGIONS

**Authors:** A. R. Bin Remy Azrai¹, [mentor / co-authors]², ¹[School or institution, Kuala Lumpur, Malaysia], ²[mentor's institution] ([contact email, added when submitting])

**Introduction:** Choosing where and when to land near the lunar south pole
comes down to four linked questions: will the lander see the Sun, will it see
Earth, will a Deep Space Network station see it, and how does it get there.
Validated answers exist [1,2] but are spread over separate products and need
GIS and orbital-mechanics tools to combine. We built Lunar Site Planner, an
open-source browser tool that answers all four together for any site and
window in seconds, and we report how it compares with independent references.
It started as a NASA Space Apps Challenge 2026 entry.

**Methods:** *Terrain.* Skylines are cast from NASA LRO LOLA topography: the
20 m south-polar product LDEM_80S_20MPP_ADJ [3] within 8 km of each analysed
site, 240 m and 1 km south-polar grids beyond, and a global 8 px/deg grid. Each
20 m tile is checked against the 240 m grid before use (mean height difference
2.0–3.6 m). *Ephemeris.* Sun and Earth positions come from astronomy-engine with
the IAU lunar rotation model, converted to local azimuth and elevation at a 2 m
mast. *Operations.* Each time step gives the visible fraction of the solar disk,
solar power for a tracking array, Earth clearance above the skyline, DSN
station visibility and an S-band link margin; windows are summarised as
sunlit share, longest night, battery need and longest communication blackout.
*Flight.* A patched-conic model plans launch to touchdown for direct, phasing
and low-energy routes: parking-orbit tilt from the launch site's latitude and
the Moon's declination, trans-lunar injection, lunar orbit insertion to
100 km, descent orbit and powered descent, with propellant from the rocket
equation. *Artemis III regions.* The nine candidate regions announced in
October 2024 are included with outlines from the USGS release [4].

**Validation:** Sun and Earth directions agree with JPL Horizons to 0.007° (154
cases). The Sun's elevation at five Apollo landings is within 0.35° of the
mission reports, and local sunset at Blue Ghost M1, Chandrayaan-3 and SLIM is
within 0.4 days of the dates the teams reported. Our 2027 sunlight map of the
south pole correlates with NASA Goddard's average visibility map [2] at
r = 0.92 (mean difference 4.2 points over 24,344 cells), and Earth visibility at
r = 0.975. At the Shackleton connecting ridge, sunlight drops from 74% of 2027
with 240 m terrain to 64% with 20 m terrain, against 68% from [2] (which counts a
partly visible Sun): terrain resolution, not ephemeris, dominates the error budget. Against an LROC NAC
controlled mosaic of the Peak Near Cabeus B region (eight images, 18 September
2017) [5], predicted lit and shadowed terrain agrees with the photo in
93% of 103,569 comparable 40 m cells (Cohen's κ = 0.86) with 20 m terrain,
versus 88% (κ = 0.76) with 240 m terrain. Nearly all disagreements are cells we
predict lit that the photo shows dark, along shadow edges: our shadows are
slightly too short, as expected from terrain that is partly interpolated.
<!-- TO CHECK BEFORE SUBMITTING (21 Nov 2026): the horizon engine now refines ray
samples around skyline crests, which changed the ridge numbers above (was 79% / 66%).
The LROC numbers (93%, κ 0.86; 88%, κ 0.76) and the map correlations were measured
before that change: re-run the "Check shadows against an LROC photo" and PGDA
workflows and update them here. See docs/VALIDATION.md section 3. --> For flight, Apollo 11's trans-lunar injection, lunar orbit
insertion and descent are reproduced to within 0.05 km/s.

**Results:** [Table: for each of the nine Artemis III region centres over 2027,
sunlit share, Earth-in-view share, longest night and longest blackout, from
docs/API daily tables.] [One or two sentences on what stands out, e.g. which
regions combine light and Earth, and how much results change across a region.]

**Availability:** The tool, its source (MIT licence) and a static read-only API
(daily tables per site, GeoTIFF lighting maps in IAU 2015 projections, and the
engine as an ES module) are at https://arairo.github.io/IMPROVED_lunarmoon-/
and https://github.com/Arairo/IMPROVED_lunarmoon-. It is a planning tool, not
mission-certified.

**References:** [1] Mazarico E. et al. (2011) *Icarus, 211*, 1066–1081.
[2] NASA GSFC PGDA, Lunar south pole average illumination (AVGVISIB, 2016).
[3] Barker M. K. et al. (2023) *PSJ, 4*, 183. [4] McClernan M. T. (2024) USGS
data release, doi:10.5066/P1MEQ6UK. [5] Henriksen M. R. et al. (2023) European
Lunar Symposium, 134–135.
