import { batch } from "@preact/signals-core";

import { Component } from "../../../lib/Component";
import type { TComponentMode } from "../../../lib/CoreComponent";
import { levelMaskOf } from "../../../lib/scene/levels";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { DragContext, DragDiff } from "../../../services/drag";
import type { TSceneLevel } from "../../../services/scene/types";
import type { TStyleParts } from "../../../services/styles/types";
import { AnchorState, EAnchorType } from "../../../store/anchor/Anchor";
import { TBlockId } from "../../../store/block/Block";
import { PortState } from "../../../store/connection/port/Port";
import { HAS_NODE_ENV } from "../../../utils/development";
import type { TPoint, TRect } from "../../../utils/types/shapes";
import { pointerTargetAfter } from "../EventedComponent/EventedComponent";
import { GraphComponent, TGraphComponentProps } from "../GraphComponent";
import type { GraphComponentContext } from "../GraphComponent";
import { SceneComponent } from "../scene/SceneComponent";
import { sameInputs } from "../scene/utils/viewData";

import { checkAnchorLook } from "./utils/anchorWarnings";

export type TAnchorId = string | number;
export type TAnchor = {
  id: string;
  blockId: TBlockId;
  type: EAnchorType | string;
  index?: number;
};

export type TAnchorProps = TGraphComponentProps &
  TAnchor & {
    size: number;
    lineWidth: number;
    zIndex: number;
    port: PortState;
  };

type TAnchorState = {
  size: number;
  raised: boolean;
  selected: boolean;
};

/** The inputs of an anchor's level methods: its own look values and its block's view data (spec V6b). */
export type TAnchorView = {
  readonly type: string;
  readonly size: number;
  readonly lineWidth: number;
  readonly block?: object;
};

/**
 * An anchor class `Block.getAnchorClass` returns (spec §5.2): `Anchor` or a subclass whose props are `TAnchorProps`.
 * The block creates the component with the anchor's data, its port and the class's `SIZE` and `LINE_WIDTH`; a class
 * reads anything else from its anchor (`this.props`) and its block (its view data `view.block`, or the block's data in
 * a method of its own).
 */
export type TAnchorClass = (new (props: TAnchorProps, parent: Component) => Anchor) &
  Pick<typeof Anchor, "SIZE" | "LINE_WIDTH" | "LOOK_EXTENT" | "CREATION_LEVELS" | "create">;

const NO_PRIMITIVES: readonly TScenePrimitive[] = Object.freeze([]);

/**
 * An anchor of a block (decision 2): a retained scene component that owns a child element of its block's element, so
 * it draws right above its block, hides and raises with it, and is hit in its block's scene order. The theme's anchor
 * rules colour it, show its ring while it is selected and scale it while it is hovered.
 *
 * Anchors are hit where they are shown (D4, `SceneComponent.hitLevels`): stock anchors on the schematic level, where
 * their look draws, and on every level while their block is shown outside the scene (an HTML view); elsewhere the
 * block under them is hit. A class that draws on another level is hit there too. An anchor hidden itself, or of a block
 * hidden for a reason other than delegation (its group's `setHiddenBlock`), takes no hits, as in the DOM
 * (`SceneComponent.isHitBarrier`).
 *
 * A block creates its anchor components lazily, once the camera shows it at a level of their class's
 * `CREATION_LEVELS` (schematic and detailed for the stock class; `Block.updateChildren`); until then its anchor ports
 * belong to the block, which positions them, so connections attach to anchors whether or not their components exist.
 * `Block.getAnchorClass` picks the class of each anchor.
 */
export class Anchor<T extends TAnchorProps = TAnchorProps> extends SceneComponent<TAnchorView, T, TAnchorState> {
  /** Updated on change, never walked: the scene draws its element. */
  public static override readonly mode: TComponentMode = "retained";

  public readonly cursor = "pointer";

  /** The entity type of the selection bucket and of tag addresses. */
  public static override entityType = "anchor";

