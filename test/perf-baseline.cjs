// Repeatable performance baseline (second audit 9.1). Not part of CI: timings depend
// on the machine. Records the conditions with the numbers.
//
//   npm run build && npx vite preview --port 4302 &
//   node test/perf-baseline.cjs http://localhost:4302/ [out.json]
//
// Two profiles: "desktop" (1366 x 820, no throttling) and "phone" (390 x 844, CPU 4x
// slower, ~9 Mbit/s down, 40 ms latency: a mid-range phone on 4G). For each page:
// requests and transfer bytes (cold cache), first and largest contentful paint (FCP,
// LCP), layout shift (CLS), time until the page is usable, the slowest response to a
// click (Event Timing; a stand-in for INP, which needs real users), 20 m tile download,
// and JS heap. Headless Chromium renders WebGL in software, so 3D frame times here
// are not representative of a real GPU.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');

const BASE = (process.argv[2] || 'http://localhost:4302/').replace(/\/?$/, '/');
const OUT = process.argv[3] || null;
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const PROFILES = {
  desktop: { viewport: { width: 1366, height: 820 }, cpu: 1, net: null },
  phone: { viewport: { width: 390, height: 844 }, cpu: 4, net: { latency: 40, downloadThroughput: (9e6 / 8), uploadThroughput: (3e6 / 8) } },
};
const PAGES = [
  { label: 'landing', hash: '', ready: () => !!document.querySelector('#xp-intro .xp-start'), click: '.xp-start' },
  { label: 'beginner', hash: '#beginner', ready: () => !!document.querySelector('.w-say') },
  { label: 'pro', hash: '#pro&id=ridge', ready: () => /GO|CARE/.test(document.querySelector('[data-sub="check"]')?.textContent || ''), click: '[data-go="2"]' },
  { label: 'pro (Artemis region, 20 m tiles)', hash: '#pro&id=a3-mp', ready: () => /GO|CARE/.test(document.querySelector('[data-sub="check"]')?.textContent || '') },
  { label: 'terrain3d', hash: 'planner.html#from=pro&id=ridge', ready: () => !!(window.lunarApp && document.querySelector('#vPower .big')) },
];

(async () => {
  const browser = await chromium.launch({ args: GL });
  const results = { note: 'loadMs = the browser load event (all images); readyMs = when the page is usable, from navigation start', when: new Date().toISOString(), base: BASE, machine: `${os.cpus()[0]?.model} x${os.cpus().length}, ${Math.round(os.totalmem() / 1e9)} GB, ${os.platform()}`, browser: `Chromium ${browser.version()} headless, software WebGL`, server: 'vite preview (gzip for text, binary files as is: like GitHub Pages)', profiles: PROFILES, pages: [] };
  for (const [pname, prof] of Object.entries(PROFILES)) {
    for (const pg of PAGES) {
      const ctx = await browser.newContext({ viewport: prof.viewport });
      // Readiness is timed inside the page from navigation start (polling every 50 ms),
      // not after Playwright's "load" event, which waits for every image.
      await ctx.addInitScript(`window.__readyAt = null; (function poll() { try { if ((${pg.ready.toString()})()) { window.__readyAt = Math.round(performance.now()); return; } } catch (e) {} setTimeout(poll, 50); })();`);
      await ctx.addInitScript(() => {
        try { localStorage.setItem('lsp.proWelcome2', '1'); localStorage.setItem('lsp.controlsSeen', '1'); localStorage.setItem('lsp.welcomeOff', '1'); } catch {}
        window.__lcp = 0; window.__cls = 0; window.__evt = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__evt = Math.max(window.__evt, e.duration); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (prof.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...prof.net });
      if (prof.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
      const reqs = [];
      page.on('requestfinished', async (r) => { try { const s = await r.sizes(); reqs.push({ url: r.url(), bytes: s.responseBodySize + s.responseHeadersSize, ms: r.timing().responseEnd }); } catch {} });
      const t0 = Date.now();
      await page.goto(BASE + pg.hash, { waitUntil: 'load', timeout: 180000 });
      const load = Date.now() - t0;
      let ready = null;
      try { await page.waitForFunction(() => window.__readyAt != null, null, { timeout: 180000, polling: 200 }); ready = await page.evaluate(() => window.__readyAt); } catch {}
      await page.waitForTimeout(6000); // deferred loads (terrain, tiles)
      // A real pointer click (counts as user input, as for a visitor).
      if (pg.click) { await page.click(pg.click, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(1500); }
      const v = await page.evaluate(() => ({ fcp: Math.round(performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint')?.startTime ?? -1), lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(3), slowestClickMs: Math.round(window.__evt), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }));
      const total = reqs.reduce((s, r) => s + r.bytes, 0);
      const tiles = reqs.filter((r) => /\/hires\/.*\.i16z/.test(r.url));
      const ext = [...new Set(reqs.filter((r) => /^https?:/.test(r.url)).map((r) => new URL(r.url).host).filter((h) => h !== new URL(BASE).host))];
      const row = { profile: pname, page: pg.label, requests: reqs.length, transferMB: +(total / 1e6).toFixed(2), loadMs: load, readyMs: ready, ...v, tiles20m: { count: tiles.length, MB: +(tiles.reduce((s, r) => s + r.bytes, 0) / 1e6).toFixed(2) }, externalHosts: ext };
      results.pages.push(row);
      console.log(`${pname.padEnd(8)} ${pg.label.padEnd(34)} ${String(row.requests).padStart(3)} req ${String(row.transferMB).padStart(6)} MB  FCP ${String(v.fcp).padStart(5)}  LCP ${String(v.lcp).padStart(5)}  CLS ${v.cls}  ready ${String(ready).padStart(6)} ms  click ${v.slowestClickMs} ms  tiles ${tiles.length}/${row.tiles20m.MB} MB  heap ${v.heapMB} MB${ext.length ? `  EXTERNAL ${ext}` : ''}`);
      await ctx.close();
    }
  }
  await browser.close();
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
})();
