import { ConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import type { TConnectionEffectDefinition } from "../../../components/canvas/connections/effects/types";

import type { TSceneEffect, TUniformType, TUniformTypes } from "./types";

export type TSceneEffectDefinition<U extends TUniformTypes = TUniformTypes, P = readonly number[]> = {
  kind: "path";
} & TConnectionEffectDefinition<U, P>;

/** Define a reusable shader effect. The kind selects its shader inputs and compatible primitives. */
export function defineSceneEffect<U extends TUniformTypes = Record<never, TUniformType>, P = readonly number[]>(
  definition: TSceneEffectDefinition<U, P>
): TSceneEffect<"path", U, P> {
  if (definition.kind !== "path") {
    throw new Error("[@gravity-ui/graph] Unsupported scene effect kind.");
  }
  return new ConnectionEffect(definition);
}
