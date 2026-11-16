// Experience layer bootstrap: theme, cinematic intro, mode switching,
// dynamic notch, Pro-mode spotlight tour and Creo-style globe controls.

import './experience.css';
import './theme-pro.css';
import { mountIntro } from './intro.js';
import { mountNotch, notchBusy, notchUpdate } from './notch.js';
import { createSpotlight } from './spotlight.js';
import { createWalk } from './walk.js';
import { findBestSpots } from './bestSpots.js';
import { soundOn, toggleSound, setSound, syncSoundLabels, play } from './sound.js';
import { icon } from './icons.js';
import { createMenu } from './menu.js';
import { openAbout } from './about.js';
import { lumiSvg } from './lumi.js';

const lumiFace = () => lumiSvg('happy', 26);
import { mountPlanCard } from './plan.js';
import { mountFlow } from './flow.js';
import { createAssistant } from './assistant.js';
import { prepareSite, evaluate } from '../core/analysis.js';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  store.set('lsp.theme', theme);
  document.querySelectorAll('[data-theme-label]').forEach((b) => { b.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 16); });
  window.dispatchEvent(new Event('lsp-theme'));
}
export const toggleTheme = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

// Apply the saved theme before anything paints.
applyTheme(store.get('lsp.theme') || 'dark');

const GESTURES = `<div class="xp-gestures">
  <div class="xp-gesture"><div class="xp-mouse m-mid"><span class="w"></span></div><b>Spin</b>Middle-drag<br><span class="xp-key">or left-drag</span></div>
  <div class="xp-gesture"><div class="xp-mouse m-mid"><span class="w"></span></div><b>Pan</b><span class="xp-key">Shift</span> + middle-drag<br><span class="xp-key">or right-drag</span></div>
  <div class="xp-gesture"><div class="xp-mouse m-mid"><span class="w"></span></div><b>Zoom</b>Scroll wheel<br><span class="xp-key">Ctrl</span> + middle-drag</div>
</div>`;

function openClip(src, poster, title) {
  const box = document.createElement('div');
  box.className = 'xp-video';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', title);
  box.innerHTML = `<div class="v-card"><div class="v-head"><b>${title}</b><span><a href="${src}" download class="xp-link">Download MP4</a>
      <button type="button" class="xp-chip xp-icon-btn" data-v="close" aria-label="Close video">✕</button></span></div>
      <video src="${src}" poster="${poster}" controls autoplay playsinline></video></div>`;
  document.body.appendChild(box);
  const close = () => { box.querySelector('video')?.pause(); box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-v="close"]')) close(); });
  setTimeout(() => box.querySelector('[data-v="close"]')?.focus(), 50);
}

/** Narrated tour of Professional mode (subtitles burned in), in a pop-up player. */
export function openVideo(kind = 'tour') {
  const base = import.meta.env.BASE_URL;
  if (kind === 'promo') return openClip(`${base}tutorial/lunar-site-planner-promo.mp4`, `${base}tutorial/promo-poster.jpg`, 'Lunar Site Planner in 48 seconds');
  const box = document.createElement('div');
  box.className = 'xp-video';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Video tour of Professional mode');
  box.innerHTML = `<div class="v-card">
      <div class="v-head"><b>Professional mode in 85 seconds</b>
        <span><a href="${base}tutorial/pro-tutorial.mp4" download class="xp-link">Download MP4</a>
        <button type="button" class="xp-chip xp-icon-btn" data-v="close" aria-label="Close video">✕</button></span></div>
      <video src="${base}tutorial/pro-tutorial.mp4" poster="${base}tutorial/pro-tutorial-poster.jpg" controls autoplay playsinline></video>
    </div>`;
  document.body.appendChild(box);
  const close = () => { box.querySelector('video')?.pause(); box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-v="close"]')) close(); });
  setTimeout(() => box.querySelector('[data-v="close"]')?.focus(), 50);
}

