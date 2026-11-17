// "Map layers" on the 3D Moon: a menu in the view tab bar and a legend card
// with a live readout of the value under the pointer.

import { createMenu } from './menu.js';
import { icon } from './icons.js';
import { LAYERS, loadLayers, ensureDem, renderLayerCanvas, layerValue, legendGradient } from '../scene/mapLayers.js';

const BASE = `${import.meta.env.BASE_URL}data`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mountLayers({ getGlobe, viewTabs }) {
  const gv = document.getElementById('globeViewport');
  if (!viewTabs || !gv) return null;
  let current = null;
  let layers = null;
  let dem = null;
  const canvases = new Map();

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

  function legend(def, readout = '') {
    const lo = def.stops[0][0], hi = def.stops[def.stops.length - 1][0];
    card.innerHTML = `
      <div class="l-head"><b>${esc(def.label)}</b><button type="button" class="l-x" aria-label="Hide map layer" title="Hide layer">${icon('x', 14)}</button></div>
      <small>${esc(def.sub)}</small>
      ${def.id === 'shadow'
        ? `<div class="l-key"><i style="background:${legendGradient('shadow')}"></i> no sunlight in 2027</div>`
        : `<div class="l-bar" style="background:${legendGradient(def.id)}"></div><div class="l-ends"><span>${lo}${def.unit}</span><span>${hi}${def.unit}${def.id === 'sun' || def.id === 'earth' ? '' : '+'}</span></div>`}
      <div class="l-read" aria-live="polite">${readout || 'Point at the Moon to read a value'}</div>
      <p>${esc(def.note)}</p>
      <div class="l-src">${def.id === 'sun' || def.id === 'earth' || def.id === 'shadow'
        ? 'Our model: LOLA terrain skylines, Sun and Earth every 6 h through 2027. 1° cells, 5 km near the poles.'
        : 'NASA LRO LOLA global elevation (LDEM_16).'}</div>`;
    card.querySelector('.l-x').addEventListener('click', () => show(null));
  }

  async function show(id) {
    const globe = getGlobe?.();
    current = id;
    btn.classList.toggle('is-on', !!id);
    btn.setAttribute('aria-pressed', String(!!id));
    if (!id) { card.hidden = true; globe?.setOverlay(null); return; }
    const def = LAYERS.find((l) => l.id === id);
    card.hidden = false;
    legend(def, 'Drawing the map…');
    try {
      if (!layers && (id === 'sun' || id === 'earth' || id === 'shadow')) layers = await loadLayers(BASE);
      if (!dem && (id === 'height' || id === 'slope')) dem = await ensureDem(BASE);
      await new Promise((r) => setTimeout(r, 30)); // let the "Drawing" text paint
      if (current !== id) return;
      if (!canvases.has(id)) canvases.set(id, renderLayerCanvas(id, layers, dem));
      globe?.setOverlay(canvases.get(id), id === 'shadow' ? 1 : 0.78);
      if (id === 'shadow') globe?.southPole?.();
      legend(def);
    } catch (err) {
      console.warn('map layer', err);
      legend(def, 'Could not load this layer.');
    }
  }

  createMenu(btn, () => [
    { head: 'Colour the Moon by' },
    ...LAYERS.map((l) => ({ icon: { sun: 'sun', earth: 'globe', shadow: 'moon', height: 'mountain', slope: 'scale' }[l.id], label: l.label, sub: l.sub, toggle: current === l.id, run: () => show(current === l.id ? null : l.id) })),
    { sep: true },
    { icon: 'x', label: 'No layer', sub: 'Plain LROC imagery', run: () => show(null) },
  ]);

  // Live readout under the pointer (throttled to one per frame).
  let pending = null;
  gv.addEventListener('pointermove', (e) => {
    if (!current || pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      const ll = getGlobe?.()?.latLonAt(e.clientX, e.clientY);
      const out = card.querySelector('.l-read');
      if (!out) return;
      if (!ll) { out.textContent = 'Point at the Moon to read a value'; return; }
      const def = LAYERS.find((l) => l.id === current);
      const v = layerValue(current, layers, dem, ll.lat, ll.lon);
      const where = `${Math.abs(ll.lat).toFixed(1)}°${ll.lat < 0 ? 'S' : 'N'} ${Math.abs(ll.lon).toFixed(1)}°${ll.lon < 0 ? 'W' : 'E'}`;
      let txt;
      if (v == null) txt = current === 'shadow' ? 'outside the polar maps' : 'no data';
      else if (current === 'shadow') txt = v < 0.25 ? 'never sunlit in 2027' : `sunlit ${v.toFixed(0)}% of 2027`;
      else txt = `${current === 'height' ? v.toFixed(2) : v.toFixed(0)}${def.unit}`;
      out.innerHTML = `<b>${esc(txt)}</b> at ${where}`;
    });
  });

  return { show, get current() { return current; } };
}
