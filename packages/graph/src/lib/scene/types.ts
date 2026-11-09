import type { TTileRect } from "../culling/TileIndex";

/** Stroke of a scene primitive; lengths in world units. */
export type TSceneStroke = {
  color: string;
  width: number;
  /** Where the stroke of a closed shape lies relative to its edge. Default: "center". */
  align?: "inside" | "center" | "outside";
  dash?: readonly number[];
};

/** A size in world units, or a screen size: world size = clamp(px / scale, minWorld, maxWorld). */
export type TSceneTextSize = number | { px: number; minWorld?: number; maxWorld?: number };

/** Shown while minScale <= camera scale < maxScale; either bound may be absent. */
export type TSceneVisibility = { minScale?: number; maxScale?: number };

/** Coordinates are relative to the element's origin, in world units. */
export type TScenePrimitive = TSceneVisibility &
  (
    | {
        kind: "rect";
        x: number;
        y: number;
        width: number;
        height: number;
        /** One radius or [top-left, top-right, bottom-right, bottom-left]. */
        radius?: number | readonly number[];
        fill?: string;
        border?: TSceneStroke;
      }
    | { kind: "circle"; cx: number; cy: number; r: number; fill?: string; border?: TSceneStroke }
    | {
        kind: "text";
        text: string;
        family: string;
        /** A keyword weight ("normal", "bold"): layoutText reads digits of the font string as a line height. */
        weight?: string;
        size: TSceneTextSize;
        /** Line height in world units. */
        lineHeight: number;
        color: string;
        x: number;
        y: number;
        width: number;
        height?: number;
        align?: CanvasTextAlign;
      }
    | { kind: "icon"; path: Path2D; viewBox: number; x: number; y: number; size: number; color: string }
    /** Cubic segments, 8 numbers each (p0, c1, c2, p3), as the connection geometries produce them. */
    | { kind: "path"; segments: Float32Array; stroke: TSceneStroke }
    /** A closed polygon given as x, y pairs. */
    | { kind: "polygon"; points: Float32Array; fill: string; stroke?: TSceneStroke }
  );

/** One drawn entity of the scene: a block with its anchors, a group, a connection. */
export type TSceneElement = {
  readonly id: string;
  zIndex: number;
  /** Order within a z-level; a raise gives a new, larger value. */
  sequence: number;
  /** Origin of the primitives in world units. */
  x: number;
  y: number;
  /** Bounds of every primitive relative to the origin, strokes included. */
  bounds: TTileRect;
  primitives: readonly TScenePrimitive[];
  hidden: boolean;
};
