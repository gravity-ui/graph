import type { Signal } from "@preact/signals-core";

export type TSceneEffectKind = "path";

export type TUniformType = "float" | "vec2" | "vec3" | "vec4";
export type TUniformValue<T extends TUniformType> = T extends "float" ? number : readonly number[];
export type TUniformTypes = Record<string, TUniformType>;

export type TSceneShaderDefinition<U extends TUniformTypes, P> = {
  /** GLSL source using the fragment contract for the effect's kind. */
  fragment: string;
  /** Request frames while the effect is active and visible. */
  animated?: boolean;
  /** Read in GLSL as `u_<name>`. Values are signals on the effect. */
  uniforms?: { [K in keyof U]: { type: U[K]; value: TUniformValue<U[K]> } };
  /** Pack typed input into the per-primitive parameters read by the shader. */
  encode?: (input: P) => readonly number[];
};

/** Optional camera-scale bounds for the effect. The primitive remains visible outside this range. */
export type TSceneEffectScaleRange = {
  /** Inclusive lower bound. Defaults to 0. */
  minScale?: number;
  /** Exclusive upper bound. Omit for no upper bound. */
  maxScale?: number;
};

export type TSceneEffect<
  K extends TSceneEffectKind = TSceneEffectKind,
  U extends TUniformTypes = TUniformTypes,
  P = readonly number[],
> = {
  readonly kind: K;
  readonly uniforms: { [N in keyof U]: Signal<TUniformValue<U[N]>> };
  use(input: P, scaleRange?: TSceneEffectScaleRange): TSceneEffectUse<K>;
  /** Reuse the program with independent uniform values. */
  clone(): TSceneEffect<K, U, P>;
};

export type TSceneEffectUse<K extends TSceneEffectKind = TSceneEffectKind> = {
  effect: TSceneEffect<K, TUniformTypes, never>;
  params?: readonly number[];
} & TSceneEffectScaleRange;
