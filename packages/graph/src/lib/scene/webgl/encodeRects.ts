import { colorFloats } from "../../../components/canvas/connections/webgl/encode";
import { ALL_LEVELS_MASK } from "../levels";
import type { TScenePrimitive, TSceneSize, TSceneStroke } from "../types";

import { DEPTH_INDICES } from "./depth";
import { USE_BASE_ALPHA } from "./tables";

/** Floats per rect instance. */
export const RECT_FLOATS = 28;

/**
 * The largest sub of a scene with one depth key, the encoders' default. The backend passes the largest sub its keys
 * leave room for (`SceneDepth.maxSub`).
 */
export const MAX_SUB = DEPTH_INDICES - 1;

export type TSlotOf = (part: string | undefined) => number;

/** The members of a typed array that hand out its memory or write it: a view has none of them (`TInstanceView`). */
type TAliasingMembers = "buffer" | "subarray" | "set" | "fill" | "copyWithin" | "reverse" | "sort";

/**
 * Instances read in place from an encoder's reused list (`InstanceList.view`), not copied. Valid only until the list's
 * next `reset()` or append, which the next encode with the same encoder makes: whoever gets one copies it before that
 * (`InstanceRanges.set` does) and keeps nothing of it. It is no `Float32Array` to the type checker (it has neither
 * `buffer`, `subarray` nor writes), so code that keeps arrays cannot keep one by mistake; `slice()` copies, and a copy
 * may be kept.
 */
export type TInstanceView = Readonly<Omit<Float32Array, TAliasingMembers>>;

/**
 * The instances of one encode, split by pass: the opaque ones as a view of the encoder's list (`TInstanceView`), to be
 * copied before the next encode with the same encoder; the translucent ones as a copy of their own, which may be kept
 * (the backend keeps those of camera-aware texts to cut their steps again).
 */
export type TEncodedInstances = { opaque: TInstanceView; translucent: Float32Array };

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
  return color !== undefined && isTranslucentFloats(colorFloats(color));
}

/** Whether the straight rgba floats of a set paint are translucent: the one test `isTranslucentPaint` and the rect encoder share. */
export function isTranslucentFloats(floats: readonly number[]): boolean {
  return floats[3] < 1;
}

const ALIGN = { inside: 0, center: 1, outside: 2 } as const;

const NO_PAINT: readonly number[] = [0, 0, 0, 0];

/**
 * Throws when a primitive's sub lies past `maxSub`, the widest sub-order width the scene's depth keys leave room for:
 * the depth could not order it.
 */
export function checkSub(sub: number, maxSub: number): void {
  if (sub > maxSub) {
    throw new RangeError(
      `A scene element's primitive takes sub-order ${sub}, past ${maxSub}, the last one the depth keys leave room for`
    );
  }
}

/** Writes `(mode, value, min, max)` of a camera-aware size at `offset`. */
export function writeSize(out: Float32Array, offset: number, size: TSceneSize): void {
  if (typeof size === "number") {
    out[offset] = 0;
    out[offset + 1] = size;
    out[offset + 2] = 0;
    out[offset + 3] = NO_LIMIT;
  } else if ("px" in size) {
    out[offset] = 1;
    out[offset + 1] = size.px;
    out[offset + 2] = size.minWorld ?? 0;
    out[offset + 3] = size.maxWorld ?? NO_LIMIT;
  } else {
    out[offset] = 2;
    out[offset + 1] = size.world;
    out[offset + 2] = size.minPx ?? 0;
    out[offset + 3] = size.maxPx ?? NO_LIMIT;
  }
}

