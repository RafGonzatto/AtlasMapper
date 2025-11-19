export class RectDetector {
  constructor() {}

  /**
   * Detects rectangles in the provided image data.
   * @param {ImageData} imageData
   * @param {Object} options { includeBorder: boolean }
   * @returns {Array} Array of objects {x, y, w, h, name}
   */
  detect(imageData, options = { includeBorder: false }) {
    const { width: W, height: H, data } = imageData;
    const visited = new Uint8Array(W * H);
    const res = [];
    const stack = [];

    const getIdx = (x, y) => y * W + x;

    // Helper to check if a pixel is "empty" (transparent)
    // We assume the mask uses alpha=0 for background/empty space
    // OR we can assume the top-left pixel defines the background color.
    // Let's stick to Alpha > 0 means "Mask Content" (Border/Fill).
    const isContent = (idx) => data[idx * 4 + 3] > 20; // Threshold for alpha

    // If the user provides a mask where the background is white/black but opaque,
    // we might need a different strategy. But usually masks are transparent PNGs.
    // If not, we can check if color != TopLeftColor.

    // Let's try to detect background color from (0,0)
    const bgR = data[0],
      bgG = data[1],
      bgB = data[2],
      bgA = data[3];
    const isBackground = (idx) => {
      const i = idx * 4;
      return (
        Math.abs(data[i] - bgR) < 5 &&
        Math.abs(data[i + 1] - bgG) < 5 &&
        Math.abs(data[i + 2] - bgB) < 5 &&
        Math.abs(data[i + 3] - bgA) < 5
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
            Math.abs(data[i] - startR) < 5 &&
            Math.abs(data[i + 1] - startG) < 5 &&
            Math.abs(data[i + 2] - startB) < 5 &&
            Math.abs(data[i + 3] - startA) < 5
          );
        };

        let minX = x,
          maxX = x,
          minY = y,
          maxY = y;
        stack.push([x, y]);
        visited[id] = 1;

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
              // visited[nid] = 1; // Don't mark visited here, let the main loop handle it?
              // Actually, if we mark it here, we save main loop iterations.
              // But wait, if we mark it here, we might block other regions?
              // No, background is background.
              continue;
            }

            // If it's a different color, it's a different sprite. Stop.
            if (!isSameColor(nid)) {
              continue;
            }

            // Same color, part of this sprite
            visited[nid] = 1;
            stack.push([nx, ny]);

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

        if (!options.includeBorder) {
          // Shrink by 1px on all sides
          finalX += 1;
          finalY += 1;
          finalW -= 2;
          finalH -= 2;
        }

        if (finalW > 0 && finalH > 0) {
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

    return res;
  }
}
