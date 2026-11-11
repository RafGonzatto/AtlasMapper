/**
 * Inspects imported mask pixels without modifying the source image. An ordinary
 * mask is a set of solid-color, fully opaque outlines on transparent pixels.
 */
export function inspectMask(imageData) {
  const { data } = imageData;
  const colors = new Map();
  let visiblePixels = 0;
  let partialAlphaPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha <= 1) continue;
    visiblePixels++;
    if (alpha < 255) partialAlphaPixels++;
    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    colors.set(rgb, (colors.get(rgb) || 0) + 1);
  }

  const frequentColors = [...colors.values()].sort((a, b) => b - a);
  const dominantPixels = frequentColors.slice(0, 16).reduce((sum, n) => sum + n, 0);
  const noisyColors = colors.size > 32 && dominantPixels < visiblePixels * 0.9;
  const partialAlpha = partialAlphaPixels > 8 && partialAlphaPixels > visiblePixels * 0.01;

  return {
    needsNormalization: partialAlpha || noisyColors,
    visiblePixels,
    partialAlphaPixels,
    distinctColors: colors.size,
    reasons: [
      ...(partialAlpha ? ["transparência parcial"] : []),
      ...(noisyColors ? ["variações excessivas de cor"] : []),
    ],
  };
}

const distanceSquared = (r, g, b, color) =>
  (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;

/**
 * Converts anti-aliased outlines to solid pixels, preserving atlas coordinates.
 * The palette is inferred from predominant RGB colors so custom masks are not
 * forced into the generator's default palette.
 */
export function normalizeMask(imageData, { alphaCutoff = 32 } = {}) {
  const { width, height, data } = imageData;
  const histogram = new Map();
  let strongPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaCutoff) continue;
    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    histogram.set(rgb, (histogram.get(rgb) || 0) + data[i + 3]);
    strongPixels++;
  }

  // Treat very similar source colors as one, but do not merge genuinely
  // different adjacent outlines. Rare interpolation colors are not new seeds.
  const minSeedWeight = Math.max(255, strongPixels * 255 * 0.01);
  const palette = [];
  const ranked = [...histogram.entries()].sort((a, b) => b[1] - a[1]);
  for (const [rgb, weight] of ranked) {
    if (weight < minSeedWeight || palette.length >= 16) break;
    const color = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
    if (palette.every(c => distanceSquared(...color, c) > 80 ** 2))
      palette.push(color);
  }
  if (!palette.length && ranked.length) {
    const rgb = ranked[0][0];
    palette.push([(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]);
  }

  const output = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaCutoff) continue;
    let best = palette[0];
    let distance = distanceSquared(data[i], data[i + 1], data[i + 2], best);
    for (let c = 1; c < palette.length; c++) {
      const candidate = palette[c];
      const d = distanceSquared(data[i], data[i + 1], data[i + 2], candidate);
      if (d < distance) { distance = d; best = candidate; }
    }
    output.set([...best, 255], i);
  }
  return { width, height, data: output };
}

/**
 * Fits a mask canvas to the atlas without resampling or moving any pixels.
 * Rejects clipping nontransparent pixels outside the atlas bounds.
 */
export function fitMaskToAtlas(imageData, width, height) {
  const { width: sourceWidth, height: sourceHeight, data } = imageData;
  if (width === sourceWidth && height === sourceHeight) return imageData;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error("Invalid atlas dimensions.");
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      if ((x >= width || y >= height) && data[(y * sourceWidth + x) * 4 + 3] > 1)
        throw new Error("Mask contains visible pixels outside the atlas bounds.");
    }
  }
  const output = new Uint8ClampedArray(width * height * 4);
  const copyWidth = Math.min(width, sourceWidth);
  const copyHeight = Math.min(height, sourceHeight);
  for (let y = 0; y < copyHeight; y++)
    output.set(data.subarray(y * sourceWidth * 4, (y * sourceWidth + copyWidth) * 4), y * width * 4);
  return { width, height, data: output };
}
