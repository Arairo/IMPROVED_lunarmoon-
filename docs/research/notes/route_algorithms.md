# Rover route-planning algorithms and tools for lunar terrain with time-varying sunlight and Earth visibility, and how feasible they are in a browser

Research date: 2026-11-25. Method notes for the report writer:
- **Literature access was limited.** WebFetch could not resolve arxiv.org or www.mdpi.com from this session ("ENOTFOUND", outside the session's allowed network domains). Per session rules, no further fetches were attempted. Every literature claim below comes from search-engine result snippets and summaries, not from reading the full text. Treat specific numbers from papers as "reported in search snippets" and check them before quoting them as final.
- **Performance numbers are measured, not cited.** No published browser-pathfinding benchmark with millisecond timings was found, so I wrote and ran micro-benchmarks in Node v22.23.5. Node uses the same V8 JavaScript engine as Chrome. The runs were single-threaded on a 4-core Linux container with 16 GB RAM. Scripts: `/tmp/claude-0/-home-user-IMPROVED-lunarmoon-/5b5147db-0f4f-55cb-9171-ffd076a2340d/scratchpad/bench/grid_bench.js` and `.../bench/horizon_bench.js`. The scratchpad is temporary. Results are labelled "[measured, this session]". They use a synthetic fractal DEM with craters, not real LOLA tiles, so node-expansion counts on real terrain will differ.
- **Context from the app's code.** `src/core/horizon.js` computes horizons per point. It uses a 0.5° azimuth step (`AZ_STEP_DEG = 0.5`, so 720 azimuths), geometric ray growth of 1.5% per step (`RAY_GROWTH = 0.015`), a maximum distance of up to 300 km, and crest refinement. It does not create any Web Worker (`new Worker` was not found in `src/`).

---

## Q1. Which algorithms suit static slope cost and which suit time-dependent illumination, and how are energy and "time in shadow" costs modelled?

### Takeaway
Grid graph search (Dijkstra/A*) on a raster cost map is the workhorse for both mission planning and GIS. Field D* (any-angle interpolation) flew on the Mars Exploration Rovers (MER) and Curiosity.

Moving shadows need time in the search. Published lunar polar planners do this in two ways:
- A time-expanded or spatiotemporal search, where the state is (x, y, t) and possibly battery level (TEMPEST, Otten/CMU, Lamarre/STARS, DIC3D-A*).
- A static search over masks of "continuously lit" cells (Otten's connected-component method).

Sampling planners (RRT*) and fast marching appear in reviews but are not the tools used for lunar mission-level, time-dependent routing.

### Cited Findings
- **Curiosity and Perseverance.** Curiosity's onboard planning is based on Field D* combined with the GESTALT hazard evaluator. GESTALT models the rover as a disc, ignoring heading. Perseverance's ENav ranks candidate paths, then runs Approximate Clearance Evaluation (ACE) on the top-ranked ones. ACE is orientation-sensitive and allows straddling rocks. — [Enhanced Autonomous Navigation on the Perseverance Mars Rover (ResearchGate)](https://www.researchgate.net/publication/397929378_Enhanced_Autonomous_Navigation_on_the_Perseverance_Mars_Rover); [JPL Robotics: Mars 2020 Mobility](https://www-robotics.jpl.nasa.gov/what-we-do/flight-projects/mars-2020-rover/m2020mobility/); [Abcouwer et al., ACE (arXiv 1808.00031)](https://arxiv.org/pdf/1808.00031)
- **Thinking while driving.** Perseverance plans while driving ("thinking-while-driving"). One paper reports average autonomous speeds of about 17.3 m/h for Curiosity versus about 92 m/h for Perseverance. JPL gives 15–18 m/h for Curiosity. — [Verma et al., Science Robotics 2023, "Autonomous robotics is driving Perseverance rover's progress on Mars"](https://www.science.org/doi/10.1126/scirobotics.adi3099); [JPL Mobility page](https://www-robotics.jpl.nasa.gov/what-we-do/flight-projects/mars-2020-rover/m2020mobility/)
- **ACE is the onboard bottleneck.** ACE is expensive on the RAD750 processor. MLNav and related ML-heuristic work cuts the number of ACE calls, but these are research results, not flight software. — [Daftry et al., MLNav (arXiv 2203.04563)](https://arxiv.org/pdf/2203.04563); [ML-Based Path Planning for Improved Rover Navigation (arXiv 2011.06022)](https://arxiv.org/pdf/2011.06022)
- **Field D* on MER.** A global (Field D*-family) path planner was added onboard the Mars Exploration Rovers. — [Carsten et al., "Global Path Planning on Board the Mars Exploration Rovers" (ResearchGate)](https://www.researchgate.net/publication/228365221_Global_Path_Planning_on_Board_the_Mars_Exploration_Rovers); [Biesiadecki & Maimone, "The MER surface mobility flight software: Driving ambition"](https://www.researchgate.net/publication/228652523_The_Mars_Exploration_Rover_surface_mobility_flight_software_Driving_ambition)
- **Time as a planning dimension (TEMPEST, CMU, 2001–2005).** Rover state is x, y, time and battery energy. TEMPEST pre-calculates a sequence of lighting maps, each a snapshot in time, and searches over them. It models planetary curvature and horizon roll-off with an ellipsoid. — [Tompkins et al. 2002, TEMPEST](https://publications.ri.cmu.edu/storage/publications/pub_files/pub3/tompkins_paul_2002_1/tompkins_paul_2002_1.pdf); [Tompkins et al. 2001](https://publications.ri.cmu.edu/storage/publications/pub_files/pub2/tompkins_paul_2001_1/tompkins_paul_2001_1.pdf)
- **TEMPEST re-planning.** In simulation, the rover senses elevation, slope and lighting within 2 pixels at each step, and TEMPEST re-plans. Path cost is the integral of cell weights along the path. — [Tompkins 2004, Global Path Planning for Mars Rover Exploration](https://www.ri.cmu.edu/pub_files/pub4/tompkins_paul_2004_3/tompkins_paul_2004_3.pdf); [Tompkins 2005, Mission-Directed Path Planning (thesis)](https://www.ri.cmu.edu/pub_files/pub4/tompkins_paul_2005_1/tompkins_paul_2005_1.pdf)
- **Otten et al. (ICRA 2015): connected-component routing.** Connected-component analysis over space-time finds routes of continuous illumination and traversable slope. Illumination maps come from LOLA. — [Otten, Jones, Wettergreen, Whittaker, ICRA 2015](https://www.ri.cmu.edu/app/uploads/2018/01/ICRA2015_Otten_3109.pdf)
- **Otten's thesis (CMU-RI-TR-18-21, 2018).** Sun-synchronous spatiotemporal routes exist near the lunar poles that would let solar rovers survive multiple lunar days. The planning relies on spatiotemporal models of illumination and Earth view. The FSR 2017 paper notes that some such routes need driving speeds as low as 0.1 cm/s. — [Otten thesis](https://publications.ri.cmu.edu/storage/publications/2018/01/thesis_otten.pdf); [Otten, Wettergreen, Whittaker, FSR 2017](https://publications.ri.cmu.edu/storage/publications/2018/01/FSR_2017_Otten_66.pdf)
- **Lamarre, Malhotra, Kelly (IEEE Aerospace 2024).** This is risk-aware, mission-level planning for a solar rover exploring permanently shadowed regions (PSRs) while suffering random faults. A risk-aware plan still reached its target after a second fault. A risk-agnostic plan could miss a solar charging window and run out of battery. Evaluation used Monte Carlo runs against a CCDP baseline. No runtime figures were found. — [STARS Lab paper page](https://papers.starslab.ca/safe-mission-level-planning/); [arXiv 2401.08558](https://arxiv.org/pdf/2401.08558)
- **Recovery policies (Acta Astronautica 2023).** The safest way out of a PSR is set by the rover's survival probability, not the shortest path. The arXiv version extends this to Earth communication blackouts. — [STARS page](https://papers.starslab.ca/recovery-policies-psr-exploration/); [arXiv 2307.16786](https://arxiv.org/html/2307.16786)
- **DIC3D-A\* (Miao & Wei, Remote Sensing, Jan 2026).** A "Dynamic Illumination-Constrained Spatio-Temporal A*" for the lunar south pole. The authors argue that classic methods struggle to model time-varying illumination in real-time path search. One summary reports a 1300 m × 1300 m DEM at 5 m/pixel from LRO altimetry, with hourly solar visibility for Nov–Dec 2026. That detail comes from a secondary summary and needs checking against the full text. — [MDPI Remote Sensing 18(2):310](https://www.mdpi.com/2072-4292/18/2/310)
- **Spatiotemporal deep learning for Chang'E-7 (Remote Sensing, 2026).** Continuous-illumination mapping at 1 h time steps and 20 m/pixel (Shackleton–de Gerlache ridge), followed by an optimized A*. The method details come from a search summary and the match to this DOI is likely but unconfirmed. — [doi:10.3390/rs18172950](https://doi.org/10.3390/rs18172950)
- **Two-step lunar planner (Acta Astronautica, 2025).** A genetic algorithm orders waypoints. Trajectories are then computed that avoid static obstacles, keep Earth contact and stay solar-powered. — [ScienceDirect S0094576525004898](https://www.sciencedirect.com/science/article/pii/S0094576525004898)
- **Recent reviews.** These include a planetary path-planning review (Remote Sensing 17(11):1924, 2025) and a Chinese-language review of lunar global planning under spatiotemporal constraints (Manned Spaceflight, 2026). Only titles and abstracts were seen. — [MDPI review](https://www.mdpi.com/2072-4292/17/11/1924); [ResearchGate copy](https://www.researchgate.net/publication/392269148_A_Comprehensive_Review_of_Path-Planning_Algorithms_for_Planetary_Rover_Exploration); [SciEngine review 2026](https://www.sciengine.com/ZRHT/doi/10.3724/zrht.1674-5825.2026012)
- **Learning-based global planners.** Learning-based lunar global planners using environmental constraints and the rover's internal resource state exist (2021–2024). — [PMC10857624](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10857624/); [PMC7866010](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7866010/)

### Inferences
These are standard algorithm facts from general knowledge, not fetched this session.
- **Static cost.** Dijkstra costs O((V+E) log V) with a binary heap, and E ≈ 8V on an 8-connected grid. A* with an admissible heuristic returns the same optimal cost with fewer expansions; the benchmark confirmed identical costs (Q4).
- **D\*/D\* Lite** (Koenig & Likhachev 2002) are incremental re-planners for a rover that discovers map changes while moving. In a browser where the whole map is known and a full re-plan takes about 20–70 ms, incremental re-planning brings no benefit.
- **Field D\* / Theta\*** (any-angle planners) remove the 45° zig-zag of 8-connected paths. A cheaper browser option is 8- or 16-connected A* followed by line-of-sight "string-pulling" smoothing that re-checks slope along each shortened segment.
- **Fast marching** solves the isotropic Eikonal equation and gives smooth geodesics. It cannot represent direction-dependent cost (uphill ≠ downhill) without anisotropic variants, so it is a poor fit for energy-aware slope costs.
- **RRT\*** is randomized and only asymptotically optimal. It suits high-dimensional or kinodynamic problems, not a 2-D raster cost map. Its non-deterministic output is also bad UX (the route changes on each click).
- **Time-dependent search.** If the rover may wait in place, arrival time obeys the FIFO property, and a time-dependent Dijkstra with one label per cell is exact for earliest arrival (Dreyfus 1969; Kaufman & Smith 1993). It is no longer exact once the objective mixes time, energy and shadow penalties, which then need either:
  - a time-expanded state (cell × time-slice), or
  - multi-label/Pareto search.

  This matches why TEMPEST and Lamarre keep time and battery in the state.
- **Modelling "time in shadow".** Two forms appear across the sources: a hard constraint (never be in shadow, or never longer than the battery survives), or a soft penalty proportional to seconds spent dark. Battery-state planners (TEMPEST, Lamarre) turn shadow into energy deficit against a battery limit.

### Gaps
- No full text was read for the Lamarre, DIC3D-A* or Acta Astronautica 2025 papers (arxiv.org and mdpi.com were unreachable). Their exact graph formulations, time steps and runtimes are unverified.
- "Robust-STP3R" (a robust spatio-temporal planner for schedule slips) appeared in a search summary, but its authors and venue could not be attributed. It is excluded from the findings.
- No specific 2020–2026 papers by authors named Bai, Oh or Yuan on lunar south-pole planning were found in the searches run. They may exist under other titles.
- No ESA route-planning work was found in the searches run.
- MAPGEN is an activity-planning (scheduling) tool for MER, not a path planner. This is from general knowledge; it was not searched.

---

## Q2. What have published lunar and Mars applications done (VIPER, Mars rovers, sun-synchronous planners, Tompkins, recent south-pole papers)?

### Takeaway
VIPER's planning was operational and map-driven rather than a single clever algorithm:
- 1 m/pixel terrain plus SPICE ephemerides gave sun and Deep Space Network (DSN) visibility maps every couple of hours.
- A strategic baseline route and short tactical routes were planned within them.
- Moving shadows and Earth-link loss were handled by timing drives and pre-identified "safe havens".

The academic line (TEMPEST, then Otten/CMU, then Lamarre/STARS, then DIC3D-A* and similar) supplies the formal spatiotemporal search methods.

### Cited Findings
- **VIPER constraints.** VIPER was teleoperated over direct-to-Earth links, so it had to stay out of terrain radio shadows. When Earth set, it had to park at a "Safe Haven" with enough sunlight to survive. Traverses had to be timed to avoid moving shadows, which move at about 0.1–1.8 cm/s. Earth was below the horizon about half the time in site analyses. — [VIPER SRR overview, Ennico 2022 (NTRS)](https://ntrs.nasa.gov/api/citations/20220005327/downloads/VIPER-SRR-June2022-Ennico.pdf); [An Overview of Mission Planning for the VIPER Rover (NASA, 2022)](https://www.nasa.gov/wp-content/uploads/2022/05/overview_of_mission_planning_for_the_viper_rover.pdf?emrc=cc2934). The search summary drew these points from this group of documents; the exact PDF for each point was not confirmed.
- **VIPER maps.** Illumination maps every 2 hours and DSN-station communication maps on a similar cadence, computed from 1 m/pixel terrain plus SPICE data for the Moon, Sun and DSN stations. Planning was split into a strategic baseline route and tactical short routes. — [VIPER Geospatial Data for Site Selection and Traverse Planning, LPSC 2023 #2377](https://www.hou.usra.edu/meetings/lpsc2023/pdf/2377.pdf); [VIPER Site Analysis, Planetary Science Journal](https://iopscience.iop.org/article/10.3847/PSJ/ae061a)
- **VIPER status.** Later VIPER status briefings exist (Fong, 2024–2025). — [NTRS 2025-09-10](https://ntrs.nasa.gov/api/citations/20250009082/downloads/viper-2025-09-10.pdf?attachment=true); [NTRS 2024-06-07](https://ntrs.nasa.gov/api/citations/20240007332/downloads/viper-2024-06-07.pdf?attachment=true)
- **Otten/CMU field test.** Route-planning software accounted for illumination, communications availability, hazard avoidance and energy. Illumination and communications maps came from the AVOI physics-based simulator. — [Field Test of Route Planning Software for Lunar Polar Missions (ResearchGate)](https://www.researchgate.net/publication/322103818_Field_Test_of_Route_Planning_Software_for_Lunar_Polar_Missions_Future_Missions_and_Technology)
- **Web-based planning precedent (LPSC 2024).** A web-based rover mission-planning and constraint-checking tool for a multi-day lunar south-pole mission, built for highly dynamic illumination and communication access. Future updates were planned for wider time-varying access. This is the closest published precedent to the app's feature. — [LPSC 2024 #2579](https://www.hou.usra.edu/meetings/lpsc2024/pdf/2579.pdf)
- **Long-range autonomy (Lamarre et al., i-SAIRAS 2024).** Argues for adaptive decision-making in long-range planetary mobility. — [arXiv 2409.19455](https://arxiv.org/html/2409.19455)
- **Mars rovers.** Field D*/GESTALT on Curiosity; ENav plus ACE on Perseverance, with roughly 5× faster autonomous driving. — see Q1 citations: [Science Robotics adi3099](https://www.science.org/doi/10.1126/scirobotics.adi3099); [JPL](https://www-robotics.jpl.nasa.gov/what-we-do/flight-projects/mars-2020-rover/m2020mobility/)
- **Older lunar traverse tool (MIT SEXTANT).** A MATLAB tool using a lunar DEM to find the most efficient path. — [Johnson et al., AIAA SPACE 2010](https://web.mit.edu/aeroastro/www/people/dnewman/pdf2/DJN_AJohnsonSPACEAUG2010.pdf)
- **Static plus dynamic constraints.** "Global Path Planning of Lunar Rover Under Static and Dynamic Constraints" exists (title seen only). — [ResearchGate 340501208](https://www.researchgate.net/publication/340501208_Global_Path_Planning_of_Lunar_Rover_Under_Static_and_Dynamic_Constraints)
- **Energy constraints (2025).** Energy-constrained navigation under hybrid RTG–solar power: the cost combines smoothness, temporal regularisation, terrain difficulty and energy feasibility. — [arXiv 2509.15062](https://arxiv.org/pdf/2509.15062)

### Inferences
- VIPER's 2-hour illumination cadence and Otten's 1 h steps suggest that coarse time slices (1–4 h) are standard practice for strategic routes. At a few km and rover speeds of a few cm/s, a route takes tens of hours, so 10–50 time slices cover a traverse.
- The "safe haven" concept translates directly to a UI feature: mark cells with long continuous sunlight and Earth view as places where the planner may "wait".

### Gaps
- The VIPER traverse-planning algorithm itself (search method, cost weights, slope limits) was not found in the snippets. The sources describe the maps and operations concept, not the solver.
- The 2025 VIPER flight/re-manifest status was not verified in this session.

---

## Q3. What cost functions are used (slope energy, roughness, risk, illumination and comms penalties), and how are weights chosen?

### Takeaway
Typical costs are a weighted sum per edge of these terms:
- distance or time,
- a slope term (often a hard cut-off above a maximum slope plus a growing penalty below it),
- roughness or elevation difference,
- an energy term (uphill work; sometimes terramechanics),
- illumination and communication terms (penalty or hard constraint).

No source found gives canonical weight values. Weights are tuned per mission or exposed as parameters, so the app should expose them.

### Cited Findings
- **Yutu-2.** Each grid cell's traversability cost combines slope, roughness and elevation-difference costs. — [NNPP paper describing Yutu-2 traversability (arXiv 2308.04792)](https://arxiv.org/pdf/2308.04792)
- **Yutu-2 / Chang'e-4 teleoperation.** A comprehensive cost map was built from the DEM, with slope and roughness terms, and searched for the optimal path. — [ISPRS Annals 2020, Computer Vision in the Teleoperation of the Yutu-2 Rover](https://isprs-annals.copernicus.org/articles/V-3-2020/595/2020/isprs-annals-V-3-2020-595-2020.pdf)
- **External cost terms.** Route search also considers illumination, communication geometry and shadow. — [space-robotics.org Yutu-2 page](https://space-robotics.org/robots/lunar/yutu-2/). An overview separates rover-related costs (locomotion type, slip on slopes) from external costs (solar illumination, terrain shadows). — [EUCASS: AI in Planetary Exploration](https://www.eucass.eu/component/docindexer/?task=download&id=7190)
- **Energy-aware planning (Sakayori & Ishigami, Advanced Robotics 2021).** A power-consumption model built on wheel–soil interaction, with the slope–power relationship fitted by a neural network on simulation data. A cost function covers both power generation and consumption, and Dijkstra finds the path. — [Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/01691864.2021.1959396); [ResearchGate](https://www.researchgate.net/publication/353662555_Energy-aware_trajectory_planning_for_planetary_rovers)
- **Frontiers in Astronomy and Space Sciences (30 Mar 2026), lunar south pole.**
  - The planner penalises slope and uses a terramechanics energy model.
  - Slope above a threshold is an impassable barrier with infinite cost.
  - A linear slope penalty is simpler to tune but under-estimates cost on flat, soft ground; the terramechanics term captures that.

  — [doi:10.3389/fspas.2026.1764826](https://www.frontiersin.org/journals/astronomy-and-space-sciences/articles/10.3389/fspas.2026.1764826/full)
- **Downhill vs uphill.** Descending a slope uses less battery than ascending it, so heading-specific costs are needed (CMU thesis on heading-specific preplanning, 2017). — [CMU thesis](https://publications.ri.cmu.edu/storage/publications/2017/06/Final_Thesis_pub.pdf)
- **GRASS `r.walk` (GIS precedent for anisotropic slope cost).**
  - Cumulative cost is a linear combination of walking time (from distance and elevation change) and λ × friction-map cost.
  - Defaults are `walk_coeff = 0.72, 6.0, 1.9998, -1.9998`, `lambda = 1.0` and `slope_factor = -0.2125`.
  - It uses Dijkstra. The `-k` "knight's move" option (16-neighbour) improves accuracy at higher cost.
  - Memory defaults to 300 MB. Paths are back-traced from the direction map with `r.path`.

  — [GRASS r.walk manual](https://grass.osgeo.org/grass85/manuals/r.walk.html)
- **RTG–solar hybrid cost.** The objective is a weighted sum of smoothness, temporal regularisation, terrain difficulty and energy feasibility; weights were not in the snippet. — [arXiv 2509.15062](https://arxiv.org/pdf/2509.15062)
- **Path cost as integrated cell weights.** — [Tompkins thesis 2005](https://www.ri.cmu.edu/pub_files/pub4/tompkins_paul_2005_1/tompkins_paul_2005_1.pdf)

### Inferences
- **r.walk's coefficients.** These follow the Aitken/Langmuir hiking model: time per horizontal distance, plus extra time per metre climbed, plus different terms for gentle and steep descent. This is general knowledge; the search results did not name Tobler or Langmuir. A rover analogue is energy ∝ distance × rolling resistance + m·g·max(Δh, 0), with regenerative or no credit downhill. The benchmark used this shape: cost = d·(1 + 4·(s/s_max)²) + 3·max(Δh, 0), with slope > 20° impassable.
- **Suggested browser cost per edge.** Express every term in seconds of driving-equivalent so the weights are interpretable:

  `cost = t_drive(d, slope) · [1 + w_shadow·dark + w_comm·noEarth] + w_up·Δh⁺`

  with a hard slope cap (a user setting, default around 15–20°). Show a per-term breakdown of the chosen route (km, max slope, hours dark, hours without Earth, climb in metres) so users see the trade-off.
- **Weights.** With no published canonical weights, offer 2–3 presets (Shortest, Safest-power, Comms-first) and sliders rather than claiming an "optimal" weighting.
- **Roughness.** At 20 m LOLA resolution, roughness (rock and crater hazards at the rover scale of about 1 m) is mostly invisible. Yutu-2 used 0.02 m local DEMs for hazard checks (Q6). The app should say that routes are strategic, not hazard-cleared.

### Gaps
- No numeric weight values were found for any lunar planner (VIPER, Yutu-2, DIC3D-A*). Full texts were not accessible.
- No VIPER maximum-slope figure was found in the searches run, so the 15–20° default above is an engineering suggestion, not a citation.

---

## Q4. What open tools exist (Moon Trek, GRASS, Python, JavaScript, WebAssembly/Web Worker), and what grid sizes run in a browser in a few seconds?

### Takeaway
Measured in V8 [this session], a typed-array A*/Dijkstra over a 20 m grid takes:
- about 10–70 ms for a route of about 6 km, even inside a 2000×2000 (40 km) grid, because the search stops at the goal;
- about 1 s to flood the whole 4M-cell grid.

A time-expanded (cell × time-slice) search is 10–40× slower and memory-heavy: 0.4–1.2 s and 48–256 MB for 250²–500² cells × 24–32 slices. The real bottleneck is precomputing per-cell horizons: about 3–10 s single-threaded for a 6 km × 6 km 20 m corridor at 32–64 azimuths. Plain JavaScript is adequate for search; horizon precompute should go in Web Workers. WebAssembly is optional.

### Cited Findings
- **NASA Moon Trek** has added rover traverse path planning, line-of-sight analysis and 3-D traverse visualisation tools, described in 2022 abstracts. The current feature set and cost model were not confirmed. — [Lunar Path Planning using NASA Moon Trek's New Analysis Tools, COSPAR 2022](https://ui.adsabs.harvard.edu/abs/2022cosp...44..305L/abstract); [Moon Trek's New Visualization and Analysis Tools, EPSC 2022](https://ui.adsabs.harvard.edu/abs/2022EPSC...16...93L/abstract)
- **GRASS `r.walk` / `r.path`**: Dijkstra-based anisotropic cost distance, 300 MB default memory, optional 16-neighbour moves. — [GRASS manual](https://grass.osgeo.org/grass85/manuals/r.walk.html)
- **JavaScript / WebAssembly grid projects** exist but publish no millisecond numbers:
  - a Dijkstra-vs-A* benchmark repo,
  - a C++20 to WebAssembly (Emscripten) visualiser with a native benchmark CLI,
  - a Go to WebAssembly "pathfinding lab" whose tests check A* cost equals Dijkstra on 200 random maps.

  Moving AI benchmark maps are the standard grid test set. — [Lorenz331/pathfinding-benchmark](https://github.com/Lorenz331/pathfinding-benchmark); [Aress05/PathfindingVisualizer](https://github.com/Aress05/PathfindingVisualizer); [rahelmartim/pathfinding-lab PR](https://github.com/rahelmartim/pathfinding-lab/pull/1); [ashblue/javascript-pathfinding](https://github.com/ashblue/javascript-pathfinding)
- **Comparable open lunar projects** (mostly NASA Space Apps 2026 entries, unvetted):
  - `lunar-polar-traverse`: a time-dependent planner on the LOLA 20 m DEM with a SPICE sun, per-cell horizon profiles, lit/dark intervals over a 720 h horizon, snapshot and mean-map baselines, and a C++ replay checker. — [amoeinn/lunar-polar-traverse](https://github.com/amoeinn/lunar-polar-traverse)
  - Site navigators: Common Horizon (LOLA skyline every 0.5° of azimuth), Luna_Scout (LOLA + DE440 via SPICE), lunar-window, MoonNav. — [common-horizon](https://github.com/dan-lee-odinson/common-horizon); [Luna_Scout](https://github.com/SimeonVutov/Luna_Scout); [lunar-window](https://github.com/hanoudee/lunar-window); [MoonNav](https://moonnav.vercel.app/)
- **Hobby planners**: a MATLAB File Exchange lunar rover path planner, and a Chandrayaan-imagery planner (a 100 m+ path with sunlight and science stops). — [MATLAB File Exchange 128759](https://www.mathworks.com/matlabcentral/fileexchange/128759-lunar-rover-path-planning); [rakshanda33/Lunar-Navigation-Path-Planner](https://github.com/rakshanda33/Lunar-Navigation-Path-Planner)

**Static search [measured, this session].** Node 22 / V8, single thread. 8-connected; typed arrays (Float64 g, Int32 parent); indexed binary heap with decrease-key. Slope > 20° impassable. Cost = d·(1 + 4(s/s_max)²) + 3·Δh⁺. Cells are 20 m.

| Grid (cells, extent) | Goal | Dijkstra | A* (Euclidean heuristic) | Expanded nodes D / A* |
|---|---|---|---|---|
| 250² (62.5k, 5 km) | far corner | 25 ms | 23 ms | 62k / 44k |
| 500² (0.25M, 10 km) | far corner | 64 ms | 73 ms | 249k / 182k |
| 500² | ~5.8 km away | 22 ms | 15 ms | 80k / 34k |
| 1000² (1M, 20 km) | far corner | 291 ms | 337 ms | 995k / 749k |
| 1000² | ~5.8 km away | 31 ms | 22 ms | 90k / 32k |
| 2000² (4M, 40 km) | far corner (~51 km diagonal) | 963 ms | 1019 ms | 3.98M / 2.79M |
| 2000² | ~5.8 km away | 66 ms | 52 ms | 128k / 43k |

A* and Dijkstra costs matched exactly in every feasible case. Generating the 2000² synthetic DEM took 0.7–0.9 s, which is comparable to decoding tiles.

**Time-dependent search [measured, this session].** Synthetic moving-shadow and Earth-visibility bitmasks, 4 h slices, effective speed 0.05 m/s.
- **Earliest-arrival time-dependent Dijkstra.** One label per cell. Hard rule: only enter cells that are sunlit at arrival, and wait only in lit cells.
  - It ran in 13–31 ms on 250²–1000² grids, the same order as the static search.
  - Several synthetic cases were infeasible ("no route"), which is realistic behaviour for hard constraints.
- **Time-expanded search.** State = (cell, slice); continuous arrival time kept per state; wait action allowed; soft penalties of ×3 for shadow and ×1 for no Earth.

| Cells × slices | States | Memory | Search time |
|---|---|---|---|
| 250² × 24 | 1.5M | ~48 MB | 377 ms |
| 250² × 32 | 2.0M | ~64 MB | 368 ms |
| 500² × 24 | 6M | ~192 MB | 927 ms |
| 500² × 32 | 8M | ~256 MB | 1183 ms |

Memory is about 32 bytes per state.

**Horizon precompute [measured, this session].** Ray-march per cell per azimuth with bilinear sampling, geometric step growth, curvature correction (d²/2R), reach 19 km, 2 m mast.

| Corridor | Azimuths | Step growth | Time | Samples | Table size |
|---|---|---|---|---|---|
| 100² cells (2 km) | 64 | 1.05 | 1.35 s | 90M | — |
| 300² (6 km) | 32 | 1.08 | 3.1 s | 259M | 11.5 MB Float32 / 2.9 MB Uint8 |
| 300² | 64 | 1.05 | 9.5 s | 812M | 23 MB / 5.8 MB |
| 300² | 128 | 1.03 | 34.9 s | 2.67G | 46 MB / 11.5 MB |

- Throughput was about 12–15 ns per sample.
- Testing sun visibility from the stored horizon table for 300² cells × 336 hourly steps (14 days) took 373 ms.

### Inferences
- **Grid-size answer.** For "start to a destination a few km away", a padded bounding box around the start–goal segment at 20 m (e.g., 6–10 km on a side, i.e. 300²–500², 0.09–0.25M cells) plans a static route in under about 30 ms. A full 2000² (40 km) grid at 20 m runs in about 1 s per flood. That is fine in a Worker, but memory reaches roughly 130 MB (about 32 bytes per cell across g, parent, heap and DEM). Planning on 240 m tiles is trivially cheap (a 40 km box is about 167² cells) and suits a first coarse pass.
- **Mobile devices.** These were not measured. Phones are commonly 2–5× slower than desktop V8, so budget about 3× when choosing defaults. This is a general-knowledge estimate.
- **WebAssembly** is unnecessary for the search at these sizes: the hot loop is already typed-array integer and float code, which V8 compiles well. Consider WebAssembly with SIMD only for horizon ray-marching if Web Workers are not enough. No measured JS-vs-WebAssembly figures were found for this workload.
- **Web Workers.** The horizon precompute is embarrassingly parallel by cell rows or azimuths. Splitting across `navigator.hardwareConcurrency` workers (often 4–8) should cut 3–10 s to about 1–3 s; this was not measured.
- **SharedArrayBuffer** needs cross-origin isolation (COOP/COEP headers). GitHub Pages cannot set custom headers (general knowledge; a service-worker shim exists). Pass results as transferable ArrayBuffers instead.
- **The app's horizon routine is too heavy per cell.** The existing per-point `computeHorizon` uses 720 azimuths, 1.5% growth and 300 km reach, which is roughly 465k samples per point by estimate. Applied to 90k corridor cells, that would take minutes. Instead:
  - use 32–64 azimuths and about 10–20 km local reach at 20 m;
  - take the maximum of that with the site's existing high-fidelity far-field horizon (distant ridges subtend nearly the same angles across a 6 km corridor);
  - compute only inside a corridor around a first static route (e.g., ±1–1.5 km), which removes about 50–80% of cells.

### Gaps
- scikit-image `graph.MCP` / `route_through_array` and networkx were not covered by the searches run. Their APIs and performance are unverified here, though both are well-known Python options.
- No published numbers were found for JS vs WebAssembly grid pathfinding, or for pathfinding on mobile browsers.
- The Moon Trek traverse tool's algorithm and cost model are undocumented in the sources found.

---

## Q5. How do planners precompute time-varying illumination (and Earth visibility) along candidate paths efficiently?

### Takeaway
Two patterns dominate:
1. Precompute a stack of lighting and communication snapshot maps at a fixed cadence (TEMPEST; VIPER every ~2 h from 1 m DEMs + SPICE; Otten via LOLA and AVOI; 1 h steps in 2026 papers).
2. Precompute a per-cell horizon profile once, then sweep the sun and Earth vectors over time to get lit/dark intervals (lunar-polar-traverse: LOLA 20 m, 720 h).

The horizon-profile approach is the right one for a browser. The expensive ray-marching is done once; each additional time step is then a cheap table lookup.

### Cited Findings
- **TEMPEST** pre-calculates a sequence of lighting maps (snapshots in time), modelling curvature and horizon roll-off. — [Tompkins 2002](https://publications.ri.cmu.edu/storage/publications/pub_files/pub3/tompkins_paul_2002_1/tompkins_paul_2002_1.pdf)
- **VIPER**: illumination maps every 2 hours and DSN communication maps on a similar cadence, from 1 m/pixel terrain + SPICE. — [LPSC 2023 #2377](https://www.hou.usra.edu/meetings/lpsc2023/pdf/2377.pdf); [VIPER Site Analysis, PSJ](https://iopscience.iop.org/article/10.3847/PSJ/ae061a)
- **Otten et al.** build illumination maps from LOLA. The field-test planner used the AVOI simulator for illumination and communications maps. — [ICRA 2015](https://www.ri.cmu.edu/app/uploads/2018/01/ICRA2015_Otten_3109.pdf); [Field test (ResearchGate)](https://www.researchgate.net/publication/322103818_Field_Test_of_Route_Planning_Software_for_Lunar_Polar_Missions_Future_Missions_and_Technology)
- **lunar-polar-traverse** builds per-cell horizon profiles from the LOLA 20 m DEM, sweeps them against the SPICE sun vector and converts the result to lit/dark intervals over a 720 h horizon. — [GitHub](https://github.com/amoeinn/lunar-polar-traverse)
- **2026 papers**: hourly solar visibility on a 5 m DEM over 1.3 km × 1.3 km (DIC3D-A*, from a secondary summary); 1 h steps at 20 m (Chang'E-7 deep-learning paper). — [MDPI 18(2):310](https://www.mdpi.com/2072-4292/18/2/310); [doi:10.3390/rs18172950](https://doi.org/10.3390/rs18172950)
- **Deep learning to identify continuously illuminated regions** at the south pole (2025; title only). — [SciEngine JDSE 2025](https://www.sciengine.com/JDSE/doi/10.3724/j.issn.2096-9287.2025.20250044)
- **LOLA-based illumination studies** at the south pole are the standard basis for these maps. — [Illumination conditions at the lunar south pole using high-resolution LOLA DTMs (ResearchGate)](https://www.researchgate.net/publication/266398170_Illumination_conditions_at_the_lunar_south_pole_using_high_resolution_Digital_Terrain_Models_from_LOLA)
- **Measured costs** [this session]: horizon table 3.1 s (32 azimuths) to 9.5 s (64 azimuths) for a 300² corridor, single thread; 2.9–5.8 MB when quantised to Uint8. Sun test over 336 hourly steps: 0.37 s. Lit/dark results bit-packed into Uint32 per cell cover 32 slices in 4 bytes per cell (see Q4).

### Inferences
Recommended browser pipeline:
1. Run a static A* on 240 m or 20 m data to get a first route.
2. Define a corridor of about ±1–1.5 km around it.
3. In Web Workers, compute a local horizon (20 m data, 32–64 azimuths, ~10–20 km reach) per corridor cell. Combine it with `max()` against the site's precomputed 720-azimuth far-field horizon.
4. Compute sun and Earth azimuth/elevation once per time step (shared by all cells, since the corridor is small). Optionally add a fractional solar-disc test, which the app already has for points.
5. Produce Uint32 bitsets per cell per 32 slices, or interval lists.
6. Run the time-dependent search.
7. Re-verify the chosen route with the app's existing high-fidelity per-point horizon at its waypoints (see Q6).

Notes on this pipeline:
- **Earth visibility time step.** Earth's position in the lunar sky changes only through libration (roughly ±7–8° over about a month; general knowledge), so the same horizon table serves Earth visibility with coarser time steps. Earth-visibility bitsets can come from the existing comms code applied to the horizon table.
- **Time-step choice.** At polar latitudes the sun's azimuth moves about 15° per 24 h (360° per ~29.5-day synodic month; general knowledge), so a 1–2 h step moves the sun about 0.6–1.2° per step. That is finer than 64-azimuth horizon sampling (5.6° per azimuth step). Matching 2 h steps with 64–128 azimuths is a consistent choice, and it matches VIPER's 2 h cadence.

### Gaps
- No primary source was found describing a sweep-line or "horizon-scan" O(N²·A) algorithm, which would replace per-ray marching, in a lunar planner. General-knowledge methods exist in the terrain-analysis literature but were not searched this session.
- Accuracy trade-offs (azimuth count vs illumination error at 20 m) were not quantified by any source found.

---

## Q6. How are planned routes validated (Yutu-2, Pragyan, Lunokhod, field tests)?

### Takeaway
Validation in the literature has three forms:
1. Operational practice: Yutu-2's ground route selection using 2 cm stereo DEMs at each waypoint, then the onboard local planner.
2. Field tests of planning software (Otten/CMU) and simulation, including Monte Carlo fault injection (Lamarre) and replanning in simulation (Tompkins).
3. Independent replay checkers (lunar-polar-traverse).

No source was found that compares predicted 20 m-scale routes against actual Yutu-2, Pragyan or Lunokhod tracks.

### Cited Findings
- **Yutu-2 teleoperation.** Route selection is done on the ground; onboard autonomy handles local planning and emergency avoidance. — [space-robotics.org: Yutu-2](https://space-robotics.org/robots/lunar/yutu-2/). Images were sent to Earth roughly every 7 m, and localization was not run onboard. — [EUCASS: AI in Planetary Exploration](https://www.eucass.eu/component/docindexer/?task=download&id=7190)
- **Chang'e-4 local DEMs.** Local DEMs and DOMs at about 0.02 m resolution from Navcam stereo at each waypoint fed slope computation, hazard identification and waypoint-to-waypoint planning. — [Landing site topographic mapping and rover localization for Chang'e-4 (ResearchGate)](https://www.researchgate.net/publication/339949124_Landing_site_topographic_mapping_and_rover_localization_for_Chang'e-4_mission). Slope, aspect and obstacle maps from the DEM feed path planning. — [SCIENCE CHINA Information Sciences 2020, 63:140901](http://scis.scichina.com/en/2020/140901.pdf)
- **Yutu-2 two-year farside study.** Reports mild slip and skid, consistent with mostly flat terrain at large scale and gentle local slopes. — [Science Robotics abj6660](https://www.science.org/doi/10.1126/scirobotics.abj6660)
- **Otten/CMU field test** of lunar polar route-planning software. — [ResearchGate 322103818](https://www.researchgate.net/publication/322103818_Field_Test_of_Route_Planning_Software_for_Lunar_Polar_Missions_Future_Missions_and_Technology)
- **Tompkins 2004**: simulated execution with local sensing and replanning. — [CMU](https://www.ri.cmu.edu/pub_files/pub4/tompkins_paul_2004_3/tompkins_paul_2004_3.pdf)
- **Lamarre 2024**: Monte Carlo evaluation against a CCDP baseline with random faults. — [STARS](https://papers.starslab.ca/safe-mission-level-planning/)
- **lunar-polar-traverse**: an independent C++ replay checker judges every plan against snapshot and mean-map baselines. — [GitHub](https://github.com/amoeinn/lunar-polar-traverse)
- **Validation resources (2024–2026)**:
  - POLAR Traverse dataset of stereo images simulating polar traverses under extreme lighting. — [arXiv 2403.12194](https://arxiv.org/pdf/2403.12194)
  - MARE, an open-source lunar rover simulator with shadow ground truth (Oct 2026, title only). — [arXiv 2610.28465](https://arxiv.org/pdf/2610.28465)
  - Lunar rover cargo-transport mission concept and field test (2026, title only). — [arXiv 2601.03371](https://arxiv.org/pdf/2601.03371)

### Inferences
Validation steps the app can afford:
1. **Replay check.** Re-evaluate the chosen route by stepping along it in time with the high-fidelity per-point horizon (720 azimuths) and the existing ephemeris. Report any disagreement with the planner's coarse bitsets (e.g., "planner thought lit, replay says dark for 1.3 h").
2. **Compare against baselines**, as lunar-polar-traverse does: shortest path, static-mean-illumination path and time-aware path, and show the differences in hours of darkness and Earth loss.
3. **Regression tests** on synthetic terrains with known optimal answers (A* cost equals Dijkstra cost; a time-dependent result equals the static result when everything is always lit).

A historical check against Lunokhod or Yutu-2 tracks would test only the slope-cost component, since those sites are not polar. The tracks are visible in LROC NAC imagery (general knowledge), and digitising them would be a separate project.

### Gaps
- No sources were found on route validation for Pragyan (Chandrayaan-3) or Lunokhod 1/2 in the searches run.
- No quantitative comparison was found between planned and actual traverse (path deviation, slope error) for any lunar rover.

---

## Q7 (synthesis). Which algorithm should a client-side JavaScript implementation use, and how should it be built?

### Takeaway
Recommended design, in three tiers:
1. **Default.** Static A* (8- or 16-connected) on a 20 m padded bounding box, with a slope hard-cap plus energy-like slope and climb cost. Runs in about 10–70 ms.
2. **"Time-aware" mode.** A time-dependent earliest-arrival Dijkstra with waiting, with sunlight and Earth as hard or soft constraints from per-cell bitsets at 1–2 h slices. Search takes about 15–40 ms; horizon precompute takes about 1–3 s in Web Workers.
3. **Optional "exact soft-penalty" mode.** A time-expanded search limited to about 250²–300² cells × 24–32 slices: 0.4–1.2 s and 50–250 MB.

Finish with any-angle smoothing and a replay validation pass using the existing high-fidelity horizon code.

### Cited Findings
- Grid Dijkstra/A* with time-indexed lighting maps is the established approach in mission-level planners (TEMPEST, Otten, DIC3D-A*) and in GIS (`r.walk`). — [Tompkins 2002](https://publications.ri.cmu.edu/storage/publications/pub_files/pub3/tompkins_paul_2002_1/tompkins_paul_2002_1.pdf); [Otten ICRA 2015](https://www.ri.cmu.edu/app/uploads/2018/01/ICRA2015_Otten_3109.pdf); [DIC3D-A*](https://www.mdpi.com/2072-4292/18/2/310); [GRASS r.walk](https://grass.osgeo.org/grass85/manuals/r.walk.html)
- VIPER-style operations rely on 2 h illumination and DSN maps, safe havens and timing drives around moving shadows. — [LPSC 2023 #2377](https://www.hou.usra.edu/meetings/lpsc2023/pdf/2377.pdf); [VIPER mission-planning overview](https://www.nasa.gov/wp-content/uploads/2022/05/overview_of_mission_planning_for_the_viper_rover.pdf?emrc=cc2934)
- A web-based polar traverse-planning and constraint-checking tool has been presented (LPSC 2024), so a browser planner is a recognised format. — [LPSC 2024 #2579](https://www.hou.usra.edu/meetings/lpsc2024/pdf/2579.pdf)
- Performance figures are in Q4 [measured, this session].

### Inferences
Implementation checklist for vanilla JS:
1. **Data.** Load 20 m LOLA tiles covering a box around start and goal: the segment's bounding box plus 2–3 km margin, capped at about 1000² cells. Fall back to 240 m for longer spans or a coarse first pass.
2. **Cost.**
   - Edge slope from the elevation difference over the edge length; cap at a user maximum slope.
   - Cost = drive-time × (1 + w_s·(s/s_max)²) + w_up·Δh⁺.
   - Optionally add a terrain-roughness term from 20 m curvature, labelled as weak at this resolution.
   - Use 16-neighbour moves (as `r.walk -k` does) or post-smooth to avoid 45° artifacts.
3. **Search engine.**
   - One generic A* over typed arrays: Float32Array/Float64Array g, Int32Array parent, an indexed binary heap with decrease-key, and lazy edge costs.
   - Run it in a module Web Worker; return the path as a transferable Float64Array.
   - About 150 lines of code; no library is needed. The existing JS grid libraries are game-oriented, with unweighted or uniform grids.
4. **Time dimension.**
   - Per-cell Uint32 bitmasks for sun and Earth (32 slices; use two words for 64 slices).
   - Choose the slice length from route duration, distance / effective speed; for example 6 km at 3–5 cm/s is about 33–55 h, so use 2 h slices.
   - Earliest-arrival Dijkstra with "wait only in lit or Earth-visible cells" gives an exact, fast answer to "can the rover get there without entering shadow, and when?".
   - For soft trade-offs (accepting some shadow to save distance), use the time-expanded search on the reduced corridor, or a Pareto-lite approach: run 3–5 weight presets and show the alternatives side by side.
5. **Illumination precompute.**
   - Corridor-limited per-cell horizons, 32–64 azimuths, ~10–20 km local reach, combined with `max()` against the site's existing far-field horizon.
   - Split across Workers; cache per site and DEM version in IndexedDB.
   - The cost is about 3–10 s single-threaded for 90k cells [measured].
6. **Validation.**
   - Replay the final route with the existing 720-azimuth `computeHorizon` at waypoints every ~100–200 m and at the planned times.
   - Report max slope, total climb, hours dark, hours without Earth and longest dark interval vs a battery-survival threshold.
   - Flag mismatches with the coarse planner.
7. **Honesty in the UI.** Label results "strategic route on 20 m LOLA; not hazard-cleared at rover scale (rocks < 20 m invisible)". Yutu-2 and VIPER-class operations rely on about 1 m to 2 cm maps for tactical paths.
8. **Algorithms to skip:**
   - RRT* (non-deterministic, poor on raster costs);
   - fast marching (isotropic, no uphill/downhill difference);
   - D* Lite (re-planning gain irrelevant when a full re-plan takes about 50 ms);
   - full Field D* (more complex than A* plus smoothing, for small gain at strategic scale).

### Gaps
- The benchmarks used synthetic terrain and synthetic shadow masks. Real LOLA tiles, especially polar terrain with large blocked or dark regions, may change expansions by a constant factor, and should be re-benchmarked in-app on real tiles and on a mid-range phone.
- No published guidance was found on how many azimuths or what local reach are sufficient for 20 m route-scale illumination at the south pole. This should be calibrated against the app's existing high-fidelity point horizons (e.g., compare lit fraction at 50 random corridor cells).
