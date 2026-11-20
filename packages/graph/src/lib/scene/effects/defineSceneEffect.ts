import { PathEffect } from "./PathEffect";
import type { TSceneEffect, TSceneEffectDefinition, TUniformType, TUniformTypes } from "./types";

/** Define a reusable shader effect. The kind selects its shader inputs and compatible primitives. */
export function defineSceneEffect<U extends TUniformTypes = Record<never, TUniformType>, P = readonly number[]>(
  definition: TSceneEffectDefinition<U, P>
): TSceneEffect<"path", U, P> {
  if (definition.kind !== "path") {
    throw new Error("[@gravity-ui/graph] Unsupported scene effect kind.");
  }
  return new PathEffect(definition);
}
