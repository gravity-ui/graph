import { ReadonlySignal, Signal, computed, signal } from "@preact/signals-core";

import { Component, TComponentState } from "../../../lib/Component";
import { CoreComponentProps } from "../../../lib/CoreComponent";
import { ESchedulerPriority } from "../../../lib/Scheduler";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import { ConnectionState } from "../../../store/connection/ConnectionState";
import { getFontSize } from "../../../utils/functions/text";
import { debounce } from "../../../utils/utils/schedule";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BaseConnection } from "./BaseConnection";
import { BatchPath2DRenderer } from "./BatchPath2D";
import { BlockConnection, TConnectionProps } from "./BlockConnection";
import { ConnectionLabelRenderer } from "./Label";
import type { IConnectionBatch } from "./batch";
import type { TConnectionsRendererState } from "./lines";

export type TGraphConnectionsContext = TGraphLayerContext & {
  batch: IConnectionBatch;
  /** Draws connection labels after the batch. */
  labels: ConnectionLabelRenderer;
  connectionLabelFontSize: ReadonlySignal<number>;
  /**
   * Whether the latest change of `connectionLabelFontSize` came from the camera's scale alone, not from the graph
   * constants (its threshold): a label box it resizes then asks for no retarget (settled item 11). Unset: false.
   */
  isLabelFontSizeFromCamera?: () => boolean;
};

export type TBlockConnectionsProps = CoreComponentProps & {
  /** Receives what draws the lines now; BlockConnections is its only writer. Read once, at construction. */
  rendererState?: Signal<TConnectionsRendererState>;
};

/** Starts every replacement key, and escapes the ids that start with it (`BlockConnections.keyOf`). */
const KEY_ESCAPE = "\u0000";

/** Owns connection views and the Canvas batch for imperative connection extensions. */
export class BlockConnections extends Component<TBlockConnectionsProps, TComponentState, TGraphConnectionsContext> {
  public get connections(): ConnectionState[] {
    return this.context.graph.rootStore.connectionsList.$connections.value;
  }

  protected readonly unsubscribe: (() => void)[];

  protected readonly batch: BatchPath2DRenderer;

  /** What draws the lines now. */
  private readonly rendererState: Signal<TConnectionsRendererState>;

  protected labels: ConnectionLabelRenderer;

  /** Reused every frame by `getCameraRect()`. */
  private readonly cameraRect: TTileRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  private readonly connectionLabelFontSize = signal(0);

  /** The scale and threshold the label font size was last computed from (`isLabelFontSizeFromCamera`). */
  private labelFontInputs?: { readonly scale: number; readonly threshold: number };

  /** Whether the latest change of the label font size came from the camera's scale alone. */
  private labelFontSizeFromCamera = false;

  /** The component keys of connection states that replaced another state of their id (`keyReplacements`). */
  private readonly replacementKeys = new WeakMap<ConnectionState, string>();

