export class RectDetector {
  constructor() {}

  /**
   * Detects rectangles in the provided image data.
   * @param {ImageData} imageData
   * @param {Object} options
   *  - includeBorder: boolean
   *  - backgroundTolerance: number (0-255)
   *  - colorTolerance: number (0-255)
   *  - alphaThreshold: number (0-255)
   *  - autoShrink: boolean (when includeBorder=false, shrink only outline-like regions)
   *  - shrinkPixels: number
   * @returns {Array} Array of objects {x, y, w, h, name}
   */
  detect(imageData, options = {}) {
    const {
      includeBorder = false,
      backgroundTolerance = 0,
      colorTolerance = 0,
      alphaThreshold = 1,
      autoShrink = true,
      shrinkPixels = 1,
      backgroundMode = "auto", // 'auto' | 'transparent' | 'color'
    } = options;

    const { width: W, height: H, data } = imageData;
    const visited = new Uint8Array(W * H);
    const res = [];
    const stack = [];
    const uniqueRects = new Set();

    const getIdx = (x, y) => y * W + x;

    // Helper to check if a pixel is "empty" (transparent)
    // We assume the mask uses alpha=0 for background/empty space
    // OR we can assume the top-left pixel defines the background color.
    // Let's stick to Alpha > 0 means "Mask Content" (Border/Fill).
    const isContent = (idx) => data[idx * 4 + 3] > alphaThreshold; // Threshold for alpha

    // If the user provides a mask where the background is white/black but opaque,
    // we might need a different strategy. But usually masks are transparent PNGs.
    // If not, we can check if color != TopLeftColor.

    // Background detection
    // For transparent masks, the most reliable rule is: background == low alpha.
    // Color-based background guessing can incorrectly pick a sprite color (e.g. red)
    // when a region touches the image border.

    // Sample stride to keep this cheap on large images
    const borderStride = Math.max(1, Math.floor(Math.max(W, H) / 512));
    const borderHasTransparency = () => {
      const isTransparentAt = (x, y) => {
        const idx = (y * W + x) * 4 + 3;
        return data[idx] <= alphaThreshold;
      };

      for (let x = 0; x < W; x += borderStride) {
        if (isTransparentAt(x, 0) || isTransparentAt(x, H - 1)) return true;
      }
      for (let y = 0; y < H; y += borderStride) {
        if (isTransparentAt(0, y) || isTransparentAt(W - 1, y)) return true;
      }
      return false;
    };

    const effectiveBackgroundMode =
      backgroundMode === "auto"
        ? borderHasTransparency()
          ? "transparent"
          : "color"
        : backgroundMode;

    const pickBackgroundRGBAFromBorder = () => {
      const counts = new Map();
      const add = (x, y) => {
        const idx = (y * W + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const key = `${r},${g},${b},${a}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      };

      for (let x = 0; x < W; x += borderStride) {
        add(x, 0);
        add(x, H - 1);
      }
      for (let y = 0; y < H; y += borderStride) {
        add(0, y);
        add(W - 1, y);
      }

      let bestKey = null;
      let bestCount = -1;
      for (const [key, count] of counts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestKey = key;
        }
      }

      if (!bestKey) {
        return { r: data[0], g: data[1], b: data[2], a: data[3] };
      }

      const [r, g, b, a] = bestKey.split(",").map((n) => Number(n));
      return { r, g, b, a };
    };

    const bg =
      effectiveBackgroundMode === "color"
        ? pickBackgroundRGBAFromBorder()
        : { r: 0, g: 0, b: 0, a: 0 };

    const isBackground = (idx) => {
      if (!isContent(idx)) return true;
      if (effectiveBackgroundMode === "transparent") return false;
      const i = idx * 4;
      return (
        Math.abs(data[i] - bg.r) <= backgroundTolerance &&
        Math.abs(data[i + 1] - bg.g) <= backgroundTolerance &&
        Math.abs(data[i + 2] - bg.b) <= backgroundTolerance &&
        Math.abs(data[i + 3] - bg.a) <= backgroundTolerance
      );
    };

    // We want to find connected components of NON-BACKGROUND pixels.
    // Each component is a sprite.

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = getIdx(x, y);
        if (visited[id]) continue;

        if (isBackground(id)) {
          visited[id] = 1;
          continue;
        }

        // Found a new region (non-background)
        // We need to flood fill this region to find its bounds.
        // IMPORTANT: We also need to distinguish between DIFFERENT colors if they touch.
        // So we capture the color of this starting pixel.
        const startR = data[id * 4];
        const startG = data[id * 4 + 1];
        const startB = data[id * 4 + 2];
        const startA = data[id * 4 + 3];

        const isSameColor = (idx) => {
          const i = idx * 4;
          return (
            Math.abs(data[i] - startR) <= colorTolerance &&
            Math.abs(data[i + 1] - startG) <= colorTolerance &&
            Math.abs(data[i + 2] - startB) <= colorTolerance &&
            Math.abs(data[i + 3] - startA) <= colorTolerance
          );
        };

        let minX = x,
          maxX = x,
          minY = y,
          maxY = y;
        let pixelCount = 0;
        stack.push([x, y]);
        visited[id] = 1;
        pixelCount++;

        while (stack.length) {
          const [px, py] = stack.pop();

          const neighbors = [
            [px + 1, py],
            [px - 1, py],
            [px, py + 1],
            [px, py - 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nid = getIdx(nx, ny);
            if (visited[nid]) continue;

            // If it's background, mark visited and skip
            if (isBackground(nid)) {
              visited[nid] = 1;
              continue;
            }

            // If alpha is too low, consider it background-ish
            if (!isContent(nid)) {
              visited[nid] = 1;
              continue;
            }

            // If it's a different color, it's a different sprite. Stop.
            if (!isSameColor(nid)) {
              continue;
            }

            // Same color, part of this sprite
            visited[nid] = 1;
            stack.push([nx, ny]);
            pixelCount++;

            if (nx < minX) minX = nx;
            if (nx > maxX) maxX = nx;
            if (ny < minY) minY = ny;
            if (ny > maxY) maxY = ny;
          }
        }

        // Region complete.
        // If options.includeBorder is TRUE, we take the full extent (minX to maxX).
        // If options.includeBorder is FALSE, we assume the outer 1px is the border and we want the inside.
        // But wait, if the user draws a SOLID block, "inside" implies shrinking.
        // If the user draws an OUTLINE, this flood fill would only catch the outline itself!

        // RE-EVALUATING "OUTLINE" vs "SOLID"
        // If the user draws outlines (1px width), the "isSameColor" flood fill will trace the outline.
        // The "inside" of the outline is Background (or transparent).
        // So we would get a rect that covers the outline.
        // If the user wants the *content* inside the outline, they usually want the hole.

        // However, the user said "square of different color touching".
        // If I have a red outline and a blue outline touching, the "Red Outline" component will be found.
        // Its bounds (minX, maxX...) will cover the red box.
        // If "includeBorder" is true, we return this box.
        // If "includeBorder" is false, we shrink it by 1px?

        // This seems to satisfy "unlimited colors" and "touching squares".
        // It treats the mask as "Paint the areas you want to export".
        // If you paint an outline, you get the outline's bounds.
        // If you paint a solid box, you get the box's bounds.

        let finalX = minX;
        let finalY = minY;
        let finalW = maxX - minX + 1;
        let finalH = maxY - minY + 1;

        if (!includeBorder) {
          // Historically we always shrank 1px, assuming the mask is an OUTLINE.
          // This causes unwanted 1px gaps when the user paints SOLID blocks.
          // Auto-shrink only when the detected region looks like an outline.
          const boundsArea = finalW * finalH;
          const fillRatio = boundsArea > 0 ? pixelCount / boundsArea : 0;
          const shouldShrink = !autoShrink ? true : fillRatio < 0.25;

          if (shouldShrink) {
            const s = Math.max(0, shrinkPixels | 0);
            finalX += s;
            finalY += s;
            finalW -= s * 2;
            finalH -= s * 2;
          }
        }

        if (finalW > 0 && finalH > 0) {
          const key = `${finalX},${finalY},${finalW},${finalH}`;
          if (!uniqueRects.has(key)) {
            uniqueRects.add(key);
            res.push({
              x: finalX,
              y: finalY,
              w: finalW,
              h: finalH,
              name: `sprite_${res.length}`,
              group: "default",
            });
          }
        }
      }
    }

    return res;
  }
}
