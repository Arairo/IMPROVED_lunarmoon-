// Cinematic opening: a lunar sunrise over a starfield (daylight sweeps across
// the Moon while Earth rises beside it), the title,
// then Start splits into the two modes (Beginner / Professional).

import { icon } from './icons.js';
import * as THREE from 'three';
import { play, soundOn, toggleSound } from './sound.js';

/**
 * Night sky behind the intro: a few thousand stars, a faint Milky Way band and
 * a gentle twinkle. Drawn once to an offscreen layer; only ~80 stars animate.
 * Returns a stop() function.
 */
function starfield(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const still = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, alive = true, base = null, twinklers = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function build() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    base = document.createElement('canvas');
    base.width = canvas.width; base.height = canvas.height;
    const b = base.getContext('2d');
    b.scale(dpr, dpr);
    // Milky Way: a soft diagonal band of glow and dust.
    const ang = -0.42, cx = w * 0.5, cy = h * 0.55;
    const along = (t) => [cx + Math.cos(ang) * t, cy + Math.sin(ang) * t];
    for (let k = 0; k < 26; k++) {
      const [x, y] = along(rnd(-0.75, 0.75) * Math.hypot(w, h));
      const r = rnd(0.08, 0.2) * Math.max(w, h);
      const g = b.createRadialGradient(x, y, 0, x, y, r);
      const warm = Math.random() < 0.35;
      g.addColorStop(0, warm ? 'rgba(255, 214, 170, 0.055)' : 'rgba(150, 175, 255, 0.05)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      b.fillStyle = g; b.fillRect(0, 0, w, h);
    }
    const star = (x, y, r, a, tint) => {
      b.fillStyle = `rgba(${tint}, ${a})`;
      b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fill();
    };
    const tints = ['255, 255, 255', '210, 225, 255', '255, 236, 210', '190, 210, 255'];
    const n = Math.round((w * h) / 900);
    for (let i = 0; i < n; i++) star(rnd(0, w), rnd(0, h), rnd(0.25, 0.9), rnd(0.15, 0.75), tints[i % 4]);
    // Denser, finer stars along the band.
    for (let i = 0; i < n * 1.4; i++) {
      const [x, y] = along(rnd(-0.75, 0.75) * Math.hypot(w, h));
      const off = (Math.random() + Math.random() + Math.random() - 1.5) * h * 0.14;
      star(x - Math.sin(ang) * off, y + Math.cos(ang) * off, rnd(0.2, 0.6), rnd(0.1, 0.5), tints[i % 4]);
    }
    twinklers = Array.from({ length: Math.round(n / 14) }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(0.7, 1.6), p: rnd(0, 6.28), f: rnd(0.6, 1.8), dpr }));
  }
  const frame = (t) => {
    if (!alive) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    for (const s of twinklers) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.p + (t / 1000) * s.f));
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
      g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2); ctx.fill();
    }
    if (!still) raf = requestAnimationFrame(frame);
  };
  build();
  raf = requestAnimationFrame(frame);
  const onResize = () => { build(); if (still) frame(0); };
  addEventListener('resize', onResize);
  return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', onResize); };
}

/**
 * A real 3D Moon that is "flicked": it starts spinning fast and coasts to a
 * stop, like a desk globe. Angle follows total * (1 - e^(-t/tau)), so the
 * speed decays smoothly. Returns a function that frees the WebGL context.
 */
