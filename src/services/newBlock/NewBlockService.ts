import { BlockState } from "store/block/Block";
import { Emitter } from "../../utils/Emitter";
import { EVENTS } from "../../utils/types/events";
import { Block, TBlock } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";
import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../graphEvents";
import { TPoint } from "../../utils/types/shapes";
import { isAltKeyEvent, isBlock } from "../../utils/functions";
import { dragListener } from "../../utils/functions/dragListener";

declare module "../../graphEvents" {
  interface GraphEventsDefinitions {
    "block-add-start-from-shadow": (event: CustomEvent<{ sourceBlockId: TBlock }>) => void;
    "block-added-from-shadow": (event: CustomEvent<{ sourceBlockId: TBlock; coord: TPoint }>) => void;
  }
}

export class NewBlocksService extends Emitter {
  private copyBlock: BlockState;

  constructor(protected graph: Graph) {
    super();
    this.graph.on("mousedown", this.handleMouseDown, { capture: true });
  }

  protected getOwnerDocument() {
    return this.graph.getGraphHTML().ownerDocument;
  }

  protected handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const event = extractNativeGraphMouseEvent(nativeEvent);
    const target = nativeEvent.detail.target;
    if (
      event &&
      isAltKeyEvent(event) &&
      isBlock(target) &&
      this.graph.rootStore.settings.getConfigFlag("canDuplicateBlocks")
    ) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      dragListener(this.getOwnerDocument())
        .on(EVENTS.DRAG_START, (event: MouseEvent) => this.onStartNewBlock(event, target))
        .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => this.onMoveNewBlock(event))
        .on(EVENTS.DRAG_END, (event: MouseEvent) => this.onEndNewBlock(event, this.graph.getPointInCameraSpace(event)));
    }
  };

  public onStartNewBlock(event: MouseEvent, block: Block) {
    this.graph.executеDefaultEventAction(
      "block-add-start-from-shadow",
      { sourceBlockId: block.connectedState.asTBlock() },
      () => {
        this.copyBlock = block.connectedState;

        this.emit(EVENTS.NEW_BLOCK_START, event);
      }
    );
  }

  public onMoveNewBlock(event: MouseEvent) {
    if (!this.copyBlock) {
      return;
    }
    this.emit(EVENTS.NEW_BLOCK_UPDATE, event);
  }

  public onEndNewBlock(event: MouseEvent, point: TPoint) {
    if (!this.copyBlock) {
      return;
    }
    this.emit(EVENTS.NEW_BLOCK_END, event);
    this.graph.emit("block-added-from-shadow", {
      sourceBlockId: this.copyBlock.asTBlock(),
      coord: point,
    });
  }
}
