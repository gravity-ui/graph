import { Signal } from "@preact/signals-core";

import { Graph } from "../../../graph";
import type { GraphEventMap, GraphEventName, GraphEventOptions } from "../../../graphEvents";
import { Component } from "../../../lib";
import { TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";
import type { EventObserver } from "../../../lib/graphEventDispatch";
import { createGraphEvent } from "../../../lib/graphEventDispatch";
import { HitBox, HitBoxData } from "../../../services/HitTest";
import { DragContext, DragDiff } from "../../../services/drag";
import { hoveredTag } from "../../../services/tags/builtinTags";
import { getEntityAddress } from "../../../services/tags/entity";
import { PortState, TPort, TPortId } from "../../../store/connection/port/Port";
import { TypedEventListener, addTypedEventListener } from "../../../utils/eventListener";
import { applyAlpha } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";
import { EventedComponent } from "../EventedComponent/EventedComponent";
import { CursorLayerCursorTypes } from "../layers/cursorLayer";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

export type GraphComponentContext = TComponentContext &
  TGraphLayerContext & {
    graph: Graph;
    affectsUsableRect?: boolean;
  };

export type TGraphComponentProps = TComponentProps & {
  interactive?: boolean;
  affectsUsableRect?: boolean;
};

export class GraphComponent<
  Props extends TGraphComponentProps = TGraphComponentProps,
  State extends TComponentState = TComponentState,
  Context extends GraphComponentContext = GraphComponentContext,
> extends EventedComponent<Props, State, Context> {
  public hitBox: HitBox;

  /**
   * Whether pointer events pass through components of this class (spec §5.1): the pointer's target and its hover
   * skip them for the component under them, as does `graph.getElementOverPoint()`; the cursor follows the target, so
   * it skips them too. `graph.input.hover.captureEvents()` does not capture them. Their hit box stays: it counts
   * in the usable rect, and `getElementsOverPoint()` and `getElementsOverRect()` return them. `onHitBox() => false`
   * instead keeps a component out of every hit query.
   */
  public static transparentToEvents = false;

  /** Whether pointer events pass through this component now; `static transparentToEvents` by default. */
  public isTransparentToEvents(): boolean {
    return (this.constructor as typeof GraphComponent).transparentToEvents;
  }

  /** Whether a hit box was set: the first one, at mount, asks for no retarget. */
  private hitBoxSet = false;

  /** Whether `removeHitBox` took the hit box out of the hit test and none was set since. */
  private hitBoxRemoved = false;

  /**
   * Whether `setVisibility(false, { removeHitbox: true })` keeps the hit box out until the component shows again:
   * geometry updates meanwhile (`setHitBox`) only record the box, so neither the hit test nor the usable rect sees a
   * component that is not shown.
   */
  private hitBoxSuppressed = false;

  /**
   * While the box is suppressed: the last box `setHitBox` asked for, `null` when `removeHitBox` took it away meanwhile,
   * undefined when neither ran (the box it had comes back).
   */
  private suppressedHitBox?: readonly [number, number, number, number] | null;

  /** While above 0, hit box changes follow the camera (`withCameraDerivedHitBox`) and ask for no retarget. */
  private cameraDerivedHitBoxes = 0;

  /** Whether this component put hoveredTag on itself (`setHoveredTag`). */
  private hoveredTagged = false;

  private unsubscribe: (() => void)[] = [];

  protected ports: Map<TPortId, PortState> = new Map();

  public getEntityId(): number | string {
    throw new Error("GraphComponent.getEntityId() is not implemented");
  }

  /**
   * Returns whether this component can be dragged.
   * Override in subclasses to enable drag behavior.
   * Components that return true will participate in drag operations managed by DragService.
   *
   * @returns true if the component is draggable, false otherwise
   */
  public isDraggable(_pointerType?: string): boolean {
    return false;
  }

  /**
   * Called when a drag operation starts on this component.
   * Override in subclasses to handle drag start logic.
   *
   * @param _context - The drag context containing coordinates and participating components
   */
  public handleDragStart(_context: DragContext): void {
    // Default implementation does nothing
  }

  /**
   * Called on each frame during a drag operation.
   * Override in subclasses to update component position.
   *
   * @param _diff - The diff containing coordinate changes (deltaX/deltaY for incremental, diffX/diffY for absolute)
   * @param _context - The drag context containing coordinates and participating components
   */
  public handleDrag(_diff: DragDiff, _context: DragContext): void {
    // Default implementation does nothing
  }

  /**
   * Called when a drag operation ends.
   * Override in subclasses to finalize drag state.
   *
   * @param _context - The drag context containing final coordinates and participating components
   */
  public handleDragEnd(_context: DragContext): void {
    // Default implementation does nothing
  }

  /** Finalizes a cancelled drag at its last position. Override to revert the drag. */
  public handleDragCancel(context: DragContext): void {
    this.handleDragEnd(context);
  }

  public get affectsUsableRect() {
    return this.props.affectsUsableRect ?? this.context.affectsUsableRect ?? true;
  }

  private mounted = false;

  private unmounting = false;

  /**
   * Whether it is hidden now, derived from its inputs: hidden by `setVisibility` or delegated (`setRenderDelegated`).
   * Each input has one writer, and no setter overwrites the other's.
   */
  protected hidden = false;

  /** The explicit visibility input: hidden by `setVisibility(false, …)`. */
  private visibilityHidden = false;

  /** The delegation input: something else draws it (`setRenderDelegated`). */
  private renderDelegated = false;

  constructor(props: Props, parent: Component) {
    super(props, parent);

    // Determine affectsUsableRect value: explicit prop > parent context > default (true)
    this.hitBox = new HitBox(this, this.context.graph.hitTest);
    const affectsUsableRect = props.affectsUsableRect ?? this.context.affectsUsableRect ?? true;
    this.setProps({ affectsUsableRect });
    this.setContext({ affectsUsableRect });
  }

  /* Adopt color to the component alpha */
  public adoptColor(color: string, { alpha }: { alpha?: number } = {}) {
    if (alpha !== undefined) {
      return applyAlpha(color, alpha);
    }
    return color;
  }

  public createPort(id: TPortId) {
    const port = this.context.graph.rootStore.connectionsList.claimPort(id, this);
    this.ports.set(id, port);
    return port;
  }

  public getPort(id: TPortId): PortState {
    return this.ports.get(id) ?? this.createPort(id);
  }

  /**
   * Get all ports of this component
   * @returns Array of all port states
   */
  public getPorts(): PortState[] {
    return Array.from(this.ports.values());
  }

  /**
   * Update port position and metadata
   * @param id Port identifier
   * @param portChanges port changes {x?, y?, meta?}
   */
  public updatePort<T = unknown>(id: TPortId, portChanges: Partial<TPort<T>>): void {
    const port = this.getPort(id);
    port.updatePort(portChanges);
  }

  protected setAffectsUsableRect(affectsUsableRect: boolean) {
    this.setProps({ affectsUsableRect });
    this.setContext({ affectsUsableRect });
  }

  protected propsChanged(_nextProps: Props): void {
    if (this.affectsUsableRect !== _nextProps.affectsUsableRect) {
      this.hitBox.setAffectsUsableRect(_nextProps.affectsUsableRect ?? this.context.affectsUsableRect ?? true);
      this.setContext({ affectsUsableRect: _nextProps.affectsUsableRect });
    }
    super.propsChanged(_nextProps);
  }

  protected contextChanged(_nextContext: Context): void {
    // If affectsUsableRect changed in context and there's no explicit prop override
    if (
      this.firstIterate ||
      (this.context.affectsUsableRect !== _nextContext.affectsUsableRect && this.props.affectsUsableRect === undefined)
    ) {
      this.hitBox.setAffectsUsableRect(this.props.affectsUsableRect ?? _nextContext.affectsUsableRect ?? true);
    }
    super.contextChanged(_nextContext);
  }

  public onChange(cb: (v: this) => void) {
    return this.addEventListener("graph-component-change", () => {
      cb(this);
    });
  }

  protected checkData() {
    if (super.checkData()) {
      this.dispatchEvent(createGraphEvent("graph-component-change", this, {}, false));
      return true;
    }
    return false;
  }

  protected onDrag({
    onDragStart,
    onDragUpdate,
    onDrop,
    onDragCancel = onDrop,
    isDraggable,
    autopanning,
    dragCursor,
  }: {
    onDragStart?: (_event: PointerEvent) => void | boolean;
    onDragUpdate?: (
      diff: {
        startCoords: [number, number];
        prevCoords: [number, number];
        currentCoords: [number, number];
        diffX: number;
        diffY: number;
        deltaX: number;
        deltaY: number;
      },
      _event: PointerEvent
    ) => void;
    onDrop?: (_event: PointerEvent) => void;
    /** Called on cancellation with the last drag event. Defaults to onDrop. */
    onDragCancel?: (_event: PointerEvent) => void;
    isDraggable?: (event: PointerEvent) => boolean;
    autopanning?: boolean;
    dragCursor?: CursorLayerCursorTypes;
  }) {
    return this.on("dragstart", (event) => {
      if (!isDraggable?.(event.pressEvent)) return;
      let startCoords: [number, number] | undefined;
      let prevCoords: [number, number] | undefined;
      event.claim({
        owner: this.constructor.name,
        component: this,
        autopanning: autopanning ?? true,
        cursor: dragCursor ?? "grabbing",
        start: (move, coords) => {
          if (onDragStart?.(move) === false) return;
          startCoords = prevCoords = coords;
        },
        move: (move, currentCoords) => {
          if (!startCoords || !prevCoords) return;
          const diffX = currentCoords[0] - startCoords[0];
          const diffY = currentCoords[1] - startCoords[1];
          const deltaX = currentCoords[0] - prevCoords[0];
          const deltaY = currentCoords[1] - prevCoords[1];
          onDragUpdate?.({ startCoords, prevCoords, currentCoords, diffX, diffY, deltaX, deltaY }, move);
          prevCoords = currentCoords;
        },
        end: onDrop,
        cancel: onDragCancel,
      });
    });
  }

  /** @internal Store identity for pointer routes whose views may be rebound between frames. */
  public getEntityBinding(): { isAttached(): boolean } | undefined {
    return undefined;
  }

  /** Whether delayed interactions may still use this component. */
  public isEntityAvailable(): boolean {
    return !this.hitBox.destroyed && (this.getEntityBinding()?.isAttached() ?? true);
  }

  public isMounted() {
    return this.mounted;
  }

  protected willMount() {
    super.willMount();
    this.mounted = true;
  }

  /**
   * Subscribes to a graph event and automatically unsubscribes on component unmount.
   *
   * This is a convenience wrapper around this.context.graph.on that also registers the
   * returned unsubscribe function in the internal unsubscribe list, ensuring proper cleanup.
   *
   * @param eventName - Graph event name to subscribe to
   * @param handler - Event handler callback
   * @param options - Additional AddEventListener options
   * @returns Unsubscribe function
   */
  protected onGraphEvent<K extends GraphEventName>(
    eventName: K,
    handler: EventObserver<GraphEventMap[NoInfer<K>]>,
    options?: GraphEventOptions | boolean
  ): () => void {
    const unsubscribe = this.context.graph.on(eventName, handler, options);
    this.unsubscribe.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Subscribes to a DOM event on the graph root element and automatically unsubscribes on unmount.
   *
   * @param eventName - DOM event name to subscribe to
   * @param handler - Event handler callback
   * @param options - Additional AddEventListener options
   * @returns Unsubscribe function
   */
  protected onRootEvent<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: TypedEventListener<HTMLElementEventMap[NoInfer<K>], HTMLElement>,
    options?: AddEventListenerOptions | boolean
  ): () => void {
    const root = this.context.root;
    if (!root) {
      throw new Error("Attempt to add event listener to non-existent root element");
    }

    const unsubscribe = addTypedEventListener(root, eventName, handler, options);

    this.unsubscribe.push(unsubscribe);

    return unsubscribe;
  }

  protected subscribeSignal<T>(signal: Signal<T>, cb: (v: T) => void) {
    this.unsubscribe.push(signal.subscribe(cb));
  }

  /**
   * Registers a callback for this component's own unmount.
   * Unmount events bubbling up from descendants do not trigger it.
   *
   * @param cb - Callback invoked once when this component is unmounted
   * @returns Function that removes the callback
   */
  public onUnmounted(cb: () => void): () => void {
    return this.addEventListener("graph-component-unmounted", (event) => {
      if (event.target !== this) return;
      cb();
    });
  }

  protected unmount(): void {
    // An unmount callback may unmount this component again. Skip GraphComponent's teardown and
    // dispatch on re-entry; the outer call completes them.
    if (this.unmounting) return;
    this.unmounting = true;
    this.unsubscribe.forEach((cb) => cb());
    this.ports.forEach((port) => {
      this.context.graph.rootStore.connectionsList.releasePort(port.id, this);
    });
    this.ports.clear();
    // A removed component takes its own tag off, and must not stay the pointer's target under a still pointer.
    // (Graph doubles in unit tests may lack a graph layer.)
    this.setHoveredTag(false);
    (this.context.graph as Partial<Graph>).input?.forgetComponent(this);
    this.destroyHitBox();
    this.mounted = false;
    // Dispatch before super.unmount(): EventedComponent.unmount() drops this component's listeners,
    // so dispatching afterwards would never reach onUnmounted() callbacks.
    try {
      this.dispatchEvent(createGraphEvent("graph-component-unmounted", this, {}, false));
    } finally {
      this.unmounting = false;
      super.unmount();
    }
  }

  public setHitBox(minX: number, minY: number, maxX: number, maxY: number, force?: boolean): void {
    if (this.hitBoxSuppressed) {
      // Hidden with its box removed: the box waits for the component to show again (`setVisibility`). The culling
      // bounds follow, as before.
      this.suppressedHitBox = [minX, minY, maxX, maxY];
      if (!this.hitBox.destroyed) this.setCullingBounds(minX, minY, maxX, maxY);
      return;
    }
    const [x, y, width, height] = this.hitBox.getRect();
    const moved = minX !== x || minY !== y || maxX - minX !== width || maxY - minY !== height;
    // A hit box set again, moved or resized changes what a still pointer hits. The first one asks
    // nothing: a component mounts there (a block added through the API, found at the next pointer move as today, or
    // an anchor the camera's lazy search creates: camera moves keep today's rule). Nor does a forced update of the
    // same box (`BlockState.updateBlock` forces one after every update).
    const changed = this.hitBoxSet && (this.hitBoxRemoved || moved);
    // A box set again after removeHitBox goes back into the hit test even when its rect is the one it had: HitBox
    // skips an update of the same rect, and its rect survives the removal.
    const restore = this.hitBoxRemoved;
    this.hitBoxSet = true;
    this.hitBoxRemoved = false;
    this.hitBox.update(minX, minY, maxX, maxY, force || restore);
    // Every component reports its own bounds to the layer's shared index.
    if (!this.hitBox.destroyed) this.setCullingBounds(minX, minY, maxX, maxY);
    if (changed && !this.hitBox.destroyed && this.cameraDerivedHitBoxes === 0) this.requestRetarget();
  }

  /**
   * Runs `update` with the hit box changes it makes counted as following the camera: a label or a stroke whose world
   * size follows the zoom (`BlockConnection`'s label). They ask for no retarget: camera moves keep today's rule
   * (`retargetHoverOnCameraChange`), so the target changes at the next pointer move. Changes
   * outside `update`, and those of other components (an API move in the same frame), still ask.
   */
  protected withCameraDerivedHitBox(update: () => void): void {
    this.cameraDerivedHitBoxes += 1;
    try {
      update();
    } finally {
      this.cameraDerivedHitBoxes -= 1;
    }
  }

  protected override willIterate(): void {
    super.willIterate();
    if (!this.firstIterate) this.shouldRender = true;
  }

  protected override isRenderAllowed(): boolean {
    return !this.hidden;
  }

  /**
   * Without viewport culling, a graph component paints when the camera sees its hit box. A detached component also
   * needs its host to walk its children, as with culling.
   */
  public override isInViewport(): boolean {
    if (this.isCulledByViewport()) return super.isInViewport();
    return super.isInViewport() && this.context.camera.isRectVisible(...this.getHitBox());
  }

  /** Whether this component can paint now: not hidden and inside the viewport. */
  protected isVisible(): boolean {
    return this.isRenderAllowed() && this.isInViewport();
  }

  protected getHitBoxRect(): TRect {
    const [x, y, width, height] = this.getHitBox();
    return { x, y, width, height };
  }

  /**
   * The explicit visibility input. Hidden here, a component stays hidden while it is delegated and after its
   * delegation ends, and a delegated one stays delegated through a hide and its end: the two inputs are separate.
   * With `removeHitbox` its hit box is out until it shows again, delegated or not.
   */
  protected setVisibility(visible: boolean, { removeHitbox }: { removeHitbox: boolean }): void {
    const hidden = !visible;
    if (this.visibilityHidden === hidden) return;
    this.visibilityHidden = hidden;
    // What a still pointer hits changes: a hidden scene component is a hit barrier for its subtree
    // (`SceneComponent.isHitBarrier`), with or without a hit box change.
    this.requestRetarget();
    if (hidden && removeHitbox) {
      this.removeHitBox();
      // Kept out through geometry updates until the component shows again.
      this.hitBoxSuppressed = true;
      this.suppressedHitBox = undefined;
    } else if (!hidden && this.hitBoxSuppressed) {
      this.restoreHitBox(removeHitbox);
    }
    this.applyHidden();
  }

  /** Whether it is hidden for a reason other than delegation: `setVisibility(false, …)`; subclasses add theirs. */
  public isHiddenForOtherReason(): boolean {
    return this.visibilityHidden;
  }

  /**
   * Called when the derived hidden state changes (`setVisibility`, `setRenderDelegated`), after `hidden` is set and
   * before the queued render. A no-op; a subclass with state that follows it updates here (`BlockConnection`'s line).
   */
  protected hiddenChanged(_hidden: boolean): void {
    // Nothing by default.
  }

  /** Derives `hidden` from the two inputs. */
  private applyHidden(): void {
    const hidden = this.visibilityHidden || this.renderDelegated;
    if (hidden !== this.hidden) {
      this.hidden = hidden;
      this.shouldRender = !hidden;
      this.hiddenChanged(hidden);
    }
    // An input changed: a scene component writes its element again (its hidden flag, its hit barrier).
    this.performRender();
  }

  /**
   * Ends the suppression of `setVisibility(false, { removeHitbox: true })`: the box set meanwhile comes back, or with
   * `removeHitbox` the box it had; none when `removeHitBox` took it away meanwhile.
   */
  private restoreHitBox(removeHitbox: boolean): void {
    const box = this.suppressedHitBox;
    this.hitBoxSuppressed = false;
    this.suppressedHitBox = undefined;
    if (box === null) return;
    if (box) {
      this.setHitBox(box[0], box[1], box[2], box[3], true);
    } else if (removeHitbox) {
      const { x, y, width, height } = this.getHitBoxRect();
      this.setHitBox(x, y, x + width, y + height, true);
    }
  }

  /**
   * The low-level "something else draws this component" switch, the delegation input: it is not drawn and keeps its
   * hit box. A scene component and its sub-components are then hit on every level
   * (`SceneComponent.isShownOutsideScene`), except those under one hidden for another reason
   * (`SceneComponent.isHitBarrier`). It writes no visibility of its own: a component hidden by `setVisibility` stays
   * hidden when its delegation ends.
   */
  public setRenderDelegated(delegated: boolean): void {
    if (this.renderDelegated === delegated) return;
    this.renderDelegated = delegated;
    // Shown outside the scene or not changes what a still pointer hits.
    this.requestRetarget();
    this.applyHidden();
  }

  /** Whether its drawing is delegated now (`setRenderDelegated`); `Block` adds an HTML view's hold. */
  public isRenderDelegated(): boolean {
    return this.renderDelegated;
  }

  public getHitBox() {
    return this.hitBox.getRect();
  }

  public removeHitBox(): void {
    if (this.hitBoxSuppressed) {
      // Out already; nothing comes back when the component shows again.
      this.suppressedHitBox = null;
      return;
    }
    this.hitBox.remove();
    if (this.hitBoxRemoved || !this.hitBoxSet) return;
    this.hitBoxRemoved = true;
    if (this.cameraDerivedHitBoxes === 0) this.requestRetarget();
  }

  /** Asks the input service to find the pointer's target again at the frame's end. */
  protected requestRetarget(): void {
    (this.context.graph as Partial<Graph>).input?.hover.requestRetarget();
  }

  /**
   * Puts `hoveredTag` on this component's own entity, or takes it off. `hoveredTag` is a styling tool: a component
   * decides itself when it shows as hovered, from the pointer events it gets and those bubbling up from its
   * descendants (`target`, `relatedTarget`). It writes only its own entity; without an entity address
   * (no `static entityType`) there is nothing to write. No library code reads the tag to decide behaviour.
   */
  protected setHoveredTag(hovered: boolean): void {
    if (hovered === this.hoveredTagged) return;
    const address = getEntityAddress(this);
    if (!address) return;
    this.hoveredTagged = hovered;
    const { tags } = this.context.graph.scene;
    if (hovered) tags.add(hoveredTag, { [address.type]: [address.id] });
    else tags.delete(hoveredTag, { [address.type]: [address.id] });
  }

  public destroyHitBox() {
    this.hitBox.destroy();
  }

  public onHitBox(_data: HitBoxData): boolean {
    return this.isIterated();
  }
}