function spinMoon(canvas, base) {
  const still = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    canvas.style.background = `center / cover url('${base}data/moonGlobal.jpg')`;
    canvas.style.borderRadius = '50%';
    return () => {};
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  // The canvas is 1.6x the Moon's box so Earth can rise beside it; the camera
  // is pulled back to keep the Moon the same size on screen.
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  camera.position.set(0, 0, 4.1 * 1.6);
  const ambient = new THREE.AmbientLight(0xffffff, 0.02);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.8);
  // Lunar sunrise: the Sun starts behind the Moon (a thin bright rim) and swings
  // round to the upper right, sweeping daylight across the face.
  const SUN_FROM = new THREE.Vector3(1.2, 0.5, -4.5);
  const SUN_TO = new THREE.Vector3(4, 1.6, 2.2);
  sun.position.copy(SUN_FROM);
  scene.add(sun);
  // A small Earth rising over the lower-left limb (it is far behind the Moon).
  const earthMat = new THREE.MeshStandardMaterial({ color: 0x223355, roughness: 0.8, metalness: 0, transparent: true, opacity: 0 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 32), earthMat);
  earth.position.set(-1.45, -1.5, -1.2);
  earth.rotation.set(0.35, 0, 0.4);
  scene.add(earth);
  new THREE.TextureLoader().load(`${base}data/earth_blue_marble_2k.jpg`, (et) => {
    if ('colorSpace' in et) et.colorSpace = THREE.SRGBColorSpace;
    earthMat.map = et; earthMat.color.set(0xffffff); earthMat.needsUpdate = true;
  });
  const EARTH_FROM = new THREE.Vector3(-1.45, -1.5, -1.2);
  const EARTH_TO = new THREE.Vector3(-1.32, -0.86, -1.2);
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const loader = new THREE.TextureLoader();
  let ready = false;
  const tex = loader.load(`${base}data/moonGlobal.jpg`, () => { ready = true; });
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
  moon.rotation.z = 0.12;
  scene.add(moon);
  loader.load(`${base}data/moon_wac_global_4k.jpg`, (hi) => {
    if ('colorSpace' in hi) hi.colorSpace = THREE.SRGBColorSpace;
    mat.map = hi; mat.needsUpdate = true;
  });
  const TOTAL = still ? 0 : Math.PI * 7; // three and a half turns
  const TAU = 1.15; // seconds; the spin is ~99% done after 5*TAU
  const END = -Math.PI / 2; // stop with the near side (the face we see from Earth) toward us
  // Spin time only advances once the image is in and at most 1/30 s per frame,
  // so a busy page (the app booting behind the intro) cannot skip the spin.
  let raf = 0, last = 0, s = 0, alive = true;
  const frame = (t) => {
    if (!alive) return;
    const dt = last ? Math.min(0.033, (t - last) / 1000) : 0;
    last = t;
    if (ready) s += dt;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && (canvas.width !== Math.round(w * renderer.getPixelRatio()))) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    moon.rotation.y = END - TOTAL * Math.exp(-s / TAU);
    const k = still ? 1 : ease((s - 0.5) / 3.6);
    sun.position.lerpVectors(SUN_FROM, SUN_TO, k);
    ambient.intensity = 0.02 + 0.06 * k;
    const ke = still ? 1 : ease((s - 1.4) / 4.2);
    earth.position.lerpVectors(EARTH_FROM, EARTH_TO, ke);
    earthMat.opacity = Math.min(1, ke * 2.5);
    earth.rotation.y += dt * 0.15;
    canvas.parentElement?.style.setProperty('--sunrise', k.toFixed(3));
    renderer.render(scene, camera);
    if (s < TAU * 7) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    mat.map?.dispose(); mat.dispose(); moon.geometry.dispose();
    earthMat.map?.dispose(); earthMat.dispose(); earth.geometry.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  };
}

