import {
  Anchor,
  CanvasBlock,
  EAnchorType,
  GraphComponent,
  Layer,
  connectionSourceTag,
  connectionTargetTag,
  createAnchorPortId,
  createBlockPointPortId,
  getEntityAddress,
} from "@gravity-ui/graph";
import type {
  Graph,
  GraphEventsDefinitions,
  LayerContext,
  LayerProps,
  PortState,
  TBlockId,
  TCameraState,
  TConnection,
  TEntityAddress,
  TPoint,
  TTag,
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

/** Role of a port in the connection: a block's default point port differs for sources and targets. */
type TEndpointRole = "source" | "target";

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
  private readonly highlights = new Map<TTag, TEntityAddress>();

  private readonly snappingPortsTree = new RBush<TSnappingPortBox>(9);
  private readonly pointSubscriptions: (() => void)[] = [];
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

    const graph = this.context.graph;
    this.onSignal(graph.blocks.$blocksMap, this.checkEndpoints);
    this.onSignal(graph.rootStore.groupsList.$groupsMap, this.checkEndpoints);
    this.onSignal(graph.connections.ports.$ports, () => {
      this.isSnappingTreeOutdated = true;
      this.checkEndpoints();
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
    return this.props.searchRadius ?? PORT_SEARCH_RADIUS;
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

  private checkEndpoints = (): void => {
    if (this.sourcePort && !this.isPortAvailable(this.sourcePort)) this.cancelNewConnection();
    else if (this.targetPort && !this.isPortAvailable(this.targetPort)) this.setHighlight(connectionTargetTag);
  };

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

    const params = this.getEventParams(port, "source");

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
        if (this.sourcePort === port) this.setHighlight(connectionSourceTag, port);
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

    const sourcePort = this.sourcePort;
    const { port: newTargetPort, snapPoint } = this.findTarget(point, sourcePort);
    if (this.sourcePort !== sourcePort) return;

    this.endState = snapPoint ? { x: snapPoint.x, y: snapPoint.y } : { x: point.x, y: point.y };
    this.performRender();

    // Handle target port change
    if (newTargetPort !== this.targetPort) {
      this.targetPort = newTargetPort;
      this.setHighlight(connectionTargetTag);
      if (!this.sourcePort) return;

      const sourceParams = this.getEventParams(this.sourcePort, "source");
      const targetParams = this.getEventParams(newTargetPort, "target");

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
          if (newTargetPort && this.targetPort === newTargetPort) this.setHighlight(connectionTargetTag, newTargetPort);
        }
      );
    }
  }

  private findTarget(point: TPoint, sourcePort: PortState): { port?: PortState; snapPoint?: TPoint } {
    const hits = this.context.graph.getElementsOverPoint(point, [GraphComponent]);
    const { nearest, directVeto } = this.findSnappingTarget(point, sourcePort, hits[0]?.getPorts() ?? []);
    if (nearest) return { port: nearest, snapPoint: { x: nearest.x, y: nearest.y } };
    if (directVeto || this.sourceKind === "port") return {};

    const owner = hits.find(
      (hit) => (hit instanceof CanvasBlock || hit instanceof Anchor) && !hit.isTransparentToEvents()
    );
    if (!owner || owner === sourcePort.owner || !owner.isEntityAvailable()) return {};
    const port = owner instanceof CanvasBlock ? owner.getInputPort() : owner.getPorts()[0];
    if (!port || !this.isPortAvailable(port)) return {};
    const distance = Math.hypot(port.x - point.x, port.y - point.y);
    const blockDrop = this.sourceKind === "block" && owner instanceof CanvasBlock;
    if (!blockDrop && this.isSnappablePort(port) && distance > this.searchRadius) return {};
    return this.acceptsTarget(sourcePort, port, point, distance) ? { port } : {};
  }

  private findSnappingTarget(
    point: TPoint,
    sourcePort: PortState,
    directPorts: PortState[]
  ): { nearest?: PortState; directVeto: boolean } {
    const direct = new Set(directPorts);
    this.rebuildSnappingTree();
    const radius = this.searchRadius;
    const candidates = new Set(direct);
    for (const { port } of this.snappingPortsTree.search({
      minX: point.x - radius,
      minY: point.y - radius,
      maxX: point.x + radius,
      maxY: point.y + radius,
    })) {
      candidates.add(port);
    }

    let nearest: PortState | undefined;
    let nearestDistance = Infinity;
    let directVeto = false;
    for (const port of candidates) {
      if (port === sourcePort || !this.isSnappablePort(port) || !this.isPortAvailable(port)) continue;
      const distance = Math.hypot(port.x - point.x, port.y - point.y);
      if (distance > radius || distance >= nearestDistance) continue;
      if (this.acceptsTarget(sourcePort, port, point, distance)) {
        nearest = port;
        nearestDistance = distance;
      } else if (direct.has(port)) {
        directVeto = true;
      }
    }
    return { nearest, directVeto };
  }

  private acceptsTarget(sourcePort: PortState, port: PortState, point: TPoint, distance: number): boolean {
    const meta = this.getConnectionMeta(port);
    if (
      meta?.snappable &&
      meta.snapCondition &&
      !meta.snapCondition({ sourcePort, targetPort: port, cursorPosition: point, distance })
    )
      return false;
    return this.props.isConnectionAllowed?.({ sourcePort, targetPort: port }) ?? true;
  }

  private setHighlight(tag: TTag, port?: PortState): void {
    const tags = this.context.graph.scene.tags;
    if (tags.isBound(tag)) {
      this.highlights.delete(tag);
      return;
    }
    const previous = this.highlights.get(tag);
    if (previous) {
      this.highlights.delete(tag);
      tags.delete(tag, { [previous.type]: [previous.id] });
    }
    if (!port?.owner || !this.isPortAvailable(port)) return;
    const address = getEntityAddress(port.owner);
    if (!address || tags.peekOf(address.type, address.id).has(tag)) return;
    this.highlights.set(tag, address);
    tags.add(tag, { [address.type]: [address.id] });
  }

  protected cancelNewConnection(): void {
    if (this.currentListener) {
      // The drag handle stops listening and releases the cursor and auto-panning.
      this.currentListener.emit("cancel");
    }
    this.currentListener = null;
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
    this.clearSnappingTree();
    this.setHighlight(connectionTargetTag);
    this.setHighlight(connectionSourceTag);
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
    if (this.sourcePort !== sourcePort) return;

    this.resetState();

    const sourceParams = this.getEventParams(sourcePort, "source");

    if (!targetPort) {
      this.context.graph.emit("connection-create-drop", {
        sourceBlockId: sourceParams.blockId,
        sourceAnchorId: sourceParams.anchorId,
        point,
        sourcePort,
      });
      return;
    }

    const connectable = this.canConnect(sourceKind, sourcePort, targetPort);
    // A drop that creates a port-mode connection reports no block IDs, like connection-created.
    const portMode = connectable && !this.getConnectionEndpoints(sourcePort, targetPort);
    const dropSourceParams = portMode ? {} : sourceParams;
    const dropTargetParams = portMode ? {} : this.getEventParams(targetPort, "target");

    if (connectable) {
      // Determine port types to ensure correct connection direction (OUT -> IN)
      const [actualSourcePort, actualTargetPort] =
        this.getPortType(sourcePort) === EAnchorType.IN && this.getPortType(targetPort) === EAnchorType.OUT
          ? [targetPort, sourcePort]
          : [sourcePort, targetPort];

      // The event describes the connection that the default action writes.
      const endpoints = this.getConnectionEndpoints(actualSourcePort, actualTargetPort);
      const actualSourceParams = endpoints?.source ?? {};
      const actualTargetParams = endpoints?.target ?? {};

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
        () => this.createConnection(actualSourcePort, actualTargetPort)
      );
    }

    this.context.graph.emit("connection-create-drop", {
      sourceBlockId: dropSourceParams.blockId,
      sourceAnchorId: dropSourceParams.anchorId,
      targetBlockId: dropTargetParams.blockId,
      targetAnchorId: dropTargetParams.anchorId,
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

  /**
   * Writes the connection in one addressing mode:
   * - both ends are block point ports or anchor ports: block IDs (and anchor IDs);
   * - otherwise (any custom port): port IDs for both ends.
   */
  protected createConnection(source: PortState, target: PortState): void {
    if (!this.isPortAvailable(source) || !this.isPortAvailable(target)) return;
    const store = this.context.graph.connections;
    const endpoints = this.getConnectionEndpoints(source, target);
    if (endpoints) {
      const connection: TConnection = {
        sourceBlockId: endpoints.source.blockId,
        targetBlockId: endpoints.target.blockId,
      };
      if (endpoints.source.anchorId !== undefined) connection.sourceAnchorId = endpoints.source.anchorId;
      if (endpoints.target.anchorId !== undefined) connection.targetAnchorId = endpoints.target.anchorId;
      // Block and anchor connections have deterministic IDs.
      store.addConnection(connection);
      return;
    }
    const connection: TConnection = { sourcePortId: source.id, targetPortId: target.id };
    const existing = Array.from(store.$connectionsMap.value.values()).find(
      (state) => state.$sourcePortId.value === source.id && state.$targetPortId.value === target.id
    );
    if (existing) connection.id = existing.id;
    store.addConnection(connection);
  }

  private clearSnappingTree(): void {
    for (const unsubscribe of this.pointSubscriptions) unsubscribe();
    this.pointSubscriptions.length = 0;
    this.snappingPortsTree.clear();
    this.isSnappingTreeOutdated = true;
  }

  private rebuildSnappingTree(): void {
    if (!this.isSnappingTreeOutdated) return;
    this.clearSnappingTree();
    const ports = new Set<PortState>();
    for (const owner of this.context.graph.getElementsInViewport([GraphComponent])) {
      for (const port of owner.getPorts()) ports.add(port);
    }

    // Index geometry only. Eligibility can change between hover and release.
    const boxes: TSnappingPortBox[] = [];
    for (const port of ports) {
      const { x, y } = port.$point.peek();
      const box = { port, minX: x, minY: y, maxX: x, maxY: y };
      boxes.push(box);
      this.pointSubscriptions.push(
        port.$point.subscribe((point) => {
          if (point.x === box.minX && point.y === box.minY) return;
          this.snappingPortsTree.remove(box);
          box.minX = box.maxX = point.x;
          box.minY = box.maxY = point.y;
          this.snappingPortsTree.insert(box);
        })
      );
    }
    this.snappingPortsTree.load(boxes);
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
   * Block address of a port: a block's default point port for the role (`_output` for sources,
   * `_input` for targets) or an anchor port. Any other port, including a custom port on a block,
   * has no block address.
   */
  protected getBlockEndpoint(port: PortState | undefined, role: TEndpointRole): TEndpointParams | undefined {
    const component = port?.owner;
    if (!port || !component) {
      return undefined;
    }
    if (component instanceof Anchor) {
      const { blockId, id: anchorId } = component.connectedState;
      return port.id === createAnchorPortId(blockId, anchorId) ? { blockId, anchorId } : undefined;
    }
    if (component instanceof CanvasBlock) {
      const blockId = component.connectedState.id;
      if (port.id === createBlockPointPortId(blockId, role === "target")) {
        return { blockId };
      }
      const anchor = component.connectedState.$anchorStates.value.find(
        (state) => createAnchorPortId(blockId, state.id) === port.id
      );
      return anchor ? { blockId, anchorId: anchor.id } : undefined;
    }
    return undefined;
  }

  /** Block addresses of both ends, or `undefined` when the connection must be written with port IDs. */
  private getConnectionEndpoints(
    source: PortState,
    target: PortState
  ): { source: TEndpointParams; target: TEndpointParams } | undefined {
    const sourceEndpoint = this.getBlockEndpoint(source, "source");
    const targetEndpoint = this.getBlockEndpoint(target, "target");
    return sourceEndpoint && targetEndpoint ? { source: sourceEndpoint, target: targetEndpoint } : undefined;
  }

  /** Block and anchor IDs for event payloads; empty for a port without a block address. */
  protected getEventParams(port: PortState | undefined, role: TEndpointRole): TEndpointParams {
    return this.getBlockEndpoint(port, role) ?? {};
  }

  public override unmount(): void {
    super.unmount();
  }

  protected override unmountLayer(): void {
    if (this.isCreating()) this.cancelNewConnection();
    else this.currentListener?.emit("cancel");
    this.currentListener = null;
    super.unmountLayer();
  }
}
