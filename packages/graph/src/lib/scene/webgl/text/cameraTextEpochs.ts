import type { TSceneLevel } from "../../../../services/scene/types";
import { TileIndex } from "../../../culling/TileIndex";
import type { TTileRect } from "../../../culling/TileIndex";
import { ALL_LEVELS_MASK, LEVEL_BIT, SCENE_LEVELS, isOnLevel } from "../../levels";
import type { TScenePrimitive } from "../../types";

type TTextPrimitive = Extract<TScenePrimitive, { kind: "text" }>;

/** The tile size of the index of elements with camera-aware texts, in world units (the store's). */
const TEXT_TILE_SIZE = 1024;

/** Where an element's camera-aware texts can show: the levels of any (a level mask) and the scales of any. */
export type TTextReach = { readonly levelMask: number; readonly minScale: number; readonly maxScale: number };

/** Each level and its bit. */
const LEVEL_BITS = SCENE_LEVELS.map((level) => ({ level, value: LEVEL_BIT[level] }));

/** Where the camera-aware texts among `texts` can show: `known` when that is where they could show before. */
export function textReachOf(texts: readonly TTextPrimitive[], known?: TTextReach): TTextReach {
  let levelMask = 0;
  let minScale = Infinity;
  let maxScale = -Infinity;
  for (const text of texts) {
    if (!text.cameraAware) continue;
    const mask = text.levelMask ?? ALL_LEVELS_MASK;
    for (const bit of LEVEL_BITS) {
      if (isOnLevel(mask, bit.level) && !isOnLevel(levelMask, bit.level)) levelMask += bit.value;
    }
    minScale = Math.min(minScale, text.minScale ?? 0);
    maxScale = Math.max(maxScale, text.maxScale ?? Infinity);
  }
  if (known && known.levelMask === levelMask && known.minScale === minScale && known.maxScale === maxScale)
    return known;
  return { levelMask, minScale, maxScale };
}

/** What the text epochs ask their owner (the WebGL backend) of an element with camera-aware texts. */
export interface ICameraTextHost {
  /** Whether the element draws: neither it nor its owner is hidden. */
  isDrawn(id: string): boolean;
  /** Whether one of the element's camera-aware texts is on the scale range and the level of the frame. */
  showsTexts(id: string, scale: number, level: TSceneLevel | undefined): boolean;
  /**
   * A frame shows the element: its texts are laid out again if their lines are not the frame's. It runs during the
   * walk of the index, so it must not change the index: it may track the element again with the same texts (the
   * same reach, so `track` changes nothing), but not track another element, forget one or move one.
   */
  refresh(id: string): void;
}

/**
 * The text-epoch state of an element: its reach, its world bounds (`moved` updates them), and the epoch it was
 * decided in, shown (its lines are the epoch's) or not (passed: its texts are off the epoch's scale or level).
 */
type TTextState = {
  reach: TTextReach;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  decided: number;
  shown: boolean;
};

/**
 * Which camera-aware texts a frame checks, before a draw (pure: the backend answers the questions of
 * `ICameraTextHost`). A change of the scale, the level or the policy starts a text epoch; each frame of an epoch
 * decides, through a spatial index of the elements, those in its view not decided in the epoch yet, and those that
 * moved or showed again: shown (`ICameraTextHost.refresh`) or passed (none of its camera-aware texts is on the epoch's
 * scale and level, so none can show in it). An element out of the view or not drawn stays undecided. A frame with the
 * view of the last check and nothing moved checks nothing, nor does a frame whose scale or level no camera-aware text
 * shows at. A check allocates nothing.
 */
export class CameraTextEpochs {
  private readonly states = new Map<string, TTextState>();
  private readonly index = new TileIndex<string>({ tileSize: TEXT_TILE_SIZE });
  /** The text epoch, and whether `scale`, `level` and `cameraAware` hold the frame it began with. */
  private epoch = 0;
  private started = false;
  private scale = 1;
  private level: TSceneLevel | undefined;
  private cameraAware = true;
  /** The elements not decided in the current epoch, and those passed in it. */
  private undecided = 0;
  private passed = 0;
  /**
   * Where any camera-aware text can show, over every element since the last reset: the elements per level, the
   * smallest `minScale` and the largest `maxScale` (neither shrinks when an element goes).
   */
  private readonly levels: Record<TSceneLevel, number> = { minimalistic: 0, schematic: 0, detailed: 0 };
  private minScale = Infinity;
  private maxScale = -Infinity;
  /** The world rect of the view of the last check. */
  private readonly view: TTileRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /** Elements that moved, or showed again, since the last check: checked again. */
  private readonly moved = new Set<string>();

  constructor(private readonly host: ICameraTextHost) {}

  /** The elements tracked. */
  public get size(): number {
    return this.states.size;
  }

  /** The elements whose lines may be stale: not decided in the current epoch, or passed in it. */
  public get stale(): number {
    return this.undecided + this.passed;
  }

  public has(id: string): boolean {
    return this.states.has(id);
  }

