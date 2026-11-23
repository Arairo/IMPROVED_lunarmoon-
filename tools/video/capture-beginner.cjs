const { chromium } = require('playwright');
const O = '/tmp/claude-0/v2/cap/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { localStorage.setItem('lsp.theme','dark'); localStorage.setItem('lsp.sound','off'); });
  const p = await ctx.newPage();
  await p.goto('http://localhost:5180/#beginner', { waitUntil: 'load' }); await p.waitForTimeout(7000);
  await p.click('[data-a="next"]'); await p.waitForTimeout(4000);
  const r = await (await p.$('.w-map')).boundingBox(); await p.mouse.click(r.x + r.width * 0.53, r.y + r.height * 0.5); await p.waitForTimeout(4000);
  await p.screenshot({ path: O + 'beg2.png' }); await b.close();
})();
