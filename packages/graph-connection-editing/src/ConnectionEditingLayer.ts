import { Anchor, CanvasBlock, EAnchorType, ESelectionStrategy, GraphComponent, Layer } from "@gravity-ui/graph";
import type {
  Graph,
  GraphEventsDefinitions,
  LayerContext,
  LayerProps,
  PortState,
  TBlockId,
  TCameraState,
  TConnection,
  TPoint,
  UnwrapGraphEvents,
  UnwrapGraphEventsDetail,
} from "@gravity-ui/graph";
import RBush from "rbush";

import { renderIcon } from "./renderIcon";
import type {
  IPortConnectionMeta,
  TConnectionAllowedContext,
  TConnectionEditingIcon,
  TConnectionStartContext,
  TDrawLineFunction,
} from "./types";

/**
 * Default search radius for port detection and snapping in pixels
 */
const PORT_SEARCH_RADIUS = 20;
const DEFAULT_LINE_WIDTH = 3;

export type TConnectionEditingLayerProps = LayerProps & {
  /** Turns connection creation on or off. Default: `true`. */
  enabled?: boolean;
  /**
   * While enabled, a mousedown on an anchor never starts the default drag (moving the block),
   * even when no connection starts from it. Default: `true`.
   */
  captureAnchors?: boolean;
  /** Filters the sources a connection may start from. */
  canStart?: (context: TConnectionStartContext) => boolean;
  /** Filters targets. A rejected target is treated as no target. */
  isConnectionAllowed?: (context: TConnectionAllowedContext) => boolean;
  /** Port detection and snapping radius in world pixels. Default: `20`. */
  searchRadius?: number;
  /** Icon shown at the cursor while there is no target. */
  createIcon?: TConnectionEditingIcon;
  /** Icon shown at the cursor while a target is hovered. */
  point?: TConnectionEditingIcon;
  /** Custom preview line renderer. */
  drawLine?: TDrawLineFunction;
  /** Preview line width in screen pixels, used without `drawLine`. Default: `3`. */
  lineWidth?: number;
  /** Preview line dash pattern, used without `drawLine`. Default: solid. */
  lineDash?: number[];
};

type TConnectionEditingLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

type TSnappingPortBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  port: PortState;
};

/**
 * How the current connection was started.
 * - `port`: from a port with connection meta (`snappable`). Targets are ports with connection meta.
 * - `anchor`: from an anchor without connection meta. Targets are anchors of other blocks.
 * - `block`: Shift + drag from a block. Targets are other blocks.
 */
type TSourceKind = "port" | "anchor" | "block";

type TEndpointParams = {
  blockId?: TBlockId;
  anchorId?: string;
};

type TDragHandle = ReturnType<Graph["dragService"]["startDrag"]>;

/**
 * ConnectionEditingLayer creates connections by drag and drop.
 *
 * Sources, in order of priority:
 * - a port with `meta[ConnectionEditingLayer.PortMetaKey].snappable` under the cursor;
 * - an anchor (when `useBlocksAnchors` is on);
 * - a block, while Shift is held.
 *
 * Targets snap to the nearest port with connection meta within `searchRadius`. Connections started from
 * an anchor or a block also accept another block's anchor or block under the cursor.
 *
 * Events: `connection-create-start`, `connection-create-hover`, `connection-created`,
 * `connection-create-drop`, `connection-create-cancel`.
 */
export class ConnectionEditingLayer extends Layer<TConnectionEditingLayerProps, TConnectionEditingLayerContext> {
  /**
   * Port metadata key. The symbol keeps the description used by the former `PortConnectionLayer`,
   * so port meta written for it keeps working.
   */
  public static readonly PortMetaKey: unique symbol = Symbol.for("PortConnectionLayer.PortMeta");

  private startState: TPoint | null = null;
  private endState: TPoint | null = null;

  private sourcePort?: PortState;
  private sourceKind?: TSourceKind;
  private targetPort?: PortState;

  private snappingPortsTree: RBush<TSnappingPortBox> | null = null;
  private isSnappingTreeOutdated = true;

