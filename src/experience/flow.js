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
import { scanToCsv } from '../core/exportCsv.js';
import { addScenario } from '../ui/compare.js';
import { groundSlope } from '../core/horizon.js';
import { epochStatus } from '../core/ephemeris.js';
import { matchScenario, PANEL_MODES, POWER_SCENARIOS } from '../core/power.js';
import { RADIO_PRESETS } from '../core/comms.js';
import { terrainWarning, epochWarning } from '../ui/assessment.js';
import { planFlight, ROUTES } from '../core/flight.js';
import { linkAssumptions } from '../core/comms.js';
import { BUILD, loadManifest, datasetProvenance } from '../core/buildInfo.js';

const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (f) => `${Math.round(f * 100)}%`;
const when = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const LIGHT = { green: ['GO', '✓'], amber: ['GO WITH CARE', '!'], red: ['NO GO', '✕'] };
// What each screening result means (second audit 8.3): a first look, not a decision.
const SCREEN_MEANING = {
  green: 'Favourable under these assumptions: power and Earth contact both look good at touchdown.',
  amber: 'Possible, but limited: one of power or Earth contact is weak or short at touchdown. Further analysis needed.',
  red: 'Not favourable in this scenario: no sunlight or no Earth contact at touchdown.',
};

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
    <div class="f-tray"><button type="button" class="f-tray-add" data-tray-add>${icon('plus', 15)} Add this plan to compare</button><button type="button" class="f-tray-go" data-tray-go hidden></button></div>
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
    <button type="button" class="f-flightlink" data-flight>${icon('rocket', 16)}<span><b>How do we get there?</b><small>Plan the flight: launch date, route, fuel</small></span>${icon('external', 13)}</button>
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
      <button type="button" data-slip="1">+1 lunar month</button>
      <button type="button" data-slip="3">+3 lunar months</button>
      <button type="button" data-slip="6">+6 lunar months</button>
    </div></details>
    <label class="f-field">How far ahead to look
      <span class="f-pills" data-win><button type="button" data-w="15">15 days</button><button type="button" data-w="30">1 lunar day</button><button type="button" data-w="90">3 months</button><button type="button" data-w="365">1 year</button></span>
    </label>`;
  const s2 = slot(1);
  s2.querySelector('[data-flight]')?.addEventListener('click', () => actions.flight?.());
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
    const res = findNextWindow(app.site, app.windowStartMs, app.config, { minDays });
    if (!res) { out.textContent = `No time in the next 12 months has the Sun and Earth up together for ${minDays} days here. ${minDays >= 7 ? 'The Sun and Earth are rarely up together for more than about two weeks: a lunar day lasts about 29.5 Earth days, so the Sun is up for roughly half of it (longer only on the best polar ridges). Try a shorter stay or another site.' : 'Try another site in step 1.'}`; return; }
    const lasts = ((res.endMs - res.ms) / DAY).toFixed(1);
    if (res.ms - app.windowStartMs < 2 * 3600000) { out.textContent = `Good news: this date already works. The Sun and Earth stay up together for ${lasts} days.`; play('go'); return; }
    setTime(res.ms, true);
    cal.show(res.ms);
    out.textContent = `Found: ${when(res.ms)}. The Sun and Earth stay up together for ${lasts} days.`;
    play('go');
  });

  // 3 · Check: verdict at touchdown + the full assessment panel.
  slot(2).innerHTML = '<div class="f-verdict" data-verdict aria-live="polite"></div><button type="button" class="f-flightlink" data-terrain>' + icon('mountain', 16) + '<span><b>See it up close</b><small>This site and date on 3D terrain with real shadows</small></span>' + icon('external', 13) + '</button><details class="f-more" open><summary>Full assessment</summary><div data-assess></div></details>';
  const assess = document.getElementById('assessmentRoot');
  if (assess) slot(2).querySelector('[data-assess]').appendChild(assess);
  slot(2).querySelector('[data-terrain]').addEventListener('click', () => actions.terrain());
  slot(2).addEventListener('click', (e) => { if (e.target.closest('[data-assume]')) document.getElementById('settingsOpenBtn')?.click(); });

  // 4 · What if: the nudge card + comparison shortcuts.
  const planCard = document.querySelector('.xp-plan');
  if (planCard) slot(3).appendChild(planCard);
  const cmp = document.createElement('div');
  cmp.className = 'f-card';
  cmp.innerHTML = `<b>Compare side by side</b>
    <div class="f-row f-wrap"><button type="button" data-cmp="slip">${icon('calendar', 14)} Compare launch dates</button>
    <button type="button" data-cmp="best">${icon('trophy', 14)} My plan vs the best spot</button>
    <button type="button" data-cmp="open">${icon('scale', 14)} Open Compare</button></div>`;
  slot(3).appendChild(cmp);
  cmp.querySelector('[data-cmp="slip"]').addEventListener('click', () => actions.slipCompare());
  cmp.querySelector('[data-cmp="best"]').addEventListener('click', () => actions.compareBest());
  cmp.querySelector('[data-cmp="open"]').addEventListener('click', () => switchMode('compare'));

  // Compare tray: collect plans while you work, like a shop's compare basket.
  const trayAdd = rail.querySelector('[data-tray-add]');
  const trayGo = rail.querySelector('[data-tray-go]');
  const trayLabel = () => `${(app.site.short || app.site.name).replace(/ \(.*\)$/, '')} · ${day(app.windowStartMs)}`;
  const inTray = () => app.scenarios.some((s) => s.site.lat === app.site.lat && s.site.lon === app.site.lon && s.startMs === app.windowStartMs && s.windowDays === app.windowDays);
  function renderTray() {
    const n = app.scenarios.length;
    const here = inTray();
    trayAdd.innerHTML = here ? `${icon('check', 15)} This plan is in Compare` : `${icon('plus', 15)} Add this plan to compare`;
    trayAdd.classList.toggle('is-in', here);
    trayGo.hidden = n === 0;
    trayGo.innerHTML = n >= 2 ? `Compare ${n} plans ${icon('chevronRight', 14)}` : `1 plan · add one more`;
    trayGo.disabled = n < 2;
  }
  trayAdd.addEventListener('click', () => {
    if (inTray()) { switchMode('compare'); return; }
    const sc = addScenario(app, app.site, app.windowStartMs, trayLabel());
    app.cmpShow = [...(app.cmpShow || []).filter((id) => app.scenarios.some((x) => x.id === id) && id !== sc.id), sc.id].slice(-3);
    play('pop');
    renderTray();
  });
  trayGo.addEventListener('click', () => { if (app.scenarios.length >= 2) { app.cmpView = 'result'; switchMode('compare'); } });

  // 5 · Report
  slot(4).innerHTML = '<div class="f-report f-report-sum" data-report-sum></div><button type="button" class="f-primary f-openreport" data-r="open" aria-haspopup="dialog">Open the full report</button><div class="f-row f-wrap"><button type="button" data-r="print">Print / save as PDF</button><button type="button" data-r="json">Download JSON</button><button type="button" data-r="csv" title="Sun, power, Earth, DSN and link margin at every time step of the window">Time series (CSV)</button><button type="button" data-r="link">Copy link</button><button type="button" data-r="terrain">Terrain 3D ↗</button><button type="button" data-r="lumi">Ask Lumi</button></div><p class="f-note">For GIS and scripts: <a href="https://github.com/Arairo/IMPROVED_lunarmoon-/blob/main/docs/API.md" target="_blank" rel="noopener">GeoTIFF lighting maps, day-by-day tables, Artemis III region outlines and the engine as a JavaScript module</a>.</p>';
  const s5 = slot(4);
  // The full report opens as a column on the right that the 3D Moon and timeline make
  // room for (they shrink, nothing is covered); Expand widens it for reading or
  // printing. Full screen on phones and small tablets.
  const panel = document.createElement('div');
  panel.className = 'xp-flow xp-report';
  panel.id = 'xp-report';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'xp-report-title');
  panel.hidden = true;
  panel.innerHTML = `<header class="r-head"><h2 id="xp-report-title" tabindex="-1">Mission report</h2>
      <div class="r-tools"><button type="button" data-r="wide" aria-pressed="false" title="Make the report wider (the Moon view gets narrower)">Expand</button><button type="button" class="f-primary" data-r="print">Print / save as PDF</button><button type="button" data-r="json">JSON</button><button type="button" data-r="csv" title="Sun, power, Earth, DSN and link margin at every time step of the window">Time series (CSV)</button><button type="button" data-r="link">Copy link</button>
      <button type="button" class="r-close" data-r="close" aria-label="Close the report">${icon('x', 18)}</button></div></header>
    <div class="f-report r-body" data-report tabindex="0" aria-label="Report contents"></div>`;
  (document.getElementById('explorerView') || document.body).appendChild(panel);
  let lastFocus = null;
  // The Moon, map and timeline redraw at their new size when the column opens or closes.
  const relayout = () => { requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); setTimeout(() => window.dispatchEvent(new Event('resize')), 260); };
  const setWide = (on) => {
    panel.classList.toggle('is-wide', on);
    const b = panel.querySelector('[data-r="wide"]');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? 'Narrower' : 'Expand';
    try { localStorage.setItem('lsp.reportWide', on ? '1' : '0'); } catch {}
    relayout();
  };
  try { if (localStorage.getItem('lsp.reportWide') === '1') setWide(true); } catch {}
  panel.querySelector('[data-r="wide"]').addEventListener('click', () => setWide(!panel.classList.contains('is-wide')));
  const openReport = () => {
    lastFocus = document.activeElement;
    panel.querySelector('[data-report]').innerHTML = reportHtml();
    reportKey = '';
    panel.hidden = false;
    requestAnimationFrame(() => { panel.classList.add('is-open'); panel.querySelector('#xp-report-title').focus(); });
    relayout();
    play('tick');
  };
  const closeReport = () => {
    if (panel.hidden) return;
    panel.classList.remove('is-open');
    setTimeout(() => { panel.hidden = true; relayout(); }, 220);
    lastFocus?.focus?.();
  };
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeReport(); } });
  s5.querySelector('[data-r="open"]').addEventListener('click', openReport);
  const onBoth = (k, fn) => [s5, panel].forEach((c) => c.querySelector(`[data-r="${k}"]`)?.addEventListener('click', fn));
  panel.querySelector('[data-r="close"]').addEventListener('click', closeReport);
  onBoth('print', () => printReport());
  onBoth('link', () => actions.copyLink());
  const saveFile = (text, type, ext) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = `lunar-plan-${(app.site.short || app.site.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date(app.windowStartMs).toISOString().slice(0, 10)}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    play('go');
  };
  onBoth('json', () => saveFile(JSON.stringify(decisionSummary(), null, 2), 'application/json', 'json'));
  loadManifest(import.meta.env?.BASE_URL ?? '/');
  onBoth('csv', () => {
    if (!app.scan) return;
    const q = app.ctx?.horizon?.quality;
    const provenance = [
      `Generated ${new Date().toISOString()} by Lunar Site Planner ${BUILD.version}${BUILD.commit ? ` (commit ${BUILD.commit.slice(0, 12)})` : ''}.`,
      `Skyline: ${app.ctx?.horizon?.source || 'unknown'}${q ? ` [${q.tier}] ${q.text}` : ''}`,
      `Spacecraft settings: ${JSON.stringify(app.config)}`,
      'Data files and SHA-256 checksums: data/manifest.json',
    ];
    saveFile(scanToCsv(app.scan, { site: app.site, config: app.config, provenance }), 'text/csv', 'csv');
  });
  s5.querySelector('[data-r="terrain"]').addEventListener('click', () => actions.terrain());
  s5.querySelector('[data-r="lumi"]').addEventListener('click', () => actions.lumi());

  // ---- Navigation ----
  let current = 0;
  const visited = new Set([0]);
  rail.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
  rail.querySelector('.f-back').addEventListener('click', () => go(current - 1));
  rail.querySelector('.f-next').addEventListener('click', () => go(current + 1));
  // Keyboard users: the first Tab stop jumps past the site list to the current step.
  if (!document.querySelector('.lsp-skip')) {
    const skip = document.createElement('a');
    skip.href = '#paneSite';
    skip.className = 'lsp-skip';
    skip.textContent = 'Skip to the mission steps';
    skip.addEventListener('click', (e) => {
      e.preventDefault();
      const step = rail.querySelector('.f-step:not([hidden])');
      const target = step?.querySelector('button, a, input, select, [tabindex]') || rail.querySelector('.f-next');
      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
    });
    document.body.prepend(skip);
  }

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
      ? `<small>Shortcut: best spots for the next 30 days</small><div class="f-row f-wrap">${spots.map((sp, k) => `<button type="button" data-best="${k}" title="Share of the window with the Sun up and Earth in view"><i style="background:${sp.color}"></i>${esc(sp.title)}: ${esc(sp.r.site.short || sp.r.site.name)} · ${pct(sp.r.ops)}</button>`).join('')}<button type="button" class="f-linkbtn" data-best-cmp>Compare side by side</button></div>`
      : '<small>Finding the best spots…</small>';
    bestBox.querySelector('[data-best-cmp]')?.addEventListener('click', () => actions.compareBest());
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
    el.innerHTML = `<div class="f-overall ${v.overall}" title="${SCREEN_MEANING[v.overall]}">${LIGHT[v.overall][0]}<small>screening at touchdown, ${when(app.windowStartMs)}, with your spacecraft settings</small></div>
      ${line('power', 'Power', `${sunTxt} Sunlight ${pct(s.litFraction)} of the window, longest night ${fmtHours(s.longestDarkH)}.`)}
      ${line('earth', 'Earth contact', `${earthTxt} Earth in view ${pct(s.earthCentreFraction)}; a direct link closes on paper ${pct(s.dteFraction)} of the time (DSN antenna time still has to be booked).`)}
      ${slopeLine()}
      ${borderlineLine(v)}
      ${terrainWarning(app.ctx?.horizon)}
      ${epochWarning(app.windowStartMs)}
      <p class="f-terrain">${esc(terrainSummary())}</p>
      ${assumptionsLine()}
      ${methodDetails()}
      <p class="f-note">A quick screen with this tool’s rules of thumb and your spacecraft settings: ${SCREEN_MEANING[v.overall].toLowerCase()} It is not a landing approval or a NASA standard.</p>`;
  }
  /**
   * Reasons the screening result sits close to one of its thresholds, where small
   * terrain or timing errors could flip it (third audit P2). 0.5° is about the size of
   * the skyline differences measured between sampling settings and terrain grids
   * (docs/VALIDATION.md section 3); 12 h is a quarter of a typical terrain-shadow edge.
   */
  function borderline(v) {
    const s = app.scan?.series;
    if (!s || !v) return [];
    const out = [];
    const sunClr = s.sunEl[0] - s.sunHorizon[0];
    if (Math.abs(sunClr) < 0.5) out.push(`the Sun's centre is only ${Math.abs(sunClr).toFixed(2)}° ${sunClr >= 0 ? 'above' : 'below'} the skyline at touchdown`);
    const ec = s.earthClear[0];
    if (Math.abs(ec) < 0.5) out.push(`Earth's centre is only ${Math.abs(ec).toFixed(2)}° ${ec >= 0 ? 'above' : 'below'} the skyline`);
    else if (Math.abs(ec - app.config.comms.minClearanceDeg) < 0.5) out.push(`Earth is ${ec.toFixed(1)}° above the skyline, close to the ${app.config.comms.minClearanceDeg}° wanted for a clean link`);
    const H12 = 12 * 3600000;
    if (v.sunSet && Math.abs(v.sunSet - v.t0 - 7 * 86400000) < H12) out.push('sunset falls within half a day of the 7-day rule');
    if (v.earthSet && Math.abs(v.earthSet - v.t0 - 3 * 86400000) < H12) out.push('Earth sets within half a day of the 3-day rule');
    return out;
  }
  function borderlineLine(v) {
    const b = borderline(v);
    if (!b.length) return '';
    return `<div class="f-v amber f-borderline"><span class="f-light">≈</span><div><b>Close to the line</b><small>${esc(b.join('; '))}. Small terrain or timing errors could change this result: try a few hours either side (Date step) and look at the 250 m range in What if.</small></div></div>`;
  }
  /** Terrain resolution at the site, in one line (third audit P2). */
  function terrainSummary() {
    const q = app.ctx?.horizon?.quality;
    if (!q) return 'Terrain: unknown';
    const size = (m) => (m == null ? '?' : m >= 1000 ? `${+(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
    const tier = { fine: 'finest available', standard: 'standard', coarse: 'approximate until the detailed terrain loads', none: 'no terrain data' }[q.tier] || q.tier;
    return q.tier === 'none' ? 'Terrain: none here (smooth sphere)' : `Terrain at the site: NASA LOLA ${size(q.siteCellM)} (${tier}); farther out ${size(q.coarsestCellM)}; skyline every ${q.azStepDeg}°.`;
  }
  /** The settings these numbers rest on, next to the result (with a way to change them). */
  function assumptionsLine() {
    const p = app.config.power, c = app.config.comms;
    const scen = matchScenario(p);
    return `<p class="f-assume"><b>Assuming</b> ${esc((PANEL_MODES[p.mode]?.label || p.mode).toLowerCase())} solar array, ${p.areaM2} m² at ${Math.round(p.efficiency * 100)}%, a ${p.loadW} W load, battery ${Math.round((p.chargeEff ?? 0.95) * 100)}% efficient each way, ${app.config.mastHeightM} m mast; ${esc(RADIO_PRESETS[c.preset]?.label || c.preset)} at ${Math.round(c.dataRateBps / 1000)} kbps${scen !== 'custom' ? ` (${POWER_SCENARIOS[scen].label.toLowerCase()} example)` : ''}. <button type="button" class="f-linkbtn" data-assume>Change</button></p>`;
  }
  /** How the numbers were worked out, folded away for those who want it. */
  function methodDetails() {
    const q = app.ctx?.horizon?.quality;
    const stepMin = app.scan ? Math.round(app.scan.stepMs / 60000) : null;
    return `<details class="f-more"><summary>How this was worked out</summary><ul class="f-method">
      <li><b>Terrain:</b> ${esc(q?.text || app.ctx?.horizon?.source || 'unknown')}</li>
      <li><b>Time:</b> checked every ${stepMin} minutes over the ${app.windowDays}-day window; each check counts until the next one.</li>
      <li><b>Sun and Earth positions:</b> astronomy-engine with the IAU lunar rotation model, within 0.007° of NASA JPL Horizons in 154 checks.</li>
      <li><b>Power:</b> sunlight on the array × cell efficiency; battery = deepest shortfall against the load, with charge losses. An estimate, not a battery design.</li>
      <li><b>Radio:</b> Earth's centre above the skyline, a DSN dish seeing the Moon and a link budget that closes on paper. Not a DSN booking.</li>
      <li><b>Checks against NASA data</b> and what is not modelled: About → How we check the numbers, and docs/VALIDATION.md.</li></ul></details>`;
  }
  function slopeLine() {
    const sl = groundSlope(app.site.lat, app.site.lon);
    if (!sl || sl.cell > 1000) return '';
    const word = sl.slopeDeg < 5 ? 'gentle' : sl.slopeDeg < 10 ? 'moderate' : sl.slopeDeg < 15 ? 'steep' : 'very steep';
    return `<div class="f-v ${sl.slopeDeg < 10 ? 'green' : sl.slopeDeg < 15 ? 'amber' : 'red'}"><span class="f-light">∠</span><div><b>Ground slope: ${sl.slopeDeg.toFixed(1)}° (${word})</b><small>Averaged over about ${Math.round(sl.baselineM)} m of NASA LOLA terrain. Boulders and small craters are smaller than that, so check high-resolution images before committing.</small></div></div>`;
  }
  function reportHtml() {
    const v = verdictNow();
    const s = app.scan?.stats;
    if (!v || !s) return '<p>Calculating…</p>';
    const ws = windowStats(app.site, app.windowStartMs, app.config, app.windowDays, app.windowDays > 60 ? 2 * 3600000 : 3600000);
    const range = document.querySelector('.xp-plan .p-range')?.textContent || '';
    const spots = getBestSpots().map((sp) => `<li>${esc(sp.title)}: ${esc(sp.r.site.name)} (${pct(sp.r.ops)} with Sun and Earth together)</li>`).join('');
    return `<div class="r-cols"><div class="r-main"><h3>${esc(app.site.name)}</h3>
      <p class="f-meta">${fmtLatLon(app.site.lat, app.site.lon)} · touchdown ${when(app.windowStartMs)} · ${app.windowDays}-day window</p>
      <p class="f-rv">Screening at touchdown: <span class="${v.overall}">${LIGHT[v.overall][0]}</span> Power ${LIGHT[v.power][0]} · Earth ${LIGHT[v.earth][0]}</p>
      <p class="f-note">${SCREEN_MEANING[v.overall]} Preliminary, under the assumptions in this report; not a landing approval.</p>
      <table class="f-table">
        <tr><td>Terrain at the site</td><td>${esc((() => { const q = app.ctx?.horizon?.quality; return q?.siteCellM ? (q.siteCellM >= 1000 ? `${+(q.siteCellM / 1000).toFixed(1)} km` : `${Math.round(q.siteCellM)} m`) + ' LOLA' : '—'; })())}</td></tr>
        <tr><td>Sunlight</td><td>${pct(s.litFraction)}</td></tr>
        <tr><td>Earth in view (centre above terrain)</td><td>${pct(s.earthCentreFraction)}</td></tr>
        <tr><td>Sun and Earth together</td><td>${pct(ws.both)}</td></tr>
        <tr><td>Direct-to-Earth link</td><td>${pct(s.dteFraction)}</td></tr>
        <tr><td>Longest night</td><td>${fmtHours(s.longestDarkH)}${s.longestDarkOpenEnded ? '+' : ''}</td></tr>
        <tr><td>Average solar power</td><td>${Math.round(s.avgPowerW)} W</td></tr>
        <tr><td>Battery needed (estimate, with charge losses)</td><td>${s.batteryKWh.toFixed(1)} kWh${s.batteryOpenEnded ? '+' : ''}</td></tr>
        ${(() => { const sl = groundSlope(app.site.lat, app.site.lon); return sl && sl.cell <= 1000 ? `<tr><td>Ground slope (over ~${Math.round(sl.baselineM)} m)</td><td>${sl.slopeDeg.toFixed(1)}°</td></tr>` : ''; })()}
        ${(() => { const d = app.lastDispersion; return d && d.siteId === app.site.id && d.start === app.windowStartMs ? `<tr><td>Landing anywhere within ${d.radiusM >= 1000 ? `${d.radiusM / 1000} km` : `${d.radiusM} m`}: worst / typical</td><td>${pct(d.min)} / ${pct(d.p50)}</td></tr>` : ''; })()}
      </table>
      ${range ? `<p class="f-note">${esc(range)}: how much the exact landing point matters (positional sensitivity), not an error bar.</p>` : ''}
      ${borderline(v).length ? `<p class="f-note"><b>Close to the line:</b> ${esc(borderline(v).join('; '))}. Small terrain or timing errors could change the screening result.</p>` : ''}
      <p class="f-note"><b>Not included in these numbers:</b> terrain error (LOLA heights and grid size), model simplifications (no thermal, dust or detailed radio losses) and your spacecraft assumptions. Checks against NASA data are in docs/VALIDATION.md (e.g. sunlight within a median 1.2 points of NASA Goddard's maps at the south-polar sites).</p>
      </div><div class="r-side">
      ${spots ? `<p class="f-meta">Best spots for the 30 days from touchdown:</p><ul>${spots}</ul>` : ''}
      ${(() => { const f = flightNow(); return `<p class="f-meta">Getting there (${esc(ROUTES[f.route].label)} route, ${esc(f.lander.label.toLowerCase())}):</p>
        <table class="f-table"><tr><td>Launch from ${esc(f.launchSite.short)}</td><td>${when(f.launchMs)}</td></tr>
        <tr><td>Leave Earth orbit / arrive in lunar orbit</td><td>${when(f.tliMs)} / ${when(f.loiMs)}</td></tr>
        <tr><td>Door to door</td><td>${(f.doorToDoorDays).toFixed(1)} days</td></tr>
        <tr><td>Lander speed changes / fuel</td><td>${f.landerDv.toFixed(2)} km/s / ${Math.round(f.propKg).toLocaleString('en-GB')} kg</td></tr></table>`; })()}
      <p class="f-note">Lunar Site Planner · NASA LOLA terrain · ephemeris checked against NASA JPL Horizons · verdicts are preliminary screening under the assumptions above, using our own rules of thumb.</p></div></div>`;
  }
  /** Short version for the Report step; the full report opens in the side panel. */
  function reportSummaryHtml() {
    const v = verdictNow();
    const s = app.scan?.stats;
    if (!v || !s) return '<p>Calculating…</p>';
    return `<h3>${esc(app.site.name)}</h3>
      <p class="f-meta">touchdown ${when(app.windowStartMs)} · ${app.windowDays}-day window</p>
      <p class="f-rv"><span class="${v.overall}">${LIGHT[v.overall][0]}</span> Power ${LIGHT[v.power][0]} · Earth ${LIGHT[v.earth][0]}</p>
      <table class="f-table">
        <tr><td>Sunlight</td><td>${pct(s.litFraction)}</td></tr>
        <tr><td>Earth in view</td><td>${pct(s.earthCentreFraction)}</td></tr>
        <tr><td>Battery needed (estimate)</td><td>${s.batteryKWh.toFixed(1)} kWh${s.batteryOpenEnded ? '+' : ''}</td></tr>
      </table>`;
  }
  /** The flight for this plan, with the route and lander chosen in the Flight view (Direct by default). */
  function flightNow() {
    const o = app.flight?.opts || (() => { try { return JSON.parse(localStorage.getItem('lsp.flight') || '{}'); } catch { return {}; } })();
    return planFlight(app.windowStartMs, o);
  }
  /** Machine-readable decision summary: the same numbers as the report, plus inputs and provenance. */
  function decisionSummary() {
    const v = verdictNow();
    const s = app.scan?.stats || {};
    const ws = windowStats(app.site, app.windowStartMs, app.config, app.windowDays, app.windowDays > 60 ? 2 * 3600000 : 3600000);
    const sl = groundSlope(app.site.lat, app.site.lon);
    const d = app.lastDispersion && app.lastDispersion.siteId === app.site.id && app.lastDispersion.start === app.windowStartMs ? app.lastDispersion : null;
    const r2 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
    return {
      tool: 'Lunar Site Planner', generatedUtc: new Date().toISOString(), link: location.href,
      reportVersion: 2,
      build: BUILD,
      method: {
        timeScale: 'UTC (astronomy-engine converts to TT internally)',
        frames: 'Moon body-fixed (IAU rotation model), planetocentric latitude, east-positive longitude, heights above the 1737.4 km sphere; see docs/FRAMES.md',
        scanStepMinutes: app.scan ? Math.round(app.scan.stepMs / 60000) : null,
        energySum: 'each sample counts until the next one; the last only until the window end (left-point sums, exact window length)',
        mastHeightM: app.config.mastHeightM,
      },
      datasets: datasetProvenance(),
      site: { name: app.site.name, latDeg: r2(app.site.lat), lonDeg: r2(app.site.lon), terrain: app.ctx?.horizon?.source || null, terrainQuality: app.ctx?.horizon?.quality || null },
      touchdownUtc: new Date(app.windowStartMs).toISOString(), windowDays: app.windowDays, ephemerisCheck: epochStatus(app.windowStartMs),
      verdictAtTouchdown: v ? { overall: LIGHT[v.overall][0], meaning: SCREEN_MEANING[v.overall], closeToThreshold: borderline(v), power: LIGHT[v.power][0], earthContact: LIGHT[v.earth][0], rules: 'preliminary screening with Lunar Site Planner rules of thumb, not a NASA standard or a landing approval' } : null,
      window: {
        sunlightFraction: r2(s.litFraction), earthInViewFraction: r2(s.earthCentreFraction), sunAndEarthTogetherFraction: r2(ws.both),
        directToEarthFraction: r2(s.dteFraction), longestNightHours: r2(s.longestDarkH), longestNightCutByWindow: !!s.longestDarkOpenEnded,
        averageSolarPowerW: r2(s.avgPowerW), batteryNeededKWh: r2(s.batteryKWh),
      },
      groundSlope: sl && sl.cell <= 1000 ? { degrees: r2(sl.slopeDeg), baselineM: Math.round(sl.baselineM) } : null,
      landingDispersion: d ? { radiusM: d.radiusM, samples: d.points.length, sunAndEarthTogether: { worst: r2(d.min), p10: r2(d.p10), median: r2(d.p50), best: r2(d.max) } } : null,
      flight: (() => { const f = flightNow(); return { route: f.route, model: 'patched conics planning model', launchSite: f.launchSite.name, launchUtc: new Date(f.launchMs).toISOString(), leaveEarthOrbitUtc: new Date(f.tliMs).toISOString(), lunarOrbitArrivalUtc: new Date(f.loiMs).toISOString(), doorToDoorDays: r2(f.doorToDoorDays), landerDeltaVKmS: r2(f.landerDv), landerDryKg: f.lander.dryKg, propellantKg: Math.round(f.propKg), burns: f.burns.map((b) => ({ burn: b.label, utc: new Date(b.t).toISOString(), deltaVKmS: r2(b.dv), by: b.byLander ? 'lander' : 'rocket', basis: b.basis })), modelInfo: f.model }; })(),
      spacecraft: app.config,
      spacecraftScenario: { matches: matchScenario(app.config.power), note: 'Nominal / Conservative / Degraded are illustrative settings for seeing how sensitive a plan is, not validated hardware profiles.' },
      assumptions: {
        battery: 'Battery needed = deepest energy shortfall against the constant load, with charge and discharge efficiency from spacecraft.power. An energy estimate, not a battery design (no temperature, ageing or voltage limits).',
        communications: linkAssumptions(app.config.comms),
        directToEarth: 'directToEarthFraction counts times when Earth is in line of sight, a DSN complex sees the Moon above its mask, and the link budget closes on paper. It is not a DSN schedule.',
        verdict: 'GO / GO WITH CARE / NO GO are a preliminary screening with this tool\u2019s rules of thumb under the settings above (GO = favourable under these assumptions; GO WITH CARE = possible but limited, further analysis needed; NO GO = not favourable in this scenario). Not a NASA standard or a landing approval.',
      },
      uncertainty: {
        positionalSensitivity: (() => { const r = app.lastRange; const k = `${app.site.lat},${app.site.lon}|${app.windowStartMs}|${JSON.stringify(app.config)}`; return r && r.key === k ? { what: 'Same 30 days at the site and 250 m N, S, E and W: how much the exact landing point matters. Not an error bar or confidence interval.', metres: r.metres, days: r.days, sunlightFraction: r.sun.map(r2), earthInViewFraction: r.earth.map(r2) } : 'not computed yet (open the What if step)'; })(),
        terrain: 'Not quantified per site. LOLA heights are interpolated between laser tracks; grid size at the site is in site.terrainQuality. Sampling effect on yearly sunlight: at most 0.2 points at 19 south-polar sites (docs/validation/azimuth-resolution.json).',
        model: 'Not quantified. Simplifications are listed in assumptions and docs/VALIDATION.md (error budget).',
        input: 'Not quantified. Results depend on the spacecraft settings above (array, load, battery efficiency, radio); change them to see the effect.',
        referenceComparisons: 'Observed differences against independent data, not error bounds for every site and date: Sun/Earth positions vs JPL Horizons (worst 0.007°), sunlight vs NASA PGDA (site median 1.2 points, worst 8.1), shadows vs LROC photos (93% of pixels). Records in docs/validation/.',
      },
      provenance: { terrain: 'NASA LRO LOLA (20 m PGDA tiles over the nine Artemis III candidate regions and other main south-polar sites, 240 m / 1 km south-polar grids, LDEM_16 elsewhere)', ephemeris: 'astronomy-engine with the IAU lunar rotation model, checked against NASA JPL Horizons' },
    };
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
    renderTray();
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
      const range = document.querySelector('.xp-plan .p-range')?.textContent || '';
      const k = `${app.site.lat},${app.site.lon}|${app.windowStartMs}|${app.windowDays}|${JSON.stringify(app.config)}|${getBestSpots().length}|${range}`;
      if (force || k !== reportKey) {
        reportKey = k;
        slot(4).querySelector('[data-report-sum]').innerHTML = reportSummaryHtml();
        const full = document.querySelector('#xp-report:not([hidden]) [data-report]');
        if (full) full.innerHTML = reportHtml();
      }
    }
  }
  let reportKey = '';
  window.addEventListener('lsp-range', () => { if (current === 4) refresh(); });
  window.addEventListener('lsp-terrain', () => { keys.verdict = null; if (current === 2) renderVerdict(); });

  go(0, { quiet: true });
  return { refresh, go, step: () => current, print: () => printReport(), renderBest: () => { if (current === 0) renderBest(); } };
}
