export function findFrameOverlap(frames) {
  const sorted = frames.map((r, i) => ({ ...r, i })).sort((a, b) => a.x - b.x || a.y - b.y || a.i - b.i);
  let active = [];
  for (const r of sorted) {
    active = active.filter(a => a.x + a.w > r.x);
    const a = active.find(a => a.y < r.y + r.h && r.y < a.y + a.h);
    if (a) return [a.i, r.i];
    active.push(r);
  }
  return null;
}

export function findFreePosition(frames, index, width, height) {
  const target = frames[index];
  if (target.w > width || target.h > height) return null;
  const others = frames.filter((_, i) => i !== index);
  const xs = new Set([0]);
  const ys = new Set([0]);
  for (const r of others) {
    xs.add(r.x + r.w);
    ys.add(r.y + r.h);
  }
  const candidates = [];
  for (const x of xs) for (const y of ys) {
    if (x + target.w > width || y + target.h > height) continue;
    if (others.some(r => x < r.x + r.w && r.x < x + target.w && y < r.y + r.h && r.y < y + target.h)) continue;
    candidates.push({ x, y });
  }
  candidates.sort((a, b) =>
    Math.abs(a.x - target.x) + Math.abs(a.y - target.y) - Math.abs(b.x - target.x) - Math.abs(b.y - target.y) ||
    a.y - b.y || a.x - b.x);
  return candidates[0] || null;
}
