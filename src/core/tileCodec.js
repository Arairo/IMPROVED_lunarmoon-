// Lossless packing for the 20 m terrain tiles (public/data/hires/*.i16z).
//
// Heights are int16 metres. Neighbouring cells differ by a few metres, so each value
// is stored as its difference from the cell above (first row: from the cell to its
// left) and the result is gzip-compressed: about a fifth of the raw size. Differences
// wrap around in 16-bit arithmetic, so decoding gives back exactly the same numbers,
// no-data (-32768) included (test/tileCodec.spec.js checks every shipped tile).

export const TILE_EXT = '.i16z';
export const TILE_ENCODING = 'int16-le, each value minus the one above (row 0: minus the one to the left), gzip';

/** Differences of an n x n int16 grid (row-major), as a new Int16Array. */
export function deltaEncode(heights, n) {
  const d = new Int16Array(heights.length);
  if (heights.length !== n * n) throw new Error(`expected ${n * n} cells, got ${heights.length}`);
  d[0] = heights[0];
  for (let c = 1; c < n; c++) d[c] = heights[c] - heights[c - 1];
  for (let i = n; i < heights.length; i++) d[i] = heights[i] - heights[i - n];
  return d;
}

/** Inverse of deltaEncode, in place on (and returning) the Int16Array. */
export function deltaDecode(d, n) {
  if (d.length !== n * n) throw new Error(`expected ${n * n} cells, got ${d.length}`);
  for (let c = 1; c < n; c++) d[c] = d[c] + d[c - 1];
  for (let i = n; i < d.length; i++) d[i] = d[i] + d[i - n];
  return d;
}

/** Unpack a fetched .i16z file (ArrayBuffer) into heights. Browser and Node 18+. */
export async function decodeTile(buffer, n) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = await new Response(stream).arrayBuffer();
  return deltaDecode(new Int16Array(raw), n);
}
