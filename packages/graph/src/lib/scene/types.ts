import type { TLineInteraction } from "../../components/canvas/connections/lines/types";
import type { TTileRect } from "../culling/TileIndex";

import type { TSceneEffectUse } from "./effects/types";

/** Which renderer draws the scene: the Canvas2D interpreter or the lazily loaded WebGL backend. */
export type TSceneRenderer = "canvas" | "webgl";

/** State of the scene renderer; `"canvas"` and `"webgl"` are the settled states, the rest are transitions. */
export type TSceneRendererState = "canvas" | "loading" | "webgl" | "lost" | "restoring" | "webgl-fallback";

/** Stroke of a scene primitive; lengths in world units. Read-only, like the primitive that holds it. */
export type TSceneStroke = {
  /** Unset: the computed style supplies it; a stroke still unset draws nothing. */
  readonly color?: string;
  /** Unset: the style's base width of the part supplies it; a stroke whose width is still unset draws nothing. */
  readonly width?: TSceneSize;
  /** Where the stroke of a closed shape lies relative to its edge. Default: "center". */
  readonly align?: "inside" | "center" | "outside";
  readonly dash?: readonly number[];
};

/**
 * A stroke or border width in world units, in pixels clamped by world units, or in world units clamped by pixels. Text
 * sizes are numbers with a `cameraAware` mode instead (`TSceneCameraAware`).
 */
export type TSceneSize =
  | number
  | { readonly px: number; readonly minWorld?: number; readonly maxWorld?: number }
  | { readonly world: number; readonly minPx?: number; readonly maxPx?: number };

/**
 * How a text's font size follows the camera. Off (`false` or unset): `size` is in world units, so the text scales like
 * any other world object. On (`true` or an object): `size` is in screen pixels at every camera scale, so the world font
 * size is `size / scale`, clamped to `[minWorld, maxWorld]` when the object sets them; the text re-fits its box as the
 * camera zooms. A part style's `cameraAware` and the graph setting `cameraAwareText` can change the mode
 * (`TScenePartStyle.cameraAware`); a style's `true` keeps the clamps given here.
 */
export type TSceneCameraAware = boolean | { readonly minWorld?: number; readonly maxWorld?: number };

/**
 * What the graph allows scene text: `cameraAware: false` (the `cameraAwareText` setting off) makes every text
 * world-sized whatever its primitive and styles say. Renderers and exports receive it with each frame.
 */
export type TSceneTextPolicy = { readonly cameraAware: boolean };

/** Named part of a primitive; styles recolour parts. */
export type TScenePart = string;

/**
 * Values of one part. Table properties: color, visible, dim. Element properties: width, scale, opacity, cameraAware,
 * effect.
 * In a row, a `parts` value wins over the `base` value of the same property.
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
  /**
   * Turns the camera-aware mode of the part's texts on or off (`TSceneCameraAware`): a `parts` value wins over a `base`
   * one, and both over the primitive's own mode (a base value too, unlike the base colours and widths). `true` keeps
   * the primitive's clamps. The graph setting `cameraAwareText: false` turns every text off whatever the styles say.
   */
  cameraAware?: boolean;
  /** WebGL path effect. A base rule fills an unset effect. A state rule replaces it or disables it with null. */
  effect?: Readonly<TSceneEffectUse<"path">> | null;
};

/** Visual motion for a scene block. `"none"` clears motion from an earlier rule. */
export type TSceneMotion = "bounce" | "shake" | "none";

