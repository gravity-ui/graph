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

/** Scene presentation lifecycle, reported asynchronously by the graph's `scene-state-change` event. */
export type TSceneState = "init" | "initialize" | "ready" | "switch";

/** Qualitative zoom tier of the scene; the one level shared by every scene primitive. */
export type TSceneLevel = "minimalistic" | "schematic" | "detailed";

/**
 * A read-only view of a scene element, as returned by query(). `bounds` is relative to the element's origin
 * (`x`, `y`), strokes included. `hidden` is `false` unless the query included hidden elements (`includeHidden`): then
 * it is `true` for a hidden element and for what is nested in one. A child element names its owner as `parent`, the
 * child element it is nested in as `nestedIn`, and comes after its scene parent, by `childOrder`; its `styleId` is its
 * drawn row. A child's `zIndex` and `order` are its own ignored values (`order` is 0), not its draw position: it draws
 * in its owner's raised bucket at its owner's order. `entityType` is the `static entityType` of the component that
 * wrote the element.
 */
export type TSceneElementView = Readonly<
  Pick<
    TSceneElement,
    | "id"
    | "entityType"
    | "parent"
    | "nestedIn"
    | "childOrder"
    | "x"
    | "y"
    | "primitives"
    | "zIndex"
    | "order"
    | "styleId"
    | "hidden"
  > & {
    bounds: Readonly<TSceneElement["bounds"]>;
  }
>;

/** Options of `graph.scene.query()`. */
export type TSceneQueryOptions = {
  /** Only elements with a primitive on this level; an owner left out still places its children that have one. */
  readonly level?: TSceneLevel;
  /**
   * Hidden elements too: a block handed to HTML, one in a collapsed group, and their children. Their views say
   * `hidden: true` (a child of a hidden owner included).
   */
  readonly includeHidden?: boolean;
  /** Only elements of these entity types: the `static entityType` of the component that wrote the element. */
  readonly entityTypes?: readonly string[];
  /**
   * @internal The store's live elements instead of frozen copies (the minimap's redraw). Read them at once; never keep
   * or change them. Their `hidden` is the element's own flag, not the drawn state: with `includeHidden`, a child of a
   * hidden owner says `hidden: false`. A caller that combines the two and needs the drawn state reads
   * `graph.scene.store.isDrawnHidden(element)`; an owner's own flag is its drawn state.
   */
  readonly live?: boolean;
};

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
  /** Current presentation state, including transitions whose notification is still queued. */
  readonly state: TSceneState;
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
   * Elements whose bounds meet a world rectangle, in draw order (bottom first): visible ones by default; options
   * filter by level and entity type and add hidden ones. The bounds are grown where an element's style scales its
   * circles or widens its strokes past them (a hover scale), as the Canvas 2D renderer culls; the views' `bounds` are
   * the element's own. Views are frozen snapshots; `bounds` stays relative to each element's origin.
   */
  query(rect: TRect, options?: TSceneQueryOptions): readonly TSceneElementView[];
  /**
   * Steps once at the end of a graph frame in which elements of this entity type changed (added, moved, restyled,
   * hidden, reordered, removed; an element nested in one that was hidden, raised, moved to another bucket or reordered
   * included), or style rows were rewritten (a rule, level or root-tag change) or the dim colour changed. A row change
   * to a row that looks the same steps nothing, whatever the order of the rows' properties and parts. A layer that
   * draws from `query()` (the minimap, with `"block"`) redraws on it, one frame after the change. The same signal for
   * every call with one type; a counter first asked for during a frame steps at its end for that frame's changes.
   */
  revisionOf(entityType: string): ReadonlySignal<number>;
  /** Scene order of two components, shared by drawing and hit-testing: negative when `a` draws below `b`. */
  compareOrder(a: CoreComponent, b: CoreComponent): number;
  /**
   * Calls the listener at the end of every graph frame, after every layer and the scene updated (the scene drew).
   * GraphLayer finds the pointer's target again there, and a layer that switches HTML with the scene (ReactLayer) does
   * it there, so the frame that changes the HTML draws the scene that goes with it, whatever the layer order. Returns
   * the function that removes the listener.
   */
  onFrameEnd(listener: () => void): () => void;
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
   * Renders the scene, including built-in connections, to a new Canvas2D canvas. A current-view export (no `rect`
   * or `scale`) also composites the visible layer canvases below the scene. Setting only `level` changes the scene's
   * detail while those canvases retain their live appearance, including custom Canvas connections and legacy blocks.
   * Throws a `RangeError` when the output exceeds the canvas size limits.
   *
   * The picture does not depend on where the camera has been: anchor components that blocks create lazily are created
   * for the export when its rect and level need them, and dropped after the draw (also when it throws). Styles are
   * computed at the export's level and scale, and texts laid out at its scale under the `cameraAwareText` setting.
   * Synchronous: an export of a large rect at a level that draws anchors creates their components for its duration.
   * Blocks are found for it by their anchor overflow and by the `LOOK_EXTENT` of their anchor classes
   * (`Anchor.LOOK_EXTENT`): an anchor class whose look reaches farther than its declared extent (a subclass, or one
   * with a larger `SIZE`/`LINE_WIDTH`) must declare its own, or the export can miss its anchors near the crop edge
   * (development builds warn, naming the class). The search uses the classes a block's `getAnchorClass` override
   * returned in its last update (a block whose classes are unknown is a candidate); constructing the anchors can call
   * it again, and a throw from it there aborts the export.
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
