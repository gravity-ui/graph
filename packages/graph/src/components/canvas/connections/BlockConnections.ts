import { ReadonlySignal, computed, signal } from "@preact/signals-core";

import { Component, TComponentState } from "../../../lib/Component";
import { CoreComponentProps } from "../../../lib/CoreComponent";
import { ESchedulerPriority } from "../../../lib/Scheduler";
import { ConnectionState } from "../../../store/connection/ConnectionState";
import { getFontSize } from "../../../utils/functions/text";
import { debounce } from "../../../utils/utils/schedule";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BatchPath2DRenderer } from "./BatchPath2D";
import { BlockConnection, TConnectionProps } from "./BlockConnection";

export type TGraphConnectionsContext = TGraphLayerContext & {
  batch: BatchPath2DRenderer;
  connectionLabelFontSize: ReadonlySignal<number>;
};

export class BlockConnections extends Component<CoreComponentProps, TComponentState, TGraphConnectionsContext> {
  public get connections(): ConnectionState[] {
    return this.context.graph.rootStore.connectionsList.$connections.value;
  }

  protected readonly unsubscribe: (() => void)[];

  protected batch: BatchPath2DRenderer;

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
    this.batch = new BatchPath2DRenderer(
      () => this.performRender(),
      this.context.constants.connection.PATH2D_CHUNK_SIZE || 100
    );
    this.unsubscribe = this.subscribe();
    this.setContext({
      batch: this.batch,
      connectionLabelFontSize: this.connectionLabelFontSize,
    });
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
    // Same world-space rect as the layer tree's viewport: the full camera viewport, insets ignored.
    const { relativeX, relativeY, relativeWidth, relativeHeight } = this.context.camera.getCameraState();
    this.batch.render(this.context.ctx, {
      minX: -relativeX,
      minY: -relativeY,
      maxX: -relativeX + relativeWidth,
      maxY: -relativeY + relativeHeight,
    });
  }
}
