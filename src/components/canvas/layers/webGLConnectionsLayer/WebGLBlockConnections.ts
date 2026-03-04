import { Component, TComponentState } from "../../../../lib/Component";
import { ESchedulerPriority } from "../../../../lib/Scheduler";
import { debounce } from "../../../../utils/utils/schedule";
import { TGraphLayerContext } from "../graphLayer/GraphLayer";
import { WebGLConnection } from "./WebGLConnection";

type ILayerWithAssign = {
  assignSlots(): void;
};

export class WebGLBlockConnections extends Component<Record<string, unknown>, TComponentState, TGraphLayerContext> {
  protected readonly unsubscribe: (() => void)[];

  private scheduleUpdate = debounce(
    () => {
      this.performRender();
      this.shouldUpdateChildren = true;
    },
    { priority: ESchedulerPriority.HIGHEST, frameInterval: 1 }
  );

  constructor(props: Record<string, unknown>, parent: Component) {
    super(props, parent);
    this.unsubscribe = [
      this.context.graph.rootStore.settings.$connectionsSettings.subscribe(() => this.scheduleUpdate()),
      this.context.graph.rootStore.connectionsList.$connections.subscribe(() => this.scheduleUpdate()),
    ];
  }

  protected override unmount(): void {
    super.unmount();
    this.scheduleUpdate.cancel();
    this.unsubscribe.forEach((fn) => fn());
  }

  protected override didUpdateChildren(): void {
    super.didUpdateChildren();
    (this.context.layer as unknown as ILayerWithAssign).assignSlots();
  }

  protected override updateChildren() {
    const connections = this.context.graph.rootStore.connectionsList.$connections.value;
    if (!connections) return [];
    return connections.map((connection) =>
      WebGLConnection.create({ id: connection.id }, { key: String(connection.id) })
    );
  }

  protected override render(): void {
    // No-op: rendering handled by WebGLConnectionsLayer
  }
}
