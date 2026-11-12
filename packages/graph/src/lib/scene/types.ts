import type { TConnectionEffectUse } from "../../components/canvas/connections/effects";
import type { TTileRect } from "../culling/TileIndex";

/** Which renderer draws the scene: the Canvas2D interpreter or the lazily loaded WebGL backend. */
export type TSceneRenderer = "canvas" | "webgl";

/** State of the scene renderer; `"canvas"` and `"webgl"` are the settled states, the rest are transitions. */
export type TSceneRendererState = "canvas" | "loading" | "webgl" | "lost" | "restoring" | "webgl-fallback";

/** Stroke of a scene primitive; lengths in world units. */
export type TSceneStroke = {
  /** Unset: the computed style supplies it; a stroke still unset draws nothing. */
  color?: string;
  /** Unset: the style's base width of the part supplies it; a stroke whose width is still unset draws nothing. */
  width?: TSceneSize;
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
 * Values of one part. Table properties: color, visible, dim. Element properties: width, scale, opacity. In a row, a
 * `parts` value wins over the `base` value of the same property.
 */
export type TScenePartStyle = {
  /** The part's paint: a "border" part's border, otherwise the fill, text or stroke colour. */
  color?: string;
  /** false hides every primitive of the part; a `parts` value wins over a `base` one. */
  visible?: boolean;
  /** Width of the part's stroke or border; a `base` width fills only an unset width. */
  width?: TSceneSize;
  /** Radius factor of the part's circles; a `parts` value wins over a `base` one. */
  scale?: number;
  /**
   * In [0, 1] (clamped): moves every paint of the part's primitives towards the scene's dim colour, alpha kept. A
   * `parts` value wins over a `base` one, and both over the element's `dim`.
   */
  dim?: number;
  /**
   * In [0, 1] (clamped): multiplies the alpha of every paint of the part's primitives, so what lies under them shows
   * through. A `parts` value wins over a `base` one; the result multiplies the element's `opacity`.
   */
  opacity?: number;
};

/** A computed style row. */
export type TSceneStyle = Readonly<{
  /** State rules: override the primitive's own values. */
  parts?: Readonly<Record<TScenePart, Readonly<TScenePartStyle>>>;
  /**
   * Base rules: a colour or width fills only a value the primitive leaves unset; `visible`, `scale` and `dim` apply
   * unless `parts` sets them.
   */
  base?: Readonly<Record<TScenePart, Readonly<TScenePartStyle>>>;
  /** Added to the element's zIndex bucket while the style is on. */
  raise?: number;
  /** The dim of every part that sets none (`TScenePartStyle.dim`) and of primitives without a part. */
  dim?: number;
  /**
   * In [0, 1] (clamped): multiplies the alpha of every paint of the element's primitives; a part's own `opacity`
   * (`TScenePartStyle.opacity`) multiplies it again. Each primitive fades on its own: this is not CSS group opacity.
   */
  opacity?: number;
}>;

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
        color?: string;
        x: number;
        y: number;
        width: number;
        height?: number;
        align?: CanvasTextAlign;
      }
    | { kind: "icon"; path: Path2D; viewBox: number; x: number; y: number; size: number; color?: string }
    /** Cubic segments, 8 numbers each (p0, c1, c2, p3), as the connection geometries produce them. */
    /** The effect is drawn by WebGL only; the Canvas2D interpreter ignores it. */
    | { kind: "path"; segments: Float32Array; stroke: TSceneStroke; effect?: TConnectionEffectUse }
    /** A closed polygon given as x, y pairs. */
    | { kind: "polygon"; points: Float32Array; fill?: string; stroke?: TSceneStroke }
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
