// Beginner mode: "Mission: Land on the Moon". Six short chapters with Lumi:
//   Brief → Find the sunny spot (a guessing game on real NASA lighting data)
//   → Pick a day (forecast calendar) → Fly (launch and land, in 3D)
//   → Survive 30 days (power and radio meters, stars) → Mission badge.
// Every number comes from the same engine as Professional mode (src/core).

import { prepareSite, scanWindow } from '../core/analysis.js';
import { horizonAt } from '../core/horizon.js';
import { SYNODIC_MONTH_DAYS, clamp } from '../core/constants.js';
import { esc, fmtHours } from '../ui/format.js';
import { setLumi } from './lumi.js';
import { play, syncSoundLabels } from './sound.js';
import { findNextWindow } from '../core/planning.js';
import { createCalendar } from './calendar.js';
import { icon } from './icons.js';
import { planFlight, flightPath, phaseTimes, siteDirection, ROUTES } from '../core/flight.js';
import { flightTimeline } from './flightPacing.js';
import { hasWebGL, showNoWebGL, noScene } from '../ui/webgl.js';
import { evaluate } from '../core/analysis.js';
import { moonFixedState } from '../core/ephemeris.js';
const moonThumbs = () => import('../scene/moonThumb.js');
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const DAY = 86400000;
const R = 1737400;
const DEG = Math.PI / 180;
const BASE = `${import.meta.env?.BASE_URL ?? "/"}data`;

const FEATURED = [
  { id: 'ridge', title: 'The sunny ridge', blurb: 'A high rim beside Shackleton crater at the south pole.', tag: 'South pole · high ground', art: 'linear-gradient(160deg,#ffb300 0%,#ff7a00 35%,#1b2130 36%,#0b0f17 100%)' },
  { id: 'shackleton', title: 'Inside a deep crater', blurb: 'The floor of Shackleton crater, 4 km deep.', tag: 'South pole · crater floor', art: 'radial-gradient(circle at 50% 120%,#0b0f17 45%,#3a3f4b 46%,#1b2130 70%,#070a12 100%)' },
  { id: 'a11', title: 'Apollo 11', blurb: 'Where people first walked on the Moon, near the equator.', tag: 'Equator · 1969', art: 'linear-gradient(180deg,#070a12 0%,#070a12 40%,#8e93a0 41%,#5a606e 100%)' },
  { id: 'ce4', title: 'The far side', blurb: 'Chang’e 4’s landing spot, on the side that faces away from us.', tag: 'Far side · China', art: 'radial-gradient(circle at 80% 20%,#ffb300 0 8%,transparent 9%),linear-gradient(180deg,#070a12 55%,#4a4f5c 56%)' },
];
const CHAPTERS = ['Brief', 'Sunny spot', 'Pick a day', 'Fly', 'Survive', 'Badge'];
const ROUTE_KID = {
  direct: { name: 'Fast and thirsty', line: 'Straight there in about 5 days, like Apollo 11. Needs a big braking burn at the Moon.' },
  phasing: { name: 'Patient and thrifty', line: 'Loops around Earth for weeks, a little higher each time, like Chandrayaan-3.' },
  lowenergy: { name: 'The long way round', line: 'Swings out 1.5 million km and lets the Sun steer it back, like Japan’s SLIM. Takes months, uses the least fuel to stop.' },
};

export const RULES_NOTE = 'These traffic lights use our own rules of thumb, not an official NASA standard. Power: red if the Sun is down at landing; amber if it sets within 7 days or part of it is hidden; otherwise green. Earth: red if Earth’s centre is behind the terrain; amber if it sets within 3 days or sits less than 2° above the skyline; otherwise green.';

function nextChange(arr, times, idx = 0) {
  const cur = !!arr[idx];
  for (let i = idx + 1; i < arr.length; i++) if (!!arr[i] !== cur) return times[i];
  return null;
}

export function verdicts(scan) {
  const s = scan.series, t0 = s.times[0];
  const sunUp = s.lit[0] === 1;
  const sunSet = sunUp ? nextChange(s.lit, s.times) : null;
  const fullDisk = s.sunFrac[0] >= 0.99;
  const power = !sunUp ? 'red' : (sunSet && sunSet - t0 < 7 * DAY) || !fullDisk ? 'amber' : 'green';
  const earthUp = s.los[0] === 1;
  const earthSet = earthUp ? nextChange(s.los, s.times) : null;
  const earth = !earthUp ? 'red' : (earthSet && earthSet - t0 < 3 * DAY) || s.earthClear[0] < 2 ? 'amber' : 'green';
  const overall = power === 'red' || earth === 'red' ? 'red' : power === 'amber' || earth === 'amber' ? 'amber' : 'green';
  const nextSunrise = sunUp ? null : nextChange(s.lit, s.times);
  const nextEarthrise = earthUp ? null : nextChange(s.los, s.times);
  return { power, earth, overall, sunSet, earthSet, nextSunrise, nextEarthrise, t0 };
}

/** Stars for surviving the 30 days: share of the time with sunlight and Earth together. */
export function missionStars(scan) {
  const s = scan.series;
  let both = 0;
  for (let i = 0; i < s.times.length; i++) if (s.lit[i] === 1 && s.los[i] === 1) both++;
  const f = both / s.times.length;
  return { both: f, stars: f >= 0.45 ? 3 : f >= 0.2 ? 2 : f > 0.02 ? 1 : 0 };
}

/** Stars for the sunny-spot guess, compared with the best spot on the map. */
export function guessStars(value, best) {
  const r = best > 0 ? value / best : 0;
  return r >= 0.8 ? 3 : r >= 0.5 ? 2 : r > 0.1 ? 1 : 0;
}

