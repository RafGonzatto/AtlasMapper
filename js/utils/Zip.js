// Small ZIP writer using stored entries, so project exports need no dependency.
export async function createZip(files) {
  const encoder = new TextEncoder();
  const u16 = (v, n) => { v.push(n & 255, (n >>> 8) & 255); };
  const u32 = (v, n) => { u16(v, n); u16(v, n >>> 16); };
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  const parts = [], central = [];
  let offset = 0;
  for (const [name, blob] of files) {
    const filename = encoder.encode(name);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let crc = 0xffffffff;
    for (const b of bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = [];
    u32(local, 0x04034b50); u16(local, 20); u16(local, 0x0800); u16(local, 0);
    u16(local, 0); u16(local, 0); u32(local, crc);
    u32(local, bytes.length); u32(local, bytes.length);
    u16(local, filename.length); u16(local, 0);
    parts.push(new Uint8Array(local), filename, bytes);
    const record = [];
    u32(record, 0x02014b50); u16(record, 20); u16(record, 20);
    u16(record, 0x0800); u16(record, 0); u16(record, 0); u16(record, 0);
    u32(record, crc); u32(record, bytes.length); u32(record, bytes.length);
    u16(record, filename.length); u16(record, 0); u16(record, 0);
    u16(record, 0); u16(record, 0); u32(record, 0); u32(record, offset);
    central.push(new Uint8Array(record), filename);
    offset += local.length + filename.length + bytes.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = [];
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0);
  u16(end, files.length); u16(end, files.length);
  u32(end, centralSize); u32(end, offset); u16(end, 0);
  return new Blob([...parts, ...central, new Uint8Array(end)], { type: "application/zip" });
}
