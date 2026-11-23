const { chromium } = require('playwright');
const fs = require('fs');
const FPS = 30;
(async () => {
  const from = Number(process.argv[2] || 0), to = process.argv[3] ? Number(process.argv[3]) : null;
  fs.mkdirSync('/tmp/claude-0/v2/promo/frames' + (process.env.CUT || ''), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  await p.goto('file:///tmp/claude-0/v2/promo/promo.html' + (process.env.CUT ? '#' + process.env.CUT : ''), { waitUntil: 'networkidle' });
  await p.evaluate(() => window.ready());
  const D = await p.evaluate(() => window.DURATION);
  const N = Math.round(D * FPS);
  const end = to === null ? N : Math.min(N, Math.round(to * FPS));
  for (let f = Math.round(from * FPS); f < end; f++) {
    await p.evaluate((t) => window.render(t), f / FPS);
    await p.screenshot({ path: `/tmp/claude-0/v2/promo/frames${process.env.CUT||""}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
  }
  await b.close();
  console.log('done', from, end);
})();