export function mountIntro({ onChoose, onAbout, siteCount = 29 }) {
  const base = import.meta.env.BASE_URL;
  const el = document.createElement('div');
  el.id = 'xp-intro';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Welcome to Lunar Site Planner');
  el.innerHTML = `
    <canvas class="xp-sky" aria-hidden="true"></canvas>
    <div class="xp-corner"><button type="button" class="xp-skip xp-sound" data-sound-label aria-pressed="${soundOn()}" aria-label="${soundOn() ? 'Mute sounds' : 'Turn sounds on'}">${icon(soundOn() ? 'volume' : 'volumeOff', 16)}</button><button type="button" class="xp-skip">Skip intro</button></div>
    <div class="xp-stage">
      <div class="xp-moon-wrap">
        <div class="xp-moon-glow"></div>
        <div class="xp-flare" aria-hidden="true"><i></i></div>
        <canvas class="xp-moon xp-moon3d" aria-hidden="true"></canvas>
      </div>
      <div class="xp-eyebrow">NASA Space Apps 2026 · Lunar south pole</div>
      <h1 class="xp-title">Lunar Site Planner</h1>
      <p class="xp-tagline">Find where the Sun keeps your lander powered and Earth stays in view to call home.</p>
      <div class="xp-modes-wrap">
        <div class="xp-cta"><button type="button" class="xp-btn xp-btn-light xp-start">Start</button></div>
        <div class="xp-modes" role="group" aria-label="Choose a mode">
          <button type="button" class="xp-mode" data-mode="beginner">
            <div class="xp-mode-icon" style="background:linear-gradient(135deg,#ffb300,#ff7a00)">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>
            </div>
            <h3>Beginner</h3>
            <p>A calm walk with Lumi. One question at a time, with the “why” whenever you want it.</p>
            <span class="xp-go">Take the walk →</span>
          </button>
          <button type="button" class="xp-mode" data-mode="pro">
            <div class="xp-mode-icon" style="background:linear-gradient(135deg,#2997ff,#5e5ce6)">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M3 20h18M6 16l4-6 4 3 5-8"/></svg>
            </div>
            <h3>Professional</h3>
            <p>The full planner: 3D Moon, LOLA terrain horizons, power, DSN links and scenario comparison.</p>
            <span class="xp-go">Open planner →</span>
          </button>
        </div>
      </div>
      <button type="button" class="xp-tourlink">About this project</button>
      <div class="xp-stats" role="group" aria-label="Why trust it">
      <button type="button" class="xp-stat" data-about title="How it is checked"><b>${siteCount}</b> sites on real <b>NASA LOLA</b> terrain</button>
      <button type="button" class="xp-stat" data-about title="How it is checked">Matches <b>JPL Horizons</b> to &lt; 0.01°</button>
      <button type="button" class="xp-stat" data-about title="How it is checked">Checked against <b>NASA Goddard</b> and <b>LRO</b> data</button>
    </div>
    </div>`;
  document.body.appendChild(el);

  const stopSky = starfield(el.querySelector('.xp-sky'));
  const stopSpin = spinMoon(el.querySelector('.xp-moon3d'), base);
  const start = el.querySelector('.xp-start');
  const modes = el.querySelector('.xp-modes');
  const cta = el.querySelector('.xp-cta');

  const split = () => {
    if (modes.classList.contains('is-open')) return;
    play('tadum');
    start.classList.add('is-splitting');
    setTimeout(() => {
      cta.style.display = 'none';
      el.classList.add('is-choosing');
      modes.classList.add('is-open');
      modes.querySelector('.xp-mode')?.focus();
    }, 260);
  };

  start.addEventListener('click', split);
  el.querySelector('.xp-tourlink').addEventListener('click', () => onAbout?.());
  el.querySelectorAll('[data-about]').forEach((b) => b.addEventListener('click', () => onAbout?.()));
  el.querySelector('.xp-sound').addEventListener('click', toggleSound);
  el.querySelector('.xp-skip:not(.xp-sound)').addEventListener('click', (e) => {
    el.classList.add('is-fast');
    e.currentTarget.remove();
  });
  modes.querySelectorAll('.xp-mode').forEach((b) => {
    b.addEventListener('click', () => {
      try { localStorage.setItem('lsp.introSeen', '1'); } catch {}
      play('whoosh');
      el.classList.add('is-leaving');
      onChoose(b.dataset.mode);
      setTimeout(() => { stopSpin(); stopSky(); el.remove(); }, 850);
    });
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === start) split();
  });
  // The full intro plays on every visit (Skip intro is always there).
  setTimeout(() => start.focus({ preventScroll: true }), 2600);
  return el;
}