  /**
   * Part names style rules can set for anchors; a type brand only, never set at runtime. A subclass adds parts by
   * redeclaring it with a wider `TStyleParts<...>`.
   */
  public declare readonly __styleParts?: TStyleParts<"anchor" | "border">;

  /** The dot's diameter of this class's anchors in world units, passed as their `size` (hover scales it). */
  public static SIZE = 18;

  /** The line width of this class's anchors, passed as their `lineWidth`; the stock ring is `lineWidth + 3` wide. */
  public static LINE_WIDTH = 2;

  /**
   * The levels on which blocks create anchors of this class lazily, once the camera shows the block there. The stock
   * look draws on the schematic level, and React draws anchors on the detailed one (where they are hit while an HTML
   * view holds the block). A class whose look draws on the minimalistic level declares it here; development builds warn
   * when a created anchor draws on a level this list omits.
   */
  public static CREATION_LEVELS: readonly TSceneLevel[] = ["schematic", "detailed"];

  public static CANVAS_HOVER_FACTOR = 1.8;
  public static DETAILED_HOVER_FACTOR = 1.2;

  /**
   * How far, in world units, the look of an anchor of this class reaches from its point at most: the largest
   * distance of its element's bounds from its origin. `graph.scene.toImage()` searches this far around its rect (and
   * past the anchors' own points) for blocks whose anchor components do not exist yet, and the camera's lazy creation
   * this far around its view (`Block.shouldCreateAnchors`), so a look that reaches farther can be left out of an export
   * of a rect, or of a view, it reaches only with its look. The default is the default look with `SIZE` 18 and
   * `LINE_WIDTH` 2: the dot (radius 9) and its ring (width 5, centred on the dot's edge) reach 11.5.
   *
   * Contract: a subclass, or a class with a larger `SIZE` or `LINE_WIDTH`, whose look reaches farther than the
   * declared extent must declare its own: `public static override LOOK_EXTENT = 40;`. Otherwise an
   * export can miss such anchors of a block near the crop edge (the export finds blocks whose anchors do not exist yet
   * by this extent), and development builds warn, naming the class, once when an anchor's element reaches past it.
   */
  public static LOOK_EXTENT = 11.5;

  /**
   * @internal Whether anchors of a class may draw on a level. False only for the stock `Anchor` class on the
   * minimalistic and detailed levels, where its own look is empty; every subclass counts as possibly drawing there,
   * whatever it overrides (a level method as a prototype method or as an instance property, a `schematic()` that
   * changes the look through other means). An export creates no temporary anchors for a level they draw nothing on
   * (`Block.createExportAnchors`), so a subclass that draws nothing on a level costs the export temporary anchors,
   * never a missing one.
   */
  public static drawsOnLevel(klass: TAnchorClass, level: TSceneLevel): boolean {
    return level === "schematic" || klass !== Anchor;
  }

  /** @internal The levels on which blocks create anchors of a class (`CREATION_LEVELS`), as a level mask. */
  public static creationLevelsOf(klass: TAnchorClass): number {
    return levelMaskOf(klass.CREATION_LEVELS);
  }

  public override isEntityAvailable(): boolean {
    return super.isEntityAvailable() && this.connectedState.isAttached();
  }

  /**
   * The block-qualified id, `anchorEntityId(blockId, id)`: anchor ids are unique only within their block. Tags, the
   * anchor selection bucket and the element id use it; `props.id` is the anchor's own id.
   */
  public getEntityId(): string {
    return this.connectedState.entityId;
  }

  /**
   * The anchor state this component is bound to: the one its block's store entry gives for its id. A block removed and
   * added back with the same id in one frame keeps this component, which then binds to the new state
   * (`propsChanged`).
   */
  public connectedState: AnchorState;

  /** Ends the subscription to the bound state's selection (`subscribeAnchorState`). */
  private unsubscribeAnchorState?: () => void;

  private shift = 0;

