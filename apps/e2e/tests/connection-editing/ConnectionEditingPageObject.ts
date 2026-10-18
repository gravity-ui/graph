import type { Page } from "@playwright/test";

import type { GraphPoint } from "@gravity-ui/graph/playwright";

import type { GraphPageObject } from "../../page-objects/GraphPageObject";

export type TRecordedConnectionEvent = {
  type: string;
  sourceBlockId?: string;
  sourceAnchorId?: string;
  targetBlockId?: string;
  targetAnchorId?: string;
  blockId?: string;
  anchorId?: string;
  sourcePortId?: string;
  targetPortId?: string;
  hasPoint: boolean;
};

export type TLayerOptions = {
  enabled?: boolean;
  captureAnchors?: boolean;
  /** Rejects every target whose port ID is in this list (installs `isConnectionAllowed`). */
  rejectTargetPortIds?: string[];
  /** Starts connections only from ports with connection meta (former `PortConnectionLayer` behaviour). */
  portSourcesOnly?: boolean;
};

export const CONNECTION_EVENTS = [
  "connection-create-start",
  "connection-create-hover",
  "connection-created",
  "connection-create-drop",
  "connection-create-cancel",
] as const;

type TLayerWindow = Window & {
  connectionEditingLayer?: InstanceType<Window["GraphModule"]["ConnectionEditingLayer"]>;
  connectionEvents?: TRecordedConnectionEvent[];
};

/**
 * Drives `ConnectionEditingLayer` the way a consumer uses it: the layer is added through the public
 * `graph.addLayer` API and connections are created with real mouse drags.
 */
export class ConnectionEditingPageObject {
  constructor(
    private readonly page: Page,
    private readonly graphPO: GraphPageObject
  ) {}

  public async addLayer(options: TLayerOptions = {}): Promise<void> {
    await this.page.evaluate((opts) => {
      const win = window as TLayerWindow;
      const { ConnectionEditingLayer } = window.GraphModule;
      const rejected = opts.rejectTargetPortIds;
      const metaKey = ConnectionEditingLayer.PortMetaKey;
      win.connectionEditingLayer = window.graph.addLayer(ConnectionEditingLayer, {
        enabled: opts.enabled,
        captureAnchors: opts.captureAnchors,
        isConnectionAllowed: rejected ? ({ targetPort }) => !rejected.includes(String(targetPort.id)) : undefined,
        canStart: opts.portSourcesOnly
          ? ({ sourcePort }) => {
              const meta = sourcePort.meta as Record<symbol, { snappable?: boolean } | undefined> | undefined;
              return Boolean(meta?.[metaKey]?.snappable);
            }
          : undefined,
      });
    }, options);
    await this.graphPO.waitForFrames(2);
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    await this.page.evaluate((value) => {
      const layer = (window as TLayerWindow).connectionEditingLayer;
      if (!layer) throw new Error("Layer is not added");
      if (value) layer.enable();
      else layer.disable();
    }, enabled);
  }

  public async removeLayer(): Promise<void> {
    await this.page.evaluate(() => {
      const win = window as TLayerWindow;
      if (win.connectionEditingLayer) window.graph.removeLayer(win.connectionEditingLayer);
      win.connectionEditingLayer = undefined;
    });
  }

  /** Records every connection creation event with serializable fields. */
  public async recordEvents(): Promise<void> {
    await this.page.evaluate((eventNames) => {
      const win = window as TLayerWindow;
      win.connectionEvents = [];
      for (const name of eventNames) {
        window.graph.on(name, (event: CustomEvent) => {
          const detail = event.detail as Record<string, unknown>;
          const id = (value: unknown): string | undefined => (value === undefined ? undefined : String(value));
          const portId = (value: unknown): string | undefined =>
            value && typeof value === "object" && "id" in value ? String(value.id) : undefined;
          win.connectionEvents?.push({
            type: name,
            sourceBlockId: id(detail.sourceBlockId),
            sourceAnchorId: id(detail.sourceAnchorId),
            targetBlockId: id(detail.targetBlockId),
            targetAnchorId: id(detail.targetAnchorId),
            blockId: id(detail.blockId),
            anchorId: id(detail.anchorId),
            sourcePortId: portId(detail.sourcePort),
            targetPortId: portId(detail.targetPort),
            hasPoint: detail.point !== undefined,
          });
        });
      }
    }, CONNECTION_EVENTS);
  }

  public async getEvents(): Promise<TRecordedConnectionEvent[]> {
    return this.page.evaluate(() => (window as TLayerWindow).connectionEvents ?? []);
  }

  public async getEventTypes(): Promise<string[]> {
    return (await this.getEvents()).map((event) => event.type);
  }

  /** Calls `preventDefault()` on every event with this name. */
  public async preventDefault(eventName: (typeof CONNECTION_EVENTS)[number]): Promise<void> {
    await this.page.evaluate((name) => {
      window.graph.on(name, (event: CustomEvent) => event.preventDefault());
    }, eventName);
  }

  /** ID of an anchor's port, as the library builds it. */
  public async anchorPortId(blockId: string, anchorId: string): Promise<string> {
    return this.page.evaluate((ids) => String(window.GraphModule.createAnchorPortId(ids.blockId, ids.anchorId)), {
      blockId,
      anchorId,
    });
  }

