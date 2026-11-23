// Charts for the mission report: when (30-day timeline), why (sky from the site),
// where (landing area) and, only when there is a night to survive, power. Each is
// an SVG string (crisp in print and PDF), coloured by CSS tokens (.rc-* in
// experience.css: validated for colour-blind separation on the dark and light
// report surfaces), with direct text labels so colour is never the only cue, a
// one-line plain-English caption and a text alternative for screen readers.
import { horizonAt } from '../core/horizon.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pctTxt = (f) => `${Math.round(f * 100)}%`;
const DAY = 86400000;
const dShort = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dWhen = (ms) => `${dShort(ms)} ${new Date(ms).toISOString().slice(11, 16)}`;
const fmtH = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.round(h)} h`);

/** Runs where flag[i] is truthy: [{ a, b }] in ms (each sample counts until the next one). */
function runs(times, flag, endMs) {
  const out = []; let s = null;
  for (let i = 0; i < times.length; i++) {
    if (flag(i) && s == null) s = times[i];
    if (!flag(i) && s != null) { out.push({ a: s, b: times[i] }); s = null; }
  }
  if (s != null) out.push({ a: s, b: endMs });
  return out;
}
const fig = (cls, title, svg, caption, alt) => `<figure class="rc ${cls}" role="group" aria-label="${esc(title)}">
    <figcaption class="rc-title">${esc(title)}</figcaption>
    <div class="rc-plot" role="img" aria-label="${esc(alt)}">${svg}</div>
    <p class="rc-cap">${caption}</p></figure>`;

/** 1 · When: Sun, Earth, both together and the radio link over the window. */
export function timelineChart(scan) {
  const s = scan.series, t = s.times, n = t.length;
  if (!n) return '';
  const end = t[n - 1] + (s.dtH ? s.dtH[n - 1] * 3600000 : t[1] - t[0]);
  const W = 640, L = 130, R = 52, x0 = L, x1 = W - R, rowH = 18, gap = 12, top = 6;
  const X = (ms) => x0 + ((ms - t[0]) / (end - t[0])) * (x1 - x0);
  const both = (i) => s.lit[i] === 1 && s.los[i] === 1;
  const share = (f) => { let on = 0, all = 0; for (let i = 0; i < n; i++) { const d = s.dtH ? s.dtH[i] : 1; all += d; if (f(i)) on += d; } return all ? on / all : 0; };
  const rows = [
    ['sun', 'Sunlight', (i) => s.lit[i] === 1],
    ['earth', 'Earth in view', (i) => s.los[i] === 1],
    ['both', 'Both together', both],
    ['link', 'Radio link', (i) => s.dte[i] === 1],
  ];
  let g = '';
  rows.forEach(([k, label, f], r) => {
    const y = top + r * (rowH + gap);
    g += `<text class="rc-lab" x="${L - 10}" y="${y + rowH - 4}" text-anchor="end">${label}</text>`;
    g += `<rect class="rc-track" x="${x0}" y="${y}" width="${x1 - x0}" height="${rowH}" rx="4"/>`;
    for (const run of runs(t, f, end)) {
      const a = X(run.a), b = X(run.b);
      g += `<rect class="rc-${k}" x="${a.toFixed(1)}" y="${y}" width="${Math.max(1.5, b - a - 1).toFixed(1)}" height="${rowH}" rx="4"><title>${label}: ${dWhen(run.a)} – ${dWhen(run.b)} UTC</title></rect>`;
    }
    g += `<text class="rc-val" x="${x1 + 8}" y="${y + rowH - 4}">${pctTxt(share(f))}</text>`;
  });
  const yAxis = top + rows.length * (rowH + gap) + 2;
  const days = (end - t[0]) / DAY, stepD = days > 200 ? 30 : days > 60 ? 10 : days > 20 ? 5 : days > 8 ? 2 : 1;
  for (let d = 0; d <= days + 1e-9; d += stepD) {
    const ms = t[0] + d * DAY, x = X(ms);
    if (d > 0 && x - x0 < 92) continue; // keep clear of the "Touchdown" label
    g += `<line class="rc-grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top - 2}" y2="${yAxis}"/><text class="rc-tick" x="${x.toFixed(1)}" y="${yAxis + 17}" text-anchor="${d === 0 ? 'start' : 'middle'}">${d === 0 ? 'Touchdown' : dShort(ms)}</text>`;
  }
  const H = yAxis + 24;
  // Caption: when Earth (the usual limit) and the Sun first go and come back.
  const change = (f, name, setWord, riseWord) => {
    const r = runs(t, f, end);
    if (!r.length) return `${name} is not up in this window`;
    if (r.length === 1 && r[0].a === t[0] && r[0].b === end) return `${name} stays up the whole window`;
    if (r[0].a === t[0]) return `${name} ${setWord} ${dWhen(r[0].b)}${r[1] ? ` and ${riseWord} again ${dWhen(r[1].a)}` : ' and does not return in this window'}`;
    return `${name} ${riseWord} ${dWhen(r[0].a)}`;
  };
  const cap = `${change(rows[0][2], 'The Sun', 'sets', 'rises')}. ${change(rows[1][2], 'Earth', 'sets', 'rises')} (UTC).`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${g}</svg>`;
  return fig('rc-when', 'When: the next ' + Math.round(days) + ' days from touchdown', svg, cap,
    `Timeline. Sunlight ${pctTxt(share(rows[0][2]))}, Earth in view ${pctTxt(share(rows[1][2]))}, both together ${pctTxt(share(both))}, radio link ${pctTxt(share(rows[3][2]))}. ${cap}`);
}

