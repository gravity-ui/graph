import type { Signal } from "@preact/signals-core";

import type { TLineStroke } from "../lines/types";

export type TUniformType = "float" | "vec2" | "vec3" | "vec4";

export type TUniformValue<T extends TUniformType> = T extends "float" ? number : readonly number[];

export type TUniformTypes = Record<string, TUniformType>;

export type TConnectionEffectDefinition<U extends TUniformTypes, P> = {
  /** GLSL ES 3.00 defining `vec4 effect(ConnectionFragment f, vec4 color)`. */
  fragment: string;
  /** Redraw every animation frame while a connection with the effect is drawn (effects that read `f.time`). */
  animated?: boolean;
  /** Read in GLSL as `u_<name>`; values are signals on the effect. */
  uniforms?: { [K in keyof U]: { type: U[K]; value: TUniformValue<U[K]> } };
  /** CSS pixels the effect may draw outside each side of the stroke, for glows. Default 0. */
  extraWidth?: number;
  /** Optional stroke for the compatibility Canvas batch. Scene Canvas2D rendering and export use the base stroke. */
  fallback?: (stroke: TLineStroke, params: readonly number[]) => TLineStroke;
  /** Typed parameters: packs `use(input)` into the 8 numbers the shader reads. */
  encode?: (input: P) => readonly number[];
};

export type TConnectionEffect<U extends TUniformTypes = TUniformTypes, P = readonly number[]> = {
  readonly uniforms: { [K in keyof U]: Signal<TUniformValue<U[K]>> };
  /** Packages this effect, the encoded input (or the input itself) and its optional activity range. */
  use(input: P, scaleRange?: TConnectionEffectScaleRange): TConnectionEffectUse;
  /** The same source with its own uniform values: one program, separate values (another graph). */
  clone(): TConnectionEffect<U, P>;
};

/** The camera scales at which a connection effect is active. Supplied bounds must be finite and nonnegative. */
export type TConnectionEffectScaleRange = {
  /** Inclusive lower bound. Defaults to 0. */
  minScale?: number;
  /** Exclusive upper bound, greater than minScale. Omit for no upper bound. */
  maxScale?: number;
};

/** What `getStroke()` returns in `stroke.effect`: the effect object and the connection's parameters. */
export type TConnectionEffectUse = {
  effect: TConnectionEffect<TUniformTypes, never>;
  params?: readonly number[];
} & TConnectionEffectScaleRange;
