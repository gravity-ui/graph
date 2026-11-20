import { HAS_NODE_ENV } from "../../../utils/development";
import { validateSceneEffectScaleRange } from "../effects/scaleRange";
import type { TScenePrimitive, TSceneStyle } from "../types";

/**
 * Validates literal effect ranges before publishing primitives. Development builds also freeze text primitives with
 * their `cameraAware` objects, since the WebGL backend compares texts by identity and retains them after encoding.
 */
export function preparePrimitives(primitives: readonly TScenePrimitive[]): void {
  for (const primitive of primitives) {
    if (primitive.kind === "path" && primitive.effect) validateSceneEffectScaleRange(primitive.effect);
    if (
      !HAS_NODE_ENV ||
      process.env.NODE_ENV === "production" ||
      primitive.kind !== "text" ||
      Object.isFrozen(primitive)
    )
      continue;
    if (typeof primitive.cameraAware === "object") Object.freeze(primitive.cameraAware);
    Object.freeze(primitive);
  }
}

export function validateStyleEffects(style: TSceneStyle): void {
  for (const values of [style.base, style.parts]) {
    for (const part in values) {
      const effect = values[part]?.effect;
      if (effect) validateSceneEffectScaleRange(effect);
    }
  }
}
