import RBush from "rbush";

import { GraphMouseEvent, extractNativeGraphMouseEvent, isGraphEvent } from "../../../../graphEvents";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { ESelectionStrategy } from "../../../../services/selection/types";
import { AnchorState } from "../../../../store/anchor/Anchor";
import { BlockState, TBlockId } from "../../../../store/block/Block";
import { PortState } from "../../../../store/connection/port/Port";
import { createAnchorPortId, createBlockPointPortId } from "../../../../store/connection/port/utils";
import { isBlock, isShiftKeyEvent } from "../../../../utils/functions";
import { render } from "../../../../utils/renderers/render";
import { renderSVG } from "../../../../utils/renderers/svgPath";
import { Point, TPoint } from "../../../../utils/types/shapes";
import { Anchor } from "../../../canvas/anchors";
import { Block } from "../../../canvas/blocks/Block";
import { GraphComponent } from "../../GraphComponent";

/**
 * Default search radius for port snapping in pixels
 * Ports within this radius will be considered for snapping
 */
const SNAP_SEARCH_RADIUS = 20;

/**
 * Snap condition function type
 * Used by ConnectionLayer to determine if a port can snap to another port
 * Note: sourceComponent and targetComponent can be accessed via sourcePort.component and targetPort.component
 */
export type TPortSnapCondition = (context: {
  sourcePort: PortState;
  targetPort: PortState;
  cursorPosition: TPoint;
  distance: number;
}) => boolean;

/**
 * Optional metadata structure for port snapping
 * ConnectionLayer interprets this structure for port snapping behavior
 *
 * @example
 * ```typescript
 * const snapMeta: IPortSnapMeta = {
 *   snappable: true,
 *   snapCondition: (ctx) => {
 *     // Access components via ports
 *     const sourceComponent = ctx.sourcePort.component;
 *     const targetComponent = ctx.targetPort.component;
 *     // Custom validation logic
 *     return true;
 *   }
 * };
 * ```
 */
export interface IPortSnapMeta {
  /** Enable snapping for this port. If false or undefined, port will not participate in snapping */
  snappable?: boolean;
  /** Custom condition for snapping - access components via sourcePort.component and targetPort.component */
  snapCondition?: TPortSnapCondition;
}

type TIcon = {
  path: string;
  fill?: string;
  stroke?: string;
  width: number;
  height: number;
  viewWidth: number;
  viewHeight: number;
};

type LineStyle = {
  color: string;
  dash: number[];
};

type DrawLineFunction = (start: TPoint, end: TPoint) => { path: Path2D; style: LineStyle };

type SnappingPortBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  port: PortState;
};

type ConnectionLayerProps = LayerProps & {
  createIcon?: TIcon;
  point?: TIcon;
  drawLine?: DrawLineFunction;
  isConnectionAllowed?: (sourceComponent: BlockState | AnchorState) => boolean;
};

declare module "../../../../graphEvents" {
  interface GraphEventsDefinitions {
    /**
     * Fired when a user initiates a connection from a block or anchor.
     * This happens when dragging starts from a block (with Shift key) or an anchor.
     * Preventing this event will prevent the selection of the source component.
     */
    "connection-create-start": (
      event: CustomEvent<{
        blockId: TBlockId;
        anchorId: string | undefined;
      }>
    ) => void;

    /**
     * Fired when the dragged connection endpoint hovers over a potential target block or anchor.
     * Preventing this event will prevent the selection of the target component.
     */
    "connection-create-hover": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId: string | undefined;
        targetBlockId: TBlockId | undefined;
        targetAnchorId: string | undefined;
      }>
    ) => void;

    /**
     * Fired when a connection is successfully created between two elements.
     * By default, this adds the connection to the connectionsList in the store.
     * Preventing this event will prevent the connection from being added to the store.
     */
    "connection-created": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId?: string;
        targetBlockId: TBlockId;
        targetAnchorId?: string;
      }>
    ) => void;

    /**
     * Fired when the user releases the mouse button to complete the connection process.
     * This event fires regardless of whether a valid connection was established.
     * Can be used for cleanup or to handle custom connection drop behavior.
     */
    "connection-create-drop": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId: string;
        targetBlockId?: TBlockId;
        targetAnchorId?: string;
        point: Point;
      }>
    ) => void;
  }
}

