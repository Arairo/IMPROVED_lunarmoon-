// The "Flight" view: plan the trip from the launch pad to the plan's touchdown.
// Pick a route (Direct / Phasing loops / Low-energy), the launch site and the
// lander; see the dated timeline, every burn, the fuel, a side-by-side of the
// three routes and the lighting/radio checks at touchdown, and watch it fly.

import { flightTimeline } from './flightPacing.js';
import { planFlight, compareRoutes, flightPath, phaseTimes, touchdownChecks, siteDirection, moonState, ROUTES, LAUNCH_SITES, LANDERS, R_E, R_M, FLOWN_FLIGHTS } from '../core/flight.js';
import { evaluate } from '../core/analysis.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DAY = 86400000;
const when = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
const dayOnly = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dur = (ms) => { const d = ms / DAY; return d >= 2 ? `${d.toFixed(d >= 20 ? 0 : 1)} days` : d >= 1 / 24 ? `${(d * 24).toFixed(1)} h` : `${Math.round(d * 1440)} min`; };
const kms = (v) => `${(v * 1000).toFixed(0)} m/s`;
const kg = (v) => `${Math.round(v).toLocaleString('en-GB')} kg`;
const PHASE_CSS = { launch: '#93c5fd', parking: '#93c5fd', loops: '#93c5fd', ascent: '#93c5fd', coast: '#fbbf24', orbit: '#22d3ee', descent: '#4ade80' };
const KEY = 'lsp.flight';

