import { computed, signal, untracked } from "@preact/signals-core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";

import type { TComponentState } from "../../../lib/Component";
import type { CoreComponent, TComponentMode } from "../../../lib/CoreComponent";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import { isOnLevel, levelMaskOfPrimitives } from "../../../lib/scene/levels";
import type { TSceneElement, TScenePrimitive, TSceneStyle } from "../../../lib/scene/types";
import { EMPTY_BOUNDS, elementBounds } from "../../../lib/scene/utils/elementBounds";
import type { HitBoxData } from "../../../services/HitTest";
import type { ISceneKeyed, TSceneKey } from "../../../services/scene/sceneKey";
import type { ITextMeasurer, TSceneElementView, TSceneLevel } from "../../../services/scene/types";
import type { TSceneStyles, TStyleTarget } from "../../../services/styles/types";
import { entityKey } from "../../../services/tags/TagStore";
import { HAS_NODE_ENV } from "../../../utils/development";
import { measureText } from "../../../utils/functions/text";
import { track } from "../../../utils/functions/track";
import type { TPoint, TRect } from "../../../utils/types/shapes";
import { GraphComponent } from "../GraphComponent";
import type { GraphComponentContext, TGraphComponentProps } from "../GraphComponent";

import { SceneElementWriter } from "./SceneElementWriter";
import {
  checkLookLessHitBox,
  checkScenePrimitives,
  encodeLevelsWithDiagnostics,
  reportElementIdConflict,
  reportMissingParent,
  reportMissingSuper,
} from "./utils/diagnostics";
import { declaredHitMask, encodeLevels } from "./utils/encodeLevels";
import { samePrimitives } from "./utils/sceneEquality";

/** The parent element of a child element and the child's place among its siblings (spec §5.2). */
export type TSceneParent = { readonly elementId: string; readonly order: number };

type TLevelOutput = { readonly primitives: readonly TScenePrimitive[]; readonly bounds: TTileRect };
/** Where the element is drawn: its origin and its bucket. */
type TScenePlace = { readonly x: number; readonly y: number; readonly zIndex: number };
type TWritten = TLevelOutput & {
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
  readonly hidden: boolean;
  readonly parent?: string;
  readonly childOrder: number;
};
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

/**
 * A component drawn by the scene (spec §5.1). It owns one scene element, or one child element of its parent's (spec
 * §5.2): level methods describe its look as primitives from the applied component data, and a style row from its
 * entity's tags paints its parts. It is retained: the frame walk never visits it, and its element changes in its queued
 * update when an input changes.
 *
 * A scene component returned from another one's `updateChildren()` is a sub-component: by default it is nested in its
 * parent's element, at its parent's origin, and is hit where it draws.
 */
