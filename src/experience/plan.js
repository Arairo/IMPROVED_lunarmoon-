// "What if?" card for Professional mode: nudge the site a few kilometres,
// shift the date a day, or find the next good landing window, with a plain
// sentence saying what changed, an Undo, and an honest ±250 m range.

import { nudgeSite, windowStats, describeChange, findNextWindow, positionRange } from '../core/planning.js';
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
    <p class="p-out" aria-live="polite"></p>
    <div class="p-foot"><button type="button" class="p-undo" data-undo hidden>Undo</button><span class="p-range" title="How much the next 30 days change within one terrain cell (about 250 m) of this point"></span></div>`;
  host.prepend(card);

  const out = card.querySelector('.p-out');
  const undoBtn = card.querySelector('[data-undo]');
  const rangeEl = card.querySelector('.p-range');
  const history = [];

  const snapshot = () => ({ site: app.site, windowStartMs: app.windowStartMs, timeMs: app.timeMs });
  const stats = () => windowStats(app.site, app.windowStartMs, app.config);
  const say = (text) => { out.textContent = text; out.classList.remove('is-new'); void out.offsetWidth; out.classList.add('is-new'); };
  const remember = () => { history.push(snapshot()); undoBtn.hidden = false; };

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
  }));

  card.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.day);
    const before = stats();
    remember();
    setTime(app.windowStartMs + d * DAY, true);
    say(describeChange(d > 0 ? 'One day later' : 'One day earlier', before, stats()));
  }));

  card.querySelector('[data-find]').addEventListener('click', () => {
    const minDays = Number(card.querySelector('[data-min]').value);
    const res = findNextWindow(app.site, app.timeMs, app.config, { minDays });
    if (!res) {
      say(`No landing time in the next 12 months has the Sun and Earth up together for ${minDays} day${minDays > 1 ? 's' : ''} here. Try another site or a shorter stay.`);
      return;
    }
    const lasts = ((res.endMs - res.ms) / DAY).toFixed(1);
    if (res.ms - app.timeMs < 2 * 3600000) {
      say(`Good news: right now already works. The Sun and Earth stay up together for ${lasts} days.`);
      return;
    }
    remember();
    setTime(res.ms, true);
    say(`Next good landing: ${fmtWhen(res.ms)}. The Sun and Earth stay up together for ${lasts} days.`);
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
    showToast('Back to the previous site and date');
  });

  // ±250 m range: recomputed (off the main path) when the site, window or settings change.
  let key = '', timer = 0;
  function refresh() {
    if (!app.site) return;
    const k = `${app.site.lat},${app.site.lon}|${app.windowStartMs}|${JSON.stringify(app.config)}`;
    if (k === key) return;
    key = k;
    clearTimeout(timer);
    rangeEl.textContent = 'Checking ±250 m…';
    timer = setTimeout(() => {
      try {
        const r = positionRange(app.site, app.windowStartMs, app.config);
        rangeEl.textContent = `Within ±250 m: sunlight ${span(r.sun)}, Earth ${span(r.earth)}`;
      } catch {
        rangeEl.textContent = '';
      }
    }, 400);
  }
  return { refresh };
}
