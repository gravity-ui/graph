import type { TTileRect } from "../../culling/TileIndex";

/** Axis-aligned bounds of a box rotated about a point in the same coordinate space. */
export function rotateBounds(box: TTileRect, x: number, y: number, angle: number): TTileRect {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = (box.minX + box.maxX) / 2 - x;
  const dy = (box.minY + box.maxY) / 2 - y;
  const cx = x + dx * c - dy * s;
  const cy = y + dx * s + dy * c;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const halfX = (Math.abs(c) * width + Math.abs(s) * height) / 2;
  const halfY = (Math.abs(s) * width + Math.abs(c) * height) / 2;
  return { minX: cx - halfX, minY: cy - halfY, maxX: cx + halfX, maxY: cy + halfY };
}
