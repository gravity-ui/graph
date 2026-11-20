import type {
  TSceneEffect,
  TSceneEffectScaleRange,
  TSceneEffectUse,
  TSceneShaderDefinition,
  TUniformTypes,
} from "../../../../lib/scene/effects/types";
import type { TLineStroke } from "../lines/types";

export type { TUniformType, TUniformTypes, TUniformValue } from "../../../../lib/scene/effects/types";

/** A shader defining `vec4 effect(PathFragment f, vec4 color)` in GLSL ES 3.00. */
export type TConnectionEffectDefinition<U extends TUniformTypes, P> = TSceneShaderDefinition<U, P> & {
  /** CSS pixels the effect may draw outside each side of the stroke, for glows. Default 0. */
  extraWidth?: number;
  /** Optional stroke for the compatibility Canvas batch. Scene Canvas2D rendering and export use the base stroke. */
  fallback?: (stroke: TLineStroke, params: readonly number[]) => TLineStroke;
};

export type TConnectionEffect<U extends TUniformTypes = TUniformTypes, P = readonly number[]> = TSceneEffect<
  "path",
  U,
  P
>;

/** The camera scales at which a connection effect is active. Supplied bounds must be finite and nonnegative. */
export type TConnectionEffectScaleRange = TSceneEffectScaleRange;

/** What `getStroke()` returns in `stroke.effect`: the effect object and the connection's parameters. */
export type TConnectionEffectUse = TSceneEffectUse<"path">;