  /**
   * Tracks an element with camera-aware texts at its world bounds, or takes its new texts: where they can show changed,
   * a frame of this epoch decides it again (its encode laid them out for the frame).
   */
  public track(
    id: string,
    texts: readonly TTextPrimitive[],
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): void {
    const known = this.states.get(id);
    const reach = textReachOf(texts, known?.reach);
    if (known) {
      if (known.reach === reach) return;
      this.countReach(known.reach, -1);
      known.reach = reach;
      this.countReach(reach, 1);
      if (known.decided === this.epoch) this.undecide(known);
      return;
    }
    this.states.set(id, { reach, minX, minY, maxX, maxY, decided: -1, shown: false });
    this.countReach(reach, 1);
    this.undecided++;
    this.index.set(id, minX, minY, maxX, maxY);
  }

  public forget(id: string): void {
    const known = this.states.get(id);
    if (!known) return;
    if (known.decided !== this.epoch) this.undecided--;
    else if (!known.shown) this.passed--;
    this.countReach(known.reach, -1);
    this.states.delete(id);
    this.index.delete(id);
    this.moved.delete(id);
  }

  /** The element's world bounds changed: it can enter the view with stale lines, so the next check visits it. */
  public move(id: string, minX: number, minY: number, maxX: number, maxY: number): void {
    const known = this.states.get(id);
    if (!known) return;
    known.minX = minX;
    known.minY = minY;
    known.maxX = maxX;
    known.maxY = maxY;
    this.index.set(id, minX, minY, maxX, maxY);
    this.moved.add(id);
  }

  /** The element draws again (it, or its owner, was hidden): the next check visits it. */
  public showAgain(id: string): void {
    if (this.states.has(id)) this.moved.add(id);
  }

  public reset(): void {
    this.states.clear();
    this.index.clear();
    this.moved.clear();
    this.undecided = 0;
    this.passed = 0;
    for (const level of SCENE_LEVELS) this.levels[level] = 0;
    this.minScale = Infinity;
    this.maxScale = -Infinity;
    this.started = false;
  }

  /**
   * Before a draw: checks the elements the frame (`x`, `y`, `width`, `height` and `scale` as `TSceneFrame` has them,
   * its level and policy) may show with stale lines.
   */
  public check(
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number,
    level: TSceneLevel | undefined,
    cameraAware: boolean
  ): void {
    if (this.states.size === 0) return;
    const epoch = this.startEpoch(scale, level, cameraAware);
    // Both run: the view of the check follows the frame.
    const walk = this.moveView(x, y, width, height, scale) || epoch;
    const reachable =
      (level === undefined || this.levels[level] > 0) && scale >= this.minScale && scale < this.maxScale;
    // `visit` may refresh, which never changes the index (`ICameraTextHost.refresh`). The WebGL backend's refresh
    // re-encodes the element's glyphs from the primitives it tracked them with: the same camera-aware texts, so
    // `track` finds the same reach and returns, and nothing on that path forgets or moves an element.
    if (reachable && walk && this.undecided > 0) this.index.visitIn(this.view, this.visit);
    if (this.moved.size > 0) {
      // Unreachable: what moved cannot show in this epoch, and a new epoch walks its view.
      if (reachable) this.moved.forEach(this.visit);
      this.moved.clear();
    }
  }

  /** Starts an epoch when the frame's scale, level or policy are not the current epoch's; returns whether it did. */
  private startEpoch(scale: number, level: TSceneLevel | undefined, cameraAware: boolean): boolean {
    if (this.started && this.scale === scale && this.level === level && this.cameraAware === cameraAware) return false;
    this.started = true;
    this.scale = scale;
    this.level = level;
    this.cameraAware = cameraAware;
    this.epoch++;
    this.undecided = this.states.size;
    this.passed = 0;
    return true;
  }

  /** Puts the frame's world rect into `view`; returns whether it moved. */
  private moveView(x: number, y: number, width: number, height: number, scale: number): boolean {
    const view = this.view;
    const minX = -x / scale;
    const minY = -y / scale;
    const maxX = (width - x) / scale;
    const maxY = (height - y) / scale;
    if (minX === view.minX && minY === view.minY && maxX === view.maxX && maxY === view.maxY) return false;
    view.minX = minX;
    view.minY = minY;
    view.maxX = maxX;
    view.maxY = maxY;
    return true;
  }

  /**
   * Decides an element in the current epoch when it is in the view and drawn: shown (refreshed) or passed. One out of
   * the view or not drawn stays undecided.
   */
  private readonly visit = (id: string): void => {
    const state = this.states.get(id);
    if (!state || state.decided === this.epoch) return;
    const view = this.view;
    const inView =
      state.maxX >= view.minX && state.minX <= view.maxX && state.maxY >= view.minY && state.minY <= view.maxY;
    if (!inView || !this.host.isDrawn(id)) return;
    state.decided = this.epoch;
    this.undecided--;
    state.shown = this.host.showsTexts(id, this.scale, this.level);
    if (!state.shown) {
      this.passed++;
      return;
    }
    this.host.refresh(id);
  };

  /** Counts an element's reach into `levels` and the scale bounds (`by` 1), or out of the levels (-1). */
  private countReach(reach: TTextReach, by: number): void {
    for (const { level } of LEVEL_BITS) {
      if (isOnLevel(reach.levelMask, level)) this.levels[level] += by;
    }
    if (by > 0) {
      this.minScale = Math.min(this.minScale, reach.minScale);
      this.maxScale = Math.max(this.maxScale, reach.maxScale);
    }
  }

  /** Makes an element decided in this epoch undecided again. */
  private undecide(state: TTextState): void {
    if (!state.shown) this.passed--;
    state.decided = -1;
    state.shown = false;
    this.undecided++;
  }
}
