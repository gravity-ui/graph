import type { TGridLayer } from "../../../../graphConfig";
import type { TCameraState } from "../../../../services/camera/CameraService";
import type { TRect } from "../../../../utils/types/shapes";

/** Max on-screen step in device px for a layer to be rendered with a pattern tile */
export const PATTERN_MAX_TILE_PX = 256;

export type TResolvedGridLayer = {
  /** Distance between dots in world units */
  stepWorld: number;
  /** Distance between dots on screen in CSS px */
  spacingPx: number;
  /** Layer opacity in (0, 1] */
  opacity: number;
  /** Dot diameter in CSS px */
  dotSize: number;
};

export function smoothstep(from: number, to: number, value: number): number {
  if (to <= from) {
    return value >= from ? 1 : 0;
  }
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Validates, de-duplicates (first `step` wins) and sorts the configured layers,
 * then keeps only the layers that are at least partially visible at `scale`
 * and whose dots stay apart (on-screen step is at least `dotSize + 1` px).
 * Returns no layers for a missing layer list or a fade window that is not two finite numbers.
 */
export function resolveGridLayers(
  layers: ReadonlyArray<Partial<TGridLayer> | undefined> | undefined,
  gridSize: number,
  scale: number,
  fade: readonly [number, number] | undefined
): TResolvedGridLayer[] {
  if (!layers || !Array.isArray(fade) || fade.length !== 2 || !fade.every(Number.isFinite)) {
    return [];
  }

  const seenSteps = new Set<number>();
  const validLayers: TGridLayer[] = [];
  for (const layer of layers) {
    if (!layer || !isPositiveFinite(layer.step) || !isPositiveFinite(layer.dotSize) || seenSteps.has(layer.step)) {
      continue;
    }
    seenSteps.add(layer.step);
    validLayers.push({ step: layer.step, dotSize: layer.dotSize });
  }
  validLayers.sort((a, b) => a.step - b.step);

  const [fadeFrom, fadeTo] = fade;
  const resolved: TResolvedGridLayer[] = [];
  for (const layer of validLayers) {
    const stepWorld = layer.step * gridSize;
    const spacingPx = stepWorld * scale;
    const opacity = smoothstep(fadeFrom, fadeTo, spacingPx);
    // Dots that touch would merge into a fill, and the pattern tile would clip a dot into a square
    if (opacity > 0 && spacingPx >= layer.dotSize + 1) {
      resolved.push({ stepWorld, spacingPx, opacity, dotSize: layer.dotSize });
    }
  }
  return resolved;
}

export function isPatternLayer(spacingPx: number, dpr: number): boolean {
  return spacingPx * dpr <= PATTERN_MAX_TILE_PX;
}

/** Pattern tile side in device px: one grid cell, rounded to whole pixels */
export function getGridTilePx(spacingPx: number, dpr: number): number {
  return Math.max(1, Math.round(spacingPx * dpr));
}

export function getVisibleWorldRect(camera: Pick<TCameraState, "x" | "y" | "width" | "height" | "scale">): TRect {
  return {
    // "0 - value" instead of "-value" keeps a zero offset +0 rather than -0
    x: 0 - camera.x / camera.scale,
    y: 0 - camera.y / camera.scale,
    width: camera.width / camera.scale,
    height: camera.height / camera.scale,
  };
}

export function intersectRects(a: TRect, b: TRect): TRect | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  // Negated comparisons also reject NaN coordinates
  if (!(right > x) || !(bottom > y)) {
    return undefined;
  }
  return { x, y, width: right - x, height: bottom - y };
}
