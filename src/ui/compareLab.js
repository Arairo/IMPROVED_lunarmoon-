// Compare Lab: scenarios side by side, built to show the size of each
// difference, not just the numbers. Winner banner, big scenario cards with
// deltas against a chosen baseline, one bar chart per metric, and a
// day-by-day strip view aligned on touchdown.

import { esc, fmtHours, fmtLatLon } from './format.js';
import { icon } from '../experience/icons.js';

export const SC_COLORS = ['#2997ff', '#ff9f0a', '#30d158', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#ff6482'];
const DAY = 86400000;

/** Fraction of the window with the Sun up AND Earth's centre above the terrain (cached on the scenario). */
export function bothFraction(sc) {
  if (sc._both != null) return sc._both;
  const { lit, los } = sc.scan.series;
  let n = 0;
  for (let i = 0; i < lit.length; i++) if (lit[i] && los[i]) n++;
  sc._both = lit.length ? n / lit.length : 0;
  return sc._both;
}

const fmtPct = (v) => `${Math.round(v * 100)}%`;
const fmtDur = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${Math.round(h)} h`);
export const METRICS = [
  { key: 'both', label: 'Sun + Earth together', hint: 'Power and a radio link at the same time', get: (s) => bothFraction(s), fmt: fmtPct, better: 'high', unit: 'pct', hero: true },
  { key: 'litFraction', label: 'Sunlight', hint: 'Share of the window with the Sun up', get: (s) => s.scan.stats.litFraction, fmt: fmtPct, better: 'high', unit: 'pct' },
  { key: 'earthCentreFraction', label: 'Earth in view', hint: 'Earth’s centre above the terrain', get: (s) => s.scan.stats.earthCentreFraction, fmt: fmtPct, better: 'high', unit: 'pct' },
  { key: 'dteFraction', label: 'Direct-to-Earth link', hint: 'Earth in view and a DSN antenna can see the Moon', get: (s) => s.scan.stats.dteFraction, fmt: fmtPct, better: 'high', unit: 'pct' },
  { key: 'avgPowerW', label: 'Average solar power', hint: 'With your spacecraft settings', get: (s) => s.scan.stats.avgPowerW, fmt: (v) => `${Math.round(v)} W`, better: 'high', unit: 'W' },
  { key: 'longestDarkH', label: 'Longest night', hint: 'Longest stretch without sunlight', get: (s) => s.scan.stats.longestDarkH, fmt: fmtDur, better: 'low', unit: 'h', open: 'longestDarkOpenEnded' },
  { key: 'batteryKWh', label: 'Battery needed', hint: 'To get through the longest night', get: (s) => s.scan.stats.batteryKWh, fmt: (v) => `${v.toFixed(1)} kWh`, better: 'low', unit: 'kWh', open: 'batteryOpenEnded' },
  { key: 'longestBlackoutH', label: 'Longest radio blackout', hint: 'Longest stretch without a direct link', get: (s) => s.scan.stats.longestBlackoutH, fmt: fmtDur, better: 'low', unit: 'h', open: 'longestBlackoutOpenEnded' },
];

/** Signed difference against the baseline, in words that show its size. */
export function deltaText(m, v, base) {
  const d = v - base;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  let txt;
  if (m.unit === 'pct') { const pts = Math.round(v * 100) - Math.round(base * 100); txt = `${pts > 0 ? '+' : pts < 0 ? '−' : '±'}${Math.abs(pts)} pts`; return { txt, good: m.better === 'high' ? pts > 0 : pts < 0, zero: pts === 0 }; }
  if (m.unit === 'W') txt = `${sign}${Math.abs(Math.round(d))} W`;
  else if (m.unit === 'kWh') txt = `${sign}${Math.abs(d).toFixed(1)} kWh`;
  else txt = `${sign}${fmtDur(Math.abs(d))}`;
  const zero = m.unit === 'h' ? Math.abs(d) < 1 : m.unit === 'kWh' ? Math.abs(d) < 0.05 : Math.abs(d) < 1;
  return { txt, good: m.better === 'high' ? d > 0 : d < 0, zero };
}

/** Overall score used for the ranking: time with power AND radio first, then link, then short nights. */
export function scoreOf(sc) {
  const st = sc.scan.stats;
  return bothFraction(sc) * 100 + st.dteFraction * 20 - Math.min(st.longestDarkH, 720) / 72;
}

function verdict(sc) {
  const st = sc.scan.stats;
  const both = bothFraction(sc);
  if (st.litFraction < 0.2) return { cls: 'red', text: 'Too dark' };
  if (st.earthCentreFraction === 0) return { cls: 'red', text: 'Earth never in view' };
  if (both >= 0.4 && st.longestDarkH <= 120) return { cls: 'green', text: 'Strong' };
  if (both >= 0.2) return { cls: 'amber', text: st.litFraction > st.earthCentreFraction ? 'Radio-limited' : 'Power-limited' };
  return { cls: 'red', text: 'Weak' };
}

function drawStrip(canvas, sc, days, { rows = 3 } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const dark = document.documentElement.dataset.theme !== 'light';
  const s = sc.scan.series;
  const n = s.times.length;
  const span = days * DAY;
  const x = (ms) => ((ms - sc.startMs) / span) * w;
  const gap = 3;
  const rh = (h - gap * (rows - 1)) / rows;
  const tracks = rows === 1
    ? [{ col: (i) => (s.lit[i] && s.los[i] ? '#30d158' : s.lit[i] ? 'rgba(255,179,0,.62)' : null) }]
    : [{ col: (i) => (s.lit[i] ? '#ffb300' : null) }, { col: (i) => (s.los[i] ? '#38a0ff' : null) }, { col: (i) => (s.lit[i] && s.los[i] ? '#30d158' : null) }];
  tracks.forEach((tr, r) => {
    const y = r * (rh + gap);
    ctx.fillStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)';
    ctx.beginPath(); ctx.roundRect(0, y, w, rh, Math.min(4, rh / 2)); ctx.fill();
    let start = -1, cur = null;
    for (let i = 0; i <= n; i++) {
      const c = i < n ? tr.col(i) : null;
      if (c !== cur) {
        if (cur && start >= 0) {
          const x0 = x(s.times[start]), x1 = i < n ? x(s.times[i]) : Math.min(w, x(s.times[n - 1]) + (w / n));
          ctx.fillStyle = cur; ctx.beginPath(); ctx.roundRect(x0, y, Math.max(1, x1 - x0), rh, Math.min(4, rh / 2)); ctx.fill();
        }
        start = i; cur = c;
      }
    }
  });
}

let bound = false;

/** The three-step guide shown at the top of the lab; it ticks off as you go. */
function guideHtml(app) {
  const n = app.scenarios.length;
  const base = app.scenarios.find((x) => x.id === app.compareBaseId) || app.scenarios[0];
  const st1 = n >= 2 ? 'done' : 'now';
  const st2 = n < 2 ? '' : app.compareBaseChosen ? 'done' : 'now';
  const st3 = n >= 2 ? 'now' : '';
  const tick = (st, k) => `<span class="g-n">${st === 'done' ? icon('check', 14) : k}</span>`;
  return `<ol class="cl-guide">
    <li class="${st1}" data-g="1">${tick(st1, 1)}<div><b>Add plans</b><small>${n === 0 ? 'Use the buttons above, or a quick start below.' : n === 1 ? '1 added. Add at least one more to compare.' : `${n} plans added. Add more any time.`}</small></div></li>
    <li class="${st2}" data-g="2">${tick(st2, 2)}<div><b>Pick a baseline</b><small>${n < 2 ? 'The plan you measure the others against.' : `Now: <b>${esc(base.label)}</b>. Tap ${icon('star', 12)} on a card to change it.`}</small></div></li>
    <li class="${st3}" data-g="3">${tick(st3, 3)}<div><b>Read the differences</b><small>${n < 2 ? 'Winner, cards, bars and a day-by-day view appear here.' : 'Green = better than the baseline, red = worse. Longer bar = more.'}</small></div></li>
  </ol>`;
}

/**
 * Render the lab into `container`. `onOpen(scenario)` opens a scenario in the
 * planner; `addScenario(app, site, startMs, label)` adds one (from compare.js).
 */
export function renderCompareLab(container, app, onOpen, addScenario) {
  if (!container) return;
  const rerender = () => renderCompareLab(container, app, onOpen, addScenario);
  const setCount = () => {
    const c = document.getElementById('headerCompareCount');
    if (c) { c.textContent = String(app.scenarios.length); c.classList.toggle('has-items', app.scenarios.length > 0); }
  };
  setCount();

  // One-time bindings for the static header controls.
  if (!bound) {
    bound = true;
    let t = 0;
    const redraw = () => { clearTimeout(t); t = setTimeout(() => { if (!document.getElementById('compareView')?.classList.contains('hidden')) redrawCompareLab(container, app); }, 120); };
    window.addEventListener('lsp-theme', redraw);
    window.addEventListener('resize', redraw);
    const sel = document.getElementById('cmpAddSiteSel');
    if (sel) {
      sel.innerHTML = `<option value="">Add any site…</option>${app.sites.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}`;
      sel.addEventListener('change', () => {
        const s = app.sites.find((x) => x.id === sel.value);
        if (s) { addScenario(app, s, app.windowStartMs, s.short || s.name); setCount(); rerender(); }
        sel.value = '';
      });
    }
  }

  const list = app.scenarios;
  if (!list.length) {
    container.innerHTML = `${guideHtml(app)}<div class="cl-empty">
        <div class="cl-empty-ico">${icon('scale', 34)}</div>
        <h3>Put plans side by side</h3>
        <p>See exactly how much a launch delay, a different site or a nearby ridge changes your power and radio contact.</p>
        <div class="cl-quick">
          <button type="button" data-q="slip"><span class="q-ico" style="--c:#2997ff">${icon('calendar', 22)}</span><b>What if we launch late?</b><small>This site as planned, then +1, +2 and +3 lunar months</small></button>
          <button type="button" data-q="nearby"><span class="q-ico" style="--c:#30d158">${icon('sun', 22)}</span><b>Is there a sunnier spot?</b><small>This site vs the best-lit ridges near the south pole</small></button>
          <button type="button" data-q="famous"><span class="q-ico" style="--c:#ff9f0a">${icon('rocket', 22)}</span><b>Famous landings</b><small>Apollo 11, IM-1, IM-2 and Chandrayaan-3 on the same dates</small></button>
          <button type="button" data-q="current"><span class="q-ico" style="--c:#bf5af2">${icon('mapPin', 22)}</span><b>Start with this site</b><small>Add the current site and date, then add more</small></button>
        </div></div>`;
    bindQuick();
    bindGuide();
    return;
  }

  if (!list.some((s) => s.id === app.compareBaseId)) app.compareBaseId = list[0].id;
  const base = list.find((s) => s.id === app.compareBaseId);
  // Every scenario keeps a colour no other scenario is using (8 named, then golden-angle hues).
  const colorAt = (k) => (k < SC_COLORS.length ? SC_COLORS[k] : `hsl(${Math.round((k * 137.508) % 360)} 78% 62%)`);
  list.forEach((s) => {
    if (s.color && list.some((o) => o !== s && o.color === s.color && list.indexOf(o) < list.indexOf(s))) s.color = null;
    if (!s.color) { let k = 0; while (list.some((o) => o.color === colorAt(k))) k++; s.color = colorAt(k); }
  });
  const ranked = [...list].sort((a, b) => scoreOf(b) - scoreOf(a));
  const rank = new Map(ranked.map((s, i) => [s.id, i + 1]));
  const best = ranked[0];
  const hero = METRICS[0];
  const dBest = deltaText(hero, hero.get(best), hero.get(base));
  const maxDays = Math.max(...list.map((s) => s.windowDays));
  const dateTxt = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  // In charts, show the part that differs: "slip +1 mo" rather than a cut-off site name.
  const prefixCount = {};
  list.forEach((s) => { const k = s.label.split(' · ')[0]; prefixCount[k] = (prefixCount[k] || 0) + 1; });
  const short = (s) => { const [head, ...rest] = s.label.split(' · '); return rest.length && prefixCount[head] > 1 ? rest.join(' · ') : s.label; };
  const winner = list.length > 1
    ? `<div class="cl-winner">
        <span class="w-ico">${icon('trophy', 26)}</span>
        <div><small>Best of ${list.length} scenarios</small><b><i class="w-dot" style="background:${best.color}"></i>${esc(best.label)}</b>
          <span>Sun and Earth up together <b>${hero.fmt(hero.get(best))}</b> of the time${best.id === base.id ? ' (this is your baseline)' : `, <b class="${dBest.good ? 'up' : 'down'}">${dBest.txt}</b> vs the baseline`}.</span></div>
        <button type="button" class="cl-btn" data-open="${best.id}">${icon('arrowUpRight', 15)} Open in planner</button></div>`
    : `<div class="cl-winner is-hint"><span class="w-ico">${icon('plus', 24)}</span><div><b>Add one more scenario to compare</b><span>Try a launch slip, a sunnier ridge, or any site from the menu above.</span></div></div>`;

  const cards = list.map((s) => {
    const v = verdict(s);
    const val = hero.get(s);
    const d = deltaText(hero, val, hero.get(base));
    const st = s.scan.stats;
    return `<article class="cl-card${s.id === base.id ? ' is-base' : ''}" style="--c:${s.color}">
      <div class="cc-top"><span class="cc-rank" title="Overall rank">#${rank.get(s.id)}</span><span class="cc-badge ${v.cls}">${v.text}</span>
        <span class="cc-acts">
          <button type="button" data-base="${s.id}" title="${s.id === base.id ? 'This is the baseline' : 'Use as baseline'}" aria-label="Use as baseline" class="${s.id === base.id ? 'is-on' : ''}">${icon('star', 15)}</button>
          <button type="button" data-open="${s.id}" title="Open in planner" aria-label="Open in planner">${icon('arrowUpRight', 15)}</button>
          <button type="button" data-rm="${s.id}" title="Remove" aria-label="Remove">${icon('x', 15)}</button></span></div>
      <h4>${esc(s.label)}</h4>
      <p class="cc-sub">${fmtLatLon(s.site.lat ?? 0, s.site.lon ?? 0, 2)} · ${dateTxt(s.startMs)} · ${s.windowDays} days</p>
      <div class="cc-hero"><b>${hero.fmt(val)}</b><span>Sun + Earth<br>together</span>
        ${s.id === base.id ? '<em class="cc-delta base">Baseline</em>' : `<em class="cc-delta ${d.zero ? 'same' : d.good ? 'up' : 'down'}">${d.zero ? 'Same' : d.txt}</em>`}</div>
      <div class="cc-meter"><span style="width:${Math.round(val * 100)}%"></span></div>
      <dl class="cc-stats"><div><dt>Sun</dt><dd>${fmtPct(st.litFraction)}</dd></div><div><dt>Earth</dt><dd>${fmtPct(st.earthCentreFraction)}</dd></div><div><dt>Longest night</dt><dd>${st.longestDarkOpenEnded && st.longestDarkH > 0 ? '≥ ' : ''}${fmtHours(st.longestDarkH)}</dd></div></dl>
      <canvas class="cc-strip" data-strip="${s.id}" aria-label="Sun, Earth and both over the window"></canvas>
      <div class="cc-legend"><span><i style="background:#ffb300"></i>Sun</span><span><i style="background:#38a0ff"></i>Earth</span><span><i style="background:#30d158"></i>Both</span></div>
    </article>`;
  }).join('');

  const bars = METRICS.map((m) => {
    const vals = list.map((s) => m.get(s));
    const top = m.unit === 'pct' ? 1 : Math.max(1e-9, ...vals);
    const bestV = m.better === 'high' ? Math.max(...vals) : Math.min(...vals);
    const bv = m.get(base);
    return `<section class="cl-metric"><div class="cm-head"><b>${m.label}</b><small>${m.hint} · ${m.better === 'high' ? 'higher is better' : 'lower is better'}</small></div>
      ${list.map((s, i) => {
        const v = vals[i];
        const d = deltaText(m, v, bv);
        const isBest = list.length > 1 && v === bestV;
        const open = m.open && s.scan.stats[m.open] && v > 0 ? '≥ ' : '';
        return `<div class="cm-row${isBest ? ' is-best' : ''}" style="--c:${s.color}">
          <span class="cm-name" title="${esc(s.label)}"><i></i>${esc(short(s))}</span>
          <span class="cm-track"><span class="cm-bar" style="width:${Math.max(1.5, (v / top) * 100).toFixed(1)}%"></span></span>
          <span class="cm-val">${open}${m.fmt(v)}${isBest ? `<span class="cm-crown" title="Best">${icon('trophy', 13)}</span>` : ''}</span>
          <span class="cm-delta ${s.id === base.id ? 'base' : d.zero ? 'same' : d.good ? 'up' : 'down'}">${s.id === base.id ? 'base' : d.zero ? '±0' : d.txt}</span>
        </div>`;
      }).join('')}</section>`;
  }).join('');

  const ticks = [];
  const tickEvery = maxDays > 120 ? 30 : maxDays > 45 ? 7 : 5;
  for (let d = 0; d <= maxDays; d += tickEvery) ticks.push(`<span style="left:${(d / maxDays) * 100}%">Day ${d}</span>`);
  const daysView = `<div class="cl-days">
      ${list.map((s) => `<div class="cd-row" style="--c:${s.color}"><span class="cd-name" title="${esc(s.label)}"><i></i>${esc(short(s))}</span><span class="cd-track"><canvas data-day="${s.id}"></canvas></span><span class="cd-val">${fmtPct(bothFraction(s))}</span></div>`).join('')}
      <div class="cd-axis"><span class="cd-name"></span><span class="cd-ticks">${ticks.join('')}</span><span class="cd-val"></span></div>
      <div class="cd-legend"><span><i style="background:#30d158"></i>Sun and Earth up (power + radio)</span><span><i class="amber"></i>Sun only (power, no direct radio)</span><span><i class="none"></i>Sun down</span></div>
    </div>`;

  const cols = ['Sunlight', 'Sun + Earth', 'Avg power', 'Longest night', 'Battery', 'Earth in view', 'DTE link', 'Longest blackout'];
  const table = `<details class="cl-table"><summary>Full table</summary><div class="ct-wrap"><table>
      <thead><tr><th>Scenario</th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${list.map((s) => { const st = s.scan.stats; const ge = (k, o) => (st[o] && st[k] > 0 ? '≥ ' : ''); return `<tr><td><i style="background:${s.color}"></i>${esc(s.label)}</td><td>${fmtPct(st.litFraction)}</td><td>${fmtPct(bothFraction(s))}</td><td>${Math.round(st.avgPowerW)} W</td><td>${ge('longestDarkH', 'longestDarkOpenEnded')}${fmtHours(st.longestDarkH)}</td><td>${ge('batteryKWh', 'batteryOpenEnded')}${st.batteryKWh.toFixed(1)} kWh</td><td>${fmtPct(st.earthCentreFraction)}</td><td>${fmtPct(st.dteFraction)}</td><td>${ge('longestBlackoutH', 'longestBlackoutOpenEnded')}${fmtHours(st.longestBlackoutH)}</td></tr>`; }).join('')}</tbody></table></div></details>`;

  container.innerHTML = `${guideHtml(app)}${winner}
    <h3 class="cl-h"><span class="h-n">2</span>Your plans <small>Each number is compared with the baseline (${icon('star', 12)} ${esc(base.label)}). Tap ${icon('star', 12)} on another card to measure from it instead.</small></h3>
    <div class="cl-cards">${cards}</div>
    <h3 class="cl-h"><span class="h-n">3</span>Side by side <small>Longer bar = more. ${icon('trophy', 12)} marks the best for each measure.</small></h3>
    <div class="cl-bars">${bars}</div>
    <h3 class="cl-h">Day by day <small>Each row starts at its touchdown, so you can see when each plan has power and radio.</small></h3>
    ${daysView}
    ${table}`;

  container.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { const sc = list.find((x) => x.id === b.dataset.open); if (sc) onOpen(sc); }));
  container.querySelectorAll('[data-base]').forEach((b) => b.addEventListener('click', () => { app.compareBaseId = b.dataset.base; app.compareBaseChosen = true; rerender(); }));
  container.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.rm === app.compareBaseId) app.compareBaseChosen = false;
    app.scenarios = app.scenarios.filter((x) => x.id !== b.dataset.rm);
    setCount();
    rerender();
  }));
  requestAnimationFrame(() => {
    container.querySelectorAll('[data-strip]').forEach((c) => { const sc = list.find((x) => x.id === c.dataset.strip); if (sc) drawStrip(c, sc, sc.windowDays); });
    container.querySelectorAll('[data-day]').forEach((c) => { const sc = list.find((x) => x.id === c.dataset.day); if (sc) { c.style.width = `${(sc.windowDays / maxDays) * 100}%`; drawStrip(c, sc, sc.windowDays, { rows: 1 }); } });
    // Bars grow in so the size of each difference reads at a glance.
    container.querySelectorAll('.cm-bar, .cc-meter span').forEach((b) => { const w = b.style.width; b.style.width = '0'; requestAnimationFrame(() => { b.style.width = w; }); });
  });

  bindGuide();
  function bindGuide() {
    container.querySelectorAll('[data-g]').forEach((li) => li.addEventListener('click', () => {
      const target = { 1: '.cl-head', 2: '.cl-cards', 3: '.cl-bars' }[li.dataset.g];
      document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  function bindQuick() {
    container.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q;
      if (q === 'slip') document.getElementById('cmpSlipBtn')?.click();
      else if (q === 'nearby') { addScenario(app, app.site, app.windowStartMs, `${app.site.short || app.site.name}`); document.getElementById('cmpNearbyBtn')?.click(); }
      else if (q === 'current') document.getElementById('cmpAddCurrentBtn')?.click();
      else if (q === 'famous') {
        ['a11', 'im1', 'im2', 'ch3'].forEach((id) => { const s = app.sites.find((x) => x.id === id); if (s) addScenario(app, s, app.windowStartMs, s.short || s.name.replace(/ \(.*\)$/, '')); });
        setCount(); rerender();
      }
    }));
  }
}

/** Redraw canvases after a theme change or resize. */
export function redrawCompareLab(container, app) {
  if (!container || !app.scenarios.length) return;
  const maxDays = Math.max(...app.scenarios.map((s) => s.windowDays));
  container.querySelectorAll('[data-strip]').forEach((c) => { const sc = app.scenarios.find((x) => x.id === c.dataset.strip); if (sc) drawStrip(c, sc, sc.windowDays); });
  container.querySelectorAll('[data-day]').forEach((c) => { const sc = app.scenarios.find((x) => x.id === c.dataset.day); if (sc) drawStrip(c, sc, sc.windowDays, { rows: 1 }); });
  void maxDays;
}
