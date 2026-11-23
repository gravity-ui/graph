import type { TSceneLevel } from "../../../services/scene/types";
import type { SceneStore } from "../store/SceneStore";
import type { TSceneChange, TSceneStyle, TSceneTextPolicy } from "../types";

/**
 * The camera scale and text policy that texts are laid out for: a camera-aware text's lines depend on both
 * (`textLayout.ts`). The renderer layer passes the current ones with every apply and replay, so the backend encodes
 * texts for the frame it draws next.
 */
export type TSceneTextFrame = { readonly scale: number; readonly textPolicy: TSceneTextPolicy };

export type TSceneFrame = {
  /** CSS px of the viewport. */
  width: number;
  height: number;
  /** Camera: screen = world * scale + (x, y). */
  x: number;
  y: number;
  scale: number;
  /** Internal camera limit, used to retain conservative translucent packing through zoom. */
  scaleMin?: number;
  dpr: number;
  /** Seconds on the graph clock. */
  time: number;
  /** The colour a style's `dim` moves paints towards (`SceneStore.getDimColor()`). */
  dimColor: string;
  /** The level whose primitives draw (`levelMask`); unset draws every level. */
  level?: TSceneLevel;
  /** What the graph allows text (the `cameraAwareText` setting); unset allows camera-aware text. */
  textPolicy?: TSceneTextPolicy;
};

export type TSceneBackendStats = {
  /** Primitives encoded since creation. */
  encodes: number;
  lastEncodeMs: number;
  /** Buffer or texture uploads: writes, a dirty span of an instance list each. */
  uploads: number;
  /** Bytes of every upload since creation: instance lists, the element and style tables, the glyph atlas. */
  uploadBytes: number;
  /** In the last frame: the bytes of its uploads, and their writes (`uploads`). */
  lastUploadBytes: number;
  lastUploadWrites: number;
  /** In the last frame. */
  drawCalls: number;
  /** In the last frame. */
  instances: number;
  /** Attach + first compile. */
  deviceMs: number;
  firstFrameMs: number;
  /**
   * The largest instance upload of the last frame: "none", "full" (a list whole) or "range" (dirty spans of a list,
   * the close ones merged).
   */
  lastUploadKind: "none" | "full" | "range";
  lastReplayMs: number;
  /** Unsupported primitives, including polygons beyond the filled arrow triangles. */
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
  /** The last applyMany(), depth flush included. */
  lastApplyMs: number;
  /**
   * Text re-layouts since creation: each a camera-aware text whose glyphs changed at the frame's scale (other lines,
   * or another policy), rewritten before the draw without its element's rects, paths and other texts.
   */
  textRelayouts: number;
  /**
   * In the last frame: the texts re-laid out, their glyph instances in the buffer (a camera-aware text's capacity) and
   * those instances' bytes, the bytes written for them (the slots up to the larger of the glyphs placed before and
   * now) and the bytes of the glyphs they draw now, and the time it took (layout and encode).
   */
  lastTextRelayouts: number;
  lastTextRelayoutGlyphs: number;
  lastTextRelayoutBytes: number;
  lastTextRelayoutWrittenBytes: number;
  lastTextRelayoutDrawnBytes: number;
  lastTextRelayoutMs: number;
  /**
   * In the last frame: the camera-aware texts laid out again (their size left the range of their layout) whose glyphs
   * stayed the same (the same lines and clip, linear widths): nothing was written for them.
   */
  lastTextRelayoutsKept: number;
  /**
   * Elements whose camera-aware texts may keep stale lines: not checked since the last change of scale, level or
   * policy, because no frame showed them since (outside the view, hidden, or off their scale range or level). Each is
   * checked, and laid out again if its lines changed, in the first frame that shows it.
   */
  staleTexts: number;
  /**
   * The depth's sub-order width after the last apply: each depth key has 2^subBits sub-orders, enough for the owner
   * element with the most primitives, its child elements' included (at least 5).
   */
  subBits: number;
};

export interface ISceneBackend {
  readonly canvas: HTMLCanvasElement;
  readonly stats: TSceneBackendStats;
  /**
   * Replays every element of the store and keeps the backend in sync through applyMany(). `text` is the scale and
   * policy to lay texts out for; unset, scale 1 and the default policy.
   */
  replay(store: SceneStore, text?: TSceneTextFrame): void;
  /**
   * Applies the changes of one frame, coalesced per element (SceneChangeQueue), and renumbers the depth once; `text` as
   * for `replay`.
   */
  applyMany(changes: readonly TSceneChange[], text?: TSceneTextFrame): void;
  setStyles(styles: readonly TSceneStyle[]): void;
  /** Returns true while an animated effect is visible. */
  draw(frame: TSceneFrame): boolean;
  dispose(): void;
}

export type TSceneBackendEvents = { onLost(): void; onRestored(): void; onInvalidate?(): void };

export type TCreateSceneBackend = (sibling: HTMLCanvasElement, events: TSceneBackendEvents) => Promise<ISceneBackend>;

export interface ISceneBackendModule {
  createSceneBackend: TCreateSceneBackend;
}
