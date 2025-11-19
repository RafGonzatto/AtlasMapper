export class RectDetector {
  constructor() {
    // Colors used to detect borders (+/- 10 tolerance)
    this.palettes = [
      { r: 0, g: 255, b: 150 }, // Lime green
      { r: 255, g: 195, b: 0 }, // Orange-yellow
      { r: 250, g: 255, b: 0 }, // Bright yellow
      { r: 255, g: 10, b: 200 }, // Magenta
    ];
  }

  isBorder(r, g, b) {
    return this.palettes.some(
      (p) =>
        Math.abs(r - p.r) <= 10 &&
        Math.abs(g - p.g) <= 10 &&
        Math.abs(b - p.b) <= 10
    );
  }

  /**
   * Detects rectangles in the provided image data.
   * @param {ImageData} imageData
   * @returns {Array} Array of objects {x, y, w, h, name}
   */
  detect(imageData) {
    const { width: W, height: H, data } = imageData;
    const visited = new Uint8Array(W * H);
    const res = [];
    const stack = [];

    const getIdx = (x, y) => y * W + x;
    const getPixelIdx = (x, y) => (y * W + x) << 2;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = getIdx(x, y);

        // Check if visited or if it is a border pixel
        if (visited[id]) continue;

        const pIdx = id << 2;
        if (this.isBorder(data[pIdx], data[pIdx + 1], data[pIdx + 2])) {
          continue;
        }

        // Start flood fill for a new region
        let minX = x,
          maxX = x,
          minY = y,
          maxY = y;
        stack.push([x, y]);
        visited[id] = 1;

        while (stack.length) {
          const [px, py] = stack.pop();

          // Check 4 neighbors
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

            const nPIdx = nid << 2;
            if (this.isBorder(data[nPIdx], data[nPIdx + 1], data[nPIdx + 2])) {
              continue;
            }

            visited[nid] = 1;
            stack.push([nx, ny]);

            if (nx < minX) minX = nx;
            if (nx > maxX) maxX = nx;
            if (ny < minY) minY = ny;
            if (ny > maxY) maxY = ny;
          }
        }

        // Ignore if it touches the edges of the image (optional, but kept from original logic)
        // Original logic: if (minX === 0 || minY === 0 || maxX === W - 1 || maxY === H - 1) continue;
        // Let's keep it to avoid detecting the background as a giant rect if borders are on edge
        if (minX === 0 || minY === 0 || maxX === W - 1 || maxY === H - 1) {
          continue;
        }

        // Add found rectangle
        // Original logic adds padding/correction: x: minX - 1, w: maxX - minX + 3
        // This implies the border is 1px thick and we want to include it or just outside it?
        // The original code: x: minX - 1, y: minY - 1, w: maxX - minX + 3, h: maxY - minY + 3
        // If minX is the first non-border pixel, minX-1 is the border.
        // If we want the sprite content, we might want minX.
        // However, usually spritesheets include the padding or the user wants the grid cell.
        // I will stick to the original logic to preserve behavior.
        res.push({
          x: minX - 1,
          y: minY - 1,
          w: maxX - minX + 3,
          h: maxY - minY + 3,
          name: "",
        });
      }
    }
    return res;
  }
}
