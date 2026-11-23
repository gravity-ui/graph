import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";

import type { TLineStroke } from "../../../components/canvas/connections/lines/types";
import { HAS_NODE_ENV } from "../../../utils/development";

import { validateSceneEffectScaleRange } from "./scaleRange";
import { MAX_PATH_EFFECT_PARAMS } from "./types";
import type {
  TSceneEffect,
  TSceneEffectDefinition,
  TSceneEffectScaleRange,
  TSceneEffectUse,
  TUniformType,
  TUniformTypes,
  TUniformValue,
} from "./types";
import { countEffectObject, warnTruncatedParams } from "./utils/diagnostics";

const UNIFORM_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Internal implementation of a path effect. */
export class PathEffect<U extends TUniformTypes = TUniformTypes, P = readonly number[]>
  implements TSceneEffect<"path", U, P>
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

  constructor(private readonly definition: TSceneEffectDefinition<U, P>) {
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

  public use(input: P, scaleRange?: TSceneEffectScaleRange): TSceneEffectUse {
    if (scaleRange) validateSceneEffectScaleRange(scaleRange);
    let params = this.definition.encode ? this.definition.encode(input) : (input as unknown as readonly number[]);
    if (params.length > MAX_PATH_EFFECT_PARAMS) {
      if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
        warnTruncatedParams(this, params.length, MAX_PATH_EFFECT_PARAMS);
      params = params.slice(0, MAX_PATH_EFFECT_PARAMS);
    }
    const use: TSceneEffectUse = { effect: this as unknown as TSceneEffectUse["effect"], params };
    if (scaleRange?.minScale !== undefined) use.minScale = scaleRange.minScale;
    if (scaleRange?.maxScale !== undefined) use.maxScale = scaleRange.maxScale;
    return use;
  }

  public clone(): PathEffect<U, P> {
    return new PathEffect(this.definition);
  }

  /** Resolves the plain stroke for a line drawn by the compatibility Canvas batch. */
  public getFallbackStroke(stroke: TLineStroke, params: readonly number[]): TLineStroke {
    return this.definition.fallback ? this.definition.fallback(stroke, params) : stroke;
  }
}

/** Internal: the class instance behind a public effect object, with the object's own types. */
export function toPathEffect<U extends TUniformTypes, P>(effect: TSceneEffect<"path", U, P>): PathEffect<U, P> {
  if (!(effect instanceof PathEffect)) {
    throw new Error('[@gravity-ui/graph] Not a path effect: create it with defineSceneEffect({ kind: "path", ... }).');
  }
  return effect as PathEffect<U, P>;
}

const effectIds = new WeakMap<TSceneEffectUse["effect"], number>();
let nextEffectId = 0;

/** Effects with one shader can have independent, mutable uniform signals. */
export function pathEffectId(effect: TSceneEffectUse["effect"]): number {
  let id = effectIds.get(effect);
  if (id === undefined) {
    id = ++nextEffectId;
    effectIds.set(effect, id);
  }
  return id;
}