  constructor(props: T, parent: Component) {
    super(props, parent);
    this.state = { size: props.size, raised: false, selected: false };

    const anchorState = this.findAnchorState(props);
    if (!anchorState) throw new Error(`Cannot bind Anchor to missing anchor ${props.id} in block ${props.blockId}`);
    this.connectedState = anchorState;
    this.bindAnchorState();

    this.addEventListener("click", this);
    this.addEventListener("mouseenter", this);
    this.addEventListener("mousedown", this);
    this.addEventListener("mouseleave", this);

    this.computeRenderSize(this.props.size, this.state.raised);
  }

  public getHoverFactor() {
    if (this.context.graph.scene.$level.value === "detailed") {
      return Anchor.DETAILED_HOVER_FACTOR;
    }
    return Anchor.CANVAS_HOVER_FACTOR;
  }

  protected stateChanged(_nextState: TAnchorState): void {
    if (this.state.size !== _nextState.size) {
      this.computeShift(_nextState, this.props);
      this.onPositionChanged();
    }
    if (this.state.raised !== _nextState.raised) {
      this.computeRenderSize(this.props.size, _nextState.raised);
    }
    super.stateChanged(_nextState);
  }

  protected propsChanged(nextProps: T): void {
    // Its block reconciles it with every update of its anchors, a re-add of the block included.
    const registered = this.findAnchorState(nextProps);
    if (registered && registered !== this.connectedState && registered.entityId === this.connectedState.entityId) {
      this.rebindAnchorState(registered);
    }
    if (this.props.lineWidth !== nextProps.lineWidth) {
      this.computeShift(this.state, nextProps);
      this.onPositionChanged();
    }
    super.propsChanged(nextProps);
  }

  /** The anchor state its block's store entry gives for these props' anchor id, if any. */
  private findAnchorState(props: TAnchorProps): AnchorState | undefined {
    return this.context.graph.rootStore.blocksList.getBlockState(props.blockId)?.getAnchorById(props.id);
  }

  /**
   * Binds this component to `connectedState`: it becomes the state's view component and, once mounted, follows its
   * selection (before the mount, `willMount` subscribes). The constructor and a rebind take this one path.
   */
  private bindAnchorState(): void {
    this.connectedState.setViewComponent(this);
    if (this.isMounted()) this.subscribeAnchorState();
  }

  /** Undoes `bindAnchorState`: the state no longer names this component, and nothing of it is subscribed to. */
  private unbindAnchorState(): void {
    this.unsubscribeAnchorState?.();
    this.unsubscribeAnchorState = undefined;
    this.connectedState.unsetViewComponent();
  }

  /**
   * Binds this component to the new anchor state of its entity. Its block was removed and added back with the same id
   * before a frame, or the anchor left its block's list and came back: the block's component and this one are kept
   * (keyed by id), but the store made a new anchor state, and the old one rejects selection writes and drags
   * (`isAttached`). The entity stays, and with it the element, the tags and the style binding (all addressed by the
   * entity id), the port and the hit box. It asks for no retarget: the pointer's target is the same component.
   */
  private rebindAnchorState(next: AnchorState): void {
    // One batch: the connections' endpoint computeds read the block state through this component and depend on the
    // bound state's view (`ConnectionState.$sourceBlock`), so they must run again only once the new state is bound.
    batch(() => {
      this.unbindAnchorState();
      this.connectedState = next;
      this.bindAnchorState();
    });
    // The port it follows (`willMount` subscribed to it) stays its own: a block that saw the anchor leave its list
    // released the port and claimed it again.
    const port = this.props.port;
    if (this.isMounted() && port.owner !== this) port.setOwner(this);
  }

  private subscribeAnchorState(): void {
    this.unsubscribeAnchorState?.();
    this.unsubscribeAnchorState = this.connectedState.$selected.subscribe((selected) => {
      this.setState({ selected });
    });
  }

  protected willMount(): void {
    this.props.port.setOwner(this);
    this.subscribeAnchorState();
    // The extent first: the port subscription sets the first hit box at once, and it has its final geometry, so the
    // anchor mounting under a still pointer asks for no retarget (settled item 11: camera moves keep today's rule).
    this.computeShift(this.state, this.props);
    this.subscribeSignal(this.props.port.$point, this.onPositionChanged);
    super.willMount();
  }

