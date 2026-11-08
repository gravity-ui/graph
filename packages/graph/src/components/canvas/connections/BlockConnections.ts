import { ReadonlySignal, computed, signal } from "@preact/signals-core";

import { Component, TComponentState } from "../../../lib/Component";
import { CoreComponentProps } from "../../../lib/CoreComponent";
import { ESchedulerPriority } from "../../../lib/Scheduler";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import { ConnectionState } from "../../../store/connection/ConnectionState";
import { getFontSize } from "../../../utils/functions/text";
import { debounce } from "../../../utils/utils/schedule";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BatchPath2DRenderer } from "./BatchPath2D";
import { BlockConnection, TConnectionProps } from "./BlockConnection";
import { ConnectionLabelRenderer } from "./Label";
import type { IConnectionBatch } from "./batch";

export type TGraphConnectionsContext = TGraphLayerContext & {
  batch: IConnectionBatch;
  /** Draws connection labels after the batch. */
  labels: ConnectionLabelRenderer;
  connectionLabelFontSize: ReadonlySignal<number>;
};

export class BlockConnections extends Component<CoreComponentProps, TComponentState, TGraphConnectionsContext> {
  public get connections(): ConnectionState[] {
    return this.context.graph.rootStore.connectionsList.$connections.value;
  }

  protected readonly unsubscribe: (() => void)[];

  protected batch: IConnectionBatch;

  /** Draws the batch on the layer's canvas. */
  private path2d: BatchPath2DRenderer | undefined;

  protected labels: ConnectionLabelRenderer;

  /** Reused every frame by `getCameraRect()`. */
  private readonly cameraRect: TTileRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  private readonly connectionLabelFontSize = signal(0);

  /**
   * Debounced update to batch multiple changes into a single render cycle.
   * Uses high priority and single frame interval for responsive updates.
   */
  private scheduleUpdate = debounce(
    () => {
      this.performRender();
      this.shouldUpdateChildren = true;
    },
    {
      priority: ESchedulerPriority.HIGHEST,
      frameInterval: 1,
    }
  );

  constructor(props: {}, parent: Component) {
    super(props, parent);
    const { PATH2D_CHUNK_SIZE, PATH2D_CHUNK_TILES } = this.context.constants.connection;
    const chunkSize = PATH2D_CHUNK_SIZE || 200;
    const cellSize = this.context.constants.system.VISIBILITY_TILE_SIZE * PATH2D_CHUNK_TILES;
    this.path2d = this.createPath2D();
    this.batch = this.path2d;
    this.labels = new ConnectionLabelRenderer(() => this.performRender(), chunkSize, cellSize);
    this.unsubscribe = this.subscribe();
    this.setContext({
      batch: this.batch,
      labels: this.labels,
      connectionLabelFontSize: this.connectionLabelFontSize,
    });
  }

  private createPath2D(): BatchPath2DRenderer {
    const { PATH2D_CHUNK_SIZE, PATH2D_CHUNK_TILES } = this.context.constants.connection;
    const cellSize = this.context.constants.system.VISIBILITY_TILE_SIZE * PATH2D_CHUNK_TILES;
    return new BatchPath2DRenderer(() => this.performRender(), PATH2D_CHUNK_SIZE || 200, cellSize);
  }

  /** Moves every registered item into `next`, which becomes the batch of every connection. */
  protected switchBatch(next: IConnectionBatch): void {
    this.batch.forEachItem((item, params) => next.add(item, params));
    this.batch = next;
    this.setContext({ batch: next });
  }

  protected subscribe() {
    return [
      computed(() => {
        const scale = this.context.graph.$camera.value.scale;
        const threshold = this.context.graph.$graphConstants.value.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;
        return scale < threshold ? 0 : Math.max(14, getFontSize(9, scale));
      }).subscribe((fontSize) => {
        // An eager signal stops unchanged camera updates before they reach individual connections.
        this.connectionLabelFontSize.value = fontSize;
      }),
      this.context.graph.rootStore.settings.$connectionsSettings.subscribe(() => {
        this.scheduleUpdate();
      }),
      this.context.graph.rootStore.connectionsList.$connections.subscribe(() => {
        this.scheduleUpdate();
      }),
      this.context.graph.rootStore.settings.$connection.subscribe(() => {
        this.scheduleUpdate();
      }),
    ];
  }

  protected unmount() {
    super.unmount();

    this.scheduleUpdate.cancel();
    this.unsubscribe.forEach((reactionDisposer) => reactionDisposer());
  }

  protected updateChildren() {
    if (!this.connections) return [];
    const settings = this.context.graph.rootStore.settings.$connectionsSettings.value;
    const ConnectionCtop = this.context.graph.rootStore.settings.$connection.value || BlockConnection;
    return this.connections.map((connection) => {
      const props: TConnectionProps = {
        id: connection.id,
        useBezier: settings.useBezierConnections,
        bezierDirection: settings.bezierConnectionDirection,
        useTightBezierBounds: settings.useTightBezierBounds,
        showConnectionLabels: settings.showConnectionLabels,
        showConnectionArrows: settings.showConnectionArrows,
      };
      return ConnectionCtop.create(props, { key: String(connection.id) });
    });
  }

  protected render(): void {
    // Lines: the layer's culling viewport (undefined without culling: every chunk is drawn). Labels: the same
    // rectangle, or the camera's without culling, and none while connections are not walked.
    const viewport = this.getCullingViewport();
    this.path2d?.render(this.context.ctx, viewport);
    // Labels follow every line and arrow and precede blocks, which the next layer child draws.
    if (this.shouldRenderChildren) this.labels.render(this.context.ctx, viewport ?? this.getCameraRect());
  }

  /** The camera's world rectangle (the full viewport, insets ignored, like CameraService.isRectVisible). */
  private getCameraRect(): TTileRect {
    const { relativeX, relativeY, relativeWidth, relativeHeight } = this.context.camera.getCameraState();
    const rect = this.cameraRect;
    rect.minX = -relativeX;
    rect.minY = -relativeY;
    rect.maxX = -relativeX + relativeWidth;
    rect.maxY = -relativeY + relativeHeight;
    return rect;
  }
}
