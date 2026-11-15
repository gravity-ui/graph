import { computed, signal, untracked } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { TComponentState } from "../../../lib/Component";
import type { TComponentMode } from "../../../lib/CoreComponent";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import { isDevelopmentBuild } from "../../../lib/detachedWarning";
import type { SceneStore } from "../../../lib/scene/SceneStore";
import { EMPTY_BOUNDS, elementBounds } from "../../../lib/scene/elementBounds";
import { runLevelMethods } from "../../../lib/scene/purity";
import type { TSceneElement, TScenePrimitive, TSceneSize } from "../../../lib/scene/types";
import type { ISceneKeyed, TSceneKey } from "../../../services/scene/sceneKey";
import type { ITextMeasurer, TSceneElementView } from "../../../services/scene/types";
import type { TStyleTarget } from "../../../services/styles/types";
import { entityKey } from "../../../services/tags/TagStore";
import { measureText } from "../../../utils/functions/text";
import type { TPoint } from "../../../utils/types/shapes";
import { GraphComponent } from "../GraphComponent";
import type { GraphComponentContext, TGraphComponentProps } from "../GraphComponent";

import { encodeLevels } from "./encodeLevels";
import { freezeView, samePrimitives, sameView } from "./viewData";

/** The parent element of a child element and the child's place among its siblings (spec §5.2). */
export type TSceneParent = { readonly elementId: string; readonly order: number };

type TLevelOutput = { readonly primitives: readonly TScenePrimitive[]; readonly bounds: TTileRect };
/** Where the element is drawn: its origin and its bucket. */
type TScenePlace = { readonly x: number; readonly y: number; readonly zIndex: number };
/** The inputs that schedule the queued update; `view` is undefined while view data never read without an error. */
type TSceneTrigger<TView> = TScenePlace & {
  readonly view: TView | undefined;
  readonly invalidation: number;
};
type TWritten = TLevelOutput & {
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
  readonly hidden: boolean;
  readonly parent?: string;
  readonly childOrder: number;
};
type TElementPatch = Partial<
  Pick<TSceneElement, "x" | "y" | "bounds" | "primitives" | "hidden" | "zIndex" | "childOrder">
>;

let anonymousElements = 0;
const reported = new Set<string>();

/** The output of an element without primitives, and of one whose level methods never ran without an error. */
const EMPTY_LEVELS: TLevelOutput = Object.freeze({
  primitives: Object.freeze([] as TScenePrimitive[]),
  bounds: EMPTY_BOUNDS,
});

/** The component that added each element, per store: an element id is never taken over from another component. */
const elementOwners = new WeakMap<SceneStore, Map<string, object>>();

function ownersOf(store: SceneStore): Map<string, object> {
  let owners = elementOwners.get(store);
  if (!owners) {
    owners = new Map();
    elementOwners.set(store, owners);
  }
  return owners;
}

/**
 * Reports an exception of a component hook in every build. Scene computeds never hold an exception: a held one would
 * be thrown again by every later update of the component, and each throw stops the frame before the scene paints.
 */
function reportHookError(owner: string, hook: string, outcome: string, error: unknown): void {
  console.error(`${owner}: ${hook} threw; ${outcome}`, error);
}

function sameBounds(a: TTileRect, b: TTileRect): boolean {
  return a === b || (a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY);
}

/**
 * @internal Bench counters (review I2): the time scene components spend running level methods (merge and bounds
 * included) and writing elements (`store.add`, `bindStyle`, `store.update`). Off by default.
 */
export const sceneComponentStats = {
  enabled: false,
  levelMs: 0,
  writeMs: 0,
  levelRuns: 0,
  writes: 0,
  reset(): void {
    this.levelMs = 0;
    this.writeMs = 0;
    this.levelRuns = 0;
    this.writes = 0;
  },
};

/** Reads a signal so the surrounding computed tracks it. */
function track(source: ReadonlySignal<unknown>): unknown {
  return source.value;
}

/** A development message once per class and kind. */
function reportOnce(owner: string, kind: string, message: string, level: "warn" | "error"): void {
  const key = `${owner}\u0000${kind}`;
  if (reported.has(key)) return;
  reported.add(key);
  if (level === "error") console.error(message);
  else console.warn(message);
}

function isUnboundedPx(size: TSceneSize | undefined): boolean {
  return typeof size === "object" && "px" in size && size.maxWorld === undefined;
}

