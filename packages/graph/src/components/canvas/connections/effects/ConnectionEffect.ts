import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";

import { validateSceneEffectScaleRange } from "../../../../lib/scene/effects/scaleRange";
import { HAS_NODE_ENV } from "../../../../utils/development";
import type { TLineStroke } from "../lines/types";

import type {
  TConnectionEffect,
  TConnectionEffectDefinition,
  TConnectionEffectScaleRange,
  TConnectionEffectUse,
  TUniformType,
  TUniformTypes,
  TUniformValue,
} from "./types";
import { countEffectObject, warnTruncatedParams } from "./utils/diagnostics";

/** Numbers of parameters per connection that reach the shader. */
export const MAX_EFFECT_PARAMS = 8;

const UNIFORM_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Internal implementation of a path effect. */
export class ConnectionEffect<U extends TUniformTypes = TUniformTypes, P = readonly number[]>
  implements TConnectionEffect<U, P>
{
  public readonly kind = "path";

  public readonly fragment: string;

  public readonly animated: boolean;

  public readonly extraWidth: number;

  public readonly uniformTypes: Readonly<Record<string, TUniformType>>;

  /** The GLSL declarations of the uniforms: a `uniform <type> u_<name>;` line per uniform, sorted by name. */
  public readonly uniformDeclarations: string;

  /** Programs are cached by this key: the uniform declarations plus the fragment. Clones share it. */
  public readonly programKey: string;

  public readonly uniforms: { [K in keyof U]: Signal<TUniformValue<U[K]>> };

  constructor(private readonly definition: TConnectionEffectDefinition<U, P>) {
    const { fragment, animated = false, extraWidth = 0 } = definition;
    if (!Number.isFinite(extraWidth) || extraWidth < 0) {
      throw new Error(`[@gravity-ui/graph] extraWidth must be a finite number >= 0, got ${extraWidth}.`);
    }
    this.fragment = fragment;
    this.animated = animated;
    this.extraWidth = extraWidth;

    const types: Record<string, TUniformType> = {};
    const signals: Record<string, Signal<number | readonly number[]>> = {};
    const entries = Object.entries(definition.uniforms ?? {}) as [
      string,
      { type: TUniformType; value: number | readonly number[] },
    ][];
    for (const [name, { type, value }] of entries) {
      if (!UNIFORM_NAME.test(name)) {
        throw new Error(`[@gravity-ui/graph] Invalid uniform name "${name}": use letters, digits and underscores.`);
      }
      types[name] = type;
      signals[name] = signal(value);
    }
    this.uniformTypes = types;
    this.uniforms = signals as unknown as { [K in keyof U]: Signal<TUniformValue<U[K]>> };
    this.uniformDeclarations = Object.keys(types)
      .sort()
      .map((name) => `uniform ${types[name]} u_${name};\n`)
      .join("");
    this.programKey = this.uniformDeclarations + fragment;
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production") countEffectObject(this, fragment);
  }

  public use(input: P, scaleRange?: TConnectionEffectScaleRange): TConnectionEffectUse {
    if (scaleRange) validateSceneEffectScaleRange(scaleRange);
    let params = this.definition.encode ? this.definition.encode(input) : (input as unknown as readonly number[]);
    if (params.length > MAX_EFFECT_PARAMS) {
      if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
        warnTruncatedParams(this, params.length, MAX_EFFECT_PARAMS);
      params = params.slice(0, MAX_EFFECT_PARAMS);
    }
    const use: TConnectionEffectUse = { effect: this as unknown as TConnectionEffectUse["effect"], params };
    if (scaleRange?.minScale !== undefined) use.minScale = scaleRange.minScale;
    if (scaleRange?.maxScale !== undefined) use.maxScale = scaleRange.maxScale;
    return use;
  }

  public clone(): ConnectionEffect<U, P> {
    return new ConnectionEffect(this.definition);
  }

  /** Resolves the plain stroke for a line drawn by the compatibility Canvas batch. */
  public getFallbackStroke(stroke: TLineStroke, params: readonly number[]): TLineStroke {
    return this.definition.fallback ? this.definition.fallback(stroke, params) : stroke;
  }
}

/** Internal: the class instance behind a public effect object, with the object's own types. */
export function toConnectionEffect<U extends TUniformTypes, P>(
  effect: TConnectionEffect<U, P>
): ConnectionEffect<U, P> {
  if (!(effect instanceof ConnectionEffect)) {
    throw new Error('[@gravity-ui/graph] Not a path effect: create it with defineSceneEffect({ kind: "path", ... }).');
  }
  return effect as ConnectionEffect<U, P>;
}
