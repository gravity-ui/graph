import type { TSceneSize } from "./types";

function clamp(value: number, min = -Infinity, max = Infinity): number {
  return Math.min(Math.max(value, min), max);
}

/** World size of a camera-aware size at a camera scale. */
export function resolveSceneSize(size: TSceneSize, scale: number): number {
  if (typeof size === "number") return size;
  if ("px" in size) return clamp(size.px / scale, size.minWorld, size.maxWorld);
  return clamp(size.world * scale, size.minPx, size.maxPx) / scale;
}
