import { BlockState } from "../../../../store/block/Block";
import { BlockListStore } from "../../../../store/block/BlocksList";
import { selectBlockById } from "../../../../store/block/selectors";
import { ECanChangeBlockGeometry } from "../../../../store/settings";
import {
  addEventListeners,
  createCustomDragEvent,
  dispatchEvents,
  isAllowChangeBlockGeometry,
  isMetaKeyEvent,
} from "../../../../utils/functions";
import { dragListener } from "../../../../utils/functions/dragListener";
import { EVENTS } from "../../../../utils/types/events";
import { ESelectionStrategy } from "../../../../utils/types/types";
import { Block } from "../Block";

export class BlockController {
  constructor(block: Block) {
    addEventListeners(block as EventTarget, {
      click(event: MouseEvent) {
        event.stopPropagation();

        const { connectionsList } = block.context.graph.rootStore;
        const isAnyConnectionSelected = connectionsList.$selectedConnections.value.size !== 0;

        if (!isMetaKeyEvent(event) && isAnyConnectionSelected) {
          connectionsList.resetSelection();
        }

        block.context.graph.api.selectBlocks(
          [block.props.id],
          /**
           * On click with meta key we want to select only one block, otherwise we want to toggle selection
           */
          !isMetaKeyEvent(event) ? true : !block.state.selected,
          /**
           * On click with meta key we want to append selection, otherwise we want to replace selection
           */
          !isMetaKeyEvent(event) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
        );
      },

      mousedown(event: MouseEvent) {
        const blockState = selectBlockById(block.context.graph, block.props.id);
        const allowChangeBlockGeometry = isAllowChangeBlockGeometry(
          block.getConfigFlag("canChangeBlockGeometry") as ECanChangeBlockGeometry,
          blockState.selected
        );

        if (!allowChangeBlockGeometry) return;

        event.stopPropagation();

        const blocksListState = this.context.graph.rootStore.blocksList;
        const selectedBlocksStates = getSelectedBlocks(blockState, blocksListState);
        const selectedBlocksComponents = selectedBlocksStates.map((block) => block.getViewComponent());

        dragListener(block.context.ownerDocument)
          .on(EVENTS.DRAG_START, (_event: MouseEvent) => {
            block.context.graph.getGraphLayer().captureEvents(this);
            dispatchEvents(selectedBlocksComponents, createCustomDragEvent(EVENTS.DRAG_START, _event));
          })
          .on(EVENTS.DRAG_UPDATE, (_event: MouseEvent) => {
            dispatchEvents(selectedBlocksComponents, createCustomDragEvent(EVENTS.DRAG_UPDATE, _event));
          })
          .on(EVENTS.DRAG_END, (_event: MouseEvent) => {
            block.context.graph.getGraphLayer().releaseCapturing();
            dispatchEvents(selectedBlocksComponents, createCustomDragEvent(EVENTS.DRAG_END, _event));
          });
      },
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
