// Multi-track operations timeline canvas (Sun, Power, Earth, DSN, DTE link).
// Continuous stretches are drawn as rounded bars, power as a smooth area, and
// hovering shows the exact values at that moment.
import { fitCanvas } from './polarMap.js';

const PAL = {
  dark: { row: 'rgba(255,255,255,0.045)', text: '#c7c9d1', tick: '#8e93a0', grid: 'rgba(255,255,255,0.06)', cursor: '#ffffff',
    sun: [255, 179, 0], ok: [48, 209, 88], warn: [255, 159, 10], earth: [56, 160, 255], dsn: [142, 147, 160] },
  light: { row: 'rgba(15,23,42,0.045)', text: '#334155', tick: '#64748b', grid: 'rgba(15,23,42,0.06)', cursor: '#0f172a',
    sun: [232, 145, 0], ok: [36, 170, 72], warn: [230, 130, 0], earth: [0, 113, 227], dsn: [120, 128, 145] },
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Calls fn(startIndex, endIndexExclusive, key) for each run of equal non-null keys. */
function runs(n, keyAt, fn) {
  let start = 0;
  let cur = keyAt(0);
  for (let i = 1; i <= n; i++) {
    const k = i < n ? keyAt(i) : undefined;
    if (k !== cur) {
      if (cur !== null && cur !== undefined) fn(start, i, cur);
      start = i;
      cur = k;
    }
  }
}

export function drawTimeline(canvas, scan, timeMs, config) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!ctx || w < 80 || h < 40 || !scan) return;
  ctx.clearRect(0, 0, w, h);
  const C = document.documentElement.dataset.theme === 'light' ? PAL.light : PAL.dark;
  const pad = { l: 58, r: 10, t: 4, b: 18 };
  const pw = w - pad.l - pad.r;
  const rows = ['Sun', 'Power', 'Earth', 'DSN', 'DTE link'];
  const rowH = (h - pad.t - pad.b) / rows.length;
  const s = scan.series;
  const n = s.times.length;
  const x = (ms) => pad.l + ((ms - scan.startMs) / (scan.endMs - scan.startMs)) * pw;
  const xi = (i) => x(s.times[i]);
  const xe = (i) => (i < n ? xi(i) : pad.l + pw);
  const loadW = config?.power?.loadW || 120;
  const minClear = config?.comms?.minClearanceDeg || 2;
  const barH = Math.max(6, rowH - 7);
  const top = (r) => pad.t + r * rowH + (rowH - barH) / 2;
  const R = Math.min(5, barH / 2);

  // Row backgrounds, labels and day grid.
  ctx.font = '500 11px "Inter", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  rows.forEach((lbl, r) => {
    ctx.fillStyle = C.row;
    roundRect(ctx, pad.l, top(r), pw, barH, R);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.textAlign = 'right';
    ctx.fillText(lbl, pad.l - 8, pad.t + r * rowH + rowH / 2);
  });
  const days = (scan.endMs - scan.startMs) / 86400000;
  if (days <= 120) {
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    const first = Math.ceil(scan.startMs / 86400000) * 86400000;
    const every = days > 45 ? 7 : 1;
    for (let ms = first; ms < scan.endMs; ms += every * 86400000) {
      const gx = Math.round(x(ms)) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, h - pad.b); ctx.stroke();
    }
  }

  // Sun: one bar per lit stretch, brighter where more of the disk is up.
  runs(n, (i) => (s.sunFrac[i] > 0 ? (s.sunFrac[i] >= 0.99 ? 'full' : 'part') : null), (a, b, k) => {
    ctx.fillStyle = rgba(C.sun, k === 'full' ? 0.95 : 0.5);
    roundRect(ctx, xi(a), top(0), xe(b) - xi(a), barH, R);
    ctx.fill();
  });

  // Power: smooth area, green above the lander's load, amber below.
  let maxW = loadW * 1.3;
  for (let i = 0; i < n; i++) maxW = Math.max(maxW, s.watts[i]);
  const y1 = top(1) + barH;
  const py = (wv) => y1 - (barH * wv) / maxW;
  ctx.save();
  roundRect(ctx, pad.l, top(1), pw, barH, R);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(xi(0), y1);
  for (let i = 0; i < n; i++) ctx.lineTo(xi(i), py(s.watts[i]));
  ctx.lineTo(xe(n), py(s.watts[n - 1]));
  ctx.lineTo(xe(n), y1);
  ctx.closePath();
  const loadY = py(loadW);
  const g = ctx.createLinearGradient(0, top(1), 0, y1);
  const split = Math.min(1, Math.max(0, (loadY - top(1)) / barH));
  g.addColorStop(0, rgba(C.ok, 0.95));
  g.addColorStop(split, rgba(C.ok, 0.8));
  g.addColorStop(Math.min(1, split + 0.001), rgba(C.warn, 0.75));
  g.addColorStop(1, rgba(C.warn, 0.55));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = rgba(C.ok, 0.6);
  ctx.beginPath(); ctx.moveTo(pad.l, loadY); ctx.lineTo(pad.l + pw, loadY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Earth: solid where the link is comfortable, faint where Earth only just clears the terrain.
  runs(n, (i) => (s.visible[i] ? (s.los[i] && s.earthClear[i] >= minClear ? 'good' : 'low') : null), (a, b, k) => {
    ctx.fillStyle = rgba(C.earth, k === 'good' ? 0.95 : 0.38);
    roundRect(ctx, xi(a), top(2), xe(b) - xi(a), barH, R);
    ctx.fill();
  });
  runs(n, (i) => (s.dsnAny[i] ? 1 : null), (a, b) => {
    ctx.fillStyle = rgba(C.dsn, 0.55);
    roundRect(ctx, xi(a), top(3), xe(b) - xi(a), barH, R);
    ctx.fill();
  });
  runs(n, (i) => (s.dte[i] ? 1 : null), (a, b) => {
    ctx.fillStyle = rgba(C.ok, 0.95);
    roundRect(ctx, xi(a), top(4), xe(b) - xi(a), barH, R);
    ctx.fill();
  });

  ctx.font = '500 10px "Inter", system-ui, sans-serif';
  ctx.fillStyle = C.tick; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const stepTicks = 6;
  for (let k = 0; k <= stepTicks; k++) {
    const ms = scan.startMs + (k / stepTicks) * (scan.endMs - scan.startMs);
    ctx.textAlign = k === 0 ? 'left' : k === stepTicks ? 'right' : 'center';
    ctx.fillText(fmt.format(ms), x(ms), h - pad.b + 4);
  }

  if (timeMs >= scan.startMs && timeMs <= scan.endMs) {
    const cx = Math.round(x(timeMs)) + 0.5;
    ctx.strokeStyle = C.cursor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, pad.t + 3); ctx.lineTo(cx, h - pad.b); ctx.stroke();
    ctx.fillStyle = C.cursor;
    ctx.beginPath(); ctx.arc(cx, pad.t + 3, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  canvas._tl = { scan, pad, pw, loadW, minClear };
  attachHover(canvas);
}

// Hover tooltip with the exact values at the pointer.
function attachHover(canvas) {
  if (canvas._tlHover) return;
  canvas._tlHover = true;
  const tip = document.createElement('div');
  tip.className = 'tl-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  canvas.addEventListener('pointermove', (e) => {
    const t = canvas._tl;
    if (!t || e.buttons) { tip.hidden = true; return; }
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < t.pad.l || px > t.pad.l + t.pw) { tip.hidden = true; return; }
    const s = t.scan.series;
    const ms = t.scan.startMs + ((px - t.pad.l) / t.pw) * (t.scan.endMs - t.scan.startMs);
    const i = Math.max(0, Math.min(s.times.length - 1, Math.round((ms - t.scan.startMs) / t.scan.stepMs)));
    const sun = s.sunFrac[i] > 0 ? `${Math.round(s.sunFrac[i] * 100)}% of the Sun up` : 'Sun down';
    const earth = !s.visible[i] ? 'Earth hidden' : s.earthClear[i] >= 0 ? `Earth ${s.earthClear[i].toFixed(1)}° above terrain` : 'Earth partly hidden behind terrain';
    tip.innerHTML = `<b>${fmt.format(s.times[i])} UTC</b><span><i class="sun"></i>${sun}</span><span><i class="pow"></i>${Math.round(s.watts[i])} W ${s.watts[i] >= t.loadW ? '(enough)' : '(below load)'}</span><span><i class="earth"></i>${earth}</span><span><i class="dte"></i>Direct link ${s.dte[i] ? 'available' : 'not available'}</span>`;
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = `${Math.min(window.innerWidth - tw - 8, Math.max(8, e.clientX - tw / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - th - 8)}px`;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('pointerdown', () => { tip.hidden = true; });
}
