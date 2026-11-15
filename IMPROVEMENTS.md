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

## 4. Reach

| # | Improvement | Reference | Status |
|---|---|---|---|
| 4.1 | Whole-Moon map layers (average sunlight, Earth in view, slope) | Darksight | ⏳ |
| 4.2 | Ask Lumi: a chat panel that understands typed requests (go to a site or coordinates, best date, best spot, compare, move N km, shift days, sunset/Earthset, status, explain a term, theme, tour) and answers from the engine, never by guessing. Runs offline, no AI service or key | Bean Drift (AI assistant), PolarWindow (grounded AI) | ✅ |
| 4.3 | Public read-only API for site/date queries | Bean Drift (REST + MCP) | ⏳ |
