# Improvement roadmap

Lunar Site Planner after NASA Space Apps 2026. The submitted version stays frozen in
`Arairo/NASA_lunarmoon-`; this repository is where it keeps getting better.

Each item names the competitor that does it well (from our review of the Kuala Lumpur
field and 100+ public repos for the same challenge), so we know what "good" looks like.

Status: ✅ done · 🔨 in progress · ⏳ planned

## 1. The brief's "small changes matter" story

| # | Improvement | Reference | Status |
|---|---|---|---|
| 1.1 | **Nudge the site** 0.1–10 km north / south / east / west, or ±1 day, with the old spot left as a grey ghost and a plain sentence saying what changed (sunlight, Earth time, longest night), plus Undo | Darksight's "nudge" | ✅ |
| 1.2 | **Find a date**: search up to 12 months ahead for the first landing time with the Sun and Earth both up for at least N days | Darksight "Find a date", Penumbra "30-date landing window" | ✅ |
| 1.3 | **Landing-window calendar**: a 12-month strip showing, for each possible landing day, how many days of power and Earth contact follow | Penumbra, our own 7 Nov plan | ⏳ |
| 1.4 | Compare up to 3 pinned scenarios with the best value in each row highlighted | Darksight | ⏳ |

## 2. Accuracy and validity

| # | Improvement | Reference | Status |
|---|---|---|---|
| 2.1 | **Uncertainty ranges**: show how sunlight and Earth time change within ±250 m (one terrain cell), so ridge-top numbers read as ranges, not false precision | PolarWindow (± margins), Penumbra | ✅ |
| 2.2 | **JPL Horizons checks in the test suite** (our three published cases), so every build proves the ephemeris | Penumbra V1 scoreboard | ✅ |
| 2.3 | **Validation script** that queries JPL Horizons for 20+ site/time pairs and writes a scoreboard (run locally or in GitHub Actions, where Horizons is reachable) | Penumbra V1 (0.00011°) | ✅ script · ⏳ published results |
| 2.4 | **20 m LOLA terrain near the site** (LDEM_80S_20M from NASA PGDA), 240 m beyond: sharper ridges and crater rims | Penumbra, PolarWindow, Lunar Mission Navigator (80 m) | ⏳ needs the data download |
| 2.5 | Compare our long-term sunlight map against NASA PGDA's 18.6-year average-visibility map and publish the error | Penumbra V2, Lunar Horizon Wheel | ⏳ |
| 2.6 | Replay real landings (IM-1, IM-2, Blue Ghost 1) and show the predicted sunset vs what happened | Penumbra IM-2 replay, PolarWindow | ⏳ |
| 2.7 | Slope at the landing point from the terrain grid | Darksight, Penumbra | ⏳ |
| 2.8 | Use the DE440 lunar orientation (MOON_PA) instead of the IAU rotation model for sub-arcsecond libration | LunarSafe AI notes, PolarWindow | ⏳ |

## 3. Experience and design

