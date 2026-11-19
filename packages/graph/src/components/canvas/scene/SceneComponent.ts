import { computed, signal, untracked } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { TComponentState } from "../../../lib/Component";
import type { CoreComponent, TComponentMode } from "../../../lib/CoreComponent";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import type { SceneStore } from "../../../lib/scene/SceneStore";
import { EMPTY_BOUNDS, elementBounds } from "../../../lib/scene/elementBounds";
import { isOnLevel, levelMaskOfPrimitives } from "../../../lib/scene/levels";
import type { TSceneElement, TScenePrimitive } from "../../../lib/scene/types";
import type { HitBoxData } from "../../../services/HitTest";
import type { ISceneKeyed, TSceneKey } from "../../../services/scene/sceneKey";
import type { ITextMeasurer, TSceneElementView, TSceneLevel } from "../../../services/scene/types";
import type { TStyleTarget } from "../../../services/styles/types";
import { entityKey } from "../../../services/tags/TagStore";
import { HAS_NODE_ENV } from "../../../utils/development";
import { measureText } from "../../../utils/functions/text";
import { track } from "../../../utils/functions/track";
import type { TPoint, TRect } from "../../../utils/types/shapes";
import { GraphComponent } from "../GraphComponent";
import type { GraphComponentContext, TGraphComponentProps } from "../GraphComponent";

import {
  checkLookLessHitBox,
  checkScenePrimitives,
  encodeLevelsWithDiagnostics,
  reportElementIdConflict,
  reportMissingParent,
  reportMissingSuper,
} from "./utils/diagnostics";
import { declaredHitMask, encodeLevels } from "./utils/encodeLevels";
import { samePrimitives, sameView } from "./utils/viewData";

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

