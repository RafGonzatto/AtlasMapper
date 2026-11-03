import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectState } from "../js/core/ProjectState.js";
import { createZip } from "../js/utils/Zip.js";

test("frame groups survive workspace serialization and appending", () => {
  const state = new ProjectState();
  state.setRects([{ x: 0, y: 0, w: 4, h: 4, name: "idle", group: "player" }]);
  state.appendRects([{ x: 5, y: 0, w: 4, h: 4, name: "run", group: "player" }]);
  assert.equal(state.groups.has("player"), true);

  const restored = new ProjectState();
  restored.loadFromSerializable(state.toSerializable());
  assert.deepEqual(restored.rects.map(({ name, group }) => ({ name, group })), [
    { name: "idle", group: "player" },
    { name: "run", group: "player" },
  ]);
  assert.equal(restored.groups.has("player"), true);
});

test("project ZIP contains named files with their original bytes", async () => {
  const zip = await createZip([
    ["atlas.json", new Blob(['{"frames":{}}'])],
    ["á.png", new Blob([Uint8Array.from([0, 1, 255])])],
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  let offset = 0;
  for (const [name, expected] of [
    ["atlas.json", new TextEncoder().encode('{"frames":{}}')],
    ["á.png", Uint8Array.from([0, 1, 255])],
  ]) {
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    assert.equal(decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength)), name);
    assert.equal(size, expected.length);
    assert.deepEqual(bytes.slice(offset + 30 + nameLength + extraLength,
      offset + 30 + nameLength + extraLength + size), expected);
    offset += 30 + nameLength + extraLength + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
});
