// Curated landing sites. Coordinates are selenographic (planetocentric) degrees,
// longitude east-positive in -180..180, in the Mean-Earth frame.
//
// `precision`: 'surveyed' = published post-landing LROC position (Apollo values
// from Wagner et al. 2017, Icarus 283), 'reported' = mission-reported landing
// or impact position, 'approx' = target or feature centre to roughly 0.1 deg.
// Always check `note` before quoting a number in a review.
import sitesData from '../data/sites.js';

export const SITE_GROUPS = {
  artemis: 'NASA Artemis III candidate regions',
  south: 'South pole: features & targets',
  clps: 'CLPS & commercial',
  apollo: 'Apollo',
  intl: 'Other national programs',
  computed: 'Points chosen from LOLA terrain',
};

// One list for every page: src/data/sites.json (the app, the Terrain 3D
// page, the data tools and the public API all read it).
export const SITES = sitesData.filter((s) => s.group !== 'computed');

// Hand-picked ridge points. Their computed values appear in the window summary;
// near crests they depend on terrain resolution (20 m tiles are used where available).
// (The best-lit LOLA cells are added at run time by the Terrain 3D page.)
export const COMPUTED_SITES = sitesData.filter((s) => s.group === 'computed' && !/^best-\d/.test(s.id));

export function siteById(id) {
  return COMPUTED_SITES.find((s) => s.id === id) ?? SITES.find((s) => s.id === id) ?? null;
}

/** Parse "lat, lon" in decimal degrees (S/W negative or with N/S/E/W suffixes). */
export function parseCoordinates(text) {
  const m = String(text)
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?\s*$/i);
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  if (m[2] && m[2].toUpperCase() === 'S') lat = -Math.abs(lat);
  if (m[4] && m[4].toUpperCase() === 'W') lon = -Math.abs(lon);
  if (lon > 180) lon -= 360;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
