import { colorFloats } from "../../../components/canvas/connections/webgl/encode";
import type { TScenePrimitive, TSceneSize, TSceneStroke } from "../types";

import { USE_BASE_ALPHA } from "./tables";

/** Floats per rect instance. */
export const RECT_FLOATS = 28;

/** The depth key reserves 5 bits of sub-order per element. */
export const MAX_SUB = 31;

export type TSlotOf = (part: string | undefined) => number;

export type TEncodedInstances = { opaque: Float32Array; translucent: Float32Array };

/** A scale bound that is never reached. */
export const NO_LIMIT = 1e9;

/** The instance colour of a paint that the primitive leaves unset: the shader paints the part's base colour. */
export const USE_BASE: readonly [number, number, number, number] = [0, 0, 0, USE_BASE_ALPHA];

/** Straight rgba of a paint: its own colour, or `USE_BASE` when it is unset. */
export function paintFloats(color: string | undefined): readonly number[] {
  return color === undefined ? USE_BASE : colorFloats(color);
}

/** Whether a paint goes to the translucent pass: only its own colour decides; an unset paint stays opaque. */
export function isTranslucentPaint(color: string | undefined): boolean {
  return color !== undefined && colorFloats(color)[3] < 1;
}

const ALIGN = { inside: 0, center: 1, outside: 2 } as const;

const NO_PAINT: readonly number[] = [0, 0, 0, 0];

export function checkSub(sub: number): void {
  if (sub > MAX_SUB) throw new RangeError(`A scene element has at most ${MAX_SUB + 1} primitives, got index ${sub}`);
}

/** Writes `(mode, value, min, max)` of a camera-aware size at `offset`. */
export function writeSize(out: Float32Array, offset: number, size: TSceneSize): void {
  if (typeof size === "number") {
    out.set([0, size, 0, NO_LIMIT], offset);
  } else if ("px" in size) {
    out.set([1, size.px, size.minWorld ?? 0, size.maxWorld ?? NO_LIMIT], offset);
  } else {
    out.set([2, size.world, size.minPx ?? 0, size.maxPx ?? NO_LIMIT], offset);
  }
}

/** A scale bound for a shader: an absent or infinite bound becomes `fallback`. */
export function scaleBound(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

/** A growing list of fixed-size instances. */
export class InstanceList {
  private data: Float32Array;
  private length = 0;

  constructor(private readonly floats: number) {
    this.data = new Float32Array(floats * 16);
  }

  /** The next instance to fill, zeroed. */
  public next(): Float32Array {
    const end = this.length + this.floats;
    if (end > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const at = this.length;
    this.length = end;
    return this.data.subarray(at, end);
  }

  public toArray(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

type TRectShape = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: readonly [number, number, number, number];
  fill?: string;
  border?: TSceneStroke;
};

function radii(radius: number | readonly number[] | undefined): readonly [number, number, number, number] {
  if (radius === undefined) return [0, 0, 0, 0];
  if (typeof radius === "number") return [radius, radius, radius, radius];
  return [radius[0] ?? 0, radius[1] ?? 0, radius[2] ?? 0, radius[3] ?? 0];
}

function rectShape(primitive: TScenePrimitive): TRectShape | undefined {
  if (primitive.kind === "rect") return { ...primitive, radius: radii(primitive.radius) };
  if (primitive.kind === "circle") {
    const { cx, cy, r } = primitive;
    const radius: readonly [number, number, number, number] = [r, r, r, r];
    return {
      x: cx - r,
      y: cy - r,
      width: 2 * r,
      height: 2 * r,
      radius,
      fill: primitive.fill,
      border: primitive.border,
    };
  }
  return undefined;
}

/**
 * Whether a stroke is drawn by its width: a stroke whose width is still unset after styling draws nothing, as in the
 * Canvas2D interpreter.
 */
export function hasStrokeWidth(stroke: TSceneStroke | undefined): stroke is TSceneStroke & { width: TSceneSize } {
  return stroke?.width !== undefined;
}

/**
 * Rect and circle primitives as rect instances, split by translucency. `sub` is the index in the element. An unset fill
 * or border colour is written as `USE_BASE`; a border with an unset width is no border.
 */
export function encodeRects(
  primitives: readonly TScenePrimitive[],
  elementIndex: number,
  slotOf: TSlotOf
): TEncodedInstances {
  const opaque = new InstanceList(RECT_FLOATS);
  const translucent = new InstanceList(RECT_FLOATS);
  primitives.forEach((primitive, sub) => {
    const rect = rectShape(primitive);
    if (!rect) return;
    checkSub(sub);
    // An empty fill is no fill, as in the Canvas2D interpreter; without a border the band is empty. Neither takes the
    // base colour.
    const fill = rect.fill === "" ? NO_PAINT : paintFloats(rect.fill);
    const drawn = hasStrokeWidth(rect.border) ? rect.border : undefined;
    const border = drawn ? paintFloats(drawn.color) : NO_PAINT;
    const isBorderPart = primitive.part === "border";
    const isTranslucent = isTranslucentPaint(rect.fill || undefined) || isTranslucentPaint(drawn?.color);
    const out = (isTranslucent ? translucent : opaque).next();
    out[0] = elementIndex;
    out[1] = sub;
    out[2] = isBorderPart ? 0 : slotOf(primitive.part);
    out[3] = isBorderPart ? slotOf("border") : 0;
    out[4] = rect.x;
    out[5] = rect.y;
    out[6] = rect.width;
    out[7] = rect.height;
    out.set(rect.radius, 8);
    out.set(fill, 12);
    out.set(border, 16);
    writeSize(out, 20, drawn ? drawn.width : 0);
    out[24] = ALIGN[drawn?.align ?? "center"];
    out[25] = scaleBound(primitive.minScale, 0);
    out[26] = scaleBound(primitive.maxScale, NO_LIMIT);
  });
  return { opaque: opaque.toArray(), translucent: translucent.toArray() };
}