/** The output of an element without primitives, and of one whose level methods never ran without an error. */
const EMPTY_LEVELS: TLevelOutput = Object.freeze({
  primitives: Object.freeze([] as TScenePrimitive[]),
  bounds: EMPTY_BOUNDS,
});

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
  start(): number | undefined {
    return this.enabled ? performance.now() : undefined;
  },
  reset(): void {
    this.levelMs = 0;
    this.writeMs = 0;
    this.levelRuns = 0;
    this.writes = 0;
  },
};

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
 *
 * A scene component returned from another one's `updateChildren()` is a sub-component: by default it is nested in its
 * parent's element, at its parent's origin, and is hit where it draws.
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

  /**
   * The levels on which the hit test finds components of this class, whatever shows them (spec §9, D4). Without a
   * declaration: an element owner on every level; a sub-component with a look on the levels its primitives are on, and
   * on every level while it or a scene component above it is shown outside the scene; a look-less sub-component on
   * none (declare where the look it stands for is shown). A sub-component of a hidden one takes no hits at all,
   * declared or not, as in the DOM (`isHitBarrier`).
   */
  public static hitLevels?: readonly TSceneLevel[];

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

  /** The hit box last set from `getHitRect` (removed again when it returns none); undefined while none is set. */
  private lastHitRect?: TRect;

  /** A sub-component's own levels as a hit mask: those of its primitives, 0 without any (`levelMaskOfPrimitives`). */
  private hitMask = 0;

  /**
   * Whether its last write was, or tried to be, a child element. A child whose add failed (its parent element is
   * missing, or its id is taken) has no written element, and is still no element owner (`isHitOnLevel`).
   */
  private writesChild = false;

  /** Whether a hit box was set (`setHitBox`, from `getHitRect` or by hand) and not removed since. */
  private declare hasHitBox?: boolean;

  /** The hit barrier (`isHitBarrier`) at the last write; undefined before the first. */
  private syncedBarrier?: boolean;

  /** How many times its element was added: after the first, its scene children write theirs again. */
  private adds = 0;

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

  /**
   * The element's origin in world units; tracked, and read again after new props. A sub-component (a scene component
   * returned from another one's `updateChildren()`) draws at its parent's origin by default, so its primitives are in
   * its parent's frame; any other component at the world origin.
   */
  protected getSceneOrigin(): TPoint {
    const parent = this.getParent();
    return parent instanceof SceneComponent ? parent.readSceneOrigin() : { x: 0, y: 0 };
  }

  /** The element's zIndex bucket; tracked, and read again after new props. Ignored for a child element. */
  protected getSceneZIndex(): number {
    return 0;
  }

  /**
   * The parent element of a child element; read in the update, so a change must call performRender(). By default a
   * sub-component is nested in its parent's element (an owner's or another child's), ordered by its place among the
   * parent's retained children; the store derives its draw order from the whole nesting. Return undefined for an
   * element of its own.
   */
  protected getSceneParent(): TSceneParent | undefined {
    const parent = this.getParent();
    if (!(parent instanceof SceneComponent)) return undefined;
    return { elementId: parent.getSceneElementId(), order: this.renderOrder };
  }

  /**
   * The hit box a write sets, from the element's bounds in world units (its origin applied; undefined without
   * primitives). By default a sub-component's bounds, so a child is hit where it draws; none for an element owner,
   * which sets its own hit box (`setHitBox`, as `Block` does), and none without primitives. Override it for another
   * shape or a look-less child, or return undefined to set the hit box yourself (as `Anchor` does).
   */
  protected getHitRect(bounds: TTileRect | undefined): TRect | undefined {
    if (!bounds || this.written?.parent === undefined) return undefined;
    return { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
  }

  /**
   * Reads the view data of its child scene components again in their next update, for inputs of theirs that are not
   * signals (a field of this component they read). What they read through `readSceneView()` is tracked already.
   */
  protected invalidateChildren(): void {
    for (const child of this.getChildComponents()) {
      if (child instanceof SceneComponent) child.invalidate();
    }
  }

  /**
   * Whether the element is hidden for a reason of its own, delegation aside: by default `setVisibility(false, …)`; an
   * override adds its reasons (`Block` adds its group's `setHiddenBlock`). The scene also hides the element while its
   * drawing is delegated (`isRenderDelegated`), and this is the hit barrier (`isHitBarrier`): no sub-component under it
   * takes hits. Read in the update, so a change must call performRender().
   */
  protected isSceneHidden(): boolean {
    return super.isHiddenForOtherReason();
  }

  /** Hidden for a reason other than delegation: `isSceneHidden()`, with the reasons subclasses add there. */
  public override isHiddenForOtherReason(): boolean {
    return this.isSceneHidden();
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

  /** @internal The written element as a read-only view; undefined before. */
  public getSceneElementView(): TSceneElementView | undefined {
    return this.written ? this.context.graph.scene.store.get(this.getSceneElementId()) : undefined;
  }

  /** @internal This component's view data, tracked: a child's view data may carry its parent's (spec V6b). */
  public readSceneView(): TView | undefined {
    return this.sceneView?.value;
  }

  /**
   * @internal The element origin as this component's update reads it; tracked inside a computed, so a sub-component
   * that draws at this origin follows its moves.
   */
  public readSceneOrigin(): TPoint {
    const trigger = this.sceneTrigger?.value;
    return trigger ? { x: trigger.x, y: trigger.y } : this.getSceneOrigin();
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

  /** Whether the hit test finds this component on a level (`static hitLevels`, spec §9, D4). */
  public isHitOnLevel(level: TSceneLevel): boolean {
    const declared = declaredHitMask(this.constructor as typeof SceneComponent);
    // An element owner: every level without a declaration, as every graph component.
    if (!this.writesChild) return declared === undefined || isOnLevel(declared, level);
    // The cheap rejections first, before the walks up the nesting. A look-less sub-component without a declaration is
    // not hit (settled item 10); a declaration that omits the level is authoritative.
    if (declared === undefined ? this.hitMask === 0 : !isOnLevel(declared, level)) return false;
    const showing = this.hitShowing();
    // Hidden itself or above, for a reason other than delegation: no hits in the subtree (user ruling, as in the DOM).
    if (showing === "hidden") return false;
    const shownOutside = showing === "outside";
    if (declared === undefined && !shownOutside && !isOnLevel(this.hitMask, level)) return false;
    return shownOutside || !this.isChildDrawnHidden();
  }

  /** Not hit on a level it is not hit on (`isHitOnLevel`); otherwise as every graph component. */
  public override onHitBox(data: HitBoxData): boolean {
    if (!this.isHitOnLevel(this.context.graph.scene.$level.peek())) return false;
    return super.onHitBox(data);
  }

  /** Sets the hit box as every graph component; development builds check a look-less child's declaration. */
  public override setHitBox(minX: number, minY: number, maxX: number, maxY: number, force?: boolean): void {
    super.setHitBox(minX, minY, maxX, maxY, force);
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production") {
      this.hasHitBox = true;
      checkLookLessHitBox(this.constructor as typeof SceneComponent, this.written, true);
    }
  }

  public override removeHitBox(): void {
    super.removeHitBox();
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production") this.hasHitBox = false;
  }

  /**
   * Whether something outside the scene shows this component now (D4): it and its sub-components are then hit on
   * every level, drawn in the scene or not, unless one of them is hidden for another reason (`isHitBarrier`). By
   * default while its drawing is delegated (`setRenderDelegated`); `Block` adds an HTML view's hold.
   */
  public isShownOutsideScene(): boolean {
    return this.isRenderDelegated();
  }

  /**
   * Whether this component is a hit barrier (user ruling on D4, as `display: none` in the DOM): every sub-component
   * under it, and it too when it is a sub-component, takes no hits, on any level, under an owner shown outside the
   * scene too and whatever they declare. An element owner (a block) is hit, on the levels its `hitLevels` allow, as long
   * as it keeps its hit box: hiding it with `setVisibility(false, { removeHitbox: true })` or a collapsed group removes
   * the box, `removeHitbox: false` keeps it. By default a barrier while it is hidden for a reason other than delegation
   * (`isHiddenForOtherReason`), whether or not it is shown outside the scene; delegation alone is no barrier.
   */
  protected isHitBarrier(): boolean {
    return this.isHiddenForOtherReason();
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
        reportHookError(this.constructor.name, "getViewData()", "the level methods keep the last view data", error);
        return lastView;
      }
      if (lastView !== undefined && sameView(lastView, next)) return lastView;
      lastView = HAS_NODE_ENV && process.env.NODE_ENV !== "production" ? Object.freeze(next) : next;
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
      if (HAS_NODE_ENV && process.env.NODE_ENV !== "production") reportMissingSuper(this.constructor.name);
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
      // The store deletes the element's child elements with it.
      if (store.writerOf(id) === this) {
        store.delete(id);
      }
    }
    this.written = undefined;
    this.syncedTrigger = undefined;
    this.sceneKey = undefined;
    super.unmount();
  }

  /**
   * Whether the inputs the update reads untracked still match the last write: the hidden state, the hit barrier and
   * the parent. A child element also has to be in the store still: its parent's element, added again, takes it along.
   */
  private writtenPlaceHolds(written: TWritten): boolean {
    if (this.isWrittenHidden() !== written.hidden || this.isHitBarrier() !== this.syncedBarrier) return false;
    const parent = this.getSceneParent();
    if (parent?.elementId !== written.parent || (parent?.order ?? 0) !== written.childOrder) return false;
    return written.parent === undefined || this.context.graph.scene.store.get(this.getSceneElementId()) !== undefined;
  }

  /** The element's hidden flag: hidden for a reason of its own (`isSceneHidden`) or delegated. */
  private isWrittenHidden(): boolean {
    return this.isRenderDelegated() || this.isSceneHidden();
  }

  /**
   * Notes the hit barrier at a write; a change after the first asks GraphLayer to find the target again. The written
   * hidden flag can stay (a delegated component that another input hides), and `isSceneHidden` overrides read inputs
   * of their own, so the barrier itself is compared. The first write asks nothing, as a first hit box.
   */
  private syncHitBarrier(): void {
    const barrier = this.isHitBarrier();
    if (this.syncedBarrier !== undefined && barrier !== this.syncedBarrier) this.requestRetarget();
    this.syncedBarrier = barrier;
  }

  /** Sets the hit box from `getHitRect` after a write that moved or reshaped the element. */
  private syncHitRect(next: TWritten): void {
    const bounds =
      next.primitives.length === 0
        ? undefined
        : {
            minX: next.x + next.bounds.minX,
            minY: next.y + next.bounds.minY,
            maxX: next.x + next.bounds.maxX,
            maxY: next.y + next.bounds.maxY,
          };
    const rect = this.getHitRect(bounds);
    const last = this.lastHitRect;
    const same =
      rect === undefined
        ? last === undefined
        : last !== undefined &&
          rect.x === last.x &&
          rect.y === last.y &&
          rect.width === last.width &&
          rect.height === last.height;
    if (same) return;
    this.lastHitRect = rect;
    // A look that goes, comes back, moves or changes size changes what a still pointer hits (re-review 5):
    // `setHitBox` and `removeHitBox` ask GraphLayer to find the target again (`GraphComponent.requestRetarget`).
    if (rect) this.setHitBox(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    else if (last) this.removeHitBox();
  }

  /**
   * Writes a sub-component's hit mask after a write (none written: 0); a later change asks GraphLayer to find the
   * target again. The first add only sets it (`initial`): a component that mounts under a still pointer is found at the
   * next pointer move, and the anchors a camera move creates lazily must not turn that move into a retarget (settled
   * item 11).
   */
  private syncHitMask(written: TWritten | undefined, initial = false): void {
    const mask = written?.parent === undefined ? 0 : levelMaskOfPrimitives(written.primitives);
    if (mask === this.hitMask) return;
    this.hitMask = mask;
    if (!initial) this.requestRetarget();
  }

  /**
   * How this sub-component's nesting shows it now: "hidden" when it or a scene component above it is a hit barrier
   * (`isHitBarrier`), whatever is shown outside the scene; else "outside" when it or one above is shown outside the
   * scene; else "scene".
   */
  private hitShowing(): "hidden" | "outside" | "scene" {
    // `this` on its own: its generic type is not assignable to `CoreComponent` (a narrower `setContext`).
    if (this.isHitBarrier()) return "hidden";
    let outside = this.isShownOutsideScene();
    let node: CoreComponent | undefined = this.getParent();
    while (node instanceof SceneComponent) {
      // The walk goes on past a node shown outside: a hidden one above it still hides the whole subtree.
      if (node.isHitBarrier()) return "hidden";
      if (!outside) outside = node.isShownOutsideScene();
      node = node.getParent();
    }
    return outside ? "outside" : "scene";
  }

  /**
   * Whether the scene does not draw this sub-component's element: not in the store (its add failed, or it was deleted
   * with its parent's and not written again yet), or hidden itself or up its nesting.
   */
  private isChildDrawnHidden(): boolean {
    const { store } = this.context.graph.scene;
    const element = this.written === undefined ? undefined : store.get(this.getSceneElementId());
    return element === undefined || store.isDrawnHidden(element as TSceneElement);
  }

  /** After its element was added again (what was nested in it went with the old one): its children write again. */
  private rewriteChildren(): void {
    for (const child of this.getChildComponents()) {
      if (child instanceof SceneComponent) child.performRender();
    }
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
    const start = HAS_NODE_ENV && process.env.NODE_ENV !== "production" ? sceneComponentStats.start() : undefined;
    let output: TLevelOutput;
    try {
      const methods = {
        minimalistic: this.minimalistic?.bind(this),
        schematic: this.schematic?.bind(this),
        detailed: this.detailed?.bind(this),
      };
      const primitives =
        HAS_NODE_ENV && process.env.NODE_ENV !== "production"
          ? encodeLevelsWithDiagnostics(this.constructor.name, methods, view)
          : encodeLevels(methods, view);
      const previous = this.lastLevels;
      output =
        previous && samePrimitives(previous.primitives, primitives)
          ? previous
          : { primitives, bounds: primitives.length ? elementBounds(primitives) : EMPTY_BOUNDS };
    } catch (error) {
      // Its origin, bucket and hidden state still update; the next view change or invalidate() runs them again.
      reportHookError(this.constructor.name, "a level method", "the scene element keeps its last primitives", error);
      output = this.lastLevels ?? EMPTY_LEVELS;
    }
    this.lastLevels = output;
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production" && start !== undefined) {
      sceneComponentStats.levelMs += performance.now() - start;
      sceneComponentStats.levelRuns++;
    }
    return output;
  }

  private syncSceneElement(trigger: TSceneTrigger<TView>, levels: TLevelOutput): void {
    const start = HAS_NODE_ENV && process.env.NODE_ENV !== "production" ? sceneComponentStats.start() : undefined;
    const store = this.context.graph.scene.store;
    const id = this.getSceneElementId();
    const parent = this.getSceneParent();
    const next: TWritten = {
      primitives: levels.primitives,
      bounds: levels.bounds,
      x: trigger.x,
      y: trigger.y,
      zIndex: trigger.zIndex,
      hidden: this.isWrittenHidden(),
      parent: parent?.elementId,
      childOrder: parent?.order ?? 0,
    };
    const written = this.written;
    // Before the write: a child whose add fails is still no element owner (`isHitOnLevel`).
    this.writesChild = next.parent !== undefined;
    // Before any early return: the barrier can change while the element stays as written (a delegated one hidden by
    // another input).
    this.syncHitBarrier();
    if (written && store.get(id) && written.parent === next.parent) {
      const patch = elementPatch(written, next);
      if (!patch) return;
      if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
        checkScenePrimitives(this.constructor.name, patch.primitives);
      store.update(id, patch);
      this.written = next;
      if (patch.childOrder !== undefined) this.sceneKey = { elementId: id, sub: 0 };
      const geometry =
        patch.x !== undefined || patch.y !== undefined || patch.bounds !== undefined || patch.primitives !== undefined;
      if (geometry) this.syncHitRect(next);
      if (patch.primitives !== undefined) {
        this.syncHitMask(next);
        if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
          checkLookLessHitBox(this.constructor as typeof SceneComponent, next, this.hasHitBox);
      }
    } else if (!this.addSceneElement(store, id, next)) {
      // Nothing written: no look of its own is hit.
      this.syncHitMask(undefined);
      return;
    }
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production" && start !== undefined) {
      sceneComponentStats.writeMs += performance.now() - start;
      sceneComponentStats.writes++;
    }
  }

  /**
   * Adds the element, or adds it again under a new parent. Returns false without writing when another component owns
   * the id (a development error names both classes) or the parent element is missing.
   */
  private addSceneElement(store: SceneStore, id: string, next: TWritten): boolean {
    if (store.get(id)) {
      const holder = store.writerOf(id);
      if (holder !== this) {
        this.written = undefined;
        this.sceneKey = undefined;
        if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
          reportElementIdConflict(this.constructor.name, id, holder);
        return false;
      }
      store.delete(id);
    }
    this.written = undefined;
    this.sceneKey = undefined;
    if (next.parent !== undefined && !store.get(next.parent)) {
      reportMissingParent(this.constructor.name, next.parent);
      return false;
    }
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
      checkScenePrimitives(this.constructor.name, next.primitives);
    store.add(
      {
        id,
        // The type is the class's, whatever the id (`createSceneElementId` may be overridden).
        entityType: (this.constructor as typeof SceneComponent).entityType,
        primitives: next.primitives,
        bounds: next.bounds,
        x: next.x,
        y: next.y,
        zIndex: next.zIndex,
        hidden: next.hidden,
        parent: next.parent,
        childOrder: next.childOrder,
      },
      this
    );
    this.written = next;
    this.syncHitMask(next, this.adds === 0);
    this.sceneKey = { elementId: id, sub: 0 };
    this.bindSceneStyle(id);
    this.syncHitRect(next);
    // A hit box set before the first write (by hand, as `Anchor` does) is checked once the look is known.
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
      checkLookLessHitBox(this.constructor as typeof SceneComponent, next, this.hasHitBox);
    if (this.adds++ > 0) this.rewriteChildren();
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