  protected currentListener: TDragHandle | null = null;

  constructor(props: TConnectionEditingLayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
        ...props.canvas,
      },
      ...props,
    });

    this.requireCanvas();
    this.setContext({
      graphCanvas: props.graph.getGraphCanvas(),
    });
  }

  protected afterInit(): void {
    this.onGraphEvent("mousedown", this.handleMouseDown, { capture: true });

    this.onSignal(this.context.graph.connections.ports.$ports, () => {
      this.isSnappingTreeOutdated = true;
    });

    this.context.graph.keyboardService.onPress(
      "Escape",
      () => {
        if (this.isCreating()) {
          this.cancelNewConnection();
        } else {
          // The mouse is pressed but the drag threshold is not reached yet: drop the pending drag silently.
          this.currentListener?.emit("cancel");
          this.currentListener = null;
        }
      },
      {
        signal: this.eventAbortController.signal,
      }
    );

    super.afterInit();
  }

  protected onCameraChange(_camera: TCameraState): void {
    this.isSnappingTreeOutdated = true;
  }

  /** Whether a connection is being dragged: the drag passed the threshold and the source is set. */
  private isCreating(): boolean {
    return this.sourcePort !== undefined;
  }

  public isEnabled(): boolean {
    return this.props.enabled !== false;
  }

  public enable = (): void => {
    this.setProps({ enabled: true });
  };

  public disable = (): void => {
    this.setProps({ enabled: false });
  };

  private get searchRadius(): number {
    return this.props.searchRadius || PORT_SEARCH_RADIUS;
  }

  private emitWithDefault<EventName extends keyof GraphEventsDefinitions>(
    eventName: EventName,
    detail: UnwrapGraphEventsDetail<EventName>,
    defaultAction: () => void
  ): void {
    const event = this.context.graph.emit(eventName, detail);
    if (!event.defaultPrevented) {
      defaultAction();
    }
  }

  private getConnectionMeta(port: PortState): IPortConnectionMeta | undefined {
    const metadata = port.meta;
    if (typeof metadata !== "object" || metadata === null || !(ConnectionEditingLayer.PortMetaKey in metadata))
      return undefined;
    const value = (metadata as Record<symbol, unknown>)[ConnectionEditingLayer.PortMetaKey];
    if (typeof value !== "object" || value === null) return undefined;
    // This symbol is the explicit ConnectionEditingLayer metadata contract.
    return value as IPortConnectionMeta;
  }

  private isPortAvailable(port: PortState): boolean {
    return (
      this.context.graph.connections.getPort(port.id) === port &&
      !port.lookup &&
      port.owner !== undefined &&
      (!(port.owner instanceof GraphComponent) || port.owner.isEntityAvailable())
    );
  }

  private isSnappablePort(port: PortState): boolean {
    const meta = this.getConnectionMeta(port);
    return Boolean(meta?.snappable);
  }

  protected handleMouseDown = (nativeEvent: UnwrapGraphEvents<"mousedown">): void => {
    if (!this.isEnabled()) {
      return;
    }
    const initEvent = nativeEvent.detail.sourceEvent;
    const initialComponent = nativeEvent.detail.target;
    if (!(initEvent instanceof MouseEvent) || !this.root?.ownerDocument || !initialComponent) {
      return;
    }
    if (initEvent.button !== 0) {
      return;
    }
    if (!(initialComponent instanceof GraphComponent)) {
      return;
    }

    const source = this.resolveSource(initialComponent, initEvent);
    if (!source) {
      if (initialComponent instanceof Anchor && this.props.captureAnchors !== false) {
        // Anchors never move their block while connection editing is enabled.
        nativeEvent.preventDefault();
      }
      return;
    }

    // Prevents the default drag, camera drag and dispatch to the target component.
    nativeEvent.preventDefault();
    const { port, kind } = source;
    // DragService will provide world coordinates in callbacks
    this.currentListener = this.context.graph.dragService.startDrag(
      {
        onStart: (_event, coords) => this.onStartConnection(port, kind, { x: coords[0], y: coords[1] }),
        onUpdate: (_event, coords) => this.onMoveNewConnection({ x: coords[0], y: coords[1] }),
        onEnd: (_event, coords) => this.onEndNewConnection({ x: coords[0], y: coords[1] }),
      },
      { cursor: "crosshair", initialEvent: initEvent }
    );
  };

  private resolveSource(
    component: GraphComponent,
    event: MouseEvent
  ): { port: PortState; kind: TSourceKind } | undefined {
    const source = this.findSource(component, event);
    if (!source) {
      return undefined;
    }
    if (this.props.canStart && !this.props.canStart({ sourcePort: source.port, sourceComponent: component, event })) {
      return undefined;
    }
    return source;
  }

  private findSource(component: GraphComponent, event: MouseEvent): { port: PortState; kind: TSourceKind } | undefined {
    if (component.getPorts().length > 0) {
      const point = this.context.graph.getPointInCameraSpace(event).world;
      const port = this.context.graph.connections.ports.findPortAtPointByComponent(
        component,
        point,
        this.searchRadius,
        (candidate) => this.isSnappablePort(candidate)
      );
      if (port) {
        return { port, kind: "port" };
      }
    }

    if (component instanceof Anchor) {
      const port = component.getPorts()[0];
      if (port && this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors")) {
        return { port, kind: "anchor" };
      }
      return undefined;
    }

    if (component instanceof CanvasBlock && event.shiftKey) {
      return { port: component.getOutputPort(), kind: "block" };
    }

    return undefined;
  }

  protected renderEndpoint(ctx: CanvasRenderingContext2D): void {
    if (!this.endState) return;
    ctx.beginPath();

    // Icons should remain constant size on screen, so scale them inversely to camera scale
    const scale = this.context.camera.getCameraScale();
    const iconSize = 24 / scale;
    const iconOffset = 12 / scale;
    const rect = { x: this.endState.x, y: this.endState.y - iconOffset, width: iconSize, height: iconSize };

    if (!this.targetPort && this.props.createIcon) {
      renderIcon(ctx, this.props.createIcon, rect);
    } else if (this.props.point) {
      ctx.fillStyle = this.props.point.fill || this.context.colors.canvas.belowLayerBackground;
      if (this.props.point.stroke) {
        ctx.strokeStyle = this.props.point.stroke;
      }
      renderIcon(ctx, this.props.point, rect);
    }
    ctx.closePath();
  }

  protected render(): void {
    this.resetTransform();
    if (!this.startState || !this.endState) {
      return;
    }
    const ctx = this.context.ctx;

    if (this.props.drawLine) {
      const { path, style } = this.props.drawLine(this.startState, this.endState);

      ctx.lineWidth = this.context.camera.limitScaleEffect(style.width || DEFAULT_LINE_WIDTH);
      ctx.strokeStyle = style.color;
      ctx.setLineDash(style.dash);
      ctx.stroke(path);
    } else {
      ctx.beginPath();
      ctx.lineWidth = this.context.camera.limitScaleEffect(this.props.lineWidth || DEFAULT_LINE_WIDTH);
      ctx.setLineDash(this.props.lineDash ?? []);
      ctx.strokeStyle = this.context.colors.connection.selectedBackground;
      ctx.moveTo(this.startState.x, this.startState.y);
      ctx.lineTo(this.endState.x, this.endState.y);
      ctx.stroke();
      ctx.closePath();
    }

    ctx.save();
    this.renderEndpoint(ctx);
    ctx.restore();
  }

  private onStartConnection(port: PortState, kind: TSourceKind, worldCoords: TPoint): void {
    if (!this.isPortAvailable(port)) {
      return;
    }

    const params = this.getEventParams(port);

    this.sourcePort = port;
    this.sourceKind = kind;
    // A block has no single connection point: the line starts where the drag started.
    this.startState = kind === "block" ? { x: worldCoords.x, y: worldCoords.y } : { x: port.x, y: port.y };

    this.emitWithDefault(
      "connection-create-start",
      {
        blockId: params.blockId,
        anchorId: params.anchorId,
        sourcePort: port,
      },
      () => {
        this.selectPort(port, true);
      }
    );

    this.performRender();
  }

  private onMoveNewConnection(point: TPoint): void {
    if (!this.startState || !this.sourcePort) {
      return;
    }

    if (!this.isPortAvailable(this.sourcePort)) {
      this.cancelNewConnection();
      return;
    }

    const { port: newTargetPort, snapPoint } = this.findTarget(point, this.sourcePort);

    this.endState = snapPoint ? { x: snapPoint.x, y: snapPoint.y } : { x: point.x, y: point.y };
    this.performRender();

    // Handle target port change
    if (newTargetPort !== this.targetPort) {
      this.selectPort(this.targetPort, false);

      this.targetPort = newTargetPort;

      const sourceParams = this.getEventParams(this.sourcePort);
      const targetParams = this.getEventParams(newTargetPort);

      this.emitWithDefault(
        "connection-create-hover",
        {
          sourceBlockId: sourceParams.blockId,
          sourceAnchorId: sourceParams.anchorId,
          targetBlockId: targetParams.blockId,
          targetAnchorId: targetParams.anchorId,
          sourcePort: this.sourcePort,
          targetPort: newTargetPort,
        },
        () => {
          if (this.targetPort) {
            this.selectPort(this.targetPort, true);
          }
        }
      );
    }
  }

  /**
   * Finds the target for the current cursor position:
   * 1. the nearest snappable port within the search radius (the endpoint snaps to it);
   * 2. a snappable port under the cursor;
   * 3. for anchor/block sources, the anchor or block under the cursor.
   */
  private findTarget(point: TPoint, sourcePort: PortState): { port?: PortState; snapPoint?: TPoint } {
    const snapResult = this.findNearestSnappingPort(point, sourcePort);
    if (snapResult) {
      return { port: snapResult.port, snapPoint: snapResult.snapPoint };
    }

    let port = this.context.graph.connections.ports.findPortAtPoint(point, this.searchRadius, (p) => {
      return this.isSnappablePort(p) && Boolean(p.owner) && p.id !== sourcePort.id;
    });

    if (!port && this.sourceKind !== "port") {
      port = this.findComponentTargetPort(point, sourcePort);
    }

    if (port && !this.isTargetAllowed(sourcePort, port)) {
      return {};
    }
    return { port };
  }

  private findComponentTargetPort(point: TPoint, sourcePort: PortState): PortState | undefined {
    const component = this.context.graph.getElementOverPoint(point, [CanvasBlock, Anchor]);
    if (!component || !component.isEntityAvailable() || component === sourcePort.owner) {
      return undefined;
    }
    if (component instanceof Anchor) {
      return component.getPorts()[0];
    }
    if (component instanceof CanvasBlock) {
      if (this.sourceKind === "block" && sourcePort.owner === component) {
        return undefined;
      }
      return component.getInputPort();
    }
    return undefined;
  }

  private isTargetAllowed(sourcePort: PortState, targetPort: PortState): boolean {
    if (!this.props.isConnectionAllowed) {
      return true;
    }
    return this.props.isConnectionAllowed({ sourcePort, targetPort });
  }

  protected selectPort(port: PortState | undefined, select: boolean): void {
    if (!port || !this.isPortAvailable(port)) return;
    const component = port.owner;
    if (component instanceof Anchor) {
      // The anchor selection bucket does not resolve anchor components; select through the anchor state.
      component.connectedState.setSelection(select);
      return;
    }
    if (component instanceof GraphComponent) {
      const bucket = this.context.graph.rootStore.selectionService.getBucketByElement(component);
      if (!bucket) {
        return;
      }
      if (select) {
        bucket.select([component.getEntityId()], ESelectionStrategy.REPLACE);
      } else {
        bucket.deselect([component.getEntityId()]);
      }
    }
  }

  protected cancelNewConnection(): void {
    if (this.currentListener) {
      // The drag handle stops listening and releases the cursor and auto-panning.
      this.currentListener.emit("cancel");
    }
    this.currentListener = null;
    this.selectPort(this.sourcePort, false);
    this.selectPort(this.targetPort, false);
    const sourcePort = this.sourcePort;
    const targetPort = this.targetPort;
    this.resetState();
    this.context.graph.emit("connection-create-cancel", { sourcePort, targetPort });
  }

  private resetState(): void {
    this.sourcePort = undefined;
    this.sourceKind = undefined;
    this.targetPort = undefined;
    this.startState = null;
    this.endState = null;
    this.performRender();
  }

  private onEndNewConnection(point: TPoint): void {
    this.currentListener = null;
    const sourcePort = this.sourcePort;
    const sourceKind = this.sourceKind;
    // The end point may come without a preceding update (a fast flick): it is still a complete drag.
    if (!sourcePort || !this.startState) {
      this.resetState();
      return;
    }

    if (!this.isPortAvailable(sourcePort)) {
      this.cancelNewConnection();
      return;
    }

    const { port: targetPort } = this.findTarget(point, sourcePort);

    this.selectPort(sourcePort, false);
    this.selectPort(this.targetPort, false);
    this.resetState();

    const sourceParams = this.getEventParams(sourcePort);

    if (!targetPort) {
      this.context.graph.emit("connection-create-drop", {
        sourceBlockId: sourceParams.blockId,
        sourceAnchorId: sourceParams.anchorId,
        point,
        sourcePort,
      });
      return;
    }

    const targetParams = this.getEventParams(targetPort);

    if (this.canConnect(sourceKind, sourcePort, targetPort)) {
      // Determine port types to ensure correct connection direction (OUT -> IN)
      const [actualSourcePort, actualTargetPort] =
        this.getPortType(sourcePort) === EAnchorType.IN && this.getPortType(targetPort) === EAnchorType.OUT
          ? [targetPort, sourcePort]
          : [sourcePort, targetPort];

      const actualSourceParams = this.getEventParams(actualSourcePort);
      const actualTargetParams = this.getEventParams(actualTargetPort);

      this.emitWithDefault(
        "connection-created",
        {
          sourceBlockId: actualSourceParams.blockId,
          sourceAnchorId: actualSourceParams.anchorId,
          targetBlockId: actualTargetParams.blockId,
          targetAnchorId: actualTargetParams.anchorId,
          sourcePort: actualSourcePort,
          targetPort: actualTargetPort,
        },
        () => this.createConnection(actualSourcePort, actualTargetPort, actualSourceParams, actualTargetParams)
      );
    }

    this.context.graph.emit("connection-create-drop", {
      sourceBlockId: sourceParams.blockId,
      sourceAnchorId: sourceParams.anchorId,
      targetBlockId: targetParams.blockId,
      targetAnchorId: targetParams.anchorId,
      point,
      sourcePort,
      targetPort,
    });
  }

  /**
   * Port sources connect to any target port. Anchor sources connect only to anchors of other blocks,
   * block sources only to other blocks.
   */
  private canConnect(kind: TSourceKind | undefined, sourcePort: PortState, targetPort: PortState): boolean {
    if (kind === "port" || this.isSnappablePort(targetPort)) {
      return true;
    }
    const source = sourcePort.owner;
    const target = targetPort.owner;
    if (kind === "anchor") {
      return (
        source instanceof Anchor &&
        target instanceof Anchor &&
        source.connectedState.blockId !== target.connectedState.blockId
      );
    }
    if (kind === "block") {
      return source instanceof CanvasBlock && target instanceof CanvasBlock && source !== target;
    }
    return false;
  }

  protected createConnection(
    source: PortState,
    target: PortState,
    sourceParams = this.getEventParams(source),
    targetParams = this.getEventParams(target)
  ): void {
    if (!this.isPortAvailable(source) || !this.isPortAvailable(target)) return;
    const connection: TConnection = {
      sourceBlockId: sourceParams.blockId,
      sourceAnchorId: sourceParams.anchorId,
      targetBlockId: targetParams.blockId,
      targetAnchorId: targetParams.anchorId,
    };
    if (sourceParams.blockId === undefined) connection.sourcePortId = source.id;
    if (targetParams.blockId === undefined) connection.targetPortId = target.id;
    const store = this.context.graph.connections;
    // Only custom ports need this one-off search; block/anchor connections have deterministic IDs.
    if (connection.sourcePortId !== undefined || connection.targetPortId !== undefined) {
      const existing = Array.from(store.$connectionsMap.value.values()).find(
        (state) => state.$sourcePortId.value === source.id && state.$targetPortId.value === target.id
      );
      if (existing) connection.id = existing.id;
    }
    store.addConnection(connection);
  }

  private findNearestSnappingPort(
    point: TPoint,
    sourcePort?: PortState
  ): { port: PortState; snapPoint: TPoint } | null {
    this.rebuildSnappingTree();

    if (!this.snappingPortsTree) {
      return null;
    }

    const searchRadius = this.searchRadius;
    const candidates = this.snappingPortsTree.search({
      minX: point.x - searchRadius,
      minY: point.y - searchRadius,
      maxX: point.x + searchRadius,
      maxY: point.y + searchRadius,
    });

    let nearestPort: PortState | null = null;
    let nearestDistance = Infinity;

    for (const candidate of candidates) {
      const port = candidate.port;
      if (!this.isPortAvailable(port)) continue;

      // Skip source port
      if (sourcePort && port.id === sourcePort.id) {
        continue;
      }

      const distance = Math.hypot(port.x - point.x, port.y - point.y);

      // Check custom condition if provided
      const meta = this.getConnectionMeta(port);
      if (meta?.snapCondition && sourcePort) {
        const canSnap = meta.snapCondition({
          sourcePort,
          targetPort: port,
          cursorPosition: point,
          distance,
        });

        if (!canSnap) {
          continue;
        }
      }

      if (sourcePort && !this.isTargetAllowed(sourcePort, port)) {
        continue;
      }

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

    const snappingBoxes: TSnappingPortBox[] = [];
    const searchRadius = this.searchRadius;

    for (const component of this.context.graph.getElementsInViewport([GraphComponent])) {
      for (const port of component.getPorts()) {
        // Skip ports in lookup state (no valid coordinates)
        if (port.lookup) continue;

        if (this.isSnappablePort(port)) {
          snappingBoxes.push({
            minX: port.x - searchRadius,
            minY: port.y - searchRadius,
            maxX: port.x + searchRadius,
            maxY: port.y + searchRadius,
            port,
          });
        }
      }
    }

    this.snappingPortsTree = new RBush<TSnappingPortBox>(9);
    if (snappingBoxes.length > 0) {
      this.snappingPortsTree.load(snappingBoxes);
    }

    this.isSnappingTreeOutdated = false;
  }

  /**
   * Determine the port type (IN or OUT)
   * @returns EAnchorType.IN, EAnchorType.OUT, or null if the port has no specific direction
   */
  private getPortType(port: PortState): EAnchorType | null {
    const component = port.owner;
    if (component instanceof Anchor) {
      const anchorType = component.connectedState.state.type;
      if (anchorType === EAnchorType.IN || anchorType === EAnchorType.OUT) {
        return anchorType;
      }
    }
    return null;
  }

  /**
   * Block and anchor IDs of the port owner. Custom component ports have neither.
   */
  protected getEventParams(port?: PortState): TEndpointParams {
    const component = port?.owner;
    if (component instanceof Anchor) {
      return {
        blockId: component.connectedState.blockId,
        anchorId: component.connectedState.id,
      };
    }
    if (component instanceof CanvasBlock) {
      return {
        blockId: component.connectedState.id,
      };
    }
    return {};
  }

  public override unmount(): void {
    if (this.isCreating()) this.cancelNewConnection();
    else this.currentListener?.emit("cancel");
    this.currentListener = null;
    this.snappingPortsTree = null;
    super.unmount();
  }
}
