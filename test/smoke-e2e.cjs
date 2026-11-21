// Browser smoke test of the core journeys, run in CI against the production build.
//
//   npm run build && npx vite preview --port 4174 &
//   node test/smoke-e2e.cjs http://localhost:4174/
//
// Needs Playwright with Chromium (CI installs it; see .github/workflows/deploy.yml).
// Each check is independent and reports PASS/FAIL; exit code 1 if any fail.
// The older, much longer test/browser-e2e.cjs drives the Terrain 3D page (planner.html).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:4174/').replace(/\/?$/, '/');
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = [];
const quiet = () => { try { localStorage.setItem('lsp.proWelcome2', '1'); localStorage.setItem('lsp.controlsSeen', '1'); localStorage.setItem('lsp.introSeen', '1'); } catch {} };
const assert = (c, m) => { if (!c) throw new Error(m); };

async function check(name, fn) {
  const t0 = Date.now();
  try { const d = await fn(); results.push(['PASS', name, d || '', Date.now() - t0]); }
  catch (e) { results.push(['FAIL', name, String(e.message || e).slice(0, 400), Date.now() - t0]); }
}
async function open(browser, hash, { viewport = { width: 1366, height: 820 }, block = null } = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.addInitScript(quiet);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (block) await page.route(block, (r) => r.abort());
  await page.goto(BASE + hash, { waitUntil: 'load', timeout: 90000 });
  return { ctx, page, errors };
}
const goStep = (page, i) => page.$eval(`[data-go="${i}"]`, (b) => b.click());
const sub = (page, k) => page.$eval(`[data-sub="${k}"]`, (e) => e.textContent);

