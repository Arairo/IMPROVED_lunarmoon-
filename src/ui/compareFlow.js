// Compare, question first (in the spirit of Apple's model compare, Versus.com
// head-to-heads and Google Flights' date graph):
//   start   - "What do you want to compare?" (two places / launch dates / my plan vs the best spot)
//   places  - pick two (or three) sites on the same touchdown date
//   dates   - one chart of every launch day for a year; tap a day to compare it with your plan
//   result  - head-to-head: one verdict sentence, why the winner wins, only the
//             measures that differ, and everything else folded under "full details".

import { esc } from './format.js';
import { icon } from '../experience/icons.js';
import { METRICS, bothFraction, scoreOf, verdict, assignColors, renderCompareLab } from './compareLab.js';
import { launchDateSeries } from '../core/planning.js';

const DAY = 86400000;
const pct = (f) => `${Math.round(f * 100)}%`;
const dShort = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dLong = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortName = (s) => (s.short || s.name).replace(/ \(.*\)$/, '');

// How big a difference has to be before we call it a difference.
const TOL = { pct: 0.02, W: 0.05, h: 6, kWh: 0.2 };
function differs(m, a, b) {
  if (m.unit === 'pct') return Math.abs(Math.round(a * 100) - Math.round(b * 100)) >= TOL.pct * 100;
  if (m.unit === 'W') return Math.abs(a - b) > TOL.W * Math.max(a, b, 1);
  if (m.unit === 'kWh') return Math.abs(a - b) >= TOL.kWh;
  return Math.abs(a - b) >= TOL.h;
}
const better = (m, a, b) => (m.better === 'high' ? a > b : a < b);
const REASON = {
  both: 'Power and radio together more often',
  litFraction: 'More sunlight',
  earthCentreFraction: 'Earth in view more often',
  dteFraction: 'Direct radio link more often',
  avgPowerW: 'More solar power on average',
  longestDarkH: 'Shorter longest night',
  batteryKWh: 'Needs a smaller battery',
  longestBlackoutH: 'Shorter radio blackout',
};
const val = (m, s) => {
  const v = m.get(s);
  const open = m.open && s.scan.stats[m.open] && v > 0 ? '≥ ' : '';
  return `${open}${m.fmt(v)}`;
};

let seriesCache = { key: '', data: null };

