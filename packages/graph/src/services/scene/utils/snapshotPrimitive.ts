import cloneDeep from "lodash/cloneDeep";
import cloneDeepWith from "lodash/cloneDeepWith";

import { toPathEffect } from "../../../lib/scene/effects/PathEffect";
import type { TSceneEffectUse } from "../../../lib/scene/effects/types";
import type { TScenePrimitive } from "../../../lib/scene/types";

/** Copy scene values and handle the resources a plain deep copy cannot reproduce. */
export function createPrimitiveSnapshot(): (primitive: TScenePrimitive) => TScenePrimitive<HTMLCanvasElement> {
  const effects = new Map<TSceneEffectUse["effect"], TSceneEffectUse["effect"]>();
  const images = new Map<HTMLImageElement, HTMLCanvasElement>();

  return (primitive) => {
    if (primitive.kind === "sprite") {
      const { image, ...sprite } = primitive;
      let copy = images.get(image);
      if (!copy) {
        // Cloning an img can load its source again. Copy the current pixels synchronously.
        copy = image.ownerDocument.createElement("canvas");
        copy.width = image.naturalWidth || 1;
        copy.height = image.naturalHeight || 1;
        if (image.complete && image.naturalWidth && image.naturalHeight) {
          copy.getContext("2d")?.drawImage(image, 0, 0);
        }
        images.set(image, copy);
      }
      return { ...cloneDeep(sprite), image: copy };
    }

    return cloneDeepWith(primitive, (value: unknown) => {
      if (primitive.kind === "icon" && value === primitive.path) return new Path2D(primitive.path);
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
  };
}
