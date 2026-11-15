import { Component } from "../../../lib/Component";
import type { TComponentMode } from "../../../lib/CoreComponent";
import { isDevelopmentBuild } from "../../../lib/detachedWarning";
import { SCENE_LEVELS } from "../../../lib/scene/levels";
import type { TScenePrimitive } from "../../../lib/scene/types";
import type { HitBoxData } from "../../../services/HitTest";
import { DragContext, DragDiff } from "../../../services/drag";
import type { TSceneLevel } from "../../../services/scene/types";
import type { TStyleParts } from "../../../services/styles/types";
import { AnchorState, EAnchorType } from "../../../store/anchor/Anchor";
import { TBlockId } from "../../../store/block/Block";
import { PortState } from "../../../store/connection/port/Port";
import type { TPoint } from "../../../utils/types/shapes";
import { GraphComponent, TGraphComponentProps } from "../GraphComponent";
import { SceneComponent } from "../scene/SceneComponent";
import type { TSceneParent } from "../scene/SceneComponent";

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

const NO_PRIMITIVES: readonly TScenePrimitive[] = Object.freeze([]);

/** Anchor classes already warned about, per development check (`Anchor.checkLook`). */
const warnedLevelFields = new WeakSet<object>();
const warnedExtents = new WeakSet<object>();

/**
 * An anchor of a block (decision 2): a retained scene component that owns a child element of its block's element, so
 * it draws right above its block, hides and raises with it, and is hit in its block's scene order. The theme's anchor
 * rules colour it, show its ring while it is selected and scale it while it is hovered.
 *
 * Anchors are drawn and hit from the schematic level on: at the minimalistic level they have no look and the block
 * under them is hit. A block creates its anchor components lazily, once the camera shows it at the schematic or
 * detailed level (`Block.updateChildren`); until then its anchor ports belong to the block, which positions them, so
 * connections attach to anchors whether or not their components exist.
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

  public static CANVAS_HOVER_FACTOR = 1.8;
  public static DETAILED_HOVER_FACTOR = 1.2;

  /**
   * How far, in world units, the look of an anchor of this class reaches from its point at most: the largest
   * distance of its element's bounds from its origin. `graph.scene.toImage()` searches this far around its rect (and
   * past the anchors' own points) for blocks whose anchor components do not exist yet, and the camera's lazy creation
   * this far around its view (`Block.shouldCreateAnchors`), so a look that reaches farther can be left out of an export
   * of a rect, or of a view, it reaches only with its look. The default is the default look with
   * `Block`'s anchor props (size 18, lineWidth 2): the dot (radius 9) and its ring (width 5, centred on the dot's
   * edge) reach 11.5.
   *
   * Contract: a subclass, or a block that passes a larger `size` or `lineWidth` to its anchors, whose look reaches
   * farther than the declared extent must declare its own: `public static override LOOK_EXTENT = 40;`. Otherwise an
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
  public static drawsOnLevel(klass: typeof Anchor, level: TSceneLevel): boolean {
    return level === "schematic" || klass !== Anchor;
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

  public connectedState: AnchorState;

  private shift = 0;

  /** Whether the development checks of its created element ran (`checkLook`). */
  private lookChecked = false;

  constructor(props: T, parent: Component) {
    super(props, parent);
    this.state = { size: props.size, raised: false, selected: false };

    const anchorState = this.context.graph.rootStore.blocksList.getBlockState(props.blockId)?.getAnchorById(props.id);
    if (!anchorState) throw new Error(`Cannot bind Anchor to missing anchor ${props.id} in block ${props.blockId}`);
    this.connectedState = anchorState;
    this.connectedState.setViewComponent(this);

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

  protected propsChanged(_nextProps: T): void {
    if (this.props.lineWidth !== _nextProps.lineWidth) {
      this.computeShift(this.state, _nextProps);
      this.onPositionChanged();
    }
    super.propsChanged(_nextProps);
  }

  protected willMount(): void {
    this.props.port.setOwner(this);
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      this.setState({ selected });
    });
    this.subscribeSignal(this.props.port.$point, this.onPositionChanged);
    this.computeShift(this.state, this.props);
    this.onPositionChanged();
    super.willMount();
  }

  protected override willIterate(): void {
    super.willIterate();
    // Once its element exists: its first update writes it.
    if (!this.lookChecked && isDevelopmentBuild()) this.checkLook();
  }

  /**
   * Development checks of a created anchor, once per class each: a level method defined as an instance property
   * (a style warning only: exports treat every subclass as drawing, see `drawsOnLevel`), and a look that reaches past
   * the class's `LOOK_EXTENT`.
   */
  private checkLook(): void {
    const bounds = this.getSceneElementView()?.bounds;
    if (!bounds) return;
    this.lookChecked = true;
    const klass = this.constructor as typeof Anchor;
    const name = klass.name || "An anchor class";
    for (const level of SCENE_LEVELS) {
      if (!Object.prototype.hasOwnProperty.call(this, level) || warnedLevelFields.has(klass)) continue;
      warnedLevelFields.add(klass);
      console.warn(
        `${name}: ${level} is an instance property, not a prototype method. Anchor level methods should be methods: ` +
          "a subclass cannot call super.<level>() from a property, and graph.scene.toImage() treats every subclass " +
          "as drawing on every level (Anchor.drawsOnLevel), so exports create temporary anchors for it."
      );
    }
    const reach = Math.max(-bounds.minX, -bounds.minY, bounds.maxX, bounds.maxY);
    if (reach <= klass.LOOK_EXTENT || warnedExtents.has(klass)) return;
    warnedExtents.add(klass);
    console.warn(
      `${name}: its anchors' look reaches ${reach} world units from their point, past ${name}.LOOK_EXTENT ` +
        `(${klass.LOOK_EXTENT}). graph.scene.toImage() searches that far around its rect for blocks without anchor ` +
        "components, so it can leave these anchors out. Declare the reach on the class: " +
        `\`public static override LOOK_EXTENT = ${Math.ceil(reach)};\`.`
    );
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

  /**
   * Not hit at the minimalistic level, where anchors have no look: the block under the anchor is hit instead, so
   * gestures that start on an anchor (connection creation) start from the schematic level on.
   */
  public override onHitBox(data: HitBoxData): boolean {
    if (this.context.graph.scene.$level.peek() === "minimalistic") return false;
    return super.onHitBox(data);
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
      // keep this endpoint, as before the component existed. A removed anchor's port waits for an owner.
      const block = this.getParent();
      if (this.connectedState.isAttached() && block instanceof GraphComponent) {
        port.setOwner(block);
        // `useBlocksAnchors` turned off at runtime hides anchor connections (the block does it for the ports it owns).
        if (!this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors")) port.updatePort({ lookup: true });
      } else port.removeOwner();
    }
    this.connectedState.unsetViewComponent();
    super.unmount();
  }

  public handleEvent(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

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
   * there either.
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
  protected override schematic(view: TAnchorView): readonly TScenePrimitive[] {
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

  /** A child element of its block's element, ordered by its place among the block's anchors. */
  protected override getSceneParent(): TSceneParent | undefined {
    const block = this.getParent();
    return block instanceof SceneComponent
      ? { elementId: block.getSceneElementId(), order: this.renderOrder }
      : undefined;
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
