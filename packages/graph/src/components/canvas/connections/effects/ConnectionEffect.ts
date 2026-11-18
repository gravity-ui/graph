import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";

import { isDevelopmentBuild } from "../../../../lib/detachedWarning";
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

/** Numbers of parameters per connection that reach the shader. */
export const MAX_EFFECT_PARAMS = 8;

/** Effect objects with one fragment text alive at once past which a warning is reported. */
const MAX_OBJECTS_PER_FRAGMENT = 64;

const UNIFORM_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** The part of `FinalizationRegistry` used here: an ES2021 global, past the package's ES2020 lib. */
interface IFinalizationRegistry<T> {
  register(target: object, held: T): void;
}

type TFinalizationRegistryConstructor = new <T>(cleanup: (held: T) => void) => IFinalizationRegistry<T>;

/** Effect objects alive per fragment text. */
const objectsPerFragment = new Map<string, number>();

const warnedFragments = new Set<string>();

/** An object leaves the count of its fragment when it is collected. */
function releaseObject(fragment: string): void {
  const count = (objectsPerFragment.get(fragment) ?? 0) - 1;
  if (count > 0) objectsPerFragment.set(fragment, count);
  else objectsPerFragment.delete(fragment);
}

/** Without FinalizationRegistry, objects are never counted down. */
const collectedObjects = ((): IFinalizationRegistry<string> | undefined => {
  const Registry = (globalThis as { FinalizationRegistry?: TFinalizationRegistryConstructor }).FinalizationRegistry;
  return typeof Registry === "function" ? new Registry<string>(releaseObject) : undefined;
})();

/**
 * Counts the effect objects of a fragment alive at once, so an app that remounts graphs and clones an effect per
 * graph is not reported: many alive at once mean effects created per connection.
 */
function countObject(effect: object, fragment: string): void {
  collectedObjects?.register(effect, fragment);
  const count = (objectsPerFragment.get(fragment) ?? 0) + 1;
  objectsPerFragment.set(fragment, count);
  if (count > MAX_OBJECTS_PER_FRAGMENT && !warnedFragments.has(fragment) && isDevelopmentBuild()) {
    warnedFragments.add(fragment);
    console.warn(
      `[@gravity-ui/graph] More than ${MAX_OBJECTS_PER_FRAGMENT} connection effect objects with one fragment are ` +
        "alive. defineConnectionEffect() or clone() is called per connection (inside getStroke()?): " +
        "define the effect once and pass per-connection values through use(params)."
    );
  }
}

/** Validates both `use()` options and effect uses supplied as literals. */
export function validateConnectionEffectScaleRange({ minScale, maxScale }: TConnectionEffectScaleRange): void {
  if (minScale !== undefined && (!Number.isFinite(minScale) || minScale < 0)) {
    throw new Error("[@gravity-ui/graph] Effect minScale must be finite and nonnegative.");
  }
  if (maxScale !== undefined && (!Number.isFinite(maxScale) || maxScale <= (minScale ?? 0))) {
    throw new Error("[@gravity-ui/graph] Effect maxScale must be finite and greater than minScale.");
  }
}

/** The activity predicate shared by the renderers, in camera scale units. */
export function isConnectionEffectActive(range: TConnectionEffectScaleRange, scale: number): boolean {
  return scale >= (range.minScale ?? 0) && scale < (range.maxScale ?? Infinity);
}

/** Internal: the class behind every effect object. */
export class ConnectionEffect<U extends TUniformTypes = TUniformTypes, P = readonly number[]>
  implements TConnectionEffect<U, P>
{
  public readonly fragment: string;

  public readonly animated: boolean;

  public readonly extraWidth: number;

  public readonly uniformTypes: Readonly<Record<string, TUniformType>>;

  /** The GLSL declarations of the uniforms: a `uniform <type> u_<name>;` line per uniform, sorted by name. */
  public readonly uniformDeclarations: string;

  /** Programs are cached by this key: the uniform declarations plus the fragment. Clones share it. */
  public readonly programKey: string;

  public readonly uniforms: { [K in keyof U]: Signal<TUniformValue<U[K]>> };

  private paramsWarned = false;

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
    countObject(this, fragment);
  }

  public use(input: P, scaleRange?: TConnectionEffectScaleRange): TConnectionEffectUse {
    if (scaleRange) validateConnectionEffectScaleRange(scaleRange);
    let params = this.definition.encode ? this.definition.encode(input) : (input as unknown as readonly number[]);
    if (params.length > MAX_EFFECT_PARAMS) {
      if (!this.paramsWarned && isDevelopmentBuild()) {
        this.paramsWarned = true;
        console.warn(
          `[@gravity-ui/graph] A connection effect got ${params.length} parameters; only the first ` +
            `${MAX_EFFECT_PARAMS} reach the shader.`
        );
      }
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

export function defineConnectionEffect<U extends TUniformTypes = Record<never, TUniformType>, P = readonly number[]>(
  definition: TConnectionEffectDefinition<U, P>
): TConnectionEffect<U, P> {
  return new ConnectionEffect(definition);
}

/** Internal: the class instance behind a public effect object, with the object's own types. */
export function toConnectionEffect<U extends TUniformTypes, P>(
  effect: TConnectionEffect<U, P>
): ConnectionEffect<U, P> {
  if (!(effect instanceof ConnectionEffect)) {
    throw new Error("[@gravity-ui/graph] Not a connection effect: create it with defineConnectionEffect().");
  }
  return effect as ConnectionEffect<U, P>;
}