/** 2 · Why: the skyline from the lander, with the Sun's and Earth's paths over the window. */
export function skyChart(scan, horizon) {
  const s = scan.series, n = s.times.length;
  if (!n || !(horizon?.el180 || horizon?.elevations)) return '';
  const W = 640, H = 250, x0 = 46, x1 = W - 10, y0 = 12, y1 = H - 30;
  const sky = Array.from({ length: 181 }, (_, i) => horizonAt(horizon, i * 2));
  const step = Math.max(1, Math.floor(n / 260));
  const pick = []; for (let i = 0; i < n; i += step) pick.push(i);
  const vals = [...sky, ...pick.map((i) => s.sunEl[i]), ...pick.map((i) => s.earthEl[i])];
  const lo = Math.max(-12, Math.floor(Math.min(...vals) - 0.5)), hi = Math.min(30, Math.ceil(Math.max(...vals) + 0.5));
  const X = (az) => x0 + (((az % 360) + 360) % 360 / 360) * (x1 - x0);
  const Y = (el) => y1 - ((el - lo) / (hi - lo)) * (y1 - y0);
  let g = '';
  const tickStep = hi - lo > 16 ? 5 : hi - lo > 6 ? 2 : 1;
  for (let e = Math.ceil(lo / tickStep) * tickStep; e <= hi; e += tickStep) g += `<line class="rc-grid" x1="${x0}" x2="${x1}" y1="${Y(e).toFixed(1)}" y2="${Y(e).toFixed(1)}"/><text class="rc-tick" x="${x0 - 6}" y="${(Y(e) + 3.5).toFixed(1)}" text-anchor="end">${e}°</text>`;
  if (lo < 0 && hi > 0) g += `<line class="rc-zero" x1="${x0}" x2="${x1}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
  [['N', 0], ['E', 90], ['S', 180], ['W', 270], ['N', 360]].forEach(([l, az]) => { g += `<text class="rc-tick" x="${(x0 + (az / 360) * (x1 - x0)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${l}</text>`; });
  const pts = sky.map((e, i) => `${(x0 + (i / 180) * (x1 - x0)).toFixed(1)},${Y(Math.max(lo, e)).toFixed(1)}`).join(' ');
  g += `<polygon class="rc-terrain" points="${x0},${y1} ${pts} ${x1},${y1}"><title>Terrain skyline seen from the lander's 2 m mast</title></polygon>`;
  const dots = (k, az, el, up) => pick.map((i) => `<circle class="rc-${k}${up(i) ? '' : ' rc-hid'}" cx="${X(az[i]).toFixed(1)}" cy="${Y(el[i]).toFixed(1)}" r="2.3"/>`).join('');
  g += dots('earth', s.earthAz, s.earthEl, (i) => s.los[i] === 1) + dots('sun', s.sunAz, s.sunEl, (i) => s.lit[i] === 1);
  // Where each is at touchdown, labelled.
  const mark = (k, label, az, el) => { const x = X(az), y = Y(el), right = x < x1 - 120; return `<circle class="rc-${k} rc-ring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5"/><text class="rc-lab" x="${(x + (right ? 9 : -9)).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${label}</text>`; };
  g += mark('sun', 'Sun at touchdown', s.sunAz[0], s.sunEl[0]) + mark('earth', 'Earth at touchdown', s.earthAz[0], s.earthEl[0]);
  const clear = (el, az) => el - horizonAt(horizon, az);
  const sc = clear(s.sunEl[0], s.sunAz[0]), ec = clear(s.earthEl[0], s.earthAz[0]);
  const cap = `Grey is the terrain the lander sees. Dots are where the <b class="rc-k-sun">Sun</b> and <b class="rc-k-earth">Earth</b> go over the window; faded dots are hidden behind terrain. At touchdown the Sun is ${Math.abs(sc).toFixed(1)}° ${sc >= 0 ? 'above' : 'below'} the skyline and Earth ${Math.abs(ec).toFixed(1)}° ${ec >= 0 ? 'above' : 'below'} it.`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${g}</svg>`;
  return fig('rc-why', 'Why: the sky from the site', svg, cap,
    `Sky chart: skyline elevation from ${Math.min(...sky).toFixed(1)}° to ${Math.max(...sky).toFixed(1)}°. At touchdown the Sun is ${sc.toFixed(1)}° and Earth ${ec.toFixed(1)}° relative to the skyline.`);
}

/** 3 · Where: the landing area, each sampled touchdown point coloured by time with Sun and Earth together. */
export function areaChart(disp, aim) {
  if (!disp?.points?.length) return fig('rc-where', 'Where: the landing area', '<p class="rc-empty">Run <b>Check the landing area</b> in the What if step to add this map.</p>', '', 'Landing-area map not computed yet');
  const W = 640, H = 270, cx = 150, cy = 135, rPx = 112, k = rPx / disp.radiusM;
  const max = Math.max(...disp.points.map((p) => p.both)), min = Math.min(...disp.points.map((p) => p.both));
  const steps = 5, lvl = (v) => (max > min ? Math.min(steps - 1, Math.floor(((v - min) / (max - min)) * steps)) : steps - 1);
  const P = (az, d) => [cx + Math.sin((az * Math.PI) / 180) * d * k, cy - Math.cos((az * Math.PI) / 180) * d * k];
  const dir = (az) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((az % 360) + 360) % 360) / 45) % 8];
  let g = `<circle class="rc-disc" cx="${cx}" cy="${cy}" r="${rPx}"/><line class="rc-grid" x1="${cx}" x2="${cx}" y1="${cy - rPx}" y2="${cy + rPx}"/><line class="rc-grid" x1="${cx - rPx}" x2="${cx + rPx}" y1="${cy}" y2="${cy}"/>`;
  g += `<text class="rc-tick" x="${cx}" y="${cy - rPx - 7}" text-anchor="middle">N</text>`;
  for (const p of disp.points) {
    const [x, y] = P(p.az, p.dist);
    g += `<circle class="rc-seq rc-s${lvl(p.both)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"><title>${p.dist ? `${Math.round(p.dist)} m ${dir(p.az)} of the aim` : 'The aim point'}: Sun and Earth together ${pctTxt(p.both)}</title></circle>`;
  }
  const [wx, wy] = P(disp.worst.az, disp.worst.dist);
  g += `<circle class="rc-worst" cx="${wx.toFixed(1)}" cy="${wy.toFixed(1)}" r="12"/>`;
  g += `<path class="rc-aim" d="M${cx - 13} ${cy}h26M${cx} ${cy - 13}v26"/><circle class="rc-aim" cx="${cx}" cy="${cy}" r="5"/>`;
  let aimTxt = '';
  if (aim?.aim && aim.aim.dist > 0) {
    const [ax, ay] = P(aim.aim.az, aim.aim.dist);
    g += `<path class="rc-arrow" d="M${cx} ${cy}L${ax.toFixed(1)} ${ay.toFixed(1)}" marker-end="url(#rcHead)"/>`;
    aimTxt = ` A safer aim is ${Math.round(aim.aim.dist)} m ${dir(aim.aim.az)} (arrow): at least ${pctTxt(aim.dispersion.p10)} even after a bad landing.`;
  }
  // scale bar and legend
  const bar = 100 * k;
  g += `<path class="rc-axis" d="M${cx - rPx} ${H - 12}h${bar.toFixed(1)}"/><text class="rc-tick" x="${(cx - rPx + bar / 2).toFixed(1)}" y="${H - 16}" text-anchor="middle">100 m</text>`;
  const lx = 330, ly = 40;
  g += `<text class="rc-lab" x="${lx}" y="${ly - 12}">Sun and Earth together, over the window</text>`;
  for (let i = 0; i < steps; i++) g += `<rect class="rc-seq rc-s${i}" x="${lx + i * 52}" y="${ly}" width="50" height="12" rx="3"/>`;
  g += `<text class="rc-tick" x="${lx}" y="${ly + 28}">${pctTxt(min)}</text><text class="rc-tick" x="${lx + steps * 52 - 2}" y="${ly + 28}" text-anchor="end">${pctTxt(max)}</text>`;
  const legend = [['rc-aim-k', 'Your aim point (+)'], ['rc-worst-k', 'Weakest spot (ring)']];
  legend.forEach(([c, t], i) => { g += `<text class="rc-lab ${c}" x="${lx}" y="${ly + 64 + i * 20}">${t}</text>`; });
  if (aimTxt) g += `<text class="rc-lab" x="${lx}" y="${ly + 104}">Safer aim (arrow)</text>`;
  g += `<text class="rc-tick" x="${lx}" y="${ly + 140}">Each dot is one possible touchdown point, ${disp.points.length} in all.</text>`;
  const cap = `If the lander touches down anywhere within ${disp.radiusM} m of the aim, the Sun and Earth are up together ${pctTxt(min)}–${pctTxt(max)} of the time (typical ${pctTxt(disp.p50)}). The weakest spot is ${Math.round(disp.worst.dist)} m ${dir(disp.worst.az)} of the aim.${aimTxt}`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><marker id="rcHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="rc-arrowhead"/></marker></defs>${g}</svg>`;
  return fig('rc-where', `Where: landing anywhere within ${disp.radiusM} m`, svg, cap, cap);
}

