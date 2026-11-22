// Node-side loader for the shipped LOLA grids (the browser uses fetch).
import { createTerrain } from '../src/core/horizon.js';
import { readGrid } from '../tools/lib/grids.mjs';

export function loadTerrainSync(names = ['sp_fine', 'sp_coarse']) {
  return createTerrain(names.map((name) => readGrid(name)));
}