| # | Improvement | Reference | Status |
|---|---|---|---|
| 3.1 | Phone: Pro header no longer clipped; Beginner skyline step no longer overflows | QA report M2, M3 | ✅ |
| 3.2 | Keyboard: Esc closes Spacecraft and Glossary dialogs; the tour keeps focus inside its bubble | QA report M4 | ✅ |
| 3.3 | Spacecraft dialog refills from the real settings when reopened; 0 is no longer silently replaced | QA report L2 | ✅ |
| 3.4 | Beginner date step updates "your local time" when you pick another date | QA report L3 | ✅ |
| 3.5 | Compare ignores duplicates only when the settings match too | QA report L5 | ✅ |
| 3.6 | Tour and legend wording match the current controls | QA report L6, L7 | ✅ |
| 3.7 | First-person "stand here" view with a 360° look-around in 3D | Bean Drift | ⏳ |
| 3.8 | Named lunar features (IAU gazetteer) around the site | Bean Drift | ⏳ |
| 3.9 | One-page mission brief to print or save as PDF (step 5 of the mission flow) | Darksight, Lunar Mission Navigator | ✅ |
| 3.10 | Merge the Cesium Terrain 3D view into the main app as a tab instead of a separate page | UX audit | ⏳ |
| 3.11 | Cesium header layout and overlapping labels | QA report M6 | ⏳ |
| 3.12 | Bilingual interface (English / Bahasa Melayu) | Bean Drift (English / Chinese) | ⏳ |
| 3.13 | Professional mode as a guided five-step mission flow (Site → Date → Check → What if → Report) in a left rail, with the 3D Moon kept in the centre; phones get Steps / Moon / Check tabs | Darksight, Penumbra (step-by-step flows) | ✅ |
| 3.14 | Landing calendar: each day coloured for the chosen site (green = Sun and Earth together for 3+ days, amber = power only, red = no sunlight), in Pro step 2 and in Beginner | User request | ✅ |
| 3.15 | Welcome chooser on first entry to Pro: tutorial video, guided tour or skip | User request | ✅ |
| 3.16 | Top bar reorganised: Ask Lumi stands out; Help menu (video, tour, controls); Settings menu (theme, sound, notes, spacecraft, Beginner); Terrain 3D moved to the view tabs | Design-system guidance (global actions right, preferences under Settings) | ✅ |
| 3.17 | One line-icon set instead of emoji; layered soft shadows; Lumi with a contact shadow; rounded timeline bars with a smooth power curve and hover read-outs | UX audit | ✅ |
| 3.18 | Intro: lunar sunrise (starfield and Milky Way, daylight sweeping across the Moon, gold flare, Earth rising) instead of rainbow ribbons | User request | ✅ |
| 3.19 | Compare Lab rebuilt: winner banner, ranked scenario cards with big deltas against a chosen baseline, a bar chart per measure, a day-by-day strip view, quick-start presets, “add any site”, and its own guided tour | User request | ✅ |
| 3.20 | QA pass (independent agent, 17 confirmed bugs fixed): phone Moon tab, tour placement after scrolling and on phones, Find searching from the touchdown date, scenario window restored from Compare, Compare shortcuts, baseline guide state, unique scenario colours, What-if reset after outside changes, keyboard focus in menus/Lumi/choosers, Report window lengths, ±250 m line, and many Lumi phrasings | QA report | ✅ |
| 3.21 | Compare, question first: “Two places”, “Launch dates” (one chart of every launch day for a year) or “My plan vs the best spot”; head-to-head result with a one-sentence verdict, reasons, only the measures that differ, full details folded away; an “Add this plan to compare” tray in the planner | Apple model compare, Versus.com, Google Flights date graph, shop compare trays | ✅ |
| 3.22 | Same status words everywhere (GO / GO WITH CARE / NO GO), labelled “Now” or “at touchdown”; Terrain 3D opens with your window; long-stay searches explain the ~2-week limit | QA polish | ✅ |
| 3.23 | Real NASA LOLA terrain at every site (LDEM_16 global map, ~1.9 km) instead of a smooth Moon for 16 of 29 sites; built by a one-click GitHub workflow | Darksight (global LOLA), Lunar Horizon Wheel | ✅ |
| 3.24 | Nudges, custom pins and the ±250 m range use the real 240 m polar grid (they used a 5 km grid before) | QA / Darksight nudge | ✅ |
| 3.25 | Landing area check: touchdown spread within 100 m–2 km (worst / typical / best) and a safer aim point | Penumbra (robust aim), PolarWindow (landing dispersion) | ✅ |
| 3.26 | Ground slope at the site (over ~0.5 km) in Check and the report | Darksight, PolarWindow | ✅ |
| 3.27 | Checked against what flew: Sun height at five Apollo landings (within 0.35°) and sunsets at Blue Ghost, Chandrayaan-3 and SLIM, as automated tests and an in-app panel; JPL Horizons scoreboard (48 checks, worst 0.005°) published in the app | PolarWindow (flown validation), Penumbra (scoreboard) | ✅ |
| 3.29 | NASA LOLA 20 m terrain (PGDA) around the 12 main south-polar sites, checked against the 240 m grid (2–4 m average difference) and used for skylines, nudges and the landing-area check | Competitive gap: terrain resolution | ✅ |
| 3.30 | Our lighting maps checked against NASA Goddard PGDA illumination maps: correlation 0.92 (Sun) and 0.975 (Earth); ridge 66 % vs NASA 68 % | Competitive gap: independent validation | ✅ |
| 3.31 | 3D Moon tumbles freely over the poles (no stop at ±88°); touch drags no longer scroll the page; every tour step has an End tour button | User testing | ✅ |
| 3.28 | “Accuracy, data and sources” panel and JSON decision-summary export | Darksight (307 sources), Penumbra (provenance, JSON export) | ✅ |

## 4. Reach

| # | Improvement | Reference | Status |
|---|---|---|---|
| 4.1 | Whole-Moon map layers on the 3D Moon: sunlight and Earth in view for 2027 (real terrain skylines), never-sunlit polar areas, height and slope, with a live readout | Darksight | ✅ |
| 4.4 | Map layers by time: Now (follows the timeline and Play), Your 30 days, Year 2027; Sun + Earth together layer | User request | ✅ |
| 4.5 | Flight view: launch-to-landing planning model with three routes (Direct, Phasing loops, Low-energy), side-by-side comparison, dated timeline, every burn and the fuel, touchdown lighting/radio checks and a 3D animation; checked against Apollo 11's burns and five flown timelines; in the Date step, the Report, the JSON export and Ask Lumi | User request | ✅ |
| 4.2 | Ask Lumi: a chat panel that understands typed requests (go to a site or coordinates, best date, best spot, compare, move N km, shift days, sunset/Earthset, status, explain a term, theme, tour, flow steps, print the report, copy the link), small talk (hello, thanks, who are you, jokes, fun facts) and ~30 explained topics, answered from the engine, never by guessing. Runs offline, no AI service or key | Bean Drift (AI assistant), PolarWindow (grounded AI) | ✅ |
| 4.3 | Public read-only API for site/date queries | Bean Drift (REST + MCP) | ⏳ |
