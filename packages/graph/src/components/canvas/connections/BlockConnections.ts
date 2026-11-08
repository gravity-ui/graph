import { ReadonlySignal, Signal, computed, signal } from "@preact/signals-core";

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
import type { TConnectionsRenderer, TConnectionsRendererState } from "./lines";
import { LostWebGLContext, WebGLConnections } from "./webgl/WebGLConnections";
import { WebGLProgramError } from "./webgl/programs";

export type TGraphConnectionsContext = TGraphLayerContext & {
  batch: IConnectionBatch;
  /** Draws connection labels after the batch. */
  labels: ConnectionLabelRenderer;
  connectionLabelFontSize: ReadonlySignal<number>;
};

export type TBlockConnectionsProps = CoreComponentProps & {
  /** Receives what draws the lines now; BlockConnections is its only writer. Read once, at construction. */
  rendererState?: Signal<TConnectionsRendererState>;
};

/** The reasons a WebGL line class is drawn with Path2D, as the fallback warning names them. */
type TWebGLFallbackReason =
  | "no WebGL2"
  | "context lost"
  | `shaders failed: ${string}`
  | `WebGL setup failed: ${string}`;

/**
 * The graph's connections and the batch that draws their lines: Path2D on the layer's canvas, or WebGL2 on a canvas
 * below it when the connection class's line is a WebGL line (`static line`). The line class is the only source of the
 * renderer; without WebGL2 a WebGL line class falls back to Path2D.
 */
export class BlockConnections extends Component<TBlockConnectionsProps, TComponentState, TGraphConnectionsContext> {
  public get connections(): ConnectionState[] {
    return this.context.graph.rootStore.connectionsList.$connections.value;
  }

  protected readonly unsubscribe: (() => void)[];

  protected batch: IConnectionBatch;

  /** Draws the batch on the layer's canvas; undefined while WebGL draws. */
  private path2d: BatchPath2DRenderer | undefined;

  /** The renderer the connection class's line asks for. */
  protected renderer: TConnectionsRenderer = "canvas";

  /** Draws the batch on its own canvas; created on the first frame with the layer's canvas in the document. */
  private webgl: WebGLConnections | undefined;

  /**
   * A renderer whose context is lost, or a context lost while a renderer was set up; disposed when the browser
   * restores the context or the request changes.
   */
  private lostWebGL: WebGLConnections | LostWebGLContext | undefined;

  /** Set when WebGL2 cannot be created for the current request; cleared when the connection class changes. */
  private webglUnavailable = false;

  /** What draws the lines now. */
  private readonly rendererState: Signal<TConnectionsRendererState>;

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