export function mountFlight({ app, viewTabs, switchSubView, setTime }) {
  const host = document.getElementById('globeViewport')?.parentElement;
  if (!host || !viewTabs) return null;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const opts = { route: 'direct', launchSite: 'ksc', lander: 'small', ...saved };
  let plan = null, path = null, scene = null, planKey = '', tab = 'timeline';
  let playing = false, speed = 1, u = 0, idx = 0, last = 0, timeline = null, fast = false;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'xp-viewtab';
  btn.dataset.x = 'flight';
  btn.title = 'Plan and watch the flight from launch to touchdown';
  btn.innerHTML = `${icon('rocket', 14)} <span>Flight</span>`;
  viewTabs.insertBefore(btn, viewTabs.querySelector('[data-x="layers"]'));
  btn.addEventListener('click', () => switchSubView('flight'));

  const pane = document.createElement('div');
  pane.id = 'flightViewport';
  pane.className = 'absolute inset-0 hidden xp-flight';
  pane.innerHTML = `
    <canvas class="fl-canvas" aria-label="3D view of the flight from Earth to the Moon"></canvas>
    <aside class="fl-side" aria-label="Flight plan"></aside>
    <div class="fl-caption" aria-live="polite"></div>
    <div class="fl-bar">
      <button type="button" class="fl-play" data-f="play" aria-label="Play">${icon('play', 18)}</button>
      <div class="fl-track"><div class="fl-phases"></div><input type="range" min="0" max="1000" value="0" aria-label="Flight time" data-f="scrub"></div>
      <div class="fl-ctrl">
        <button type="button" data-f="speed" title="Playback speed">1×</button>
        <button type="button" data-f="follow" class="is-on" title="Camera follows the spacecraft">Follow</button>
      </div>
    </div>`;
  host.appendChild(pane);
  const side = pane.querySelector('.fl-side');
  const cap = pane.querySelector('.fl-caption');
  const scrub = pane.querySelector('[data-f="scrub"]');

  const touchdown = () => app.windowStartMs;
  const evalAt = (ms) => evaluate(ms, app.ctx, app.config, { withDsn: false });

  function compute() {
    planKey = `${app.site?.id}|${app.site?.lat}|${app.site?.lon}|${touchdown()}|${JSON.stringify(opts)}`;
    plan = planFlight(touchdown(), opts);
    plan.site = { lat: app.site.lat, lon: app.site.lon, name: app.site.short || app.site.name };
    plan.siteDir = siteDirection(app.site.lat, app.site.lon, plan.touchdownMs);
    path = flightPath(plan, 0, phaseTimes(plan, 160));
    timeline = flightTimeline(plan, { scale: 1.5 });
    app.flight = { plan, opts: { ...opts } };
    try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch {}
  }

  function stats(p) {
    return `<div class="fl-stats">
      <div><small>Launch</small><b>${dayOnly(p.launchMs)}</b><span>${new Date(p.launchMs).toISOString().slice(11, 16)} UTC from ${esc(p.launchSite.short)}</span></div>
      <div><small>Door to door</small><b>${dur(p.touchdownMs - p.launchMs)}</b><span>to touchdown ${dayOnly(p.touchdownMs)}</span></div>
      <div><small>Lander’s speed changes</small><b>${(p.landerDv).toFixed(2)} km/s</b><span>Δv the lander does itself</span></div>
      <div><small>Lander fuel</small><b>${kg(p.propKg)}</b><span>for ${kg(p.lander.dryKg)} dry, incl. 5% reserve</span></div>
    </div>`;
  }

  function tabBody() {
    if (tab === 'timeline') {
      return `<ol class="fl-time">${plan.events.map((e) => `<li><b>${esc(e.label)}</b><span>${when(e.t)} UTC</span><small>${e.t === plan.touchdownMs ? 'your plan’s touchdown' : `T − ${dur(plan.touchdownMs - e.t)}`}</small></li>`).join('')}</ol>
        <p class="fl-dim">Phases: ${plan.phases.map((p) => `${esc(p.label)} (${dur(p.end - p.start)})`).join(' → ')}.</p>`;
    }
    if (tab === 'burns') {
      return `<table class="fl-table"><tr><th>Burn</th><th>Δv</th><th>Who</th></tr>
        ${plan.burns.map((b) => `<tr><td>${esc(b.label)}<br><small>${when(b.t)} UTC</small></td><td>${kms(b.dv)}</td><td>${b.byLander ? 'Lander' : 'Rocket'}</td></tr>`).join('')}
        <tr class="fl-sum"><td>Lander total</td><td>${kms(plan.landerDv)}</td><td></td></tr></table>
        <p class="fl-dim">Fuel from the rocket equation: ${kg(plan.lander.dryKg)} dry, engine Isp ${plan.lander.isp} s, plus 5% reserve. Arrives at the Moon at ${kms(plan.vinf)} relative to it${plan.raKm ? `; the coast reaches ${Math.round(plan.raKm).toLocaleString('en-GB')} km from Earth at its farthest` : ''}.</p>
        <p class="fl-dim">Launch site: ${esc(plan.launchSite.short)} is at ${Math.abs(plan.launchGeom.latDeg).toFixed(1)}° ${plan.launchGeom.latDeg >= 0 ? 'N' : 'S'}; the Moon is at ${plan.launchGeom.moonDecDeg.toFixed(0)}° declination, so the parking orbit is tilted ${plan.launchGeom.inclDeg.toFixed(0)}° and Earth’s spin gives ${kms(plan.launchGeom.spinBoostKms)} for free. ${plan.route === 'phasing' ? '' : 'Lift-off is timed for when Earth’s rotation carries the pad under that orbit, which is why the launch time changes with the site (good to a few hours: Apollo 11’s comes out 2 h late).'}</p>`;
    }
    if (tab === 'compare') {
      const all = compareRoutes(touchdown(), { lander: opts.lander, launchSite: opts.launchSite });
      const best = (f) => all.reduce((a, b) => (f(b) < f(a) ? b : a));
      const fastest = best((p) => p.touchdownMs - p.launchMs), leanest = best((p) => p.propKg);
      return `<p class="fl-dim">Same lander, same touchdown, three ways to get there:</p>
        <div class="fl-cmp">${all.map((p) => `<button type="button" data-route="${p.route}" class="${p.route === opts.route ? 'is-on' : ''}">
          <b>${esc(p.routeInfo.label)}</b><i>${esc(p.routeInfo.tagline)}</i>
          <span><small>Launch</small>${dayOnly(p.launchMs)}</span>
          <span><small>Trip</small>${dur(p.touchdownMs - p.launchMs)}${p === fastest ? ' <em>fastest</em>' : ''}</span>
          <span><small>Lander Δv</small>${p.landerDv.toFixed(2)} km/s</span>
          <span><small>Fuel</small>${kg(p.propKg)}${p === leanest ? ' <em>least</em>' : ''}</span>
          <span><small>Like</small>${esc(p.routeInfo.like)}</span></button>`).join('')}</div>
        <p class="fl-dim">Direct asks the rocket for the big push and the lander for a hard stop at the Moon. Phasing loops let the lander do many small pushes near Earth, where they work best. Low-energy lets the Sun bend the path, so the lander arrives slowly and brakes least, but it takes months.</p>`;
    }
    const checks = touchdownChecks(plan, evalAt);
    return `<ul class="fl-checks">${checks.map((c) => `<li class="${c.ok ? 'ok' : c.warn ? 'warn' : 'bad'}"><b>${esc(c.title)}</b><span>${esc(c.text)}</span></li>`).join('')}</ul>`;
  }

  function renderSide() {
    const R = ROUTES[opts.route];
    side.innerHTML = `
      <div class="fl-head"><b>Flight to ${esc(plan.site.name)}</b><small>Touchdown ${when(plan.touchdownMs)} UTC, from your plan. Change it in the Date step.</small></div>
      <div class="fl-routes" role="group" aria-label="Route">${Object.values(ROUTES).map((r) => `<button type="button" data-route="${r.id}" class="${r.id === opts.route ? 'is-on' : ''}" aria-pressed="${r.id === opts.route}"><b>${esc(r.label)}</b><small>${esc(r.tagline)}</small></button>`).join('')}</div>
      <p class="fl-blurb">${esc(R.blurb)} <span>Flown like this: ${esc(R.like)}.</span></p>
      <div class="fl-row">
        <label>Launch from<select data-o="launchSite">${LAUNCH_SITES.map((s) => `<option value="${s.id}" ${s.id === opts.launchSite ? 'selected' : ''}>${esc(s.short)}</option>`).join('')}</select></label>
        <label>Lander<select data-o="lander">${LANDERS.map((l) => `<option value="${l.id}" ${l.id === opts.lander ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>
      </div>
      <details class="fl-tune"><summary>Fine-tune the route</summary>
        ${opts.route !== 'lowenergy' ? `<label>Coast to the Moon <output>${plan.params.coastDays.toFixed(1)} days</output><input type="range" min="3" max="4.9" step="0.1" value="${plan.params.coastDays}" data-o="coastDays"></label>` : ''}
        ${opts.route === 'phasing' ? `<label>Loops around Earth <output>${Math.round(plan.params.earthDays)} days</output><input type="range" min="8" max="30" step="1" value="${plan.params.earthDays}" data-o="earthDays"></label>` : ''}
        ${opts.route === 'lowenergy' ? `<label>Long route <output>${Math.round(plan.params.transferDays)} days</output><input type="range" min="70" max="130" step="5" value="${plan.params.transferDays}" data-o="transferDays"></label>` : ''}
        <label>Time in lunar orbit <output>${plan.params.lunarOrbitDays.toFixed(1)} days</output><input type="range" min="0.5" max="${opts.route === 'direct' ? 5 : 30}" step="0.5" value="${plan.params.lunarOrbitDays}" data-o="lunarOrbitDays"></label>
        <button type="button" class="fl-link" data-f="reset">Back to the typical values</button>
      </details>
      ${stats(plan)}
      <div class="fl-tabs" role="tablist">${[['timeline', 'Timeline'], ['burns', 'Burns and fuel'], ['compare', 'Compare routes'], ['checks', 'At touchdown']].map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}" class="${k === tab ? 'is-on' : ''}">${t}</button>`).join('')}</div>
      <div class="fl-body">${tabBody()}</div>
      <p class="fl-note">${icon('info', 13)} A planning model (two-body “patched conics”), good to hours and tens of m/s, not for navigation. The launch site sets where the flight starts on the globe; it does not change the numbers. Checked against Apollo 11’s burns and ${FLOWN_FLIGHTS.length} flown timelines in the automated tests.</p>`;
    side.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', () => { opts.route = b.dataset.route; delete opts.coastDays; delete opts.earthDays; delete opts.transferDays; delete opts.lunarOrbitDays; refresh(true); }));
    side.querySelectorAll('select[data-o]').forEach((s) => s.addEventListener('change', () => { opts[s.dataset.o] = s.value; refresh(true); }));
    side.querySelectorAll('input[data-o]').forEach((s) => {
      s.addEventListener('input', () => { s.previousElementSibling.textContent = `${Number(s.value).toFixed(s.step < 1 ? 1 : 0)} days`; });
      s.addEventListener('change', () => { opts[s.dataset.o] = Number(s.value); refresh(true, true); });
    });
    side.querySelector('[data-f="reset"]')?.addEventListener('click', () => { delete opts.coastDays; delete opts.earthDays; delete opts.transferDays; delete opts.lunarOrbitDays; refresh(true); });
    side.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderSide(); }));
    if (side.dataset.tuneOpen === '1') side.querySelector('.fl-tune').open = true;
    side.querySelector('.fl-tune')?.addEventListener('toggle', (e) => { side.dataset.tuneOpen = e.target.open ? '1' : '0'; });
  }

  function renderPhases() {
    pane.querySelector('.fl-phases').innerHTML = plan.phases.map((p, k) => `<span style="--c:${PHASE_CSS[p.id] || '#fff'};width:${((timeline.slots[k].end - timeline.slots[k].start) * 100).toFixed(2)}%" title="${esc(p.label)}: ${dur(p.end - p.start)}"><i></i><em>${esc(p.label.split(',')[0].split(':')[0])}</em></span>`).join('');
  }

  function caption() {
    const s = path[idx];
    const ph = plan.phases.find((p) => s.t >= p.start && s.t <= p.end) || plan.phases.at(-1);
    const elapsed = (s.t - plan.launchMs) / DAY;
    let where;
    if (s.near === 'moon') {
      const mc = moonState(s.t).r;
      const alt = Math.hypot(s.pos[0] - mc[0], s.pos[1] - mc[1], s.pos[2] - mc[2]) - R_M;
      where = alt < 1 ? 'on the surface' : `${alt.toFixed(alt < 20 ? 1 : 0)} km above the Moon`;
    } else {
      const r = Math.hypot(...s.pos);
      where = r - R_E < 2000 ? `${Math.round(r - R_E)} km above Earth` : `${Math.round(r).toLocaleString('en-GB')} km from Earth`;
    }
    const done = idx >= path.length - 1;
    cap.innerHTML = done
      ? `<b>Touchdown at ${esc(plan.site.name)}</b><span>${when(plan.touchdownMs)} UTC · ${dur(plan.touchdownMs - plan.launchMs)} after launch</span><button type="button" data-f="site">${icon('globe', 14)} See the landing site</button>`
      : `<b>${esc(ph.label)}${fast ? ' · fast-forward' : ''}</b><span>Day ${elapsed.toFixed(elapsed < 2 ? 2 : 1)} · ${when(s.t)} UTC · ${where}</span>`;
    cap.querySelector('[data-f="site"]')?.addEventListener('click', () => {
      setTime(plan.touchdownMs, false);
      switchSubView('globe');
      window.dispatchEvent(new CustomEvent('lsp-fly-site'));
    });
  }

  // The scrubber is not time-true (a 1-hour descent would vanish): each phase gets
  // its own screen time and the playback rate eases between them (flightPacing.js).
  const timeAt = (x) => timeline.timeAt(x);
  function indexAt(t) {
    let lo = 0, hi = path.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (path[mid].t < t) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function goto(x) {
    u = Math.max(0, Math.min(1, x));
    idx = u >= 1 ? path.length - 1 : indexAt(timeAt(u));
    fast = playing && timeline.isFastForward(u); // only while playing; a paused or scrubbed frame shows the craft
    scene?.setFastForward(fast);
    scene?.setIndex(idx);
    scrub.value = String(Math.round(u * 1000));
    caption();
  }

  async function ensureScene() {
    if (scene) return;
    const { createFlightScene } = await import('../scene/flightScene.js');
    scene = createFlightScene(pane.querySelector('.fl-canvas'), { onHint: () => pane.querySelector('[data-f="follow"]')?.classList.remove('is-on') });
  }

  async function refresh(force = false, keepPos = false) {
    if (!app.site || !app.ctx) return;
    const key = `${app.site?.id}|${app.site?.lat}|${app.site?.lon}|${touchdown()}|${JSON.stringify(opts)}`;
    if (!force && key === planKey && plan) return;
    const frac = keepPos && path ? u : 0;
    compute();
    renderSide();
    renderPhases();
    await ensureScene();
    scene.setPlan(plan, path);
    goto(frac);
  }

  function loop(ts) {
    if (!playing) return;
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    goto(u + (dt * speed) / timeline.duration);
    if (u >= 1) { stop(); return; }
    requestAnimationFrame(loop);
  }
  const playBtn = pane.querySelector('[data-f="play"]');
  function start() { if (u >= 1) goto(0); playing = true; last = 0; playBtn.innerHTML = icon('pause', 18); playBtn.setAttribute('aria-label', 'Pause'); requestAnimationFrame(loop); }
  function stop() { playing = false; if (path) goto(u); playBtn.innerHTML = icon('play', 18); playBtn.setAttribute('aria-label', 'Play'); }
  playBtn.addEventListener('click', () => (playing ? stop() : start()));
  scrub.addEventListener('input', () => { stop(); goto(Number(scrub.value) / 1000); });
  pane.querySelector('[data-f="speed"]').addEventListener('click', (e) => { speed = speed === 1 ? 3 : speed === 3 ? 0.4 : 1; e.currentTarget.textContent = `${speed}×`; });
  pane.querySelector('[data-f="follow"]').addEventListener('click', (e) => { const on = !e.currentTarget.classList.contains('is-on'); e.currentTarget.classList.toggle('is-on', on); scene?.setFollow(on); });

  window.addEventListener('lsp-view', (e) => {
    const on = e.detail === 'flight';
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    if (on) refresh().then(() => scene?.render());
    else stop();
  });
  // Keep in step with the plan (new site or touchdown date) while the view is open.
  window.addEventListener('lsp-time', () => { if (!pane.classList.contains('hidden')) refresh(); });

  return {
    open: () => switchSubView('flight'),
    get plan() { return plan; },
    /** Pick a route (or keep the current one) and return the plan for it. */
    setRoute(route) {
      if (route && ROUTES[route] && route !== opts.route) { opts.route = route; delete opts.coastDays; delete opts.earthDays; delete opts.transferDays; delete opts.lunarOrbitDays; }
      if (!app.site || !app.ctx) return null;
      compute();
      refresh(true);
      return plan;
    },
  };
}
