import { Signal } from "@preact/signals-core";

import { Graph } from "../../../graph";
import { GraphEventsDefinitions } from "../../../graphEvents";
import { Component } from "@gravity-ui/graph-canvas-core";
import { TComponentContext, TComponentProps, TComponentState } from "@gravity-ui/graph-canvas-core";
import { HitBox, HitBoxData } from "../../../services/HitTest";
import { DragContext, DragDiff } from "../../../services/drag";
import { PortState, TPort, TPortId } from "../../../store/connection/port/Port";
import { applyAlpha, getXY } from "../../../utils/functions";
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
  public isDraggable(): boolean {
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

  public get affectsUsableRect() {
    return this.props.affectsUsableRect ?? this.context.affectsUsableRect ?? true;
  }

  private mounted = false;

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
    if (!this.ports.has(id)) {
      return this.createPort(id);
    }
    return this.ports.get(id);
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
      this.hitBox.setAffectsUsableRect(_nextProps.affectsUsableRect);
      this.setContext({ affectsUsableRect: _nextProps.affectsUsableRect });
    }
    super.propsChanged(_nextProps);
  }

  protected contextChanged(_nextContext: Context): void {
    // If affectsUsableRect changed in context and there's no explicit prop override
    if (
      this.firstRender ||
      (this.context.affectsUsableRect !== _nextContext.affectsUsableRect && this.props.affectsUsableRect === undefined)
    ) {
      this.hitBox.setAffectsUsableRect(_nextContext.affectsUsableRect);
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
      this.dispatchEvent(new Event("graph-component-change"));
      return true;
    }
    return false;
  }

  protected onDrag({
    onDragStart,
    onDragUpdate,
    onDrop,
    isDraggable,
    autopanning,
    dragCursor,
  }: {
    onDragStart?: (_event: MouseEvent) => void | boolean;
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
      _event: MouseEvent
    ) => void;
    onDrop?: (_event: MouseEvent) => void;
    isDraggable?: (event: MouseEvent) => boolean;
    autopanning?: boolean;
    dragCursor?: CursorLayerCursorTypes;
  }) {
    let startCoords: [number, number];
    let prevCoords: [number, number];
    return this.addEventListener("mousedown", (event: MouseEvent) => {
      if (!isDraggable?.(event)) {
        return;
      }
      event.stopPropagation();
      this.context.graph.dragService.startDrag(
        {
          onStart: (event: MouseEvent) => {
            if (onDragStart?.(event) === false) {
              return;
            }
            const xy = getXY(this.context.canvas, event);
            startCoords = this.context.camera.applyToPoint(xy[0], xy[1]);
            prevCoords = startCoords;
          },
          onUpdate: (event: MouseEvent) => {
            if (!startCoords?.length) return;

            const [canvasX, canvasY] = getXY(this.context.canvas, event);
            const currentCoords = this.context.camera.applyToPoint(canvasX, canvasY);

            // Absolute diff from drag start
            const diffX = currentCoords[0] - startCoords[0];
            const diffY = currentCoords[1] - startCoords[1];

            // Incremental diff from previous frame
            const deltaX = currentCoords[0] - prevCoords[0];
            const deltaY = currentCoords[1] - prevCoords[1];

            onDragUpdate?.({ startCoords, prevCoords, currentCoords, diffX, diffY, deltaX, deltaY }, event);
            prevCoords = currentCoords;
          },
          onEnd: (event: MouseEvent) => {
            startCoords = undefined;
            prevCoords = undefined;
            onDrop?.(event);
          },
        },
        {
          component: this,
          autopanning: autopanning ?? true,
          cursor: dragCursor ?? "grabbing",
        }
      );
    });
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
  protected onGraphEvent<EventName extends keyof GraphEventsDefinitions, Cb extends GraphEventsDefinitions[EventName]>(
    eventName: EventName,
    handler: Cb,
    options?: AddEventListenerOptions | boolean
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
    handler: ((this: HTMLElement, ev: HTMLElementEventMap[K]) => void) | EventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): () => void {
    const root = this.context.root;
    if (!root) {
      throw new Error("Attempt to add event listener to non-existent root element");
    }

    const listener =
      typeof handler === "function"
        ? (handler as (this: HTMLElement, ev: HTMLElementEventMap[K]) => void)
        : (handler as EventListenerObject);

    root.addEventListener(eventName, listener, options);

    const unsubscribe = () => {
      root.removeEventListener(eventName, listener, options);
    };

    this.unsubscribe.push(unsubscribe);

    return unsubscribe;
  }

  protected subscribeSignal<T>(signal: Signal<T>, cb: (v: T) => void) {
    this.unsubscribe.push(signal.subscribe(cb));
  }

  public onUnmounted(cb: () => void) {
    return this.addEventListener("graph-component-unmounted", cb);
  }

  protected unmount() {
    super.unmount();
    this.unsubscribe.forEach((cb) => cb());
    this.ports.forEach((port) => {
      this.context.graph.rootStore.connectionsList.releasePort(port.id, this);
    });
    this.ports.clear();
    this.destroyHitBox();
    this.mounted = false;
    this.dispatchEvent(new CustomEvent("graph-component-unmounted", { detail: { component: this } }));
  }

  public setHitBox(minX: number, minY: number, maxX: number, maxY: number, force?: boolean) {
    this.hitBox.update(minX, minY, maxX, maxY, force);
  }

  protected willIterate(): void {
    super.willIterate();
    if (!this.firstIterate) {
      this.shouldRender = this.isVisible();
    }
  }

  protected isVisible() {
    return this.context.camera.isRectVisible(...this.getHitBox());
  }

  public getHitBox() {
    return this.hitBox.getRect();
  }

  public removeHitBox() {
    this.hitBox.remove();
  }

  public destroyHitBox() {
    this.hitBox.destroy();
  }

  public onHitBox(_: HitBoxData) {
    return this.isIterated();
  }
}
