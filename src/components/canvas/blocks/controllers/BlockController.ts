import { ESelectionStrategy } from "../../../../services/selection/types";
import { isMetaKeyEvent } from "../../../../utils/functions";
import { Block } from "../Block";

/**
 * BlockController handles click events for block selection.
 * Drag behavior is now managed by DragService.
 */
export class BlockController {
  constructor(block: Block) {
    block.addEventListener("click", (event: MouseEvent) => {
      /**
       * Prevent propagate to camera
       * Click on camera will reset selection
       */
      event.stopPropagation();

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
    });
  }
}
