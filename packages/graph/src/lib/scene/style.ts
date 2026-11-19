import { ConnectionEffect } from "../../components/canvas/connections/effects/ConnectionEffect";
import type { TConnectionEffectUse } from "../../components/canvas/connections/effects/types";

import type { TScenePartStyle, TScenePrimitive, TSceneStroke, TSceneStyle } from "./types";
import { fadeColor, mixColor, parseColorAlpha } from "./utils/colorAlpha";

type TPaintSlot = "border" | "fill" | "color" | "stroke";

/** Which paint a part's colour addresses. */
function paintSlot(primitive: Exclude<TScenePrimitive, { kind: "sprite" }>): TPaintSlot {
  if (primitive.part === "border" && (primitive.kind === "rect" || primitive.kind === "circle")) return "border";
  switch (primitive.kind) {
    case "rect":
    case "circle":
    case "polygon":
      return "fill";
    case "text":
    case "icon":
      return "color";
    case "path":
      return "stroke";
  }
}

function strokeOf(primitive: TScenePrimitive, slot: TPaintSlot): TSceneStroke | undefined {
  if (slot === "border" && (primitive.kind === "rect" || primitive.kind === "circle")) return primitive.border;
  if (slot === "stroke" && primitive.kind === "path") return primitive.stroke;
  return undefined;
}

function currentColor(primitive: TScenePrimitive, slot: TPaintSlot): string | undefined {
  if (slot === "fill" && "fill" in primitive) return primitive.fill;
  if (slot === "color" && (primitive.kind === "text" || primitive.kind === "icon")) return primitive.color;
  return strokeOf(primitive, slot)?.color;
}

function withColor(primitive: TScenePrimitive, slot: TPaintSlot, color: string): TScenePrimitive {
  switch (slot) {
    case "fill":
      return { ...primitive, fill: color } as TScenePrimitive;
    case "color":
      return { ...primitive, color } as TScenePrimitive;
    case "border":
      return "border" in primitive && primitive.border
        ? ({ ...primitive, border: { ...primitive.border, color } } as TScenePrimitive)
        : primitive;
    case "stroke":
      return primitive.kind === "path" ? { ...primitive, stroke: { ...primitive.stroke, color } } : primitive;
  }
}

/** Sets the width of the primitive's stroke or border; with `onlyUnset`, only a width the primitive leaves unset. */
function withWidth(primitive: TScenePrimitive, width: TScenePartStyle["width"], onlyUnset: boolean): TScenePrimitive {
  if (width === undefined) return primitive;
  switch (primitive.kind) {
    case "path":
      if (onlyUnset && primitive.stroke.width !== undefined) return primitive;
      return { ...primitive, stroke: { ...primitive.stroke, width } };
    case "polygon":
      if (!primitive.stroke || (onlyUnset && primitive.stroke.width !== undefined)) return primitive;
      return { ...primitive, stroke: { ...primitive.stroke, width } };
    case "rect":
    case "circle":
      if (!primitive.border || (onlyUnset && primitive.border.width !== undefined)) return primitive;
      return { ...primitive, border: { ...primitive.border, width } };
    default:
      return primitive;
  }
}

function withScale(primitive: TScenePrimitive, scale: number | undefined): TScenePrimitive {
  return scale !== undefined && primitive.kind === "circle" ? { ...primitive, r: primitive.r * scale } : primitive;
}

/**
 * A text with its part's `cameraAware` mode (the override's, else the base's): `false` turns it off, `true` turns it on
 * and keeps the primitive's own clamps. A style turns a text on only within a box: a heightless text that does not
 * declare `cameraAware` itself keeps its world size (`ignoresCameraAware`), since its element's bounds cover its lines
 * at that size only. Other primitives, and texts the style says nothing about, stay as they are.
 */
function withCameraAware(primitive: TScenePrimitive, mode: boolean | undefined): TScenePrimitive {
  if (mode === undefined || primitive.kind !== "text") return primitive;
  if (!mode) return primitive.cameraAware ? { ...primitive, cameraAware: false } : primitive;
  if (primitive.cameraAware || primitive.height === undefined) return primitive;
  return { ...primitive, cameraAware: true };
}

/** A style's `cameraAware` for a part: the override's, else the base's. */
export function styleCameraAware(style: TSceneStyle | undefined, part: string | undefined): boolean | undefined {
  if (!style || part === undefined) return undefined;
  return style.parts?.[part]?.cameraAware ?? style.base?.[part]?.cameraAware;
}

