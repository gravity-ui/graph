import type { TScenePrimitive } from "../types";

declare const rect: Extract<TScenePrimitive, { kind: "rect" }>;
// @ts-expect-error Replace primitives through SceneStore.update so rendering and hit testing see the change.
rect.width = 20;
