const { chromium, devices } = require('playwright');
const OUT = '/tmp/claude-0/promo/cap/';
const URL = 'http://localhost:5180/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  // 1. Intro sunrise stills (full-bleed backgrounds)
  if (false) {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + '?v=1', { waitUntil: 'domcontentloaded' });
    await p.addStyleTag({ content: '.xp-stage > :not(.xp-moon-wrap), .xp-corner { visibility: hidden !important; }' });
    const t0 = Date.now();
    for (const [ms, name] of [[1500, 'intro0'], [2600, 'intro1'], [3800, 'intro2'], [7500, 'intro3']]) {
      await p.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
      await p.screenshot({ path: OUT + name + '.png' });
    }
    await p.close();
  }
  const pro = async (theme = 'dark', vw = 1600, vh = 1000, dsf = 2) => {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf });
    await ctx.addInitScript((th) => { try { localStorage.setItem('lsp.proWelcome2', '1'); localStorage.setItem('lsp.cmpWelcome', '1'); localStorage.setItem('lsp.controlsSeen', '1'); localStorage.setItem('lsp.theme', th); localStorage.setItem('lsp.sound', 'off'); } catch {} }, theme);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + '?v=2#pro', { waitUntil: 'networkidle' });
    await p.waitForTimeout(4500);
    await p.evaluate(() => document.querySelector('.xp-mode-hint')?.classList.remove('is-on'));
    return p;
  };
  // 2a. Time-lapse at 1x
  {
    const p = await pro('dark', 1600, 1000, 1);
    await p.click('[data-go="2"]'); await p.waitForTimeout(900);
    for (let k = 0; k < 48; k++) {
      await p.screenshot({ path: `${OUT}tl${String(k).padStart(2, '0')}.png` });
      await p.evaluate(() => { const b = document.getElementById('stepFwdHourBtn'); for (let i = 0; i < 6; i++) b.click(); });
      await p.waitForTimeout(60);
    }
    await p.context().close();
  }
  // 2. Pro steps
  {
    const p = await pro();
    await p.evaluate(() => { const i = document.getElementById('datetimeInput'); i.value = '2026-11-16T22:00'; i.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(500);
    await p.click('[data-go="3"]'); await p.waitForTimeout(600);
    await p.click('.xp-plan [data-dir="N"]'); await p.waitForTimeout(900);
    await p.screenshot({ path: OUT + 'whatif.png' });
    await p.click('.xp-plan [data-undo]'); await p.waitForTimeout(500);
    await p.click('[data-go="4"]'); await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + 'report.png' });
    // Lumi
    await p.click('[data-go="0"]'); await p.waitForTimeout(400);
    await p.click('[data-x="lumi"]'); await p.waitForTimeout(700);
    await p.screenshot({ path: OUT + 'lumi0.png' });
    await p.fill('#xp-lumi input', 'best date at the ridge in 2027');
    await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + 'lumi1.png' });
    await p.press('#xp-lumi input', 'Enter'); await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + 'lumi2.png' });
    await p.context().close();
  }
  // 3. Light theme hero
  {
    const p = await pro('light');
    await p.click('[data-go="2"]'); await p.waitForTimeout(900);
    await p.screenshot({ path: OUT + 'light.png' });
    await p.context().close();
  }
  // 4. Phone: Beginner
  {
    const ctx = await b.newContext({ ...devices['iPhone 13'] });
    await ctx.addInitScript(() => { try { localStorage.setItem('lsp.theme', 'dark'); localStorage.setItem('lsp.sound', 'off'); } catch {} });
    const p = await ctx.newPage();
    await p.goto(URL + '?v=3#beginner', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + 'phone0.png' });
    await p.click('[data-a="next"]'); await p.waitForTimeout(600);
    await p.click('[data-site="ridge"]'); await p.click('[data-a="next"]'); await p.waitForTimeout(900);
    await p.evaluate(() => document.querySelector('.w-calbox')?.scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + 'phone1.png' });
    await p.click('[data-a="next"]'); await p.waitForTimeout(1800);
    await p.screenshot({ path: OUT + 'phone2.png' });
    for (let i = 0; i < 3; i++) { await p.click('[data-a="next"]'); await p.waitForTimeout(1200); }
    await p.screenshot({ path: OUT + 'phone3.png' });
    await ctx.close();
  }
  console.log('errors', errs);
  await b.close();
})();
