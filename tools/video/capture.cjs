// Captures every tutorial/promo screen from the production build (dark theme, 2x).
const { chromium, devices } = require('playwright');
const O = '/tmp/claude-0/v2/cap/';
const BASE = 'http://localhost:5180/';
const only = process.argv[2] || 'all';
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const seen = () => { try { for (const k of ['lsp.proWelcome2','lsp.cmpWelcome','lsp.controlsSeen','lsp.cmpTourSeen','lsp.welcomeOff','lsp.flightTourSeen','lsp.mapTourSeen']) localStorage.setItem(k,'1'); localStorage.setItem('lsp.theme','dark'); localStorage.setItem('lsp.sound','off'); } catch {} };
(async () => {
  const b = await chromium.launch({ args: GL });
  const log = (...a) => console.log(...a);
  const run = async (name, fn) => { try { await fn(); } catch (e) { log('FAIL', name, e.message.split('\n')[0]); } };
  const mk = async (vp = { width: 1600, height: 1000 }, dsf = 2) => { const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf }); await ctx.addInitScript(seen); const p = await ctx.newPage(); p.on('pageerror', (e) => log('pageerror', e.message)); return [ctx, p]; };
  const shot = (p, n) => p.screenshot({ path: O + n + '.png' }).then(() => log('shot', n));
  const W = (p, ms) => p.waitForTimeout(ms);
  const clickText = async (p, t) => { const ok = await p.evaluate((t) => { const els = [...document.querySelectorAll('button, [role^=menuitem], li, a')].filter((e) => e.offsetParent && e.innerText.split('\n')[0].trim().startsWith(t)); const e = els[els.length - 1]; if (e) e.click(); return !!e; }, t); if (!ok) throw new Error('no item ' + t); };
  const zoomIn = async (p, n = 4) => { await p.mouse.move(980, 520); for (let i = 0; i < n; i++) { await p.mouse.wheel(0, -300); await W(p, 400); } await W(p, 3000); };

  if (only === 'all' || only === 'landing') {
    const [ctx, p] = await mk();
    await p.goto(BASE, { waitUntil: 'load' });
    for (let i = 0; i < 8; i++) { await W(p, i === 0 ? 300 : 450); await shot(p, `land${i}`); }
    await W(p, 2500); await shot(p, 'land_end');
    await ctx.close();
  }
  if (only === 'all' || only === 'pro' || only === 'fix' || only === 'later') {
    const [ctx, p] = await mk();
    await p.goto(BASE + '#pro', { waitUntil: 'load' }); await W(p, 9000);
    await p.evaluate(() => document.querySelector('.xp-mode-hint')?.classList.remove('is-on'));
    if (only === 'later') { await p.$eval('[data-go="1"]', (x) => x.click()); await W(p, 1500); await p.click('[data-find]'); await W(p, 6000); }
    if (only !== 'later') {
    await shot(p, 'site');
    await run('search', async () => { await p.fill('#siteFilterInput', 'Shackleton'); await W(p, 800); await shot(p, 'site_search'); await p.fill('#siteFilterInput', ''); await W(p, 500); });
    await run('siteview', async () => { await zoomIn(p, 5); await shot(p, 'globe_site'); });
    // Map layers
    await run('layers', async () => {
      await p.click('[data-x="layers"]'); await W(p, 700); await shot(p, 'layers_menu');
      await clickText(p, 'Sunlight'); await W(p, 5000); await shot(p, 'layer_sun_now');
      await p.click('.l-modes [data-m="window"]'); await W(p, 5000); await shot(p, 'layer_sun_window');
      await p.click('.l-modes [data-m="year"]'); await W(p, 5000); await shot(p, 'layer_sun_year');
      for (const [t, n] of [['Earth in view', 'layer_earth'], ['Sun + Earth together', 'layer_both'], ['Never sunlit', 'layer_shadow'], ['Height', 'layer_height'], ['Slope', 'layer_slope']]) {
        await run(n, async () => { await p.click('[data-x="layers"]'); await W(p, 600); await clickText(p, t); await W(p, 5000); await shot(p, n); });
      }
      await run('polar', async () => { await p.click('[data-x="layers"]'); await W(p, 600); await clickText(p, 'Sun + Earth together'); await W(p, 3000); await p.click('#tabPolarBtn'); await W(p, 5000); await shot(p, 'polar'); await p.click('#tabGlobeBtn'); await W(p, 2500); });
      await p.click('[data-x="layers"]'); await W(p, 600); await clickText(p, 'No layer'); await W(p, 2500);
    });
    if (only === 'fix') { await ctx.close(); await b.close(); return; }
    // Date: the default date fails (Earth hidden), then find a good one
    await p.$eval('[data-go="1"]', (x) => x.click()); await W(p, 2500); await shot(p, 'date0');
    await p.$eval('[data-go="2"]', (x) => x.click()); await W(p, 2500); await shot(p, 'check_nogo');
    await p.$eval('[data-go="1"]', (x) => x.click()); await W(p, 1500);
    await p.click('[data-find]'); await W(p, 6000);
    await p.evaluate(() => document.querySelector('[data-find]')?.scrollIntoView({ block: 'center' })); await W(p, 600); await shot(p, 'date_found');
    await p.evaluate(() => document.querySelector('[data-cal]')?.scrollIntoView({ block: 'center' })); await W(p, 600); await shot(p, 'date_cal');
    // Check
    await p.$eval('[data-go="2"]', (x) => x.click()); await W(p, 3000); await shot(p, 'check');
    await run('checkmore', async () => {
      await p.evaluate(() => { const d = [...document.querySelectorAll('details')].find((x) => /worked out/i.test(x.querySelector('summary')?.textContent || '')); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }); await W(p, 800); await shot(p, 'check_more');
      await p.evaluate(() => document.querySelector('.xp-flow .f-body')?.scrollTo(0, 0)); await W(p, 400);
    });
    // Play: scrub the timeline in site view
    await run('play', async () => {
      await zoomIn(p, 5);
      const tl = await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].filter((x) => x.offsetParent && x.getBoundingClientRect().top > 800).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]; const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      log('timeline', JSON.stringify(tl));
      for (let i = 0; i < 40; i++) { await p.mouse.click(tl.x + tl.w * (0.04 + 0.92 * i / 39), tl.y + tl.h * 0.4); await W(p, 350); await shot(p, `tl${String(i).padStart(2, '0')}`); }
    });
    }
    // What if
    await p.$eval('[data-go="3"]', (x) => x.click()); await W(p, 2500); await shot(p, 'whatif');
    
    await run('whatif_area', async () => { await clickText(p, 'Check the landing area'); await W(p, 9000); await shot(p, 'whatif_area'); });
    // Flight
    await run('flight', async () => {
      await p.$eval('[data-x="flight"]', (x) => x.click()); await W(p, 6000); await shot(p, 'flight0');
      const s = await p.$('[data-f="scrub"]'); const r = await s.boundingBox();
      for (const [k, f] of [[1, 0.2], [2, 0.5], [3, 0.85]]) { await p.mouse.click(r.x + r.width * f, r.y + r.height / 2); await W(p, 2500); await shot(p, `flight${k}`); }
      await p.$eval('[data-tab="burns"]', (x) => x.click()); await W(p, 1200); await shot(p, 'flight_burns');
      await p.$eval('[data-tab="compare"]', (x) => x.click()); await W(p, 1200); await shot(p, 'flight_routes');
      await p.$eval('[data-tab="checks"]', (x) => x.click()); await W(p, 1200); await shot(p, 'flight_checks');
      await p.click('#tabGlobeBtn').catch(() => p.$eval('[data-x="globe"]', (x) => x.click())); await W(p, 2500);
    });
    // Compare: my plan vs the best spot
    await run('compare', async () => {
      await p.$eval('[data-cmp="best"]', (x) => x.click()); await W(p, 7000); await shot(p, 'cmp1');
      await p.evaluate(() => document.querySelector('.cl-bars')?.scrollIntoView()); await W(p, 1500); await shot(p, 'cmp2');
      await p.click('#modeExplorerBtn'); await W(p, 2500);
    });
    // Report
    await p.$eval('[data-go="4"]', (x) => x.click()); await W(p, 2500); await shot(p, 'report');
    await run('report_col', async () => { await p.$eval('[data-r="open"]', (x) => x.click()); await W(p, 2500); await shot(p, 'report_col'); await p.$eval('[data-r="wide"]', (x) => x.click()); await W(p, 2000); await shot(p, 'report_wide'); await p.$eval('[data-r="wide"]', (x) => x.click()); await W(p, 800); await p.$eval('[data-r="close"]', (x) => x.click()); await W(p, 1200); });
    // Help, Lumi, About
    await run('help', async () => { await p.click('[data-x="help"]'); await W(p, 800); await shot(p, 'help'); await clickText(p, 'Guided tour'); await W(p, 2500); await shot(p, 'tour1'); await p.keyboard.press('Escape'); await W(p, 800); });
    await run('lumi', async () => { await p.click('[data-x="lumi"]'); await W(p, 1500); await shot(p, 'lumi0'); const inp = p.locator('.lumi-panel input, [aria-label*="Ask Lumi"] input, textarea').first(); await inp.fill('Is it GO right now?'); await W(p, 300); await shot(p, 'lumi1'); await inp.press('Enter'); await W(p, 3500); await shot(p, 'lumi2'); await p.keyboard.press('Escape'); await W(p, 800); });
    await run('about', async () => { await p.click('[data-x="help"]'); await W(p, 800); await clickText(p, 'Accuracy, data and sources'); await W(p, 2000); await shot(p, 'trust'); await p.keyboard.press('Escape'); await W(p, 800); await p.click('[data-x="help"]'); await W(p, 800); await clickText(p, 'About this project'); await W(p, 2000); await shot(p, 'about'); await p.keyboard.press('Escape'); await W(p, 800); });
    // Terrain 3D and back
    await run('terrain', async () => {
      await p.$eval('[data-go="4"]', (x) => x.click()); await W(p, 1500);
      await Promise.all([p.waitForURL(/planner\.html/, { timeout: 60000 }), p.$eval('[data-r="terrain"]', (x) => x.click())]);
      await p.waitForFunction(() => !!(window.lunarApp && document.querySelector('#vPower .big')), null, { timeout: 120000 }); await W(p, 12000); await shot(p, 'terrain0');
      await W(p, 6000); await shot(p, 'terrain1');
      await Promise.all([p.waitForURL(/#pro/, { timeout: 60000 }), p.$eval('a.mode-link', (a) => a.click())]); await W(p, 8000); await shot(p, 'terrain_back');
    });
    await ctx.close();
  }
  if (only === 'all' || only === 'phone' || only === 'later') {
    const ctx = await b.newContext({ ...devices['iPhone 14 Pro'] }); await ctx.addInitScript(seen); const p = await ctx.newPage();
    await p.goto(BASE + '#pro', { waitUntil: 'load' }); await W(p, 9000); await shot(p, 'phone_pro');
    await p.$eval('[data-go="2"]', (x) => x.click()).catch(() => {}); await W(p, 2500); await shot(p, 'phone_check');
    await ctx.close();
  }
  await b.close();
})();
