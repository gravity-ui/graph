import { parseColorAlpha } from "../../lib/scene/colorAlpha";
import { isPrimitiveVisible } from "../../lib/scene/drawPrimitives";
import { isOnLevel } from "../../lib/scene/levels";
import { resolveSceneSize } from "../../lib/scene/size";
import { applyStyle } from "../../lib/scene/style";
import type { TSceneElement, TScenePrimitive, TSceneSize, TSceneStroke, TSceneStyle } from "../../lib/scene/types";
import type { TRect } from "../../utils/types/shapes";

import type { TSceneLevel } from "./types";

type TCircle = { x: number; y: number; r: number };
type TFace = Extract<TScenePrimitive, { kind: "rect" | "circle" }>;

type TOutlineFace = TRect & { radius?: number | readonly number[] };

export type TBlockOutlineShape = TOutlineFace & {
  circles: TCircle[];
  /** A numeric zoom within this LOD can change the shape. */
  scaleDependent: boolean;
};

function paints(color: string | undefined): boolean {
  return Boolean(color && color.trim().toLowerCase() !== "transparent" && parseColorAlpha(color) > 0);
}

function widthVaries(size: TSceneSize): boolean {
  if (typeof size === "number") return false;
  if ("px" in size) return size.px > 0 && (size.minWorld ?? 0) < (size.maxWorld ?? Infinity);
  return (size.minPx ?? 0) > 0 || (size.world > 0 && Number.isFinite(size.maxPx));
}

const OUTSIDE_FRACTION = { inside: 0, center: 0.5, outside: 1 } as const;
const NO_BORDER = { width: 0, outset: 0, varies: false };

function paintedBorder(stroke: TSceneStroke | undefined, scale: number) {
  if (stroke?.width === undefined || !paints(stroke.color)) return NO_BORDER;
  const width = Math.max(0, resolveSceneSize(stroke.width, scale));
  const outset = width * OUTSIDE_FRACTION[stroke.align ?? "center"];
  return { width, outset, varies: outset > 0 && widthVaries(stroke.width) };
}

function encloses(outer: TRect, inner: TRect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

function outerRadius(radius: TOutlineFace["radius"], pad: number): TOutlineFace["radius"] {
  if (!radius || !pad) return radius;
  const outward = (r: number) => (r > 0 ? r + pad : 0);
  return typeof radius === "number" ? outward(radius) : radius.map(outward);
}

/** Coalesces a dot and its ring, preserving custom circles with different centres. */
function addCircle(circles: TCircle[], first: number, x: number, y: number, r: number): void {
  for (let i = first; i < circles.length; i++) {
    if (circles[i].x === x && circles[i].y === y) {
      circles[i].r = Math.max(circles[i].r, r);
      return;
    }
  }
  circles.push({ x, y, r });
}

/** Rectangle of the block face and the painted circular extents of its anchors in that rectangle's coordinates. */
export function blockOutlineShape(
  block: TSceneElement,
  anchors: readonly TSceneElement[],
  level: TSceneLevel,
  scale: number,
  styleOf: (element: TSceneElement) => TSceneStyle | undefined
): TBlockOutlineShape | undefined {
  let scaleDependent = false;

  /** For a rect, returns the reach beyond its edges. For a circle, returns its outer radius. */
  function extent(primitive: TFace, style: TSceneStyle | undefined): number | undefined {
    if (!isOnLevel(primitive.levelMask, level)) return undefined;
    const face = applyStyle(primitive, style);
    if (face?.kind !== "rect" && face?.kind !== "circle") return undefined;
    const { border, minScale = 0, maxScale = Infinity } = face;
    const { width, outset, varies } = paintedBorder(border, scale);
    if ((!paints(face.fill) && !(width > 0)) || Math.max(minScale, 0) >= maxScale) return undefined;
    if (minScale > 0 || Number.isFinite(maxScale) || varies) scaleDependent = true;
    if (!isPrimitiveVisible(face, scale)) return undefined;
    return (face.kind === "circle" ? face.r : 0) + outset;
  }

  let body: TOutlineFace | undefined;
  let border: TOutlineFace | undefined;
  const blockStyle = styleOf(block);
  for (const primitive of block.primitives) {
    if (primitive.kind !== "rect" || (primitive.part !== "body" && primitive.part !== "border")) continue;
    const pad = extent(primitive, blockStyle);
    if (pad === undefined || !(primitive.width > 0 && primitive.height > 0)) continue;
    const rect: TOutlineFace = {
      x: primitive.x - pad,
      y: primitive.y - pad,
      width: primitive.width + 2 * pad,
      height: primitive.height + 2 * pad,
    };
    rect.radius = outerRadius(primitive.radius, pad);
    if (primitive.part === "body") body ??= rect;
    else border ??= rect;
  }
  // A stock border is a separate rect with the same edges as the body. Include its outside paint when it encloses the face.
  if (border && (!body || encloses(border, body))) body = border;
  if (!body) return undefined;

  const circles: TCircle[] = [];
  for (const anchor of anchors) {
    const anchorStyle = styleOf(anchor);
    const dx = anchor.x - block.x - body.x;
    const dy = anchor.y - block.y - body.y;
    const first = circles.length;
    for (const primitive of anchor.primitives) {
      if (primitive.kind !== "circle") continue;
      const r = extent(primitive, anchorStyle);
      if (r === undefined || !(r > 0)) continue;
      addCircle(circles, first, dx + primitive.cx, dy + primitive.cy, r);
    }
  }
  return { ...body, circles, scaleDependent };
}
