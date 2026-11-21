// WebGL availability and an honest notice when it is missing. The 3D views
// need WebGL; every number, the South-Pole Map and the timeline do not.
let cached = null;
export function hasWebGL() {
  if (cached !== null) return cached;
  try {
    const c = document.createElement('canvas');
    cached = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { cached = false; }
  return cached;
}

/** Put a short notice over a 3D view's container. */
export function showNoWebGL(container, what = 'The 3D view') {
  if (!container || container.querySelector('.lsp-nowebgl')) return;
  const box = document.createElement('div');
  box.className = 'lsp-nowebgl';
  box.setAttribute('role', 'note');
  box.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;z-index:5;pointer-events:none';
  box.innerHTML = `<p style="max-width:420px;margin:0;padding:14px 18px;border-radius:14px;background:rgba(15,23,42,.92);color:#e2e8f0;font:500 14px/1.5 system-ui,sans-serif;pointer-events:auto"><b style="color:#fbbf24">${what} needs 3D graphics (WebGL), which this browser could not start.</b><br>Every number, the South-Pole Map and the timeline still work. Turning on hardware acceleration in the browser settings usually fixes it.</p>`;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(box);
}

/** Stand-in for a 3D scene when WebGL is missing, so the rest of a view (captions, timers, steps) keeps working. */
export function noScene() {
  const noop = () => {};
  return { setPlan: noop, setIndex: noop, setFastForward: noop, setFollow: noop, resetView: noop, render: noop, dispose: noop, get index() { return 0; } };
}
