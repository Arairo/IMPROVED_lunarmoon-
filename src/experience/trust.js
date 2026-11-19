// "Accuracy, data and sources": how we know the numbers are right, what data
// they come from, and where the limits are. The flown-mission checks are
// computed live in the browser; the JPL Horizons scoreboard is the last run of
// the "Validate against JPL Horizons" workflow (public/data/validation.json).

import { apolloChecks, flownEventChecks } from '../core/flownChecks.js';
import { precomputedHorizons } from '../core/horizon.js';
import { planFlight, FLOWN_FLIGHTS, ROUTES } from '../core/flight.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const day = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

const SOURCES = [
  ['NASA LRO LOLA polar elevation (240 m and 1 km grids)', 'Built from LOLA laser altimetry via USGS Astrogeology ARD; the skyline around every south-polar site.', 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm', 'Public domain (NASA)'],
  ['NASA LRO LOLA global elevation map LDEM_16', '~1.9 km per pixel; the skyline at every other site (Apollo, Chandrayaan-3, Chang’e, SLIM, Blue Ghost) and for custom points.', 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm', 'Public domain (NASA)'],
  ['NASA GSFC PGDA: LOLA 20 m south-pole terrain (LDEM_80S_20MPP_ADJ, Barker et al. 2023)', '16 km × 16 km tiles around the main south-polar sites, checked against our 240 m grid before use.', 'https://pgda.gsfc.nasa.gov/products/90', 'Public domain (NASA)'],
  ['NASA GSFC PGDA: Lunar polar illumination (Mazarico et al.)', 'Average Sun and Earth visibility maps, used only as an independent check of our own maps.', 'https://pgda.gsfc.nasa.gov/products/69', 'Public domain (NASA)'],
  ['NASA LRO LROC WAC global mosaic', 'The Moon imagery on the 3D globe and the polar map.', 'https://www.lroc.asu.edu/', 'Public domain (NASA/GSFC/ASU)'],
  ['NASA Blue Marble', 'Earth imagery.', 'https://visibleearth.nasa.gov/collection/1484/blue-marble', 'Public domain (NASA)'],
  ['NASA Deep Space Network station locations', 'Goldstone, Madrid and Canberra, for the direct-to-Earth link check.', 'https://www.nasa.gov/communicating-with-missions/dsn/', 'Public domain (NASA)'],
  ['Sun and Earth positions: astronomy-engine + IAU lunar rotation model', 'The ephemeris inside the app (runs offline in the browser).', 'https://github.com/cosinekitty/astronomy', 'MIT licence'],
  ['NASA JPL Horizons', 'The independent reference we check the engine against (not used to make the numbers).', 'https://ssd.jpl.nasa.gov/horizons/', 'NASA/JPL'],
  ['Landing-site positions', 'NSSDCA, LROC landing-site imagery, and the mission teams (ISRO, JAXA, CNSA, Intuitive Machines, Firefly).', 'https://nssdc.gsfc.nasa.gov/', 'Public sources'],
  ['Software', 'three.js (MIT), CesiumJS (Apache-2.0), Vite (MIT), Tailwind CSS (MIT); narration voice by Kokoro TTS (Apache-2.0).', 'https://github.com/Arairo/IMPROVED_lunarmoon-', 'Open-source licences'],
];

export async function openTrust({ sites }) {
  const box = document.createElement('div');
  box.className = 'xp-video xp-about xp-trust';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Accuracy, data and sources');
  const apollo = apolloChecks(sites);
  const events = flownEventChecks(sites);
  const worstApollo = Math.max(...apollo.map((a) => Math.abs(a.diffDeg)));
  const terrainRows = sites.map((s) => ({ s, h: precomputedHorizons[s.id] })).filter((x) => x.h);
  const realTerrain = terrainRows.filter((x) => x.h.terrain).length;
  let val = null;
  try { const r = await fetch(`${import.meta.env.BASE_URL}data/validation.json`); if (r.ok) val = await r.json(); } catch {}
  const worstEl = val ? Math.max(...val.rows.map((r) => r.dEl)) : null;
  let pg = null;
  try { const r = await fetch(`${import.meta.env.BASE_URL}data/pgda_check.json`); if (r.ok) pg = await r.json(); } catch {}
  let lr = null;
  try { const r = await fetch(`${import.meta.env.BASE_URL}data/lroc_check.json`); if (r.ok) lr = await r.json(); } catch {}
  const pct = (v) => (v == null ? '–' : `${Math.round(v)}%`);

  box.innerHTML = `<div class="v-card a-card">
      <div class="v-head"><b>Accuracy, data and sources</b><button type="button" class="xp-chip xp-icon-btn" data-v="close" aria-label="Close">${icon('x', 16)}</button></div>
      <div class="a-body">
        <div class="t-stats">
          <div><b>${val ? `${val.rows.length}` : '48'}</b><span>checks against NASA JPL Horizons${worstEl != null ? `, worst ${worstEl.toFixed(3)}°` : ''}</span></div>
          <div><b>${apollo.length}</b><span>Apollo landings: Sun height within ${worstApollo.toFixed(2)}° of the mission reports</span></div>
          <div><b>${events.length}</b><span>modern landers: sunset on the day the team reported</span></div>
          <div><b>${realTerrain}/${terrainRows.length}</b><span>sites with a real NASA LOLA terrain skyline</span></div>
        </div>
        <section><h3>Checked against what flew</h3>
          <table class="a-table"><tr><th>Landing</th><th>Sun height at touchdown: reported</th><th>Ours</th><th>Difference</th></tr>
            ${apollo.map((a) => `<tr><td>${esc(a.name)}<br><small>${day(Date.parse(a.utc))} UTC</small></td><td>${a.reportedDeg.toFixed(1)}°</td><td>${a.oursDeg.toFixed(2)}°</td><td>${a.diffDeg >= 0 ? '+' : '−'}${Math.abs(a.diffDeg).toFixed(2)}°</td></tr>`).join('')}
          </table>
          <table class="a-table"><tr><th>Lander</th><th>What the team reported</th><th>Our sunset</th></tr>
            ${events.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.note)}</td><td>${e.oursMs ? `${day(e.oursMs)} UTC` : '–'}</td></tr>`).join('')}
          </table>
          <p class="a-dim">Apollo figures: Sun elevation above a level horizon at touchdown, from the mission reports. Apollo 16 is left out because its landing came 5 h 42 min late and published figures differ on which time they mean. These checks also run as automated tests on every update.</p></section>
        ${(() => {
          const T = Date.parse('1969-07-20T20:17Z'), loi = Date.parse('1969-07-19T17:22Z'), tli = Date.parse('1969-07-16T16:22Z');
          const a = planFlight(T, { route: 'direct', coastDays: (loi - tli) / 864e5, lunarOrbitDays: (T - loi) / 864e5, parkingAltKm: 191, alignLaunch: false });
          const dv = Object.fromEntries(a.burns.map((b) => [b.id, b.dv]));
          const row = (n, ours, flown) => `<tr><td>${n}</td><td>${flown.toFixed(2)} km/s</td><td>${ours.toFixed(2)} km/s</td></tr>`;
          return `<section><h3>Flight model vs what flew</h3>
          <table class="a-table"><tr><th>Apollo 11 burn</th><th>Flown</th><th>Our model</th></tr>
            ${row('Leave Earth orbit (TLI)', dv.tli, 3.18)}${row('Brake into lunar orbit', dv.loi, 0.94)}${row('Descent to the surface', dv.doi + dv.pdi, 2.06)}</table>
          <table class="a-table"><tr><th>Mission</th><th>Route</th><th>Launch to landing: flown</th><th>Our typical route</th></tr>
            ${FLOWN_FLIGHTS.map((f) => { const T2 = Date.parse(f.touchdown); const p = planFlight(T2, { route: f.route }); return `<tr><td>${esc(f.name)}</td><td>${esc(ROUTES[f.route].label)}</td><td>${((T2 - Date.parse(f.launch)) / 864e5).toFixed(1)} days</td><td>${p.doorToDoorDays.toFixed(1)} days</td></tr>`; }).join('')}</table>
          <p class="a-dim">The Flight view is a two-body (“patched conics”) planning model: good to hours and tens of m/s, not navigation. Typical phase lengths follow how these missions flew; real missions tune them to their rocket, orbit and landing site.</p></section>`;
        })()}
        <section><h3>Sun and Earth positions vs NASA JPL Horizons</h3>
          ${val ? `<p>${val.rows.length} comparisons (${new Set(val.rows.map((r) => r.site)).size} sites × 3 dates × Sun and Earth), run ${new Date(val.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}: worst elevation difference <b>${worstEl.toFixed(4)}°</b>, median <b>${val.medianEl.toFixed(4)}°</b>. The Sun’s disk is 0.53° wide, so that is under 1% of it.</p>
          <details><summary>Show all ${val.rows.length}</summary><div class="t-scroll"><table class="a-table"><tr><th>Site</th><th>UTC</th><th>Body</th><th>Horizons el</th><th>Ours el</th><th>Δ</th></tr>
            ${val.rows.map((r) => `<tr><td>${esc(r.site)}</td><td>${esc(r.utc.slice(0, 16))}</td><td>${r.body}</td><td>${r.refEl.toFixed(4)}°</td><td>${r.el.toFixed(4)}°</td><td>${r.dEl.toFixed(4)}°</td></tr>`).join('')}</table></div></details>`
          : '<p>Run the “Validate against JPL Horizons” workflow in the GitHub Actions tab to publish the full scoreboard here. Three of the comparisons also run as automated tests on every update.</p>'}</section>
        ${pg ? `<section><h3>Checked against NASA Goddard’s illumination maps</h3>
          <p>NASA’s Planetary Geodesy Data Archive publishes lighting maps of the south pole. We compare our own maps with them, cell by cell, out to 75°S:
          ${['sun', 'earth'].filter((k) => pg.maps?.[k]).map((k) => `${k === 'sun' ? 'sunlight' : 'Earth in view'} agrees with a correlation of <b>${pg.maps[k].r.toFixed(2)}</b> (1.00 = identical pattern), average difference ${pg.maps[k].meanAbsDiff.toFixed(0)} points`).join('; ')}.</p>
          <div class="t-scroll"><table class="a-table"><tr><th>Site</th><th>Sunlight: ours (240 m)</th><th>Ours (20 m)</th><th>NASA PGDA</th><th>Earth: ours</th><th>NASA PGDA</th></tr>
            ${pg.sites.map((r) => `<tr><td>${esc(r.name)}</td><td>${pct(r.ours240?.sun)}</td><td>${pct(r.ours20?.sun)}</td><td>${pct(r.pgdaSun120)}</td><td>${pct((r.ours20 || r.ours240)?.earth)}</td><td>${pct(r.pgdaEarth120)}</td></tr>`).join('')}</table></div>
          <p class="a-dim">${esc(pg.note)} Rerun with the “Add 20 m terrain and check against NASA PGDA” workflow.</p></section>` : ''}
        ${lr ? `<section><h3>Checked against a real photo: LROC shadows</h3>
          <p>LROC’s narrow-angle camera photographed the ${esc(lr.region)} on ${new Date(lr.imageTimes[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} (${lr.images.length} image pairs, ${lr.imageTimes[0].slice(11, 16)}–${lr.imageTimes[lr.imageTimes.length - 1].slice(11, 16)} UTC). We predicted which ground would be lit at those moments and compared it with the photo, ${lr.gridM} m cell by cell over a ${lr.areaKm} km square:
          with our 20 m terrain the prediction matches the photo in <b>${lr.with20m.agreement}%</b> of cells (Cohen’s κ ${lr.with20m.kappa.toFixed(2)}; 1 = perfect, 0 = chance); with the 240 m grid alone, ${lr.with240m.agreement}% (κ ${lr.with240m.kappa.toFixed(2)}).</p>
          <img class="t-photo" src="${import.meta.env.BASE_URL}data/lroc_check.png" alt="Left: the LROC mosaic. Right: yellow lit in both, navy shadow in both, red we said lit but the photo is dark, light blue we said shadow but the photo is lit, grey skipped." loading="lazy">
          <p class="a-dim">Left: the photo. Right: yellow = lit in both, navy = shadow in both, red = we said lit but it is dark, light blue = we said shadow but it is lit, grey = skipped. ${esc(lr.method)} Source: ${esc(lr.citation)}</p></section>` : ''}
        <section><h3>Terrain behind each site’s skyline</h3>
          <div class="t-scroll"><table class="a-table"><tr><th>Site</th><th>Terrain</th><th>Ground height</th></tr>
            ${terrainRows.map(({ s, h }) => `<tr><td>${esc(s.name)}</td><td>${esc(h.source)}</td><td>${h.groundHeight} m</td></tr>`).join('')}</table></div></section>
        <section><h3>Data and software</h3><ul class="t-src">${SOURCES.map(([t, d, url, lic]) => `<li><a href="${url}" target="_blank" rel="noopener">${esc(t)}</a><span>${esc(d)}</span><small>${esc(lic)}</small></li>`).join('')}</ul></section>
        <section><h3>Honest limits</h3><p>The full error budget and every check are written up in <a href="https://github.com/Arairo/IMPROVED_lunarmoon-/blob/main/docs/VALIDATION.md" target="_blank" rel="noopener">docs/VALIDATION.md</a>.</p><ul>
          <li>Terrain detail: 20 m around the main south-polar sites and the Artemis III region centres${pg ? '' : ' (once the PGDA workflow has run)'}, 240 m near the south pole, 1 km a little further out, about 1.9 km elsewhere. Boulders, small craters and the exact lander footprint are smaller than that, so use the “Check the landing area” tool and high-resolution images before committing.</li>
          <li>The ground slope is an average over about half a kilometre, not the slope under the lander’s legs.</li>
          <li>Earth’s and the Sun’s full disks are modelled for sunlight; Earth contact uses Earth’s centre above the terrain.</li>
          <li>GO / GO WITH CARE / NO GO use our own rules of thumb, not a NASA standard.</li>
          <li>Power and radio figures depend on the spacecraft assumptions (Settings → Spacecraft assumptions).</li>
        </ul></section>
      </div>
    </div>`;
  document.body.appendChild(box);
  const close = () => { box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-v="close"]')) close(); });
  setTimeout(() => box.querySelector('[data-v="close"]')?.focus(), 50);
}
