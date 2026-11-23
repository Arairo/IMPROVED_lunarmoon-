const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
  await p.goto('file:///tmp/claude-0/v2/promo/promo.html' + (process.env.CUT ? '#' + process.env.CUT : ''), { waitUntil: 'networkidle' }); await p.evaluate(() => window.ready());
  const info = await p.evaluate(() => ({ D: window.DURATION, T: Object.fromEntries(Object.entries(window.T).map(([k, v]) => [k, [+v.start.toFixed(1), +v.end.toFixed(1)]])) }));
  console.log(JSON.stringify(info));
  const times = process.argv.slice(2).map((x) => { const [id, f] = x.split('@'); if (info.T[id]) { const [a, bb] = info.T[id]; return [x, a + (bb - a) * Number(f || 0.5)]; } return [x, Number(x)]; });
  for (const [n, t] of times) { await p.evaluate((t) => window.render(t), t); await p.screenshot({ path: `/tmp/claude-0/v2/promo/peek${process.env.CUT || ''}_${n.replace('@', '_')}.jpg`, type: 'jpeg', quality: 85 }); }
  await b.close();
})();
