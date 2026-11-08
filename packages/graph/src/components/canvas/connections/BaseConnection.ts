import { Component, ESchedulerPriority } from "../../../lib";
import { TComponentState } from "../../../lib/Component";
import { ConnectionState, TConnection, TConnectionId } from "../../../store/connection/ConnectionState";
import { debounce } from "../../../utils/functions";
import { TPoint, TRect } from "../../../utils/types/shapes";
import { GraphComponent, GraphComponentContext } from "../GraphComponent";
import { TAnchor } from "../anchors";
import { Block } from "../blocks/Block";

import { hasChangedValue } from "./hasChangedValue";

/**
 * Properties for BaseConnection component
 */
export type TBaseConnectionProps = {
  /** Unique identifier for the connection */
  id: TConnectionId;
};

/**
 * State interface for BaseConnection component
 * Combines component state with connection data and interaction states
 */
export type TBaseConnectionState = TComponentState &
  TConnection & {
    /** Whether the connection is currently being hovered */
    hovered?: boolean;
  };

/**
 * BaseConnection - Foundation class for all connection types in @gravity-ui/graph
 *
 * Provides core functionality for connection components including:
 * - Integration with the Port System for reliable connection points
 * - Automatic state synchronization with ConnectionState
 * - Reactive geometry updates when ports change
 * - HitBox management for user interaction
 *
 * ## Key Features:
 *
 * ### Port System Integration
 * Uses the Port System to resolve connection endpoints, which solves the initialization
 * order problem where connections can be created before blocks/anchors are ready.
 *
 * ### Reactive Updates
 * Subscribes to port changes. When a source or target position changes, the geometry is recomputed in the
 * connection's next update, once per frame however many endpoints moved. Call `updateGeometry()` for the
 * synchronous path.
 *
 * ### Event Handling
 * Provides hover state management and can be extended for custom interaction handling.
 *
 * ## Usage:
 *
 * BaseConnection is typically used as a base class for more specific connection types.
 * For most use cases, prefer BlockConnection which extends this with optimized rendering.
 *
 * @example
 * ```typescript
 * class SimpleConnection extends BaseConnection {
 *   protected render() {
 *     if (!this.connectionPoints) return;
 *
 *     const [source, target] = this.connectionPoints;
 *     const ctx = this.context.ctx;
 *
 *     ctx.beginPath();
 *     ctx.moveTo(source.x, source.y);
 *     ctx.lineTo(target.x, target.y);
 *     ctx.stroke();
 *   }
 * }
 * ```
 *
 * @see {@link BlockConnection} For production-ready connection implementation
 * @see {@link ConnectionState} For connection data management
 * @see {@link PortState} For port system details
 */
export class BaseConnection<
  Props extends TBaseConnectionProps = TBaseConnectionProps,
  State extends TBaseConnectionState = TBaseConnectionState,
  Context extends GraphComponentContext = GraphComponentContext,
  Connection extends TConnection = TConnection,