/** A computed style row. */
export type TSceneStyle = Readonly<{
  /** State rules: override the primitive's own values. */
  parts?: Readonly<Record<TScenePart, Readonly<TScenePartStyle>>>;
  /**
   * Base rules: a colour, width or effect fills only a value the primitive leaves unset; `visible`, `scale`, `dim`,
   * `opacity` and `cameraAware` apply unless `parts` sets them.
   */
  base?: Readonly<Record<TScenePart, Readonly<TScenePartStyle>>>;
  /** Added to the element's zIndex bucket while the style is on. */
  raise?: number;
  /** Translates the drawn block without changing its layout coordinates. */
  motion?: TSceneMotion;
  /** The dim of every part that sets none (`TScenePartStyle.dim`) and of primitives without a part. */
  dim?: number;
  /**
   * In [0, 1] (clamped): multiplies the alpha of every paint of the element's primitives; a part's own `opacity`
   * (`TScenePartStyle.opacity`) multiplies it again. Each primitive fades on its own: this is not CSS group opacity.
   */
  opacity?: number;
}>;

/** Shown while minScale <= camera scale < maxScale; either bound may be absent. */
export type TSceneVisibility = {
  minScale?: number;
  maxScale?: number;
  part?: TScenePart;
  /**
   * Levels the primitive is shown on: a sum of `LEVEL_BIT` values (minimalistic 1, schematic 2, detailed 4); unset
   * means every level. `SceneComponent` sets it from the level method that returned the primitive.
   */
  levelMask?: number;
};

/** Fragment program for a WebGL sprite. Return straight RGBA; UV (0, 0) is the top-left corner. */
export type TSceneSpriteEffect = {
  readonly fragment: string;
  /** Request frames while this sprite is visible. The shader receives the scene clock in seconds. */
  readonly animated?: boolean;
};

/**
 * Coordinates are relative to the element's origin, in world units.
 *
 * A primitive is a value: never change one after it went into the scene (a text above all). To change an element,
 * give it new primitives (`SceneStore.update`). The WebGL backend compares texts by identity first and keeps the
 * objects of its last encode (`sameText`, `adoptTexts`), so a text changed in place draws stale glyphs. The type is
 * read-only (strokes and sizes too), and development builds freeze the text primitives the store receives (with their
 * `cameraAware` objects), so a text changed in place throws there.
 */
export type TScenePrimitive = Readonly<
  TSceneVisibility &
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
          /** Reveal the text as the camera zooms from minScale (default 0) to this scale. */
          fadeInUntil?: number;
          family: string;
          /** A CSS font weight ("normal", "bold", "500"); default "normal". */
          weight?: string;
          /**
           * The font size: world units, or screen pixels at every camera scale when the text is camera-aware
           * (`cameraAware`). The text is laid out at the resolved world size (`resolveTextSize`).
           */
          size: number;
          /** Whether `size` is in screen pixels, and its world clamps (`TSceneCameraAware`). Default: off. */
          cameraAware?: TSceneCameraAware;
          /**
           * The line pitch in the units of `size` (world units, or screen pixels when camera-aware): it scales with the
           * resolved font size. Not positive: one line at most.
           */
          lineHeight: number;
          color?: string;
          x: number;
          y: number;
          /** The box's width: lines wrap to it, `align` places each line against it, and it clips the text. */
          width: number;
          /**
           * The box's height: a line is kept while it fits the box at the resolved line pitch, `verticalAlign` places
           * the block of lines in it, and it clips the text. Without a height, lines are unbounded and the text is
           * clipped by the box's width only.
           */
          height?: number;
          /** Places each line against the box: left (start), centre or right (end). */
          align?: CanvasTextAlign;
          /**
           * Places the block of lines in the box `[y, y + height]` (without a height, the block at `size`): its top at
           * `y` (`"top"`, the default and the v1 placement), its centre at the box's centre or its bottom at the box's
           * bottom.
           */
          verticalAlign?: "top" | "middle" | "bottom";
          /** Wraps by words to the box's width (default `true`); `false` keeps one line. */
          wrap?: boolean;
          /**
           * What a text that does not fit shows: `"clip"` (the default) cuts it at the box; `"ellipsis"` ends the last
           * kept line with "…" when content remains.
           */
          overflow?: "clip" | "ellipsis";
          /** The most lines kept, after the box's height. */
          maxLines?: number;
        }
      /** A decoded, immutable image on a WebGL quad. Canvas 2D and interpreted exports omit sprites. */
      | {
          kind: "sprite";
          x: number;
          y: number;
          width: number;
          height: number;
          image: HTMLImageElement;
          /** Defines vec4 spriteColor(sampler2D atlas, vec2 uv, float time, vec4 params). */
          effect?: TSceneSpriteEffect;
          /** Per-sprite parameters, zero by default. */
          params?: readonly [number, number, number, number];
        }
      | { kind: "icon"; path: Path2D; viewBox: number; x: number; y: number; size: number; color?: string }
      /** Cubic segments, 8 numbers each (p0, c1, c2, p3), as the connection geometries produce them. */
      /** The effect is drawn by WebGL only; the Canvas2D interpreter ignores it. */
      | {
          kind: "path";
          segments: Float32Array;
          /** Joins the ends of one continuous solid contour whose final point repeats its first. */
          closed?: boolean;
          stroke: TSceneStroke;
          effect?: TSceneEffectUse<"path">;
          canvasStroke?: TSceneStroke;
          interaction?: TLineInteraction;
          effectShowsSelection?: boolean;
        }
      /** A closed polygon given as x, y pairs. */
      | { kind: "polygon"; points: Float32Array; fill?: string; stroke?: TSceneStroke }
    )
