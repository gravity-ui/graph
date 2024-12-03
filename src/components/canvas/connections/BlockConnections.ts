import { CoreComponentProps } from "lib/CoreComponent";

import { Component, TComponentState } from "../../../lib/Component";
import { ConnectionState } from "../../../store/connection/ConnectionState";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BatchPath2DRenderer } from "./BatchPath2D";
import { BlockConnection, TConnectionProps } from "./BlockConnection";

export type TGraphConnectionsContext = TGraphLayerContext & {
  batch: BatchPath2DRenderer;
}

export class BlockConnections extends Component<CoreComponentProps, TComponentState, TGraphConnectionsContext> {

  public get connections(): ConnectionState[] {
    return this.context.graph.rootStore.connectionsList.$connections.value;
  };

  protected readonly unsubscribe: (() => void)[];

  protected batch = new BatchPath2DRenderer(() => this.performRender());

  constructor(props: {}, parent: Component) {
    super(props, parent);
    this.unsubscribe = this.subscribe();
    this.setContext({
      batch: this.batch
    })
  }

  private scheduleUpdate() {
    this.performRender();
    this.shouldUpdateChildren = true;
  }

  protected subscribe() {

    const r1 = this.context.graph.rootStore.settings.$connectionsSettings.subscribe(() => {
      this.scheduleUpdate();
    });

    const r2 = this.context.graph.rootStore.connectionsList.$connections.subscribe(() => {
      this.scheduleUpdate();
    });

    return [r1, r2];
  }

  protected unmount() {
    super.unmount();

    this.unsubscribe.forEach((reactionDisposer) => reactionDisposer());
  }

  protected updateChildren(): void | object[] {
    if (!this.connections) return [];
    const settings = this.context.graph.rootStore.settings.$connectionsSettings.value;
    return this.connections.map((connection) => {
      const props: TConnectionProps = {
        id: connection.id,
        useBezier: settings.useBezierConnections,
        bezierDirection: settings.bezierConnectionDirection,
        showConnectionLabels: settings.showConnectionLabels,
        showConnectionArrows: settings.showConnectionArrows,
      };
      return BlockConnection.create(props, { key: String(connection.id) });
    });
  }

  protected render(): void {
    const paths = this.batch.orderedPaths.get();
    for(const path of paths) {
      path.render(this.context.ctx);
    }
  }
}