/**
 * ConnectionLayer manages the creation process of connections between blocks and anchors in the graph.
 * It handles the temporary visualization during connection creation but does not render existing connections.
 *
 * Features:
 * - Interactive connection creation through drag and drop
 * - Temporary visualization during connection creation with configurable icons and line styles
 * - Automatic selection handling of source and target elements
 * - Comprehensive event system for the connection creation lifecycle
 * - Optional connection validation through isConnectionAllowed prop
 *
 * Connection types:
 * - Block-to-Block: Hold Shift key and drag from one block to another
 * - Anchor-to-Anchor: Drag from one anchor to another (must be on different blocks)
 *
 * The layer renders on a separate canvas with a higher z-index and handles
 * all mouse interactions for connection creation.
 */
export class ConnectionLayer extends Layer<
  ConnectionLayerProps,
  LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  private startState: Point | null = null;
  private endState: Point | null = null;

  protected target?: Block | Anchor;
  protected sourceComponent?: BlockState | AnchorState;
  protected enabled: boolean;
  private declare eventAborter: AbortController;

  // Port snapping support
  private snappingPortsTree: RBush<SnappingPortBox> | null = null;
  private isSnappingTreeOutdated = true;
  private portsUnsubscribe?: () => void;

  constructor(props: ConnectionLayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true, // Automatically apply camera transformation
        ...props.canvas,
      },
      ...props,
    });

    this.setContext({
      canvas: this.getCanvas(),
      graphCanvas: props.graph.getGraphCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      camera: props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
    });

    this.enabled = Boolean(this.props.graph.rootStore.settings.getConfigFlag("canCreateNewConnections"));

    this.onSignal(this.props.graph.rootStore.settings.$settings, (value) => {
      this.enabled = Boolean(value.canCreateNewConnections);
    });
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    // Register event listeners with the graphOn wrapper method for automatic cleanup when unmounted
    this.onGraphEvent("mousedown", this.handleMouseDown);

    // Subscribe to ports changes to mark snapping tree as outdated
    // We'll mark the tree as outdated when ports change by polling
    // Note: Direct subscription to internal signal requires access to connectionsList.ports
    const checkPortsChanged = () => {
      this.isSnappingTreeOutdated = true;
    };

    // Subscribe through the Layer's onSignal helper which handles cleanup
    this.portsUnsubscribe = this.onSignal(this.context.graph.rootStore.connectionsList.ports.$ports, checkPortsChanged);

    // Call parent afterInit to ensure proper initialization
    super.afterInit();
  }

  public enable = () => {
    this.enabled = true;
  };

  public disable = () => {
    this.enabled = false;
  };

  protected checkIsShouldStartCreationConnection(target: GraphComponent, initEvent: MouseEvent) {
    if (!this.enabled) {
      return false;
    }
    if (this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors")) {
      return target instanceof Anchor;
    }
    if (isShiftKeyEvent(initEvent) && isBlock(target)) {
      return true;
    }
    return false;
  }

  protected handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const target = nativeEvent.detail.target;
    const initEvent = extractNativeGraphMouseEvent(nativeEvent);
    if (!initEvent || !target || !this.root?.ownerDocument) {
      return;
    }

    if (
      this.checkIsShouldStartCreationConnection(target as GraphComponent, initEvent) &&
      (isBlock(target) || target instanceof Anchor)
    ) {
      // Get the source component state
      const sourceComponent = target.connectedState;

      // Check if connection is allowed using the validation function if provided
      if (this.props.isConnectionAllowed && !this.props.isConnectionAllowed(sourceComponent)) {
        return;
      }

      if (isGraphEvent(nativeEvent)) {
        nativeEvent.stopGraphEventPropagation();
      }
      this.context.graph.dragService.startDrag(
        {
          onStart: (_event, coords) => this.onStartConnection(target, new Point(coords[0], coords[1])),
          onUpdate: (event, coords) => this.onMoveNewConnection(event, new Point(coords[0], coords[1])),
          onEnd: (_event, coords) => this.onEndNewConnection(new Point(coords[0], coords[1])),
        },
        { cursor: "crosshair" }
      );
    }
  };

  protected renderEndpoint(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();

    // Icons should remain constant size on screen, so scale them inversely to camera scale
    const scale = this.context.camera.getCameraScale();
    const iconSize = 24 / scale;
    const iconOffset = 12 / scale;

    if (!this.target && this.props.createIcon && this.endState) {
      renderSVG(
        {
          path: this.props.createIcon.path,
          width: this.props.createIcon.width,
          height: this.props.createIcon.height,
          iniatialWidth: this.props.createIcon.viewWidth,
          initialHeight: this.props.createIcon.viewHeight,
        },
        ctx,
        { x: this.endState.x, y: this.endState.y - iconOffset, width: iconSize, height: iconSize }
      );
    } else if (this.props.point) {
      ctx.fillStyle = this.props.point.fill || this.context.colors.canvas.belowLayerBackground;
      if (this.props.point.stroke) {
        ctx.strokeStyle = this.props.point.stroke;
      }

      renderSVG(
        {
          path: this.props.point.path,
          width: this.props.point.width,
          height: this.props.point.height,
          iniatialWidth: this.props.point.viewWidth,
          initialHeight: this.props.point.viewHeight,
        },
        ctx,
        { x: this.endState.x, y: this.endState.y - iconOffset, width: iconSize, height: iconSize }
      );
    }
    ctx.closePath();
  }

  protected render() {
    this.resetTransform();
    if (!this.startState || !this.endState) {
      return;
    }

    // Line width should remain constant on screen regardless of camera scale
    const scale = this.context.camera.getCameraScale();
    this.context.ctx.lineWidth = Math.round(2 / scale);

    if (this.props.drawLine) {
      const { path, style } = this.props.drawLine(this.startState, this.endState);

      this.context.ctx.strokeStyle = style.color;
      this.context.ctx.setLineDash(style.dash);
      this.context.ctx.stroke(path);
    } else {
      this.context.ctx.beginPath();
      this.context.ctx.strokeStyle = this.context.colors.connection.selectedBackground;
      this.context.ctx.moveTo(this.startState.x, this.startState.y);
      this.context.ctx.lineTo(this.endState.x, this.endState.y);
      this.context.ctx.stroke();
      this.context.ctx.closePath();
    }

    render(this.context.ctx, (ctx) => {
      this.renderEndpoint(ctx);
    });
  }

  private getBlockId(component: BlockState | AnchorState) {
    if (component instanceof AnchorState) {
      return component.blockId;
    }
    return component.id;
  }

  private getAnchorId(component: BlockState | AnchorState) {
    if (component instanceof AnchorState) {
      return component.id;
    }
    return undefined;
  }

  private onStartConnection(sourceComponent: Block | Anchor, worldCoords: Point) {
    if (!sourceComponent) {
      return;
    }
    this.sourceComponent = sourceComponent.connectedState;
    if (sourceComponent instanceof Block) {
      this.startState = new Point(worldCoords.x, worldCoords.y);
    } else if (sourceComponent instanceof Anchor) {
      const point = sourceComponent.getPosition();
      this.startState = new Point(point.x, point.y);
    }

    this.context.graph.executеDefaultEventAction(
      "connection-create-start",
      {
        blockId:
          sourceComponent instanceof Anchor
            ? sourceComponent.connectedState.blockId
            : sourceComponent.connectedState.id,
        anchorId: sourceComponent instanceof Anchor ? sourceComponent.connectedState.id : undefined,
      },
      () => {
        if (sourceComponent instanceof Block) {
          this.context.graph.api.selectBlocks([this.sourceComponent.id], true, ESelectionStrategy.REPLACE);
        } else if (sourceComponent instanceof Anchor) {
          this.context.graph.api.setAnchorSelection(sourceComponent.props.blockId, sourceComponent.props.id, true);
        }
      }
    );

    this.performRender();
  }

  private onMoveNewConnection(event: MouseEvent, point: Point) {
    if (!this.startState || !this.sourceComponent) {
      return;
    }

    // Get source port
    const sourcePort = this.getSourcePort(this.sourceComponent);

    // Try to snap to nearby port first
    const snapResult = this.findNearestSnappingPort(point, sourcePort);

    let actualEndPoint = point;
    let newTargetComponent: Block | Anchor;

    if (snapResult) {
      // Snap to port
      actualEndPoint = new Point(snapResult.snapPoint.x, snapResult.snapPoint.y);
      newTargetComponent = this.getComponentByPort(snapResult.port);
    } else {
      // Use existing logic - find element over point
      newTargetComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);
    }

    // Use world coordinates from point instead of screen coordinates
    this.endState = new Point(actualEndPoint.x, actualEndPoint.y);
    this.performRender();

    if (!newTargetComponent || !newTargetComponent.connectedState) {
      this.target?.connectedState?.setSelection(false);
      this.target = undefined;
      return;
    }

    // Only process if the target has changed or if there was no previous target
    if (
      (!this.target || this.target.connectedState !== newTargetComponent.connectedState) &&
      newTargetComponent.connectedState !== this.sourceComponent
    ) {
      this.target?.connectedState?.setSelection(false);

      const target = newTargetComponent.connectedState;

      this.target = newTargetComponent;

      this.context.graph.executеDefaultEventAction(
        "connection-create-hover",
        {
          sourceBlockId:
            this.sourceComponent instanceof AnchorState ? this.sourceComponent.blockId : this.sourceComponent.id,
          sourceAnchorId: this.sourceComponent instanceof AnchorState ? this.sourceComponent.id : undefined,
          targetAnchorId: target instanceof AnchorState ? target.id : undefined,
          targetBlockId: target instanceof AnchorState ? target.blockId : target.id,
        },
        () => {
          this.target.connectedState.setSelection(true);
        }
      );
    }
  }

  private onEndNewConnection(point: Point) {
    if (!this.sourceComponent || !this.startState || !this.endState) {
      return;
    }

    const targetComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);
    this.startState = null;
    this.endState = null;
    this.performRender();

    if (!(targetComponent instanceof Block) && !(targetComponent instanceof Anchor)) {
      this.context.graph.executеDefaultEventAction(
        "connection-create-drop",
        {
          sourceBlockId: this.getBlockId(this.sourceComponent),
          sourceAnchorId: this.getAnchorId(this.sourceComponent),
          point,
        },
        () => {}
      );
      return;
    }

    if (targetComponent && targetComponent.connectedState && this.sourceComponent !== targetComponent.connectedState) {
      if (
        this.sourceComponent instanceof AnchorState &&
        targetComponent.connectedState instanceof AnchorState &&
        this.sourceComponent.blockId !== targetComponent.connectedState.blockId
      ) {
        const params = {
          sourceBlockId: this.sourceComponent.blockId,
          sourceAnchorId: this.sourceComponent.id,
          targetAnchorId: targetComponent.connectedState.id,
          targetBlockId: targetComponent.connectedState.blockId,
        };
        this.context.graph.executеDefaultEventAction("connection-created", params, () => {
          this.context.graph.rootStore.connectionsList.addConnection(params);
        });
      } else if (this.sourceComponent instanceof BlockState && targetComponent.connectedState instanceof BlockState) {
        const params = {
          sourceBlockId: this.sourceComponent.id,
          targetBlockId: targetComponent.connectedState.id,
        };
        this.context.graph.executеDefaultEventAction("connection-created", params, () => {
          this.context.graph.rootStore.connectionsList.addConnection(params);
        });
      }
      this.sourceComponent.setSelection(false);
      targetComponent.connectedState.setSelection(false);
    }

    this.context.graph.executеDefaultEventAction(
      "connection-create-drop",
      {
        sourceBlockId: this.getBlockId(this.sourceComponent),
        sourceAnchorId: this.getAnchorId(this.sourceComponent),
        targetBlockId: this.getBlockId(targetComponent.connectedState),
        targetAnchorId: this.getAnchorId(targetComponent.connectedState),
        point,
      },
      () => {}
    );
  }

  /**
   * Get the source port from a component (block or anchor)
   * @param component Block or Anchor component
   * @returns Port state or undefined
   */
  private getSourcePort(component: BlockState | AnchorState): PortState | undefined {
    const connectionsList = this.context.graph.rootStore.connectionsList;

    if (component instanceof AnchorState) {
      return connectionsList.getPort(createAnchorPortId(component.blockId, component.id));
    }

    // For block, use output port
    return connectionsList.getPort(createBlockPointPortId(component.id, false));
  }

  /**
   * Get the component (Block or Anchor) that owns a port
   * @param port Port state
   * @returns Block or Anchor component
   */
  private getComponentByPort(port: PortState): Block | Anchor | undefined {
    const component = port.component;
    if (!component) {
      return undefined;
    }

    // Check if component is Block or Anchor by checking instance
    if (component instanceof Block || component instanceof Anchor) {
      return component;
    }

    return undefined;
  }

  /**
   * Create a snapping port bounding box for RBush spatial indexing
   * @param port Port to create bounding box for
   * @param searchRadius Search radius for snapping area
   * @returns SnappingPortBox or null if port doesn't have snapping enabled
   */
  private createSnappingPortBox(port: PortState, searchRadius: number): SnappingPortBox | null {
    const meta = port.meta as IPortSnapMeta | undefined;

    // Check if port has snapping enabled
    if (!meta?.snappable) {
      return null; // Port doesn't participate in snapping
    }

    return {
      minX: port.x - searchRadius,
      minY: port.y - searchRadius,
      maxX: port.x + searchRadius,
      maxY: port.y + searchRadius,
      port: port,
    };
  }

  /**
   * Find the nearest snapping port to a given point
   * @param point Point to search from
   * @param sourcePort Source port to exclude from search
   * @returns Nearest snapping port and snap point, or null if none found
   */
  private findNearestSnappingPort(
    point: TPoint,
    sourcePort?: PortState
  ): { port: PortState; snapPoint: TPoint } | null {
    // Rebuild RBush if outdated
    this.rebuildSnappingTree();

    if (!this.snappingPortsTree) {
      return null;
    }

    // Search for ports in the area around cursor
    const candidates = this.snappingPortsTree.search({
      minX: point.x - SNAP_SEARCH_RADIUS,
      minY: point.y - SNAP_SEARCH_RADIUS,
      maxX: point.x + SNAP_SEARCH_RADIUS,
      maxY: point.y + SNAP_SEARCH_RADIUS,
    });

    if (candidates.length === 0) {
      return null;
    }

    // Find the nearest port by vector distance
    let nearestPort: PortState | null = null;
    let nearestDistance = Infinity;

    for (const candidate of candidates) {
      const port = candidate.port;

      // Skip source port
      if (sourcePort && port.id === sourcePort.id) {
        continue;
      }

      // Calculate vector distance
      const dx = port.x - point.x;
      const dy = port.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check custom condition if provided
      const meta = port.meta as IPortSnapMeta | undefined;
      if (meta?.snapCondition && sourcePort) {
        const canSnap = meta.snapCondition({
          sourcePort: sourcePort,
          targetPort: port,
          cursorPosition: point,
          distance,
        });

        if (!canSnap) {
          continue;
        }
      }

      // Update nearest port
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPort = port;
      }
    }

    if (!nearestPort) {
      return null;
    }

    return {
      port: nearestPort,
      snapPoint: { x: nearestPort.x, y: nearestPort.y },
    };
  }

  /**
   * Rebuild the RBush spatial index for snapping ports (lazy rebuild)
   */
  private rebuildSnappingTree(): void {
    if (!this.isSnappingTreeOutdated) {
      return;
    }

    const snappingBoxes: SnappingPortBox[] = [];
    const connectionsList = this.context.graph.rootStore.connectionsList;

    // Get all ports from connectionsList
    const allPorts = connectionsList.getAllPorts();
    for (const port of allPorts) {
      const box = this.createSnappingPortBox(port, SNAP_SEARCH_RADIUS);
      if (box) {
        snappingBoxes.push(box);
      }
    }

    this.snappingPortsTree = new RBush<SnappingPortBox>(9);
    if (snappingBoxes.length > 0) {
      this.snappingPortsTree.load(snappingBoxes);
    }

    this.isSnappingTreeOutdated = false;
  }

  public override unmount(): void {
    // Cleanup ports subscription
    if (this.portsUnsubscribe) {
      this.portsUnsubscribe();
      this.portsUnsubscribe = undefined;
    }
    // Clear snapping tree
    this.snappingPortsTree = null;
    super.unmount();
  }
}
