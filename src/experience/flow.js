// Professional mode as a guided mission flow: a left rail with five steps
// (Site → Date → Check → What if → Report). Each step shows only the controls
// it needs; the 3D Moon stays in the centre. Existing panels are moved into the
// steps (moving DOM nodes keeps their event listeners).

import { verdicts } from './walk.js';
import { findNextWindow, windowStats } from '../core/planning.js';
import { SYNODIC_MONTH_DAYS } from '../core/constants.js';
import { fmtLatLon, fmtHours } from '../ui/format.js';
import { play } from './sound.js';
import { createCalendar } from './calendar.js';
import { icon } from './icons.js';

const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (f) => `${Math.round(f * 100)}%`;
const when = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const LIGHT = { green: ['GO', '✓'], amber: ['GO WITH CARE', '!'], red: ['NO GO', '✕'] };

const STEPS = [
  { key: 'site', title: 'Site', lead: 'Where do you want to land? Search, filter by mission, type coordinates, or click the Moon.' },
  { key: 'date', title: 'Date', lead: 'When do you touch down? A lunar day lasts about a month, so the date matters as much as the place. Times are UTC.' },
  { key: 'check', title: 'Check', lead: 'What the lander gets from touchdown: sunlight for power and Earth in view for radio.' },
  { key: 'whatif', title: 'What if', lead: 'Plans change. See what a small move, a day’s delay or a launch slip does.' },
  { key: 'report', title: 'Report', lead: 'Your scenario on one page, ready to share or print.' },
];

