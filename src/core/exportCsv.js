// Time series as CSV: one row per time step of a scan, in the units the
// assessment uses. Used by the Report step's download and the public API.
const COLUMNS = [
  ['utc', null],
  ['sun_el_deg', 'sunEl', 3], ['sun_az_deg', 'sunAz', 2], ['skyline_el_at_sun_deg', 'sunHorizon', 3],
  ['sun_disk_visible_fraction', 'sunFrac', 3], ['solar_power_w', 'watts', 1],
  ['earth_el_deg', 'earthEl', 3], ['earth_az_deg', 'earthAz', 2], ['earth_clearance_deg', 'earthClear', 3],
  ['earth_centre_in_view', 'los', 0], ['dsn_station_in_view', 'dsnAny', 0],
  ['link_margin_db', 'margin', 2], ['direct_to_earth_link', 'dte', 0],
];

export function scanToCsv(scan, { site, config, provenance = [] } = {}) {
  const s = scan.series;
  const head = [
    `# Lunar Site Planner time series${site ? ` for ${site.name} (${site.lat.toFixed(5)}, ${site.lon.toFixed(5)})` : ''}`,
    `# Step ${Math.round(scan.stepMs / 60000)} min. Angles in degrees from the local horizontal at a ${config?.mastHeightM ?? 2} m mast; azimuth clockwise from north.`,
    '# Terrain: NASA LRO LOLA. Ephemeris: astronomy-engine (IAU lunar rotation), checked against JPL Horizons. link_margin_db is -99 when Earth is hidden.',
    '# Times are UTC. direct_to_earth_link = Earth in line of sight, a DSN complex sees the Moon, and the link budget closes on paper (not a DSN booking).',
    ...provenance.map((l) => `# ${String(l).replace(/[\r\n]+/g, ' ')}`),
    COLUMNS.map((c) => c[0]).join(','),
  ];
  const rows = [];
  for (let i = 0; i < s.times.length; i++) {
    rows.push(COLUMNS.map(([, key, dp]) => (key ? Number(s[key][i]).toFixed(dp) : new Date(s.times[i]).toISOString().slice(0, 16) + 'Z')).join(','));
  }
  return `${head.join('\n')}\n${rows.join('\n')}\n`;
}