> extends GraphComponent<Props, State, Context> {
  /**
   * @deprecated use port system instead
   */
  protected get sourceBlock(): Block | undefined {
    return this.connectedState.$sourceBlock.value?.getViewComponent();
  }

  /**
   * @deprecated use port system instead
   */
  protected get targetBlock(): Block | undefined {
    return this.connectedState.$targetBlock.value?.getViewComponent();
  }

  /**
   * @deprecated use port system instead
   */
  protected get sourceAnchor(): TAnchor | undefined {
    const id = this.connectedState.sourceAnchorId;
    return id === undefined ? undefined : this.sourceBlock?.connectedState.getAnchorById(id)?.asTAnchor();
  }

  /**
   * @deprecated use port system instead
   */
  protected get targetAnchor(): TAnchor | undefined {
    const id = this.connectedState.targetAnchorId;
    return id === undefined ? undefined : this.targetBlock?.connectedState.getAnchorById(id)?.asTAnchor();
  }

  /**
   * Calculated connection endpoints based on port positions
   * Endpoint moves are applied in the next update (once per frame); `updateGeometry()` applies them synchronously
   */
  public connectionPoints: [TPoint, TPoint] | undefined;

  /**
   * Reference to the reactive connection state from the store
   * Provides access to connection data and port references
   */
  protected connectedState: ConnectionState<Connection>;

  /**
   * Bounding box for the connection [minX, minY, maxX, maxY]
   * Used for hit detection and rendering optimizations
   */
  protected bBox: [minX: number, minY: number, maxX: number, maxY: number] = [0, 0, 0, 0];

  /** An endpoint moved: the next update recomputes the geometry once, with every pending change applied. */
  protected geometryDirty = false;

  private hitBoxNeedsRestore = true;

  constructor(props: Props, parent: Component) {
    super(props, parent);

    // Get reactive connection state from the store
    const connectionState = this.context.graph.rootStore.connectionsList.getConnectionState(this.props.id);
    if (!connectionState) throw new Error(`Cannot bind Connection to missing connection ${this.props.id}`);
    this.connectedState = connectionState as ConnectionState<Connection>;
    this.connectedState.setViewComponent(this);

    // Initialize component state with connection data
    this.setState({ ...(this.connectedState.$state.value as TBaseConnectionState), hovered: false });
  }

  public getEntityId() {
    return this.props.id;
  }

  protected willMount(): void {
    // Subscriptions fire once while mounting, with the values this component already applied: they request an update
    // only for changes. Otherwise every connection would run an empty update in its second frame.
    let mounting = true;
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      if (selected !== this.getState().selected) this.setState({ selected });
    });
    this.subscribeSignal(this.connectedState.$state, (state) => {
      if (hasChangedValue<TConnection>(state, this.getState())) this.setState({ ...state });
    });

    // Endpoints: the first value is applied now; later moves recompute once in the next update, so moving both
    // endpoints in one frame costs one recomputation.
    this.subscribeSignal(this.connectedState.$geometry, () => {
      if (mounting) {
        this.updatePoints();
        return;
      }
      this.geometryDirty = true;
      this.performRender();
    });

    // When both endpoints are hidden (e.g. both blocks inside a collapsed group)
    // Schedule an update so component and batch visibility use the new hidden state.
    this.subscribeSignal(this.connectedState.$hidden, () => {
      if (!mounting) this.performRender();
    });
    mounting = false;

    // Enable hover interaction
    this.listenEvents(["mouseenter", "mouseleave"]);
  }

  protected override checkData(): boolean {
    const changed = super.checkData();
    if (this.geometryDirty) this.updatePoints();
    return changed;
  }

  public override isEntityAvailable(): boolean {
    return super.isEntityAvailable() && this.connectedState.isAttached();
  }

  protected hasGeometry(): boolean {
    return this.connectedState.$geometry.value !== undefined;
  }

  protected override isRenderAllowed(): boolean {
    if (!this.isEntityAvailable() || !this.hasGeometry()) return false;
    if (this.connectedState.$hidden.value) return false;
    return super.isRenderAllowed();
  }

  protected override handleEvent(event: MouseEvent) {
    event.stopPropagation();
    super.handleEvent(event);

    switch (event.type) {
      case "mouseenter":
        this.debounceHover(true);
        break;
      case "mouseleave":
        this.debounceHover(false);
        break;
    }
  }

  protected onHoverChange(hoverState: boolean) {
    if (hoverState === this.state.hovered) {
      return;
    }
    this.setState({ hovered: hoverState });
  }

  private unmounted = false;

  protected override unmount(): void {
    // Late geometry refreshes must not register an unmounted connection with the batch again.
    this.unmounted = true;
    // A pending hover update would keep the unmounted graph reachable from the global scheduler.
    this.debounceHover.cancel();
    super.unmount();
  }

  protected debounceHover = debounce(
    (hovered: boolean) => {
      this.onHoverChange(hovered);
    },
    {
      priority: ESchedulerPriority.LOWEST,
      frameInterval: 3,
      frameTimeout: 0,
    }
  );

  /**
   * Rebuilds this connection's geometry from its current state, props and endpoints and redraws it:
   * the shape, bounds, hit box and culling bounds. State, props and endpoint changes do this
   * automatically, once per frame; call it when the geometry or the bounds read data that changed elsewhere.
   * `batch.markDirty()` alone only rebuilds the renderer's chunk from the connection's cached geometry.
   */
  public updateGeometry(): void {
    if (this.unmounted) return;
    this.updatePoints();
    this.performRender();
  }

  /**
   * Reads the current port positions into `connectionPoints`, then recalculates the bounding box and hit box.
   * Runs in the next update after an endpoint moves; `updateGeometry()` runs it synchronously.
   */
  protected updatePoints(additionalPoints?: TPoint[], props: Props = this.props): void {
    this.readConnectionPoints();
    this.updateBounds(additionalPoints, props);
  }

  /** Copies the current port positions into `connectionPoints` and clears the pending geometry update. */
  protected readConnectionPoints(): void {
    this.geometryDirty = false;
    const geometry = this.connectedState.$geometry.value;
    this.connectionPoints = geometry ? [{ ...geometry[0] }, { ...geometry[1] }] : undefined;
  }

  protected updateBounds(additionalPoints?: TPoint[], props: Props = this.props): void {
    if (!this.isEntityAvailable() || !this.hasGeometry()) {
      this.bBox = [0, 0, 0, 0];
      this.removeHitBox();
      this.hitBoxNeedsRestore = true;
      this.performRender();
      return;
    }

    // Calculate bounding box from connection points, additional points, and subclass points
    const points = this.collectBBoxPoints(props);

    if (additionalPoints) {
      points.push(...additionalPoints);
    }

    const x = points.map((p) => p.x).filter(Number.isFinite);
    const y = points.map((p) => p.y).filter(Number.isFinite);

    this.bBox = x.length && y.length ? [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)] : [0, 0, 0, 0];

    // Update interaction area
    this.updateHitBox();
  }

  /**
   * Collects points that define the bounding box of the connection.
   * Override in subclasses to include additional points (e.g., bezier control points, labels).
   */
  protected collectBBoxPoints(_props: Props = this.props): TPoint[] {
    if (!this.connectionPoints) {
      return [];
    }
    return [this.connectionPoints[0], this.connectionPoints[1]];
  }

  /**
   * Get the current bounding box of the connection
   * @returns Readonly tuple of [sourceX, sourceY, targetX, targetY]
   */
  protected getBBox(): Readonly<[sourceX: number, sourceY: number, targetX: number, targetY: number]> {
    return this.bBox;
  }

  /**
   * Get the current bounding box of the connection as a TRect.
   */
  protected override getHitBoxRect(): TRect {
    const [minX, minY, maxX, maxY] = this.getBBox();
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Updates the hit box for user interaction
   * Adds threshold padding around the connection line to make it easier to click
   *
   * @returns {void}
   */
  private updateHitBox = (): void => {
    const { x, y, width, height } = this.getHitBoxRect();
    const threshold = this.context.constants.connection.THRESHOLD_LINE_HIT;
    this.setHitBox(
      x - threshold,
      y - threshold,
      x + width + threshold,
      y + height + threshold,
      this.hitBoxNeedsRestore
    );
    this.hitBoxNeedsRestore = false;
  };
}
