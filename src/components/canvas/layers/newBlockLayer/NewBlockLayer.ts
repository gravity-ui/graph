import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../../../graphEvents";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { ESelectionStrategy } from "../../../../services/selection/types";
import { BlockState } from "../../../../store/block/Block";
import { getXY, isAltKeyEvent, isBlock } from "../../../../utils/functions";
import { dragListener } from "../../../../utils/functions/dragListener";
import { render } from "../../../../utils/renderers/render";
import { EVENTS } from "../../../../utils/types/events";
import { TPoint } from "../../../../utils/types/shapes";
import { Block } from "../../../canvas/blocks/Block";

/**
 * Events emitted by the NewBlockLayer
 */
declare module "../../../../graphEvents" {
  interface GraphEventsDefinitions {
    /**
     * Fired when block duplication starts
     */
    "block-add-start-from-shadow": (event: CustomEvent<{ blocks: Block[] }>) => void;

    /**
     * Fired when block duplication completes
     */
    "block-added-from-shadow": (
      event: CustomEvent<{
        items: Array<{ block: Block; coord: TPoint }>;
        delta: TPoint;
      }>
    ) => void;
  }
}

export interface NewBlockLayerProps extends LayerProps {
  /**
   * Background color for displaying the block shadow
   * By default, the block border color from the theme is used
   */
  ghostBackground?: string;

  /**
   * Function to check if block duplication is allowed
   * @param block The block being duplicated
   * @returns true if duplication is allowed, false if not allowed
   */
  isDuplicateAllowed?: (block: Block) => boolean;
}