/**
 * Whether a style's `cameraAware: true` is not applied to a primitive: a heightless text that does not declare
 * `cameraAware` itself (give the text a `height`, or declare `cameraAware` on the primitive).
 */
export function ignoresCameraAware(primitive: TScenePrimitive, style: TSceneStyle | undefined): boolean {
  return (
    primitive.kind === "text" &&
    primitive.height === undefined &&
    !primitive.cameraAware &&
    styleCameraAware(style, primitive.part) === true
  );
}

/** A dim in [0, 1]: an unset value or NaN is 0. */
function clampDim(value: number | undefined): number {
  return value !== undefined && value > 0 ? Math.min(1, value) : 0;
}

/**
 * The effective dim of a part in [0, 1]: the override's `dim`, else the base's, else the element's (`style.dim`), else
 * 0. A primitive without a part takes the element's.
 */
export function styleDim(style: TSceneStyle | undefined, part: string | undefined): number {
  if (!style) return 0;
  const own = part === undefined ? undefined : style.parts?.[part]?.dim ?? style.base?.[part]?.dim;
  return clampDim(own ?? style.dim);
}

/** An opacity in [0, 1]: an unset value or NaN is 1. */
function clampOpacity(value: number | undefined): number {
  return value !== undefined && value < 1 ? Math.max(0, value) : 1;
}

/**
 * The effective opacity of a part in [0, 1]: the element's `opacity` times the part's own (the override's, else the
 * base's), each clamped and 1 when unset. A primitive without a part takes the element's.
 */
export function styleOpacity(style: TSceneStyle | undefined, part: string | undefined): number {
  if (!style) return 1;
  const own = part === undefined ? undefined : style.parts?.[part]?.opacity ?? style.base?.[part]?.opacity;
  return clampOpacity(style.opacity) * clampOpacity(own);
}

/** The primitive with `map` applied to every paint it sets; an unset paint stays unset. */
function mapPaints(primitive: TScenePrimitive, map: (color: string) => string): TScenePrimitive {
  const paint = (color: string | undefined): string | undefined => (color === undefined ? undefined : map(color));
  const stroke = (value: TSceneStroke): TSceneStroke =>
    value.color === undefined ? value : { ...value, color: map(value.color) };
  switch (primitive.kind) {
    case "sprite":
      return primitive;
    case "rect":
    case "circle":
      return { ...primitive, fill: paint(primitive.fill), border: primitive.border && stroke(primitive.border) };
    case "polygon":
      return { ...primitive, fill: paint(primitive.fill), stroke: primitive.stroke && stroke(primitive.stroke) };
    case "path":
      return { ...primitive, stroke: stroke(primitive.stroke) };
    default:
      // Text and icons.
      return { ...primitive, color: paint(primitive.color) };
  }
}

/** Every paint of the primitive moved towards the dim colour; alpha is kept. */
function withDim(primitive: TScenePrimitive, dim: number, dimColor: string): TScenePrimitive {
  return dim === 0 ? primitive : mapPaints(primitive, (color) => mixColor(color, dimColor, dim));
}

/** Every paint of the primitive with its alpha multiplied by the opacity; the rgb is kept. */
function withOpacity(primitive: TScenePrimitive, opacity: number): TScenePrimitive {
  return opacity >= 1 ? primitive : mapPaints(primitive, (color) => fadeColor(color, opacity));
}

/**
 * The primitive with its part's base and override values; undefined when the part is hidden. Per property:
 * - `visible`, `scale` and `cameraAware`: the override's value, else the base's (`cameraAware` over the primitive's
 *   own mode; `true` keeps the primitive's clamps and does not apply to a heightless text, `ignoresCameraAware`);
 * - `color` and `width`: the base fills a value the primitive leaves unset, then the override replaces it;
 * - `opacity` (`styleOpacity`): the alpha of every paint of the primitive is then multiplied by it (`fadeColor`);
 * - `dim` (`styleDim`): with a `dimColor`, every paint of the primitive is then moved towards it (`mixColor`, alpha
 *   kept); without one, `dim` changes nothing.
 */
export function applyStyle(
  primitive: TScenePrimitive,
  style: TSceneStyle | undefined,
  dimColor?: string
): TScenePrimitive | undefined {
  if (!style) return primitive;
  const part = primitive.part;
  const base = part === undefined ? undefined : style.base?.[part];
  const override = part === undefined ? undefined : style.parts?.[part];
  if ((override?.visible ?? base?.visible) === false) return undefined;
  const styled = base || override ? withPartValues(primitive, base, override) : primitive;
  const faded = withOpacity(styled, styleOpacity(style, part));
  return dimColor === undefined ? faded : withDim(faded, styleDim(style, part), dimColor);
}

