// 3D view of a planned flight: Earth, the Moon moving along its orbit, the
// spacecraft's path coloured by phase, and the spacecraft itself.
// Units: 1 = 10,000 km. Earth and Moon are drawn larger than life (3x and 4x)
// so they can be seen at Earth–Moon scale; orbits close to them are pushed out
// to match, and the true distances are what the caption reports.

import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { moonState, sunDir, siteDirection, R_E, R_M } from '../core/flight.js';

const U = 10000;
const KE = 3, KM = 4;
const PHASE_COLOR = { parking: 0x93c5fd, loops: 0x93c5fd, ascent: 0x93c5fd, coast: 0xfbbf24, orbit: 0x22d3ee, descent: 0x4ade80 };

export function createFlightScene(canvas, { onHint } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 5000);
  scene.add(new THREE.AmbientLight(0x9fb3d9, 0.28));
  const sun = new THREE.DirectionalLight(0xfff6e0, 2.1);
  scene.add(sun);

  // Stars
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 2500;
    const s = Math.sqrt(1 - u * u);
    sp[3 * i] = r * s * Math.cos(th); sp[3 * i + 1] = r * u; sp[3 * i + 2] = r * s * Math.sin(th);
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7 })));

  const base = import.meta.env.BASE_URL;
  const loader = new THREE.TextureLoader();
  const tex = (url) => { const t = loader.load(url, () => render()); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const bodyMesh = (r, url) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), new THREE.MeshStandardMaterial({ map: tex(url), roughness: 0.9, metalness: 0 }));
    m.rotation.y = -Math.PI / 2; // texture longitude 0 faces +Z, as on the main globe
    g.add(m);
    g.matrixAutoUpdate = false;
    scene.add(g);
    return g;
  };
  const earth = bodyMesh((R_E * KE) / U, `${base}data/earth_blue_marble_4k.jpg`);
  const moon = bodyMesh((R_M * KM) / U, `${base}data/moonGlobal.jpg`);
  const glow = new THREE.Mesh(new THREE.SphereGeometry((R_E * KE * 1.06) / U, 48, 32), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(glow);

  const dot = (color, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color })); scene.add(m); return m; };
  const craft = dot(0xffffff, 0.06);
  const craftHalo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.35, depthWrite: false }));
  scene.add(craftHalo);
  const siteDot = dot(0x4ade80, 0.035);
  const padDot = dot(0xfbbf24, 0.06);

  let plan = null, path = null, basis = null;
  let fullLine = null, doneLine = null, moonOrbit = null;
  let cur = 0, lunarStart = -1, rel = [];

  // EQJ km -> scene, with the Moon's orbit plane horizontal.
  const toScene = (v) => {
    const [e1, n, e2] = basis;
    return new THREE.Vector3((v[0] * e1[0] + v[1] * e1[1] + v[2] * e1[2]) / U, (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / U, -(v[0] * e2[0] + v[1] * e2[1] + v[2] * e2[2]) / U);
  };
  // Push points near Earth out so they clear the enlarged Earth.
  const earthWarp = (p) => {
    const r = Math.hypot(...p);
    const k = Math.max(0, 1 - (r - R_E) / (20 * R_E));
    const r2 = r + (KE - 1) * R_E * k + 0.15 * R_E * k;
    return [p[0] * (r2 / r), p[1] * (r2 / r), p[2] * (r2 / r)];
  };
  const moonWarp = (p, mc) => {
    const d = [p[0] - mc[0], p[1] - mc[1], p[2] - mc[2]];
    return [mc[0] + d[0] * KM, mc[1] + d[1] * KM, mc[2] + d[2] * KM];
  };
  const drawPos = (s) => {
    if (s.near === 'moon') return toScene(moonWarp(s.pos, moonState(s.t).r));
    return toScene(earthWarp(s.pos));
  };

  function setBodyFrame(group, xAxis, yAxis, zAxis, centre, scaleK = 1) {
    // Local +Z = longitude 0, +X = longitude 90° E, +Y = north (see bodyMesh).
    const X = toScene(yAxis).normalize(), Y = toScene(zAxis).normalize(), Z = toScene(xAxis).normalize();
    group.matrix.makeBasis(X, Y, Z).scale(new THREE.Vector3(scaleK, scaleK, scaleK)).setPosition(centre);
    group.matrixWorldNeedsUpdate = true;
  }

  function setPlan(p, pathSamples) {
    plan = p; path = pathSamples;
    const m = moonState(p.loiMs);
    const e1 = norm3(m.r), n = norm3(cross3(m.r, m.v)), e2 = cross3(n, e1);
    basis = [e1, n, e2];
    for (const l of [fullLine, doneLine, moonOrbit]) if (l) { scene.remove(l); l.geometry.dispose(); }
    const pts = path.map(drawPos);
    const colors = new Float32Array(pts.length * 3);
    path.forEach((s, i) => { const c = new THREE.Color(PHASE_COLOR[s.phase] || 0xffffff); colors.set([c.r, c.g, c.b], 3 * i); });
    const g1 = new THREE.BufferGeometry().setFromPoints(pts);
    g1.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    fullLine = new THREE.Line(g1, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28 }));
    const g2 = g1.clone();
    doneLine = new THREE.Line(g2, new THREE.LineBasicMaterial({ vertexColors: true }));
    scene.add(fullLine, doneLine);
    // Around the Moon the path is kept relative to the Moon, which moves ~88,000 km a day.
    lunarStart = path.findIndex((x) => x.near === 'moon');
    rel = lunarStart < 0 ? [] : path.slice(lunarStart).map((x) => { const mc = moonState(x.t).r; return [(x.pos[0] - mc[0]) * KM, (x.pos[1] - mc[1]) * KM, (x.pos[2] - mc[2]) * KM]; });
    // The Moon's own path over the flight.
    const mp = [];
    for (let i = 0; i <= 240; i++) mp.push(toScene(moonState(p.launchMs + (i / 240) * (p.touchdownMs - p.launchMs) + 0).r));
    moonOrbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mp), new THREE.LineDashedMaterial({ color: 0x94a3b8, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.45 }));
    moonOrbit.computeLineDistances();
    scene.add(moonOrbit);
    fit();
    setIndex(0);
  }

  // Camera: drag to orbit, wheel to zoom; follows the action unless the user takes over.
  let yaw = 0.6, pitch = 0.5, dist = 60, follow = true, goalYaw = null, goalPitch = null;
  const target = new THREE.Vector3();
  let goalTarget = new THREE.Vector3(), goalDist = 60;
  function fit() {
    let maxR = 0;
    for (const s of path) maxR = Math.max(maxR, Math.hypot(...s.pos) / U);
    goalDist = Math.max(55, maxR * 2.2);
  }
  function setIndex(i) {
    if (!path) return;
    cur = Math.max(0, Math.min(path.length - 1, i));
    const s = path[cur];
    const t = s.t;
    const pos = drawPos(s);
    craft.position.copy(pos);
    craftHalo.position.copy(pos);
    doneLine.geometry.setDrawRange(0, cur + 1);
    // Earth spin and the Moon, tidally locked.
    const g = Astronomy.SiderealTime(new Date(t)) * 15 * (Math.PI / 180);
    setBodyFrame(earth, [Math.cos(g), Math.sin(g), 0], [-Math.sin(g), Math.cos(g), 0], [0, 0, 1], new THREE.Vector3(), 1);
    glow.position.set(0, 0, 0);
    const mc = moonState(t).r;
    const mcs = toScene(mc);
    if (lunarStart >= 0) {
      for (const line of [fullLine, doneLine]) {
        const a = line.geometry.attributes.position;
        for (let j = 0; j < rel.length; j++) { const v = toScene([mc[0] + rel[j][0], mc[1] + rel[j][1], mc[2] + rel[j][2]]); a.setXYZ(lunarStart + j, v.x, v.y, v.z); }
        a.needsUpdate = true;
      }
    }
    setBodyFrame(moon, siteDirection(0, 0, t), siteDirection(0, 90, t), siteDirection(90, 0, t), mcs, 1);
    if (plan.site) {
      const sd = siteDirection(plan.site.lat, plan.site.lon, t);
      siteDot.position.copy(toScene(moonWarp([mc[0] + sd[0] * R_M, mc[1] + sd[1] * R_M, mc[2] + sd[2] * R_M], mc)));
    }
    const sd = sunDir(t);
    const sv = toScene(sd.map((x) => x * U * 100)).normalize();
    sun.position.copy(sv.multiplyScalar(100));
    // Launch pad turns with Earth.
    const ls = plan.launchSite, D = Math.PI / 180;
    const plon = ls.lon * D + g, plat = ls.lat * D;
    padDot.position.copy(toScene(earthWarp([R_E * Math.cos(plat) * Math.cos(plon), R_E * Math.cos(plat) * Math.sin(plon), R_E * Math.sin(plat)])));
    // Where to look.
    goalYaw = goalPitch = null;
    if (follow) {
      if (s.phase === 'orbit' || s.phase === 'descent') {
        goalTarget = mcs.clone(); goalDist = s.phase === 'descent' ? 2.2 : 4.5;
        // Look down on the landing site, a little from the side.
        const dir = siteDot.position.clone().sub(mcs).normalize();
        goalYaw = Math.atan2(dir.x, dir.z) + 0.35;
        goalPitch = Math.max(-1.4, Math.min(1.4, Math.asin(dir.y) * 0.85));
      }
      else if (s.near === 'earth' && plan.route !== 'phasing') { goalTarget = new THREE.Vector3(); goalDist = 9; }
      else { goalTarget = pos.clone().multiplyScalar(0.5); goalDist = Math.max(14, pos.length() * 1.5 + 8); if (plan.route === 'lowenergy' && s.phase === 'coast') goalDist = Math.max(goalDist, 170); }
    }
    render();
  }

  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 20 || h < 20) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    target.lerp(goalTarget, 0.12);
    dist += (goalDist - dist) * 0.12;
    let turning = false;
    if (goalYaw != null) {
      let dy = goalYaw - yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      yaw += dy * 0.1; pitch += (goalPitch - pitch) * 0.1;
      turning = Math.abs(dy) + Math.abs(goalPitch - pitch) > 0.002;
    }
    camera.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw));
    camera.lookAt(target);
    const k = Math.max(0.03, dist / 36);
    craft.scale.setScalar(k); craftHalo.scale.setScalar(k * (1 + 0.15 * Math.sin(performance.now() / 180)));
    padDot.scale.setScalar(Math.min(1, k));
    siteDot.scale.setScalar(Math.min(1.2, Math.max(0.25, dist / 12)));
    renderer.render(scene, camera);
    if (turning || Math.abs(goalDist - dist) > 0.01 || target.distanceTo(goalTarget) > 0.001) requestAnimationFrame(render);
  }

  let drag = null;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw, pitch };
    canvas.setPointerCapture(e.pointerId);
    if (goalYaw != null) { follow = false; goalYaw = goalPitch = null; onHint?.('follow-off'); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
    pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.006));
    render();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    follow = false; onHint?.('follow-off');
    goalDist = Math.max(1.2, Math.min(600, goalDist * Math.exp(e.deltaY * 0.0012)));
    dist = goalDist;
    render();
  }, { passive: false });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => render()).observe(canvas);

  return {
    setPlan,
    setIndex,
    render,
    get index() { return cur; },
    setFollow(on) { follow = on; if (on && path) setIndex(cur); },
    dispose() { renderer.dispose(); },
  };
}

function norm3(v) { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