const LIGHT = { green: ['GO', '✓'], amber: ['GO WITH CARE', '!'], red: ['NO GO', '✕'] };
const inDays = (ms, t0) => {
  if (!ms) return 'not in the next 30 days';
  const d = (ms - t0) / DAY;
  return d < 2 ? `${Math.max(1, Math.round(d * 24))} hours` : `${d.toFixed(1)} days`;
};
const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtWhen = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
const starRow = (n, size = 26) => `<span class="w-stars" aria-label="${n} of 3 stars">${[0, 1, 2].map((k) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="${k < n ? 'on' : ''}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`).join('')}</span>`;

function skyline(ctx, scan) {
  const s = scan.series;
  let maxEl = 8;
  for (let i = 0; i < s.times.length; i++) maxEl = Math.max(maxEl, s.sunEl[i], s.earthEl[i]);
  const W = 900, H = 300, top = 26, bottom = 250;
  const yMin = -8, yMax = clamp(Math.ceil(maxEl + 4), 12, 92);
  const x = (az) => ((((az % 360) + 360) % 360) / 360) * W;
  const y = (el) => bottom - ((clamp(el, yMin, yMax) - yMin) / (yMax - yMin)) * (bottom - top);
  let ground = `M0 ${H} `, edge = '';
  for (let k = 0; k <= 360; k += 2) {
    const pt = `${((k / 360) * W).toFixed(1)} ${y(horizonAt(ctx.horizon, k % 360)).toFixed(1)}`;
    ground += `L${pt} `; edge += `${k ? 'L' : 'M'}${pt} `;
  }
  ground += `L${W} ${H} Z`;
  let trails = '';
  for (let i = 0; i < s.times.length; i += 3) {
    trails += `<circle cx="${x(s.sunAz[i]).toFixed(1)}" cy="${y(s.sunEl[i]).toFixed(1)}" r="1.6" class="trail-sun"/>`;
    trails += `<circle cx="${x(s.earthAz[i]).toFixed(1)}" cy="${y(s.earthEl[i]).toFixed(1)}" r="1.6" class="trail-earth"/>`;
  }
  const compass = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, az]) => `<text x="${x(az) + 6}" y="${H - 14}" class="lbl">${l}</text><line x1="${x(az)}" x2="${x(az)}" y1="${H - 30}" y2="${H - 22}" stroke="#8e93a0"/>`).join('');
  const svg = `<svg class="w-sky" viewBox="0 0 ${W} ${H}" role="img" aria-label="360 degree skyline with the Sun and Earth">
    <defs><radialGradient id="wSunGlow"><stop offset="0" stop-color="#ffb300" stop-opacity="0.75"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" class="sky"/>
    <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="lvl"/>
    <text x="8" y="${y(0) - 6}" class="lbl">level (0°)</text>
    ${trails}
    <circle data-b="sunglow" r="34" fill="url(#wSunGlow)" class="body"/>
    <circle data-b="sun" r="11" fill="#ffb300" class="body"/>
    <circle data-b="earth" r="9" fill="#38bdf8" stroke="#bfe9ff" stroke-width="1.5" class="body"/>
    <path d="${ground}" class="ground"/><path d="${edge}" class="ground-edge"/>
    <text data-b="sunlbl" class="tag">Sun</text><text data-b="earthlbl" class="tag">Earth</text>
    ${compass}
    <text x="${W - 8}" y="18" class="lbl" text-anchor="end">Height stretched to show detail</text>
  </svg>`;
  const place = (root, i) => {
    const set = (k, attrs) => { const el = root.querySelector(`[data-b="${k}"]`); if (el) for (const a in attrs) el.setAttribute(a, attrs[a]); };
    const sx = x(s.sunAz[i]), sy = y(s.sunEl[i]), ex = x(s.earthAz[i]), ey = y(s.earthEl[i]);
    const sunHidden = s.lit[i] !== 1, earthHidden = s.los[i] !== 1;
    set('sun', { cx: sx, cy: sy, opacity: sunHidden ? 0.35 : 1 });
    set('sunglow', { cx: sx, cy: sy, opacity: sunHidden ? 0 : 1 });
    set('earth', { cx: ex, cy: ey, opacity: earthHidden ? 0.35 : 1 });
    set('sunlbl', { x: Math.min(W - 70, sx + 14), y: sy - 14 });
    set('earthlbl', { x: Math.min(W - 70, ex + 12), y: ey - 12 });
    root.querySelector('[data-b="sunlbl"]').textContent = sunHidden ? 'Sun (hidden)' : 'Sun';
    root.querySelector('[data-b="earthlbl"]').textContent = earthHidden ? 'Earth (hidden)' : 'Earth';
  };
  return { svg, place };
}

// ---- South-pole lighting map for the sunny-spot game -----------------------
let illumCache = null;
async function loadIllum() {
  if (illumCache) return illumCache;
  const [illum, img] = await Promise.all([
    fetch(`${BASE}/sp_illum_2027.json`).then((r) => r.json()),
    new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `${BASE}/sp_wac_450m.jpg`; }),
  ]);
  illumCache = { illum, img };
  return illumCache;
}
const IMG_HALF = 460000;
const toLatLon = (x, y) => { const rho = Math.hypot(x, y); return { lat: -(90 - (2 * Math.atan(rho / (2 * R))) / DEG), lon: Math.atan2(x, y) / DEG }; };
function illumAt(il, x, y) {
  const n = il.size, half = il.halfExtent, cell = il.cellSize;
  const c = Math.floor((x + half) / cell), r = Math.floor((half - y) / cell);
  if (c < 0 || r < 0 || c >= n || r >= n) return null;
  return il.illum[r * n + c] / il.scale;
}

export function createWalk({ app, sites, onOpenPro, onToggleTheme, onToggleSound }) {
  const st = {
    step: 0, visited: 0, name: '', site: null, startMs: Date.UTC(2026, 10, 16, 22), ctx: null, scan: null, v: null, idx: 0, playing: false,
    guess: null, route: 'direct', flight: null, landed: false, slips: null, readAloud: false,
  };
  try { st.name = localStorage.getItem('lsp.plannerName') || ''; } catch {}
  // Progress is kept in this browser, so a refresh carries on where you were.
  const SAVE_KEY = 'lsp.walk';
  const save = () => {
    try {
      const s = st.site;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        step: st.step, visited: st.visited, startMs: st.startMs, route: st.route, landed: st.landed, guess: st.guess,
        site: s && (String(s.id).startsWith('custom') ? { id: s.id, name: s.name, short: s.short, lat: s.lat, lon: s.lon, group: 'custom' } : { id: s.id }),
      }));
    } catch {}
  };
  const restore = () => {
    try {
      const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!v || !(v.step > 0)) return 0;
      const site = v.site?.group === 'custom' ? v.site : sites.find((x) => x.id === v.site?.id);
      Object.assign(st, { visited: v.visited || 0, startMs: v.startMs || st.startMs, route: v.route || 'direct', guess: v.guess || null });
      if (site) st.site = site;
      return site ? Math.min(v.step, 4) : Math.min(v.step, 1); // the Survive chapter recomputes, so land there at most
    } catch { return 0; }
  };
  const root = document.createElement('section');
  root.id = 'xp-walk';
  root.className = 'w-story';
  root.setAttribute('aria-label', 'Beginner mode: Mission, land on the Moon');
  root.innerHTML = `
    <div class="w-top">
      <div class="w-brand"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="8" r="2.5" fill="#ffb300"/></svg> Mission: Land on the Moon</div>
      <nav class="w-path" aria-label="Mission chapters"></nav>
      <button type="button" class="xp-chip xp-icon-btn" data-a="read" aria-pressed="false" title="Read each step aloud" aria-label="Read aloud">${icon('speech', 16)}</button>
      <button type="button" class="xp-chip xp-icon-btn" data-a="sound" data-sound-label aria-label="Mute sounds" title="Sound on / off"></button>
      <button type="button" class="xp-chip xp-icon-btn" data-a="theme" data-theme-label aria-label="Switch light or dark mode" title="Light / dark"></button>
      <button type="button" class="xp-chip" data-a="pro">Professional mode</button>
    </div>
    <div class="w-main"><div class="w-scene"></div></div>
    <div class="w-dock"><div class="w-dock-inner">
      <button type="button" class="xp-btn xp-btn-ghost" data-a="back">Back</button>
      <button type="button" class="xp-btn xp-btn-primary" data-a="next">Continue</button>
    </div></div>`;
  document.body.appendChild(root);

  const scene = root.querySelector('.w-scene');
  const nextBtn = root.querySelector('[data-a="next"]');
  const backBtn = root.querySelector('[data-a="back"]');
  const readBtn = root.querySelector('[data-a="read"]');
  root.querySelector('[data-a="pro"]').addEventListener('click', () => onOpenPro(st.site, st.startMs, false));
  root.querySelector('[data-a="theme"]').addEventListener('click', onToggleTheme);
  root.querySelector('[data-a="sound"]').addEventListener('click', () => onToggleSound?.());
  syncSoundLabels();
  backBtn.addEventListener('click', () => go(st.step - 1));
  nextBtn.addEventListener('click', () => (STEPS[st.step].next ? STEPS[st.step].next() : go(st.step + 1)));
  if (!('speechSynthesis' in window)) readBtn.hidden = true;
  readBtn.addEventListener('click', () => {
    st.readAloud = !st.readAloud;
    readBtn.setAttribute('aria-pressed', String(st.readAloud));
    readBtn.classList.toggle('is-on', st.readAloud);
    if (st.readAloud) speak(); else window.speechSynthesis?.cancel();
  });
  function speak() {
    if (!st.readAloud || !window.speechSynthesis) return;
    const say = scene.querySelector('.w-say');
    if (!say) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(say.innerText.replace(/\s+/g, ' '));
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }

  const why = (title, html) => `<details class="w-why"><summary><span>›</span> ${title}</summary><div class="why-body">${html}</div></details>`;
  const say = (h, ...ps) => `<div class="w-say"><h2>${h}</h2>${ps.map((p) => `<p>${p}</p>`).join('')}</div>`;

  function compute(done) {
    setTimeout(() => {
      st.ctx = prepareSite(st.site, null, app.config);
      st.scan = scanWindow(st.ctx, st.startMs, 30, app.config);
      st.v = verdicts(st.scan);
      st.idx = 0;
      st.slips = null;
      done?.();
    }, 30);
  }
  function setSite(site) {
    st.site = site;
    st.scan = null; st.flight = null; st.landed = false;
    nextBtn.disabled = !st.site;
  }

  // ------------------------------------------------------------------ chapters
  const STEPS = [
    // 0 · Brief
    {
      mood: 'happy',
      render: () => `<div class="w-hero">
          <svg class="w-hero-art" viewBox="0 0 600 170" aria-hidden="true">
            <defs><radialGradient id="wE" cx=".35" cy=".35"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#1d4ed8"/></radialGradient><radialGradient id="wM" cx=".35" cy=".35"><stop offset="0" stop-color="#e5e7eb"/><stop offset="1" stop-color="#6b7280"/></radialGradient></defs>
            <path d="M70 120 C 220 -20, 400 -10, 540 95" fill="none" stroke="#fbbf24" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" class="w-hero-trail"/>
            <circle cx="70" cy="120" r="42" fill="url(#wE)"/><circle cx="540" cy="100" r="24" fill="url(#wM)"/>
            <g class="w-hero-rocket">${rocketSvg()}</g>
          </svg>
          ${say('Mission: Land on the Moon', 'You’re the mission planner. Your job: land a robot on the Moon and keep it alive for a month.', 'It needs two things. <b>Sunlight</b> for its solar panels, and <b>Earth in view</b> so it can call home by radio. Six short steps, and I’ll help with each one.')}
          <label class="w-name">What should we call you, planner?<input type="text" maxlength="28" placeholder="Your name (optional)" value="${esc(st.name)}" data-name autocomplete="nickname"></label>
          ${why('Why is everyone going to the Moon’s south pole?', 'Craters near the south pole hold ice that has stayed frozen for billions of years: water for drinking, air and rocket fuel. But the Sun there never climbs high, and Earth sits right on the horizon. That makes power and radio contact tricky, and that’s exactly what you’re about to plan for.')}
        </div>`,
      bind: () => scene.querySelector('[data-name]').addEventListener('input', (e) => { st.name = e.target.value.trim(); try { localStorage.setItem('lsp.plannerName', st.name); } catch {} }),
      cta: 'Start the mission',
    },
    // 1 · Find the sunny spot
    {
      mood: () => (st.guess ? (st.guess.stars >= 2 ? 'happy' : 'think') : 'think'),
      reaction: () => (st.guess?.stars === 3 ? 'cheer' : 'hop'),
      render: () => {
        const g = st.guess;
        const result = !g ? '' : `<div class="w-guess ${g.stars >= 2 ? 'good' : ''}">${starRow(g.stars)}
            <div><b>${g.value > 0 ? `Your spot gets sunlight ${Math.round(g.value * 100)}% of the year.` : 'Your spot is in permanent shadow!'}</b>
            <span>${g.stars === 3 ? 'Brilliant: you found one of the best-lit places on the Moon.' : g.stars === 2 ? 'Good eye! The very best spot nearby gets ' + Math.round(g.best * 100) + '%.' : g.value > 0 ? `The best spot nearby gets ${Math.round(g.best * 100)}%. High ridges win; crater floors lose.` : 'Crater floors here never see the Sun. Great for ice, terrible for solar panels.'}</span></div></div>`;
        return `${say(g ? 'Here’s the real sunlight map.' : 'Find the sunny spot.', g ? 'Bright = lots of sunlight in 2027. Dark = little or none. Where do you want to land?' : 'This is the area around the Moon’s south pole, 150 km across. Tap where you think the Sun shines the longest.')}
          <div class="w-content"><div class="w-game">
            <div class="w-mapbox"><canvas class="w-map" width="520" height="520" aria-label="South-pole map: tap to guess the sunniest spot"></canvas>
              <div class="w-map-hint">${g ? '' : 'Tap the map'}</div>
              <div class="w-demo" hidden aria-hidden="true"><svg class="w-cursor" viewBox="0 0 24 24" width="34" height="34"><path d="M4 2l15 9.5-6.6 1.4 3.7 7.3-2.9 1.4-3.6-7.3L4 19z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg><span class="w-ripple"></span><span class="w-demo-tag"></span></div>
              <div class="w-where" hidden><canvas class="w-where-moon" aria-label="Where this landing site is on the Moon"></canvas><div class="w-where-cap"></div><button type="button" class="w-link" data-a="map">Show the sunlight map again</button></div></div>
            <div class="w-game-side">${result}
              ${g ? `<div class="w-landopts">
                  <button type="button" class="w-opt ${st.landPick === 'guess' && st.site ? 'is-picked' : ''}" data-land="guess"><b>Land at my spot</b><span>${g.value > 0 ? `${Math.round(g.value * 100)}% sunlight in 2027` : 'Brave: no sunlight at all'}</span></button>
                  <button type="button" class="w-opt ${st.landPick === 'best' && st.site ? 'is-picked' : ''}" data-land="best"><b>Land at the sunniest spot</b><span>${Math.round(g.best * 100)}% sunlight, on a ridge</span></button>
                </div>
                <p class="w-note">Or pick a famous place:</p>
                <div class="w-cards w-cards-sm">${FEATURED.map((f) => `<button type="button" class="w-card ${st.site?.id === f.id ? 'is-picked' : ''}" data-site="${f.id}"><div class="c-art" style="background:${f.art}"></div><h3>${f.title}</h3><span class="c-tag">${f.tag}</span></button>`).join('')}</div>
                <button type="button" class="w-link" data-a="retry">Guess again</button>`
                : `<div class="w-legend-wait">${icon('sun', 20)}<span>The Sun at the pole never climbs high. It circles the horizon, so <b>height</b> matters more than anything.</span></div>`}
            </div></div>
            ${why('Where does this map come from?', 'The picture is NASA’s Lunar Reconnaissance Orbiter camera mosaic. The sunlight colours are our own calculation from NASA LOLA laser-altimeter heights: for every 1 km square, how often the Sun is above the hills during 2027. NASA Goddard publishes a similar map, and ours matches its pattern closely.')}</div>`;
      },
      bind: () => bindGame(),
      ready: () => !!st.site,
      cta: 'This is where we land',
    },
    // 2 · Pick a day
    {
      mood: 'happy',
      render: () => `${say('When do we touch down?', `We’re landing at <b>${esc(st.site.name)}</b>. Pick a day, like checking a weather forecast. A lunar day lasts about a month, so the date really matters.`)}
        <div class="w-content"><p class="w-picked" data-picked hidden></p><div class="w-forecast"><div class="w-calbox"><b>Moon forecast</b><span>For <b>${esc(st.site.short || st.site.name)}</b>, landing at this time of day.</span><div data-cal></div></div>
          <div class="w-fc-key">
            <div class="w-daymoon"><canvas aria-label="The Moon on this day: where sunlight falls, with your landing spot"></canvas>
              <div class="w-daymoon-cap" aria-live="polite"></div>
              <button type="button" class="xp-btn xp-btn-ghost" data-a="playMonth">${icon('play', 15)} Play the month</button></div>
            <div><i class="g">${icon('sun', 18)}${icon('globe', 18)}</i><b>Sun and Earth</b><span>Power and radio together for 3+ days. Perfect.</span></div>
            <div><i class="a">${icon('sun', 18)}</i><b>Sun only</b><span>Power, but Earth hides behind the hills.</span></div>
            <div><i class="r">${icon('moon', 18)}</i><b>Night</b><span>No sunlight at touchdown.</span></div>
            <button type="button" class="xp-btn xp-btn-ghost" data-a="findDate">${icon('sparkles', 16)} Find the next perfect day</button>
            <p class="w-note" data-find-out aria-live="polite"></p>
            <p class="w-note" data-local>Touchdown: ${fmtDate(st.startMs)}</p>
          </div></div></div>`,
      bind: () => {
        // Start on the next perfect day, so a mission isn't doomed by the default date.
        if (st.dayPickedFor !== st.site.id) {
          st.dayPickedFor = st.site.id;
          const res = findNextWindow(st.site, Date.now(), app.config, { minDays: 3 });
          const pickedEl = scene.querySelector('[data-picked]');
          if (res) {
            st.startMs = res.ms; st.scan = null; st.flight = null;
            pickedEl.innerHTML = `${icon('sparkles', 16)} I picked the next perfect day for you: <b>${fmtDate(res.ms)}</b>. Tap any other day to experiment.`;
          } else {
            pickedEl.innerHTML = `${icon('moon', 16)} No day in the next year has sunlight and Earth together for 3 days here. Try it anyway, or go back and pick a sunnier spot.`;
          }
          pickedEl.hidden = false;
        }
        const ctx = prepareSite(st.site, null, app.config);
        const moonCanvas = scene.querySelector('.w-daymoon canvas'), moonCap = scene.querySelector('.w-daymoon-cap');
        let thumbs = null, playing = false;
        const polar = st.site.lat < -60;
        const drawMoon = (ms) => {
          if (!thumbs || !moonCanvas.isConnected) return;
          const state = moonFixedState(ms);
          const e = evaluate(ms, ctx, app.config, { withDsn: false });
          const sun = e.sun.fraction > 0, earth = e.earth.los;
          const col = sun && earth ? '#22c55e' : sun ? '#f59e0b' : '#ef4444';
          const view = polar ? { lat: -90, lon: 0, dist: 4.6, earthFlat: true } : { lat: st.site.lat, lon: st.site.lon, dist: 4.4 };
          thumbs.draw(moonCanvas, { ...view, sun: state.sun, earth: polar ? state.earth : null, pins: [{ lat: st.site.lat, lon: st.site.lon, color: col, r: 6 }] });
          moonCap.innerHTML = `<b>${fmtDate(ms)}</b><span>${sun && earth ? 'Sun up and Earth in view' : sun ? 'Sun up, Earth hidden' : 'Night at your spot'}${polar ? ' · seen from below the south pole, Earth-facing side at the top' : ''}</span>`;
        };
        moonThumbs().then(({ getMoonThumbs }) => getMoonThumbs()).then((t) => { thumbs = t; drawMoon(st.startMs); });
        const onImg = () => { if (!moonCanvas.isConnected) { window.removeEventListener('lsp-moonthumb', onImg); return; } if (!playing) drawMoon(st.startMs); };
        window.addEventListener('lsp-moonthumb', onImg);
        const cal = createCalendar({ getSite: () => st.site, getConfig: () => app.config, getSelectedMs: () => st.startMs, compact: true,
          onPick: (ms) => { st.startMs = ms; st.scan = null; st.flight = null; showLocal(); drawMoon(ms); play('tick'); },
          onHover: (ms) => { if (!playing) drawMoon(ms ?? st.startMs); } });
        scene.querySelector('[data-cal]').appendChild(cal.el);
        const showLocal = () => { scene.querySelector('[data-local]').textContent = `Touchdown: ${fmtDate(st.startMs)}`; cal.refresh(); };
        cal.refresh();
        showLocal();
        scene.querySelector('[data-a="playMonth"]').addEventListener('click', (ev) => {
          if (playing) return;
          playing = true;
          const btn = ev.currentTarget; btn.disabled = true;
          const t0 = performance.now(), span = SYNODIC_MONTH_DAYS * DAY, dur = reducedMotion() ? 1 : 7000;
          const step = (now) => {
            if (!moonCanvas.isConnected) return;
            const k = Math.min(1, (now - t0) / dur);
            drawMoon(st.startMs + k * span);
            if (k < 1) requestAnimationFrame(step);
            else { playing = false; btn.disabled = false; drawMoon(st.startMs); }
          };
          requestAnimationFrame(step);
        });
        scene.querySelector('[data-a="findDate"]').addEventListener('click', () => {
          const outEl = scene.querySelector('[data-find-out]');
          const res = findNextWindow(st.site, st.startMs, app.config, { minDays: 3 });
          if (!res) {
            outEl.textContent = 'I searched the next 12 months: there is no time here with sunlight and Earth in view together for 3 days. Try another place!';
            setLumi(scene.querySelector('[data-lumi]'), 'worried', 'hop', 140);
            return;
          }
          st.startMs = res.ms; st.scan = null; st.flight = null;
          showLocal(); drawMoon(res.ms);
          outEl.textContent = `Found one: ${fmtDate(res.ms)}. Sunlight and Earth stay in view together for about ${((res.endMs - res.ms) / DAY).toFixed(0)} days.`;
          setLumi(scene.querySelector('[data-lumi]'), 'happy', 'cheer', 140);
          play('go');
        });
      },
      cta: 'Get the rocket ready',
    },
    // 3 · Fly
    {
      mood: () => (st.landed ? 'wow' : 'happy'),
      reaction: () => (st.landed ? 'cheer' : 'hop'),
      render: () => {
        const f = st.flight;
        return `${say(st.landed ? 'Touchdown!' : 'How do we get there?', st.landed ? `The lander is down at <b>${esc(st.site.short || st.site.name)}</b>. Now the real test: can it survive a month?` : 'Pick a route. Faster isn’t always better: stopping at the Moon takes fuel, and fast arrivals need the most.')}
          <div class="w-content">
            <div class="w-routes">${Object.keys(ROUTE_KID).map((r) => { const p = planFlight(st.startMs, { route: r }); return `<button type="button" class="w-opt ${st.route === r ? 'is-picked' : ''}" data-route="${r}"><b>${ROUTE_KID[r].name}</b><span>${ROUTE_KID[r].line}</span><em>${p.doorToDoorDays < 20 ? p.doorToDoorDays.toFixed(1) : Math.round(p.doorToDoorDays)} days · ${Math.round(p.propKg).toLocaleString('en-GB')} kg of fuel</em></button>`; }).join('')}</div>
            <div class="w-flybox"><canvas class="w-fly" aria-label="The flight from Earth to the Moon"></canvas>
              <div class="w-fly-cap" aria-live="polite">${f ? '' : 'Pick a route, then press Launch'}</div>
              <button type="button" class="w-recentre" data-a="recentre" hidden>${icon('rocket', 14)} Follow the spacecraft</button>
              <div class="w-count-big" aria-hidden="true"></div></div>
            <div class="w-row"><button type="button" class="xp-btn xp-btn-primary" data-a="launch">${icon('rocket', 16)} ${st.landed ? 'Fly it again' : 'Launch!'}</button>
              ${f ? `<span class="w-note">Launch ${fmtDate(f.launchMs)} from Kennedy · touchdown ${fmtDate(f.touchdownMs)}</span>` : ''}</div>
            ${why('Why do some missions take months?', 'Leaving Earth is the same for everyone, but stopping at the Moon is not. Arrive fast and you must brake hard, which burns lots of fuel. Take a long, curvy route and the Sun’s pull slows you down for free, so you arrive gently. Japan’s SLIM took 4 months; Apollo 11 took 4 days.')}
          </div>`;
      },
      bind: () => bindFlight(),
      enter: () => { if (!st.scan) compute(); },
      cta: 'See if we survive',
      ready: () => true,
    },
    // 4 · Survive 30 days
    {
      mood: () => (!st.scan ? 'think' : st.done ? (st.result.stars >= 2 ? 'happy' : 'worried') : 'think'),
      reaction: () => (st.done && st.result?.stars === 3 ? 'cheer' : 'hop'),
      render: () => {
        if (!st.scan) return `${say('Unpacking the lander…', 'Reading the real terrain around the site and working out where the Sun and Earth will be for 30 days.')}<div class="w-loading"><div class="w-spinner"></div>Calculating 30 days of sky</div>`;
        const v = st.v;
        return `${say(st.done ? (st.result.stars >= 2 ? 'Mission survived!' : st.result.stars === 1 ? 'It made it, just.' : 'The lander went quiet.') : 'Survive 30 days.', st.done ? surviveLine() : 'Press play and watch the sky. Sunlight charges the battery; Earth in view lets us talk. Keep an eye on both meters.')}
          <div class="w-content"><div class="w-panel"><div data-sky>${skyline(st.ctx, st.scan).svg}</div>
            <div class="w-meters">
              <div class="w-meter sun"><span>${icon('sun', 16)} Power</span><div class="bar"><i data-m="sun"></i></div><b data-mv="sun"></b></div>
              <div class="w-meter earth"><span>${icon('globe', 16)} Radio</span><div class="bar"><i data-m="earth"></i></div><b data-mv="earth"></b></div>
              <div class="w-meter day"><span>${icon('calendar', 16)} Day</span><b data-mv="day"></b></div>
            </div>
            <div class="w-controls"><button type="button" class="xp-btn xp-btn-primary w-play" data-a="play" aria-label="Play">${icon(st.playing ? 'pause' : 'play', 18)}</button>
              <input type="range" min="0" max="${st.scan.series.times.length - 1}" value="${st.idx}" aria-label="Time over the next 30 days"/>
              <button type="button" class="w-link" data-a="skip">Skip to the end</button></div>
            <p class="w-live" aria-live="polite"></p></div>
            ${st.done ? `<div class="w-result">${starRow(st.result.stars, 34)}
              <div class="w-chips"><span class="w-chip ${v.power}">${icon('sun', 15)} Power at landing: ${LIGHT[v.power][0]}</span><span class="w-chip ${v.earth}">${icon('globe', 15)} Radio at landing: ${LIGHT[v.earth][0]}</span></div>
              <div class="w-facts">
                <div class="w-fact"><div class="k">Sunlight</div><div class="v">${Math.round(st.scan.stats.litFraction * 100)}%</div></div>
                <div class="w-fact"><div class="k">Earth in view</div><div class="v">${Math.round(st.scan.stats.earthCentreFraction * 100)}%</div></div>
                <div class="w-fact"><div class="k">Both together</div><div class="v">${Math.round(st.result.both * 100)}%</div></div>
                <div class="w-fact"><div class="k">Longest night</div><div class="v">${fmtHours(st.scan.stats.longestDarkH)}${st.scan.stats.longestDarkOpenEnded ? '+' : ''}</div></div>
              </div></div>` : ''}
            ${why('What am I looking at?', 'Imagine standing on the lander and turning in a full circle. Left to right is the compass (north, east, south, west). Up and down is how high something is. The grey shape is the real terrain from NASA’s LOLA laser altimeter. The dotted trails show where the Sun (gold) and Earth (blue) travel this month. When a trail dips under the grey, that body is hidden.')}
            ${why('Why does the Sun behave like this?', 'The Moon’s axis is tilted only about 1.5°. Near the poles the Sun never climbs high: it circles the whole sky once every 29.5 days, just skimming the horizon, so a hill kilometres away can block it for days. Near the equator it’s simpler: about two weeks of day, then two weeks of night. Earth barely moves at all, because the Moon always keeps the same face towards us.')}
            <p class="w-note">${RULES_NOTE}</p></div>`;
      },
      enter: () => { st.done = false; st.result = null; if (!st.scan) compute(() => { if (st.step === 4) render(4); }); },
      bind: () => bindSurvive(),
      ready: () => !!st.scan,
      cta: 'Get my mission badge',
    },
    // 5 · Badge
    {
      mood: 'happy',
      reaction: 'cheer',
      render: () => {
        const res = st.result || (st.scan ? missionStars(st.scan) : { stars: 0, both: 0 });
        const f = st.flight || planFlight(st.startMs, { route: st.route });
        return `${say('Mission complete!', 'You just did what real mission planners do: chose a site, picked a date, planned the flight and checked power and radio.')}
          <div class="w-content">
            <div class="w-badge" id="wBadge">
              <div class="b-ring">${rocketSvg(54)}</div>
              <small>Lunar Site Planner · Mission planner certificate</small>
              <h3>${esc(st.name || 'Mission planner')}</h3>
              <p>landed a robot at <b>${esc(st.site.name)}</b> on <b>${fmtDate(st.startMs)}</b>, flying the ${esc(ROUTE_KID[f.route].name.toLowerCase())} route (${f.doorToDoorDays < 20 ? f.doorToDoorDays.toFixed(1) : Math.round(f.doorToDoorDays)} days).</p>
              ${starRow(res.stars, 38)}
              <div class="b-facts"><span>${icon('sun', 14)} ${st.scan ? Math.round(st.scan.stats.litFraction * 100) : '–'}% sunlight</span><span>${icon('globe', 14)} ${st.scan ? Math.round(st.scan.stats.earthCentreFraction * 100) : '–'}% Earth in view</span><span>${icon('check', 14)} ${Math.round(res.both * 100)}% both</span></div>
              <small class="b-foot">Real NASA terrain and Sun and Earth positions · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</small>
            </div>
            <div class="w-row" style="justify-content:center">
              <button type="button" class="xp-btn xp-btn-primary" data-a="print">${icon('printer', 16)} Print or save my badge</button>
              <button type="button" class="xp-btn xp-btn-ghost" data-a="openpro">Open this mission in Professional mode</button>
            </div>
            <div class="w-bonus">
              <h4>Bonus rounds</h4>
              <button type="button" class="w-opt" data-a="slip"><b>What if the rocket is late?</b><span>Rockets get delayed all the time. Check the same landing one, two and three months later.</span></button>
              <button type="button" class="w-opt" data-a="challenge"><b>Challenge: land somewhere harder</b><span>${st.site.id === 'shackleton' ? 'Try the far side, where Earth never rises.' : 'Try the floor of Shackleton crater. Can you get any stars?'}</span></button>
              <button type="button" class="w-opt" data-a="again"><b>Plan a new mission</b><span>Start again from the sunny-spot map.</span></button>
              <div data-slips></div>
            </div>
          </div>`;
      },
      bind: () => {
        scene.querySelector('[data-a="print"]').addEventListener('click', () => { document.body.classList.add('w-print-badge'); window.print(); setTimeout(() => document.body.classList.remove('w-print-badge'), 500); });
        scene.querySelector('[data-a="openpro"]').addEventListener('click', () => onOpenPro(st.site, st.startMs, true));
        scene.querySelector('[data-a="again"]').addEventListener('click', () => { st.guess = null; setSite(null); go(1); });
        scene.querySelector('[data-a="challenge"]').addEventListener('click', () => { setSite(sites.find((s) => s.id === (st.site.id === 'shackleton' ? 'ce4' : 'shackleton'))); go(4); });
        scene.querySelector('[data-a="slip"]').addEventListener('click', () => showSlips());
      },
      cta: 'New mission',
      next: () => { st.guess = null; setSite(null); go(1); },
    },
  ];

  // ---- Chapter 1: the sunny-spot game -----------------------------------------
  async function bindGame() {
    const canvas = scene.querySelector('.w-map');
    const ctx = canvas.getContext('2d');
    const { illum, img } = await loadIllum();
    if (!canvas.isConnected) return;
    const HALF = illum.halfExtent; // ±75 km
    const W = canvas.width;
    const toPx = (x, y) => [((x + HALF) / (2 * HALF)) * W, ((HALF - y) / (2 * HALF)) * W];
    const fromPx = (px, py) => [(px / W) * 2 * HALF - HALF, HALF - (py / W) * 2 * HALF];
    let best = { v: 0, x: 0, y: 0 };
    const n = illum.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const v = illum.illum[r * n + c] / illum.scale; if (v > best.v) best = { v, x: -HALF + (c + 0.5) * illum.cellSize, y: HALF - (r + 0.5) * illum.cellSize }; }
    // The illumination overlay as its own small canvas.
    const ov = document.createElement('canvas'); ov.width = n; ov.height = n;
    const oc = ov.getContext('2d'), od = oc.createImageData(n, n);
    const ramp = (v) => (v <= 0 ? [30, 27, 75, 200] : v < 0.3 ? [124, 58, 237, 150 + v * 150] : v < 0.6 ? [249, 115, 22, 170] : [253, 224, 71, 200 + v * 50]);
    for (let i = 0; i < n * n; i++) { const [rr, gg, bb, aa] = ramp(illum.illum[i] / illum.scale); od.data.set([rr, gg, bb, aa], i * 4); }
    oc.putImageData(od, 0, 0);
    function draw() {
      ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, W);
      if (img) {
        const s = img.width / (2 * IMG_HALF); // px per metre in the mosaic
        const sx = (IMG_HALF - HALF) * s, sw = 2 * HALF * s;
        ctx.drawImage(img, sx, sx, sw, sw, 0, 0, W, W);
      }
      if (st.guess) {
        ctx.globalAlpha = 0.72; ctx.imageSmoothingEnabled = true; ctx.drawImage(ov, 0, 0, W, W); ctx.globalAlpha = 1;
        const [bx, by] = toPx(best.x, best.y);
        ring(bx, by, '#4ade80', 'Sunniest');
        const [gx, gy] = toPx(st.guess.x, st.guess.y);
        ring(gx, gy, '#fbbf24', 'You');
      }
      // Scale bar and pole marker.
      const [px0, py0] = toPx(0, 0);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(px0, py0, 3, 0, 7); ctx.fill();
      ctx.font = '600 12px system-ui'; ctx.fillText('South pole', px0 + 6, py0 - 6);
      const km20 = (20000 / (2 * HALF)) * W;
      ctx.fillRect(16, W - 22, km20, 3); ctx.fillText('20 km', 16, W - 28);
    }
    function ring(x, y, col, label) {
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
      ctx.font = '700 13px system-ui'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
      ctx.strokeText(label, x + 14, y + 4); ctx.fillText(label, x + 14, y + 4);
    }
    draw();
    // A quick "commercial" demo the first time: a cursor clicks an ordinary spot.
    const demo = scene.querySelector('.w-demo');
    let demoStop = null;
    if (!st.guess && !st.demoShown && !reducedMotion()) {
      st.demoShown = true;
      let pick = null, bestD = Infinity;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const v = illum.illum[r * n + c] / illum.scale;
        if (v < 0.3 || v > 0.5) continue;
        const x = -HALF + (c + 0.5) * illum.cellSize, y = HALF - (r + 0.5) * illum.cellSize;
        const d = Math.hypot(x + 30000, y - 25000);
        if (d < bestD) { bestD = d; pick = { x, y, v }; }
      }
      if (pick) demoStop = runDemo(pick);
    }
    function runDemo(pick) {
      const box = canvas.getBoundingClientRect();
      const [tx, ty] = toPx(pick.x, pick.y).map((q) => (q / W) * box.width);
      const cur = demo.querySelector('.w-cursor'), rip = demo.querySelector('.w-ripple'), tag = demo.querySelector('.w-demo-tag');
      demo.hidden = false;
      let raf = 0, stopped = false;
      const t0 = performance.now(), sx = box.width * 0.92, sy = box.height * 0.95;
      const stop = () => { stopped = true; cancelAnimationFrame(raf); demo.hidden = true; demo.classList.remove('is-clicked'); };
      const frame = (now) => {
        if (stopped || !canvas.isConnected) return;
        const t = (now - t0) / 1000;
        const u = Math.min(1, Math.max(0, (t - 0.3) / 1.4)), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        // A curved glide, like a hand moving a mouse.
        const x = sx + (tx - sx) * e + Math.sin(e * Math.PI) * 40, y = sy + (ty - sy) * e - Math.sin(e * Math.PI) * 30;
        cur.style.transform = `translate(${x - 4}px, ${y - 2}px) scale(${t > 1.85 && t < 2.05 ? 0.82 : 1})`;
        if (t > 1.9 && !demo.classList.contains('is-clicked')) {
          demo.classList.add('is-clicked');
          rip.style.left = `${tx}px`; rip.style.top = `${ty}px`;
          tag.style.left = `${tx}px`; tag.style.top = `${ty}px`;
          tag.textContent = `This spot: ${Math.round(pick.v * 100)}% sunlight`;
          play('click');
        }
        if (t > 4.2) {
          stop();
          const hint = scene.querySelector('.w-map-hint');
          if (hint && !st.guess) { hint.textContent = 'Your turn: tap where it’s sunniest'; hint.classList.add('is-go'); }
          return;
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      return stop;
    }
    // "Where on the Moon is this?" zoom after you choose a place.
    const where = scene.querySelector('.w-where');
    scene.querySelector('[data-a="map"]')?.addEventListener('click', () => { where.hidden = true; st.whereHidden = true; });
    if (st.site && !st.whereHidden) showWhere(st.site, st.whereFor !== st.site.id);
    async function showWhere(site, animate) {
      st.whereFor = site.id;
      where.hidden = false;
      if (animate) { const r = where.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) where.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); }
      const mc = where.querySelector('canvas'), capEl = where.querySelector('.w-where-cap');
      const { getMoonThumbs, ease } = await moonThumbs();
      const m = await getMoonThumbs();
      if (!mc.isConnected) return;
      const polar = site.lat < -75;
      const label = site.short || site.name;
      const near = Math.abs(((site.lon + 540) % 360) - 180) <= 90;
      const side = site.lat < -75 ? 'where Earth skims the horizon and the Sun circles low all month' : near ? 'on the side of the Moon that faces Earth' : 'on the far side, where Earth is never in the sky';
      const band = site.lat < -75 ? 'right by the south pole' : site.lat < -50 ? 'in the southern highlands' : Math.abs(site.lat) < 25 ? 'near the Moon’s equator' : site.lat > 50 ? 'far in the north' : site.lat > 0 ? 'in the northern half' : 'in the southern half';
      capEl.innerHTML = `<b>${esc(label)}</b><span>${Math.abs(site.lat).toFixed(1)}° ${site.lat < 0 ? 'S' : 'N'}, ${Math.abs(site.lon).toFixed(1)}° ${site.lon < 0 ? 'W' : 'E'} · ${band}, ${side}.</span>`;
      const end = polar ? { lat: site.lat, lon: site.lon, dist: 1.42, fov: 26 } : { lat: site.lat, lon: site.lon, dist: 1.9, fov: 28 };
      const start = { lat: polar ? -25 : site.lat * 0.4, lon: site.lon - 70, dist: 4.6, fov: 30 };
      const upAt = (k) => { const a = new Float32Array([0, 1, 0]); if (!polar) return null; const b = [0, 0, 1]; const v = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; const l = Math.hypot(...v); return v.map((q) => q / l); };
      const frame = (k) => {
        const e = ease(k);
        const v = { lat: start.lat + (end.lat - start.lat) * e, lon: start.lon + (end.lon - start.lon) * e, dist: start.dist + (end.dist - start.dist) * e, fov: start.fov + (end.fov - start.fov) * e, up: upAt(e) };
        const pins = m.draw(mc, { ...v, pins: [{ lat: site.lat, lon: site.lon, hidden: k < 0.85, color: '#fbbf24', r: 6 }] });
        const p = pins[0];
        if (k >= 0.85 && p.front) {
          const g = mc.getContext('2d'), sc = mc.width / (mc.clientWidth || mc.width);
          g.save(); g.scale(sc, sc);
          const drop = Math.max(0, 1 - (k - 0.85) / 0.15) * 18;
          g.font = '700 14px system-ui'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.75)'; g.fillStyle = '#fff';
          g.strokeText(label, p.x + 12, p.y - 10 - drop); g.fillText(label, p.x + 12, p.y - 10 - drop);
          g.restore();
        }
      };
      if (!animate || reducedMotion()) { frame(1); return; }
      const t0 = performance.now();
      let popped = false;
      const step = (now) => {
        if (!mc.isConnected) return;
        const k = Math.min(1, (now - t0) / 2600);
        frame(k);
        if (k >= 0.85 && !popped) { popped = true; play('pop'); }
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    canvas.addEventListener('click', (e) => {
      demoStop?.();
      if (st.guess) return;
      const r = canvas.getBoundingClientRect();
      const [x, y] = fromPx(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * W);
      const value = illumAt(illum, x, y) ?? 0;
      st.guess = { x, y, value, best: best.v, stars: guessStars(value, best.v), ...toLatLon(x, y) };
      st.bestSpot = { ...toLatLon(best.x, best.y), value: best.v };
      play(st.guess.stars >= 2 ? 'go' : 'care');
      render(1);
    });
    scene.querySelectorAll('[data-land]').forEach((b) => b.addEventListener('click', () => {
      const p = b.dataset.land === 'guess' ? st.guess : st.bestSpot;
      setSite({ id: `custom-${p.lat.toFixed(3)}-${p.lon.toFixed(3)}`, name: b.dataset.land === 'guess' ? 'Your spot near the south pole' : 'The sunniest spot on the map', short: b.dataset.land === 'guess' ? 'Your spot' : 'Sunniest spot', lat: p.lat, lon: p.lon, group: 'custom' });
      st.landPick = b.dataset.land;
      st.whereHidden = false;
      render(1);
    }));
    scene.querySelectorAll('[data-site]').forEach((b) => b.addEventListener('click', () => { st.landPick = null; st.whereHidden = false; setSite(sites.find((s) => s.id === b.dataset.site)); render(1); }));
    scene.querySelector('[data-a="retry"]')?.addEventListener('click', () => { st.guess = null; setSite(null); render(1); });
  }

  // ---- Chapter 3: launch and land -----------------------------------------------
  let flyScene = null;
  async function bindFlight() {
    scene.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', () => { st.route = b.dataset.route; st.flight = null; st.landed = false; render(3); }));
    const canvas = scene.querySelector('.w-fly');
    const cap = scene.querySelector('.w-fly-cap');
    const big = scene.querySelector('.w-count-big');
    const { createFlightScene } = await import('../scene/flightScene.js');
    if (!canvas.isConnected) return;
    const gl = hasWebGL();
    if (!gl) showNoWebGL(canvas.parentElement, 'The flight');
    flyScene?.dispose?.();
    const recentre = scene.querySelector('[data-a="recentre"]');
    flyScene = !gl ? noScene() : createFlightScene(canvas, { onHint: (h) => { if (h === 'follow-off') recentre.hidden = false; } });
    recentre.addEventListener('click', () => { flyScene.setFollow(true); recentre.hidden = true; });
    const plan = planFlight(st.startMs, { route: st.route });
    plan.site = { lat: st.site.lat, lon: st.site.lon, name: st.site.short || st.site.name };
    plan.siteDir = siteDirection(st.site.lat, st.site.lon, plan.touchdownMs);
    const path = flightPath(plan, 0, phaseTimes(plan, 120));
    st.flight = plan;
    flyScene.setPlan(plan, path);
    const timeline = flightTimeline(plan);
    const idxAt = (t) => { let lo = 0, hi = path.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (path[m].t < t) lo = m + 1; else hi = m; } return lo; };
    const show = (u) => {
      const i = u >= 1 ? path.length - 1 : idxAt(timeline.timeAt(u));
      const fast = timeline.isFastForward(u);
      flyScene.setFastForward(fast);
      flyScene.setIndex(i);
      const ph = plan.phases.find((p) => path[i].t >= p.start && path[i].t <= p.end) || plan.phases.at(-1);
      const day = `day ${((path[i].t - plan.launchMs) / DAY).toFixed(1)}`;
      cap.textContent = u >= 1 ? `Touchdown at ${plan.site.name}!` : fast ? `Fast-forward: ${Math.round((ph.end - ph.start) / DAY)} days circling the Moon · ${day}` : `${ph.label} · ${day}`;
    };
    show(st.landed ? 1 : 0);
    if (!st.landed) cap.textContent = 'Ready on the launch pad';
    scene.querySelector('[data-a="launch"]').addEventListener('click', async () => {
      const btn = scene.querySelector('[data-a="launch"]');
      btn.disabled = true;
      // Start again from the pad, following the rocket, however the view was left.
      flyScene.resetView(); recentre.hidden = true; show(0); cap.textContent = 'Counting down…';
      for (const c of ['3', '2', '1', 'Liftoff!']) {
        big.textContent = c; big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
        play(c === 'Liftoff!' ? 'whoosh' : 'tick');
        await new Promise((r) => setTimeout(r, 650));
      }
      big.textContent = '';
      let u = 0, last = 0;
      const step = (ts) => {
        if (!canvas.isConnected) return;
        const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
        u = Math.min(1, u + dt / timeline.duration);
        show(u);
        if (u < 1) requestAnimationFrame(step);
        else { st.landed = true; play('go'); setTimeout(() => { if (st.step === 3) render(3); }, 900); }
      };
      requestAnimationFrame(step);
    });
  }

  // ---- Chapter 4: survive 30 days ------------------------------------------------
  function surviveLine() {
    const r = st.result, s = st.scan.stats;
    if (r.stars === 3) return `Power and radio together ${Math.round(r.both * 100)}% of the month. The team could drive, drill and send pictures home.`;
    if (r.stars === 2) return `Power and radio together ${Math.round(r.both * 100)}% of the time. It works, with careful planning around the gaps.`;
    if (r.stars === 1) return `Power and radio only overlapped ${Math.round(r.both * 100)}% of the time. Long silent spells: a tough mission.`;
    return s.litFraction === 0 ? 'No sunlight at all here this month: the battery ran flat. Great for finding ice, not for solar power.' : s.earthCentreFraction === 0 ? 'Earth never rose above the skyline, so we could never talk to it. Missions here need a relay satellite.' : 'Sunlight and Earth were never up at the same time. A very hard place to work.';
  }
  function bindSurvive() {
    if (!st.scan) return;
    const sk = skyline(st.ctx, st.scan);
    const holder = scene.querySelector('[data-sky]');
    const range = scene.querySelector('input[type=range]');
    const live = scene.querySelector('.w-live');
    const s = st.scan.series, N = s.times.length;
    const load = app.config.power.loadW;
    // Running counters for the meters.
    const sunCum = new Float32Array(N), earthCum = new Float32Array(N);
    for (let i = 0; i < N; i++) { sunCum[i] = (i ? sunCum[i - 1] : 0) + (s.lit[i] === 1 ? 1 : 0); earthCum[i] = (i ? earthCum[i - 1] : 0) + (s.los[i] === 1 ? 1 : 0); }
    const upd = () => {
      const i = st.idx;
      sk.place(holder, i);
      const sunNow = s.lit[i] === 1, earthNow = s.los[i] === 1;
      const pw = Math.min(1, s.watts[i] / Math.max(1, load * 1.5));
      scene.querySelector('[data-m="sun"]').style.width = `${(sunNow ? Math.max(0.12, pw) : 0) * 100}%`;
      scene.querySelector('[data-m="earth"]').style.width = `${earthNow ? 100 : 0}%`;
      scene.querySelector('[data-mv="sun"]').textContent = sunNow ? `${Math.round(s.watts[i])} W` : 'Night: on battery';
      scene.querySelector('[data-mv="earth"]').textContent = earthNow ? 'In touch' : 'Earth hidden';
      scene.querySelector('[data-mv="day"]').textContent = `${Math.floor((s.times[i] - s.times[0]) / DAY) + 1} of 30 · ${fmtWhen(s.times[i])}`;
      live.textContent = `So far: sunlight ${Math.round((sunCum[i] / (i + 1)) * 100)}% of the time, Earth in view ${Math.round((earthCum[i] / (i + 1)) * 100)}%.`;
    };
    const finish = () => {
      st.playing = false;
      if (st.done) return;
      st.done = true;
      st.result = missionStars(st.scan);
      play(st.result.stars >= 2 ? 'go' : st.result.stars === 1 ? 'care' : 'nogo');
      render(4);
    };
    range.addEventListener('input', () => { st.idx = Number(range.value); upd(); if (st.idx >= N - 1) finish(); });
    const playBtn = scene.querySelector('[data-a="play"]');
    let raf = 0, last = 0;
    const loop = (t) => {
      if (!st.playing || !scene.contains(range)) return;
      if (t - last > 45) {
        last = t;
        st.idx = Math.min(N - 1, st.idx + 1); range.value = st.idx; upd();
        if (st.idx >= N - 1) { finish(); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    playBtn.addEventListener('click', () => {
      st.playing = !st.playing;
      playBtn.innerHTML = icon(st.playing ? 'pause' : 'play', 18);
      if (st.playing) { if (st.idx >= N - 1) st.idx = 0; raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
    });
    scene.querySelector('[data-a="skip"]').addEventListener('click', () => { st.idx = N - 1; range.value = st.idx; upd(); finish(); });
    upd();
    if (st.playing && !st.done) raf = requestAnimationFrame(loop);
  }

  // ---- Bonus: launch slips ----------------------------------------------------------
  function showSlips() {
    const box = scene.querySelector('[data-slips]');
    box.innerHTML = '<div class="w-loading"><div class="w-spinner"></div>Checking later dates</div>';
    const rows = [];
    const run = (k) => {
      if (k > 3) {
        box.innerHTML = `<div class="w-slips">${rows.map((r) => `
          <div class="w-slip"><div><b>${r.label}</b><div class="lbl">${fmtDate(r.ms)}</div></div>
            <div><div class="lbl">Sunlight ${Math.round(r.sun * 100)}%</div><div class="bar"><i style="width:${r.sun * 100}%;background:#ffb300"></i></div></div>
            <div><div class="lbl">Earth in view ${Math.round(r.earth * 100)}%</div><div class="bar"><i style="width:${r.earth * 100}%;background:#38bdf8"></i></div></div>
            ${starRow(r.stars, 18)}</div>`).join('')}</div>
          <p class="w-note">A month changes a lot: the Sun’s path and Earth’s wobble only roughly repeat, and near the pole one degree decides whether the Sun clears a ridge.</p>`;
        return;
      }
      const ms = Math.round(st.startMs + k * SYNODIC_MONTH_DAYS * DAY);
      const ctx = st.ctx || prepareSite(st.site, null, app.config);
      const sc = scanWindow(ctx, ms, 30, app.config);
      rows.push({ label: k === 0 ? 'As planned' : `${k} month${k > 1 ? 's' : ''} late`, ms, sun: sc.stats.litFraction, earth: sc.stats.earthCentreFraction, stars: missionStars(sc).stars });
      setTimeout(() => run(k + 1), 10);
    };
    setTimeout(() => run(0), 30);
  }

  // ---- Shell ---------------------------------------------------------------------------
  function renderPath(i) {
    const nav = root.querySelector('.w-path');
    const frac = i / (CHAPTERS.length - 1);
    nav.innerHTML = `<svg class="w-path-art" viewBox="0 0 400 36" preserveAspectRatio="none" aria-hidden="true">
        <path d="M14 26 Q 200 -8 386 22" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2" stroke-dasharray="3 6"/>
        <path d="M14 26 Q 200 -8 386 22" fill="none" stroke="#fbbf24" stroke-width="2.5" pathLength="1" stroke-dasharray="${frac} 1"/>
      </svg>
      <span class="w-planet e" aria-hidden="true"></span><span class="w-planet m" aria-hidden="true"></span>
      <span class="w-rocket" style="left:calc(14px + (100% - 28px) * ${frac})" aria-hidden="true">${rocketSvg(22)}</span>
      <ol>${CHAPTERS.map((c, k) => `<li><button type="button" data-ch="${k}" class="${k === i ? 'is-on' : k <= st.visited ? 'is-done' : ''}" ${k <= st.visited && k !== i ? '' : 'disabled'} aria-current="${k === i ? 'step' : 'false'}">${k + 1}. ${c}</button></li>`).join('')}</ol>`;
    nav.querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.ch))));
  }

  function render(i) {
    const step = STEPS[i];
    const mood = typeof step.mood === 'function' ? step.mood() : step.mood;
    const reaction = typeof step.reaction === 'function' ? step.reaction() : step.reaction || 'hop';
    scene.innerHTML = `<div class="w-lumi" data-lumi></div><div>${step.render()}</div>`;
    setLumi(scene.querySelector('[data-lumi]'), mood, reaction, 140);
    step.bind?.();
    nextBtn.textContent = step.cta || 'Continue';
    nextBtn.disabled = step.ready ? !step.ready() : false;
    backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
    renderPath(i);
    speak();
  }

  function go(i) {
    if (i < 0 || i >= STEPS.length) return;
    if (i > 1 && !st.site) i = 1;
    st.playing = false;
    play('tick');
    const doIt = () => {
      st.step = i;
      st.visited = Math.max(st.visited, i);
      save();
      render(i);
      STEPS[i].enter?.();
      root.scrollTo({ top: 0, behavior: 'smooth' });
    };
    if (scene.childElementCount) {
      scene.classList.add('is-out');
      setTimeout(() => { scene.classList.remove('is-out'); doIt(); }, 260);
    } else doIt();
  }

  return {
    open() { if (!scene.childElementCount) go(restore()); },
    restart() { try { localStorage.removeItem(SAVE_KEY); } catch {} Object.assign(st, { visited: 0, site: null, guess: null, landed: false, flight: null, scan: null }); go(0); },
    root,
  };
}

function rocketSvg(size = 30) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-rocket-ico"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" fill="#fb923c" stroke="#fb923c"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" fill="#f8fafc"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/><circle cx="16" cy="8" r="1.6" fill="#38bdf8" stroke="none"/></svg>`;
}