/** Colours, widths, the circle scale and the text mode of a part's base and override values, in cascade order. */
function withPartValues(
  primitive: TScenePrimitive,
  base: Readonly<TScenePartStyle> | undefined,
  override: Readonly<TScenePartStyle> | undefined
): TScenePrimitive {
  if (primitive.kind === "sprite") return primitive;
  const slot = paintSlot(primitive);
  let result: TScenePrimitive = primitive;
  if (base?.color !== undefined && currentColor(result, slot) === undefined) {
    result = withColor(result, slot, base.color);
  }
  result = withWidth(result, base?.width, true);
  if (override?.color !== undefined) result = withColor(result, slot, override.color);
  result = withWidth(result, override?.width, false);
  result = withCameraAware(result, override?.cameraAware ?? base?.cameraAware);
  return withScale(result, override?.scale ?? base?.scale);
}

function translucent(color: string | undefined): boolean {
  return color !== undefined && parseColorAlpha(color) < 1;
}

/**
 * Element properties of a row: what an encoder has to bake. Widths, circle scales, text modes (`cameraAware`),
 * translucent colours and every opacity below 1: the element's and each part's effective one. Under an opacity below 1
 * every colour of the part is baked, opaque ones too, so their changes re-encode as well. `visible` and `dim` are table
 * properties and not part of it; an opacity of 1 or none changes nothing. Rows are immutable, so the key is cached per
 * row object.
 */
const encodeKeys = new WeakMap<object, string>();

const effectIds = new WeakMap<TConnectionEffectUse["effect"], number>();
let nextEffectId = 0;

/** Effects with one shader can have independent, mutable uniform signals. */
export function connectionEffectId(effect: TConnectionEffectUse["effect"]): number {
  let id = effectIds.get(effect);
  if (id === undefined) {
    id = ++nextEffectId;
    effectIds.set(effect, id);
  }
  return id;
}

export function styleEncodeKey(style: TSceneStyle | undefined): string {
  if (!style) return "";
  const cached = encodeKeys.get(style);
  if (cached !== undefined) return cached;
  const key: Record<string, unknown> = {};
  const elementOpacity = styleOpacity(style, undefined);
  if (elementOpacity < 1) key.opacity = elementOpacity;
  for (const layer of ["base", "parts"] as const) {
    for (const [part, value] of Object.entries(style[layer] ?? {})) {
      const opacity = styleOpacity(style, part);
      if (value.width !== undefined) key[`${layer}.${part}.width`] = value.width;
      if (value.scale !== undefined) key[`${layer}.${part}.scale`] = value.scale;
      if (value.cameraAware !== undefined) key[`${layer}.${part}.cameraAware`] = value.cameraAware;
      if (value.effect !== undefined) key[`${layer}.${part}.effect`] = canonicalJson(value.effect);
      if (value.color !== undefined && (opacity < 1 || translucent(value.color))) {
        key[`${layer}.${part}.color`] = value.color;
      }
      if (opacity < 1) key[`opacity.${part}`] = opacity;
    }
  }
  const encoded = JSON.stringify(key);
  encodeKeys.set(style, encoded);
  return encoded;
}

const geometryKeys = new WeakMap<object, string>();

/**
 * The geometry a row changes when baked (`bakeElementStyle`): each part's circle `scale` and stroke `width`, as a
 * string; "" when it changes none. Two rows with one key bake the same bounds. Rows are immutable, so the key is
 * cached per row object.
 */
export function styleGeometryKey(style: TSceneStyle | undefined): string {
  if (!style) return "";
  const cached = geometryKeys.get(style);
  if (cached !== undefined) return cached;
  const entries: string[] = [];
  for (const [layer, values] of [
    ["base", style.base],
    ["parts", style.parts],
  ] as const) {
    if (!values) continue;
    for (const part of Object.keys(values).sort()) {
      const value = values[part];
      if (!value || (value.scale === undefined && value.width === undefined)) continue;
      entries.push(`${layer}:${part}:${value.scale ?? ""}:${JSON.stringify(value.width ?? null)}`);
    }
  }
  const key = entries.join("|");
  geometryKeys.set(style, key);
  return key;
}

const lookKeys = new WeakMap<object, string>();

