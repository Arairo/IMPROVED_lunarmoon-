// Small sunlit views of the Moon, drawn by ONE hidden WebGL renderer and
// copied into ordinary 2D canvases. Browsers cap live WebGL views per page,
// so the Beginner zoom, the Pick-a-day Moon and every Compare card share this.
//
//   const moon = await getMoonThumbs();
//   const pins = moon.draw(canvas2d, { lat: -89, lon: 0, dist: 2.6, sun: [x, y, z], pins: [{ lat, lon }], earth: [x, y, z] });
//   // pins come back with screen x/y (CSS px) and `front` so labels can be drawn on top.
//
// Vectors are Moon-fixed (x to 0°N 0°E, y to 0°N 90°E, z to the north pole),
// as moonFixedState() returns them.
import * as THREE from 'three';

const BASE = import.meta.env?.BASE_URL ?? '/';
const D = Math.PI / 180;
const toScene = (v) => new THREE.Vector3(v[1], v[2], v[0]); // same axes as the 3D Moon
const latLon = (lat, lon, r = 1) => new THREE.Vector3(r * Math.cos(lat * D) * Math.sin(lon * D), r * Math.sin(lat * D), r * Math.cos(lat * D) * Math.cos(lon * D));

let ready = null;
export function getMoonThumbs() {
  if (ready) return ready;
  ready = new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    scene.add(new THREE.AmbientLight(0x9fb4ff, 0.07));
    const sun = new THREE.DirectionalLight(0xfff6e5, 2.4);
    scene.add(sun);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
    moon.rotation.y = -Math.PI / 2; // texture longitude 0 faces +Z, as on the 3D Moon
    scene.add(moon);
    // South-polar cap from the 450 m polar stereographic mosaic (the one the
    // Sunny-spot game uses), mapped point by point so the pole stays sharp.
    const CAP_HALF = 460000, R_M = 1737400;
    const capGeo = new THREE.SphereGeometry(1.0004, 192, 40, 0, Math.PI * 2, (164 * Math.PI) / 180, (16 * Math.PI) / 180);
    const pos = capGeo.attributes.position, uv = capGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const lat = Math.asin(Math.max(-1, Math.min(1, y / 1.0004))), lon = Math.atan2(x, z);
      const rho = 2 * R_M * Math.tan((Math.PI / 2 + lat) / 2);
      uv.setXY(i, (rho * Math.sin(lon) + CAP_HALF) / (2 * CAP_HALF), (rho * Math.cos(lon) + CAP_HALF) / (2 * CAP_HALF));
    }
    const capMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, transparent: true, opacity: 0 });
    scene.add(new THREE.Mesh(capGeo, capMat));
    const earthDot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 20), new THREE.MeshBasicMaterial({ color: 0x38a0ff }));
    scene.add(earthDot);
    const api = {
      draw(target, o = {}) {
        const w = target.clientWidth || target.width, h = target.clientHeight || target.height;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (target.width !== Math.round(w * dpr)) { target.width = Math.round(w * dpr); target.height = Math.round(h * dpr); }
        renderer.setPixelRatio(1);
        renderer.setSize(target.width, target.height, false);
        camera.aspect = target.width / target.height;
        camera.fov = o.fov ?? 30;
        camera.updateProjectionMatrix();
        // Camera above (lat, lon), looking at the centre. Over the poles "up"
        // points to the Earth-facing side so the near side sits at the top.
        const eye = latLon(o.lat ?? 0, o.lon ?? 0, o.dist ?? 4.4);
        const look = o.look ? latLon(o.look.lat, o.look.lon, 1).multiplyScalar(o.lookAmount ?? 0) : new THREE.Vector3();
        camera.position.copy(eye.clone().add(look));
        camera.up.set(0, 1, 0);
        if (Math.abs(o.lat ?? 0) > 70) camera.up.copy(o.lat < 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1));
        if (o.up) camera.up.set(o.up[0], o.up[1], o.up[2]);
        camera.lookAt(look);
        const sunV = o.sun ? toScene(o.sun).normalize() : eye.clone().normalize();
        sun.position.copy(sunV.multiplyScalar(10));
        sun.intensity = o.sun ? 2.4 : 1.6;
        scene.children.find((c) => c.isAmbientLight).intensity = o.ambient ?? (o.sun ? 0.07 : 0.55);
        earthDot.visible = !!o.earth;
        if (o.earth) {
          const e = toScene(o.earth).normalize();
          if (o.earthFlat) e.y = 0; // seen from over a pole: put Earth on the rim in its direction
          earthDot.position.copy(e.normalize().multiplyScalar(1.12));
        }
        renderer.render(scene, camera);
        const ctx = target.getContext('2d');
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.drawImage(canvas, 0, 0);
        // Pins: projected for the caller to draw (labels look better in 2D).
        const pins = (o.pins || []).map((p) => {
          const v = latLon(p.lat, p.lon, 1.0);
          const front = v.clone().normalize().dot(camera.position.clone().sub(v).normalize()) > 0;
          const s = v.clone().project(camera);
          return { ...p, x: ((s.x + 1) / 2) * w, y: ((1 - s.y) / 2) * h, front };
        });
        ctx.save();
        ctx.scale(target.width / w, target.height / h);
        for (const p of pins) {
          if (!p.front || p.hidden) continue;
          const r = p.r ?? 5;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = p.color || '#ffb300'; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
        ctx.restore();
        return pins;
      },
    };
    const loader = new THREE.TextureLoader();
    loader.load(`${BASE}data/sp_wac_450m.jpg`, (t) => {
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      capMat.map = t; capMat.opacity = 1; capMat.transparent = false; capMat.needsUpdate = true;
      window.dispatchEvent(new Event('lsp-moonthumb'));
    });
    loader.load(`${BASE}data/moonGlobal.jpg`, (t) => {
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      mat.map = t; mat.needsUpdate = true;
      resolve(api);
      // Sharper image when it arrives; callers redraw on 'lsp-moonthumb'.
      loader.load(`${BASE}data/moon_wac_global_4k.jpg`, (hi) => {
        if ('colorSpace' in hi) hi.colorSpace = THREE.SRGBColorSpace;
        mat.map = hi; mat.needsUpdate = true;
        window.dispatchEvent(new Event('lsp-moonthumb'));
      });
    }, undefined, () => resolve(api));
  });
  return ready;
}

/** Ease in-out, 0..1. */
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