export abstract class SceneComponent<
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
   * Declares this class's own scene style rules. The scene adds the class target and collects ancestor rules.
   * Annotate an override with `TSceneStyles<typeof this>` to check the class's part names.
   */
  public static getSceneStyles(): TSceneStyles {
    return [];
  }

  /**
   * The levels on which the hit test finds components of this class, whatever shows them (spec §9, D4). Without a
   * declaration: an element owner on every level; a sub-component with a look on the levels its primitives are on, and
   * on every level while it or a scene component above it is shown outside the scene; a look-less sub-component on
   * none (declare where the look it stands for is shown). A sub-component of a hidden one takes no hits at all,
   * declared or not, as in the DOM (`isHitBarrier`).
   */
  public static hitLevels?: readonly TSceneLevel[];

  /** Placement hooks can read both ordinary component fields and external signals (e.g. a delegated port). */
  private placementRevision?: Signal<number>;
  private placementPending = false;
  private levelsPending = true;

  private scenePlace?: ReadonlySignal<TScenePlace>;
  private appliedPlace?: TScenePlace;

  private lastLevels?: TLevelOutput;

  private written?: TSceneElement;

  /**
   * Whether the frame walks this component (`static override readonly mode = "immediate";`): its update then runs in
   * every frame.
   */
  private walked = false;

  private writer?: SceneElementWriter;

  private elementId?: string;

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

  /** @internal Connections publish prepared world-space routes and keep their Canvas children independent. */
  protected usesSceneLevels(): boolean {
    return true;
  }

  /** Receives the resolved style of this element, including later changes to its parts. */
  protected onSceneStyleChange?(style: TSceneStyle): void;

  /** Called with the upcoming data while this.props/state/context still hold the current values. */
  protected shouldUpdateScene(_nextProps: Props, _nextState: State, _nextContext: Context): boolean {
    return true;
  }

  protected minimalistic?(): readonly TScenePrimitive[];

  protected schematic?(): readonly TScenePrimitive[];

  protected detailed?(): readonly TScenePrimitive[];

  /** Rebuilds the primitives in the next component update, including when the data is unchanged (e.g. late fonts). */
  protected invalidate(): void {
    this.placementPending = true;
    this.levelsPending = true;
    this.performRender();
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
    return parent instanceof SceneComponent && parent.usesSceneLevels() ? parent.readSceneOrigin() : { x: 0, y: 0 };
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
    if (!(parent instanceof SceneComponent) || !parent.usesSceneLevels()) return undefined;
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

  /** Rebuilds child scene components that depend on a plain field outside their own lifecycle. */
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

  protected getSceneEntityType(): string | undefined {
    return (this.constructor as typeof SceneComponent).entityType;
  }

  /** The element id: the entity key of `static entityType` and the entity id. Override it when entity ids repeat. */
  protected createSceneElementId(): string {
    const type = this.getSceneEntityType();
    return type === undefined ? `scene\u0000${++anonymousElements}` : entityKey(type, this.getEntityId());
  }

  public getSceneElementId(): string {
    this.elementId ??= this.createSceneElementId();
    return this.elementId;
  }

  /** `{ elementId, sub: 0 }` while the element is written: one object until the element is added again or reordered. */
  public getSceneKey(): TSceneKey | undefined {
    return this.writer?.key;
  }

  /** @internal The written element as a read-only view; undefined before. */
  public getSceneElementView(): TSceneElementView<HTMLImageElement> | undefined {
    return this.writer?.isCurrent() ? this.writer.element : undefined;
  }

  /**
   * @internal The element origin as this component's update reads it; tracked inside a computed, so a sub-component
   * that draws at this origin follows its moves.
   */
  public readSceneOrigin(): TPoint {
    const place = this.scenePlace?.value;
    return place ? { x: place.x, y: place.y } : this.getSceneOrigin();
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

  protected override willApplyData(
    nextProps: Props,
    nextState: State,
    nextContext: Context,
    derivedAfterProps = false
  ): void {
    if (!this.scenePlace) return; // The first update always builds the element after mount.
    this.placementPending = true;
    this.levelsPending ||= derivedAfterProps || this.shouldUpdateScene(nextProps, nextState, nextContext);
  }

  protected willMount(): void {
    super.willMount();
    if (!this.usesSceneLevels()) return;
    const revision = (this.placementRevision = signal(0));
    this.walked = (this.constructor as typeof SceneComponent).mode === "immediate";
    let lastPlace: TScenePlace | undefined;
    const place = computed(() => {
      track(revision);
      const next = this.readScenePlace(lastPlace);
      if (!lastPlace || next.x !== lastPlace.x || next.y !== lastPlace.y || next.zIndex !== lastPlace.zIndex) {
        lastPlace = next;
      }
      return lastPlace;
    });
    this.subscribeSignal(place, (value) => {
      if (this.scenePlace && !this.placementPending && value !== this.appliedPlace) this.performRender();
    });
    this.scenePlace = place;
  }

  protected willIterate(): void {
    super.willIterate();
    if (!this.scenePlace || !this.placementRevision) {
      if (!this.usesSceneLevels()) return;
      if (HAS_NODE_ENV && process.env.NODE_ENV !== "production") reportMissingSuper(this.constructor.name);
      return;
    }
    if (this.placementPending) {
      this.placementRevision.value = this.placementRevision.peek() + 1;
      this.placementPending = false;
    }
    const place = this.scenePlace.peek();
    const previous = this.lastLevels;
    if (this.levelsPending) {
      this.levelsPending = false;
      untracked(() => this.runLevels());
    }
    if (
      this.walked &&
      this.written &&
      place === this.appliedPlace &&
      previous === this.lastLevels &&
      this.writtenPlaceHolds(this.written)
    )
      return;
    this.syncSceneElement(place, this.lastLevels ?? EMPTY_LEVELS);
    this.appliedPlace = place;
  }

  protected unmount(): void {
    this.writer?.dispose();
    this.writer = undefined;
    if (this.measuresText) this.context.graph.scene.untrackTextMeasure(this);
    this.measuresText = false;
    this.written = undefined;
    this.appliedPlace = undefined;
    super.unmount();
  }

  /**
   * Whether the inputs the update reads untracked still match the last write: the hidden state, the hit barrier and
   * the parent. A child element also has to be in the store still: its parent's element, added again, takes it along.
   */
  private writtenPlaceHolds(written: TSceneElement): boolean {
    if (this.isWrittenHidden() !== written.hidden || this.isHitBarrier() !== this.syncedBarrier) return false;
    const parent = this.getSceneParent();
    if (parent?.elementId !== (written.nestedIn ?? written.parent) || (parent?.order ?? 0) !== written.childOrder)
      return false;
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
    while (node instanceof SceneComponent && node.usesSceneLevels()) {
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

  private runLevels(): TLevelOutput {
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
          ? encodeLevelsWithDiagnostics(this.constructor.name, methods)
          : encodeLevels(methods);
      const previous = this.lastLevels;
      output =
        previous && samePrimitives(previous.primitives, primitives)
          ? previous
          : { primitives, bounds: primitives.length ? elementBounds(primitives) : EMPTY_BOUNDS };
    } catch (error) {
      // Its origin, bucket and hidden state still update; the next rebuild runs them again.
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

  private syncSceneElement(place: TScenePlace, levels: TLevelOutput): void {
    const parent = this.getSceneParent();
    this.writeSceneElement({
      primitives: levels.primitives,
      bounds: levels.bounds,
      x: place.x,
      y: place.y,
      zIndex: place.zIndex,
      hidden: this.isWrittenHidden(),
      parent: parent?.elementId,
      childOrder: parent?.order ?? 0,
    });
  }

  /** Updates visibility and order while retaining the prepared geometry and its element identity. */
  protected updateScenePlacement(hidden: boolean, zIndex?: number): void {
    const writer = this.writer;
    if (!this.written || !writer?.isCurrent()) return;
    const patch = writer.update({ hidden, zIndex });
    if (!patch) return;
    this.requestRetarget();
  }

  /** Publishes a prepared shape and its bounds through the same owner as a level-based component. */
  protected writeSceneElement(next: TWritten): void {
    const start = HAS_NODE_ENV && process.env.NODE_ENV !== "production" ? sceneComponentStats.start() : undefined;
    const written = this.written;
    // Before the write: a child whose add fails is still no element owner (`isHitOnLevel`).
    this.writesChild = next.parent !== undefined;
    // Before any early return: the barrier can change while the element stays as written (a delegated one hidden by
    // another input).
    this.syncHitBarrier();
    if (written && this.writer?.isCurrent() && (written.nestedIn ?? written.parent) === next.parent) {
      if (HAS_NODE_ENV && process.env.NODE_ENV !== "production" && written.primitives !== next.primitives)
        checkScenePrimitives(this.constructor.name, next.primitives);
      const patch = this.writer.update(next);
      if (!patch) return;
      const geometry =
        patch.x !== undefined || patch.y !== undefined || patch.bounds !== undefined || patch.primitives !== undefined;
      if (geometry) this.syncHitRect(next);
      if (patch.primitives !== undefined) {
        this.syncHitMask(next);
        if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
          checkLookLessHitBox(this.constructor as typeof SceneComponent, next, this.hasHitBox);
      }
    } else if (!this.addSceneElement(next)) {
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
  private addSceneElement(next: TWritten): boolean {
    const scene = this.context.graph.scene;
    const store = scene.store;
    const id = this.getSceneElementId();
    this.writer?.dispose();
    this.writer = undefined;
    this.written = undefined;
    if (store.get(id)) {
      if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
        reportElementIdConflict(this.constructor.name, id, store.writerOf(id));
      return false;
    }
    if (next.parent !== undefined && !store.get(next.parent)) {
      reportMissingParent(this.constructor.name, next.parent);
      return false;
    }
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
      checkScenePrimitives(this.constructor.name, next.primitives);
    const type = this.getSceneEntityType();
    const levels = this.usesSceneLevels();
    this.writer = new SceneElementWriter(scene, { id, entityType: type, ...next }, levels ? this : undefined);
    this.written = this.writer.element;
    this.syncHitMask(next, this.adds === 0);
    if (type !== undefined)
      this.writer.bindStyle(
        { type, id: this.getEntityId() },
        this.getStyleTarget(),
        this.onSceneStyleChange?.bind(this)
      );
    this.syncHitRect(next);
    // A hit box set before the first write (by hand, as `Anchor` does) is checked once the look is known.
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production")
      checkLookLessHitBox(this.constructor as typeof SceneComponent, next, this.hasHitBox);
    if (this.adds++ > 0) this.rewriteChildren();
    return true;
  }
}
