import { Component } from "../../../lib/Component";
import { CoreComponent } from "../../../lib/CoreComponent";
import { ESchedulerPriority } from "../../../lib/Scheduler";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { BlockState } from "../../../store/block/Block";
import { debounce } from "../../../utils/utils/schedule";
import { BatchPath2DRenderer } from "../connections/BatchPath2D";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { Block } from "./Block";

export type TBlocksContext = TGraphLayerContext & {
  blockBatch: BatchPath2DRenderer;
};

export class Blocks extends Component {
  protected blocks: BlockState[] = [];
  protected blocksView = {};

  public declare context: TGraphLayerContext;

  protected readonly unsubscribe: (() => void)[];

  private font: string;

  protected batch: BatchPath2DRenderer;

  /**
   * Debounced update to batch multiple changes into a single render cycle.
   */
  private scheduleUpdate = debounce(
    () => {
      this.performRender();
    },
    {
      priority: ESchedulerPriority.HIGHEST,
      frameInterval: 1,
    }
  );

  constructor(props: {}, context: CoreComponent) {
    super(props, context);

    this.batch = new BatchPath2DRenderer(
      () => this.performRender(),
      this.context.constants.block.PATH2D_CHUNK_SIZE || 100
    );

    this.setContext({
      blockBatch: this.batch,
    });

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

  protected willRender(): void {
    super.willRender();
    const scaleLevel = this.context.graph.cameraService.getCameraBlockScaleLevel();
    if (scaleLevel === ECameraScaleLevel.Minimalistic) {
      this.shouldRenderChildren = false;
      this.shouldUpdateChildren = false;
    }
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
    this.scheduleUpdate.cancel();
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

  protected render(): void {
    const scaleLevel = this.context.graph.cameraService.getCameraBlockScaleLevel();

    // Batch rendering only for minimalistic scale level
    if (scaleLevel === ECameraScaleLevel.Minimalistic) {
      const paths = this.batch.orderedPaths.get();
      for (const path of paths) {
        path.render(this.context.ctx);
      }
    }
    // For other scale levels, blocks render themselves through their render methods
  }
}