/** A scale bound for a shader: an absent or infinite bound becomes `fallback`. */
export function scaleBound(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

/** The instances of an encode that yields none: shared, it has nothing to change. */
const NO_INSTANCES = new Float32Array(0);

/**
 * A growing list of fixed-size instances. The encoders keep one list per kind and pass and reuse it (`reset`), so an
 * encode allocates no list: it hands its instances out as a view (`view`), or as a copy (`toArray`) where they are
 * kept.
 */
export class InstanceList {
  private data: Float32Array;
  private length = 0;

  constructor(private readonly floats: number) {
    this.data = new Float32Array(floats * 16);
  }

  /** Empties the list for the next encode; it keeps its room. */
  public reset(): void {
    this.length = 0;
  }

  /** The next instance to fill, zeroed. */
  public next(): Float32Array {
    const end = this.length + this.floats;
    this.reserve(end);
    const at = this.length;
    this.length = end;
    const instance = this.data.subarray(at, end);
    // A reused list holds the floats of an earlier encode.
    instance.fill(0);
    return instance;
  }

  /** Appends an instance of a list of one float per instance, holding `value`; `next` without a view per instance. */
  public push(value: number): void {
    if (this.floats !== 1) throw new Error("InstanceList.push needs a list of one float per instance");
    this.reserve(this.length + 1);
    this.data[this.length++] = value;
  }

  /**
   * Appends `count` zeroed instances and returns the offset of their first float in `buffer`, which holds them until
   * the next append: `next` without a view per instance.
   */
  public claim(count: number): number {
    const at = this.length;
    const end = at + count * this.floats;
    this.reserve(end);
    this.length = end;
    this.data.fill(0, at, end);
    return at;
  }

  /** The list's floats (more than it holds): valid until the next append. */
  public get buffer(): Float32Array {
    return this.data;
  }

  /** A copy of the instances; the list can be reset and reused afterwards. */
  public toArray(): Float32Array {
    return this.length === 0 ? NO_INSTANCES : this.data.slice(0, this.length);
  }

  /**
   * The instances in place, without a copy (`TInstanceView`). Valid only until the list's next `reset()` or append
   * (`next`, `push`, `claim`): read or copy it before then, and keep nothing of it.
   */
  public view(): TInstanceView {
    return this.length === 0 ? NO_INSTANCES : this.data.subarray(0, this.length);
  }

  /** Room for `end` floats. */
  private reserve(end: number): void {
    if (end <= this.data.length) return;
    const grown = new Float32Array(Math.max(this.data.length * 2, end));
    grown.set(this.data.subarray(0, this.length));
    this.data = grown;
  }
}

/** The lists of one encoder: emptied at the start of each encode (encoders do not call each other). */
export type TInstanceLists = { readonly opaque: InstanceList; readonly translucent: InstanceList };

/** Lists for an encoder of `floats` floats per instance, reused by every encode (`takeLists`). */
export function createInstanceLists(floats: number): TInstanceLists {
  return { opaque: new InstanceList(floats), translucent: new InstanceList(floats) };
}

/** Empties the encoder's lists and hands them to one encode. */
export function takeLists(lists: TInstanceLists): TInstanceLists {
  lists.opaque.reset();
  lists.translucent.reset();
  return lists;
}

const RECT_LISTS = createInstanceLists(RECT_FLOATS);

type TRectPrimitive = Extract<TScenePrimitive, { kind: "rect" | "circle" }>;

/** Writes the four corner radii (top-left, top-right, bottom-right, bottom-left) at `offset`; unset ones are 0. */
function writeRadii(out: Float32Array, offset: number, radius: number | readonly number[] | undefined): void {
  if (typeof radius === "number") {
    out[offset] = radius;
    out[offset + 1] = radius;
    out[offset + 2] = radius;
    out[offset + 3] = radius;
  } else {
    out[offset] = radius?.[0] ?? 0;
    out[offset + 1] = radius?.[1] ?? 0;
    out[offset + 2] = radius?.[2] ?? 0;
    out[offset + 3] = radius?.[3] ?? 0;
  }
}

/** Writes x, y, width, height and the corner radii at 4..11; a circle is the square of its diameter, all round. */
function writeShape(out: Float32Array, primitive: TRectPrimitive): void {
  if (primitive.kind === "rect") {
    out[4] = primitive.x;
    out[5] = primitive.y;
    out[6] = primitive.width;
    out[7] = primitive.height;
    writeRadii(out, 8, primitive.radius);
  } else {
    const { cx, cy, r } = primitive;
    out[4] = cx - r;
    out[5] = cy - r;
    out[6] = 2 * r;
    out[7] = 2 * r;
    writeRadii(out, 8, r);
  }
}

/** Writes the drawn border's width and align (none: width 0) at 20..24, then the scale bounds and the level mask. */
function writeBorderAndBounds(out: Float32Array, drawn: TSceneStroke | undefined, primitive: TRectPrimitive): void {
  writeSize(out, 20, drawn?.width ?? 0);
  out[24] = ALIGN[drawn?.align ?? "center"];
  out[25] = scaleBound(primitive.minScale, 0);
  out[26] = scaleBound(primitive.maxScale, NO_LIMIT);
  out[27] = primitive.levelMask ?? ALL_LEVELS_MASK;
}

/**
 * Whether a stroke is drawn by its width: a stroke whose width is still unset after styling draws nothing, as in the
 * Canvas2D interpreter.
 */
export function hasStrokeWidth(stroke: TSceneStroke | undefined): stroke is TSceneStroke & { width: TSceneSize } {
  return stroke?.width !== undefined;
}

/**
 * Rect and circle primitives as rect instances, split by translucency. `sub` is `subBase` plus the index in the
 * element. An unset fill or border colour is written as `USE_BASE`; a border with an unset width is no border. The
 * opaque instances are a view of the encoder's list, valid until the next `encodeRects` (`TEncodedInstances`).
 *
 * @param subBase The depth sub-order of the first primitive: a child element's primitives follow its parent's and its
 * earlier siblings'.
 * @param maxSub The largest sub the depth keys leave room for (`checkSub`).
 */
export function encodeRects(
  primitives: readonly TScenePrimitive[],
  elementIndex: number,
  slotOf: TSlotOf,
  subBase = 0,
  maxSub = MAX_SUB
): TEncodedInstances {
  const { opaque, translucent } = takeLists(RECT_LISTS);
  for (let sub = 0; sub < primitives.length; sub++) {
    const primitive = primitives[sub];
    if (primitive.kind !== "rect" && primitive.kind !== "circle") continue;
    const at = subBase + sub;
    checkSub(at, maxSub);
    // An empty fill is no fill, as in the Canvas2D interpreter; without a border the band is empty. Neither takes the
    // base colour.
    const fillColor = primitive.fill;
    const fill = fillColor === "" ? NO_PAINT : paintFloats(fillColor);
    const drawn = hasStrokeWidth(primitive.border) ? primitive.border : undefined;
    const border = drawn ? paintFloats(drawn.color) : NO_PAINT;
    const isBorderPart = primitive.part === "border";
    // `isTranslucentPaint` of the fill (an empty one is none) and of the border, from the floats parsed above.
    const isTranslucent =
      (fillColor !== undefined && fillColor !== "" && isTranslucentFloats(fill)) ||
      (drawn?.color !== undefined && isTranslucentFloats(border));
    const out = (isTranslucent ? translucent : opaque).next();
    out[0] = elementIndex;
    out[1] = at;
    out[2] = isBorderPart ? 0 : slotOf(primitive.part);
    out[3] = isBorderPart ? slotOf("border") : 0;
    writeShape(out, primitive);
    out.set(fill, 12);
    out.set(border, 16);
    writeBorderAndBounds(out, drawn, primitive);
  }
  return { opaque: opaque.view(), translucent: translucent.toArray() };
}
