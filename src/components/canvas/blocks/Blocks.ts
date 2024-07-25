import { Block } from "./Block";
import { BlockState } from "../../../store/block/Block";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";
import { BlocksNode } from "./BlocksTree";
import { Component } from "../../../../lib/lib/Component";

export class Blocks extends Component {
  protected blocks: BlockState[] = [];
  protected blocksView = {};

  public declare context: TGraphLayerContext;

  protected readonly unsubscribe: (() => void)[];

  private font: string;

  public constructor(props: {}, context: any) {
    super(props, context);

    this.unsubscribe = this.subscribe();

    this.prepareFont(this.getFontScale());

    // @ts-ignore
    this.__comp.treeNode = new BlocksNode(this);
  }

  protected getTreeNode(): BlocksNode {
    //@ts-ignore
    return this.__comp.treeNode
  }


  protected getFontScale() {
    return this.context.graph.rootStore.settings.getConfigFlag("scaleFontSize");
  }

  protected rerender() {
    this.performRender();
    this.shouldUpdateChildren = true;
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

  protected onViewOrderChange = (block: Block) => {
    this.getTreeNode().updateBlockOrder(block);
  }

  protected onRenderIndex = (block: Block) => {
    return this.getTreeNode().getRenderOrder(block);
  }

  protected updateChildren() {
    return this.blocks.map((block, index) => {
      return (this.blocksView[block.$state.value.is] || Block).create(
        {
          id: block.id,
          initialIndex: index,
          font: this.font,
          onZindexChange: this.onViewOrderChange,
          getRenderIndex: this.onRenderIndex,
        },
        {
          key: block.id,
        }
      );
    });
  }
}
