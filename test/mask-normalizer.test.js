import { test } from "node:test";
import assert from "node:assert/strict";
import { RectDetector } from "../js/core/RectDetector.js";
import { inspectMask, normalizeMask, fitMaskToAtlas } from "../js/core/MaskNormalizer.js";

const image = (width, height, pixels) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, rgba] of pixels) data.set(rgba, (y * width + x) * 4);
  return { width, height, data };
};
const pixel = (mask, x, y) =>
  [...mask.data.slice((y * mask.width + x) * 4, (y * mask.width + x) * 4 + 4)];

test("clean solid-color masks are not offered normalization", () => {
  const m = image(4, 4, [[0,0,[255,0,0,255]], [1,0,[0,255,0,255]]]);
  assert.equal(inspectMask(m).needsNormalization, false);
});

test("anti-aliased rectangular outlines recover separate sprite bounds", () => {
  const pixels = [];
  for (let y = 1; y <= 8; y++) for (let x = 1; x <= 16; x++) {
    const left = x <= 8;
    if (x === 1 || x === 8 || x === 9 || x === 16 || y === 1 || y === 8) {
      const rgba = left
        ? [223 + (x % 2), 3 + (y % 2), 3, 95 + (x % 5) * 32]
        : [1, 253 + (x % 2), y % 2, 95 + (x % 5) * 32];
      pixels.push([x, y, rgba]);
    }
  }
  const m = image(18, 10, pixels);
  assert.equal(inspectMask(m).needsNormalization, true);
  const detector = new RectDetector();
  const raw = detector.detect(m, { includeBorder: true });
  const normalized = normalizeMask(m);
  const rects = detector.detect(normalized, { includeBorder: true });
  assert.ok(raw.length > 2, "The original mask should fragment on color/alpha changes");
  assert.deepEqual(rects.map(({ x,y,w,h }) => ({x,y,w,h})), [
    { x: 1, y: 1, w: 8, h: 8 },
    { x: 9, y: 1, w: 8, h: 8 },
  ]);
});

test("transparent background and tiny valid frames are preserved", () => {
  const m = image(4,4,[[1,1,[10,20,30,255]],[2,2,[255,0,0,20]],[3,3,[255,0,0,0]]]);
  const result = normalizeMask(m);
  assert.equal(pixel(result,1,1)[3],255);
  assert.equal(pixel(result,2,2)[3],0);
  assert.equal(pixel(result,3,3)[3],0);
});

test("fitting mask dimensions never scales or moves pixels", () => {
  const m = image(3,2,[[2,1,[0,255,0,255]]]);
  const padded = fitMaskToAtlas(m,3,4);
  assert.equal(pixel(padded,2,1)[3],255);
  assert.equal(pixel(padded,2,3)[3],0);
  assert.throws(() => fitMaskToAtlas(m,2,2), /outside/);
  assert.equal(fitMaskToAtlas(m,3,2),m);
  assert.throws(() => fitMaskToAtlas(m,3,1), /outside/);
});