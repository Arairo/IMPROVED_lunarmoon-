// "Map layers" on the 3D Moon: a menu in the view tab bar and a legend card
// with a time switch (Now / Your 30 days / Year 2027) and a live readout.
//   Now           follows the timeline: scrub or press Play and the shadows move.
//   Your 30 days  share of your planning window (what the Check step judges).
//   Year 2027     the long-run picture, precomputed.

import { createMenu } from './menu.js';
import { icon } from './icons.js';
import { LAYERS, loadLayers, ensureDem, renderLayerCanvas, layerValue, legendGradient, ramp } from '../scene/mapLayers.js';
import { buildCells, parseSkylines, nowState, windowShare, cellIndexAt, pixelCells, paintCells, makeLut } from '../scene/layerTime.js';

const BASE = `${import.meta.env.BASE_URL}data`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TIMED = new Set(['sun', 'earth', 'both']);
const MODES = [['now', 'Now'], ['window', 'Your 30 days'], ['year', 'Year 2027']];
const W = 2048;
const fmt = (ms, time = true) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}), timeZone: 'UTC' });

// Colours for the "Now" layers (value = bit 1 Sun up, bit 2 Earth up).
const DARK = [12, 16, 38, 205];
const NOW_LUT = {
  sun: makeLut((v) => (v & 1 ? [255, 214, 102, 60] : DARK)),
  earth: makeLut((v) => (v & 2 ? [56, 189, 248, 120] : DARK)),
  both: makeLut((v) => (v === 3 ? [48, 209, 88, 150] : v === 1 ? [255, 179, 0, 95] : v === 2 ? [56, 189, 248, 110] : DARK)),
};
const NOW_KEY = {
  sun: [['rgb(255,214,102)', 'Sun up (lit)'], ['rgb(12,16,38)', 'Sun below the skyline']],
  earth: [['rgb(56,189,248)', 'Earth in view'], ['rgb(12,16,38)', 'Earth hidden']],
  both: [['rgb(48,209,88)', 'Sun and Earth'], ['rgb(255,179,0)', 'Sun only'], ['rgb(56,189,248)', 'Earth only'], ['rgb(12,16,38)', 'Neither']],
};
const pctLut = (id) => makeLut((v) => ramp(LAYERS.find((l) => l.id === id).stops, v / 2));

