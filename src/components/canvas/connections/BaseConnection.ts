import { Component } from "../../../lib";
import { TComponentState } from "../../../lib/Component";
import { ConnectionState, TConnection, TConnectionId } from "../../../store/connection/ConnectionState";
import { selectConnectionById } from "../../../store/connection/selectors";
import { TPoint } from "../../../utils/types/shapes";
import { GraphComponent, GraphComponentContext } from "../GraphComponent";
import { TAnchor } from "../anchors";
import { Block } from "../blocks/Block";

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
 * Automatically subscribes to port changes and updates connection geometry when
 * source or target positions change.
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
  protected get sourceBlock(): Block {
    return this.connectedState.$sourcePortState.value.component as Block;
  }

  /**
   * @deprecated use port system instead
   */
  protected get targetBlock(): Block {
    return this.connectedState.$targetPortState.value.component as Block;
  }

  /**
   * @deprecated use port system instead
   */
  protected get sourceAnchor(): TAnchor | undefined {
    return this.sourceBlock.connectedState.getAnchorById(this.connectedState.sourceAnchorId)?.asTAnchor();
  }

  /**
   * @deprecated use port system instead
   */
  protected get targetAnchor(): TAnchor | undefined {
    return this.targetBlock.connectedState.getAnchorById(this.connectedState.targetAnchorId)?.asTAnchor();
  }

  /**
   * Calculated connection endpoints based on port positions
   * Updated automatically when source or target ports change position
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
  protected bBox: [minX: number, minY: number, maxX: number, maxY: number];

  constructor(props: Props, parent: Component) {
    super(props, parent);

    // Get reactive connection state from the store
    this.connectedState = selectConnectionById(this.context.graph, this.props.id) as ConnectionState<Connection>;
    this.connectedState.setViewComponent(this);

    // Subscribe to port changes for automatic geometry updates
    this.connectedState.$sourcePortState.value.addObserver(this);
    this.connectedState.$targetPortState.value.addObserver(this);

    // Initialize component state with connection data
    this.setState({ ...(this.connectedState.$state.value as TBaseConnectionState), hovered: false });
  }

  protected willMount(): void {
    // Subscribe to connection state changes for automatic updates
    this.subscribeSignal(this.connectedState.$state, (state) => {
      this.setState({ ...state });
    });

    // Subscribe to geometry changes to update connection points
    this.subscribeSignal(this.connectedState.$geometry, () => {
      this.updatePoints();
    });

    // Enable hover interaction
    this.listenEvents(["mouseenter", "mouseleave"]);
  }

  protected override handleEvent(event) {
    event.stopPropagation();
    super.handleEvent(event);

    switch (event.type) {
      case "mouseenter":
        this.setState({ hovered: true });
        break;
      case "mouseleave":
        this.setState({ hovered: false });
        break;
    }
  }

  protected override unmount(): void {
    this.connectedState.$sourcePortState.value.removeObserver(this);
    this.connectedState.$targetPortState.value.removeObserver(this);
    super.unmount();
  }

  /**
   * Updates connection points based on current port positions
   * Called automatically when port geometry changes
   *
   * This method:
   * 1. Retrieves current port positions from the Port System
   * 2. Updates connectionPoints for rendering
   * 3. Recalculates bounding box for optimization
   * 4. Updates hit box for interaction
   *
   * @returns {void}
   */
  protected updatePoints(): void {
    // Initialize with default points
    this.connectionPoints = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];

    // Update with actual port positions if available
    if (this.connectedState.$geometry.value) {
      const [source, target] = this.connectedState.$geometry.value;
      this.connectionPoints = [
        { x: source.x, y: source.y },
        { x: target.x, y: target.y },
      ];
    }

    // Calculate bounding box from valid coordinates
    const x = [this.connectionPoints[0].x, this.connectionPoints[1].x].filter(Number.isFinite);
    const y = [this.connectionPoints[0].y, this.connectionPoints[1].y].filter(Number.isFinite);

    this.bBox = [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];

    // Update interaction area
    this.updateHitBox();
  }

  /**
   * Get the current bounding box of the connection
   * @returns Readonly tuple of [sourceX, sourceY, targetX, targetY]
   */
  protected getBBox(): Readonly<[sourceX: number, sourceY: number, targetX: number, targetY: number]> {
    return this.bBox;
  }

  /**
   * Updates the hit box for user interaction
   * Adds threshold padding around the connection line to make it easier to click
   *
   * @returns {void}
   */
  private updateHitBox = (): void => {
    const [x1, y1, x2, y2] = this.getBBox();
    const threshold = this.context.constants.connection.THRESHOLD_LINE_HIT;
    this.setHitBox(
      Math.min(x1, x2) - threshold,
      Math.min(y1, y2) - threshold,
      Math.max(x1, x2) + threshold,
      Math.max(y1, y2) + threshold
    );
  };
}
