// Captures every tutorial/promo screen from the production build (dark theme, 2x) in one
// pass, and records where each feature is on every shot (rects.json, as fractions of the
// 1600 x 1000 window) so highlight boxes and camera moves land on the real element.
//   npm run build && npx vite preview --port 5180 --strictPort
//   node capture.cjs            -> /tmp/claude-0/v2/cap/*.png + rects.json
const { chromium, devices } = require('playwright');
const fs = require('fs');
const O = '/tmp/claude-0/v2/cap/';
const BASE = 'http://localhost:5180/';
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const seen = () => { try { for (const k of ['lsp.proWelcome2', 'lsp.cmpWelcome', 'lsp.controlsSeen', 'lsp.cmpTourSeen', 'lsp.welcomeOff', 'lsp.flightTourSeen', 'lsp.mapTourSeen']) localStorage.setItem(k, '1'); localStorage.setItem('lsp.theme', 'dark'); localStorage.setItem('lsp.sound', 'off'); } catch {} };
// What to measure: CSS selector, or ['text', ancestor levels | min height] for an element found by its text.
const SPEC = {
  rail: '.xp-flow:not(.xp-report)', best: '.f-best', search: '#siteFilterInput', chips: ['sel', '[data-cat="all"]', 1], coords: '#toggleCustomCoordBtn',
  pill: '#xp-notch', globe: '#globeViewport', timeline: '#timelineWrap', layersBtn: '[data-x="layers"]', menu: '.xp-menu', layerCard: '.xp-layer-card', modes: '.l-modes',
  steps: '.xp-flow .f-steps, .xp-flow nav', cal: '[data-cal]', find: '[data-find]', findOut: '[data-find-out]', verdict: '.f-overall',
  close: ['text', 'Close to the line', 50], power: ['text', 'Power: GO', 50], earth: ['text', 'Earth contact:', 50], terrainLine: ['text', 'Terrain at the site:', 14], assume: ['text', 'Assuming', 30],
  how: ['details', 'worked out'], move: '.p-btns', whatifOut: ['text', 'Moved 1 km', 30], area: ['text', 'If the lander touches down anywhere', 60],
  flightSide: '.fl-side', flightTabs: '.fl-tabs', burns: '.fl-table', routes: '.fl-cmp', flightBar: '.fl-bar', flightStats: '.fl-stats', flightCaption: '.fl-caption',
  cmpWinner: ['text', 'gives the lander power', 60], cmpCards: ['text', 'Touchdown', 300],
  report: '#xp-report', reportTools: '#xp-report .r-tools', expand: '[data-r="wide"]', reportSummary: '.xp-flow:not(.xp-report) .f-report, .xp-flow:not(.xp-report) [data-report]', terrainBtn: '[data-r="terrain"]', openBtn: '[data-r="open"]',
  lumi: ['text', 'Answers come from', 300], lumiAnswer: ['text', 'right now', 60], tour: ['text', 'Welcome to Professional', 60],
  trustStats: ['text', 'checks against NASA', 60], trustTable: ['text', 'CHECKED AGAINST WHAT FLEW', 20],
  back: 'a.mode-link', t3dPower: '#vPower', t3dSky: ['text', 'Sky from the site', 120], cesium: '.cesium-widget, #cesiumContainer',
  help: '[data-x="help"]', tourItem: ['text', 'Guided tour', 24], trustItem: ['text', 'Accuracy, data and sources', 24], lumiBtn: '[data-x="lumi"]', flightBtn: '[data-x="flight"]', polarTab: '#tabPolarBtn', polarOverlay: ['text', 'SOUTH-POLE LOLA OVERLAY', 60],
};
const measure = (p) => p.evaluate((SPEC) => {
  const W = innerWidth, H = innerHeight, out = {};
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < H && r.left < W; };
  const grow = (e, minH) => { while (e && e.parentElement && e.getBoundingClientRect().height < minH) e = e.parentElement; return e; };
  const byText = (t) => { let best = null; for (const e of document.querySelectorAll('body *')) { if (!vis(e) || !(e.innerText || '').includes(t)) continue; if (!best || e.innerText.length < best.innerText.length) best = e; } return best; };
  for (const [k, s] of Object.entries(SPEC)) {
    let e = null;
    if (typeof s === 'string') e = [...document.querySelectorAll(s)].find(vis);
    else if (s[0] === 'text') e = grow(byText(s[1]), s[2]);
    else if (s[0] === 'sel') { e = document.querySelector(s[1]); for (let i = 0; i < s[2] && e; i++) e = e.parentElement; }
    else if (s[0] === 'details') e = [...document.querySelectorAll('details')].find((d) => vis(d) && (d.querySelector('summary')?.textContent || '').includes(s[1]));
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    out[k] = [r.left / W, r.top / H, r.right / W, r.bottom / H].map((v) => +Math.min(1, Math.max(0, v)).toFixed(4));
  }
  return out;
}, SPEC);
(async () => {
  fs.mkdirSync(O, { recursive: true });
  const rects = fs.existsSync(O + 'rects.json') ? JSON.parse(fs.readFileSync(O + 'rects.json', 'utf8')) : {};
  const b = await chromium.launch({ args: GL });
  const log = (...a) => console.log(...a);
  const run = async (name, fn) => { try { await fn(); } catch (e) { log('FAIL', name, e.message.split('\n')[0]); } };
  const W = (p, ms) => p.waitForTimeout(ms);
  const shot = async (p, n) => { await p.screenshot({ path: O + n + '.png' }); rects[n] = await measure(p); fs.writeFileSync(O + 'rects.json', JSON.stringify(rects, null, 0)); log('shot', n, Object.keys(rects[n]).length); };
  const clickText = async (p, t) => { const ok = await p.evaluate((t) => { const els = [...document.querySelectorAll('button, [role^=menuitem], li, a, summary')].filter((e) => e.offsetParent && e.innerText.split('\n')[0].trim().startsWith(t)); const e = els[els.length - 1]; if (e) e.click(); return !!e; }, t); if (!ok) throw new Error('no item ' + t); };
  const go = (p, i) => p.$eval(`[data-go="${i}"]`, (x) => x.click());
  // The date "Find the next good date" picks from the default (18 Nov 2026, 10:00 UTC); set exactly.
  const setDate = async (p) => { await p.evaluate(() => { const d = [...document.querySelectorAll('details')].find((x) => x.querySelector('[data-dt]')); if (d) d.open = true; const i = document.querySelector('[data-dt]'); i.value = '2026-11-18T10:00'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await W(p, 5000); };
  const only = process.argv[2] || 'all';

  if (only === 'all' || only === 'landing') {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }); await ctx.addInitScript(seen); const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    for (let i = 0; i < 8; i++) { await W(p, i === 0 ? 300 : 450); await shot(p, `land${i}`); }
    await W(p, 2500); await shot(p, 'land_end');
    await ctx.close();
  }
  if (only === 'all' || only === 'pro' || only === 'later') {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }); await ctx.addInitScript(seen); const p = await ctx.newPage();
    p.on('pageerror', (e) => log('pageerror', e.message));
    await p.goto(BASE + '#pro', { waitUntil: 'load' }); await W(p, 9000);
    if (only === 'later') { await go(p, 1); await W(p, 1500); await setDate(p); }
    if (only !== 'later') {
    await shot(p, 'site');
    await run('search', async () => { await p.fill('#siteFilterInput', 'Shackleton'); await W(p, 800); await shot(p, 'site_search'); await p.fill('#siteFilterInput', ''); await W(p, 500); });
    await run('coords', async () => { await p.click('#toggleCustomCoordBtn'); await W(p, 600); await shot(p, 'site_coords'); await p.click('#toggleCustomCoordBtn'); await W(p, 400); });
    await run('zoom', async () => { await clickText(p, 'View'); await W(p, 500); for (let i = 0; i < 3; i++) { await clickText(p, 'Zoom in'); await W(p, 900); } await p.keyboard.press('Escape'); await W(p, 3000); await shot(p, 'globe_zoom'); await clickText(p, 'View'); await W(p, 400); await clickText(p, 'Reset view'); await W(p, 3000); });
    await shot(p, 'globe_site');
    await run('layers', async () => {
      await p.click('[data-x="layers"]'); await W(p, 700); await shot(p, 'layers_menu');
      await clickText(p, 'Sunlight'); await W(p, 5000); await shot(p, 'layer_sun_now');
      await p.click('.l-modes [data-m="window"]'); await W(p, 5000); await shot(p, 'layer_sun_window');
      await p.click('.l-modes [data-m="year"]'); await W(p, 5000); await shot(p, 'layer_sun_year');
      for (const [t, n] of [['Earth in view', 'layer_earth'], ['Sun + Earth together', 'layer_both'], ['Never sunlit', 'layer_shadow'], ['Height', 'layer_height'], ['Slope', 'layer_slope']]) {
        await run(n, async () => { await p.click('[data-x="layers"]'); await W(p, 600); await clickText(p, t); await W(p, 5000); await shot(p, n); });
      }
      await p.click('[data-x="layers"]'); await W(p, 600); await clickText(p, 'No layer'); await W(p, 2500);
    });
    await run('polar', async () => {
      await p.click('#tabPolarBtn'); await W(p, 5000); await shot(p, 'polar');
      for (const [v, n] of [['illum', 'polar_sun'], ['earth', 'polar_earth']]) { await p.$eval(`input[name="polarOverlay"][value="${v}"]`, (r) => r.click()); await W(p, 5000); await shot(p, n); }
      await p.$eval('input[name="polarOverlay"][value="none"]', (r) => r.click()); await p.click('#tabGlobeBtn'); await W(p, 2500);
    });
    // Date: the default date fails (Earth hidden), then the planner finds a good one
    await go(p, 1); await W(p, 2500); await shot(p, 'date0');
    await go(p, 2); await W(p, 2500); await shot(p, 'check_nogo');
    await go(p, 1); await W(p, 1500);
    await p.evaluate(() => document.querySelector('[data-cal]')?.scrollIntoView({ block: 'start' })); await W(p, 600); await shot(p, 'date_cal0');
    await p.click('[data-find]'); await W(p, 6000);
    await p.evaluate(() => document.querySelector('[data-cal]')?.scrollIntoView({ block: 'start' })); await W(p, 600); await shot(p, 'date_cal');
    await p.evaluate(() => document.querySelector('[data-find]')?.scrollIntoView({ block: 'center' })); await W(p, 600); await shot(p, 'date_found');
    // Check
    await go(p, 2); await W(p, 3000); await p.evaluate(() => document.querySelector('.xp-flow .f-body')?.scrollTo(0, 0)); await W(p, 400); await shot(p, 'check');
    await run('checkdown', async () => { await p.evaluate(() => { const e = [...document.querySelectorAll('*')].find((x) => x.offsetParent && x.textContent.trim().startsWith('Close to the line') && x.children.length === 0); e?.scrollIntoView({ block: 'center' }); }); await W(p, 600); await shot(p, 'check_close'); });
    await run('checkmore', async () => {
      await p.evaluate(() => { const d = [...document.querySelectorAll('details')].find((x) => /worked out/i.test(x.querySelector('summary')?.textContent || '')); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }); await W(p, 800); await shot(p, 'check_more');
      await p.evaluate(() => { const d = [...document.querySelectorAll('details')].find((x) => /worked out/i.test(x.querySelector('summary')?.textContent || '')); if (d) d.open = false; document.querySelector('.xp-flow .f-body')?.scrollTo(0, 0); }); await W(p, 400);
    });
    // Timeline scrubbing (play)
    await run('play', async () => {
      const tl = await p.evaluate(() => { const r = document.getElementById('timelineCanvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      for (let i = 0; i < 40; i++) { await p.mouse.click(tl.x + tl.w * (0.04 + 0.92 * i / 39), tl.y + tl.h * 0.4); await W(p, 350); await shot(p, `tl${String(i).padStart(2, '0')}`); }
      await go(p, 1); await W(p, 800); await setDate(p); // back to the touchdown time
    });
    }
    // What if
    await go(p, 3); await W(p, 2500); await shot(p, 'whatif');
    await run('whatif_area', async () => { await clickText(p, 'Check the landing area'); await W(p, 9000); await shot(p, 'whatif_area'); });
    await run('whatif_n', async () => { await p.click('button[data-dir="N"]'); await W(p, 5000); await shot(p, 'whatif_n'); await clickText(p, 'Undo'); await W(p, 4000); });
    // Flight
    await run('flight', async () => {
      await p.$eval('[data-x="flight"]', (x) => x.click()); await W(p, 6000); await shot(p, 'flight0');
      const r = await (await p.$('[data-f="scrub"]')).boundingBox();
      for (const [k, f] of [[1, 0.2], [2, 0.5], [3, 0.85]]) { await p.mouse.click(r.x + r.width * f, r.y + r.height / 2); await W(p, 2500); await shot(p, `flight${k}`); }
      await p.$eval('[data-tab="burns"]', (x) => x.click()); await W(p, 1200); await shot(p, 'flight_burns');
      await p.$eval('[data-tab="compare"]', (x) => x.click()); await W(p, 1200); await shot(p, 'flight_routes');
      await p.$eval('[data-tab="checks"]', (x) => x.click()); await W(p, 1200); await shot(p, 'flight_checks');
      await p.$eval('[data-tab="timeline"]', (x) => x.click()); await p.click('#tabGlobeBtn'); await W(p, 2500);
    });
    // Compare: my plan vs the best spot
    await run('compare', async () => {
      await go(p, 3); await W(p, 1000);
      await p.$eval('[data-cmp="best"]', (x) => x.click()); await W(p, 7000); await shot(p, 'cmp1');
      await p.evaluate(() => document.querySelector('.cl-bars')?.scrollIntoView()); await W(p, 1500); await shot(p, 'cmp2');
      await p.click('#modeExplorerBtn'); await W(p, 2500);
    });
    // Report
    await go(p, 4); await W(p, 2500); await shot(p, 'report');
    await run('report_col', async () => { await p.$eval('[data-r="open"]', (x) => x.click()); await W(p, 2500); await shot(p, 'report_col'); await p.$eval('[data-r="wide"]', (x) => x.click()); await W(p, 2000); await shot(p, 'report_wide'); await p.$eval('[data-r="wide"]', (x) => x.click()); await W(p, 800); await p.$eval('[data-r="close"]', (x) => x.click()); await W(p, 1200); });
    // Help, Lumi, accuracy
    await run('help', async () => { await p.click('[data-x="help"]'); await W(p, 800); await shot(p, 'help'); await clickText(p, 'Guided tour'); await W(p, 2500); await shot(p, 'tour1'); await p.keyboard.press('Escape'); await W(p, 800); });
    await run('lumi', async () => { await p.click('[data-x="lumi"]'); await W(p, 1500); const inp = p.locator('textarea, input[placeholder*="best date"], input[placeholder*="Try"]').first(); await inp.fill('Is it GO right now?'); await inp.press('Enter'); await W(p, 3500); await shot(p, 'lumi2'); await p.keyboard.press('Escape'); await W(p, 800); });
    await run('trust', async () => { await p.click('[data-x="help"]'); await W(p, 800); await clickText(p, 'Accuracy, data and sources'); await W(p, 2000); await shot(p, 'trust'); await p.keyboard.press('Escape'); await W(p, 800); });
    // Terrain 3D and back
    await run('terrain', async () => {
      await go(p, 4); await W(p, 1500);
      await Promise.all([p.waitForURL(/planner\.html/, { timeout: 60000 }), p.$eval('[data-r="terrain"]', (x) => x.click())]);
      await p.waitForFunction(() => !!(window.lunarApp && document.querySelector('#vPower .big')), null, { timeout: 120000 }); await W(p, 12000); await shot(p, 'terrain0');
      await W(p, 6000); await shot(p, 'terrain1');
      await Promise.all([p.waitForURL(/#pro/, { timeout: 60000 }), p.$eval('a.mode-link', (a) => a.click())]); await W(p, 8000); await shot(p, 'terrain_back');
    });
    await ctx.close();
  }
  if (only === 'all' || only === 'phone') {
    const ctx = await b.newContext({ ...devices['iPhone 14 Pro'] }); await ctx.addInitScript(seen); const p = await ctx.newPage();
    await p.goto(BASE + '#pro', { waitUntil: 'load' }); await W(p, 9000);
    await p.screenshot({ path: O + 'phone_pro.png' });
    await p.$eval('[data-go="2"]', (x) => x.click()).catch(() => {}); await W(p, 2500); await p.screenshot({ path: O + 'phone_check.png' });
    await ctx.close();
  }
  await b.close();
})();
