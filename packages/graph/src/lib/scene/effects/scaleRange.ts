import type { TSceneEffectScaleRange } from "./types";

/** Validates both `use()` options and effect uses supplied as literals. */
export function validateSceneEffectScaleRange({ minScale, maxScale }: TSceneEffectScaleRange): void {
  if (minScale !== undefined && (!Number.isFinite(minScale) || minScale < 0)) {
    throw new Error("[@gravity-ui/graph] Effect minScale must be finite and nonnegative.");
  }
  if (maxScale !== undefined && (!Number.isFinite(maxScale) || maxScale <= (minScale ?? 0))) {
    throw new Error("[@gravity-ui/graph] Effect maxScale must be finite and greater than minScale.");
  }
}

export function isSceneEffectActive(range: TSceneEffectScaleRange, scale: number): boolean {
  return scale >= (range.minScale ?? 0) && scale < (range.maxScale ?? Infinity);
}
