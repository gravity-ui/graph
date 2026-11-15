import type { ReadonlySignal } from "@preact/signals-core";

import type { CoreComponent } from "../../lib/CoreComponent";
import type {
  TSceneElement,
  TSceneRenderer,
  TSceneRendererState,
  TSceneStyle,
  TSceneTextPolicy,
} from "../../lib/scene/types";
import type { TRect } from "../../utils/types/shapes";
import type { SceneStyleSheet } from "../styles/SceneStyleSheet";
import type { TStyleExplanation, TStyleTarget } from "../styles/types";
import type { TagStore } from "../tags/TagStore";
import type { TEntityId, TEntityType, TTagSet } from "../tags/types";

export type { TSceneRenderer, TSceneRendererState };

/** Qualitative zoom tier of the scene; the one level shared by every scene primitive. */
export type TSceneLevel = "minimalistic" | "schematic" | "detailed";

/**
 * A read-only view of a scene element, as returned by query(). `bounds` is relative to the element's origin
 * (`x`, `y`), strokes included. `hidden` is always `false` in query() results: hidden elements and the children of
 * hidden parents are not returned. A child element names its `parent` and comes right after it, by `childOrder`; its
 * `styleId` is its drawn row. A child's `zIndex` and `order` are its own ignored values (`order` is 0), not its draw
 * position: it draws in its parent's raised bucket at its parent's order.
 */
export type TSceneElementView = Readonly<
  Pick<
    TSceneElement,
    "id" | "parent" | "childOrder" | "x" | "y" | "primitives" | "zIndex" | "order" | "styleId" | "hidden"
  > & {
    bounds: Readonly<TSceneElement["bounds"]>;
  }
>;

/** A component whose level methods measured text (SceneComponent.measureText). */
export interface ITextMeasurer {
  invalidateTextMeasures(): void;
}

export type TSceneImageOptions = {
  /** World rect to draw; default: the camera's view, composed with the layers under the scene. */
  rect?: TRect;
  /** Scale for camera-aware sizes and world-to-CSS pixels; default: the camera's. */
  scale?: number;
  /** Output pixels per CSS pixel; default: the graph's device pixel ratio. */
  pixelRatio?: number;
  /** A fill under everything; default: transparent. */
  background?: string;
  /** The level whose primitives are drawn; default: `$level`. */
  level?: TSceneLevel;
};

/** @internal What `toImage()` asks an export preparer to make ready: the world rect and the level it draws. */
export type TSceneExportRequest = { readonly rect: Readonly<TRect>; readonly level: TSceneLevel };

/**
 * @internal Makes the scene ready for one export before `toImage()` queries it, and returns the function that undoes
 * it (called in `finally`, after the draw), if there is anything to undo. A preparer that throws undoes its own work.
 */
export type TSceneExportPreparer = (request: TSceneExportRequest) => (() => void) | undefined;

export interface IGraphScene {
  /** Tags of graph entities. */
  readonly tags: TagStore;
  /** Style rules: target classes, tags, root tags and scopes mapped to part values. */
  readonly styles: SceneStyleSheet;
  /**
   * Increments when computed styles may have changed: a rule, root tag or level change, or a zoom across a rule's
   * scale threshold. Tag changes of single entities do not increment it.
   */
  readonly $styleGeneration: ReadonlySignal<number>;
  /**
   * Why an entity looks the way it does: its tags, the root tags, the class its element is styled as and the matched
   * rules in application order. Without a bound scene element, `rules` is empty and there is no style.
   */
  explain(entityType: TEntityType, id: TEntityId): TStyleExplanation;
  /** The computed style of a target class with the given tags under the current rules, level and scale. */
  styleFor(target: TStyleTarget, tags: TTagSet): TSceneStyle;
  /** The scene zoom tier, re-evaluated on zoom, on a change of the scale-level strategy and of graph constants. */
  readonly $level: ReadonlySignal<TSceneLevel>;
  /** State of the renderer; see `TSceneRendererState`. */
  readonly $renderer: ReadonlySignal<TSceneRendererState>;
  /**
   * The `cameraAwareText` setting: `false` makes every scene text world-sized, whatever its primitive and the styles
   * say. A change redraws the scene, and `explain()` reports `cameraAwareText: "forced-off"` meanwhile.
   */
  readonly $cameraAwareText: ReadonlySignal<boolean>;
  /** Scene time. `now()` returns seconds; the clock stops on `graph.stop()` and while the document is hidden. */
  readonly clock: { now(): number };
  /** Writes the `renderer` setting. */
  setRenderer(renderer: TSceneRenderer): void;
  /**
   * Visible (non-hidden) elements whose bounds meet a world rectangle, in draw order (bottom first).
   * Views are frozen snapshots; `bounds` stays relative to each element's origin.
   */
  query(rect: TRect): readonly TSceneElementView[];
  /** Scene order of two components, shared by drawing and hit-testing: negative when `a` draws below `b`. */
  compareOrder(a: CoreComponent, b: CoreComponent): number;
  /**
   * Draws views with the Canvas2D interpreter on any 2D context, whatever the active renderer. The caller owns
   * the context transform, including the device pixel ratio. `skipText` leaves text primitives out, `level` skips
   * primitives of other levels, `drawHidden` draws hidden elements too, and `textPolicy` replaces the graph's (the
   * `cameraAwareText` setting) for this draw.
   */
  drawInterpreted(
    ctx: CanvasRenderingContext2D,
    elements: readonly TSceneElementView[],
    scale: number,
    options?: { skipText?: boolean; level?: TSceneLevel; drawHidden?: boolean; textPolicy?: TSceneTextPolicy }
  ): void;
  /**
   * The scene's picture as a new canvas, drawn by the Canvas2D interpreter whatever the renderer. For the current view
   * (no `rect`, no `scale`) the visible layer canvases under the scene are drawn first; any other rect draws the scene
   * only. A `level` alone keeps the current view: those canvases come as drawn live, at the live level (connections and
   * `LegacyCanvasBlock` bodies on the `GraphLayer` canvas), under the scene drawn at the requested level. Throws a
   * `RangeError` when the output passes the canvas size limits.
   *
   * The picture does not depend on where the camera has been: anchor components that blocks create lazily are created
   * for the export when its rect and level need them, and dropped after the draw (also when it throws). Styles are
   * computed at the export's level and scale, and texts laid out at its scale under the `cameraAwareText` setting.
   * Synchronous: an export of a large rect at a level that draws anchors creates their components for its duration.
   * Blocks are found for it by their anchor overflow and by the `LOOK_EXTENT` of their anchor classes
   * (`Anchor.LOOK_EXTENT`): an anchor class whose look reaches farther than its declared extent (a subclass, or a block
   * passing a larger `size`/`lineWidth`) must declare its own, or the export can miss its anchors near the crop edge
   * (development builds warn, naming the class). A block's `renderAnchor` override can run during the export's search,
   * for blocks outside the rect too, and again when the anchors are constructed; a throw from it aborts the export.
   *
   * Throws when called while another export runs, and when called from a block's own lifecycle hook (stateChanged,
   * willIterate, ...) while that block has to create anchors for the export: "cannot create the anchors of block
   * <id> from that block's own update" (entering that update again would run its hooks twice). Calls from outside
   * that block's update work: a layer's render(), an event handler, another component's hook.
   *
   * The picture shows the updates applied so far. Inside `batch()` the store's subscribers have not run yet, so an
   * export there shows the state before the batch; after `setContext()`, components that derive their look from the
   * context show it after their next update. Call `toImage()` after the batch, or on the next frame.
   */
  toImage(options?: TSceneImageOptions): HTMLCanvasElement;
}