/** 4 · Power, only when the panels fall below the load at some point (a night to survive). */
export function powerChart(scan, config) {
  const s = scan.series, n = s.times.length, load = config.power.loadW;
  if (!n || !(scan.stats.batteryKWh > 0.05)) return '';
  const end = s.times[n - 1] + (s.dtH ? s.dtH[n - 1] * 3600000 : 0);
  const W = 640, H = 210, x0 = 52, x1 = W - 12, y0 = 16, y1 = H - 30;
  const maxW = Math.max(load * 1.25, ...s.watts) * 1.05;
  const X = (ms) => x0 + ((ms - s.times[0]) / (end - s.times[0])) * (x1 - x0);
  const Y = (w) => y1 - (w / maxW) * (y1 - y0);
  let g = '';
  for (const r of runs(s.times, (i) => s.watts[i] < load, end)) g += `<rect class="rc-onbat" x="${X(r.a).toFixed(1)}" y="${y0}" width="${Math.max(1, X(r.b) - X(r.a)).toFixed(1)}" height="${y1 - y0}"><title>On battery: ${dWhen(r.a)} – ${dWhen(r.b)} UTC</title></rect>`;
  const wStep = maxW > 400 ? 200 : maxW > 160 ? 50 : 25;
  for (let w = 0; w <= maxW; w += wStep) g += `<line class="rc-grid" x1="${x0}" x2="${x1}" y1="${Y(w).toFixed(1)}" y2="${Y(w).toFixed(1)}"/><text class="rc-tick" x="${x0 - 6}" y="${(Y(w) + 3.5).toFixed(1)}" text-anchor="end">${w}</text>`;
  const line = Array.from(s.watts, (w, i) => `${X(s.times[i]).toFixed(1)},${Y(w).toFixed(1)}`).join(' ');
  g += `<polygon class="rc-sun rc-area" points="${x0},${y1} ${line} ${X(s.times[n - 1]).toFixed(1)},${y1}"/><polyline class="rc-sunline" points="${line}"/>`;
  g += `<line class="rc-load" x1="${x0}" x2="${x1}" y1="${Y(load).toFixed(1)}" y2="${Y(load).toFixed(1)}"/><text class="rc-lab" x="${x1 - 4}" y="${(Y(load) - 6).toFixed(1)}" text-anchor="end">Load ${load} W</text>`;
  g += `<text class="rc-tick" x="${x0}" y="${H - 8}">${dShort(s.times[0])}</text><text class="rc-tick" x="${x1}" y="${H - 8}" text-anchor="end">${dShort(end)}</text><text class="rc-tick" x="${x0 - 6}" y="${y0 - 2}" text-anchor="end">W</text>`;
  const st = scan.stats;
  const cap = `Solar power (line) against the lander's ${load} W load; shaded spans run on the battery. Battery needed: about ${st.batteryKWh.toFixed(1)} kWh with charge losses${st.batteryOpenEnded ? ' (more if the night continues past the window)' : ''}; longest night ${fmtH(st.longestDarkH)}.`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${g}</svg>`;
  return fig('rc-power', 'Power: when the battery has to carry the lander', svg, cap, cap);
}
