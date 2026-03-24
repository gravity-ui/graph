import type { Graph } from "../../graph";

import { ECameraScaleLevel } from "./cameraScaleEnums";

/**
 * Resolves qualitative zoom tier for block rendering (Canvas detail level, React activation, etc.).
 * Override via graph settings `getCameraBlockScaleLevel`.
 */
export type TGetCameraBlockScaleLevel = (graph: Graph, scale: number) => ECameraScaleLevel;

/**
 * Default block zoom-tier strategy: uses `graphConstants.block.SCALES` thresholds.
 * Same function reference as `DefaultSettings.getCameraBlockScaleLevel` and the default `getCameraBlockScaleLevel`
 * in graph settings — use this export when you need the built-in strategy by identity (e.g. `===` or explicit config).
 */
export function defaultGetCameraBlockScaleLevel(graph: Graph, scale: number): ECameraScaleLevel {
  const scales = graph.graphConstants.block.SCALES;
  let scaleLevel = ECameraScaleLevel.Minimalistic;
  if (scale >= scales[1]) {
    scaleLevel = ECameraScaleLevel.Schematic;
  }
  if (scale >= scales[2]) {
    scaleLevel = ECameraScaleLevel.Detailed;
  }
  return scaleLevel;
}