  /** Makes each replacement key unique. */
  private replacementCount = 0;

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
    this.batch = new BatchPath2DRenderer(() => this.performRender(), chunkSize, cellSize);
    this.labels = new ConnectionLabelRenderer(() => this.performRender(), chunkSize, cellSize);
    this.unsubscribe = this.subscribe();
    this.setContext({
      batch: this.batch,
      labels: this.labels,
      connectionLabelFontSize: this.connectionLabelFontSize,
      isLabelFontSizeFromCamera: (): boolean => this.labelFontSizeFromCamera,
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

  protected subscribe() {
    return [
      computed(() => {
        const scale = this.context.graph.$camera.value.scale;
        const threshold = this.context.graph.$graphConstants.value.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;
        return scale < threshold ? 0 : Math.max(14, getFontSize(9, scale));
      }).subscribe((fontSize) => {
        // What changed since the last change of the font size: the scale alone is a camera change (settled item 11);
        // a threshold change (graph constants) is not. A threshold change that left the font size as it was is seen
        // at the next change, which then counts as not from the camera: one retarget more, never one less.
        const scale = this.context.graph.$camera.peek().scale;
        const threshold = this.context.graph.$graphConstants.peek().connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;
        const inputs = this.labelFontInputs;
        this.labelFontSizeFromCamera = inputs !== undefined && inputs.threshold === threshold && inputs.scale !== scale;
        this.labelFontInputs = { scale, threshold };
        // An eager signal stops unchanged camera updates before they reach individual connections.
        this.connectionLabelFontSize.value = fontSize;
      }),
      this.context.graph.scene.$renderer.subscribe((renderer) => {
        if (renderer === "lost" || renderer === "webgl-fallback") {
          this.rendererState.value = "webgl-fallback";
        } else {
          this.rendererState.value = renderer === "webgl" ? "webgl" : "canvas";
        }
      }),
      this.context.graph.rootStore.settings.$connectionsSettings.subscribe(() => this.scheduleUpdate()),
      this.context.graph.rootStore.connectionsList.$connections.subscribe(() => this.scheduleUpdate()),
      this.context.graph.rootStore.settings.$connection.subscribe(() => this.scheduleUpdate()),
    ];
  }

  protected unmount(): void {
    super.unmount();
    this.scheduleUpdate.cancel();
    this.unsubscribe.forEach((dispose) => dispose());
    this.rendererState.value = "canvas";
  }

  protected updateChildren() {
    if (!this.connections) return [];
    const settings = this.context.graph.rootStore.settings.$connectionsSettings.value;
    const ConnectionCtop = this.context.graph.rootStore.settings.$connection.value || BlockConnection;
    this.keyReplacements();
    return this.connections.map((connection) => {
      const props: TConnectionProps = {
        id: connection.id,
        useBezier: settings.useBezierConnections,
        bezierDirection: settings.bezierConnectionDirection,
        useTightBezierBounds: settings.useTightBezierBounds,
        showConnectionLabels: settings.showConnectionLabels,
        showConnectionArrows: settings.showConnectionArrows,
      };
      return ConnectionCtop.create(props, { key: this.keyOf(connection) });
    });
  }

  /**
   * The component key of a connection state. Two namespaces that cannot meet: a replacement's key (`keyReplacements`)
   * is the escape character, `r` and a counter; an id is its own key, and an id that starts with the escape character
   * gets one more in front. So no id, however it is spelled, takes a replacement's key or another id's.
   */
  private keyOf(connection: ConnectionState): string {
    const replacement = this.replacementKeys.get(connection);
    if (replacement !== undefined) return replacement;
    const id = String(connection.id);
    return id.startsWith(KEY_ESCAPE) ? `${KEY_ESCAPE}${id}` : id;
  }

  /**
   * Gives a key of its own to each connection state that replaced another state of its id while that state's
   * component is still mounted: the connection was removed and added back with its id before a frame (the store
   * destroyed the old state and made a new one). Keyed by the id, the kept component would stay bound to the
   * destroyed state, and the new one would get none. With its own key, the reconcile unmounts the old component and
   * mounts one for the new state, as when a frame passes between the removal and the re-add. Other states are keyed
   * by their id, and a state keeps its key for as long as it lives.
   */
  private keyReplacements(): void {
    const store = this.context.graph.rootStore.connectionsList;
    // A replacement has no component yet: a reconcile in which every state has one has nothing to look for.
    if (this.connections.every((connection) => connection.getViewComponent() !== undefined)) return;
    for (const child of this.getChildComponents()) {
      if (!(child instanceof BaseConnection)) continue;
      // A mounted component whose id the store registers under a state without a component: it is bound to another
      // state of that id, which the registered one replaced.
      const registered = store.getConnectionState(child.props.id);
      if (!registered || registered.getViewComponent() !== undefined || this.replacementKeys.has(registered)) continue;
      this.replacementKeys.set(registered, `${KEY_ESCAPE}r${++this.replacementCount}`);
    }
  }

  protected render(): void {
    const viewport = this.getCullingViewport();
    this.batch.render(this.context.ctx, viewport);
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
