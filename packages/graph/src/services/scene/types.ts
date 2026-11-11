import type { ReadonlySignal } from "@preact/signals-core";

import type { TSceneElement, TSceneRenderer, TSceneRendererState } from "../../lib/scene/types";
import type { TRect } from "../../utils/types/shapes";

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
