import { createGridSnapModifier } from "../../../services/Drag/modifiers/GridSnapModifier";
import { BlockState } from "../../../store/block/Block";
import { BlockListStore } from "../../../store/block/BlocksList";
import { isMetaKeyEvent } from "../../../utils/functions";
import { ESelectionStrategy } from "../../../utils/types/types";
import { GraphComponent } from "../GraphComponent";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { Block } from "./Block";

export class Blocks extends GraphComponent {
  protected blocks: BlockState[] = [];
  protected blocksView = {};

  public declare context: TGraphLayerContext;

  private font: string;

  constructor(props: {}, context: any) {
    super(props, context);

    this.subscribe();

    this.prepareFont(this.getFontScale());
  }

  protected handleEvent(_: Event): void {}

  protected willMount(): void {
    this.addEventListener("click", (event) => {
      const blockInstance = this.getTargetComponent(event);

      if (!(blockInstance instanceof Block)) {
        return;
      }
      event.stopPropagation();

      const { connectionsList } = this.context.graph.rootStore;
      const isAnyConnectionSelected = connectionsList.$selectedConnections.value.size !== 0;

      if (!isMetaKeyEvent(event as MouseEvent) && isAnyConnectionSelected) {
        connectionsList.resetSelection();
      }

      this.context.graph.api.selectBlocks(
        [blockInstance.props.id],
        /**
         * On click with meta key we want to select only one block, otherwise we want to toggle selection
         */
        !isMetaKeyEvent(event as MouseEvent) ? true : !blockInstance.state.selected,
        /**
         * On click with meta key we want to append selection, otherwise we want to replace selection
         */
        !isMetaKeyEvent(event as MouseEvent) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
      );
    });

    this.addEventListener("mousedown", (event) => {
      const blockInstance = this.getTargetComponent(event);

      if (!(blockInstance instanceof Block) || !blockInstance.isDraggable()) {
        return;
      }

      event.stopPropagation();

      const blockState = blockInstance.connectedState;

      const selectedBlocksStates = getSelectedBlocks(blockState, this.context.graph.rootStore.blocksList);
      const selectedBlocksComponents: Block[] = selectedBlocksStates.map((block) => block.getViewComponent());

      this.context.graph.getGraphLayer().captureEvents(blockInstance);

      // Получаем начальную позицию основного блока (который инициировал драг)
      const mainBlockState = blockInstance.connectedState;
      const initialEntityPosition = { x: mainBlockState.x, y: mainBlockState.y };

      this.context.graph.dragController.start(
        {
          onDragStart: (dragEvent, dragInfo) => {
            const blocks = dragInfo.context.selectedBlocks as Block[];
            for (const block of blocks) {
              block.onDragStart(dragEvent);
            }
          },
          onDragUpdate: (dragEvent, dragInfo) => {
            const blocks = dragInfo.context.selectedBlocks as Block[];
            for (const block of blocks) {
              block.onDragUpdate(dragEvent, dragInfo);
            }
          },
          onDragEnd: (dragEvent, dragInfo) => {
            this.context.graph.getGraphLayer().releaseCapture();
            const blocks = dragInfo.context.selectedBlocks as Block[];
            for (const block of blocks) {
              block.onDragEnd(dragEvent);
            }
          },
        },
        event as MouseEvent,
        {
          positionModifiers: [
            createGridSnapModifier({ gridSize: this.context.constants.block.SNAPPING_GRID_SIZE, stage: "drop" }),
          ],
          initialEntityPosition: initialEntityPosition,
          context: {
            enableGridSnap: true,
            selectedBlocks: selectedBlocksComponents,
          },
        }
      );
    });
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
    this.subscribeSignal(this.context.graph.rootStore.blocksList.$blocks, (blocks) => {
      this.blocks = blocks;
      this.rerender();
    });
    this.subscribeSignal(this.context.graph.rootStore.settings.$blockComponents, (blockComponents) => {
      this.blocksView = blockComponents;
      this.rerender();
    });
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

export function getSelectedBlocks(currentBlockState: BlockState, blocksState: BlockListStore) {
  let selected;
  if (currentBlockState.selected) {
    selected = blocksState.$selectedBlocks.value;
  } else {
    selected = [currentBlockState];
  }
  return selected;
}