  protected override willIterate(): void {
    super.willIterate();
    if (HAS_NODE_ENV && process.env.NODE_ENV !== "production") checkAnchorLook(this);
  }

  protected computeShift(state = this.state, props = this.props) {
    this.shift = state.size / 2 + props.lineWidth;
  }

  protected onPositionChanged = () => {
    const { x, y } = this.getPosition();
    this.setHitBox(x - this.shift, y - this.shift, x + this.shift, y + this.shift);
  };

  public override getPorts(): PortState[] {
    return [this.props.port];
  }

  /**
   * Get the position of the anchor.
   * Returns the position of the anchor in the coordinate system of the graph(ABSOLUTE).
   *
   * Example:
   * ```ts
   * const pos = anchor.getPosition(); // { x: 100, y: 100 }
   * ```
   * port.getPoint is used port.$state.value so you can use this method in signals effect and compute.
   * ```ts
   * computed(() => {
   *   return anchor.getPosition().x + 10; // { x: 110, y: 100 }
   * });
   * ```
   * @returns The position of the anchor in the coordinate system of the graph(ABSOLUTE).
   */
  public getPosition() {
    return this.props.port.getPoint();
  }

  public toggleSelected() {
    this.connectedState.setSelection(!this.state.selected);
  }

  /**
   * Dragging an anchor drags its block. Layers that use anchors for other gestures (for example,
   * connection creation) prevent the default action of the graph `mousedown` event instead.
   */
  public override isDraggable(): boolean {
    return true;
  }

  public override handleDragStart(context: DragContext): void {
    this.connectedState.block.getViewComponent()?.handleDragStart(context);
  }

  public override handleDrag(diff: DragDiff, context: DragContext): void {
    this.connectedState.block.getViewComponent()?.handleDrag(diff, context);
  }

  public override handleDragEnd(context: DragContext): void {
    this.connectedState.block.getViewComponent()?.handleDragEnd(context);
  }

