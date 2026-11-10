import { colorFloats } from "../../../components/canvas/connections/webgl/encode";
import type { TScenePrimitive, TSceneSize, TSceneStroke } from "../types";

/** Floats per rect instance. */
export const RECT_FLOATS = 28;

/** The depth key reserves 5 bits of sub-order per element. */
export const MAX_SUB = 31;

export type TSlotOf = (part: string | undefined) => number;

export type TEncodedInstances = { opaque: Float32Array; translucent: Float32Array };

/** A scale bound that is never reached. */
export const NO_LIMIT = 1e9;

const ALIGN = { inside: 0, center: 1, outside: 2 } as const;

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

/** Rect and circle primitives as rect instances, split by translucency. `sub` is the index in the element. */
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
    const fill = rect.fill ? colorFloats(rect.fill) : [0, 0, 0, 0];
    const border = rect.border ? colorFloats(rect.border.color) : [0, 0, 0, 0];
    const isBorderPart = primitive.part === "border";
    // Absent paint has alpha 0 and does not make the instance translucent.
    const isTranslucent = (rect.fill && fill[3] < 1) || (rect.border && border[3] < 1);
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
    writeSize(out, 20, rect.border ? rect.border.width : 0);
    out[24] = ALIGN[rect.border?.align ?? "center"];
    out[25] = scaleBound(primitive.minScale, 0);
    out[26] = scaleBound(primitive.maxScale, NO_LIMIT);
  });
  return { opaque: opaque.toArray(), translucent: translucent.toArray() };
}