/** The camera-aware stroke width of a primitive. */
function strokeWidthOf(primitive: TScenePrimitive): TSceneSize | undefined {
  switch (primitive.kind) {
    case "rect":
    case "circle":
      return primitive.border?.width;
    case "path":
      return primitive.stroke.width;
    case "polygon":
      return primitive.stroke?.width;
    default:
      return undefined;
  }
}

/**
 * Whether a primitive's bounds take its size at the minimum camera scale: a `{ px }` stroke width without `maxWorld`,
 * or a heightless camera-aware text without `maxWorld` (a text with a height is clipped to its box, which bounds it).
 */
function hasUnboundedSize(primitive: TScenePrimitive): boolean {
  if (primitive.kind === "text") {
    const mode = primitive.cameraAware;
    const unbounded = mode === true || (typeof mode === "object" && mode.maxWorld === undefined);
    return unbounded && primitive.height === undefined;
  }
  return isUnboundedPx(strokeWidthOf(primitive));
}

/**
 * Development checks of an element's primitives (spec §3.2, review M1). The primitive count has no limit of its own:
 * the depth's sub-order width follows the widest element (`watchSceneLimits` names the scene that outgrows the depth).
 */
function checkScenePrimitives(owner: string, primitives: readonly TScenePrimitive[]): void {
  if (primitives.some((primitive) => primitive.part === "none")) {
    reportOnce(owner, "none", `${owner}: the part name "none" is reserved for primitives without a part`, "error");
  }
  if (primitives.some(hasUnboundedSize)) {
    reportOnce(
      owner,
      "px",
      `${owner}: a stroke width { px } without maxWorld, or a camera-aware text without a height and without ` +
        "maxWorld; its bounds take its size at the minimum camera scale",
      "warn"
    );
  }
}

