// Ask Lumi: a chat panel that understands typed requests and drives the
// planner. Rule-based (no AI model, works offline, no key). Every number in a
// reply is read from the engine after acting, never invented.

import { parseRequest } from './assistantParse.js';
import { findNextWindow, nudgeSite, windowStats, describeChange } from '../core/planning.js';
import { findNextTransition } from '../ui/assessment.js';
import { fmtLatLon } from '../ui/format.js';
import { lumiSvg } from './lumi.js';
import { play } from './sound.js';

const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (f) => `${Math.round(f * 100)}%`;
const when = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const inTime = (ms) => { const h = ms / 3600000; return h < 48 ? `${Math.round(h)} hours` : `${(h / 24).toFixed(1)} days`; };

const EXPLAIN = {
  libration: 'The Moon keeps the same face towards Earth, but its orbit is slightly tilted and oval, so from the surface Earth seems to wobble a few degrees back and forth over a month. That wobble is called libration. At the south pole, where Earth sits right on the horizon, it decides whether Earth peeks over the hills or hides behind them.',
  elevation: 'Elevation is how high something is above a level horizon, in degrees: 0° is level, 90° is straight up, negative means below. Near the south pole the Sun never climbs more than about 1.5° above level, so hills only a few hundred metres high can block it.',
  azimuth: 'Azimuth is the compass direction, measured from north (0°) through east (90°), south (180°) and west (270°). At the pole the Sun travels all the way round the horizon once a month.',
  horizon: 'The Moon has no atmosphere, so the horizon is simply the terrain: hills, crater rims and ridges around the site. We compute it from NASA LOLA laser-altimeter data by looking out in every direction.',
  disk: 'The Sun is a disk about half a degree wide, not a point. When it is partly behind a ridge, only part of it shines on the panels, so power drops gradually rather than switching off.',
  dte: 'Direct-to-Earth means the lander talks straight to antennas on Earth, with no relay satellite. It needs Earth’s centre above the terrain, ideally by a couple of degrees.',
  dsn: 'NASA’s Deep Space Network has three big antenna sites, in California, Spain and Australia, so at least one can usually see the Moon. A direct link also needs one of them to have the Moon above its horizon.',
  lola: 'LOLA is the Lunar Orbiter Laser Altimeter on NASA’s Lunar Reconnaissance Orbiter. It has measured the height of the Moon’s surface billions of times. We use its south-pole height maps to build each site’s skyline.',
  margin: 'Link margin is how much stronger the radio signal is than the minimum needed, in decibels. Above 0 dB the link works; a few dB extra covers pointing errors and losses.',
  pole: 'Craters at the south pole hold water ice that has been frozen for billions of years: water to drink, air to breathe and rocket fuel. But the Sun skims the horizon there and Earth bobs in and out of view, which is exactly what this planner checks.',
  shadow: 'Some crater floors near the poles never see the Sun, because the Sun never climbs above their rims. They are among the coldest places in the Solar System, which is why ice survives there, and why a lander there would get no solar power.',
  battery: 'When the Sun sets, the lander runs on its battery. The longest night in the window tells you how big the battery must be. Near the pole a ridge can stay lit for weeks while a crater a few kilometres away stays dark.',
  earthhidden: 'Earth (or the Sun) is hidden when it sits below the local skyline: the hills and crater rims around the site. Near the pole they hover just a few degrees above level, so even modest terrain can block them. Try a nearby ridge, or a few days later.',
  earthfixed: 'The Moon always shows the same face to Earth, so from any spot Earth hangs in nearly the same place in the sky. It only drifts a few degrees as the Moon wobbles (libration). On the far side, Earth never rises at all.',
  farside: 'The far side is the half of the Moon that always faces away from Earth (it is not darker: it gets just as much sunlight). Earth never rises there, so landers like Chang’e 4 need a relay satellite to talk home.',
};

