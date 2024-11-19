import { Component } from "../../../lib/Component";
import { ConnectionState } from "../../../store/connection/ConnectionState";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BlockConnection, TConnectionProps } from "./BlockConnection";
import withBatchedConnections from "./batchMixins/withBatchedConnections";

export class BlockConnections extends withBatchedConnections(Component) {
  public declare context: TGraphLayerContext;

  public connections: ConnectionState[] = [];

  protected readonly unsubscribe: (() => void)[];

  public addInRenderOrder = this.addInRenderOrder.bind(this);

  public removeFromRenderOrder = this.removeFromRenderOrder.bind(this);

  protected connectionsView = {};

  constructor(props: {}, parent: GraphLayer) {
    super(props, parent);
    this.unsubscribe = this.subscribe();
  }

  private scheduleUpdate() {
    this.performRender();
    this.shouldUpdateChildren = true;
  }

  protected subscribe() {
    this.connections = this.context.graph.rootStore.connectionsList.$connections.value;
    this.connectionsView = this.context.graph.rootStore.settings.getConfigFlag("connectionComponents");

    const r1 = this.context.graph.rootStore.settings.$connectionsSettings.subscribe(() => {
      this.scheduleUpdate();
    });

    const r2 = this.context.graph.rootStore.connectionsList.$connections.subscribe((connections) => {
      this.connections = connections;
      this.scheduleUpdate();
    });

    const r3 = this.context.graph.rootStore.settings.$connectionComponents.subscribe((connectionsView) => {
      this.connectionsView = connectionsView;
      this.scheduleUpdate();
    });

    return [r1, r2, r3];
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
        addInRenderOrder: this.addInRenderOrder,
        removeFromRenderOrder: this.removeFromRenderOrder,
        useBezier: settings.useBezierConnections,
        bezierDirection: settings.bezierConnectionDirection,
        showConnectionLabels: settings.showConnectionLabels,
        showConnectionArrows: settings.showConnectionArrows,
      };
      return (this.connectionsView[connection.$state.value.is] || BlockConnection).create(props, { key: String(connection.id) });
    });
  }
}
