import { ReadonlySignal, computed, signal } from "@preact/signals-core";

import { Component, TComponentState } from "../../../lib/Component";
import { CoreComponentProps } from "../../../lib/CoreComponent";
import { ESchedulerPriority } from "../../../lib/Scheduler";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import { ConnectionState } from "../../../store/connection/ConnectionState";
import type { TConnectionsRenderer } from "../../../store/settings";
import { getFontSize } from "../../../utils/functions/text";
import { debounce } from "../../../utils/utils/schedule";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BatchPath2DRenderer } from "./BatchPath2D";
import { BlockConnection, TConnectionProps } from "./BlockConnection";
import { ConnectionLabelRenderer } from "./Label";
import type { IConnectionBatch } from "./batch";
import { WebGLConnections } from "./webgl/WebGLConnections";

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

  private path2d: BatchPath2DRenderer | undefined;

  protected renderer: TConnectionsRenderer = "canvas";

  private webgl: WebGLConnections | undefined;

  /** Set when WebGL2 is unavailable for the current `"webgl"` request; cleared when the setting changes. */
  private webglUnavailable = false;

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

  /** Requests a renderer for the whole graph; the WebGL renderer is created on the next frame. */
  protected setRenderer(renderer: TConnectionsRenderer): void {
    this.renderer = renderer;
    this.webglUnavailable = false;
    if (renderer === "canvas" && this.webgl) this.detachWebGL();
    this.performRender();
  }

  /**
   * Creates the WebGL batch on the first frame that wants it: the renderer subscription fires in the constructor,
   * before the graph layer's canvas is in the document.
   */
  private ensureWebGL(): void {
    if (this.renderer !== "webgl" || this.webgl || this.webglUnavailable || !this.context.canvas.isConnected) return;
    const { PATH2D_CHUNK_SIZE, PATH2D_CHUNK_TILES } = this.context.constants.connection;
    // Without WebGL2, or when the shaders fail and creation throws, canvas stays until the setting changes.
    this.webglUnavailable = true;
    const webgl = WebGLConnections.create(this.context.canvas, {
      chunkSize: PATH2D_CHUNK_SIZE || 200,
      cellSize: this.context.constants.system.VISIBILITY_TILE_SIZE * PATH2D_CHUNK_TILES,
      getCamera: () => this.context.camera.getCameraState(),
      onChange: () => this.performRender(),
      // A lost context falls back to canvas until the setting changes again.
      onLost: () => {
        this.detachWebGL();
        this.webglUnavailable = true;
        this.performRender();
      },
    });
    if (!webgl) return;
    this.webglUnavailable = false;
    webgl.setEffects(this.context.graph.rootStore.settings.$settings.value.connectionEffects);
    this.switchBatch(webgl);
    this.webgl = webgl;
    this.path2d = undefined;
  }

  /** Moves every connection back to a fresh Path2D batch. */
  private detachWebGL(): void {
    if (!this.webgl) return;
    const path2d = this.createPath2D();
    this.switchBatch(path2d);
    this.path2d = path2d;
    this.webgl.dispose();
    this.webgl = undefined;
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
      computed(() => this.context.graph.rootStore.settings.$settings.value.connectionsRenderer).subscribe((renderer) =>
        this.setRenderer(renderer)
      ),
      // Settings are copied on every update; the renderer compares effects by content.
      computed(() => this.context.graph.rootStore.settings.$settings.value.connectionEffects).subscribe((effects) =>
        this.webgl?.setEffects(effects)
      ),
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
    this.webgl?.dispose();
    this.webgl = undefined;
  }

  /** Parents prepare before their children: the batch is chosen before any connection computes geometry for it. */
  protected willIterate(): void {
    super.willIterate();
    this.ensureWebGL();
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
    // Fallback for a canvas that was not connected yet during the prepare phase.
    this.ensureWebGL();
    // Lines: the layer's culling viewport (undefined without culling: every chunk is drawn). Labels: the same
    // rectangle, or the camera's without culling, and none while connections are not walked.
    const viewport = this.getCullingViewport();
    // One of them exists: Path2D draws on the layer's canvas, WebGL on its own canvas below it.
    this.path2d?.render(this.context.ctx, viewport);
    this.webgl?.render(viewport);
    // Labels follow every line and arrow and precede blocks, which the next layer child draws.
    if (this.shouldRenderChildren) this.labels.render(this.context.ctx, viewport ?? this.getCameraRect());
    // Path2D animates only by redrawing the whole layer, and only while an animated chunk is visible.
    if (this.path2d?.drewAnimated) this.performRender();
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
