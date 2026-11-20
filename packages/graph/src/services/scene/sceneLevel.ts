import { computed } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { Graph } from "../../graph";
import { ECameraScaleLevel } from "../camera/cameraScaleEnums";

import type { TSceneLevel } from "./types";

export function toSceneLevel(level: ECameraScaleLevel): TSceneLevel {
  switch (level) {
    case ECameraScaleLevel.Minimalistic:
      return "minimalistic";
    case ECameraScaleLevel.Schematic:
      return "schematic";
    default:
      return "detailed";
  }
}

/**
 * The scene level as a signal. Re-evaluates on zoom, on a change of the scale-level strategy
 * and on a change of graph constants (the default strategy reads `block.SCALES`).
 */
export function createSceneLevel(graph: Graph): ReadonlySignal<TSceneLevel> {
  return computed((): TSceneLevel => {
    const { scale } = graph.$camera.value;
    const settings = graph.rootStore.settings.$settings.value;
    return toSceneLevel(settings.getCameraBlockScaleLevel(graph, scale));
  });
}
