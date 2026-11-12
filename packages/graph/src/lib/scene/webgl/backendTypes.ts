import type { SceneStore } from "../SceneStore";
import type { TSceneChange, TSceneStyle } from "../types";

export type TSceneFrame = {
  /** CSS px of the viewport. */
  width: number;
  height: number;
  /** Camera: screen = world * scale + (x, y). */
  x: number;
  y: number;
  scale: number;
  dpr: number;
  /** Seconds on the graph clock. */
  time: number;
  /** The colour a style's `dim` moves paints towards (`SceneStore.getDimColor()`). */
  dimColor: string;
};

export type TSceneBackendStats = {
  /** Primitives encoded since creation. */
  encodes: number;
  lastEncodeMs: number;
  /** Buffer or texture uploads. */
  uploads: number;
  /** In the last frame. */
  drawCalls: number;
  /** In the last frame. */
  instances: number;
  /** Attach + first compile. */
  deviceMs: number;
  firstFrameMs: number;
  /** Kind of the last instance upload: "none", "full" or "range". */
  lastUploadKind: "none" | "full" | "range";
  lastReplayMs: number;
  /** Primitives now in the backend that it does not draw: the slice has no polygon and no icon support. */
  skipped: { polygon: number; icon: number };
  /**
   * In the last frame: the draw calls of the translucent pass (part of `drawCalls`): for each overlap level, for each
   * step, one per program with instances there.
   */
  translucentDrawCalls: number;
  /** The overlap levels of the translucent elements after the last level update; 0 without translucent elements. */
  translucentLevels: number;
  /** The last level update: the translucent set, a depth key, or a translucent element's origin or bounds changed. */
  lastLevelsMs: number;
  /** The last sort of the translucent instances and build of the translucent draw calls. */
  lastTranslucentOrderMs: number;
};

export interface ISceneBackend {
  readonly canvas: HTMLCanvasElement;
  readonly stats: TSceneBackendStats;
  /** Replays every element of the store and keeps the backend in sync through apply(). */
  replay(store: SceneStore): void;
  apply(change: TSceneChange): void;
  setStyles(styles: readonly TSceneStyle[]): void;
  /** Returns true while an animated effect is visible. */
  draw(frame: TSceneFrame): boolean;
  dispose(): void;
}

export type TSceneBackendEvents = { onLost(): void; onRestored(): void };

export type TCreateSceneBackend = (sibling: HTMLCanvasElement, events: TSceneBackendEvents) => Promise<ISceneBackend>;

export interface ISceneBackendModule {
  createSceneBackend: TCreateSceneBackend;
}
