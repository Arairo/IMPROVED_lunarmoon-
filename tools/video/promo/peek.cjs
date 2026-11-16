const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  await p.goto('file:///tmp/claude-0/promo/comp.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => window.ready());
  for (const t of process.argv.slice(2).map(Number)) {
    await p.evaluate((x) => window.render(x), t);
    await p.screenshot({ path: `/tmp/claude-0/shots/peek_${t}.jpg`, type: 'jpeg', quality: 70 });
  }
  await b.close();
})();
