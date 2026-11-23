import cloneDeepWith from "lodash/cloneDeepWith";

import { toPathEffect } from "../../../lib/scene/effects/PathEffect";
import type { TSceneEffectUse } from "../../../lib/scene/effects/types";
import type { TScenePrimitive } from "../../../lib/scene/types";

/** Copy scene values and handle the resources a plain deep copy cannot reproduce. */
export function createPrimitiveSnapshot(): (primitive: TScenePrimitive) => TScenePrimitive {
  const effects = new Map<TSceneEffectUse["effect"], TSceneEffectUse["effect"]>();
  return (primitive) =>
    cloneDeepWith(primitive, (value: unknown) => {
      if (primitive.kind === "icon" && value === primitive.path) return new Path2D(primitive.path);
      if (primitive.kind === "sprite" && value === primitive.image) return primitive.image.cloneNode();
      if (primitive.kind === "polygon" && value === primitive.points) return primitive.points.slice();
      if (primitive.kind === "path") {
        if (value === primitive.segments) return primitive.segments.slice();
        const effect = primitive.effect?.effect;
        if (effect && value === effect) {
          let copy = effects.get(effect);
          if (!copy) {
            copy = toPathEffect(effect).snapshot();
            effects.set(effect, copy);
          }
          return copy;
        }
      }
      return undefined;
    });
}
