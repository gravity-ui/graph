import { Component } from "../../../lib/Component";
import { CoreComponent } from "../../../lib/CoreComponent";
import { Tree } from "../../../lib/Tree";
import { ICullingAwareParent } from "../../../services/SpatialCullingService";
import { BlockState } from "../../../store/block/Block";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { Block } from "./Block";

export class Blocks extends Component implements ICullingAwareParent {
  protected blocks: BlockState[] = [];
  protected blocksView = {};

  public declare context: TGraphLayerContext;

  protected readonly unsubscribe: (() => void)[];

  private font: string;

  /** Tree nodes registered as visible for the current frame by SpatialCullingService. */
  private visibleChildNodes = new Set<Tree>();

  /** Map from block component instance to its Tree node; rebuilt on each updateChildren. */
  private componentToNode = new Map<object, Tree>();

  constructor(props: {}, context: CoreComponent) {
    super(props, context);

    this.unsubscribe = this.subscribe();
    this.prepareFont(this.getFontScale());

    // Install iteration filter on this component's Tree node so that
    // Tree._walkDown only visits children registered by SpatialCullingService.
    this.getTreeNode().iterationFilter = this.filterChildren.bind(this);
  }

  /**
   * Called by SpatialCullingService (via GraphComponent.markVisibleThisFrame) when a child
   * block becomes visible this frame. Stores the corresponding Tree node for use in filterChildren.
   */
  public registerVisibleChild(child: object): void {
    const node = this.componentToNode.get(child);
    if (node !== undefined) {
      this.visibleChildNodes.add(node);
    }
  }

  /**
   * Iteration filter installed on this component's Tree node.
   * Returns only the Tree nodes that were registered as visible this frame.
   * Falls back to all children when culling has not run yet (e.g. first frame).
   */
  private filterChildren(allChildren: Tree[]): Tree[] | null {
    // Also include any children on their very first iteration — they have no hitBox
    // in RBush yet, so SpatialCullingService cannot find them.
    for (const child of allChildren) {
      const comp = child.data;
      if (comp instanceof Component && comp.isFirstIterate()) {
        this.visibleChildNodes.add(child);
      }
    }

    console.log("Test", "filterChildren", this.visibleChildNodes.size);
    if (this.visibleChildNodes.size === 0) {
      // Culling service has not run or produced no results — fall back to all children.
      return null;
    }

    const result = Array.from(this.visibleChildNodes);
    console.log("Test", "filterChildren", result.length);
    this.visibleChildNodes.clear();
    return result;
  }

  protected getFontScale() {
    return this.context.graph.rootStore.settings.getConfigFlag("scaleFontSize");
  }

  protected rerender() {
    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;
    this.performRender();
  }

  protected subscribe() {
    this.blocks = this.context.graph.rootStore.blocksList.$blocks.value;
    this.blocksView = this.context.graph.rootStore.settings.getConfigFlag("blockComponents");
    return [
      this.context.graph.rootStore.blocksList.$blocks.subscribe((blocks) => {
        this.blocks = blocks;
        this.rerender();
      }),
      this.context.graph.rootStore.settings.$blockComponents.subscribe((blockComponents) => {
        this.blocksView = blockComponents;
        this.rerender();
      }),
    ];
  }

  private prepareFont(scaleFontSize) {
    this.font = `bold ${Math.round(this.context.constants.text.BASE_FONT_SIZE * scaleFontSize)}px sans-serif`;
  }

  protected unmount() {
    super.unmount();
    this.unsubscribe.forEach((cb) => cb());
  }

  protected updateChildren() {
    return this.blocks.map((block, index) => {
      return (this.blocksView[block.$state.value.is] || Block).create(
        {
          id: block.id,
          initialIndex: index,
          font: this.font,
        },
        {
          key: block.id,
        }
      );
    });
  }

  protected didUpdateChildren(): void {
    // Rebuild the map from component instance to Tree node after children change.
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
}