  protected unmount() {
    // A constructor that found no anchor state threw before binding: the reconcile unmounts the half-built anchor
    // (`discardChild`), which owns no port and holds no view-component binding.
    const bound: AnchorState | undefined = this.connectedState;
    if (!bound) {
      super.unmount();
      return;
    }
    const port = this.props.port;
    if (port.owner === this) {
      // While the anchor still belongs to its block (its components were dropped: `useBlocksAnchors` turned off, or
      // the anchor list changed out of view), the block owns its port again and keeps positioning it, so connections
      // keep this endpoint, as before the component existed. A removed anchor's port waits for an owner. It belongs
      // while its block's store entry has a state of its entity: the bound one, or a new one after a re-add of the
      // block in this frame, whose reconcile dropped this component without rebinding it.
      const block = this.getParent();
      const registered = this.findAnchorState(this.props);
      if (registered?.entityId === bound.entityId && block instanceof GraphComponent) {
        port.setOwner(block);
        // `useBlocksAnchors` turned off at runtime hides anchor connections (the block does it for the ports it owns).
        if (!this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors")) port.updatePort({ lookup: true });
      } else port.removeOwner();
    }
    this.unbindAnchorState();
    super.unmount();
  }

  /**
   * The anchor's `hoveredTag`: on while the anchor itself is the pointer's target, not while one of its children is
   * (D5). From the hook, so it follows the pointer whatever the anchor's interactivity, as the tag always did.
   */
  protected override onDispatchedEvent(event: Event): void {
    super.onDispatchedEvent(event);
    if (event.type === "mouseenter" || event.type === "mouseleave") {
      this.setHoveredTag(pointerTargetAfter(event) === this);
    }
  }

  /**
   * Clicks and presses stay the anchor's own; hover events go on to its block (D5: the anchor handles them and passes
   * them on, so its block follows the pointer). Its tag is written by `onDispatchedEvent`.
   */
  public handleEvent(event: MouseEvent | KeyboardEvent): void {
    event.preventDefault();
    if (event.type !== "mouseenter" && event.type !== "mouseleave") event.stopPropagation();

    switch (event.type) {
      case "click": {
        this.toggleSelected();
        break;
      }
      case "mouseenter": {
        this.setState({ raised: true });
        break;
      }
      case "mouseleave": {
        this.setState({ raised: false });
        break;
      }
    }
  }

  private computeRenderSize(size: number, raised: boolean) {
    if (raised) {
      this.setState({ size: size * this.getHoverFactor() });
    } else {
      this.setState({ size });
    }
  }

  protected override shouldUpdateScene(
    nextProps: T,
    nextState: TAnchorState,
    nextContext: GraphComponentContext
  ): boolean {
    // The stock look uses styles for hover and selection. Subclasses may draw directly from their state.
    if (this.constructor === Anchor) {
      return this.props.size !== nextProps.size || this.props.lineWidth !== nextProps.lineWidth;
    }
    return (
      !sameInputs(this.props, nextProps) || !sameInputs(this.state, nextState) || !sameInputs(this.context, nextContext)
    );
  }

  protected override getViewData(): TAnchorView {
    const block = this.getParent();
    return {
      type: String(this.props.type),
      size: this.props.size,
      lineWidth: this.props.lineWidth,
      block: block instanceof SceneComponent ? block.readSceneView() : undefined,
    };
  }

  /**
   * No look at the minimalistic level (user decision, 2026-11-14): there an anchor is a sub-pixel dot, and the scene
   * skips an element without primitives on the level before any per-element work. A selected anchor shows no ring
   * there either. A subclass that draws here declares the level in `CREATION_LEVELS`, so blocks create it here.
   *
   * Level methods of anchors are best written as prototype methods, in subclasses too
   * (`protected override minimalistic() {}`), not instance properties (`minimalistic = () => [...]`); development
   * builds warn about the latter. Exports are correct either way: they treat every subclass as possibly drawing on
   * every level (`Anchor.drawsOnLevel`).
   */
  protected override minimalistic(): readonly TScenePrimitive[] {
    return NO_PRIMITIVES;
  }

  /**
   * Today's look: a dot of the `anchor` part and a ring of the `border` part around it. The ring is hidden by the
   * theme and shown by its `selectedTag` rule; the theme colours both, and its `hoveredTag` rule scales both by ×1.8.
   * Users restyle anchors with rules on `Anchor` (a solid dot instead of the ring, another ring colour or width).
   * A prototype method, as every level method of an anchor (see `minimalistic`); a look that reaches farther than
   * `LOOK_EXTENT` from the anchor's point declares its reach there.
   */
  protected override schematic(
    view: TAnchorView = this.readSceneView() ?? this.getViewData()
  ): readonly TScenePrimitive[] {
    return this.anchorLook(view);
  }

  /** Not drawn at the detailed level, as before. A prototype method, as every level method of an anchor. */
  protected override detailed(): readonly TScenePrimitive[] {
    return NO_PRIMITIVES;
  }

  protected override getSceneOrigin(): TPoint {
    const { x, y } = this.props.port.$point.value;
    return { x, y };
  }

  /** None: the anchor sets its hit box from its port (`onPositionChanged`), a square of `size / 2 + lineWidth`. */
  protected override getHitRect(): TRect | undefined {
    return undefined;
  }

  private lookCache?: { readonly view: TAnchorView; readonly primitives: readonly TScenePrimitive[] };

  private anchorLook(view: TAnchorView): readonly TScenePrimitive[] {
    if (this.lookCache?.view !== view) {
      const r = view.size / 2;
      const dot: TScenePrimitive = { kind: "circle", part: "anchor", cx: 0, cy: 0, r };
      // Paint and visibility come from the theme; the width is today's `lineWidth + 3`, centred on the dot's edge.
      const ring: TScenePrimitive = {
        kind: "circle",
        part: "border",
        cx: 0,
        cy: 0,
        r,
        border: { width: view.lineWidth + 3 },
      };
      this.lookCache = { view, primitives: Object.freeze([dot, ring]) };
    }
    return this.lookCache.primitives;
  }
}
