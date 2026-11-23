// Experience layer bootstrap: theme, cinematic intro, mode switching,
// dynamic notch, Pro-mode spotlight tour and Creo-style globe controls.

import { mountLayers } from './layersUi.js';
import { mountFlight } from './flightUi.js';
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
  if (kind === 'promo') return openClip(`${base}tutorial/lunar-site-planner-promo.mp4`, `${base}tutorial/promo-poster.jpg`, 'Lunar Site Planner in 60 seconds');
  const box = document.createElement('div');
  box.className = 'xp-video';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Video tour of Professional mode');
  box.innerHTML = `<div class="v-card">
      <div class="v-head"><b>Professional mode, chapter by chapter (3 min)</b>
        <span><a href="${base}tutorial/pro-tutorial.mp4" download class="xp-link">Download MP4</a>
        <button type="button" class="xp-chip xp-icon-btn" data-v="close" aria-label="Close video">✕</button></span></div>
      <video src="${base}tutorial/pro-tutorial.mp4" poster="${base}tutorial/pro-tutorial-poster.jpg" controls autoplay playsinline>
        <track kind="chapters" src="${base}tutorial/pro-tutorial.chapters.vtt" srclang="en" label="Chapters">
        <track kind="captions" src="${base}tutorial/pro-tutorial.vtt" srclang="en" label="English (also burned in)">
      </video>
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
      { icon: 'route', label: 'Guided tour', sub: 'Lumi shows you this screen, controls included', run: () => startTour() },
      { icon: 'video', label: 'Tutorial video', sub: 'About 3 minutes, narrated, 16 chapters', run: () => openVideo() },
      { icon: 'sparkles', label: 'Ask Lumi a question', run: () => document.querySelector('[data-x="lumi"]')?.click() },
      { icon: 'check', label: 'Accuracy, data and sources', sub: 'How we know the numbers are right', run: () => import('./trust.js').then((m) => m.openTrust({ sites })) },
      { sep: true },
      { icon: 'info', label: 'About this project', sub: 'Team, data, the 60-second promo', run: () => openAbout({ onVideo: openVideo }) },
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

  // Terrain 3D is opened from the Check step ("See it up close"), the Report
  // and Lumi; this hidden link keeps its address in step with the site/date.
  const viewTabs = document.getElementById('tabPolarBtn')?.parentElement;
  const terrainLink = document.createElement('a');
  terrainLink.dataset.x = 'terrain';
  terrainLink.href = './planner.html#from=pro';
  terrainLink.hidden = true;
  document.body.appendChild(terrainLink);
  window.addEventListener('lsp-fly-site', () => getGlobe?.()?.flyToSite(app.site));

  // ---------- Globe view cluster + gesture hint ----------
  const gv = document.getElementById('globeViewport');
  if (gv) {
    document.getElementById('globeZoomInBtn')?.parentElement?.remove();
    const hint = document.createElement('div');
    hint.className = 'xp-mode-hint';
    gv.appendChild(hint);
    api.setHint = (txt) => { hint.textContent = txt || ''; hint.classList.toggle('is-on', !!txt); };
  }
  // The window length is chosen in the Date step; the timeline's copy of
  // those buttons is hidden.
  const tw = document.getElementById('timelineWinButtons');
  if (tw) tw.hidden = true;
  // Camera: four buttons in the toolbar (South Pole, Site, Earth–Moon, View ▾);
  // the less-used views live in the View menu.
  const camBar = document.getElementById('camPoleBtn')?.parentElement;
  const toolRow = camBar?.parentElement;
  ['camStandSunBtn', 'camStandEarthBtn'].forEach((id) => { const b = document.getElementById(id); if (b) b.hidden = true; });
  if (camBar) {
    document.getElementById('camSiteBtn').textContent = 'Site';
    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'px-2 py-0.5 rounded text-xs font-medium hover:bg-white text-slate-700 xp-viewmenu';
    viewBtn.setAttribute('aria-haspopup', 'menu');
    viewBtn.innerHTML = `View ${icon('chevronDown', 12)}`;
    camBar.appendChild(viewBtn);
    const g = () => { api.switchSubView?.('globe'); return getGlobe(); };
    createMenu(viewBtn, () => [
      { icon: 'sun', label: 'Look toward the Sun', sub: 'From the lander mast', run: () => clickOld('camStandSunBtn') },
      { icon: 'globe', label: 'Look toward Earth', sub: 'From the lander mast', run: () => clickOld('camStandEarthBtn') },
      { sep: true },
      { icon: 'moon', label: 'Front (near side)', run: () => g()?.view('front') },
      { icon: 'arrowUp', label: 'Top (north pole)', run: () => g()?.view('top') },
      { icon: 'chevronDown', label: 'Bottom (south pole)', run: () => g()?.view('bottom') },
      { icon: 'plus', label: 'Zoom in', run: () => g()?.zoomBy(0.75), keepOpen: true },
      { icon: 'minus', label: 'Zoom out', run: () => g()?.zoomBy(1.32), keepOpen: true },
      { icon: 'reset', label: 'Reset view', run: () => g()?.reset() },
      { sep: true },
      { icon: 'mouse', label: 'How to move the Moon', run: () => controlsCoach.start() },
    ]);
  }

  const mapLayers = mountLayers({ getGlobe, viewTabs: toolRow || viewTabs, app, setMarksVisible: (on) => api.setMarksVisible?.(on) });
  const flight = mountFlight({ app, viewTabs, switchSubView: api.switchSubView, setTime });

  const controlsCoach = createSpotlight([
    {
      target: '#globeViewport', pad: 0, mood: 'wow',
      title: 'Move the Moon like a CAD model',
      body: 'The controls work like PTC Creo. No middle button? Left-drag and right-drag do the same jobs.',
      extra: GESTURES,
      why: 'Engineers spend hours in CAD tools like Creo, so we copied their mouse layout. The View menu above the Moon jumps to standard views (front, the side facing Earth; top, north pole; bottom, south pole), zooms, resets, and looks toward the Sun or Earth from the lander.',
    },
  ], { label: 'Controls', onDone: () => store.set('lsp.controlsSeen', '1') });

  // ---------- Pro-mode tour ----------
  const proTour = createSpotlight([
    { target: null, mood: 'happy', title: 'Welcome to Professional mode', body: 'Professional mode walks you through a landing plan in five steps, with the 3D Moon in the middle. I’ll show you round in under a minute.' },
    { target: '#paneSite .f-top', mood: 'think', title: 'Five steps, in order', body: 'Site → Date → Check → What if → Report. Each step shows only what it needs. Tap a number to jump, or use Next at the bottom.', why: 'Mission planners work in this order: choose where, choose when, check it works, test what happens if plans change, then write it up.' },
    { target: '#paneSite .f-body', before: () => flow.go(0, { quiet: true }), mood: 'happy', title: 'Step 1: pick a landing site', body: 'Choose from Apollo, CLPS, Chandrayaan-3, Chang’e and computed best-lit spots, type coordinates with “+ Coords”, or tap the best-spot shortcut.', why: 'Sites marked “computed” were found by scanning NASA LOLA terrain for the places that see the most Sun.' },
    { target: '#globeViewport', pad: 0, before: () => showGlobe(), mood: 'wow', title: 'The 3D Moon', body: 'Gold is the direction of the Sun from your site; blue is Earth. Click anywhere on the surface to test that exact spot. Map layers (top right) colours the Moon by sunlight, Earth in view, shadow, height or slope.', extra: GESTURES },
    { target: '#xp-notch', pad: 8, before: () => showGlobe(), mood: 'happy', title: 'Live status', body: 'This pill tells you, at a glance, whether you have power and a radio link right now. The numbers flash green when they rise and red when they fall.' },
    { target: '#clockToolbar', mood: 'think', title: 'Travel through time', body: 'Press Play to watch the Sun circle the sky, or scrub the timeline below. Step 2 (Date) is where you set the touchdown date.', why: 'At the south pole the Sun circles the whole horizon once every 29.5 days. Play at 6 h/s to watch it skim the ridges.' },
    { target: '#timelineWrap', mood: 'happy', title: 'The operations timeline', body: 'Each row is a resource over the window: sunlight, power, Earth in view, Deep Space Network coverage and the direct-to-Earth link. Drag across it to scrub time.' },
    { target: '[data-x="lumi"]', pad: 6, mood: 'wow', title: 'Ask Lumi', body: 'Stuck? Type what you want: “best date at the ridge in 2027”, “compare ridge and IM-2”, “move 1 km north” or “what is libration?”.', why: 'Lumi runs in your browser with no AI service: it turns your words into planner actions and reads every number from the same engine you see on screen.' },
    { target: '[data-x="help"]', pad: 6, mood: 'happy', title: 'Help is always here', body: 'Help has this tour, the tutorial video, Ask Lumi and how we check the numbers. The View menu above the Moon has the mouse controls and standard views. Settings (the gear) has light and dark mode, sound, the spacecraft assumptions and the Beginner walk.' },
  ], { label: 'Tour' });

  // ---------- Flight tour (its own view) ----------
  const showView = (v) => { if (app.view !== v) { api.switchSubView?.(v); return 450; } return 0; };
  const showGlobe = () => showView('globe');
  const flightTour = createSpotlight([
    { target: null, before: () => showView('flight'), mood: 'happy', title: 'The flight, launch to touchdown', body: 'This view plans the trip that ends at your site on your touchdown date (set in the Date step). It is a simplified model for comparing routes, not for navigating a real spacecraft.' },
    { target: '.fl-routes', mood: 'think', title: 'Three ways to get there', body: 'Direct is quick but the lander brakes hard; phasing loops and the low-energy route take longer and need less fuel. Pick one to see its numbers.', why: 'Flown examples: Apollo 11 and IM-1 went direct; Chandrayaan-3 and Blue Ghost used phasing loops; SLIM took the low-energy route.' },
    { target: '.fl-stats', mood: 'happy', title: 'The headline numbers', body: 'Launch date, door-to-door time, the speed changes the lander must make itself (Δv) and the fuel that needs, with a 5% reserve.' },
    { target: '.fl-tabs', mood: 'think', title: 'More detail', body: 'Timeline lists each phase; Burns and fuel shows every engine burn and whether its number is computed, assumed or a rule of thumb; Compare routes puts the three side by side; At touchdown checks Sun and Earth on arrival.' },
    { target: '.fl-bar', pad: 6, mood: 'wow', title: 'Watch it fly', body: 'Press play or drag along the coloured bar: each colour is a phase. Long coasts play faster so the short burns don’t vanish. 1× changes the speed; Follow keeps the camera on the spacecraft.' },
    { target: '.fl-canvas', pad: 0, mood: 'happy', title: 'Look around', body: 'Drag to orbit, scroll to zoom. Switch Follow off to look freely; the caption at the top says what is happening.' },
  ], { label: 'Flight tour' });

  // ---------- South-pole map tour ----------
  const mapTour = createSpotlight([
    { target: '#polarCanvas', pad: 0, before: () => showView('polar'), mood: 'happy', title: 'The south pole from above', body: 'A flat map of the region around the south pole, from NASA’s LROC camera mosaic. Click anywhere to test that spot; it becomes your site.' },
    { target: '#polarViewport fieldset', mood: 'think', title: 'Colour it by sunlight or Earth', body: 'Overlays show the share of 2027 with the Sun, or Earth, above the local skyline, computed from NASA LOLA terrain. Bright = more of the year.', why: 'Ridges and crater rims near the pole catch the low Sun; crater floors can stay dark for billions of years.' },
    { target: () => document.getElementById('polarZoomInBtn')?.parentElement, pad: 6, mood: 'happy', title: 'Zoom and reset', body: 'Use + and − (or scroll) to zoom, drag to pan, Reset to go back to the whole region.' },
  ], { label: 'Map tour' });
  /** The tour for whatever is on screen. */
  const startTour = () => (app.mode === 'compare' ? startCmpTour() : app.view === 'flight' ? flightTour.start() : app.view === 'polar' ? mapTour.start() : proTour.start());

  // ---------- Compare Lab tour ----------
  const cmpTour = createSpotlight([
    { target: null, mood: 'happy', title: 'Compare in one minute', body: 'Compare answers one question at a time: two places, launch dates, or your plan vs the best spot. I’ve set up “your plan vs the best spot” so you can see an answer.' },
    { target: '.ch-verdict', mood: 'wow', title: 'The answer first', body: 'One sentence tells you which plan wins and by how much: the share of time the lander has sunlight for power and Earth in view for radio, at the same time.' },
    { target: '.ch-cols', mood: 'happy', title: 'The plans, head to head', body: 'Two or three plans side by side. The big number is that same “power and radio together” share. Tap the arrow to open a plan in the planner.' },
    { target: '.ch-reasons', mood: 'think', title: 'Why it wins', body: 'The reasons the winner comes out on top, and anything the other plan does better, in plain words with the numbers.' },
    { target: '.ch-diff', mood: 'happy', title: 'Only what’s different', body: 'Measures that are about the same are hidden, so you only read what matters. Tick “Show all measures” to see everything.' },
    { target: '.cl-more summary', pad: 8, mood: 'think', title: 'Full details, when you want them', body: 'Charts for every measure, a day-by-day view, the full table and CSV export are folded away here.' },
    { target: '#cmpNewBtn', pad: 8, mood: 'wow', title: 'Ask another question', body: 'Start a new comparison: two places, or the launch-date chart that shows every day of the next year at once. In the planner, “Add to compare” at the bottom of the steps collects plans as you go.' },
  ], { label: 'Compare tour' });
  const startCmpTour = () => {
    store.set('lsp.cmpTourSeen', '1');
    document.getElementById('cmpTourBtn')?.classList.remove('is-new');
    if (app.mode !== 'compare') switchMode('compare');
    if (app.scenarios.length < 2 || app.cmpView !== 'result') exampleCompare();
    setTimeout(() => cmpTour.start(), 350);
  };
  document.getElementById('cmpNewBtn')?.addEventListener('click', () => { app.cmpView = 'start'; switchMode('compare'); });
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
    document.documentElement.classList.toggle('app-covered', mode !== 'pro'); // see public/early.js
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
      else if (store.get('lsp.proWelcome2') !== '1') showWelcome();
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
  /**
   * A "how would you like to start?" chooser. Shown every time until the
   * person ticks "Don't show this again" (stored under `key`). Skip is always
   * one obvious click (or Esc).
   */
  function chooser({ key, title, sub, mood = 'wow', opts, onPick }) {
    if (document.querySelector('.xp-welcome')) return;
    const returnTo = document.activeElement;
    const box = document.createElement('div');
    box.className = 'xp-welcome';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'xpWelcomeTitle');
    box.innerHTML = `<div class="wl-card">
        <button type="button" class="wl-skip" data-w="skip">Skip ${icon('x', 16)}</button>
        <div class="wl-head"><span class="wl-ava">${lumiSvg(mood, 64)}</span>
          <div><h2 id="xpWelcomeTitle">${title}</h2><p>${sub}</p></div></div>
        <div class="wl-opts">${opts}</div>
        <div class="wl-foot"><label class="wl-again"><input type="checkbox" data-again> Don’t show this again</label>
          <button type="button" class="wl-skip2" data-w="skip">Skip for now</button></div>
        <p class="wl-note">You can always find these under ${icon('help', 13)} Help.</p>
      </div>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-on'));
    play('pop');
    const close = (choice) => {
      if (box.querySelector('[data-again]').checked) store.set(key, '1');
      box.classList.remove('is-on');
      setTimeout(() => box.remove(), 300);
      removeEventListener('keydown', onKey);
      if (returnTo && returnTo !== document.body && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
      onPick(choice);
    };
    const onKey = (e) => { if (e.key === 'Escape') close('skip'); };
    addEventListener('keydown', onKey);
    box.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => close(b.dataset.w)));
    box.addEventListener('click', (e) => { if (e.target === box) close('skip'); });
    setTimeout(() => box.querySelector('.wl-opt')?.focus(), 80);
  }
  const PRO_KEY = 'lsp.proWelcome2', CMP_KEY = 'lsp.cmpWelcome';
  function showWelcome() {
    const base = import.meta.env.BASE_URL;
    chooser({
      key: PRO_KEY,
      title: 'Welcome to Professional mode',
      sub: 'Plan a landing in five steps. How would you like to start?',
      opts: `<button type="button" class="wl-opt is-video" data-w="video">
            <span class="wl-thumb" style="background-image:url('${base}tutorial/pro-tutorial-poster.jpg')"><span class="wl-play">${icon('play', 22)}</span><span class="wl-dur">3:15</span></span>
            <b>Watch the tutorial video</b><small>A narrated two-minute walkthrough</small></button>
          <button type="button" class="wl-opt" data-w="tour"><span class="wl-ic">${icon('route', 26)}</span><b>Take the guided tour</b><small>Lumi shows you each part, about a minute</small></button>`,
      onPick: (c) => {
        if (c === 'video') openVideo();
        else if (c === 'tour') proTour.start();
        else { api.setHint?.('Drag to spin · Shift-drag to pan · Scroll to zoom · Help has the video and tour'); setTimeout(() => api.setHint?.(null), 6000); }
      },
    });
  }
  const exampleCompare = () => {
    const b = app.cmpBestSite?.();
    if (!b || !app.cmpSetPlans) return;
    const nm = (x) => (x.short || x.name).replace(/ \(.*\)$/, '');
    app.cmpSetPlans([{ site: app.site, startMs: app.windowStartMs, label: `${nm(app.site)} (your plan)` }, { site: b, startMs: app.windowStartMs, label: nm(b) }]);
  };
  function showCompareWelcome() {
    chooser({
      key: CMP_KEY,
      mood: 'think',
      title: 'Welcome to Compare',
      sub: 'Ask one question, get one clear answer: which plan gives your lander more power and radio, and by how much.',
      opts: `<button type="button" class="wl-opt" data-w="example"><span class="wl-ic">${icon('trophy', 26)}</span><b>Show me an example</b><small>Your plan vs the best spot for the same dates</small></button>
          <button type="button" class="wl-opt" data-w="tour"><span class="wl-ic">${icon('route', 26)}</span><b>Take the guided tour</b><small>Lumi shows you how to read a comparison</small></button>`,
      onPick: (c) => {
        if (c === 'example') exampleCompare();
        else if (c === 'tour') startCmpTour();
      },
    });
  }
  document.getElementById('modeCompareBtn')?.addEventListener('click', () => {
    if (store.get(CMP_KEY) !== '1') setTimeout(showCompareWelcome, 250);
  });

  // ---------- Best landing spots (friend's idea #1) ----------
  const best = { key: '', cancel: null, timer: 0, spots: [] };
  const card = document.createElement('div');
  card.className = matchMedia?.('(max-width: 720px)').matches ? 'xp-best is-min' : 'xp-best';
  card.innerHTML = '<div class="b-head"><span>Best spots · next 30 days</span><button type="button" class="b-x" aria-label="Hide best spots" title="Hide">–</button></div><div class="b-body"></div>';
  // Shown once: as the shortcut in the Site step (the card stays off-screen;
  // the globe still marks both spots).
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
          app.bestSpots = best.spots;
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
    slipCompare: () => { app.cmpView = 'dates'; app.cmpDatesSite = null; switchMode('compare'); },
    compareBest: () => api.compareSites?.([app.site, ...best.spots.map((sp) => sp.r.site)]),
    copyLink: () => api.copyLink?.(),
    terrain: () => {
      const a = document.querySelector('[data-x="terrain"]');
      if (!a) return;
      // Keep this tab's progress so "Back to Professional" (or the browser's Back
      // button) returns to the same site, date, step and compare list.
      api.saveSession?.();
      history.replaceState(null, '', '#pro&resume=1');
      location.href = a.href;
    },
    flight: (route) => { api.switchSubView?.('flight'); return flight?.setRoute(route); },
    lumi: () => assistant.open(),
    look: (body) => getGlobe()?.lookAlong?.(body),
    theme: (v) => applyTheme(v),
    tour: () => startTour(),
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
    mountIntro({ siteCount: sites.length, onChoose: (m) => setMode(m), onAbout: () => openAbout({ onVideo: openVideo }), onVideo: () => openVideo() });
  }

  // NASA's nine Artemis III candidate regions, outlined on the 3D Moon; the
  // selected region is drawn brighter.
  const regions = { features: null, key: '' };
  fetch(`${import.meta.env?.BASE_URL ?? '/'}data/artemis_regions.geojson`).then((r) => (r.ok ? r.json() : null)).then((g) => { regions.features = g?.features || []; drawRegions(); }).catch(() => {});
  // Listed sites and the Artemis III region names on the 3D Moon (Map layers can hide them).
  const MARK_COLOURS = { artemis: '#a5b4fc', apollo: '#e5e7eb', clps: '#34d399', intl: '#f9a8d4', south: '#fcd34d', computed: '#67e8f9' };
  let marksSet = false;
  function drawMarks() {
    const g = getGlobe?.();
    if (!g?.setMarks) return;
    if (!marksSet) {
      marksSet = true;
      g.setMarks(sites.map((s) => ({
        id: s.id, lat: s.lat, lon: s.lon, color: MARK_COLOURS[s.group] || '#e5e7eb',
        kind: s.group === 'artemis' ? 'region' : 'site',
        label: s.group === 'artemis' ? s.name.replace(/^Artemis III region:\s*/, '') : (s.short || s.name),
        title: s.name,
      })), { onPick: (id) => { const s = sites.find((x) => x.id === id); if (s) selectSite(s, true); } });
      let on = true;
      try { on = localStorage.getItem('lsp.marks') !== 'off'; } catch {}
      g.setMarksVisible(on);
    }
  }
  api.setMarksVisible = (on) => { try { localStorage.setItem('lsp.marks', on ? 'on' : 'off'); } catch {} getGlobe?.()?.setMarksVisible?.(on); };

  function drawRegions() {
    drawMarks();
    const g = getGlobe?.();
    if (!g?.setOutlines || !regions.features) return;
    const sel = app.site?.region || '';
    const key = `${sel}|${regions.features.length}`;
    if (key === regions.key) return;
    regions.key = key;
    g.setOutlines(regions.features.map((f) => ({ ring: f.geometry.coordinates[0], color: f.properties.RegionCode === sel ? '#c7d2fe' : '#818cf8', selected: f.properties.RegionCode === sel })));
  }

  return {
    busy: () => notchBusy(),
    update: () => {
      drawRegions();
      notchUpdate(app.lastNow, { playing: app.playing });
      plan.refresh();
      flow.refresh();
      refreshBest();
      updateBestLinks();
      // Terrain 3D opens the Cesium view on the same site and date.
      const t = document.querySelector('[data-x="terrain"]');
      if (t && app.site) {
        const q = new URLSearchParams({ from: 'pro', t: new Date(app.windowStartMs).toISOString().slice(0, 16) + 'Z', w: String([15, 30, 90, 365].includes(app.windowDays) ? app.windowDays : 30) });
        if (String(app.site.id).startsWith('custom')) q.set('site', `${app.site.lat.toFixed(4)},${app.site.lon.toFixed(4)}`);
        else q.set('id', app.site.id);
        t.href = `./planner.html#${q.toString()}`;
      }
    },
    proTour, controlsCoach, setMode,
    flowStep: () => flow.step(),
    goStep: (i) => flow.go(i, { quiet: true }),
  };
}