/**
 * A value as JSON with the keys of every object sorted, and undefined values and empty objects left out: rows that
 * differ only in property or part order, or in an empty `parts` or part value, give one string.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (value instanceof ConnectionEffect) return String(connectionEffectId(value));
  const record = value as Record<string, unknown>;
  const entries: string[] = [];
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue;
    const json = canonicalJson(record[key]);
    if (json !== "{}") entries.push(`${JSON.stringify(key)}:${json}`);
  }
  return `{${entries.join(",")}}`;
}

/**
 * A row's content as a key: two rows with one key draw the same (no row and the empty row included), whatever the
 * order of their properties and parts. Rows are immutable, so the key is cached per row object.
 */
export function styleLookKey(style: TSceneStyle | undefined): string {
  if (!style) return "{}";
  const cached = lookKeys.get(style);
  if (cached !== undefined) return cached;
  const key = canonicalJson(style);
  lookKeys.set(style, key);
  return key;
}

export function styleRaise(style: TSceneStyle | undefined): number {
  return style?.raise ?? 0;
}

/** Whether a parent's row changes how its children draw: it sets an element dim or an element opacity below 1. */
export function inheritsElementStyle(style: TSceneStyle | undefined): boolean {
  return style?.dim !== undefined || (style?.opacity !== undefined && style.opacity < 1);
}

/**
 * The drawn row of a child element (spec §5.2): its own row, with the parent's element `dim` where it sets none and
 * its element `opacity` multiplied by the parent's, each clamped to [0, 1] first as the renderers clamp them. `raise`
 * is dropped: a child draws in its parent's bucket.
 */
export function composeChildStyle(own: TSceneStyle | undefined, parent: TSceneStyle | undefined): TSceneStyle {
  const opacity = clampOpacity(own?.opacity) * clampOpacity(parent?.opacity);
  return Object.freeze({
    ...own,
    raise: undefined,
    dim: own?.dim ?? parent?.dim,
    opacity: opacity < 1 ? opacity : undefined,
  });
}

/**
 * The primitives with the row's element properties applied (widths, circle scale, text modes, translucent colours,
 * opacity), for the WebGL encoder, with the same cascade as `applyStyle`. A primitive with an effective opacity below 1
 * gets all its colours baked (the base colour fills an unset paint, the override replaces it) and every paint faded;
 * the style table leaves the overrides of such parts out (`StyleTable`), so the shader keeps the baked colour. Table
 * properties (opaque colours of other primitives, visibility, dim) stay for the shader, which also dims the baked
 * colours. Returns the same array when nothing has to be baked.
 */
export function bakeElementStyle(
  primitives: readonly TScenePrimitive[],
  style: TSceneStyle | undefined
): readonly TScenePrimitive[] {
  if (!style) return primitives;
  const key = styleEncodeKey(style);
  if (key === "{}" || key === "") return primitives;
  return primitives.map((primitive) => {
    const part = primitive.part;
    const opacity = styleOpacity(style, part);
    const base = part === undefined ? undefined : style.base?.[part];
    const override = part === undefined ? undefined : style.parts?.[part];
    const effected = withPathEffect(primitive, base?.effect, override?.effect);
    if (opacity < 1) {
      const styled = base || override ? withPartValues(effected, base, override) : effected;
      return withOpacity(styled, opacity);
    }
    return base || override ? withElementValues(effected, base, override) : effected;
  });
}

function withPathEffect(
  primitive: TScenePrimitive,
  base: TScenePartStyle["effect"],
  override: TScenePartStyle["effect"]
): TScenePrimitive {
  if (primitive.kind !== "path") return primitive;
  const effect = (override === undefined ? primitive.effect ?? base : override) ?? undefined;
  return effect === primitive.effect ? primitive : { ...primitive, effect };
}

/**
 * The element properties of a part's base and override values: widths, the circle scale, the text mode, translucent
 * colours.
 */
function withElementValues(
  primitive: TScenePrimitive,
  base: Readonly<TScenePartStyle> | undefined,
  override: Readonly<TScenePartStyle> | undefined
): TScenePrimitive {
  if (primitive.kind === "sprite") return primitive;
  const slot = paintSlot(primitive);
  let result = withWidth(primitive, base?.width, true);
  result = withWidth(result, override?.width, false);
  result = withScale(result, override?.scale ?? base?.scale);
  result = withCameraAware(result, override?.cameraAware ?? base?.cameraAware);
  if (base?.color !== undefined && translucent(base.color) && currentColor(result, slot) === undefined) {
    result = withColor(result, slot, base.color);
  }
  if (override?.color !== undefined && translucent(override.color)) result = withColor(result, slot, override.color);
  return result;
}
