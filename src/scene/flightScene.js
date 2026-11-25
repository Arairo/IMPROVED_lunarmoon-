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
const PHASE_COLOR = { launch: 0x93c5fd, parking: 0x93c5fd, loops: 0x93c5fd, ascent: 0x93c5fd, coast: 0xfbbf24, orbit: 0x22d3ee, descent: 0x4ade80 };

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
  const earth = bodyMesh((R_E * KE) / U, `${base}data/earth_blue_marble_2k.jpg`);
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
  let cur = 0, lunarStart = -1, descentStart = -1, relScene = null, pathPts = null, approachDir = new THREE.Vector3(0, 0, 1);
  let lastPhase = null, fastFwd = false, orbR = 0;
  const orbU1 = new THREE.Vector3(), orbU2 = new THREE.Vector3();
  const tmpP1 = new THREE.Vector3(), tmpP2 = new THREE.Vector3(), tmpPos = new THREE.Vector3();

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
    pathPts = pts;
    const colors = new Float32Array(pts.length * 3);
    path.forEach((s, i) => { const c = new THREE.Color(PHASE_COLOR[s.phase] || 0xffffff); colors.set([c.r, c.g, c.b], 3 * i); });
    const g1 = new THREE.BufferGeometry().setFromPoints(pts);
    g1.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    fullLine = new THREE.Line(g1, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28 }));
    // Share position & color buffers with fullLine so Moon-relative updates upload once per frame.
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', g1.getAttribute('position'));
    g2.setAttribute('color', g1.getAttribute('color'));
    doneLine = new THREE.Line(g2, new THREE.LineBasicMaterial({ vertexColors: true }));
    // Dynamic lunar-relative vertices move with the Moon over 40+ days; prevent stale bounding-sphere culling.
    fullLine.frustumCulled = false;
    doneLine.frustumCulled = false;
    scene.add(fullLine, doneLine);
    // Around the Moon the path is kept relative to the Moon, which moves ~88,000 km a day.
    // Precompute Moon-relative scene offsets once (toScene is linear), eliminating per-frame allocations.
    lunarStart = path.findIndex((x) => x.near === 'moon');
    descentStart = path.findIndex((x) => x.phase === 'descent');
    if (lunarStart >= 0) {
      const relLen = path.length - lunarStart;
      relScene = new Float32Array(relLen * 3);
      for (let j = 0; j < relLen; j++) {
        const x = path[lunarStart + j];
        const mcX = moonState(x.t).r;
        const v = toScene([(x.pos[0] - mcX[0]) * KM, (x.pos[1] - mcX[1]) * KM, (x.pos[2] - mcX[2]) * KM]);
        relScene[3 * j] = v.x;
        relScene[3 * j + 1] = v.y;
        relScene[3 * j + 2] = v.z;
      }
      // Orthonormal basis of the lunar orbit ring for smooth visual orbiting during fast-forward.
      orbU1.set(relScene[0], relScene[1], relScene[2]);
      orbR = orbU1.length();
      if (orbR > 1e-6) {
        orbU1.divideScalar(orbR);
        orbU2.set(0, 0, 0);
        const orbEnd = descentStart >= 0 ? descentStart - lunarStart : relLen;
        let bestSq = 0;
        for (let j = 1; j < orbEnd; j++) {
          tmpP1.set(relScene[3 * j], relScene[3 * j + 1], relScene[3 * j + 2]);
          tmpP1.addScaledVector(orbU1, -tmpP1.dot(orbU1));
          const sq = tmpP1.lengthSq();
          if (sq > bestSq) { bestSq = sq; orbU2.copy(tmpP1); }
        }
        if (bestSq > 1e-8) orbU2.normalize();
      }
    } else {
      relScene = null;
      orbR = 0;
    }
    const mcsLoi = toScene(m.r);
    approachDir = mcsLoi.clone().normalize();
    if (lunarStart > 1) {
      let k = lunarStart - 1;
      while (k > 0 && path[k - 1].phase === 'coast' && pts[k].distanceTo(mcsLoi) < 5) k--;
      const d = mcsLoi.clone().sub(pts[k]);
      if (d.lengthSq() > 0.01) approachDir = d.normalize();
    }
    // The Moon's own path over the flight (wide subtle dashes so fast-forward never strobes).
    const mp = [];
    for (let i = 0; i <= 240; i++) mp.push(toScene(moonState(p.launchMs + (i / 240) * (p.touchdownMs - p.launchMs) + 0).r));
    moonOrbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mp), new THREE.LineDashedMaterial({ color: 0x94a3b8, dashSize: 3.0, gapSize: 2.0, transparent: true, opacity: 0.25 }));
    moonOrbit.frustumCulled = false;
    moonOrbit.computeLineDistances();
    scene.add(moonOrbit);
    fit();
    lastPhase = null;
    setIndex(0);
    anchor.copy(goalAnchor);
    camOffset.copy(goalOffset);
    target.copy(anchor).add(camOffset);
    dist = goalDist;
    if (goalYaw != null) { yaw = goalYaw; pitch = goalPitch; }
    render();
  }

  // Camera: drag to orbit, wheel to zoom; follows the action unless the user takes over.
  // `anchor` locks immediately to the tracked body (Earth / Moon / ship) with zero lag,
  // while `camOffset`, `dist`, `yaw`, `pitch` ease smoothly across phase transitions.
  let yaw = 0.6, pitch = 0.48, dist = 8, follow = true, goalYaw = null, goalPitch = null;
  const anchor = new THREE.Vector3(), goalAnchor = new THREE.Vector3();
  const camOffset = new THREE.Vector3(), goalOffset = new THREE.Vector3();
  const target = new THREE.Vector3();
  let goalDist = 8;
  function fit() {
    let maxR = 0;
    for (const s of path) maxR = Math.max(maxR, Math.hypot(...s.pos) / U);
    goalDist = Math.max(55, maxR * 2.2);
  }
  function setIndex(i, frac = 0) {
    if (!path) return;
    const fi = typeof i === 'number' ? i : 0;
    const idx = Math.floor(fi);
    cur = Math.max(0, Math.min(path.length - 1, idx));
    const nextIdx = Math.min(path.length - 1, cur + 1);
    const f = Math.max(0, Math.min(1, frac || (fi - cur)));
    const s = path[cur];
    const sNext = path[nextIdx];
    const t = s.t + (sNext.t - s.t) * f;
    // Compute Moon center ONCE for this frame.
    const mc = moonState(t).r;
    const mcs = toScene(mc);
    const posAtSample = (kIdx, out) => {
      if (path[kIdx].near === 'moon' && relScene && lunarStart >= 0) {
        const o = (kIdx - lunarStart) * 3;
        return out.set(mcs.x + relScene[o], mcs.y + relScene[o + 1], mcs.z + relScene[o + 2]);
      }
      return out.copy(pathPts[kIdx]);
    };
    const p1 = posAtSample(cur, tmpP1);
    const pos = tmpPos.copy(p1);
    if (f > 0) {
      const p2 = posAtSample(nextIdx, tmpP2);
      if (s.phase === 'orbit' && sNext.phase === 'orbit') {
        const r1 = tmpP1.sub(mcs).length();
        const r2 = tmpP2.sub(mcs).length();
        pos.copy(tmpP1).lerp(tmpP2, f);
        if (pos.lengthSq() > 1e-8) pos.normalize().multiplyScalar(r1 + (r2 - r1) * f);
        pos.add(mcs);
      } else {
        pos.lerp(p2, f);
      }
    }
    if (fastFwd && s.phase === 'orbit' && orbR > 0) {
      // Show the ship smoothly orbiting the Moon at a readable ~0.8 laps/s during fast-forward
      // instead of hiding it or strobing at 50 Hz, while keeping the camera calm.
      const ang = (performance.now() / 1000) * Math.PI * 1.6;
      const ca = Math.cos(ang) * orbR, sa = Math.sin(ang) * orbR;
      craft.position.set(mcs.x + ca * orbU1.x + sa * orbU2.x, mcs.y + ca * orbU1.y + sa * orbU2.y, mcs.z + ca * orbU1.z + sa * orbU2.z);
      craftHalo.position.copy(craft.position);
    } else {
      craft.position.copy(pos);
      craftHalo.position.copy(pos);
    }
    // Keep the blue/cyan path visible up until descent starts; hide both orbit and descent lines once landing begins.
    const pathEnd = descentStart >= 0 ? descentStart : path.length;
    if (s.phase === 'descent') {
      fullLine.visible = false;
      doneLine.visible = false;
    } else {
      fullLine.visible = true;
      doneLine.visible = true;
      fullLine.geometry.setDrawRange(0, pathEnd);
      doneLine.geometry.setDrawRange(0, Math.min(cur + 1, pathEnd));
    }
    // Earth spin and the Moon, tidally locked.
    const g = Astronomy.SiderealTime(new Date(t)) * 15 * (Math.PI / 180);
    setBodyFrame(earth, [Math.cos(g), Math.sin(g), 0], [-Math.sin(g), Math.cos(g), 0], [0, 0, 1], new THREE.Vector3(), 1);
    glow.position.set(0, 0, 0);
    if (lunarStart >= 0 && relScene) {
      const posAttr = fullLine.geometry.attributes.position;
      const arr = posAttr.array;
      const mx = mcs.x, my = mcs.y, mz = mcs.z;
      for (let j = 0, k = lunarStart * 3, n = relScene.length; j < n; j += 3, k += 3) {
        arr[k] = mx + relScene[j];
        arr[k + 1] = my + relScene[j + 1];
        arr[k + 2] = mz + relScene[j + 2];
      }
      posAttr.needsUpdate = true;
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
      if (s.phase === 'descent') {
        // Descent only: angled 3/4 oblique view following the ship so you can see it tilt down
        // toward the Moon's surface without looking straight up from underneath.
        const shipRel = pos.clone().sub(mcs);
        const siteRel = siteDot.position.clone().sub(mcs);
        const shipDir = shipRel.lengthSq() > 1e-6 ? shipRel.clone().normalize() : approachDir.clone();
        const baseYaw = Math.atan2(approachDir.x, approachDir.z) + 0.45;
        const shipHoriz = Math.hypot(shipDir.x, shipDir.z);
        const shipYaw = Math.atan2(shipDir.x, shipDir.z) + 0.60;
        let dyShip = shipYaw - baseYaw;
        while (dyShip > Math.PI) dyShip -= 2 * Math.PI;
        while (dyShip < -Math.PI) dyShip += 2 * Math.PI;
        const yawBlend = Math.min(1, Math.max(0, (shipHoriz - 0.08) / 0.20));
        goalAnchor.copy(mcs);
        goalOffset.copy(shipRel).lerp(siteRel, 0.45);
        goalDist = 2.4;
        goalYaw = baseYaw + dyShip * yawBlend;
        const rawPitch = Math.asin(Math.max(-1, Math.min(1, shipDir.y)));
        goalPitch = Math.max(-0.68, Math.min(0.68, rawPitch * 0.45 + (shipDir.y < -0.1 ? -0.05 : 0.25)));
      }
      else if (s.phase === 'orbit') {
        // Lunar orbit: lock anchor dead-center on Moon (zero lag & zero 50Hz shake).
        goalAnchor.copy(mcs);
        goalOffset.set(0, 0, 0);
        goalDist = 6.5;
        goalYaw = Math.atan2(approachDir.x, approachDir.z) + 0.45;
        goalPitch = 0.55;
      }
      else if (s.phase === 'launch' || cur === 0) {
        goalAnchor.set(0, 0, 0);
        goalOffset.copy(pos).multiplyScalar(0.4);
        goalDist = 8.0;
        const dir = padDot.position.clone().normalize();
        goalYaw = Math.atan2(dir.x, dir.z) + 0.35;
        goalPitch = 0.48;
      }
      else if (s.near === 'earth') {
        if (s.phase === 'loops') {
          // Patient and thrifty phasing loops: steady 3/4 view sized to loop envelope (no perigee zoom slams).
          const toMoon = mcs.clone().normalize();
          let raScene = 6;
          if (plan.loops?.length) {
            const lp = plan.loops.find((l) => t <= l.endMs) || plan.loops[plan.loops.length - 1];
            raScene = lp.ra / U;
          }
          goalAnchor.set(0, 0, 0);
          goalOffset.copy(toMoon).multiplyScalar(Math.min(6.5, raScene * 0.22));
          goalDist = Math.max(10.0, Math.min(28.0, raScene * 1.1 + 5.5));
          goalYaw = Math.atan2(toMoon.x, toMoon.z) + 0.65;
          goalPitch = 0.46;
        } else {
          // Fast and thirsty (parking orbit) & low-energy ascent: follow the ship smoothly around Earth.
          goalAnchor.set(0, 0, 0);
          goalOffset.copy(pos).multiplyScalar(0.45);
          goalDist = 8.0;
          goalYaw = Math.atan2(pos.x, pos.z) + 0.40;
          goalPitch = 0.48;
        }
      }
      else {
        // Coast: track the ship directly with zero lag, using a steady arrival-aligned angle
        // so the starfield never flips 180°, blending cleanly into lunar orbit on final approach.
        const baseCoastDist = plan.route === 'lowenergy' ? Math.min(38.0, Math.max(15.0, pos.length() * 0.28 + 10.0)) : 13.0;
        const dMoon = pos.distanceTo(mcs);
        const approach = Math.max(0, Math.min(1, 1 - (dMoon - 1.5) / 10.5));
        goalAnchor.copy(pos).lerp(mcs, approach);
        goalOffset.set(0, 0, 0);
        goalDist = baseCoastDist + (6.5 - baseCoastDist) * approach;
        goalYaw = Math.atan2(approachDir.x, approachDir.z) + 0.45;
        goalPitch = 0.48 + (0.55 - 0.48) * approach;
      }
      if (lastPhase !== null && lastPhase !== s.phase) {
        // Absorb any phase-boundary anchor jump into camOffset so target transitions smoothly.
        camOffset.add(anchor).sub(goalAnchor);
      }
      anchor.copy(goalAnchor);
      lastPhase = s.phase;
    }
    render();
  }

  let disposed = false, animFrame = null, lastW = 0, lastH = 0;
  function scheduleRender() {
    if (disposed || animFrame != null) return;
    animFrame = requestAnimationFrame(() => {
      animFrame = null;
      render();
    });
  }
  function render() {
    if (disposed) return;
    if (animFrame != null) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 20 || h < 20) return;
    if (w !== lastW || h !== lastH) {
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (follow) {
      camOffset.lerp(goalOffset, 0.08);
      target.copy(anchor).add(camOffset);
    }
    dist += (goalDist - dist) * 0.08;
    let turning = false;
    if (goalYaw != null) {
      let dy = goalYaw - yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      yaw += dy * 0.10; pitch += (goalPitch - pitch) * 0.10;
      turning = Math.abs(dy) + Math.abs(goalPitch - pitch) > 0.002;
    }
    camera.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw));
    camera.lookAt(target);
    const k = Math.max(0.045, dist / 28);
    craft.scale.setScalar(k * 1.3);
    craftHalo.scale.setScalar(k * (1.8 + 0.25 * Math.sin(performance.now() / 150)));
    padDot.scale.setScalar(Math.min(1, k));
    siteDot.scale.setScalar(Math.min(1.2, Math.max(0.25, dist / 12)));
    renderer.render(scene, camera);
    if (turning || Math.abs(goalDist - dist) > 0.01 || (follow && camOffset.distanceTo(goalOffset) > 0.001)) scheduleRender();
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
  const resizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => render()) : null;
  resizeObs?.observe(canvas);

  return {
    setPlan,
    setIndex,
    render,
    get index() { return cur; },
    setFollow(on) {
      const prevFollow = follow;
      follow = on;
      if (on && path) {
        if (!prevFollow) lastPhase = '__refollow__';
        setIndex(cur);
      }
    },
    /** Back to following the craft from the start of the path (e.g. "Fly it again"). */
    resetView() {
      follow = true;
      lastPhase = null;
      if (path) {
        setIndex(0);
        anchor.copy(goalAnchor);
        camOffset.copy(goalOffset);
        target.copy(anchor).add(camOffset);
        dist = goalDist;
        if (goalYaw != null) { yaw = goalYaw; pitch = goalPitch; }
        render();
      }
    },
    /** Fast-forwarding through many orbits: keep the craft visible and smoothly orbiting at a readable pace. */
    setFastForward(on) { fastFwd = !!on; craft.visible = craftHalo.visible = true; },
    /** Free GPU memory and the WebGL context now, instead of waiting for garbage collection. */
    dispose() {
      disposed = true;
      resizeObs?.disconnect();
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}

function norm3(v) { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