  /** ID of a block's default point port (`isInput`: the target point). */
  public async blockPointPortId(blockId: string, isInput: boolean): Promise<string> {
    return this.page.evaluate((ids) => String(window.GraphModule.createBlockPointPortId(ids.blockId, ids.isInput)), {
      blockId,
      isInput,
    });
  }

  /**
   * Adds groups rendered by the BlockGroups layer (plain GraphComponents, neither blocks nor anchors).
   * Groups are draggable: the camera does not pan when a drag starts on a draggable component.
   */
  public async addGroups(
    groups: Array<{ id: string; rect: { x: number; y: number; width: number; height: number } }>
  ): Promise<void> {
    await this.page.evaluate((list) => {
      // Groups have no public accessor on Graph; the groups store is reached through rootStore.
      window.graph.addLayer(window.GraphModule.BlockGroups, { draggable: true });
      window.graph.rootStore.groupsList.setGroups(list);
    }, groups);
    await this.graphPO.waitForFrames(3);
  }

  /** Creates a connection port with the given ID on a block or group view component, at a world point. */
  public async addCustomPort(
    owner: { blockId: string } | { groupId: string },
    portId: string,
    point: GraphPoint
  ): Promise<void> {
    await this.graphPO.evaluate(
      (graph, args) => {
        const view =
          "blockId" in args.owner
            ? graph.blocks.getBlockState(args.owner.blockId)?.getViewComponent()
            : graph.rootStore.groupsList.getGroupState(args.owner.groupId)?.getViewComponent();
        if (!view) throw new Error("Port owner has no view component");
        view.getPort(args.portId).updatePort({
          x: args.point.x,
          y: args.point.y,
          meta: { [window.GraphModule.ConnectionEditingLayer.PortMetaKey]: { snappable: true } },
        });
      },
      { owner, portId, point }
    );
    await this.graphPO.waitForFrames(1);
  }

  /** World position of an anchor's port. */
  public async getAnchorPoint(blockId: string, anchorId: string): Promise<GraphPoint> {
    return this.graphPO.evaluate(
      (graph, ids) => {
        const portId = window.GraphModule.createAnchorPortId(ids.blockId, ids.anchorId);
        const port = graph.connections.getPort(portId);
        if (!port) throw new Error(`Port ${String(portId)} not found`);
        return { x: port.x, y: port.y };
      },
      { blockId, anchorId }
    );
  }

  /** Marks anchor ports as connection ports (`meta[ConnectionEditingLayer.PortMetaKey]`). */
  public async makeAnchorPortsSnappable(
    anchors: Array<{ blockId: string; anchorId: string }>,
    options: { rejectAll?: boolean } = {}
  ): Promise<void> {
    await this.graphPO.evaluate(
      (graph, { list, rejectAll }) => {
        const { ConnectionEditingLayer, createAnchorPortId } = window.GraphModule;
        for (const { blockId, anchorId } of list) {
          const port = graph.connections.getPort(createAnchorPortId(blockId, anchorId));
          if (!port) throw new Error(`Port for ${blockId}/${anchorId} not found`);
          port.updatePort({
            meta: {
              [ConnectionEditingLayer.PortMetaKey]: {
                snappable: true,
                snapCondition: rejectAll ? () => false : undefined,
              },
            },
          });
        }
      },
      { list: anchors, rejectAll: Boolean(options.rejectAll) }
    );
  }

  /** Presses the mouse at `from`, moves to `to` and leaves the button pressed. */
  public async pressAndMove(from: GraphPoint, to: GraphPoint): Promise<void> {
    const [start, end] = await Promise.all([this.toViewport(from), this.toViewport(to)]);
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(start.x + 10, start.y + 10, { steps: 2 });
    await this.page.mouse.move(end.x, end.y, { steps: 5 });
    await this.graphPO.waitForFrames(2);
  }

  /** Moves the pressed mouse to `to`. */
  public async moveTo(to: GraphPoint): Promise<void> {
    const end = await this.toViewport(to);
    await this.page.mouse.move(end.x, end.y, { steps: 5 });
    await this.graphPO.waitForFrames(2);
  }

  /** Presses at `from`, jumps to `to` with a single mousemove and releases without waiting for a frame. */
  public async flick(from: GraphPoint, to: GraphPoint): Promise<void> {
    const [start, end] = await Promise.all([this.toViewport(from), this.toViewport(to)]);
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    // The first move sets the drag threshold origin; the jump starts the drag with no update before mouseup.
    await this.page.mouse.move(start.x + 1, start.y);
    await this.page.mouse.move(end.x, end.y);
    await this.page.mouse.up();
    await this.graphPO.waitForFrames(2);
  }

  /** Presses the mouse at `point` without moving. */
  public async press(point: GraphPoint): Promise<void> {
    await this.graphPO.hoverAt(point);
    await this.page.mouse.down();
  }

  public async release(): Promise<void> {
    await this.page.mouse.up();
    await this.graphPO.waitForFrames(2);
  }

  private async toViewport(point: GraphPoint): Promise<GraphPoint> {
    return this.graphPO.evaluate((graph, worldPoint) => {
      const [x, y] = graph.cameraService.getAbsoluteXY(worldPoint.x, worldPoint.y);
      const rect = graph.layers.$root?.getBoundingClientRect();
      if (!rect) throw new Error("Graph root is not attached");
      return { x: rect.left + x, y: rect.top + y };
    }, point);
  }
}
