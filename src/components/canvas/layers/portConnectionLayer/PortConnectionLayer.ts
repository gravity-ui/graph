import RBush from "rbush";

import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../../../graphEvents";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { EAnchorType } from "../../../../store/anchor/Anchor";
import { TBlockId } from "../../../../store/block/Block";
import { PortState } from "../../../../store/connection/port/Port";
import { vectorDistance } from "../../../../utils/functions";
import { render } from "../../../../utils/renderers/render";
import { renderSVG } from "../../../../utils/renderers/svgPath";
import { Point, TPoint } from "../../../../utils/types/shapes";
import { Anchor } from "../../../canvas/anchors";
import { Block } from "../../../canvas/blocks/Block";
import { GraphComponent } from "../../GraphComponent";
import { ESelectionStrategy } from "../../../../services/selection";

/**
 * Default search radius for port detection and snapping in pixels
 */
const PORT_SEARCH_RADIUS = 20;

/**
 * Snap condition function type
 * Used by PortConnectionLayer to determine if a port can snap to another port
 */
export type TPortSnapCondition = (context: {
  sourcePort: PortState;
  targetPort: PortState;
  cursorPosition: TPoint;
  distance: number;
}) => boolean;

/**
 * Port metadata structure for PortConnectionLayer
 * This structure is stored under PortConnectionLayer.PortMetaKey in port.meta
 */
export interface IPortConnectionMeta {
  /** Enable snapping for this port. If false or undefined, port will not participate in snapping */
  snappable?: boolean;
  /** Custom condition for snapping - validates if connection is allowed */
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

type PortConnectionLayerProps = LayerProps & {
  createIcon?: TIcon;
  point?: TIcon;
  drawLine?: DrawLineFunction;
  searchRadius?: number;
};

declare module "../../../../graphEvents" {
  interface GraphEventsDefinitions {
    /**
     * Port-based event fired when a user initiates a connection from a port.
     * Extends connection-create-start with direct port reference.
     */
    "port-connection-create-start": (
      event: CustomEvent<{
        blockId: TBlockId;
        anchorId: string | undefined;
        sourcePort: PortState;
      }>
    ) => void;

    /**
     * Port-based event fired when the connection hovers over a potential target port.
     * Extends connection-create-hover with direct port references.
     */
    "port-connection-create-hover": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId: string | undefined;
        targetBlockId: TBlockId | undefined;
        targetAnchorId: string | undefined;
        sourcePort: PortState;
        targetPort?: PortState;
      }>
    ) => void;

    /**
     * Port-based event fired when a connection is successfully created between two ports.
     * Extends connection-created with direct port references.
     */
    "port-connection-created": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId?: string;
        targetBlockId: TBlockId;
        targetAnchorId?: string;
        sourcePort: PortState;
        targetPort: PortState;
      }>
    ) => void;

    /**
     * Port-based event fired when the user releases the mouse button.
     * Extends connection-create-drop with direct port references.
     */
    "port-connection-create-drop": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId: string;
        targetBlockId?: TBlockId;
        targetAnchorId?: string;
        point: Point;
        sourcePort: PortState;
        targetPort?: PortState;
      }>
    ) => void;
  }
}

/**
 * PortConnectionLayer - new layer for creating connections, working only with ports
 *
 * Key differences from ConnectionLayer:
 * - Works only with ports, (use Block and Anchor components only to pass more info about ports in Event)
 * - Uses findPortAtPoint to detect ports under cursor
 * - Metadata is stored under unique PortConnectionLayer.PortMetaKey key
 * - More efficient search through spatial index
 * - Events extended with sourcePort and targetPort parameters
 *
 * @example
 * ```typescript
 * // Configure port for snapping
 * port.updatePort({
 *   meta: {
 *     [PortConnectionLayer.PortMetaKey]: {
 *       snappable: true,
 *       snapCondition: (ctx) => {
 *         // Custom validation logic
 *         return true;
 *       }
 *     }
 *   }
 * });
 * ```
 */
