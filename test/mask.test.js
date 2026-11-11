import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMask } from "../js/core/MaskGenerator.js";
import { RectDetector } from "../js/core/RectDetector.js";
import { findFrameOverlap, findFreePosition } from "../js/core/FrameOverlap.js";

const frame = (x, y, w, h, name = "sprite") => ({ x, y, w, h, name });
const pixel = (mask, x, y) => [...mask.data.slice((y * mask.width + x) * 4, (y * mask.width + x) * 4 + 4)];

test("only the one-pixel inner rectangular outline is opaque", () => {
  const m = generateMask(12, 10, [frame(2, 3, 6, 5)]);
  assert.equal(m.width, 12); assert.equal(m.height, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) {
    const edge = x >= 2 && x < 8 && y >= 3 && y < 8 &&
      (x === 2 || x === 7 || y === 3 || y === 7);
    assert.equal(pixel(m, x, y)[3], edge ? 255 : 0, `${x},${y}`);
  }
  assert.deepEqual(new RectDetector().detect(m, { includeBorder: true }).map(({ x,y,w,h }) => ({x,y,w,h})),
    [{ x: 2, y: 3, w: 6, h: 5 }]);
});

test("adjacent outlines use distinct colors; separated outlines reuse colors", () => {
  const m = generateMask(20, 10, [frame(0,0,4,4), frame(4,0,4,4), frame(13,0,4,4)]);
  assert.notDeepEqual(pixel(m, 3, 1), pixel(m, 4, 1));
  assert.deepEqual(pixel(m, 1, 0), pixel(m, 14, 0));
  const found = new RectDetector().detect(m, { includeBorder: true });
  assert.equal(found.length, 3);
});

test("corner contact, tiny frames, deterministic output and invalid metadata", () => {
  const frames = [frame(1,1,1,1), frame(2,2,2,2)];
  const a = generateMask(5,5,frames,8), b = generateMask(5,5,frames,8);
  assert.deepEqual(a.data, b.data);
  assert.notDeepEqual(pixel(a,1,1), pixel(a,2,2));
  assert.throws(() => generateMask(5,5,[frame(1,1,3,3),frame(2,2,2,2)]), /Overlapping/);
  assert.throws(() => generateMask(5,5,[frame(4,4,2,2)]), /out-of-bounds/);
});

test("rotated and trimmed metadata use packed atlas coordinates", () => {
  const m = generateMask(12,12,[{...frame(3,4,2,5), rotated: true, trimmed: true,
    sourceSize: {w: 8,h: 8}, spriteSourceSize: {x: 1,y: 2,w: 5,h: 2}}]);
  assert.equal(pixel(m,3,4)[3],255);
  assert.equal(pixel(m,4,8)[3],255);
  assert.equal(pixel(m,2,4)[3],0);
});

test("overlap resolution identifies frames and offers a free position", () => {
  const frames = [frame(0, 0, 4, 4), frame(2, 2, 4, 4)];
  assert.deepEqual(findFrameOverlap(frames), [0, 1]);
  const position = findFreePosition(frames, 1, 10, 10);
  assert.deepEqual(position, { x: 4, y: 0 });
  assert.equal(findFrameOverlap([frames[0], { ...frames[1], ...position }]), null);
  assert.equal(findFreePosition(frames, 1, 4, 4), null);
});

test("explicit overlap export uses the later frame on shared outline pixels", () => {
  const first = frame(0, 0, 4, 4);
  const second = frame(2, 0, 4, 4);
  assert.throws(() => generateMask(6, 4, [first, second]), /Overlapping/);
  const mask = generateMask(6, 4, [first, second], 8, { allowOverlap: true });
  assert.deepEqual(pixel(mask, 2, 0), [0, 255, 0, 255]);
  assert.deepEqual(pixel(mask, 0, 0), [255, 0, 0, 255]);
});