export function initExperience(api) {
  const { app, sites, selectSite, setTime, switchMode, getGlobe } = api;
  const notch = mountNotch();
  document.getElementById('globeViewport')?.appendChild(notch);

  // ---------- Header tools (Pro mode) ----------
  // Global actions on the right: Ask Lumi (stands out), Help (video, tour,
  // controls) and Settings (theme, sound, notes, spacecraft, Beginner). The old
  // header buttons stay in the DOM, hidden, so their existing handlers still run.
  const headerRight = document.querySelector('header > div:last-child');
  const clickOld = (id) => document.getElementById(id)?.click();
  if (headerRight) {
    ['learnToggleBtn', 'tourStartBtn', 'settingsOpenBtn'].forEach((id) => document.getElementById(id)?.classList.add('xp-orig'));
    const tools = document.createElement('div');
    tools.className = 'xp-headtools';
    tools.innerHTML = `
      <button type="button" class="xp-lumi-btn" data-x="lumi" title="Ask Lumi: type what you want to do or know">
        <span class="lb-ava">${lumiFace()}</span><span class="lb-txt">Ask Lumi</span><span class="lb-key">${icon('sparkles', 14)}</span>
      </button>
      <button type="button" class="xp-chip" data-x="help" aria-haspopup="menu" aria-expanded="false">${icon('help', 16)}<span class="xp-hide-sm">Help</span></button>
      <button type="button" class="xp-chip xp-icon-btn" data-x="settings" aria-haspopup="menu" aria-expanded="false" aria-label="Settings" title="Settings">${icon('settings', 16)}</button>`;
    headerRight.prepend(tools);

    createMenu(tools.querySelector('[data-x="help"]'), () => [
      { icon: 'video', label: 'Watch the tutorial video', sub: '85 seconds, narrated', run: () => openVideo() },
      { icon: 'route', label: 'Guided tour', sub: 'Lumi points things out, one by one', run: () => proTour.start() },
      { icon: 'mouse', label: 'Mouse and keyboard controls', sub: 'Spin, pan and zoom the Moon', run: () => controlsCoach.start() },
      { icon: 'play', label: 'Watch the promo', sub: '48 seconds, with music', run: () => openVideo('promo') },
      { icon: 'scale', label: 'Compare Lab tour', sub: 'How to read a side-by-side comparison', run: () => startCmpTour() },
      { sep: true },
      { icon: 'sparkles', label: 'Ask Lumi a question', run: () => document.querySelector('[data-x="lumi"]')?.click() },
      { icon: 'info', label: 'About this project', run: () => openAbout({ onVideo: openVideo }) },
    ]);
    createMenu(tools.querySelector('[data-x="settings"]'), () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      const notes = document.getElementById('learnToggleBtn')?.getAttribute('aria-pressed') === 'true';
      return [
        { head: 'Appearance' },
        { seg: [{ label: 'Light', icon: 'sun', on: !dark, run: () => applyTheme('light') }, { label: 'Dark', icon: 'moon', on: dark, run: () => applyTheme('dark') }] },
        { icon: soundOn() ? 'volume' : 'volumeOff', label: 'Sound effects', toggle: soundOn(), run: () => setSound(!soundOn()), keepOpen: true },
        { icon: 'info', label: 'Plain-English notes', sub: 'Extra explanations in the assessment', toggle: notes, run: () => clickOld('learnToggleBtn'), keepOpen: true },
        { sep: true },
        { head: 'Mission' },
        { icon: 'sliders', label: 'Spacecraft assumptions…', sub: 'Solar array, load, mast height, radio', run: () => clickOld('settingsOpenBtn') },
        { icon: 'graduation', label: 'Switch to Beginner mode', run: () => setMode('beginner') },
      ];
    });
    applyTheme(document.documentElement.dataset.theme);
  }

  // Terrain 3D sits with the other views (3D Moon, South-Pole Map).
  const viewTabs = document.getElementById('tabPolarBtn')?.parentElement;
  if (viewTabs) {
    const t = document.createElement('a');
    t.dataset.x = 'terrain';
    t.href = './planner.html#from=pro';
    t.className = 'xp-viewtab';
    t.title = 'Open this site and date over real LOLA 3D terrain with shadows (CesiumJS)';
    t.innerHTML = `${icon('mountain', 14)} Terrain 3D ${icon('external', 12)}`;
    viewTabs.appendChild(t);
  }

  // ---------- Globe view cluster + gesture hint ----------
  const gv = document.getElementById('globeViewport');
  if (gv) {
    document.getElementById('globeZoomInBtn')?.parentElement?.remove();
    const cube = document.createElement('div');
    cube.className = 'xp-viewcube';
    cube.innerHTML = `
      <button type="button" data-v="in" title="Zoom in" aria-label="Zoom in">+</button>
      <button type="button" data-v="out" title="Zoom out" aria-label="Zoom out">−</button>
      <hr>
      <button type="button" data-v="front" title="Front view (near side)" aria-label="Front view">F</button>
      <button type="button" data-v="top" title="Top view (north pole)" aria-label="Top view">T</button>
      <button type="button" data-v="bottom" title="Bottom view (south pole)" aria-label="Bottom view">B</button>
      <button type="button" data-v="reset" title="Reset view" aria-label="Reset view">⟲</button>
      <hr>
      <button type="button" data-v="help" title="How to move the Moon" aria-label="How to move the Moon">?</button>`;
    gv.appendChild(cube);
    const hint = document.createElement('div');
    hint.className = 'xp-mode-hint';
    gv.appendChild(hint);
    api.setHint = (txt) => { hint.textContent = txt || ''; hint.classList.toggle('is-on', !!txt); };
    cube.addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.v;
      const g = getGlobe();
      if (!v || !g) return;
      if (v === 'in') g.zoomBy(0.75);
      else if (v === 'out') g.zoomBy(1.32);
      else if (v === 'reset') g.reset();
      else if (v === 'help') controlsCoach.start();
      else g.view(v);
    });
  }

  const controlsCoach = createSpotlight([
    {
      target: '#globeViewport', pad: 0, mood: 'wow',
      title: 'Move the Moon like a CAD model',
      body: 'The controls work like PTC Creo. No middle button? Left-drag and right-drag do the same jobs.',
      extra: GESTURES,
      why: 'Engineers spend hours in CAD tools like Creo, so we copied their mouse layout. The buttons on the right jump to standard views: F (front, the side facing Earth), T (top, north pole), B (bottom, south pole) and ⟲ to reset.',
    },
  ], { label: 'Controls', onDone: () => store.set('lsp.controlsSeen', '1') });

  // ---------- Pro-mode tour ----------
  const proTour = createSpotlight([
    { target: null, mood: 'happy', title: 'Welcome to Professional mode', body: 'Professional mode walks you through a landing plan in five steps, with the 3D Moon in the middle. I’ll show you round in under a minute.' },
    { target: '#paneSite .f-top', mood: 'think', title: 'Five steps, in order', body: 'Site → Date → Check → What if → Report. Each step shows only what it needs. Tap a number to jump, or use Next at the bottom.', why: 'Mission planners work in this order: choose where, choose when, check it works, test what happens if plans change, then write it up.' },
    { target: '#paneSite .f-body', before: () => flow.go(0, { quiet: true }), mood: 'happy', title: 'Step 1: pick a landing site', body: 'Choose from Apollo, CLPS, Chandrayaan-3, Chang’e and computed best-lit spots, type coordinates with “+ Coords”, or tap the best-spot shortcut.', why: 'Sites marked “computed” were found by scanning NASA LOLA terrain for the places that see the most Sun.' },
    { target: '#globeViewport', pad: 0, mood: 'wow', title: 'The 3D Moon', body: 'Gold is the direction of the Sun from your site; blue is Earth. Click anywhere on the surface to test that exact spot.', extra: GESTURES },
    { target: '#xp-notch', pad: 8, mood: 'happy', title: 'Live status', body: 'This pill tells you, at a glance, whether you have power and a radio link right now. The numbers flash green when they rise and red when they fall.' },
    { target: '#clockToolbar', mood: 'think', title: 'Travel through time', body: 'Press Play to watch the Sun circle the sky, or scrub the timeline below. Step 2 (Date) is where you set the touchdown date.', why: 'At the south pole the Sun circles the whole horizon once every 29.5 days. Play at 6 h/s to watch it skim the ridges.' },
    { target: '#timelineWrap', mood: 'happy', title: 'The operations timeline', body: 'Each row is a resource over the window: sunlight, power, Earth in view, Deep Space Network coverage and the direct-to-Earth link. Drag across it to scrub time.' },
    { target: '[data-x="lumi"]', pad: 6, mood: 'wow', title: 'Ask Lumi', body: 'Stuck? Type what you want: “best date at the ridge in 2027”, “compare ridge and IM-2”, “move 1 km north” or “what is libration?”.', why: 'Lumi runs in your browser with no AI service: it turns your words into planner actions and reads every number from the same engine you see on screen.' },
    { target: '[data-x="help"]', pad: 6, mood: 'happy', title: 'Help is always here', body: 'Help has the tutorial video, this tour and the mouse controls. Settings (the gear) has light and dark mode, sound, the spacecraft assumptions and the Beginner walk.' },
  ], { label: 'Tour' });

  // ---------- Compare Lab tour ----------
  const cmpTour = createSpotlight([
    { target: null, mood: 'happy', title: 'Welcome to the Compare Lab', body: 'Here you put whole plans side by side: different sites, different dates, or both. I’ll show you how to read it in under a minute.' },
    { target: '.cl-actions', mood: 'think', title: 'Add scenarios', body: 'Add the site and date you’re on, any other site from the menu, three launch slips (+1, +2, +3 lunar months) or the sunniest ridges nearby.', why: 'A lunar day lasts about 29.5 Earth days, so a slip of exactly one lunar month brings the same Sun angle back, but Earth’s wobble (libration) and the Sun’s seasonal tilt still change the answer.' },
    { target: '.cl-winner', mood: 'wow', title: 'The winner', body: 'The best plan overall, ranked by how long it has power and radio at the same time, then by link time and the shortest night.' },
    { target: '.cl-cards', mood: 'happy', title: 'One card per plan', body: 'The big number is the share of time with both sunlight and Earth in view. The coloured chip shows how far it is above or below your baseline.', why: 'Tap the star on any card to make it the baseline. Every difference on the page is then measured from that plan.' },
    { target: '.cl-bars', mood: 'think', title: 'See the size of each difference', body: 'Every measure gets its own bar chart, so a 2-point change looks small and a 40-point change looks huge. The trophy marks the best plan for that measure.' },
    { target: '.cl-days', mood: 'wow', title: 'Day by day', body: 'Each row starts at its own touchdown. Green is power and radio together, amber is power only. Gaps are nights.' },
    { target: '.cl-head', mood: 'happy', title: 'Take it with you', body: 'Export everything to CSV for a report, or tap Open on any card to jump back to the planner with that site and date.' },
  ], { label: 'Compare tour' });
  const startCmpTour = () => {
    store.set('lsp.cmpTourSeen', '1');
    document.getElementById('cmpTourBtn')?.classList.remove('is-new');
    if (app.mode !== 'compare') switchMode('compare');
    if (app.scenarios.length < 2) document.getElementById('cmpSlipBtn')?.click();
    setTimeout(() => cmpTour.start(), 350);
  };
  const cmpTourBtn = document.getElementById('cmpTourBtn');
  if (cmpTourBtn) {
    cmpTourBtn.innerHTML = `${icon('route', 15)} Tour`;
    if (store.get('lsp.cmpTourSeen') !== '1') cmpTourBtn.classList.add('is-new');
    cmpTourBtn.addEventListener('click', startCmpTour);
  }

  // Replace the old tour button with the spotlight tour.
  const oldTour = document.getElementById('tourStartBtn');
  if (oldTour) {
    const fresh = oldTour.cloneNode(true);
    fresh.textContent = 'Guide me';
    oldTour.replaceWith(fresh);
    fresh.addEventListener('click', () => proTour.start());
  }

  // ---------- Beginner walk ----------
  const walk = createWalk({
    app, sites,
    onToggleTheme: toggleTheme,
    onToggleSound: toggleSound,
    onOpenPro: (site, ms, withTour) => {
      if (site) {
        app.windowStartMs = ms;
        app.timeMs = ms;
        selectSite(site, true);
        setTime(ms, true);
      }
      setMode('pro', { tour: withTour });
    },
  });

  function setMode(mode, { tour = false } = {}) {
    // Leaving Professional mode pauses its clock so it doesn't run unseen.
    if (mode !== 'pro' && app.playing) document.getElementById('playPauseBtn')?.click();
    document.body.dataset.mode = mode;
    if (location.hash !== `#${mode}`) history.replaceState(null, '', `#${mode}`);
    if (mode === 'beginner') {
      walk.open();
      return;
    }
    switchMode('explorer');
    document.body.classList.remove('xp-enter'); void document.body.offsetWidth;
    document.body.classList.add('xp-enter');
    setTimeout(() => document.body.classList.remove('xp-enter'), 1400);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      if (tour) proTour.start();
      else if (store.get('lsp.proWelcome') !== '1') showWelcome();
      else if (!store.get('lsp.controlsSeen')) {
        // A gentle hint instead of a blocking pop-up; "?" on the globe opens the full controls guide.
        store.set('lsp.controlsSeen', '1');
        api.setHint('Drag to spin · Shift-drag to pan · Scroll to zoom · ? for controls');
        setTimeout(() => api.setHint(null), 6000);
      }
    }, 500);
  }

  applyTheme(document.documentElement.dataset.theme);

  // ---------- First visit to Professional mode: how would you like to start? ----------
  function showWelcome() {
    if (document.querySelector('.xp-welcome')) return;
    const base = import.meta.env.BASE_URL;
    const box = document.createElement('div');
    box.className = 'xp-welcome';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'xpWelcomeTitle');
    box.innerHTML = `<div class="wl-card">
        <div class="wl-head"><span class="wl-ava">${lumiSvg('wow', 64)}</span>
          <div><h2 id="xpWelcomeTitle">Welcome to Professional mode</h2><p>Plan a landing in five steps. How would you like to start?</p></div></div>
        <div class="wl-opts">
          <button type="button" class="wl-opt is-video" data-w="video">
            <span class="wl-thumb" style="background-image:url('${base}tutorial/pro-tutorial-poster.jpg')"><span class="wl-play">${icon('play', 22)}</span><span class="wl-dur">1:25</span></span>
            <b>Watch the tutorial video</b><small>A narrated 85-second walkthrough</small></button>
          <button type="button" class="wl-opt" data-w="tour"><span class="wl-ic">${icon('route', 26)}</span><b>Take the guided tour</b><small>Lumi shows you each part, about a minute</small></button>
          <button type="button" class="wl-opt" data-w="skip"><span class="wl-ic">${icon('chevronRight', 26)}</span><b>Skip, I’ll explore</b><small>Everything is under Help later</small></button>
        </div>
        <label class="wl-again"><input type="checkbox" data-again checked> Don’t ask me again</label>
      </div>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-on'));
    play('pop');
    const close = (choice) => {
      if (box.querySelector('[data-again]').checked) store.set('lsp.proWelcome', '1');
      box.classList.remove('is-on');
      setTimeout(() => box.remove(), 300);
      removeEventListener('keydown', onKey);
      if (choice === 'video') openVideo();
      else if (choice === 'tour') proTour.start();
      else { api.setHint?.('Drag to spin · Shift-drag to pan · Scroll to zoom · Help has the video and tour'); setTimeout(() => api.setHint?.(null), 6000); }
    };
    const onKey = (e) => { if (e.key === 'Escape') close('skip'); };
    addEventListener('keydown', onKey);
    box.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => close(b.dataset.w)));
    box.addEventListener('click', (e) => { if (e.target === box) close('skip'); });
    setTimeout(() => box.querySelector('[data-w="video"]')?.focus(), 80);
  }

  // ---------- Best landing spots (friend's idea #1) ----------
  const best = { key: '', cancel: null, timer: 0, spots: [] };
  const card = document.createElement('div');
  card.className = matchMedia?.('(max-width: 720px)').matches ? 'xp-best is-min' : 'xp-best';
  card.innerHTML = '<div class="b-head"><span>Best spots · next 30 days</span><button type="button" class="b-x" aria-label="Hide best spots" title="Hide">–</button></div><div class="b-body"></div>';
  document.getElementById('globeViewport')?.appendChild(card);
  const minBtn = card.querySelector('.b-x');
  const syncMin = () => { const m = card.classList.contains('is-min'); minBtn.textContent = m ? '+' : '–'; minBtn.setAttribute('aria-label', m ? 'Show best spots' : 'Hide best spots'); };
  minBtn.addEventListener('click', () => { card.classList.toggle('is-min'); syncMin(); });
  syncMin();
  const pctTxt = (f) => `${Math.round(f * 100)}%`;
  function renderBest(state, progress = 0) {
    const body = card.querySelector('.b-body');
    if (state === 'busy') { body.innerHTML = `<div class="b-busy"><span class="w-spinner" style="width:14px;height:14px;border-width:2px"></span> Searching ${Math.round(progress * 100)}%</div>`; return; }
    body.innerHTML = best.spots.map((sp, i) => `
      <button type="button" class="b-row" data-i="${i}">
        <i style="background:${sp.color}"></i>
        <span class="b-txt"><b>${sp.title}</b><span>${sp.r.site.short && sp.r.site.searched ? 'LOLA search cell' : sp.r.site.name}</span></span>
        <span class="b-num" title="Share of the window with the Sun up AND Earth in view">${pctTxt(sp.r.ops)}</span>
      </button>`).join('') + `<button type="button" class="b-compare">Compare these side by side</button>
      <p class="b-note">Ranked by time with both sunlight and Earth in view, out of ${best.count} candidates. “Flown” means a mission touched down there; it says nothing about how that mission went.</p>`;
    body.querySelector('.b-compare')?.addEventListener('click', () => api.compareSites?.([app.site, ...best.spots.map((sp) => sp.r.site)]));
    body.querySelectorAll('.b-row').forEach((b) => b.addEventListener('click', () => {
      const sp = best.spots[Number(b.dataset.i)];
      selectSite(sp.r.site, true);
    }));
  }
  function refreshBest() {
    const key = `${app.windowStartMs}|${JSON.stringify(app.config)}`;
    if (key === best.key) return;
    best.key = key;
    clearTimeout(best.timer);
    best.cancel?.();
    renderBest('busy');
    best.timer = setTimeout(() => {
      best.cancel = findBestSpots({
        sites, startMs: app.windowStartMs, config: app.config,
        onProgress: (f) => renderBest('busy', f),
        onDone: ({ flown, overall, count }) => {
          best.count = count;
          best.spots = [];
          if (overall) best.spots.push({ r: overall, color: '#30d158', title: 'Best overall' });
          if (flown && flown.site.id !== overall?.site.id) best.spots.push({ r: flown, color: '#bf5af2', title: 'Best flown site' });
          best.spots.forEach((sp) => { sp.ctx = prepareSite(sp.r.site, null, app.config); });
          getGlobe()?.setHighlights(best.spots.map((sp) => ({ lat: sp.r.site.lat, lon: sp.r.site.lon, color: sp.color, title: sp.title, sub: `${pctTxt(sp.r.ops)} power + Earth` })));
          renderBest('done');
          flow.renderBest();
          updateBestLinks();
        },
      });
    }, 350);
  }
  function updateBestLinks() {
    if (!best.spots.length) return;
    getGlobe()?.setHighlightEarth(best.spots.map((sp) => evaluate(app.timeMs, sp.ctx, app.config, { withDsn: false }).earth.los));
  }

  // ---------- What if? card (nudge site / date, find a date) ----------
  const plan = mountPlanCard({ app, selectSite, setTime, getGlobe });

  // ---------- Guided mission flow + Ask Lumi ----------
  const actions = {
    selectSite: (site) => selectSite(site, true),
    slipCompare: () => { document.getElementById('cmpSlipBtn')?.click(); switchMode('compare'); },
    compareBest: () => api.compareSites?.([app.site, ...best.spots.map((sp) => sp.r.site)]),
    copyLink: () => api.copyLink?.(),
    terrain: () => { const a = document.querySelector('[data-x="terrain"]'); if (a) location.href = a.href; },
    lumi: () => assistant.open(),
    look: (body) => getGlobe()?.lookAlong?.(body),
    theme: (v) => applyTheme(v),
    tour: () => proTour.start(),
    beginner: () => setMode('beginner'),
    play: (on) => { if (app.playing !== on) document.getElementById('playPauseBtn')?.click(); },
    step: (i) => { document.querySelector('[data-mob="site"]')?.offsetParent && matchMedia('(max-width: 1023px)').matches && document.querySelector('[data-mob="site"]').click(); flow.go(i); },
    print: () => flow.print(),
    about: () => openAbout({ onVideo: openVideo }),
  };
  const flow = mountFlow({ app, setTime, switchMode, getBestSpots: () => best.spots, actions });
  const assistant = createAssistant({ app, sites, selectSite, setTime, switchMode, getGlobe, compareSites: (l) => api.compareSites?.(l), getBestSpots: () => best.spots, actions });
  document.querySelector('[data-x="lumi"]')?.addEventListener('click', () => assistant.toggle());
  // Phones: "Check" opens the flow at step 3 instead of the old results pane.
  document.querySelector('[data-mob="results"]')?.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    document.querySelector('[data-mob="site"]')?.click();
    flow.go(2);
  }, true);

  // ---------- Entry ----------
  window.addEventListener('hashchange', () => {
    const m = location.hash.slice(1).split('&')[0];
    if ((m === 'pro' || m === 'beginner') && document.body.dataset.mode !== m) {
      document.getElementById('xp-intro')?.remove();
      setMode(m);
    }
  });
  const hashMode = location.hash.slice(1).split('&')[0];
  if (hashMode === 'pro' || hashMode === 'beginner') {
    setMode(hashMode);
  } else {
    document.body.dataset.mode = 'intro';
    mountIntro({ siteCount: sites.length, onChoose: (m) => setMode(m), onAbout: () => openAbout({ onVideo: openVideo }) });
  }

  return {
    busy: () => notchBusy(),
    update: () => {
      notchUpdate(app.lastNow, { playing: app.playing });
      plan.refresh();
      flow.refresh();
      refreshBest();
      updateBestLinks();
      // Terrain 3D opens the Cesium view on the same site and date.
      const t = document.querySelector('[data-x="terrain"]');
      if (t && app.site) {
        const q = new URLSearchParams({ from: 'pro', t: new Date(app.windowStartMs).toISOString().slice(0, 16) + 'Z', w: '30' });
        if (String(app.site.id).startsWith('custom')) q.set('site', `${app.site.lat.toFixed(4)},${app.site.lon.toFixed(4)}`);
        else q.set('id', app.site.id);
        t.href = `./planner.html#${q.toString()}`;
      }
    },
    proTour, controlsCoach, setMode,
  };
}
