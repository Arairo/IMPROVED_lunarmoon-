// Builds the static, read-only public API into dist/api/v1 (run after vite build):
//   index.json                 what is here
//   sites.json / .geojson / .kml   every site with its notes
//   artemis_regions.geojson / .kml NASA's nine Artemis III candidate regions (USGS, from LROC QuickMap)
//   daily/<site>-2027.json     day-by-day Sun, Earth, DSN and link shares for 2027
//   lsp-engine.js              the engine as one ES module (vite.api.config.js)
//   maps/*.tif                 GeoTIFF lighting maps (tools/export_geotiff.py, from public/)
// GitHub Pages serves all of it with CORS open, so scripts can fetch it directly.
import fs from 'node:fs';
import path from 'node:path';
import { prepareSite, scan, DEFAULT_CONFIG } from '../src/core/analysis.js';
import sites from '../src/data/sites.js';

const out = process.argv[2] || 'dist/api/v1';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = 'https://arairo.github.io/IMPROVED_lunarmoon-/api/v1';
fs.mkdirSync(path.join(out, 'daily'), { recursive: true });
const write = (f, data) => fs.writeFileSync(path.join(out, f), typeof data === 'string' ? data : JSON.stringify(data));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r3 = (x) => Math.round(x * 1000) / 1000;

const list = sites.map((s) => ({ id: s.id, name: s.name, group: s.group, lat: s.lat, lon: s.lon, precision: s.precision, note: s.note, region: s.region, daily: `${BASE}/daily/${s.id}-2027.json` }));
write('sites.json', list);
write('sites.geojson', { type: 'FeatureCollection', features: list.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { ...s } })) });
const kml = (name, body) => `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>\n${body}</Document></kml>\n`;
write('sites.kml', kml('Lunar Site Planner sites (Moon, lat/lon on the IAU 2015 sphere)', list.map((s) => `<Placemark><name>${esc(s.name)}</name><description>${esc(s.note)}</description><Point><coordinates>${s.lon},${s.lat},0</coordinates></Point></Placemark>`).join('\n')));

const regionsPath = path.join(root, 'public/data/artemis_regions.geojson');
if (fs.existsSync(regionsPath)) {
  const g = JSON.parse(fs.readFileSync(regionsPath, 'utf8'));
  write('artemis_regions.geojson', g);
  const ring = (r) => r.map((p) => `${p[0]},${p[1]},0`).join(' ');
  const poly = (rings) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(rings[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
  write('artemis_regions.kml', kml('NASA Artemis III candidate landing regions (Oct 2024)', g.features.map((f) => {
    const name = f.properties.Region || f.properties.name || f.properties.Name || Object.values(f.properties)[0];
    const geom = f.geometry.type === 'Polygon' ? poly(f.geometry.coordinates) : `<MultiGeometry>${f.geometry.coordinates.map(poly).join('')}</MultiGeometry>`;
    return `<Placemark><name>${esc(name)}</name>${geom}</Placemark>`;
  }).join('\n')));
}

// Day-by-day 2027, hourly samples.
const t0 = Date.UTC(2027, 0, 1), t1 = Date.UTC(2028, 0, 1), H = 3600000;
let n = 0;
for (const s of sites) {
  const ctx = prepareSite(s, DEFAULT_CONFIG);
  const sc = scan(ctx, { startMs: t0, endMs: t1, stepMs: H }, DEFAULT_CONFIG, { withDsn: true });
  const { lit, los, dsnAny, dte, watts } = sc.series;
  const days = [];
  for (let d = 0; d < 365; d++) {
    let a = 0, b = 0, c = 0, e = 0, both = 0, wh = 0;
    for (let h = d * 24; h < d * 24 + 24; h++) { a += lit[h]; b += los[h]; c += dsnAny[h]; e += dte[h]; both += lit[h] & los[h]; wh += watts[h]; }
    days.push([new Date(t0 + d * 86400000).toISOString().slice(0, 10), r3(a / 24), r3(b / 24), r3(both / 24), r3(c / 24), r3(e / 24), Math.round(wh)]);
  }
  write(`daily/${s.id}-2027.json`, {
    site: { id: s.id, name: s.name, lat: s.lat, lon: s.lon },
    columns: ['date', 'sun', 'earth', 'sun_and_earth', 'dsn', 'direct_to_earth_link', 'solar_energy_wh'],
    units: `shares of the UTC day (0-1), hourly samples; solar_energy_wh from the default ${DEFAULT_CONFIG.power.areaM2} m² sun-tracking array at ${Math.round(DEFAULT_CONFIG.power.efficiency * 100)}% efficiency`,
    assumptions: { mastM: DEFAULT_CONFIG.mastHeightM, power: DEFAULT_CONFIG.power, comms: DEFAULT_CONFIG.comms },
    year: { sun: r3(sc.stats.litFraction), earth: r3(sc.stats.earthCentreFraction), dsn: r3(sc.stats.dsnFraction), link: r3(sc.stats.dteFraction), longestDarkH: Math.round(sc.stats.longestDarkH) },
    days,
  });
  n++;
}

write('index.json', {
  name: 'Lunar Site Planner public API', version: 1, base: BASE,
  about: 'Read-only, static, CORS-open. Same engine and NASA LOLA terrain as the app. Planning tool, not mission-certified.',
  endpoints: {
    sites: `${BASE}/sites.json`, sitesGeoJSON: `${BASE}/sites.geojson`, sitesKML: `${BASE}/sites.kml`,
    artemisRegionsGeoJSON: `${BASE}/artemis_regions.geojson`, artemisRegionsKML: `${BASE}/artemis_regions.kml`,
    daily: `${BASE}/daily/{siteId}-2027.json`, engine: `${BASE}/lsp-engine.js`, maps: `${BASE}/maps/index.json`,
  },
  docs: 'https://github.com/Arairo/IMPROVED_lunarmoon-/blob/main/docs/API.md',
  built: new Date().toISOString(),
});
console.log(`API: ${n} sites, daily 2027 tables written to ${out}`);
