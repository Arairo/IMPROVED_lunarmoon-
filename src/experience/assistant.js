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
  lunarday: 'One lunar day, from one sunrise to the next, lasts about 29.5 Earth days. Most places get about two weeks of sunlight and then two weeks of night. Near the poles it’s different: the Sun skims round the horizon, so high ridges can stay lit for weeks while crater floors never see it.',
  distance: 'The Moon is about 384,400 km away on average. A radio signal takes about 1.3 seconds to get there, so every “hello?” to a lander has a round trip of roughly 2.6 seconds.',
  clps: 'CLPS (Commercial Lunar Payload Services) is NASA buying rides to the Moon for its experiments on landers built by companies. Intuitive Machines’ IM-1 and IM-2 and Firefly’s Blue Ghost Mission 1 are CLPS missions, and they’re all in the site list.',
  artemis: 'Artemis is NASA’s programme to send astronauts back to the Moon, this time aiming for the south pole region, where sunlight on the ridges and ice in the shadowed craters make it worth the trouble. Choosing where and when to land there is exactly what this planner is about.',
  regolith: 'Regolith is the Moon’s loose top layer: dust and broken rock made by billions of years of impacts. With no wind or water to smooth it, the grains stay sharp and cling to everything, including solar panels and spacesuits.',
  temperature: 'With no air to hold heat, the Moon swings hard: around +120 °C in sunlight at the equator and about −130 °C at night. Crater floors at the poles that never see the Sun are among the coldest places measured in the Solar System, below −230 °C.',
  gravity: 'Gravity on the Moon is about one-sixth of Earth’s (1.62 m/s²), so a 60 kg person would feel like 10 kg. It helps landing, but dust kicked up by the engine flies a long way.',
  crater: 'Craters are holes made by asteroids and comets hitting the Moon. With no weather to wear them down they last for billions of years, which is why the Moon is covered in them. Near the poles their rims cast very long shadows.',
  water: 'Yes! In 2009 NASA’s LCROSS crashed a rocket stage into Cabeus crater and saw water in the plume. More ice is thought to sit in permanently shadowed craters near the poles. Water means drinking water, oxygen and rocket fuel for future crews. (LCROSS and Cabeus are in the site list.)',
  verdict: 'The traffic lights are our own rules of thumb, not a NASA standard. <b>Power</b> is red if the Sun is down at touchdown, amber if it sets within a week or only part of it shows, green otherwise. <b>Earth contact</b> is red if Earth is hidden, amber if it sets within 3 days or is less than 2° above the hills, green otherwise. The overall light is the worse of the two.',
  calendar: 'In step 2 each day is coloured for the site you picked, landing at the same time of day. <b>Green</b>: the Sun and Earth stay up together for at least 3 days. <b>Amber</b>: the Sun is up but Earth is hidden or sets sooner. <b>Red</b>: the Sun is down, so no solar power. The little bar shows how long Sun and Earth stay up together (full = 14+ days).',
  solarpower: '',
  earthrise: 'An Earthrise is Earth coming up over the Moon’s horizon, made famous by the Apollo 8 photo in 1968. From the surface Earth barely moves in the sky, so you only see it rise from places near the edge of the near side, where the Moon’s wobble lifts it over the hills. Say “show me the Earthrise” and I’ll point the camera at it.',
  modes: '<b>Beginner</b> is a calm walk with Lumi: one question at a time, with the “why” whenever you want it. <b>Professional</b> is the full planner: five steps from site to report, the 3D Moon, the timeline, What if and the Compare Lab. You can switch any time under Settings.',
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

  const SUGGEST = ['Is it GO right now?', 'Best date at the ridge in 2027', 'Take me to Apollo 11', 'Compare ridge and IM-2', 'Move 1 km north', 'What does GO WITH CARE mean?', 'Show me the Earthrise', 'Fun fact', 'Who are you?'];
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
      : `<b>Power: no.</b> The Sun is ${Math.abs(n.sun.clearance).toFixed(1)}° below the skyline, so the lander runs on its battery.`;
    const earth = n.earth.los ? `<b>Earth: in view</b>, ${n.earth.clearance.toFixed(1)}° above the skyline${n.commsStatus === 'go' ? ', and the radio link to the Deep Space Network closes.' : n.commsStatus === 'marginal' ? ', but only just: the link is marginal.' : ', but no Deep Space Network antenna can see the Moon right now.'}`
      : `<b>Earth: hidden</b>, ${Math.abs(n.earth.clearance).toFixed(1)}° below the skyline, so no direct radio link.`;
    const head = `At <b>${siteName()}</b>, ${when(app.timeMs)}:`;
    if (focus === 'power') return `${head}<br>${power}`;
    if (focus === 'earth') return `${head}<br>${earth}`;
    const verdict = n.powerStatus === 'go' && n.commsStatus === 'go' ? 'GO right now ✅' : n.powerStatus === 'no-go' && n.commsStatus === 'no-go' ? 'NO GO right now ⛔' : 'GO WITH CARE right now ⚠️';
    return `${head} <b>${verdict}</b><br>${power}<br>${earth}`;
  }
  function summary30() {
    const s = windowStats(app.site, app.windowStartMs, app.config);
    return `Over the next 30 days: sunlight ${pct(s.sun)}, Earth in view ${pct(s.earth)}, both together ${pct(s.both)}.`;
  }

  function respond(q) {
    const r = parseRequest(q, sites, app.timeMs);
    if (r.type !== 'unknown') misses = 0;
    switch (r.type) {
      case 'help':
        return add('lumi', 'Here’s what I can do:<ul><li><b>Go places</b>: “Apollo 11”, “-89.45, -137.3”</li><li><b>Find dates</b>: “best date at the ridge in 2027”</li><li><b>Check</b>: “is it GO?”, “when is sunset?”</li><li><b>What if</b>: “move 2 km north”, “3 days later”, “compare ridge and IM-2”</li><li><b>Explain</b>: “what is libration?”, “how cold is it?”</li><li><b>Run the app</b>: “step 2”, “print the report”, “dark mode”</li></ul>',
          [{ label: 'Is it GO?', run: () => ask('is it GO?') }, { label: 'Best spot', run: () => ask('best spot') }, { label: 'Fun fact', run: () => ask('fun fact') }]);
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
        const from = r.from ?? app.windowStartMs;
        const res = findNextWindow(site, from, app.config, { minDays: r.minDays });
        if (!res) return add('lumi', `I searched 12 months from ${day(from)} at <b>${esc(site.name)}</b>: there is no time with the Sun and Earth up together for ${r.minDays} day${r.minDays > 1 ? 's' : ''}. ${site.lat < -85 && site.group !== 'computed' ? 'Crater floors near the pole can stay dark for years; try a ridge.' : r.minDays >= 7 ? 'The Sun and Earth are rarely up together for more than about two weeks: a lunar day lasts about 29.5 Earth days, so the Sun is up for roughly half of it (longer only on the best polar ridges). Try a shorter stay or another site.' : 'Try a shorter stay or another site.'}`,
          [{ label: 'Show me the best spot instead', run: () => ask('best spot') }]);
        const lasts = ((res.endMs - res.ms) / DAY).toFixed(1);
        return add('lumi', `Earliest landing at <b>${esc(site.name)}</b> from ${day(from)} with the Sun and Earth up together for ${r.minDays}+ days:<br><b>${when(res.ms)}</b>, lasting ${lasts} days.`,
          [{ label: 'Go there', run: () => { setTime(res.ms, true); add('lumi', `Done. ${statusText()}`); } },
           { label: 'See every launch day', run: () => { setTime(res.ms, true); actions.slipCompare?.(); add('lumi', 'Here’s every launch day for the next year on one chart. Tap a bar to compare it with your plan.'); } }]);
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
        if (r.slip) { actions.slipCompare?.(); return add('lumi', `Here’s every launch day for the next year at <b>${siteName()}</b>. Tall green bars are the best days; tap one to compare it with your plan.`); }
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
        setTime(Math.round(app.windowStartMs + r.days * DAY), true);
        const ad = Math.abs(r.days);
        const span = ad >= 29 ? `${Math.round(ad / 29.530588)} lunar month${Math.round(ad / 29.530588) > 1 ? 's' : ''}` : ad % 7 === 0 && ad >= 7 ? `${ad / 7} week${ad > 7 ? 's' : ''}` : `${Math.round(ad)} day${ad > 1 ? 's' : ''}`;
        return add('lumi', describeChange(`${span} ${r.days > 0 ? 'later' : 'earlier'}`, before, windowStats(app.site, app.windowStartMs, app.config)));
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
      case 'explain': {
        if (r.term === 'solarpower') {
          const p = app.config.power;
          const peak = Math.round(p.areaM2 * p.efficiency * 1361);
          return add('lumi', `It depends on your spacecraft. Right now it has ${p.areaM2} m² of panels at ${Math.round(p.efficiency * 100)}% efficiency, so in full sunlight they make about <b>${peak} W</b>. The lander needs <b>${p.loadW} W</b> to keep running; anything below that drains the battery. You can change these in Settings → Spacecraft assumptions.`,
            [{ label: 'Will I have power here?', run: () => ask('will I have power') }]);
        }
        const more = { verdict: [{ label: 'Is it GO right now?', run: () => ask('is it GO?') }], calendar: [{ label: 'Open the calendar', run: () => ask('step 2') }], water: [{ label: 'Take me to LCROSS', run: () => ask('take me to LCROSS') }], clps: [{ label: 'Take me to IM-2', run: () => ask('take me to IM-2') }], earthrise: [{ label: 'Show me the Earthrise', run: () => ask('show me the earthrise') }] }[r.term] || [];
        return add('lumi', EXPLAIN[r.term] || 'Good question! I don’t have a good answer for that one yet.', more);
      }
      case 'small': return smallTalk(r.kind);
      case 'step':
        actions.step?.(r.step);
        return add('lumi', `Here’s step ${r.step + 1}: <b>${['Site', 'Date', 'Check', 'What if', 'Report'][r.step]}</b>.`);
      case 'report':
        actions.step?.(4);
        actions.print?.();
        return add('lumi', 'Your one-page report is opening in a new tab, ready to print or save as PDF. (If nothing opened, allow pop-ups for this site.)');
      case 'copyLink':
        actions.copyLink?.();
        return add('lumi', 'Copied a link to this site and date. Anyone who opens it lands on the same scenario (with their own spacecraft settings).');
      case 'look':
        if (r.site && r.site.id !== app.site.id) selectSite(r.site, true);
        if (r.body === 'earth' && app.scan?.stats.earthCentreFraction === 0) return add('lumi', `From <b>${siteName()}</b> you can’t see Earth at all: it’s on the far side, so Earth never rises there. Landers there talk home through a relay satellite.`, [{ label: 'Why?', run: () => ask('what is the far side') }]);
        actions.look?.(r.body);
        return add('lumi', r.body === 'earth' ? 'Standing behind the lander, looking towards Earth across the real horizon. The dotted lines link the best spots to Earth.' : 'Standing behind the lander, looking towards the Sun across the real horizon.');
      case 'theme': actions.theme?.(r.value); return add('lumi', `Switched to ${r.value} mode.`);
      case 'tour': close(); actions.tour?.(); return undefined;
      case 'beginner': close(); actions.beginner?.(); return undefined;
      case 'terrain': actions.terrain?.(); return add('lumi', 'Opening the Terrain 3D view on this site and date.');
      case 'play': actions.play?.(r.on); return add('lumi', r.on ? 'Playing: watch the Sun circle the sky.' : 'Paused.');
      default:
        misses += 1;
        if (misses > 1) return add('lumi', 'Sorry, I’m a simple helper that runs right here in your browser, so I only understand certain kinds of requests. Tap one of these to see what I can do:', [
          { label: 'Is it GO right now?', run: () => ask('is it GO?') }, { label: 'Find a good date', run: () => ask('best date') },
          { label: 'Best spot', run: () => ask('best spot') }, { label: 'What is libration?', run: () => ask('what is libration') }]);
        return add('lumi', 'I didn’t catch that. I can go to a site (“Apollo 11”), find dates (“best date at the ridge in 2027”), compare (“compare ridge and IM-2”), nudge (“move 1 km north”) or explain things (“what is libration?”).');
    }
  }

  let misses = 0;
  let jokeAt = 0, factAt = 0;
  const JOKES = [
    'Why did the astronaut break up with the Moon? It needed space. (Lots of it: 384,400 km.)',
    'How do you throw a party on the Moon? You planet. Then you check the Sun angle with me first.',
    'The Moon restaurant has great food, but no atmosphere.',
    'Why is the Moon always tired? Because it’s been up all night. Well, at the poles, up for weeks.',
  ];
  const FACTS = [
    'Near the south pole the Sun never climbs more than about 1.5° above a level horizon. That’s why a hill a few hundred metres high can block it.',
    'From the Moon, Earth hangs in almost the same spot in the sky all the time. It only wobbles a few degrees as the Moon rocks (libration).',
    'The Apollo 11 astronauts left a mirror on the Moon that scientists still bounce lasers off to measure the distance to within centimetres.',
    'Some crater floors near the poles haven’t seen sunlight for billions of years.',
    'A lunar day lasts about 29.5 Earth days, so a lander at the equator gets two weeks of sunshine and then two weeks of freezing night.',
  ];
  function smallTalk(kind) {
    const name = siteName();
    const joke = kind === 'joke' ? JOKES[jokeAt++ % JOKES.length] : '';
    const fact = kind === 'fact' ? FACTS[factAt++ % FACTS.length] : '';
    const map = {
      hello: [`Hi there! 👋 We’re looking at <b>${name}</b>. Want to check if it’s a GO, or find a good landing date?`, [{ label: 'Is it GO?', run: () => ask('is it GO?') }, { label: 'Find a good date', run: () => ask('best date') }]],
      thanks: ['You’re welcome! Anything else you want to check?', []],
      bye: ['Bye for now! I’ll be right here under the ✨ button if you need me.', []],
      how: ['I’m great, thanks: lots of sunshine on the ridge today. ☀️ How’s the mission planning going?', []],
      who: ['I’m <b>Lumi</b>, the planner’s helper. I’m not a chatbot like ChatGPT: I’m a set of rules that runs right here in your browser, so I work offline and never make numbers up. I turn what you type into planner actions and read every figure from the same engine you see on screen.', [{ label: 'What can you do?', run: () => ask('help') }]],
      made: ['Lunar Site Planner was made by Team <b>Dell Monitors</b> from Kuala Lumpur for the NASA Space Apps Challenge 2026 (“Lunar Landing Site Navigator”).', [{ label: 'About the project', run: () => actions.about?.() }]],
      app: ['It’s a planner for choosing <b>where</b> and <b>when</b> to land on the Moon. For any site and date it works out whether the lander gets sunlight for power and Earth in view for radio, using NASA LOLA terrain and real ephemerides. Follow the five steps on the left: Site → Date → Check → What if → Report.', [{ label: 'Start the tour', run: () => ask('start the tour') }]],
      joke: [joke, [{ label: 'Another one', run: () => ask('tell me a joke') }]],
      fact: [fact, [{ label: 'Another fact', run: () => ask('fun fact') }]],
      love: ['Aww, thank you! 💛 You’re a great mission planner yourself.', []],
      rude: ['Sorry I let you down! I only understand certain kinds of requests. Try “help” to see them, or rephrase and I’ll do my best.', [{ label: 'Help', run: () => ask('help') }]],
    }[kind];
    misses = 0;
    return add('lumi', map[0], map[1]);
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
  function close() {
    const hadFocus = panel.contains(document.activeElement);
    panel.classList.remove('is-open');
    if (hadFocus) { input.blur(); document.querySelector('[data-x="lumi"]')?.focus({ preventScroll: true }); }
  }
  return { open, close, ask, toggle: () => (panel.classList.contains('is-open') ? close() : open()) };
}