/** The fields of a written element that the next write changes; undefined when it changes none. */
function elementPatch(written: TWritten, next: TWritten): TElementPatch | undefined {
  const patch: TElementPatch = {};
  if (written.x !== next.x) patch.x = next.x;
  if (written.y !== next.y) patch.y = next.y;
  if (!sameBounds(written.bounds, next.bounds)) patch.bounds = next.bounds;
  if (written.primitives !== next.primitives) patch.primitives = next.primitives;
  if (written.zIndex !== next.zIndex) patch.zIndex = next.zIndex;
  if (written.hidden !== next.hidden) patch.hidden = next.hidden;
  if (written.childOrder !== next.childOrder) patch.childOrder = next.childOrder;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/**
 * A component drawn by the scene (spec §5.1). It owns one scene element, or one child element of its parent's (spec
 * §5.2): level methods describe its look as primitives, view data says when they run again, and a style row from its
 * entity's tags paints its parts. It is retained: the frame walk never visits it, and its element changes in its queued
 * update when an input changes.
 */
export abstract class SceneComponent<
    TView extends object = object,
    Props extends TGraphComponentProps = TGraphComponentProps,
    State extends TComponentState = TComponentState,
    Context extends GraphComponentContext = GraphComponentContext,
  >
  extends GraphComponent<Props, State, Context>
  implements ISceneKeyed, ITextMeasurer
{
  /** Retained by default; an immediate subclass is walked and its `render()` draws on its layer's canvas. */
  public static override readonly mode: TComponentMode = "retained";

  /** Tag address of the element owner ("block", "anchor", a layer's type); also the prefix of its element id. */
  public static entityType?: string;

  private readonly invalidation = signal(0);

  /** Bumped after new props are assigned: view data, origin and bucket read from props are read again. */
  private readonly propsVersion = signal(0);

  /** Set by propsChanged(); checkData() bumps `propsVersion` once the new props are assigned. */
  private propsPending = false;

  /** While this component's own update bumps `propsVersion`: the update writes the element itself, nothing to queue. */
  private applyingProps = false;

  private sceneView?: ReadonlySignal<TView | undefined>;

  private sceneLevels?: ReadonlySignal<TLevelOutput>;

  private sceneTrigger?: ReadonlySignal<TSceneTrigger<TView>>;

  private lastLevels?: TLevelOutput;

  private written?: TWritten;

  /**
   * Whether the frame walks this component (`static override readonly mode = "immediate";`): its update then runs in
   * every frame.
   */
  private walked = false;

  /** The trigger value the element was last written with: a walked component skips its update while it stays. */
  private syncedTrigger?: TSceneTrigger<TView>;

  private sceneKey?: TSceneKey;

  private elementId?: string;

  private unbindStyle?: () => void;

  private measuresText = false;

  /**
   * The inputs of the level methods; read inside a computed, so the signals it reads are tracked (spec §5.3), and read
   * again after new props and after `invalidate()`. Return a fresh object on every call: development builds freeze it
   * (its top level), so returning an object something else owns (a store's state, the props) would freeze that object.
   * A view equal to the last one by `sameView` keeps the last one, and the level methods do not run again.
   */
  protected abstract getViewData(): TView;

  protected minimalistic?(view: TView): readonly TScenePrimitive[];

  protected schematic?(view: TView): readonly TScenePrimitive[];

  protected detailed?(view: TView): readonly TScenePrimitive[];

  /** Reads the view data and runs the level methods again in the next update, for inputs that are not signals. */
  protected invalidate(): void {
    this.invalidation.value = this.invalidation.peek() + 1;
  }

  /**
   * The width of a text in a CSS font, for layout inside level methods (spec §4). The component is registered with the
   * scene: when late web fonts load, the measures are cleared and its level methods run again.
   */
  protected measureText(text: string, font: string): number {
    if (!this.measuresText) {
      this.measuresText = true;
      this.context.graph.scene.trackTextMeasure(this);
    }
    return measureText(text, font);
  }

  /** @internal Called by the scene after late web fonts. */
  public invalidateTextMeasures(): void {
    this.invalidate();
  }

  /** The element's origin in world units; tracked, and read again after new props. */
  protected getSceneOrigin(): TPoint {
    return { x: 0, y: 0 };
  }

  /** The element's zIndex bucket; tracked, and read again after new props. Ignored for a child element. */
  protected getSceneZIndex(): number {
    return 0;
  }

  /** The parent element of a child element; read in the update, so a change must call performRender(). */
  protected getSceneParent(): TSceneParent | undefined {
    return undefined;
  }

  /** Whether the element is hidden; read in the update, so a change must call performRender(). */
  protected isSceneHidden(): boolean {
    return this.hidden;
  }

  /** The class style rules match against. */
  protected getStyleTarget(): TStyleTarget {
    return this.constructor as TStyleTarget;
  }

  /** The element id: the entity key of `static entityType` and the entity id. Override it when entity ids repeat. */
  protected createSceneElementId(): string {
    const type = (this.constructor as typeof SceneComponent).entityType;
    return type === undefined ? `scene\u0000${++anonymousElements}` : entityKey(type, this.getEntityId());
  }

  public getSceneElementId(): string {
    this.elementId ??= this.createSceneElementId();
    return this.elementId;
  }

  /** `{ elementId, sub: 0 }` while the element is written: one object until the element is added again or reordered. */
  public getSceneKey(): TSceneKey | undefined {
    return this.sceneKey;
  }

  /** @internal The written element as a read-only view (the minimap draws it until 3b); undefined before. */
  public getSceneElementView(): TSceneElementView | undefined {
    return this.written ? this.context.graph.scene.store.get(this.getSceneElementId()) : undefined;
  }

  /** @internal This component's view data, tracked: a child's view data may carry its parent's (spec V6b). */
  public readSceneView(): TView | undefined {
    return this.sceneView?.value;
  }

  /** Whether the scene draws this component's element now: written, not hidden (nor its parent), in the viewport. */
  public isRendered(): boolean {
    const element = this.getSceneElementView();
    return (
      element !== undefined &&
      !this.context.graph.scene.store.isDrawnHidden(element as TSceneElement) &&
      this.isInViewport()
    );
  }

  protected propsChanged(nextProps: Props): void {
    this.propsPending = true;
    super.propsChanged(nextProps);
  }

  /**
   * After the new props are assigned, bumps `propsVersion`, so the scene computeds read them (a hook may read props).
   */
  protected checkData(): boolean {
    const updated = super.checkData();
    if (this.propsPending) {
      this.propsPending = false;
      this.applyingProps = true;
      try {
        this.propsVersion.value = this.propsVersion.peek() + 1;
      } finally {
        this.applyingProps = false;
      }
    }
    return updated;
  }

  protected willMount(): void {
    super.willMount();
    const owner = this.constructor.name;
    this.walked = (this.constructor as typeof SceneComponent).mode === "immediate";
    let lastView: TView | undefined;
    const view = computed((): TView | undefined => {
      track(this.propsVersion);
      track(this.invalidation);
      let next: TView;
      try {
        next = this.getViewData();
      } catch (error) {
        // The signals read before the throw stay tracked: a change of one of them reads the view data again.
        reportHookError(owner, "getViewData()", "the level methods keep the last view data", error);
        return lastView;
      }
      if (lastView !== undefined && sameView(lastView, next)) return lastView;
      lastView = freezeView(next);
      return lastView;
    });
    this.sceneView = view;
    // Nothing subscribes to the level output: the queued update reads it, so level methods run in the frame (I4).
    this.sceneLevels = computed((): TLevelOutput => {
      const current = view.value;
      track(this.invalidation);
      return untracked(() => (current === undefined ? this.lastLevels ?? EMPTY_LEVELS : this.runLevels(current)));
    });
    let lastTrigger: TSceneTrigger<TView> | undefined;
    const trigger = computed((): TSceneTrigger<TView> => {
      track(this.propsVersion);
      const { x, y, zIndex } = this.readScenePlace(lastTrigger);
      const next = { view: view.value, invalidation: this.invalidation.value, x, y, zIndex };
      const last = lastTrigger;
      if (
        last &&
        last.view === next.view &&
        last.invalidation === next.invalidation &&
        last.x === x &&
        last.y === y &&
        last.zIndex === zIndex
      ) {
        return last;
      }
      lastTrigger = next;
      return next;
    });
    this.sceneTrigger = trigger;
    let first = true;
    this.subscribeSignal(trigger, () => {
      // The first call comes from subscribing; during applyingProps this component's own update writes the element.
      if (first || this.applyingProps) {
        first = false;
        return;
      }
      this.performRender();
    });
  }

  protected willIterate(): void {
    super.willIterate();
    const trigger = this.sceneTrigger;
    const levels = this.sceneLevels;
    if (!trigger || !levels) {
      if (isDevelopmentBuild()) {
        const owner = this.constructor.name;
        reportOnce(
          owner,
          "willMount",
          `${owner}.willMount() did not call super.willMount(): its scene element is never written`,
          "error"
        );
      }
      return;
    }
    const current = trigger.peek();
    // A walked component runs this in every frame (4.1): while its trigger has not fired, its view, origin and bucket
    // are those of the last write, so only the inputs read in the update itself are checked.
    if (this.walked && this.written && current === this.syncedTrigger && this.writtenPlaceHolds(this.written)) return;
    this.syncSceneElement(current, levels.peek());
    this.syncedTrigger = this.written ? current : undefined;
  }

  protected unmount(): void {
    this.unbindStyle?.();
    this.unbindStyle = undefined;
    if (this.measuresText) this.context.graph.scene.untrackTextMeasure(this);
    this.measuresText = false;
    if (this.written) {
      const store = this.context.graph.scene.store;
      const id = this.getSceneElementId();
      const owners = ownersOf(store);
      // The store deletes the element's child elements with it.
      if (owners.get(id) === this) {
        owners.delete(id);
        store.delete(id);
      }
    }
    this.written = undefined;
    this.syncedTrigger = undefined;
    this.sceneKey = undefined;
    super.unmount();
  }

  /**
   * Whether the inputs the update reads untracked still match the last write: the hidden state and the parent. A child
   * element also has to be in the store still: its parent's element, added again, takes it along.
   */
  private writtenPlaceHolds(written: TWritten): boolean {
    if (this.isSceneHidden() !== written.hidden) return false;
    const parent = this.getSceneParent();
    if (parent?.elementId !== written.parent || (parent?.order ?? 0) !== written.childOrder) return false;
    return written.parent === undefined || this.context.graph.scene.store.get(this.getSceneElementId()) !== undefined;
  }

  /** The origin and the bucket; after an exception, the last ones (the origin and bucket 0 before any). */
  private readScenePlace(last: TScenePlace | undefined): TScenePlace {
    try {
      const { x, y } = this.getSceneOrigin();
      return { x, y, zIndex: this.getSceneZIndex() };
    } catch (error) {
      reportHookError(
        this.constructor.name,
        "getSceneOrigin() or getSceneZIndex()",
        "the element keeps its last place",
        error
      );
      return { x: last?.x ?? 0, y: last?.y ?? 0, zIndex: last?.zIndex ?? 0 };
    }
  }

  private runLevels(view: TView): TLevelOutput {
    const start = sceneComponentStats.enabled ? performance.now() : 0;
    const owner = this.constructor.name;
    let output: TLevelOutput;
    try {
      const primitives = runLevelMethods(owner, () =>
        encodeLevels(
          {
            minimalistic: this.minimalistic?.bind(this),
            schematic: this.schematic?.bind(this),
            detailed: this.detailed?.bind(this),
          },
          view,
          isDevelopmentBuild()
            ? (level): void =>
                reportOnce(
                  owner,
                  "levelMask",
                  `${owner}.${level}() returned a primitive with levelMask; the scene sets it from the level method`,
                  "error"
                )
            : undefined
        )
      );
      const previous = this.lastLevels;
      output =
        previous && samePrimitives(previous.primitives, primitives)
          ? previous
          : { primitives, bounds: primitives.length ? elementBounds(primitives) : EMPTY_BOUNDS };
    } catch (error) {
      // Its origin, bucket and hidden state still update; the next view change or invalidate() runs them again.
      reportHookError(owner, "a level method", "the scene element keeps its last primitives", error);
      output = this.lastLevels ?? EMPTY_LEVELS;
    }
    this.lastLevels = output;
    if (sceneComponentStats.enabled) {
      sceneComponentStats.levelMs += performance.now() - start;
      sceneComponentStats.levelRuns++;
    }
    return output;
  }

  private syncSceneElement(trigger: TSceneTrigger<TView>, levels: TLevelOutput): void {
    const start = sceneComponentStats.enabled ? performance.now() : 0;
    const store = this.context.graph.scene.store;
    const id = this.getSceneElementId();
    const parent = this.getSceneParent();
    const next: TWritten = {
      primitives: levels.primitives,
      bounds: levels.bounds,
      x: trigger.x,
      y: trigger.y,
      zIndex: trigger.zIndex,
      hidden: this.isSceneHidden(),
      parent: parent?.elementId,
      childOrder: parent?.order ?? 0,
    };
    const written = this.written;
    if (written && store.get(id) && written.parent === next.parent) {
      const patch = elementPatch(written, next);
      if (!patch) return;
      if (patch.primitives !== undefined && isDevelopmentBuild()) {
        checkScenePrimitives(this.constructor.name, next.primitives);
      }
      store.update(id, patch);
      this.written = next;
      if (patch.childOrder !== undefined) this.sceneKey = { elementId: id, sub: 0 };
    } else if (!this.addSceneElement(store, id, next)) {
      return;
    }
    if (sceneComponentStats.enabled) {
      sceneComponentStats.writeMs += performance.now() - start;
      sceneComponentStats.writes++;
    }
  }

  /**
   * Adds the element, or adds it again under a new parent. Returns false without writing when another component owns
   * the id (a development error names both classes) or the parent element is missing.
   */
  private addSceneElement(store: SceneStore, id: string, next: TWritten): boolean {
    const owner = this.constructor.name;
    const owners = ownersOf(store);
    if (store.get(id)) {
      const holder = owners.get(id);
      if (holder !== this) {
        this.written = undefined;
        this.sceneKey = undefined;
        const name = holder?.constructor.name ?? "another writer";
        if (isDevelopmentBuild()) {
          reportOnce(
            owner,
            `id\u0000${name}`,
            `${owner}: scene element ${JSON.stringify(id)} already belongs to ${name}; ${owner} does not write it. ` +
              "Give each component its own element id (override createSceneElementId() when entity ids repeat).",
            "error"
          );
        }
        return false;
      }
      store.delete(id);
      owners.delete(id);
    }
    this.written = undefined;
    this.sceneKey = undefined;
    if (next.parent !== undefined && !store.get(next.parent)) {
      reportOnce(owner, "parent", `${owner}: its parent element ${next.parent} is not in the scene`, "error");
      return false;
    }
    if (isDevelopmentBuild()) checkScenePrimitives(owner, next.primitives);
    store.add({
      id,
      primitives: next.primitives,
      bounds: next.bounds,
      x: next.x,
      y: next.y,
      zIndex: next.zIndex,
      hidden: next.hidden,
      parent: next.parent,
      childOrder: next.childOrder,
    });
    owners.set(id, this);
    this.written = next;
    this.sceneKey = { elementId: id, sub: 0 };
    this.bindSceneStyle(id);
    return true;
  }

  private bindSceneStyle(id: string): void {
    const type = (this.constructor as typeof SceneComponent).entityType;
    if (type === undefined) return;
    this.unbindStyle?.();
    // After store.add: adding an element resets its style row (plan 2).
    this.unbindStyle = this.context.graph.scene.bindStyle(id, { type, id: this.getEntityId() }, this.getStyleTarget());
  }
}