export function renderCompareFlow(container, app, onOpen, addScenario) {
  if (!container) return;
  const rerender = () => renderCompareFlow(container, app, onOpen, addScenario);
  const setCount = () => {
    const c = document.getElementById('headerCompareCount');
    if (c) { c.textContent = String(app.scenarios.length); c.classList.toggle('has-items', app.scenarios.length > 0); }
  };
  setCount();
  if (!app.cmpView) app.cmpView = app.scenarios.length >= 2 ? 'result' : 'start';
  if (app.cmpView === 'result' && app.scenarios.length < 2) app.cmpView = 'start';
  const head = (title, sub) => {
    const t = document.getElementById('cmpTitle'); if (t) t.textContent = title;
    const p = document.getElementById('cmpSub'); if (p) p.textContent = sub;
    const n = document.getElementById('cmpNewBtn'); if (n) n.hidden = app.cmpView === 'start';
  };
  const go = (view) => { app.cmpView = view; rerender(); container.closest('#compareView')?.scrollTo({ top: 0, behavior: 'smooth' }); };
  const plan = { site: app.site, startMs: app.windowStartMs };
  const bestSite = () => {
    const spots = (app.bestSpots || []).map((sp) => sp.r.site).filter((s) => s.id !== app.site.id);
    return spots[0] || app.sites.find((s) => s.id === (app.site.id === 'ridge' ? 'peak-shackleton' : 'ridge'));
  };
  /** Replace the comparison with these plans and show the head-to-head. */
  const setPlans = (plans) => {
    app.scenarios = [];
    plans.forEach((p) => addScenario(app, p.site, p.startMs, p.label));
    app.compareBaseId = app.scenarios[0]?.id;
    app.cmpShow = app.scenarios.slice(0, 3).map((s) => s.id);
    setCount();
    go('result');
  };
  app.cmpSetPlans = setPlans;
  app.cmpBestSite = bestSite;

  // ---------------------------------------------------------------- start
  if (app.cmpView === 'start') {
    head('What do you want to compare?', 'Pick one question. You can always start a new comparison.');
    container.innerHTML = `<div class="cq">
      <div class="cq-cards">
        <button type="button" class="cq-card" data-q="places"><span class="cq-ico" style="--c:#2997ff">${icon('mapPin', 26)}</span>
          <b>Two places</b><span>Same landing date, different sites. Which one gives the lander more power and radio?</span><em>Choose the places ${icon('chevronRight', 14)}</em></button>
        <button type="button" class="cq-card" data-q="dates"><span class="cq-ico" style="--c:#ff9f0a">${icon('calendar', 26)}</span>
          <b>Launch dates</b><span>Same site, every launch day for a year on one chart. What if we launch late?</span><em>See the chart ${icon('chevronRight', 14)}</em></button>
        <button type="button" class="cq-card" data-q="best"><span class="cq-ico" style="--c:#30d158">${icon('trophy', 26)}</span>
          <b>My plan vs the best spot</b><span>How does your plan stack up against the best site for the same dates?</span><em>Compare now ${icon('chevronRight', 14)}</em></button>
      </div>
      <p class="cq-plan">${icon('mapPin', 14)} Your plan: <b>${esc(app.site.name)}</b>, touchdown <b>${dShort(app.windowStartMs)}</b>. Change it in the planner.</p>
      ${app.scenarios.length >= 2 ? `<button type="button" class="cq-resume" data-q="resume">Back to your last comparison (${app.scenarios.length} plans) ${icon('chevronRight', 14)}</button>` : ''}
    </div>`;
    container.querySelector('[data-q="places"]').addEventListener('click', () => go('places'));
    container.querySelector('[data-q="dates"]').addEventListener('click', () => go('dates'));
    container.querySelector('[data-q="best"]').addEventListener('click', () => {
      const b = bestSite();
      setPlans([{ ...plan, label: `${shortName(app.site)} (your plan)` }, { site: b, startMs: app.windowStartMs, label: shortName(b) }]);
    });
    container.querySelector('[data-q="resume"]')?.addEventListener('click', () => go('result'));
    return;
  }

  // ---------------------------------------------------------------- places
  if (app.cmpView === 'places') {
    head('Compare places', `All on the same touchdown date: ${dShort(app.windowStartMs)}.`);
    const inList = app.sites.some((s) => s.id === app.site.id);
    const opts = (sel) => `${inList ? '' : `<option value="__current" ${sel === '__current' ? 'selected' : ''}>${esc(app.site.name)} (current)</option>`}${app.sites.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}`;
    const b = bestSite();
    container.innerHTML = `<div class="cp">
      <div class="cp-row"><span class="cp-tag" style="--c:#2997ff">A</span><label>First place<select data-p="a">${opts(inList ? app.site.id : '__current')}</select></label></div>
      <div class="cp-vs">vs</div>
      <div class="cp-row"><span class="cp-tag" style="--c:#ff9f0a">B</span><label>Second place<select data-p="b">${opts(b?.id)}</select></label></div>
      <div class="cp-row cp-c" hidden><span class="cp-tag" style="--c:#30d158">C</span><label>Third place (optional)<select data-p="c"><option value="">None</option>${app.sites.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label></div>
      <button type="button" class="cp-add" data-add3>${icon('plus', 15)} Add a third place</button>
      <p class="cp-note">Touchdown for all: <b>${dLong(app.windowStartMs)}</b>, over the next ${app.windowDays} days. Change the date in the planner’s Date step, or compare launch dates instead.</p>
      <div class="cp-acts"><button type="button" class="cl-btn" data-back>${icon('chevronLeft', 15)} Back</button><button type="button" class="cl-btn is-primary cp-go" data-cpgo>Compare ${icon('chevronRight', 15)}</button></div>
    </div>`;
    const siteOf = (v) => (v === '__current' ? app.site : app.sites.find((s) => s.id === v));
    container.querySelector('[data-add3]').addEventListener('click', (e) => { container.querySelector('.cp-c').hidden = false; e.currentTarget.hidden = true; });
    container.querySelector('[data-back]').addEventListener('click', () => go('start'));
    container.querySelector("[data-cpgo]").addEventListener('click', () => {
      const picks = ['a', 'b', 'c'].map((k) => siteOf(container.querySelector(`[data-p="${k}"]`).value)).filter(Boolean);
      const uniq = picks.filter((s, i) => picks.findIndex((x) => x.id === s.id && x.lat === s.lat && x.lon === s.lon) === i);
      if (uniq.length < 2) { container.querySelector('.cp-note').innerHTML = `<b class="cp-warn">Pick two different places.</b>`; return; }
      setPlans(uniq.map((s) => ({ site: s, startMs: app.windowStartMs, label: shortName(s) })));
    });
    return;
  }

  // ---------------------------------------------------------------- dates
  if (app.cmpView === 'dates') {
    const site = app.cmpDatesSite || app.site;
    head('When should we launch?', `${site.name}: every launch day for the next year.`);
    const inList = app.sites.some((s) => s.id === site.id);
    container.innerHTML = `<div class="cd2">
      <div class="cd2-top"><label>Site <select data-ds>${inList ? '' : `<option value="__current" selected>${esc(site.name)}</option>`}${app.sites.map((s) => `<option value="${esc(s.id)}" ${s.id === site.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <p>Each bar is one launch day. Taller = more of the 30 days after touchdown with <b>sunlight and Earth in view together</b> (power and radio). Tap a bar to pick that day.</p></div>
      <div class="cd2-chart" data-chart><div class="cd2-busy"><span class="w-spinner" style="width:16px;height:16px;border-width:2px"></span> Working out a year of launch days…</div></div>
      <p class="cd2-tip" data-tip aria-live="polite"></p>
      <div class="cd2-best" data-best></div>
      <div class="cp-acts"><button type="button" class="cl-btn" data-back>${icon('chevronLeft', 15)} Back</button>
        <button type="button" class="cl-btn" data-openday disabled>${icon('arrowUpRight', 15)} Open this date in the planner</button>
        <button type="button" class="cl-btn is-primary" data-cmpday disabled>Compare with my plan ${icon('chevronRight', 15)}</button></div>
    </div>`;
    container.querySelector('[data-back]').addEventListener('click', () => go('start'));
    container.querySelector('[data-ds]').addEventListener('change', (e) => { app.cmpDatesSite = e.target.value === '__current' ? app.site : app.sites.find((s) => s.id === e.target.value); rerender(); });
    let picked = null, data = null;
    const tip = container.querySelector('[data-tip]');
    const describe = (d, i) => `${dLong(d.ms)}${i === 0 ? ' (your plan)' : ''}: ${pct(d.both)} of the next 30 days with sunlight and Earth together (sunlight ${pct(d.sun)}, Earth ${pct(d.earth)}).`;
    const pick = (i) => {
      picked = i;
      container.querySelectorAll('.cd2-bar.is-pick').forEach((r) => r.classList.remove('is-pick'));
      container.querySelector(`.cd2-bar[data-i="${i}"]`)?.classList.add('is-pick');
      tip.textContent = describe(data[i], i);
      container.querySelector('[data-cmpday]').disabled = i === 0;
      container.querySelector('[data-openday]').disabled = false;
    };
    container.querySelector('[data-openday]').addEventListener('click', () => { if (picked != null) onOpen({ site, startMs: data[picked].ms, windowDays: 30 }); });
    container.querySelector('[data-cmpday]').addEventListener('click', () => {
      if (picked == null || picked === 0) return;
      const nm = shortName(site);
      setPlans([{ site, startMs: data[0].ms, label: `${nm} · ${dShort(data[0].ms)}` }, { site, startMs: data[picked].ms, label: `${nm} · ${dShort(data[picked].ms)}` }]);
    });
    setTimeout(() => {
      const key = `${site.lat},${site.lon}|${app.windowStartMs}|${JSON.stringify(app.config)}`;
      if (seriesCache.key !== key) seriesCache = { key, data: launchDateSeries(site, app.windowStartMs, 365, app.config, { windowDays: 30 }) };
      data = seriesCache.data;
      if (!container.querySelector('[data-chart]')) return;
      const W = 1000, H = 240, bw = W / data.length;
      const bestI = data.reduce((bi, d, i) => (d.both > data[bi].both ? i : bi), 0);
      const col = (b) => (b >= 0.45 ? 'g' : b >= 0.2 ? 'a' : 'r');
      let months = '';
      data.forEach((d, i) => { const dt = new Date(d.ms); if (dt.getUTCDate() === 1 || i === 0) months += `<text x="${(i * bw).toFixed(1)}" y="${H + 18}">${dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</text>`; });
      container.querySelector('[data-chart]').innerHTML = `<svg viewBox="0 0 ${W} ${H + 24}" preserveAspectRatio="none" role="img" aria-label="Share of time with sunlight and Earth together for each launch day over a year">
        ${[0.25, 0.5].map((g) => `<line x1="0" x2="${W}" y1="${H - g * H}" y2="${H - g * H}" class="cd2-grid"/><text x="${W - 2}" y="${H - g * H - 4}" class="cd2-gl" text-anchor="end">${g * 100}%</text>`).join('')}
        ${data.map((d, i) => `<rect class="cd2-bar ${col(d.both)}${i === 0 ? ' is-plan' : ''}${i === bestI ? ' is-best' : ''}" data-i="${i}" x="${(i * bw + 0.15).toFixed(2)}" width="${Math.max(0.6, bw - 0.3).toFixed(2)}" y="${(H - Math.max(0.01, d.both) * H).toFixed(1)}" height="${(Math.max(0.01, d.both) * H).toFixed(1)}"/>`).join('')}
        <g class="cd2-months">${months}</g></svg>
        <div class="cd2-legend"><span><i class="g"></i>45%+ power and radio together</span><span><i class="a"></i>20–45%</span><span><i class="r"></i>under 20%</span><span><i class="plan"></i>your plan</span><span><i class="best"></i>best day</span></div>`;
      const svg = container.querySelector('[data-chart] svg');
      const idxAt = (e) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(data.length - 1, Math.floor(((e.clientX - r.left) / r.width) * data.length))); };
      svg.addEventListener('pointermove', (e) => { const i = idxAt(e); tip.textContent = describe(data[i], i); });
      svg.addEventListener('pointerleave', () => { tip.textContent = picked != null ? describe(data[picked], picked) : ''; });
      svg.addEventListener('click', (e) => pick(idxAt(e)));
      // The three best launch days, at least a week apart.
      const order = data.map((d, i) => i).sort((a, b) => data[b].both - data[a].both);
      const top = [];
      for (const i of order) { if (top.every((j) => Math.abs(j - i) >= 7)) top.push(i); if (top.length === 3) break; }
      container.querySelector('[data-best]').innerHTML = `<b>Best launch days</b>${top.map((i) => `<button type="button" data-top="${i}">${dShort(data[i].ms)} · ${pct(data[i].both)}</button>`).join('')}<span class="cd2-plan">Your plan (${dShort(data[0].ms)}): <b>${pct(data[0].both)}</b></span>`;
      container.querySelectorAll('[data-top]').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.top))));
      pick(bestI);
    }, 30);
    return;
  }

  // ---------------------------------------------------------------- result
  head('Which plan works best?', 'The answer first; tap “See full details” for everything else.');
  const all = app.scenarios;
  assignColors(all);
  let shown = (app.cmpShow || []).map((id) => all.find((s) => s.id === id)).filter(Boolean);
  if (shown.length < 2) { shown = all.slice(0, 3); app.cmpShow = shown.map((s) => s.id); }
  const ranked = [...shown].sort((a, b) => scoreOf(b) - scoreOf(a));
  const win = ranked[0], second = ranked[1];
  const hero = METRICS[0];
  const pts = Math.round(hero.get(win) * 100) - Math.round(hero.get(second) * 100);

  // One plain sentence first.
  let sentence;
  if (pts >= 2) {
    sentence = `<b style="--c:${win.color}" class="ch-name">${esc(win.label)}</b> gives the lander power and radio together <b class="up">${pts} points more often</b> than ${shown.length > 2 ? 'the next best, ' : ''}<b style="--c:${second.color}" class="ch-name">${esc(second.label)}</b> (${pct(hero.get(win))} vs ${pct(hero.get(second))} of the time).`;
  } else {
    const diffs = METRICS.slice(1).filter((m) => differs(m, m.get(win), m.get(second)));
    sentence = `<b>${esc(win.label)}</b> and <b>${esc(second.label)}</b> are <b>about the same</b> for power and radio together (${pct(hero.get(win))} vs ${pct(hero.get(second))}).${diffs.length ? ` The real difference is ${diffs.slice(0, 2).map((m) => m.label.toLowerCase()).join(' and ')}.` : ' They are close on every measure.'}`;
  }

  // Why the winner wins / where the others are better.
  const reasons = (a, others) => METRICS.filter((m) => others.every((o) => differs(m, m.get(a), m.get(o)) && better(m, m.get(a), m.get(o))))
    .map((m) => `<li>${REASON[m.key]}: <b>${val(m, a)}</b> vs ${others.map((o) => val(m, o)).join(' / ')}</li>`);
  const winWhy = reasons(win, shown.filter((s) => s !== win));
  const otherWhy = shown.filter((s) => s !== win).map((o) => ({ o, r: METRICS.filter((m) => differs(m, m.get(o), m.get(win)) && better(m, m.get(o), m.get(win))).map((m) => `<li>${REASON[m.key]}: <b>${val(m, o)}</b> vs ${val(m, win)}</li>`) }));

  // Measures that differ (or all of them).
  const rows = METRICS.filter((m) => app.cmpShowAll || shown.some((a) => shown.some((b) => a !== b && differs(m, m.get(a), m.get(b)))));
  const hidden = METRICS.length - rows.length;
  const table = rows.map((m) => {
    const vals = shown.map((s) => m.get(s));
    const top = m.unit === 'pct' ? 1 : Math.max(1e-9, ...vals);
    const bestV = m.better === 'high' ? Math.max(...vals) : Math.min(...vals);
    const same = !shown.some((a) => shown.some((b) => a !== b && differs(m, m.get(a), m.get(b))));
    return `<div class="cr-row" style="--n:${shown.length}"><div class="cr-label"><b>${m.label}</b><small>${m.better === 'high' ? 'Higher is better' : 'Lower is better'}</small></div>
      ${shown.map((s, i) => `<div class="cr-cell${!same && vals[i] === bestV ? ' is-best' : ''}" style="--c:${s.color}"><span class="cr-who"><i></i>${esc(s.label)}</span><span class="cr-v">${val(m, s)}${!same && vals[i] === bestV ? ` ${icon('check', 13)}` : ''}</span><span class="cr-bar"><span style="width:${Math.max(2, (vals[i] / top) * 100).toFixed(1)}%"></span></span></div>`).join('')}</div>`;
  }).join('');

  const chips = all.length > 2
    ? `<div class="ch-chips"><span>In this comparison:</span>${all.map((s) => `<button type="button" data-chip="${s.id}" class="${shown.includes(s) ? 'is-on' : ''}" style="--c:${s.color}"><i></i>${esc(s.label)}</button>`).join('')}<small>Tap to show up to three side by side.</small></div>`
    : '';

  container.innerHTML = `
    ${chips}
    <div class="ch-verdict"><span class="cv-ico">${icon('trophy', 24)}</span><p>${sentence}</p></div>
    <div class="ch-cols" style="--n:${shown.length}">${shown.map((s) => {
      const v = verdict(s);
      return `<div class="ch-col${s === win ? ' is-win' : ''}" style="--c:${s.color}">
        <div class="cc-top">${s === win ? `<span class="ch-crown">${icon('trophy', 14)} Best</span>` : '<span></span>'}<span class="cc-acts">
          <button type="button" data-open="${s.id}" title="Open in planner" aria-label="Open ${esc(s.label)} in the planner">${icon('arrowUpRight', 15)}</button>
          ${all.length > 2 ? `<button type="button" data-rm="${s.id}" title="Remove" aria-label="Remove ${esc(s.label)}">${icon('x', 15)}</button>` : ''}</span></div>
        <h4>${esc(s.label)}</h4><p class="cc-sub">Touchdown ${dShort(s.startMs)} · ${s.windowDays} days</p>
        <div class="ch-big"><b>${pct(hero.get(s))}</b><span>of the time with<br>power and radio</span></div>
        <span class="cc-badge ${v.cls}">${v.text}</span>
      </div>`;
    }).join('')}</div>
    <div class="ch-reasons">
      <div class="ch-why"><h4>${icon('check', 16)} Why ${esc(win.label)} comes out on top</h4>${winWhy.length ? `<ul>${winWhy.join('')}</ul>` : '<p>It edges ahead overall, but no single measure is clearly better.</p>'}</div>
      ${otherWhy.map(({ o, r }) => `<div class="ch-why is-other" style="--c:${o.color}"><h4>Where ${esc(o.label)} is better</h4>${r.length ? `<ul>${r.join('')}</ul>` : `<p>Nowhere: ${esc(win.label)} is as good or better on every measure.</p>`}</div>`).join('')}
    </div>
    <div class="ch-diff"><div class="ch-diff-head"><h3>${app.cmpShowAll ? 'All measures' : 'What’s different'}</h3>
      <label class="ch-toggle"><input type="checkbox" data-all ${app.cmpShowAll ? 'checked' : ''}> Show all ${METRICS.length} measures${!app.cmpShowAll && hidden ? ` (${hidden} are about the same)` : ''}</label></div>
      ${table || '<p class="ch-same">These plans are about the same on every measure.</p>'}</div>
    <div class="ch-acts">
      <label class="ch-add">${icon('plus', 15)}<select data-addsite aria-label="Add another place"><option value="">Add another place…</option>${app.sites.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
      <button type="button" class="cl-btn" data-open="${win.id}">${icon('arrowUpRight', 15)} Open the winner in the planner</button>
    </div>
    <details class="cl-more" ${app.cmpDetailsOpen ? 'open' : ''}><summary>See full details: every measure as a chart, day by day, the full table and CSV export</summary><div class="cl-more-body"></div></details>`;

  container.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { const sc = all.find((x) => x.id === b.dataset.open); if (sc) onOpen(sc); }));
  container.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    app.scenarios = app.scenarios.filter((x) => x.id !== b.dataset.rm);
    app.cmpShow = (app.cmpShow || []).filter((id) => id !== b.dataset.rm);
    setCount(); rerender();
  }));
  container.querySelectorAll('[data-chip]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.chip;
    let ids = shown.map((s) => s.id);
    if (ids.includes(id)) { if (ids.length > 2) ids = ids.filter((x) => x !== id); } else { ids.push(id); if (ids.length > 3) ids.shift(); }
    app.cmpShow = ids; rerender();
  }));
  container.querySelector('[data-all]').addEventListener('change', (e) => { app.cmpShowAll = e.target.checked; rerender(); });
  container.querySelector('[data-addsite]').addEventListener('change', (e) => {
    const s = app.sites.find((x) => x.id === e.target.value);
    if (!s) return;
    const sc = addScenario(app, s, win.startMs, shortName(s));
    app.cmpShow = [...shown.map((x) => x.id).filter((x) => x !== sc.id), sc.id].slice(-3);
    setCount(); rerender();
  });
  const more = container.querySelector('.cl-more');
  const fillMore = () => renderCompareLab(more.querySelector('.cl-more-body'), app, onOpen, addScenario, { details: true, onChange: rerender });
  if (more.open) fillMore();
  more.addEventListener('toggle', () => { app.cmpDetailsOpen = more.open; if (more.open) fillMore(); });
}
