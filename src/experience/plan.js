// "What if?" card for Professional mode: nudge the site a few kilometres,
// shift the date a day, or find the next good landing window, with a plain
// sentence saying what changed, an Undo, and an honest ±250 m range.

import { nudgeSite, windowStats, describeChange, findNextWindow, positionRange, landingDispersionAsync, robustAimAsync } from '../core/planning.js';
import { destination } from '../core/geo.js';
import { showToast } from '../ui/modals.js';

const DAY = 86400000;
const fmtWhen = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const pct = (f) => `${Math.round(f * 100)}%`;
const span = ([a, b]) => (Math.round(a * 100) === Math.round(b * 100) ? pct(a) : `${pct(a)}–${pct(b)}`);

export function mountPlanCard({ app, selectSite, setTime, getGlobe }) {
  const host = document.getElementById('paneResults');
  if (!host) return { refresh() {} };
  const card = document.createElement('section');
  card.className = 'xp-plan';
  card.setAttribute('aria-label', 'What if: nudge the site or the date');
  card.innerHTML = `
    <div class="p-head"><b>What if?</b><span>Small changes can decide a landing</span></div>
    <div class="p-row"><span class="p-lbl">Move</span>
      <div class="p-btns" role="group" aria-label="Move the site">
        <button type="button" data-dir="N" aria-label="Move north">N</button>
        <button type="button" data-dir="S" aria-label="Move south">S</button>
        <button type="button" data-dir="E" aria-label="Move east">E</button>
        <button type="button" data-dir="W" aria-label="Move west">W</button>
      </div>
      <label class="p-km"><select data-km aria-label="Distance">
        <option value="0.25">0.25</option><option value="0.5">0.5</option><option value="1" selected>1</option>
        <option value="2">2</option><option value="5">5</option><option value="10">10</option>
      </select> km</label>
    </div>
    <div class="p-row"><span class="p-lbl">Date</span>
      <div class="p-btns" role="group" aria-label="Shift the landing date">
        <button type="button" data-day="-1">−1 day</button>
        <button type="button" data-day="1">+1 day</button>
      </div>
    </div>
    <div class="p-row"><span class="p-lbl">Find</span>
      <button type="button" class="p-find" data-find>Next good date</button>
      <label class="p-km">Sun + Earth for <select data-min aria-label="Minimum days with both Sun and Earth up">
        <option value="1">1</option><option value="3" selected>3</option><option value="7">7</option><option value="14">14</option>
      </select> d</label>
    </div>
    <div class="p-row"><span class="p-lbl">Land</span>
      <label class="p-km">within <select data-rad aria-label="How far from the aim point the lander might touch down">
        <option value="100">100 m</option><option value="250">250 m</option><option value="500" selected>500 m</option><option value="1000">1 km</option><option value="2000">2 km</option>
      </select></label>
      <button type="button" class="p-find" data-disp>Check the landing area</button>
    </div>
    <div class="p-disp" data-disp-out hidden aria-live="polite"></div>
    <p class="p-out" aria-live="polite"></p>
    <div class="p-foot"><button type="button" class="p-undo" data-undo hidden>Undo</button><span class="p-range" title="Positional sensitivity: the same 30 days at this point and 250 m north, south, east and west (about one 240 m terrain cell). It shows how much the exact landing point matters; it is not an error bar and does not include terrain or model uncertainty."></span></div>`;
  host.prepend(card);

  const out = card.querySelector('.p-out');
  const undoBtn = card.querySelector('[data-undo]');
  const rangeEl = card.querySelector('.p-range');
  const history = [];

  const snapshot = () => ({ site: app.site, windowStartMs: app.windowStartMs, timeMs: app.timeMs });
  const stats = () => windowStats(app.site, app.windowStartMs, app.config);
  const say = (text) => { out.textContent = text; out.classList.remove('is-new'); void out.offsetWidth; out.classList.add('is-new'); };
  const remember = () => { history.push(snapshot()); undoBtn.hidden = false; };
  // What the card itself last set; if the site or date changes elsewhere, the
  // sentence and Undo no longer apply, so they are cleared.
  let mine = null;
  const markMine = () => { mine = { site: app.site, start: app.windowStartMs }; };

  card.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => {
    const km = Number(card.querySelector('[data-km]').value);
    const before = stats();
    const from = app.site;
    remember();
    const moved = nudgeSite(from, b.dataset.dir, km);
    getGlobe()?.setGhost?.(from.lat, from.lon);
    selectSite(moved, false);
    const word = { N: 'north', S: 'south', E: 'east', W: 'west' }[b.dataset.dir];
    say(describeChange(`Moved ${km} km ${word}`, before, stats()));
    markMine();
  }));

  card.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.day);
    const before = stats();
    remember();
    setTime(app.windowStartMs + d * DAY, true);
    say(describeChange(d > 0 ? 'One day later' : 'One day earlier', before, stats()));
    markMine();
  }));

  card.querySelector('[data-find]').addEventListener('click', () => {
    const minDays = Number(card.querySelector('[data-min]').value);
    const res = findNextWindow(app.site, app.windowStartMs, app.config, { minDays });
    if (!res) {
      say(`No landing time in the next 12 months has the Sun and Earth up together for ${minDays} day${minDays > 1 ? 's' : ''} here. ${minDays >= 7 ? 'The Sun and Earth are rarely up together for more than about two weeks: a lunar day lasts about 29.5 Earth days, so the Sun is up for roughly half of it (longer only on the best polar ridges). ' : ''}Try another site or a shorter stay.`);
      return;
    }
    const lasts = ((res.endMs - res.ms) / DAY).toFixed(1);
    if (res.ms - app.windowStartMs < 2 * 3600000) {
      say(`Good news: right now already works. The Sun and Earth stay up together for ${lasts} days.`);
      return;
    }
    remember();
    setTime(res.ms, true);
    say(`Next good landing: ${fmtWhen(res.ms)}. The Sun and Earth stay up together for ${lasts} days.`);
    markMine();
  });

  // Landing dispersion: landers don't touch down exactly on target (IM-1 ended
  // up about 1.5 km away), so plan for the whole area, and suggest a safer aim.
  const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const dirWord = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];
  const distWord = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${Math.round(m / 10) * 10} m`);
  const dispOut = card.querySelector('[data-disp-out]');
  let dispKey = '';
  card.querySelector('[data-disp]').addEventListener('click', () => {
    const radiusM = Number(card.querySelector('[data-rad]').value);
    const site = app.site, start = app.windowStartMs;
    dispKey = `${site.lat},${site.lon}|${start}|${radiusM}`;
    const myKey = dispKey;
    dispOut.hidden = false;
    dispOut.innerHTML = `<span class="w-spinner" style="width:12px;height:12px;border-width:2px"></span> Checking 25 touchdown points within ${distWord(radiusM)}…`;
    const stale = () => myKey !== dispKey;
    // Sliced so the page stays responsive; a newer request cancels this one.
    (async () => {
      const d = await landingDispersionAsync(site, start, app.config, { radiusM, n: 25 }, { isCancelled: stale });
      if (!d || stale()) return;
      app.lastDispersion = { ...d, siteId: site.id, start };
      const range = Math.round(d.min * 100) === Math.round(d.max * 100) ? pct(d.min) : `${pct(d.min)}–${pct(d.max)}`;
      const worstTxt = d.worst.dist > 0 ? ` The weakest spot is ${distWord(d.worst.dist)} ${dirWord(d.worst.az)} of the aim.` : '';
      dispOut.innerHTML = `<b>If the lander touches down anywhere within ${distWord(radiusM)}:</b> power and radio together ${range} of the next 30 days (worst case ${pct(d.min)}, typical ${pct(d.p50)}).${worstTxt}<span data-aim> <span class="w-spinner" style="width:10px;height:10px;border-width:2px"></span> Looking for a safer place to aim…</span>`;
      {
        const r = await robustAimAsync(site, start, app.config, { radiusM, n: 13 }, { isCancelled: stale });
        if (!r || stale()) return;
        const aimEl = dispOut.querySelector('[data-aim]');
        const gain = Math.round(r.dispersion.p10 * 100) - Math.round(d.p10 * 100);
        if (r.aim.dist === 0 || gain < 2) { aimEl.textContent = ' Aiming here is already the safest choice nearby.'; return; }
        aimEl.innerHTML = ` <br><b>Safer aim:</b> ${distWord(r.aim.dist)} ${dirWord(r.aim.az)} keeps at least ${pct(r.dispersion.p10)} even after a bad landing (${pct(d.p10)} aiming here). <button type="button" class="p-aim">Aim there</button>`;
        aimEl.querySelector('.p-aim').addEventListener('click', () => {
          const before = stats();
          remember();
          const p = destination(site.lat, site.lon, r.aim.az, r.aim.dist);
          const moved = { ...nudgeSite(site, 'N', 0.001), lat: p.lat, lon: p.lon, id: `custom-${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, name: `${site.baseName || site.short || site.name}, safer aim`, short: `${site.baseName || site.short || site.name} · safer aim` };
          getGlobe()?.setGhost?.(site.lat, site.lon);
          selectSite(moved, false);
          say(describeChange(`Moved the aim ${distWord(r.aim.dist)} ${dirWord(r.aim.az)}`, before, stats()));
          markMine();
          dispOut.hidden = true;
        });
      }
    })();
  });

  undoBtn.addEventListener('click', () => {
    const prev = history.pop();
    if (!prev) return;
    app.windowStartMs = prev.windowStartMs;
    app.timeMs = prev.timeMs;
    selectSite(prev.site, false);
    getGlobe()?.setGhost?.(null);
    undoBtn.hidden = history.length === 0;
    say('Undone.');
    markMine();
    showToast('Back to the previous site and date');
  });

  // ±250 m range: recomputed (off the main path) when the site, window or settings change.
  let key = '', timer = 0;
  function refresh() {
    if (!app.site) return;
    if (dispKey && dispKey !== `${app.site.lat},${app.site.lon}|${app.windowStartMs}|${card.querySelector('[data-rad]').value}`) { dispKey = ''; dispOut.hidden = true; }
    if (mine && (mine.site !== app.site || mine.start !== app.windowStartMs)) {
      mine = null;
      history.length = 0;
      undoBtn.hidden = true;
      out.textContent = '';
      getGlobe()?.setGhost?.(null);
    }
    const k = `${app.site.lat},${app.site.lon}|${app.windowStartMs}|${JSON.stringify(app.config)}`;
    if (k === key) return;
    key = k;
    clearTimeout(timer);
    rangeEl.textContent = 'Checking 250 m around…';
    timer = setTimeout(() => {
      try {
        const r = positionRange(app.site, app.windowStartMs, app.config);
        rangeEl.textContent = `Landing up to 250 m away: sunlight ${span(r.sun)}, Earth ${span(r.earth)}`;
        app.lastRange = { key: k, metres: 250, days: 30, sun: r.sun, earth: r.earth };
        window.dispatchEvent(new Event('lsp-range')); // the report quotes this line
      } catch {
        rangeEl.textContent = '';
      }
    }, 400);
  }
  window.addEventListener('lsp-terrain', () => { key = ''; refresh(); });
  return { refresh };
}
