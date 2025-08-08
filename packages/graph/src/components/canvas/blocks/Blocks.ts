import { Component } from "../../../lib/Component";
import { BlockState } from "../../../store/block/Block";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { Block } from "./Block";

export class Blocks extends Component {
  protected blocks: BlockState[] = [];
  protected blocksView = {};

  declare public context: TGraphLayerContext;

  protected readonly unsubscribe: (() => void)[];

  private font: string;

  constructor(props: {}, context: any) {
    super(props, context);

    this.unsubscribe = this.subscribe();

    this.prepareFont(this.getFontScale());
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
}