  constructor(props: TBlockConnectionsProps, parent: Component) {
    super(props, parent);
    this.rendererState = this.props.rendererState ?? signal<TConnectionsRendererState>("canvas");
    const { chunkSize, cellSize } = this.getChunking();
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

  /** Items per chunk and the world size of a grid cell, shared by the batches and the label pass. */
  private getChunking(): { chunkSize: number; cellSize: number } {
    const { PATH2D_CHUNK_SIZE, PATH2D_CHUNK_TILES } = this.context.constants.connection;
    return {
      chunkSize: PATH2D_CHUNK_SIZE || 200,
      cellSize: this.context.constants.system.VISIBILITY_TILE_SIZE * PATH2D_CHUNK_TILES,
    };
  }

  private createPath2D(): BatchPath2DRenderer {
    const { chunkSize, cellSize } = this.getChunking();
    return new BatchPath2DRenderer(() => this.performRender(), chunkSize, cellSize);
  }

  /** Requests a renderer for the whole graph; the WebGL renderer is created on the next frame. */
  protected setRenderer(renderer: TConnectionsRenderer): void {
    this.renderer = renderer;
    this.webglUnavailable = false;
    this.disposeLostWebGL();
    this.detachWebGL()?.dispose();
    // Path2D draws until a WebGL renderer is created.
    this.rendererState.value = "canvas";
    this.performRender();
  }

  /**
   * Creates the WebGL batch on the first frame that wants it: the renderer subscription fires in the constructor,
   * before the graph layer's canvas is in the document. Without WebGL2, or when its setup fails, Path2D draws until
   * the connection class changes; after a lost context (one lost during the setup included), until the browser
   * restores it.
   */
  private ensureWebGL(): void {
    if (this.renderer !== "webgl" || this.webgl || this.lostWebGL || this.webglUnavailable) return;
    if (!this.context.canvas.isConnected) return;
    let webgl: WebGLConnections | LostWebGLContext | undefined;
    try {
      webgl = WebGLConnections.create(this.context.canvas, {
        ...this.getChunking(),
        getCamera: () => this.context.camera.getCameraState(),
        onChange: () => this.performRender(),
        onLost: () => this.handleWebGLLost(webgl),
        onRestored: () => this.handleWebGLRestored(webgl),
      });
    } catch (error) {
      this.webglUnavailable = true;
      this.fallBack(
        error instanceof WebGLProgramError
          ? `shaders failed: ${error.message}`
          : `WebGL setup failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    if (!webgl) {
      this.webglUnavailable = true;
      this.fallBack("no WebGL2");
      return;
    }
    if (webgl instanceof LostWebGLContext) {
      this.lostWebGL = webgl;
      this.fallBack("context lost");
      return;
    }
    this.switchBatch(webgl);
    this.webgl = webgl;
    this.path2d = undefined;
    this.rendererState.value = "webgl";
  }

  /** Path2D keeps drawing the WebGL lines, with their fallback strokes; one warning per fallback. */
  private fallBack(reason: TWebGLFallbackReason): void {
    console.warn(
      `[@gravity-ui/graph] WebGL2 is unavailable (${reason}); connections are drawn with Path2D using each effect's ` +
        "fallback stroke."
    );
    this.rendererState.value = "webgl-fallback";
    this.performRender();
  }

  /** Path2D draws while the context is lost; the lost renderer stays to hear the restore. */
  private handleWebGLLost(webgl: WebGLConnections | LostWebGLContext | undefined): void {
    if (!webgl || webgl !== this.webgl) return;
    this.lostWebGL = this.detachWebGL();
    this.fallBack("context lost");
  }

  /** The restored context has none of the renderer's objects: a fresh renderer is created on the next frame. */
  private handleWebGLRestored(webgl: WebGLConnections | LostWebGLContext | undefined): void {
    if (!webgl || webgl !== this.lostWebGL) return;
    this.disposeLostWebGL();
    this.performRender();
  }

  /** Moves every connection to a fresh Path2D batch and returns the WebGL renderer, which the caller frees or keeps. */
  private detachWebGL(): WebGLConnections | undefined {
    const webgl = this.webgl;
    if (!webgl) return undefined;
    const path2d = this.createPath2D();
    this.switchBatch(path2d);
    this.path2d = path2d;
    this.webgl = undefined;
    return webgl;
  }

  private disposeLostWebGL(): void {
    this.lostWebGL?.dispose();
    this.lostWebGL = undefined;
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
      // The kind of the connection class's line is the only source of the renderer.
      computed(
        () => (this.context.graph.rootStore.settings.$connection.value ?? BlockConnection).line.renderer
      ).subscribe((renderer) => this.setRenderer(renderer)),
      this.context.graph.rootStore.settings.$connectionsSettings.subscribe(() => {
        this.scheduleUpdate();
      }),
      this.context.graph.rootStore.connectionsList.$connections.subscribe(() => {
        this.scheduleUpdate();
      }),
      this.context.graph.rootStore.settings.$connection.subscribe(() => {
        // A new class tries WebGL again after a failed creation, before its connections mount; a working renderer
        // stays as it is.
        this.webglUnavailable = false;
        this.scheduleUpdate();
      }),
      this.context.layer.$attached.subscribe((attached) => this.handleLayerAttached(attached)),
    ];
  }

  /**
   * Nothing draws while the graph layer is detached (`graph.stop()`, `graph.detach()`): the WebGL renderer stops its
   * frames and its canvas leaves the root, keeping its GL objects; the next frame after the attach puts it back.
   */
  private handleLayerAttached(attached: boolean): void {
    if (attached) {
      this.performRender();
      return;
    }
    this.webgl?.suspend();
    // A lost renderer keeps listening for the restore outside the document.
    this.lostWebGL?.suspend();
  }

  protected unmount() {
    super.unmount();

    this.scheduleUpdate.cancel();
    this.unsubscribe.forEach((reactionDisposer) => reactionDisposer());
    this.webgl?.dispose();
    this.webgl = undefined;
    this.disposeLostWebGL();
    // Nothing draws the lines any more.
    this.rendererState.value = "canvas";
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
    // For a canvas that was not in the document yet during the prepare phase.
    this.ensureWebGL();
    // Lines: the layer's culling viewport (undefined without culling: every chunk is drawn). Labels: the same
    // rectangle, or the camera's without culling, and none while connections are not walked.
    const viewport = this.getCullingViewport();
    // One of them exists: Path2D draws on the layer's canvas, WebGL on its own canvas below it.
    this.path2d?.render(this.context.ctx, viewport);
    this.webgl?.render(viewport);
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
