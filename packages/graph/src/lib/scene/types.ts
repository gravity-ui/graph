import type { TConnectionEffectUse } from "../../components/canvas/connections/effects";
import type { TTileRect } from "../culling/TileIndex";

/** Which renderer draws the scene: the Canvas2D interpreter or the lazily loaded WebGL backend. */
export type TSceneRenderer = "canvas" | "webgl";

/** State of the scene renderer; `"canvas"` and `"webgl"` are the settled states, the rest are transitions. */
export type TSceneRendererState = "canvas" | "loading" | "webgl" | "lost" | "restoring" | "webgl-fallback";

/** Stroke of a scene primitive; lengths in world units. */
export type TSceneStroke = {
  color: string;
  width: TSceneSize;
  /** Where the stroke of a closed shape lies relative to its edge. Default: "center". */
  align?: "inside" | "center" | "outside";
  dash?: readonly number[];
};

/** A size in world units, in pixels clamped by world units, or in world units clamped by pixels. */
export type TSceneSize =
  | number
  | { px: number; minWorld?: number; maxWorld?: number }
  | { world: number; minPx?: number; maxPx?: number };

/** @deprecated Use TSceneSize. */
export type TSceneTextSize = TSceneSize;

/** Named part of a primitive; styles recolour parts. */
export type TScenePart = string;

/**
 * Overrides per part. `visible: false` hides the whole primitive that has the part; `color` recolours the part's
 * paint (the border of a "border" part, the fill, text or stroke colour otherwise).
 */
export type TSceneStyle = Readonly<Record<TScenePart, { color?: string; visible?: boolean }>>;

/** Shown while minScale <= camera scale < maxScale; either bound may be absent. */
export type TSceneVisibility = { minScale?: number; maxScale?: number; part?: TScenePart };

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
        size: TSceneSize;
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
    /** The effect is drawn by WebGL only; the Canvas2D interpreter ignores it. */
    | { kind: "path"; segments: Float32Array; stroke: TSceneStroke; effect?: TConnectionEffectUse }
    /** A closed polygon given as x, y pairs. */
    | { kind: "polygon"; points: Float32Array; fill: string; stroke?: TSceneStroke }
  );

/** One drawn entity of the scene: a block with its anchors, a group, a connection. */
export type TSceneElement = {
  readonly id: string;
  zIndex: number;
  /** Order within a z-level; a raise gives a new, larger value. */
  order: number;
  /** Origin of the primitives in world units. */
  x: number;
  y: number;
  /** Bounds of every primitive relative to the origin, strokes included. */
  bounds: TTileRect;
  primitives: readonly TScenePrimitive[];
  hidden: boolean;
  /** Index into the store's styles; 0 means no overrides. */
  styleId: number;
};

export type TSceneChange = {
  type: "add" | "update" | "delete";
  element: TSceneElement;
  /** Fields an update changed: x, y, bounds, primitives, hidden, zIndex, order, styleId. */
  fields?: ReadonlySet<keyof TSceneElement>;
};