export function mountLayers({ getGlobe, viewTabs, app }) {
  const gv = document.getElementById('globeViewport');
  if (!viewTabs || !gv) return null;
  let current = null;
  let mode = 'now';
  let layers = null, dem = null, sky = null, cells = null, pix = null;
  let nowVals = null, nowMs = null;
  let win = null, winKey = null, winJob = 0;
  const canvases = new Map();
  const dyn = document.createElement('canvas');
  dyn.width = W; dyn.height = W / 2;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'xp-viewtab';
  btn.dataset.x = 'layers';
  btn.title = 'Colour the Moon by sunlight, Earth in view, shadow, height or slope';
  btn.innerHTML = `${icon('layers', 14)} <span>Map layers</span>`;
  viewTabs.insertBefore(btn, viewTabs.querySelector('[data-x="terrain"]'));

  const card = document.createElement('div');
  card.className = 'xp-layer-card';
  card.hidden = true;
  gv.appendChild(card);

  const def = () => LAYERS.find((l) => l.id === current);
  const winLabel = () => `${fmt(app.windowStartMs, false)} – ${fmt(app.windowStartMs + app.windowDays * 86400000, false)}`;

  function legend(status = '') {
    const d = def();
    const timed = TIMED.has(d.id);
    const lo = d.stops[0][0], hi = d.stops[d.stops.length - 1][0];
    const label = timed && mode === 'now' ? d.label.replace('Sunlight', 'Sunlight now').replace('Earth in view', 'Earth in view now').replace('together', 'together now') : d.label;
    const scale = timed && mode === 'now'
      ? `<div class="l-keys">${NOW_KEY[d.id].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>`
      : d.id === 'shadow'
        ? `<div class="l-key"><i style="background:${legendGradient('shadow')}"></i> no sunlight in 2027</div>`
        : `<div class="l-bar" style="background:${legendGradient(d.id)}"></div><div class="l-ends"><span>${lo}${d.unit}</span><span>${hi}${d.unit}${timed ? '' : '+'}</span></div>`;
    const when = !timed ? '' : mode === 'now' ? `At ${fmt(app.timeMs)} UTC. Follows the timeline: scrub or press Play.` : mode === 'window' ? `Share of your window, ${winLabel()}.` : 'Share of the whole of 2027.';
    card.innerHTML = `
      <div class="l-head"><b>${esc(label)}</b><button type="button" class="l-x" aria-label="Hide map layer" title="Hide layer">${icon('x', 14)}</button></div>
      ${timed ? `<div class="l-modes" role="group" aria-label="Time">${MODES.map(([m, t]) => `<button type="button" data-m="${m}" class="${m === mode ? 'is-on' : ''}" aria-pressed="${m === mode}">${t}</button>`).join('')}</div>` : ''}
      <small>${esc(timed ? when : d.sub)}</small>
      ${scale}
      <div class="l-read" aria-live="polite">${esc(status) || 'Point at the Moon to read a value'}</div>
      <p>${esc(d.note)}</p>
      <div class="l-src">${timed || d.id === 'shadow'
        ? 'Our model: LOLA terrain skylines (2 m mast), Sun and Earth centres. 1° cells, 5 km cells poleward of 75°.'
        : 'NASA LRO LOLA global elevation (LDEM_16).'}</div>`;
    card.querySelector('.l-x').addEventListener('click', () => show(null));
    card.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; draw(); }));
  }
  const setStatus = (t) => { const r = card.querySelector('.l-read'); if (r) r.textContent = t; };

  async function ensureTimeData() {
    if (!layers) layers = await loadLayers(BASE);
    if (!sky) {
      const [json, buf] = await Promise.all([
        fetch(`${BASE}/layer_skylines.json`).then((r) => r.json()),
        fetch(`${BASE}/layer_skylines.bin`).then((r) => r.arrayBuffer()),
      ]);
      sky = parseSkylines(json, new Int8Array(buf));
      cells = buildCells(layers.meta);
      pix = pixelCells(layers.meta, W);
    }
  }

  function paintNow() {
    nowVals = nowState(cells, sky, app.timeMs, nowVals || undefined);
    nowMs = app.timeMs;
    paintCells(dyn, pix, nowVals, NOW_LUT[current]);
    getGlobe?.()?.setOverlay(dyn, 1);
  }

  async function paintWindow() {
    const key = `${app.windowStartMs}|${app.windowDays}`;
    if (key !== winKey || !win) {
      const job = ++winJob;
      setStatus('Working out every spot for your window… 0%');
      const res = await windowShare(cells, sky, app.windowStartMs, app.windowDays, {
        onProgress: (f) => { if (job === winJob) setStatus(`Working out every spot for your window… ${Math.round(f * 100)}%`); },
        isCancelled: () => job !== winJob,
      });
      if (!res || job !== winJob) return;
      win = res; winKey = key;
      setStatus('Point at the Moon to read a value');
    }
    paintCells(dyn, pix, win[current], pctLut(current));
    getGlobe?.()?.setOverlay(dyn, 0.85);
  }

  async function draw() {
    const id = current;
    if (!id) return;
    legend('Drawing the map…');
    try {
      await new Promise((r) => setTimeout(r, 20)); // let the text paint first
      if (TIMED.has(id) && mode !== 'year') {
        await ensureTimeData();
        if (current !== id) return;
        if (mode === 'now') { paintNow(); setStatus('Point at the Moon to read a value'); } else await paintWindow();
        return;
      }
      if (!layers && (TIMED.has(id) || id === 'shadow')) layers = await loadLayers(BASE);
      if (!dem && (id === 'height' || id === 'slope')) dem = await ensureDem(BASE);
      if (current !== id) return;
      if (!canvases.has(id)) canvases.set(id, renderLayerCanvas(id, layers, dem));
      getGlobe?.()?.setOverlay(canvases.get(id), id === 'shadow' ? 1 : 0.78);
      setStatus('Point at the Moon to read a value');
    } catch (err) {
      console.warn('map layer', err);
      setStatus('Could not load this layer.');
    }
  }

  function show(id) {
    current = id;
    btn.classList.toggle('is-on', !!id);
    btn.setAttribute('aria-pressed', String(!!id));
    if (!id) { card.hidden = true; getGlobe?.()?.setOverlay(null); winJob++; return; }
    card.hidden = false;
    if (id === 'shadow') getGlobe?.()?.southPole?.();
    draw();
  }

  createMenu(btn, () => [
    { head: 'Colour the Moon by' },
    ...LAYERS.map((l) => ({ icon: { sun: 'sun', earth: 'globe', both: 'check', shadow: 'moon', height: 'mountain', slope: 'scale' }[l.id], label: l.label, sub: l.sub, toggle: current === l.id, run: () => show(current === l.id ? null : l.id) })),
    { sep: true },
    { icon: 'x', label: 'No layer', sub: 'Plain LROC imagery', run: () => show(null) },
  ]);

  // Follow the timeline: redraw "Now" as time moves (at most ~6 times a second),
  // and the window view when the planning window changes.
  let timer = null;
  window.addEventListener('lsp-time', () => {
    if (!current || !TIMED.has(current) || mode === 'year' || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!cells || !current || !TIMED.has(current)) return;
      if (mode === 'now' && app.timeMs !== nowMs) {
        paintNow();
        const small = card.querySelector('small');
        if (small) small.textContent = `At ${fmt(app.timeMs)} UTC. Follows the timeline: scrub or press Play.`;
      } else if (mode === 'window' && `${app.windowStartMs}|${app.windowDays}` !== winKey) draw();
    }, 160);
  });

  // Live readout under the pointer (one per frame).
  let pending = null;
  gv.addEventListener('pointermove', (e) => {
    if (!current || pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      const ll = getGlobe?.()?.latLonAt(e.clientX, e.clientY);
      const out = card.querySelector('.l-read');
      if (!out || /Working|Drawing/.test(out.textContent)) return;
      if (!ll) { out.textContent = 'Point at the Moon to read a value'; return; }
      const d = def();
      const where = `${Math.abs(ll.lat).toFixed(1)}°${ll.lat < 0 ? 'S' : 'N'} ${Math.abs(ll.lon).toFixed(1)}°${ll.lon < 0 ? 'W' : 'E'}`;
      let txt;
      if (TIMED.has(current) && mode === 'now' && nowVals) {
        const v = nowVals[cellIndexAt(layers.meta, ll.lat, ll.lon)];
        txt = { sun: v & 1 ? 'Sun up' : 'Sun down', earth: v & 2 ? 'Earth in view' : 'Earth hidden', both: ['Neither', 'Sun only', 'Earth only', 'Sun and Earth'][v] }[current];
      } else if (TIMED.has(current) && mode === 'window' && win) {
        txt = `${Math.round(win[current][cellIndexAt(layers.meta, ll.lat, ll.lon)] / 2)}% of your window`;
      } else {
        const v = layerValue(current, layers, dem, ll.lat, ll.lon);
        if (v == null) txt = current === 'shadow' ? 'outside the polar maps' : 'no data';
        else if (current === 'shadow') txt = v < 0.25 ? 'never sunlit in 2027' : `sunlit ${v.toFixed(0)}% of 2027`;
        else txt = `${current === 'height' ? v.toFixed(2) : v.toFixed(0)}${d.unit}${TIMED.has(current) ? ' of 2027' : ''}`;
      }
      out.innerHTML = `<b>${esc(txt)}</b> at ${where}`;
    });
  });

  return { show, setMode: (m) => { mode = m; if (current) draw(); }, get current() { return current; } };
}