>;

/** One drawn entity of the scene: a block with its anchors, a group, a connection. */
export type TSceneElement = {
  readonly id: string;
  /**
   * The owner this element belongs to (a child element, spec §5.2): it draws right above its owner and under the next
   * owner, hidden while an element it is nested in is hidden, in the owner's raised bucket, with its scene parent's
   * element dim and opacity. Unset for an owner.
   */
  readonly parent?: string;
  /**
   * The child element this child is nested in (its scene parent), when that is not its owner. `parent` stays the owner:
   * the element draws in its owner's bucket, after it, in the pre-order of the nesting (`SceneStore.childrenOf`).
   */
  readonly nestedIn?: string;
  /**
   * The `static entityType` of the component that wrote the element (the minimap's `"block"`), whatever the element's
   * id; none for others.
   */
  readonly entityType?: string;
  /** A child's place among its parent's children, lowest first; 0 for owners. */
  childOrder: number;
  /** The bucket; ignored for a child, which draws in its parent's. */
  zIndex: number;
  /** Order within a bucket; a raise gives a new, larger value. 0 for a child: it orders by its parent. */
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

/**
 * A change of the store, as renderers receive it.
 *
 * Child elements (spec §5.2): when only a parent changes, its children get no update. A raise or `raiseMany`, a
 * `zIndex` update, a change of the raise of its style name the owner alone; a change of an element's `hidden` flag
 * names that element alone. A renderer derives each child's depth key from its owner and its hidden state from its
 * nesting (`SceneStore.rootOf`, `childrenOf`, `isDrawnHidden`). A child's own `zIndex` and `order` (always 0) are
 * ignored, and its style updates carry `styleId` (and `primitives` when the encode key changes) but never `zIndex`.
 */
export type TSceneChange = {
  type: "add" | "update" | "delete";
  element: TSceneElement;
  /**
   * Fields an update changed: x, y, bounds, primitives, hidden, zIndex, order, styleId, childOrder. A child element's
   * `styleId` is its drawn row (its own row composed with its parent's element values, see `SceneStore.ownStyleOf`),
   * and a raise of a child raises its parent, so the update names the parent. A delete of an owner is preceded by one
   * delete per child element.
   */
  fields?: ReadonlySet<keyof TSceneElement>;
  /** On an update from a row change: the row the element drew with before (`styleId` names the new one). */
  previousStyleId?: number;
};

/**
 * Why the style rows changed (`SceneStore.subscribeStyles`): a row defined, the rows rewritten (a rule, level or
 * root-tag change, and the composed rows that follow them), a row freed, or the dim colour changed.
 */
export type TSceneStyleChange = "define" | "free" | "replace" | "dim";
