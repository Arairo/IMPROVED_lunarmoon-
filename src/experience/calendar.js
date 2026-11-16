// Landing calendar: a month view where each day is coloured by how good a
// touchdown at the chosen site would be that day (green: Sun and Earth up
// together for 3+ days; amber: Sun up but Earth hidden or together for less;
// red: Sun down, no power). Click a day to pick it.

import { landingCalendar } from '../core/planning.js';
import { icon } from './icons.js';

const DAY = 86400000;
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtRun = (h) => (h >= 14 * 24 ? '14+ days' : h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.round(h)} h`);

export function describeDay(d) {
  if (d.rating === 'red') return 'Sun down at touchdown: no solar power';
  if (!d.earth) return 'Sun up, but Earth hidden: no direct radio link';
  return d.rating === 'green' ? `Sun and Earth up together for ${fmtRun(d.bothH)}` : `Sun and Earth together for only ${fmtRun(d.bothH)}`;
}

/**
 * opts: { getSite, getConfig, getSelectedMs, onPick(ms), compact }
 * Returns { el, refresh(force) }.
 */
export function createCalendar({ getSite, getConfig, getSelectedMs, onPick, compact = false }) {
  const el = document.createElement('div');
  el.className = `xp-cal${compact ? ' is-compact' : ''}`;
  el.innerHTML = `
    <div class="c-head">
      <button type="button" class="c-nav" data-m="-1" aria-label="Previous month">${icon('chevronLeft', 16)}</button>
      <b class="c-title" aria-live="polite"></b>
      <button type="button" class="c-nav" data-m="1" aria-label="Next month">${icon('chevronRight', 16)}</button>
    </div>
    <div class="c-week">${WEEK.map((w) => `<span>${w.slice(0, compact ? 1 : 3)}</span>`).join('')}</div>
    <div class="c-grid" role="grid"></div>
    <div class="c-legend"><span><i class="green"></i>Best</span><span><i class="amber"></i>Power only</span><span><i class="red"></i>No sunlight</span></div>
    <p class="c-tip" aria-live="polite"></p>`;
  const grid = el.querySelector('.c-grid');
  const tip = el.querySelector('.c-tip');
  let month = null; // UTC ms of the 1st of the shown month
  let key = '';
  let lastSel = null;

  const firstOfMonth = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
  const addMonths = (ms, k) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1); };

  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    month = addMonths(month ?? firstOfMonth(getSelectedMs()), Number(b.dataset.m));
    refresh(true);
  }));

  function refresh(force = false) {
    const site = getSite();
    if (!site) return;
    const sel = getSelectedMs();
    // Follow the touchdown date when it changes from elsewhere (Find, slips, Lumi).
    const selDayNow = Math.floor(sel / DAY);
    if (month === null || (selDayNow !== lastSel && firstOfMonth(sel) !== month)) month = firstOfMonth(sel);
    lastSel = selDayNow;
    const hourUtc = new Date(sel).getUTCHours() + new Date(sel).getUTCMinutes() / 60;
    const k = `${site.lat},${site.lon}|${month}|${hourUtc}|${JSON.stringify(getConfig())}|${Math.floor(sel / DAY)}`;
    if (!force && k === key) return;
    key = k;
    el.querySelector('.c-title').textContent = MONTH.format(month);
    const lead = (new Date(month).getUTCDay() + 6) % 7; // Monday-first
    const daysIn = new Date(addMonths(month, 1) - DAY).getUTCDate();
    let cal = [];
    try { cal = landingCalendar(site, month, daysIn, getConfig(), { hourUtc }); } catch { cal = []; }
    const selDay = Math.floor(sel / DAY);
    const today = Math.floor(Date.now() / DAY);
    let html = '<span class="c-pad"></span>'.repeat(lead);
    cal.forEach((d, i) => {
      const dn = Math.floor(d.dayMs / DAY);
      const bar = Math.min(1, d.bothH / (14 * 24));
      html += `<button type="button" class="c-day ${d.rating}${dn === selDay ? ' is-sel' : ''}${dn === today ? ' is-today' : ''}" data-i="${i}" role="gridcell"
        aria-label="${LONG.format(d.dayMs)}: ${describeDay(d)}" title="${LONG.format(d.dayMs)} · ${describeDay(d)}">
        <span class="c-n">${i + 1}</span><span class="c-bar"><span style="width:${Math.round(bar * 100)}%"></span></span></button>`;
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.c-day').forEach((b) => {
      const d = cal[Number(b.dataset.i)];
      b.addEventListener('mouseenter', () => { tip.textContent = `${LONG.format(d.dayMs)}: ${describeDay(d)}`; });
      b.addEventListener('focus', () => { tip.textContent = `${LONG.format(d.dayMs)}: ${describeDay(d)}`; });
      b.addEventListener('click', () => { onPick(d.ms); tip.textContent = `Picked ${LONG.format(d.dayMs)}: ${describeDay(d)}`; });
    });
    const sd = cal.find((d) => Math.floor(d.dayMs / DAY) === selDay);
    if (!tip.textContent || force) tip.textContent = sd ? `${LONG.format(sd.dayMs)}: ${describeDay(sd)}` : 'Hover a day to see why it has that colour.';
  }
  /** Jump the view to the month that contains `ms`. */
  function show(ms) { month = firstOfMonth(ms); refresh(true); }
  return { el, refresh, show };
}