export function createAssistant(api) {
  const { app, sites, selectSite, setTime, switchMode, getGlobe, compareSites, getBestSpots, actions } = api;

  const panel = document.createElement('aside');
  panel.id = 'xp-lumi';
  panel.setAttribute('aria-label', 'Ask Lumi');
  panel.innerHTML = `
    <div class="l-head"><span class="l-ava">${lumiSvg('happy', 34)}</span><div><b>Ask Lumi</b><small>Answers come from the planner’s own calculations</small></div>
      <button type="button" class="l-x" aria-label="Close Ask Lumi">✕</button></div>
    <div class="l-log" role="log" aria-live="polite"></div>
    <div class="l-chips"></div>
    <form class="l-form"><input type="text" placeholder="Try “best date at the ridge in 2027”" aria-label="Ask Lumi" autocomplete="off"/><button type="submit" aria-label="Send">↑</button></form>`;
  document.body.appendChild(panel);
  const log = panel.querySelector('.l-log');
  const chips = panel.querySelector('.l-chips');
  const input = panel.querySelector('input');

  const SUGGEST = ['Is it GO right now?', 'Best date at the ridge in 2027', 'Take me to Apollo 11', 'Compare ridge and IM-2', 'Move 1 km north', 'Why does Earth barely move?', 'Show me the Earthrise'];
  const renderChips = (list = SUGGEST) => {
    chips.innerHTML = list.map((s) => `<button type="button">${esc(s)}</button>`).join('');
    chips.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
  };

  function add(who, html, buttons = []) {
    const row = document.createElement('div');
    row.className = `l-msg ${who}`;
    row.innerHTML = `<div class="l-bub">${html}</div>`;
    if (buttons.length) {
      const bar = document.createElement('div');
      bar.className = 'l-acts';
      for (const b of buttons) {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = b.label;
        el.addEventListener('click', () => { b.run(); play('tick'); });
        bar.appendChild(el);
      }
      row.querySelector('.l-bub').appendChild(bar);
    }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  // ---- Answers built from the engine ----
  const siteName = () => esc(app.site.name);
  function statusText(focus = 'all') {
    const n = app.lastNow;
    if (!n) return 'I’m still calculating, give me a second.';
    const power = n.powerStatus === 'go' ? `<b>Power: yes.</b> The Sun is ${n.sun.clearance.toFixed(1)}° above the skyline and the panels make about ${Math.round(n.sun.watts)} W.`
      : n.powerStatus === 'marginal' ? `<b>Power: partly.</b> Only part of the Sun clears the terrain; the panels make about ${Math.round(n.sun.watts)} W, below the lander’s load.`
      : `<b>Power: no.</b> The Sun is behind the terrain (${n.sun.clearance.toFixed(1)}° below the skyline), so the lander runs on its battery.`;
    const earth = n.earth.los ? `<b>Earth: in view</b>, ${n.earth.clearance.toFixed(1)}° above the skyline${n.commsStatus === 'go' ? ', and the radio link to the Deep Space Network closes.' : n.commsStatus === 'marginal' ? ', but only just: the link is marginal.' : ', but no Deep Space Network antenna can see the Moon right now.'}`
      : `<b>Earth: hidden</b> behind the terrain (${n.earth.clearance.toFixed(1)}°), so no direct radio link.`;
    const head = `At <b>${siteName()}</b>, ${when(app.timeMs)}:`;
    if (focus === 'power') return `${head}<br>${power}`;
    if (focus === 'earth') return `${head}<br>${earth}`;
    const verdict = n.powerStatus === 'go' && n.commsStatus === 'go' ? 'GO ✅' : n.powerStatus === 'no-go' && n.commsStatus === 'no-go' ? 'NO-GO ⛔' : 'CAUTION ⚠️';
    return `${head} <b>${verdict}</b><br>${power}<br>${earth}`;
  }
  function summary30() {
    const s = windowStats(app.site, app.windowStartMs, app.config);
    return `Over the next 30 days: sunlight ${pct(s.sun)}, Earth in view ${pct(s.earth)}, both together ${pct(s.both)}.`;
  }

  function respond(q) {
    const r = parseRequest(q, sites, app.timeMs);
    switch (r.type) {
      case 'help':
        return add('lumi', 'Hi! I can move around the Moon, find good landing dates, compare sites and explain what’s going on. Try one of these, or just type a site name:');
      case 'goto': {
        if (r.date !== null) { app.windowStartMs = app.timeMs = r.date; }
        selectSite(r.site, true);
        return add('lumi', `Here’s <b>${siteName()}</b> (${fmtLatLon(app.site.lat, app.site.lon)}).<br>${statusText()}<br>${summary30()}`,
          [{ label: 'Find a good date here', run: () => ask(`best date at ${r.site.short || r.site.name}`) }, { label: 'Earthrise view', run: () => ask('show me the earthrise') }]);
      }
      case 'gotoCoords': {
        selectSite({ id: `custom-${r.lat.toFixed(2)},${r.lon.toFixed(2)}`, name: `Custom point ${fmtLatLon(r.lat, r.lon, 2)}`, short: 'Custom point', lat: r.lat, lon: r.lon, group: 'computed' }, true);
        return add('lumi', `I’ve dropped a pin at ${fmtLatLon(r.lat, r.lon, 2)}.<br>${statusText()}<br>${summary30()}`);
      }
      case 'gotoDate':
        setTime(r.ms, true);
        return add('lumi', `Time set to ${when(r.ms)}.<br>${statusText()}`);
      case 'bestDate': {
        const site = r.site || app.site;
        if (r.site && r.site.id !== app.site.id) selectSite(r.site, true);
        const from = r.from ?? app.timeMs;
        const res = findNextWindow(site, from, app.config, { minDays: r.minDays });
        if (!res) return add('lumi', `I searched 12 months from ${day(from)} at <b>${esc(site.name)}</b>: there is no time with the Sun and Earth up together for ${r.minDays} day${r.minDays > 1 ? 's' : ''}. ${site.lat < -85 ? 'Crater floors near the pole can stay dark for years; try a ridge.' : 'Try a shorter stay or another site.'}`,
          [{ label: 'Show me the best spot instead', run: () => ask('best spot') }]);
        const lasts = ((res.endMs - res.ms) / DAY).toFixed(1);
        return add('lumi', `Earliest landing at <b>${esc(site.name)}</b> from ${day(from)} with the Sun and Earth up together for ${r.minDays}+ days:<br><b>${when(res.ms)}</b>, lasting ${lasts} days.`,
          [{ label: 'Go there', run: () => { setTime(res.ms, true); add('lumi', `Done. ${statusText()}`); } },
           { label: 'Compare with +1 month', run: () => { setTime(res.ms, true); actions.slipCompare?.(); add('lumi', 'Opened the comparison: as planned, +1, +2 and +3 lunar months.'); } }]);
      }
      case 'bestSpot': {
        const spots = getBestSpots();
        if (!spots.length) return add('lumi', 'I’m still searching the candidate sites. Ask me again in a few seconds!');
        const sp = (r.flown && spots.find((s) => s.title.includes('flown'))) || spots[0];
        const others = spots.filter((s) => s !== sp).map((s) => `${s.title}: ${esc(s.r.site.name)} (${pct(s.r.ops)})`).join('<br>');
        return add('lumi', `<b>${sp.title}</b> for the next 30 days: <b>${esc(sp.r.site.name)}</b>, with the Sun and Earth up together ${pct(sp.r.ops)} of the time (sunlight ${pct(sp.r.sun)}, Earth ${pct(sp.r.earth)}).${others ? `<br>${others}` : ''}`,
          [{ label: 'Go there', run: () => { selectSite(sp.r.site, true); add('lumi', `Here it is. ${statusText()}`); } },
           { label: 'Compare them', run: () => compareSites([app.site, ...spots.map((s) => s.r.site)]) }]);
      }
      case 'compare': {
        if (r.slip) { actions.slipCompare?.(); return add('lumi', `Comparing <b>${siteName()}</b> as planned and 1, 2 and 3 lunar months later.`); }
        const list = r.sites.length === 1 ? [app.site, r.sites[0]] : r.sites;
        if (list.length < 2) return add('lumi', 'Tell me which sites to compare, for example “compare ridge and IM-2”.');
        compareSites(list);
        return add('lumi', `Side by side: ${list.map((s) => `<b>${esc(s.short || s.name)}</b>`).join(' vs ')}, same window starting ${day(app.windowStartMs)}.`);
      }
      case 'nudge': {
        const before = windowStats(app.site, app.windowStartMs, app.config);
        const from = app.site;
        const moved = nudgeSite(from, r.dir, r.km);
        getGlobe()?.setGhost?.(from.lat, from.lon);
        selectSite(moved, false);
        const word = { N: 'north', S: 'south', E: 'east', W: 'west' }[r.dir];
        return add('lumi', describeChange(`Moved ${r.km} km ${word}`, before, windowStats(app.site, app.windowStartMs, app.config)),
          [{ label: 'Go back', run: () => { selectSite(from, false); getGlobe()?.setGhost?.(null); add('lumi', `Back at ${esc(from.name)}.`); } }]);
      }
      case 'shiftDays': {
        const before = windowStats(app.site, app.windowStartMs, app.config);
        setTime(app.windowStartMs + r.days * DAY, true);
        return add('lumi', describeChange(`${Math.abs(r.days)} day${Math.abs(r.days) > 1 ? 's' : ''} ${r.days > 0 ? 'later' : 'earlier'}`, before, windowStats(app.site, app.windowStartMs, app.config)));
      }
      case 'when': {
        const s = app.scan?.series;
        if (!s) return add('lumi', 'Give me a second, still calculating.');
        const isSun = r.what === 'sunset';
        const up = isSun ? app.lastNow.sun.fraction > 0 : app.lastNow.earth.los;
        const t = findNextTransition(isSun ? s.lit : s.los, s.times, app.timeMs, app.scan);
        const thing = isSun ? 'The Sun' : 'Earth';
        if (!t) return add('lumi', `${thing} ${up ? 'stays up' : 'stays down'} for the rest of this ${Math.round((app.scan.endMs - app.scan.startMs) / DAY)}-day window at ${siteName()}.`);
        return add('lumi', `${thing} ${up ? (isSun ? 'sets' : 'sets below the skyline') : 'comes back up'} in <b>${inTime(t - app.timeMs)}</b> (${when(t)}) at ${siteName()}.`);
      }
      case 'status':
        return add('lumi', `${statusText(r.focus)}<br>${summary30()}`);
      case 'explain':
        return add('lumi', EXPLAIN[r.term] || 'Good question! I don’t have a good answer for that one yet.');
      case 'look':
        actions.look?.(r.body);
        return add('lumi', r.body === 'earth' ? 'Standing behind the lander, looking towards Earth across the real horizon. The dotted lines link the best spots to Earth.' : 'Standing behind the lander, looking towards the Sun across the real horizon.');
      case 'theme': actions.theme?.(r.value); return add('lumi', `Switched to ${r.value} mode.`);
      case 'tour': close(); actions.tour?.(); return undefined;
      case 'beginner': close(); actions.beginner?.(); return undefined;
      case 'terrain': actions.terrain?.(); return add('lumi', 'Opening the Terrain 3D view on this site and date.');
      case 'play': actions.play?.(r.on); return add('lumi', r.on ? 'Playing: watch the Sun circle the sky.' : 'Paused.');
      default:
        return add('lumi', 'I didn’t catch that. I can go to a site (“Apollo 11”), find dates (“best date at the ridge in 2027”), compare (“compare ridge and IM-2”), nudge (“move 1 km north”) or explain things (“what is libration?”).');
    }
  }

  function ask(q) {
    const text = String(q).trim();
    if (!text) return;
    add('you', esc(text));
    try { respond(text); } catch (e) { add('lumi', 'Oops, something went wrong working that out. Try asking another way.'); console.error(e); }
    input.value = '';
  }

  panel.querySelector('.l-form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  panel.querySelector('.l-x').addEventListener('click', () => close());
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  let greeted = false;
  function open() {
    panel.classList.add('is-open');
    if (!greeted) {
      greeted = true;
      add('lumi', `Hi, I’m Lumi! Ask me anything about landing on the Moon, or tell me what to do. We’re looking at <b>${siteName()}</b> right now.`);
      renderChips();
    }
    play('pop');
    setTimeout(() => input.focus(), 120);
  }
  function close() { panel.classList.remove('is-open'); }
  return { open, close, ask, toggle: () => (panel.classList.contains('is-open') ? close() : open()) };
}