export class PortConnectionLayer extends Layer<
  PortConnectionLayerProps,
  LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  /**
   * Unique key for port metadata
   * Using a symbol prevents conflicts with other layers
   */
  static readonly PortMetaKey = Symbol.for("PortConnectionLayer.PortMeta");

  private startState: Point | null = null;
  private endState: Point | null = null;

  private sourcePort?: PortState;
  private targetPort?: PortState;

  private snappingPortsTree: RBush<SnappingPortBox> | null = null;
  private isSnappingTreeOutdated = true;
  private portsUnsubscribe?: () => void;

  protected enabled: boolean;

  constructor(props: PortConnectionLayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
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

  protected afterInit(): void {
    this.onGraphEvent("mousedown", this.handleMouseDown, { capture: true });

    // Subscribe to ports changes
    const checkPortsChanged = () => {
      this.isSnappingTreeOutdated = true;
    };

    this.portsUnsubscribe = this.onSignal(this.context.graph.rootStore.connectionsList.ports.$ports, checkPortsChanged);

    // Subscribe to camera changes to invalidate tree when viewport changes
    this.onGraphEvent("camera-change", () => {
      this.isSnappingTreeOutdated = true;
    });

    super.afterInit();
  }

  public enable = (): void => {
    this.enabled = true;
  };

  public disable = (): void => {
    this.enabled = false;
  };

  protected handleMouseDown = (nativeEvent: GraphMouseEvent): void => {
    if (!this.enabled) {
      return;
    }
    const initEvent = extractNativeGraphMouseEvent(nativeEvent);
    const initialComponent = nativeEvent.detail.target as GraphComponent;
    if (!initEvent || !this.root?.ownerDocument || !initialComponent) {
      return;
    }
    if (!(initialComponent instanceof GraphComponent) || initialComponent.getPorts().length === 0) {
      return;
    }
    // DragService will provide world coordinates in callbacks
    this.context.graph.dragService.startDrag(
      {
        onStart: (_event, coords) => {
          const point = new Point(coords[0], coords[1]);
          const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;

          const port = this.context.graph.rootStore.connectionsList.ports.findPortAtPointByComponent(
            initialComponent,
            point,
            searchRadius
          );
          if (port) {
            this.onStartConnection(port, point);
          }
        },
        onUpdate: (event, coords) => this.onMoveNewConnection(event, new Point(coords[0], coords[1])),
        onEnd: (_event, coords) => this.onEndNewConnection(new Point(coords[0], coords[1])),
      },
      { cursor: "crosshair", initialEvent: initEvent }
    );
  };

  protected renderEndpoint(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();

    const scale = this.context.camera.getCameraScale();
    const iconSize = 24 / scale;
    const iconOffset = 12 / scale;

    if (!this.targetPort && this.props.createIcon && this.endState) {
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

  protected render(): void {
    this.resetTransform();
    if (!this.startState || !this.endState) {
      return;
    }

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

  private onStartConnection(port: PortState, _worldCoords: Point): void {
    if (!port) {
      return;
    }

    const params = this.getEventParams(port);

    this.context.graph.executеDefaultEventAction(
      "port-connection-create-start",
      {
        blockId: params.blockId,
        anchorId: params.anchorId,
        sourcePort: port,
      },
      () => {
        this.sourcePort = port;
        this.startState = new Point(port.x, port.y);

        this.context.graph.rootStore.selectionService.selectRelatedElements([port.owner as GraphComponent], ESelectionStrategy.REPLACE);
      }
    );

    this.performRender();
  }

  private onMoveNewConnection(event: MouseEvent, point: Point): void {
    if (!this.startState || !this.sourcePort) {
      return;
    }

    // Try to snap to nearby port first
    const snapResult = this.findNearestSnappingPort(point, this.sourcePort);

    let actualEndPoint = point;
    let newTargetPort: PortState | undefined;

    if (snapResult) {
      // Snap to port
      actualEndPoint = new Point(snapResult.snapPoint.x, snapResult.snapPoint.y);
      newTargetPort = snapResult.port;
    } else {
      // Try to find port at cursor without snapping
      const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;
      newTargetPort = this.context.graph.rootStore.connectionsList.ports.findPortAtPoint(point, searchRadius, (p) => {
        return Boolean(p.owner) && p.id !== this.sourcePort?.id;
      });
    }

    this.endState = new Point(actualEndPoint.x, actualEndPoint.y);
    this.performRender();

    // Handle target port change
    if (newTargetPort !== this.targetPort) {
      this.selectPort(this.targetPort, false);

      this.targetPort = newTargetPort;

      if (newTargetPort) {
        const sourceParams = this.getEventParams(this.sourcePort);
        const targetParams = this.getEventParams(newTargetPort);

        this.context.graph.executеDefaultEventAction(
          "port-connection-create-hover",
          {
            sourceBlockId: sourceParams.blockId,
            sourceAnchorId: sourceParams.anchorId,
            targetBlockId: targetParams.blockId,
            targetAnchorId: targetParams.anchorId,
            sourcePort: this.sourcePort,
            targetPort: newTargetPort,
          },
          () => {
            this.selectPort(newTargetPort, true);
          }
        );
      }
    }
  }

  protected selectPort(port: PortState, select: boolean): void {
    const component = port.owner;
    if(component instanceof GraphComponent) {
      const bucket = this.context.graph.rootStore.selectionService.getBucketByElement(component);
      if(!bucket) {
        return;
      }
      if(select) {
        bucket.select([component.getEntityId()], ESelectionStrategy.REPLACE);
      } else {
        bucket.deselect([component.getEntityId()]);
      }
    }
  }

  private onEndNewConnection(point: Point): void {
    if (!this.sourcePort || !this.startState || !this.endState) {
      return;
    }

    // Use the target port that was found during move (snapping)
    // If not found through snapping, try to find it at the drop point
    let targetPort = this.targetPort;

    // Fallback: if no targetPort from snapping, try to find at drop point
    if (!targetPort) {
      const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;
      targetPort = this.context.graph.rootStore.connectionsList.ports.findPortAtPoint(point, searchRadius, (p) => {
        return Boolean(p.owner) && p.id !== this.sourcePort?.id;
      });
    }

    this.startState = null;
    this.endState = null;
    this.performRender();

    const sourceParams = this.getEventParams(this.sourcePort);

    if (!targetPort) {
      // Drop without target
      this.context.graph.executеDefaultEventAction(
        "port-connection-create-drop",
        {
          sourceBlockId: sourceParams.blockId,
          sourceAnchorId: sourceParams.anchorId,
          point,
          sourcePort: this.sourcePort,
        },
        () => {}
      );

      // Cleanup
      this.sourcePort = undefined;
      this.targetPort = undefined;
      return;
    }

    // Determine port types to ensure correct connection direction (OUT -> IN)
    const sourceType = this.getPortType(this.sourcePort);
    const targetType = this.getPortType(targetPort);

    // Determine actual source and target based on port types
    let actualSourcePort = this.sourcePort;
    let actualTargetPort = targetPort;

    // If source is IN and target is OUT, swap them
    if (sourceType === EAnchorType.IN && targetType === EAnchorType.OUT) {
      actualSourcePort = targetPort;
      actualTargetPort = this.sourcePort;
    }

    const actualSourceParams = this.getEventParams(actualSourcePort);
    const actualTargetParams = this.getEventParams(actualTargetPort);

    // Create connection
    this.context.graph.executеDefaultEventAction(
      "port-connection-created",
      {
        sourceBlockId: actualSourceParams.blockId,
        sourceAnchorId: actualSourceParams.anchorId,
        targetBlockId: actualTargetParams.blockId,
        targetAnchorId: actualTargetParams.anchorId,
        sourcePort: actualSourcePort,
        targetPort: actualTargetPort,
      },
      () => {
        this.context.graph.rootStore.connectionsList.addConnection({
          sourceBlockId: actualSourceParams.blockId,
          sourceAnchorId: actualSourceParams.anchorId,
          targetBlockId: actualTargetParams.blockId,
          targetAnchorId: actualTargetParams.anchorId,
        });
      }
    );

    this.selectPort(this.sourcePort, false);
    this.selectPort(targetPort, false);

    const targetParams = this.getEventParams(targetPort);

    // Drop event
    this.context.graph.executеDefaultEventAction(
      "port-connection-create-drop",
      {
        sourceBlockId: sourceParams.blockId,
        sourceAnchorId: sourceParams.anchorId,
        targetBlockId: targetParams.blockId,
        targetAnchorId: targetParams.anchorId,
        point,
        sourcePort: this.sourcePort,
        targetPort: targetPort,
      },
      () => {}
    );

    // Cleanup
    this.sourcePort = undefined;
    this.targetPort = undefined;
  }

  private findNearestSnappingPort(
    point: TPoint,
    sourcePort?: PortState
  ): { port: PortState; snapPoint: TPoint } | null {
    this.rebuildSnappingTree();

    if (!this.snappingPortsTree) {
      return null;
    }

    const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;
    const candidates = this.snappingPortsTree.search({
      minX: point.x - searchRadius,
      minY: point.y - searchRadius,
      maxX: point.x + searchRadius,
      maxY: point.y + searchRadius,
    });

    if (candidates.length === 0) {
      return null;
    }

    let nearestPort: PortState | null = null;
    let nearestDistance = Infinity;

    for (const candidate of candidates) {
      const port = candidate.port;

      // Skip source port
      if (sourcePort && port.id === sourcePort.id) {
        continue;
      }

      // Calculate vector distance
      const distance = vectorDistance(point, port);

      // Check custom condition if provided
      const meta = port.meta?.[PortConnectionLayer.PortMetaKey] as IPortConnectionMeta | undefined;
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
   * Rebuild the RBush spatial index for snapping ports
   * Optimization: Only includes ports from components visible in viewport + padding
   */
  private rebuildSnappingTree(): void {
    if (!this.isSnappingTreeOutdated) {
      return;
    }

    const snappingBoxes: SnappingPortBox[] = [];
    const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;

    // Get only visible components in viewport (with padding already applied)
    const visibleComponents = this.context.graph.getElementsInViewport([GraphComponent]);

    // Collect ports from visible components only
    for (const component of visibleComponents) {
      const ports = component.getPorts();

      for (const port of ports) {
        // Skip ports in lookup state (no valid coordinates)
        if (port.lookup) continue;

        const meta = port.meta?.[PortConnectionLayer.PortMetaKey] as IPortConnectionMeta | undefined;

        if (meta?.snappable) {
          snappingBoxes.push({
            minX: port.x - searchRadius,
            minY: port.y - searchRadius,
            maxX: port.x + searchRadius,
            maxY: port.y + searchRadius,
            port: port,
          });
        }
      }
    }

    this.snappingPortsTree = new RBush<SnappingPortBox>(9);
    if (snappingBoxes.length > 0) {
      this.snappingPortsTree.load(snappingBoxes);
    }

    this.isSnappingTreeOutdated = false;
  }

  /**
   * Determine the port type (IN or OUT)
   * @param port Port to check
   * @returns EAnchorType.IN, EAnchorType.OUT, or null if the port is a block point (no specific direction)
   */
  private getPortType(port: PortState): EAnchorType | null {
    const component = port.owner;

    if (!component) {
      return null;
    }

    // For Anchor components, get the anchor type
    if (component instanceof Anchor) {
      const anchorType = component.connectedState.state.type;
      if (anchorType === EAnchorType.IN || anchorType === EAnchorType.OUT) {
        return anchorType;
      }
    }

    // For Block points, return null (no specific direction)
    return null;
  }

  /**
   * Get full event parameters from a port
   * Includes both legacy parameters (blockId, anchorId) and new port reference
   */
  private getEventParams(port: PortState): {
    blockId: TBlockId;
    anchorId?: string;
  } {
    const component = port.owner;

    if (!component) {
      throw new Error("Port has no owner component");
    }

    if (component instanceof Anchor) {
      return {
        blockId: component.connectedState.blockId,
        anchorId: component.connectedState.id,
      };
    }

    if (component instanceof Block) {
      return {
        blockId: component.connectedState.id,
      };
    }

    throw new Error("Port owner is not Block or Anchor");
  }

  public override unmount(): void {
    if (this.portsUnsubscribe) {
      this.portsUnsubscribe();
      this.portsUnsubscribe = undefined;
    }
    this.snappingPortsTree = null;
    super.unmount();
  }
}