export function mountFlow({ app, setTime, switchMode, getBestSpots, actions }) {
  const rail = document.getElementById('paneSite');
  if (!rail) return { refresh() {}, go() {} };
  rail.classList.add('xp-flow');

  const original = [...rail.children];
  rail.innerHTML = `
    <div class="f-top">
      <div class="f-title"><b>Mission flow</b><small>Five steps from a site to a report</small></div>
      <ol class="f-steps">${STEPS.map((s, i) => `
        <li><button type="button" data-go="${i}"><span class="f-num">${i + 1}</span><span class="f-txt"><b>${s.title}</b><small data-sub="${s.key}"></small></span></button></li>`).join('')}
      </ol>
    </div>
    <div class="f-body">${STEPS.map((s, i) => `<section class="f-step" data-step="${i}" hidden><p class="f-lead">${s.lead}</p><div class="f-slot"></div></section>`).join('')}</div>
    <div class="f-nav"><button type="button" class="f-back">${icon('chevronLeft', 16)} Back</button><button type="button" class="f-next">Next</button></div>`;
  const slot = (i) => rail.querySelector(`.f-step[data-step="${i}"] .f-slot`);

  // 1 · Site: the original site picker, plus a shortcut to the best spots.
  original.forEach((el) => slot(0).appendChild(el));
  const bestBox = document.createElement('div');
  bestBox.className = 'f-best';
  slot(0).prepend(bestBox);

  // 2 · Date
  slot(1).innerHTML = `
    <div class="f-date"><small>Touchdown (start of the window)</small><b data-date></b><span data-local></span></div>
    <div class="f-card f-calcard"><b>Pick a day</b><small class="f-sub">Colours are for this site, landing at the same time of day.</small><div data-cal></div></div>
    <div class="f-card">
      <b>Not sure? Let the planner find one.</b>
      <div class="f-row f-find"><button type="button" class="f-primary" data-find>Find the next good date</button>
      <label>Sun + Earth for <select data-min><option>1</option><option selected>3</option><option>7</option><option>14</option></select> days</label></div>
      <p class="f-note" data-find-out aria-live="polite"></p>
    </div>
    <details class="f-more"><summary>Exact time and quick jumps</summary>
    <label class="f-field">Date and time (UTC)<input type="datetime-local" data-dt step="60"/></label>
    <div class="f-pills" data-quick style="margin-top:10px">
      <button type="button" data-slip="0">Mission date</button>
      <button type="button" data-slip="1">+1 month</button>
      <button type="button" data-slip="3">+3 months</button>
      <button type="button" data-slip="6">+6 months</button>
    </div></details>
    <label class="f-field">How far ahead to look
      <span class="f-pills" data-win><button type="button" data-w="15">15 days</button><button type="button" data-w="30">1 lunar day</button><button type="button" data-w="90">3 months</button><button type="button" data-w="365">1 year</button></span>
    </label>`;
  const s2 = slot(1);
  const cal = createCalendar({
    getSite: () => app.site,
    getConfig: () => app.config,
    getSelectedMs: () => app.windowStartMs,
    onPick: (ms) => { setTime(ms, true); play('tick'); },
  });
  s2.querySelector('[data-cal]').appendChild(cal.el);
  s2.querySelector('[data-dt]').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const ms = Date.parse(`${e.target.value}:00Z`);
    if (Number.isFinite(ms)) setTime(ms, true);
  });
  // "Mission date" is the first date the flow saw (the shared link's date, or the default).
  let missionDate = null;
  s2.querySelectorAll('[data-slip]').forEach((b) => b.addEventListener('click', () => {
    const k = Number(b.dataset.slip);
    setTime(Math.round((missionDate ?? app.windowStartMs) + k * SYNODIC_MONTH_DAYS * DAY), true);
  }));
  s2.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => {
    document.querySelector(`.win-btn[data-win="${b.dataset.w}"]`)?.click();
    refresh();
  }));
  s2.querySelector('[data-find]').addEventListener('click', () => {
    const minDays = Number(s2.querySelector('[data-min]').value);
    const out = s2.querySelector('[data-find-out]');
    const res = findNextWindow(app.site, app.timeMs, app.config, { minDays });
    if (!res) { out.textContent = `No time in the next 12 months has the Sun and Earth up together for ${minDays} days here. Try another site in step 1.`; return; }
    const lasts = ((res.endMs - res.ms) / DAY).toFixed(1);
    if (res.ms - app.timeMs < 2 * 3600000) { out.textContent = `Good news: this date already works. The Sun and Earth stay up together for ${lasts} days.`; play('go'); return; }
    setTime(res.ms, true);
    cal.show(res.ms);
    out.textContent = `Found: ${when(res.ms)}. The Sun and Earth stay up together for ${lasts} days.`;
    play('go');
  });

  // 3 · Check: verdict at touchdown + the full assessment panel.
  slot(2).innerHTML = '<div class="f-verdict" data-verdict></div><details class="f-more" open><summary>Full assessment</summary><div data-assess></div></details>';
  const assess = document.getElementById('assessmentRoot');
  if (assess) slot(2).querySelector('[data-assess]').appendChild(assess);

  // 4 · What if: the nudge card + comparison shortcuts.
  const planCard = document.querySelector('.xp-plan');
  if (planCard) slot(3).appendChild(planCard);
  const cmp = document.createElement('div');
  cmp.className = 'f-card';
  cmp.innerHTML = `<b>Compare side by side</b>
    <div class="f-row f-wrap"><button type="button" data-cmp="slip">Launch slips: +1, +2, +3 months</button>
    <button type="button" data-cmp="best">This site vs the best spots</button>
    <button type="button" data-cmp="open">Open the comparison table</button></div>`;
  slot(3).appendChild(cmp);
  cmp.querySelector('[data-cmp="slip"]').addEventListener('click', () => actions.slipCompare());
  cmp.querySelector('[data-cmp="best"]').addEventListener('click', () => actions.compareBest());
  cmp.querySelector('[data-cmp="open"]').addEventListener('click', () => switchMode('compare'));

  // 5 · Report
  slot(4).innerHTML = '<div class="f-report" data-report></div><div class="f-row f-wrap"><button type="button" class="f-primary" data-r="print">Print / save as PDF</button><button type="button" data-r="link">Copy link</button><button type="button" data-r="terrain">Terrain 3D ↗</button><button type="button" data-r="lumi">Ask Lumi</button></div>';
  const s5 = slot(4);
  s5.querySelector('[data-r="print"]').addEventListener('click', () => printReport());
  s5.querySelector('[data-r="link"]').addEventListener('click', () => actions.copyLink());
  s5.querySelector('[data-r="terrain"]').addEventListener('click', () => actions.terrain());
  s5.querySelector('[data-r="lumi"]').addEventListener('click', () => actions.lumi());

  // ---- Navigation ----
  let current = 0;
  const visited = new Set([0]);
  rail.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
  rail.querySelector('.f-back').addEventListener('click', () => go(current - 1));
  rail.querySelector('.f-next').addEventListener('click', () => go(current + 1));

  function go(i, { quiet = false } = {}) {
    if (i < 0 || i >= STEPS.length) return;
    current = i;
    visited.add(i);
    rail.querySelectorAll('.f-step').forEach((s) => { s.hidden = Number(s.dataset.step) !== i; });
    rail.querySelectorAll('[data-go]').forEach((b) => {
      const k = Number(b.dataset.go);
      b.classList.toggle('is-on', k === i);
      b.classList.toggle('is-done', visited.has(k) && k !== i);
      b.setAttribute('aria-current', k === i ? 'step' : 'false');
    });
    rail.querySelector('.f-back').style.visibility = i === 0 ? 'hidden' : 'visible';
    const next = rail.querySelector('.f-next');
    next.innerHTML = i === STEPS.length - 1 ? 'Start again' : `Next: ${STEPS[i + 1].title} ${icon('chevronRight', 16)}`;
    next.onclick = i === STEPS.length - 1 ? () => { visited.clear(); go(0); } : null;
    rail.querySelector('.f-body').scrollTop = 0;
    keys.best = keys.date = keys.verdict = '';
    refresh(true);
    if (!quiet) play('tick');
  }

  // ---- Live content ----
  let vCache = { scan: null, v: null };
  function verdictNow() {
    if (!app.scan) return null;
    if (vCache.scan !== app.scan) {
      let v = null;
      try { v = verdicts(app.scan); } catch { v = null; }
      vCache = { scan: app.scan, v };
    }
    return vCache.v;
  }
  const keys = { best: '', date: '', verdict: '' };
  function renderBest() {
    const spots = getBestSpots();
    const k = spots.map((sp) => `${sp.r.site.id}:${sp.r.ops}`).join('|') || 'none';
    if (k === keys.best) return;
    keys.best = k;
    bestBox.innerHTML = spots.length
      ? `<small>Shortcut: best spots for the next 30 days</small><div class="f-row f-wrap">${spots.map((sp, k) => `<button type="button" data-best="${k}"><i style="background:${sp.color}"></i>${esc(sp.title)}: ${esc(sp.r.site.short || sp.r.site.name)} · ${pct(sp.r.ops)}</button>`).join('')}</div>`
      : '<small>Finding the best spots…</small>';
    bestBox.querySelectorAll('[data-best]').forEach((b) => b.addEventListener('click', () => actions.selectSite(getBestSpots()[Number(b.dataset.best)].r.site)));
  }
  function renderDate() {
    const k = `${app.windowStartMs}|${app.windowDays}`;
    if (k === keys.date) return;
    keys.date = k;
    s2.querySelector('[data-date]').textContent = when(app.windowStartMs);
    s2.querySelector('[data-local]').textContent = `Your local time: ${new Date(app.windowStartMs).toLocaleString()}`;
    const dt = s2.querySelector('[data-dt]');
    if (document.activeElement !== dt) dt.value = new Date(app.windowStartMs).toISOString().slice(0, 16);
    s2.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.w) === app.windowDays));
  }
  function renderVerdict() {
    if (keys.verdict === app.scan) return;
    keys.verdict = app.scan;
    const v = verdictNow();
    const el = slot(2).querySelector('[data-verdict]');
    if (!v) { el.innerHTML = ''; return; }
    const s = app.scan.stats;
    const line = (key, label, text) => `<div class="f-v ${v[key]}"><span class="f-light">${LIGHT[v[key]][1]}</span><div><b>${label}: ${LIGHT[v[key]][0]}</b><small>${text}</small></div></div>`;
    const sunTxt = v.power === 'red' ? `The Sun is down at touchdown${v.nextSunrise ? `; it rises ${day(v.nextSunrise)}` : ''}.` : v.sunSet ? `Sunset ${day(v.sunSet)}.` : 'The Sun stays up for this whole window.';
    const earthTxt = v.earth === 'red' ? (s.earthCentreFraction === 0 ? 'Earth never rises here: a relay satellite would be needed.' : `Earth is hidden at touchdown${v.nextEarthrise ? `; it returns ${day(v.nextEarthrise)}` : ''}.`) : v.earthSet ? `Earthset ${day(v.earthSet)}.` : 'Earth stays in view for this whole window.';
    el.innerHTML = `<div class="f-overall ${v.overall}">${LIGHT[v.overall][0]}<small>at touchdown, ${when(app.windowStartMs)}</small></div>
      ${line('power', 'Power', `${sunTxt} Sunlight ${pct(s.litFraction)} of the window, longest night ${fmtHours(s.longestDarkH)}.`)}
      ${line('earth', 'Earth contact', `${earthTxt} Earth in view ${pct(s.earthCentreFraction)}, direct link ${pct(s.dteFraction)}.`)}
      <p class="f-note">Traffic lights use our own rules of thumb, not a NASA standard.</p>`;
  }
  function reportHtml() {
    const v = verdictNow();
    const s = app.scan?.stats;
    if (!v || !s) return '<p>Calculating…</p>';
    const ws = windowStats(app.site, app.windowStartMs, app.config);
    const range = document.querySelector('.xp-plan .p-range')?.textContent || '';
    const spots = getBestSpots().map((sp) => `<li>${esc(sp.title)}: ${esc(sp.r.site.name)} (${pct(sp.r.ops)} with Sun and Earth together)</li>`).join('');
    return `<h3>${esc(app.site.name)}</h3>
      <p class="f-meta">${fmtLatLon(app.site.lat, app.site.lon)} · touchdown ${when(app.windowStartMs)} · ${app.windowDays}-day window</p>
      <p class="f-rv"><span class="${v.overall}">${LIGHT[v.overall][0]}</span> Power ${LIGHT[v.power][0]} · Earth ${LIGHT[v.earth][0]}</p>
      <table class="f-table">
        <tr><td>Sunlight</td><td>${pct(s.litFraction)}</td></tr>
        <tr><td>Earth in view (centre above terrain)</td><td>${pct(s.earthCentreFraction)}</td></tr>
        <tr><td>Sun and Earth together (next 30 days)</td><td>${pct(ws.both)}</td></tr>
        <tr><td>Direct-to-Earth link</td><td>${pct(s.dteFraction)}</td></tr>
        <tr><td>Longest night</td><td>${fmtHours(s.longestDarkH)}${s.longestDarkOpenEnded ? '+' : ''}</td></tr>
        <tr><td>Average solar power</td><td>${Math.round(s.avgPowerW)} W</td></tr>
        <tr><td>Battery needed</td><td>${s.batteryKWh.toFixed(1)} kWh${s.batteryOpenEnded ? '+' : ''}</td></tr>
      </table>
      ${range ? `<p class="f-note">${esc(range)} (how much the answer changes within one terrain cell).</p>` : ''}
      ${spots ? `<p class="f-meta">Best spots for the same window:</p><ul>${spots}</ul>` : ''}
      <p class="f-note">Lunar Site Planner · NASA LOLA terrain · ephemeris checked against NASA JPL Horizons · verdicts use our own rules of thumb.</p>`;
  }
  function printReport() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Lunar landing report · ${esc(app.site.name)}</title>
      <style>body{font:15px/1.5 -apple-system,Inter,Segoe UI,sans-serif;color:#1d1d1f;max-width:720px;margin:32px auto;padding:0 16px}
      h3{font-size:26px;margin:0 0 4px}.f-meta{color:#555}.f-note{color:#666;font-size:13px}.f-rv span{font-weight:700;padding:2px 10px;border-radius:999px;background:#eee;margin-right:6px}
      .green{background:#d8f5df!important}.amber{background:#fff1bf!important}.red{background:#ffd9d6!important}
      table{border-collapse:collapse;width:100%;margin:12px 0}td{border-bottom:1px solid #ddd;padding:7px 4px}td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}</style>
      </head><body>${reportHtml()}<p class="f-note">Generated ${new Date().toUTCString()}</p><script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }

  function refresh(force = false) {
    if (!app.site) return;
    if (missionDate === null && app.scan) missionDate = app.windowStartMs;
    const sub = (k, t) => { const el = rail.querySelector(`[data-sub="${k}"]`); if (el) el.textContent = t; };
    const v = verdictNow();
    sub('site', app.site.short || app.site.name);
    sub('date', day(app.windowStartMs));
    sub('check', v ? `${LIGHT[v.overall][0]} at touchdown` : '');
    sub('whatif', 'Nudge, slip, compare');
    sub('report', 'Share or print');
    if (current === 0) renderBest();
    if (current === 1) { renderDate(); cal.refresh(); }
    if (current === 2) renderVerdict();
    if (current === 4) {
      const k = `${app.site.lat},${app.site.lon}|${app.windowStartMs}|${app.windowDays}|${JSON.stringify(app.config)}|${getBestSpots().length}`;
      if (force || k !== reportKey) { reportKey = k; slot(4).querySelector('[data-report]').innerHTML = reportHtml(); }
    }
  }
  let reportKey = '';

  go(0, { quiet: true });
  return { refresh, go, print: () => printReport(), renderBest: () => { if (current === 0) renderBest(); } };
}
