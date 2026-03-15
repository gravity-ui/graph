import { CoreComponentProps } from "lib/CoreComponent";

import { Component, TComponentState } from "../../../lib/Component";
import { ESchedulerPriority } from "../../../lib/Scheduler";
import { Tree } from "../../../lib/Tree";
import { ConnectionState } from "../../../store/connection/ConnectionState";
import { ICullingAwareParent } from "../../../services/SpatialCullingService";
import { debounce } from "../../../utils/utils/schedule";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BatchPath2DRenderer } from "./BatchPath2D";
import { BlockConnection, TConnectionProps } from "./BlockConnection";

export type TGraphConnectionsContext = TGraphLayerContext & {
  batch: BatchPath2DRenderer;
};

export class BlockConnections extends Component<CoreComponentProps, TComponentState, TGraphConnectionsContext> implements ICullingAwareParent {
  public get connections(): ConnectionState[] {
    return this.context.graph.rootStore.connectionsList.$connections.value;
  }

  protected readonly unsubscribe: (() => void)[];

  protected batch: BatchPath2DRenderer;

  /** Tree nodes of connections visible this frame, populated by SpatialCullingService. */
  private visibleChildNodes = new Set<Tree>();

  /** Map from connection component instance to its Tree node. */
  private componentToNode = new Map<object, Tree>();

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
    });

    this.getTreeNode().iterationFilter = this.filterChildren.bind(this);
  }

  /** Called by GraphComponent.markVisibleThisFrame() when a connection is visible this frame. */
  public registerVisibleChild(child: object): void {
    const node = this.componentToNode.get(child);
    if (node !== undefined) {
      this.visibleChildNodes.add(node);
    }
  }

  private filterChildren(allChildren: Tree[]): Tree[] | null {
    // Include newly created connections that have no hitBox yet.
    for (const child of allChildren) {
      const comp = child.data;
      if (comp instanceof Component && comp.isFirstIterate()) {
        this.visibleChildNodes.add(child);
      }
    }

    if (this.visibleChildNodes.size === 0) {
      return null;
    }

    const result = Array.from(this.visibleChildNodes);
    this.visibleChildNodes.clear();
    return result;
  }

  protected subscribe() {
    return [
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
        showConnectionLabels: settings.showConnectionLabels,
        showConnectionArrows: settings.showConnectionArrows,
      };
      return ConnectionCtop.create(props, { key: String(connection.id) });
    });
  }

  protected didUpdateChildren(): void {
    this.componentToNode.clear();
    const children = this.__comp.children;
    const keys = this.__comp.childrenKeys;
    for (let i = 0; i < keys.length; i++) {
      const child = children[keys[i]];
      if (child !== undefined) {
        this.componentToNode.set(child, child.getTreeNode());
      }
    }
  }

  protected render(): void {
    const paths = this.batch.orderedPaths.get();
    for (const path of paths) {
      path.render(this.context.ctx);
    }
  }
}