export class NewBlockLayer extends Layer<
  NewBlockLayerProps,
  LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  private copyBlocks: BlockState[] = [];
  private initialPoint: TPoint;
  private blockStates: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  private enabled = true;
  private declare eventAborter: AbortController;

  constructor(props: NewBlockLayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        ...props.canvas,
      },
      ...props,
    });

    this.setContext({
      canvas: this.getCanvas(),
      graphCanvas: props.graph.getGraphCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      camera: props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
    });
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    super.afterInit();
    // Register event listeners with the graphOn wrapper method for automatic cleanup when unmounted
    this.onGraphEvent("mousedown", this.handleMouseDown, {
      capture: true,
    });
  }

  protected handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const event = extractNativeGraphMouseEvent(nativeEvent);
    const target = nativeEvent.detail.target;
    if (event && isAltKeyEvent(event) && isBlock(target) && this.enabled) {
      // Check if duplication is allowed for this block
      if (this.props.isDuplicateAllowed && !this.props.isDuplicateAllowed(target)) {
        return; // Exit if duplication is not allowed
      }

      if (!this.root?.ownerDocument) {
        return;
      }

      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      dragListener(this.root.ownerDocument)
        .on(EVENTS.DRAG_START, (event: MouseEvent) => this.onStartNewBlock(event, target))
        .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => this.onMoveNewBlock(event))
        .on(EVENTS.DRAG_END, (event: MouseEvent) =>
          this.onEndNewBlock(event, this.context.graph.getPointInCameraSpace(event))
        );
    }
  };

  protected render() {
    this.resetTransform();

    if (!this.blockStates.length) {
      return;
    }

    render(this.context.ctx, (ctx) => {
      ctx.beginPath();
      ctx.fillStyle = this.props.ghostBackground || this.context.colors.block.border;

      // Draw each block ghost
      for (const blockState of this.blockStates) {
        ctx.fillRect(blockState.x, blockState.y, blockState.width, blockState.height);
      }

      ctx.closePath();
    });
  }

  private onStartNewBlock(event: MouseEvent, block: Block) {
    // Check if the clicked block is selected
    const isBlockSelected = block.connectedState.selected;

    // Get the blocks to duplicate
    let blockStates: BlockState[];

    if (isBlockSelected) {
      // If the clicked block is selected, get all selected blocks
      const selectedBlockStates = this.context.graph.rootStore.blocksList.$selectedBlocks.value;

      // If we have a validation function, filter out blocks that can't be duplicated
      if (this.props.isDuplicateAllowed) {
        blockStates = selectedBlockStates.filter((blockState) =>
          this.props.isDuplicateAllowed(blockState.getViewComponent())
        );

        // If no blocks can be duplicated, exit
        if (blockStates.length === 0) return;
      } else {
        blockStates = selectedBlockStates;
      }
    } else {
      // If the clicked block is not selected, use only the clicked block
      blockStates = [block.connectedState];
    }

    // Map BlockState to Block for the event
    const blocks = isBlockSelected ? blockStates.map((blockState) => blockState.getViewComponent()) : [block];

    // Use the already filtered blockStates
    this.copyBlocks = blockStates;

    // Store the initial point for calculating the offset later
    this.initialPoint = this.context.graph.getPointInCameraSpace(event);

    this.context.graph.executеDefaultEventAction("block-add-start-from-shadow", { blocks }, () => {
      const scale = this.context.camera.getCameraScale();
      const xy = getXY(this.context.graphCanvas, event);
      const mouseX = xy[0];
      const mouseY = xy[1];

      // Calculate the screen position of the clicked block
      const cameraRect = this.context.camera.getCameraRect();
      const clickedBlockX = block.connectedState.x * scale + cameraRect.x;
      const clickedBlockY = block.connectedState.y * scale + cameraRect.y;

      // Calculate the click position relative to the block's top-left corner
      const clickOffsetX = mouseX - clickedBlockX;
      const clickOffsetY = mouseY - clickedBlockY;

      // Create ghost blocks for each block being duplicated
      this.blockStates = this.copyBlocks.map((blockState) => {
        // Calculate screen position for each block
        const blockScreenX = blockState.x * scale + cameraRect.x;
        const blockScreenY = blockState.y * scale + cameraRect.y;

        // Use block's own width and height values
        const blockWidth = blockState.width * scale;
        const blockHeight = blockState.height * scale;

        return {
          width: blockWidth,
          height: blockHeight,
          // Position the ghost block so that the click offset is maintained
          x: mouseX - clickOffsetX + (blockScreenX - clickedBlockX),
          y: mouseY - clickOffsetY + (blockScreenY - clickedBlockY),
        };
      });

      this.performRender();
    });
  }

  private lastMouseX: number;
  private lastMouseY: number;

  private onMoveNewBlock(event: MouseEvent) {
    if (!this.copyBlocks.length) {
      return;
    }

    const xy = getXY(this.context.graphCanvas, event);
    const mouseX = xy[0];
    const mouseY = xy[1];

    // If this is the first move event, initialize the last mouse position
    if (this.lastMouseX === undefined) {
      this.lastMouseX = mouseX;
      this.lastMouseY = mouseY;
      return;
    }

    // Calculate the movement delta
    const deltaX = mouseX - this.lastMouseX;
    const deltaY = mouseY - this.lastMouseY;

    // Update positions of all ghost blocks by applying the delta
    this.blockStates = this.blockStates.map((blockState) => {
      return {
        ...blockState,
        x: blockState.x + deltaX,
        y: blockState.y + deltaY,
      };
    });

    // Update the last mouse position
    this.lastMouseX = mouseX;
    this.lastMouseY = mouseY;

    this.performRender();
  }

  private onEndNewBlock(event: MouseEvent, point: TPoint) {
    if (!this.copyBlocks.length) {
      return;
    }

    // Clear the block states and reset mouse tracking
    this.blockStates = [];
    this.lastMouseX = undefined;
    this.lastMouseY = undefined;
    this.performRender();

    // Calculate the offset from the initial point to the final point
    const offsetX = point.x - this.initialPoint.x;
    const offsetY = point.y - this.initialPoint.y;

    // Collect all blocks and their new coordinates as items
    const items = this.copyBlocks.map((blockState) => {
      // Calculate the new position for each block based on its original position plus the offset
      const newCoord = {
        x: blockState.x + offsetX,
        y: blockState.y + offsetY,
      };

      return {
        block: blockState.getViewComponent(),
        coord: newCoord,
      };
    });

    // Calculate the delta between start and end positions
    const delta = {
      x: offsetX,
      y: offsetY,
    };

    // Emit a single event with all items and the position delta
    this.context.graph.executеDefaultEventAction(
      "block-added-from-shadow",
      {
        items,
        delta,
      },
      () => {
        // Clear selection of old blocks before adding new ones
        this.context.graph.api.unsetSelection();

        // Map to store original block ID to new block ID mapping
        const blockIdMap = new Map<string, string>();

        // First pass: create all blocks and build the ID mapping
        items.forEach((item) => {
          const block = item.block.connectedState.asTBlock();
          const blockPoint = item.coord;
          const newBlockId = `${block.id.toString()}-added-from-shadow-${Date.now()}`;

          // Store the mapping between original and new block IDs
          blockIdMap.set(block.id.toString(), newBlockId);

          this.context.graph.api.addBlock(
            {
              ...block,
              id: newBlockId,
              is: "block",
              x: blockPoint.x,
              y: blockPoint.y,
            },
            {
              selected: true,
              strategy: ESelectionStrategy.APPEND, // Use APPEND strategy to keep all blocks selected
            }
          );
        });

        // Second pass: duplicate connections between duplicated blocks
        if (blockIdMap.size > 1) {
          // Only process connections if we have at least 2 blocks
          // Get all connections from the graph
          const connections = this.context.graph.rootStore.connectionsList.$connections.value;

          // Check each connection to see if it connects blocks that were duplicated
          connections.forEach((connection) => {
            const sourceId = connection.sourceBlockId;
            const targetId = connection.targetBlockId;

            // If both source and target blocks were duplicated, create a new connection
            if (blockIdMap.has(sourceId.toString()) && blockIdMap.has(targetId.toString())) {
              const newSourceId = blockIdMap.get(sourceId.toString());
              const newTargetId = blockIdMap.get(targetId.toString());

              // Create a new connection between the duplicated blocks
              this.context.graph.api.addConnection({
                sourceBlockId: newSourceId,
                targetBlockId: newTargetId,
                sourceAnchorId: connection.sourceAnchorId,
                targetAnchorId: connection.targetAnchorId,
                // Copy any other connection properties
                styles: connection.$state.value.styles,
                dashed: connection.$state.value.dashed,
                label: connection.$state.value.label,
              });
            }
          });
        }
      }
    );

    this.copyBlocks = [];
    this.initialPoint = null;
  }

  public enable(): void {
    this.enabled = true;
  }

  public disable(): void {
    this.enabled = false;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}
