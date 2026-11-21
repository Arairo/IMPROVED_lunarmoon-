// Which build of the app produced a result, for reports. Filled in at build
// time by vite.config.js (package version, git commit, build time); 'dev' when
// running from source or in the Node tests.
/* global __LSP_BUILD__ */
export const BUILD = typeof __LSP_BUILD__ !== 'undefined' ? __LSP_BUILD__ : { version: 'dev', commit: null, builtAt: null };

// The data manifest (public/data/manifest.json): dataset ids and SHA-256 checksums.
// Loaded once in the browser so reports can name the exact data they used.
let manifest = null;
export async function loadManifest(baseUrl) {
  if (manifest) return manifest;
  try { const r = await fetch(`${baseUrl}data/manifest.json`); manifest = r.ok ? await r.json() : null; } catch { manifest = null; }
  return manifest;
}
/** Dataset ids with the checksum of each file, or a note when the manifest has not loaded. */
export function datasetProvenance() {
  if (!manifest) return { note: 'data manifest not loaded; see data/manifest.json' };
  return manifest.datasets.map((d) => ({ id: d.id, source: d.source, resolutionM: d.resolutionM, files: d.files.map((f) => ({ path: f.path, sha256: f.sha256 })) }));
}
