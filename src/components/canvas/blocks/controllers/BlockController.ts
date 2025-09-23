import { ESelectionStrategy } from "../../../../services/selection/types";
import { selectBlockById } from "../../../../store/block/selectors";
import { ECanChangeBlockGeometry } from "../../../../store/settings";
import {
  createCustomDragEvent,
  dispatchEvents,
  isAllowChangeBlockGeometry,
  isMetaKeyEvent,
} from "../../../../utils/functions";
import { dragListener } from "../../../../utils/functions/dragListener";
import { EVENTS } from "../../../../utils/types/events";
import { Block } from "../Block";

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

    block.addEventListener("mousedown", (event: MouseEvent) => {
      const blockState = selectBlockById(block.context.graph, block.props.id);
      const allowChangeBlockGeometry = isAllowChangeBlockGeometry(
        block.getConfigFlag("canChangeBlockGeometry") as ECanChangeBlockGeometry,
        blockState.$selected.value
      );

      if (!allowChangeBlockGeometry) return;

      event.stopPropagation();

      const selectedBlocksComponents = block.context.graph.rootStore.blocksList.$selectedBlocks.value.map((block) =>
        block.getViewComponent()
      );

      if (!selectedBlocksComponents.includes(block)) {
        return;
      }

      dragListener(block.context.ownerDocument)
        .on(EVENTS.DRAG_START, (_event: MouseEvent) => {
          block.context.graph.getGraphLayer().captureEvents(block);
          dispatchEvents(selectedBlocksComponents, createCustomDragEvent(EVENTS.DRAG_START, _event));
        })
        .on(EVENTS.DRAG_UPDATE, (_event: MouseEvent) => {
          dispatchEvents(selectedBlocksComponents, createCustomDragEvent(EVENTS.DRAG_UPDATE, _event));
        })
        .on(EVENTS.DRAG_END, (_event: MouseEvent) => {
          block.context.graph.getGraphLayer().releaseCapture();
          dispatchEvents(selectedBlocksComponents, createCustomDragEvent(EVENTS.DRAG_END, _event));
        });
    });
  }
}