(async () => {
  const browser = await chromium.launch({ args: GL });

  await check('Beginner mode loads its first chapter', async () => {
    const { ctx, page, errors } = await open(browser, '#beginner');
    await page.waitForSelector('.w-say, .w-scene', { timeout: 60000 });
    const t = await page.$eval('.w-say, .w-scene', (e) => e.innerText.slice(0, 80));
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
    return t.replace(/\s+/g, ' ');
  });

  await check('Beginner with a saved spot of your own: full terrain loads first (not the 5 km fallback)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('lsp.walk', JSON.stringify({ step: 2, visited: 2, startMs: Date.UTC(2026, 10, 16, 22), site: { id: 'custom-x', name: 'Your spot', short: 'Your spot', lat: -89.3, lon: -140, group: 'custom' } })); } catch {} });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const got = [];
    page.on('requestfinished', (r) => { if (/sp_fine\.bin|global_dem\.bin/.test(r.url())) got.push(r.url().split('/').pop()); });
    await page.goto(BASE + '#beginner', { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('.w-say', { timeout: 60000 });
    await page.waitForTimeout(1500);
    assert(got.includes('sp_fine.bin'), `terrain requests: ${got.join(', ') || 'none'}`);
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
    return `loaded ${got.join(', ')} before the chapter`;
  });

  await check('Landing page does not download the terrain grids', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
    const page = await ctx.newPage();
    const got = [];
    page.on('requestfinished', (r) => { if (/\.bin$/.test(r.url())) got.push(r.url().split('/').pop()); });
    await page.goto(BASE, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(4000);
    assert(!got.length, `downloaded ${got.join(', ')}`);
    await ctx.close();
    return 'no .bin files';
  });

  await check('Pro mode: site, date, Check verdict, power and radio settings, compare, flight, exports', async () => {
    const { ctx, page, errors } = await open(browser, '#pro&id=ridge&t=2027-03-01T00:00Z');
    await page.waitForFunction(() => /GO|CARE/.test(document.querySelector('[data-sub="check"]')?.textContent || ''), null, { timeout: 60000 });
    const out = { site: await sub(page, 'site'), verdict: await sub(page, 'check') };
    // Change the date in the Date step.
    await goStep(page, 1);
    await page.$eval('[data-dt]', (i) => { i.value = '2027-06-15T12:00'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForFunction(() => /15 Jun 2027/.test(document.querySelector('[data-sub="date"]')?.textContent || ''), null, { timeout: 30000 });
    // Power and radio assumptions through the settings dialog.
    await page.$eval('#settingsOpenBtn', (b) => b.click());
    await page.$eval('#settingsForm', (f) => { f.loadW.value = '300'; f.dataRateKbps.value = '1000'; f.minClearanceDeg.value = '0'; f.requestSubmit(); });
    await page.waitForTimeout(1500);
    // Check step after the change.
    await goStep(page, 2);
    await page.waitForSelector('.f-step[data-step="2"] .f-overall', { timeout: 30000 });
    out.after = await page.$eval('.f-step[data-step="2"] .f-overall', (e) => e.textContent.trim().split('\n')[0]);
    // Add the plan to compare.
    const addBtn = page.getByRole('button', { name: /Add this plan to compare/ });
    await addBtn.first().click();
    await page.waitForTimeout(800);
    out.compare = await page.$eval('#modeCompareBtn', (b) => b.textContent.replace(/\s+/g, ' ').trim());
    assert(/1/.test(out.compare), `compare count: ${out.compare}`);
    // Flight tab: the burn table.
    await page.$eval('[data-x="flight"]', (b) => b.click());
    await page.waitForTimeout(2500);
    await page.$eval('[data-tab="burns"]', (b) => b.click());
    const burns = await page.$$eval('.fl-table tr', (r) => r.length);
    assert(burns >= 6, `burn rows ${burns}`);
    await page.$eval('#tabGlobeBtn, [data-x="globe"]', (b) => b.click()).catch(() => {});
    // Report: JSON and CSV downloads carry provenance and assumptions.
    await goStep(page, 4);
    await page.waitForTimeout(1500);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-'));
    const save = async (sel) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.$eval(sel, (b) => b.click())]); const p = path.join(dir, d.suggestedFilename()); await d.saveAs(p); return fs.readFileSync(p, 'utf8'); };
    const json = JSON.parse(await save('[data-r="json"]'));
    assert(json.reportVersion === 2 && json.build && json.build.version, 'build info');
    assert(json.site.terrainQuality && json.site.terrainQuality.tier, 'terrain quality');
    assert(json.spacecraft.power.loadW === 300, `load from settings: ${json.spacecraft.power.loadW}`);
    assert(json.spacecraft.comms.minClearanceDeg === 0, `0° clearance kept: ${json.spacecraft.comms.minClearanceDeg}`);
    assert(json.assumptions && json.assumptions.communications.notModelled.length > 3, 'radio assumptions');
    assert(json.flight.modelInfo && /preliminary/.test(json.flight.modelInfo.status), 'flight model status');
    assert(Array.isArray(json.datasets) && json.datasets.some((d) => d.files.some((f) => /^[0-9a-f]{64}$/.test(f.sha256))), 'dataset checksums');
    assert(json.ephemerisCheck.status === 'checked', 'epoch label');
    const csv = await save('[data-r="csv"]');
    assert(/^# Lunar Site Planner time series/.test(csv) && /# Generated .* by Lunar Site Planner/.test(csv) && /manifest\.json/.test(csv), 'CSV header provenance');
    assert(csv.split('\n').filter((l) => /^\d{4}-/.test(l)).length > 100, 'CSV rows');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
    return JSON.stringify(out);
  });

  await check('Phone size (iPhone 14): no sideways scroll, Check step reachable', async () => {
    const { ctx, page, errors } = await open(browser, '#pro&id=a11', { viewport: { width: 390, height: 844 } });
    await page.waitForFunction(() => /GO|CARE/.test(document.querySelector('[data-sub="check"]')?.textContent || ''), null, { timeout: 60000 });
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(sw[0] <= sw[1], `scrollWidth ${sw[0]} > ${sw[1]}`);
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
    return `width ${sw[0]}/${sw[1]}`;
  });

  await check('Terrain files unavailable: a custom south-polar point is flagged "Approximate terrain"', async () => {
    const { ctx, page, errors } = await open(browser, '#pro&site=-86.2,40', { block: /data\/(sp_fine|sp_coarse|global_dem)\.(bin|json)/ });
    await page.waitForTimeout(4000);
    const w = await page.$$eval('.lsp-terrain-warn', (els) => els.map((e) => e.textContent));
    assert(w.length && /Approximate terrain/.test(w[0]), `warnings: ${JSON.stringify(w)}`);
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
    return w[0].slice(0, 70);
  });

  await check('Invalid inputs: bad coordinates and dates in a shared link are ignored, not crashed on', async () => {
    const { ctx, page, errors } = await open(browser, '#pro&site=999,abc&t=not-a-date');
    await page.waitForFunction(() => /GO|CARE/.test(document.querySelector('[data-sub="check"]')?.textContent || ''), null, { timeout: 60000 });
    const site = await sub(page, 'site');
    assert(!/NaN|undefined|Infinity/.test(await page.evaluate(() => document.body.innerText)), 'no NaN/undefined on the page');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
    return `fell back to ${site}`;
  });
  await browser.close();

  await check('No WebGL: the 3D views explain themselves and the numbers still work', async () => {
    const b = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
    const { page, errors } = await open(b, '#pro&id=ridge');
    await page.waitForFunction(() => /GO|CARE/.test(document.querySelector('[data-sub="check"]')?.textContent || ''), null, { timeout: 60000 });
    const note = await page.$eval('#globeViewport .lsp-nowebgl', (e) => e.textContent).catch(() => null);
    assert(note && /WebGL/.test(note), 'notice on the 3D Moon');
    const polar = await page.$eval('#polarViewport', (e) => !e.classList.contains('hidden'));
    assert(polar, 'South-Pole Map shown instead');
    await page.$eval('[data-x="flight"]', (x) => x.click());
    await page.waitForTimeout(1500);
    const fl = await page.$('#flightViewport .lsp-nowebgl');
    assert(fl, 'notice on the Flight view');
    assert(!errors.length, errors.join(' | '));
    await b.close();
    return 'notice + 2D map';
  });

  const pass = results.filter((r) => r[0] === 'PASS').length;
  for (const [s, n, d, ms] of results) console.log(`${s === 'PASS' ? 'PASS' : 'FAIL'} ${n} (${(ms / 1000).toFixed(1)} s)${d ? `\n     ${d}` : ''}`);
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
