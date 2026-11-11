import { findFrameOverlap } from "./FrameOverlap.js";

// The mask reader (RectDetector) groups opaque pixels by exact RGB and
// four-neighbor connectivity, then uses their bounding boxes as sprite frames.
// Consequently the atlas-space JSON frames, including rotated/trimmed frames,
// are the authoritative bounds. Rotation affects unpacking, not atlas pixels.
export function generateMask(width, height, frames, paletteSize = 8, { allowOverlap = false } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error("Load an Atlas PNG first.");
  if (![8, 16].includes(Number(paletteSize))) throw new Error("Choose an 8 or 16 color palette.");
  if (!frames?.length) throw new Error("Import a frames JSON before generating a mask.");
  const rects = frames.map((r, i) => {
    const { x, y, w, h } = r;
    if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1 || x < 0 || y < 0 || x + w > width || y + h > height)
      throw new Error(`Invalid or out-of-bounds frame: ${r.name || i + 1}.`);
    return { x, y, w, h, i };
  });
  if (!allowOverlap && findFrameOverlap(rects))
    throw new Error("Overlapping JSON frames cannot produce an unambiguous mask.");
  const owner = new Int32Array(width * height); // 0 is transparent
  for (const r of rects) {
    // Explicit override gives the later frame its whole area, including its
    // transparent interior, so earlier outlines cannot remain inside it.
    if (allowOverlap) for (let y = r.y; y < r.y + r.h; y++)
      owner.fill(0, y * width + r.x, y * width + r.x + r.w);
    const paint = (x, y) => { owner[y * width + x] = r.i + 1; };
    for (let x = r.x; x < r.x + r.w; x++) {
      paint(x, r.y);
      paint(x, r.y + r.h - 1);
    }
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      paint(r.x, y);
      paint(r.x + r.w - 1, y);
    }
  }
  const neighbors = Array.from({ length: rects.length }, () => new Set());
  // Include diagonals: the reader uses four neighbors, but distinct corner colors
  // keep touching outlines visually separable as well.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const id = owner[y * width + x];
    if (!id) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny >= height) continue;
      const other = owner[ny * width + nx];
      if (other && other !== id) {
        neighbors[id - 1].add(other - 1);
        neighbors[other - 1].add(id - 1);
      }
    }
  }
  const colors = new Int16Array(rects.length).fill(-1);
  const order = rects.map(r => r.i).sort((a, b) => neighbors[b].size - neighbors[a].size || a - b);
  for (const i of order) {
    const used = new Set([...neighbors[i]].map(j => colors[j]));
    let c = 0;
    while (used.has(c)) c++;
    if (c >= paletteSize) throw new Error(`The ${paletteSize}-color palette is insufficient for these touching sprites. Try 16 colors.`);
    colors[i] = c;
  }
  // Distinct, opaque RGB values. Alpha remains zero everywhere else.
  const palette = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
    [255, 0, 255], [0, 255, 255], [255, 128, 0], [128, 0, 255],
    [0, 128, 255], [128, 255, 0], [255, 0, 128], [0, 255, 128],
    [255, 128, 128], [128, 255, 128], [128, 128, 255], [255, 255, 255],
  ];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < owner.length; p++) {
    if (!owner[p]) continue;
    const rgb = palette[colors[owner[p] - 1]];
    data.set([rgb[0], rgb[1], rgb[2], 255], p * 4);
  }
  return { width, height, data, colors: Array.from(colors) };
}
