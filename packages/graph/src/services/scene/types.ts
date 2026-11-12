import type { ReadonlySignal } from "@preact/signals-core";

import type { TSceneElement, TSceneRenderer, TSceneRendererState, TSceneStyle } from "../../lib/scene/types";
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
 * (`x`, `y`), strokes included. `hidden` is always `false` in query() results: hidden elements are not returned.
 */
export type TSceneElementView = Readonly<
  Pick<TSceneElement, "id" | "x" | "y" | "primitives" | "zIndex" | "order" | "styleId" | "hidden"> & {
    bounds: Readonly<TSceneElement["bounds"]>;
  }
>;

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
  /** Scene time. `now()` returns seconds; the clock stops on `graph.stop()` and while the document is hidden. */
  readonly clock: { now(): number };
  /** Writes the `renderer` setting. */
  setRenderer(renderer: TSceneRenderer): void;
  /**
   * Visible (non-hidden) elements whose bounds meet a world rectangle, in draw order (bottom first).
   * Views are frozen snapshots; `bounds` stays relative to each element's origin.
   */
  query(rect: TRect): readonly TSceneElementView[];
  /**
   * Draws views with the Canvas2D interpreter on any 2D context, whatever the active renderer. The caller owns
   * the context transform, including the device pixel ratio. `skipText` leaves text primitives out.
   */
  drawInterpreted(
    ctx: CanvasRenderingContext2D,
    elements: readonly TSceneElementView[],
    scale: number,
    options?: { skipText?: boolean }
  ): void;
}
