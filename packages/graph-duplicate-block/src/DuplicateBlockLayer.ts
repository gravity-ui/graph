import { CanvasBlock, ESelectionStrategy, Layer } from "@gravity-ui/graph";
import type { BlockState, LayerContext, LayerProps, TPoint, UnwrapGraphEvents } from "@gravity-ui/graph";

import { createDuplicateBlockId, createDuplicates } from "./createDuplicates";

export type TBlocksDuplicateStartDetail = {
  /** Blocks that will be duplicated. */
  blocks: CanvasBlock[];
};

export type TBlocksDuplicateDetail = {
  /** Source blocks and the coordinates of their duplicates. */
  items: Array<{ block: CanvasBlock; coord: TPoint }>;
  /** Offset between the source blocks and their duplicates. */
  delta: TPoint;
};

declare module "@gravity-ui/graph" {
  interface GraphEventsDefinitions {
    /**
     * Fired when block duplication starts. Preventing it hides the preview.
     */
    "blocks-duplicate-start": (event: CustomEvent<TBlocksDuplicateStartDetail>) => void;

    /**
     * Fired when block duplication completes. Preventing it cancels adding the duplicates.
     */
    "blocks-duplicate": (event: CustomEvent<TBlocksDuplicateDetail>) => void;
  }
}

export type TDuplicateBlockLayerProps = LayerProps & {
  /**
   * Background color of the duplication preview.
   * By default, the block border color from the theme is used.
   */
  ghostBackground?: string;

  /**
   * Checks whether a block can be duplicated.
   * @param block The block being duplicated
   * @returns true if duplication is allowed, false if not allowed
   */
  isDuplicateAllowed?: (block: CanvasBlock) => boolean;
};

type TGhost = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export class DuplicateBlockLayer extends Layer<
  TDuplicateBlockLayerProps,
  LayerContext & { canvas: HTMLCanvasElement; graphCanvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  private copyBlocks: BlockState[] = [];
  private initialPoint: TPoint | null = null;
  private ghosts: TGhost[] = [];
  private enabled = true;
  private lastMouseX?: number;
  private lastMouseY?: number;

  constructor(props: TDuplicateBlockLayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        ...props.canvas,
      },
      ...props,
    });

    this.requireCanvas();
    this.setContext({
      graphCanvas: props.graph.getGraphCanvas(),
    });
  }

  protected afterInit(): void {
    super.afterInit();
    // Capture runs before the graph's own mousedown handling, so preventing the event stops the block drag.
    this.onGraphEvent("mousedown", this.handleMouseDown, {
      capture: true,
    });
  }

  protected handleMouseDown = (graphEvent: UnwrapGraphEvents<"mousedown">): void => {
    if (!this.enabled) {
      return;
    }
    const event = graphEvent.detail.sourceEvent;
    const target = graphEvent.detail.target;
    if (!(event instanceof MouseEvent) || !event.altKey || !(target instanceof CanvasBlock)) {
      return;
    }
    if (this.props.isDuplicateAllowed && !this.props.isDuplicateAllowed(target)) {
      return;
    }

    // Prevents the block drag, the camera drag and the context menu.
    graphEvent.preventDefault();
    event.preventDefault();

    this.context.graph.dragService.startDrag(
      {
        onStart: (event, coords) => this.onStartDuplicate(event, target, { x: coords[0], y: coords[1] }),
        onUpdate: (event) => this.onMoveDuplicate(event),
        onEnd: (_event, coords) => this.onEndDuplicate({ x: coords[0], y: coords[1] }),
      },
      { cursor: "copy" }
    );
  };

  protected render(): void {
    this.resetTransform();

    if (!this.ghosts.length) {
      return;
    }

    const ctx = this.context.ctx;
    ctx.save();
    ctx.fillStyle = this.props.ghostBackground || this.context.colors.block.border;
    for (const ghost of this.ghosts) {
      ctx.fillRect(ghost.x, ghost.y, ghost.width, ghost.height);
    }
    ctx.restore();
  }

  private getMousePosition(event: MouseEvent): TPoint {
    const rect = this.context.graphCanvas.getBoundingClientRect();
    return { x: event.pageX - rect.left - window.scrollX, y: event.pageY - rect.top - window.scrollY };
  }

  private onStartDuplicate(event: MouseEvent, block: CanvasBlock, point: TPoint): void {
    const isBlockSelected = block.connectedState.selected;

    let blockStates: BlockState[];
    if (isBlockSelected) {
      const selectedBlockStates = this.context.graph.rootStore.blocksList.$selectedBlocks.value;
      const isDuplicateAllowed = this.props.isDuplicateAllowed;
      if (isDuplicateAllowed) {
        blockStates = selectedBlockStates.filter((blockState) => {
          const view = blockState.getViewComponent();
          return view !== undefined && isDuplicateAllowed(view);
        });
        if (blockStates.length === 0) return;
      } else {
        blockStates = selectedBlockStates;
      }
    } else {
      blockStates = [block.connectedState];
    }

    const blocks = isBlockSelected
      ? blockStates
          .map((blockState) => blockState.getViewComponent())
          .filter((view): view is CanvasBlock => view !== undefined)
      : [block];

    this.copyBlocks = blockStates;
    this.initialPoint = point;

    const startEvent = this.context.graph.emit("blocks-duplicate-start", { blocks });
    if (startEvent.defaultPrevented) {
      return;
    }

    const scale = this.context.camera.getCameraScale();
    const mouse = this.getMousePosition(event);
    const cameraRect = this.context.camera.getCameraRect();
    const clickedBlockX = block.connectedState.x * scale + cameraRect.x;
    const clickedBlockY = block.connectedState.y * scale + cameraRect.y;
    // Keeps the cursor at the same point of the pressed block's preview.
    const clickOffsetX = mouse.x - clickedBlockX;
    const clickOffsetY = mouse.y - clickedBlockY;

    this.ghosts = this.copyBlocks.map((blockState) => {
      const blockScreenX = blockState.x * scale + cameraRect.x;
      const blockScreenY = blockState.y * scale + cameraRect.y;
      return {
        width: blockState.width * scale,
        height: blockState.height * scale,
        x: mouse.x - clickOffsetX + (blockScreenX - clickedBlockX),
        y: mouse.y - clickOffsetY + (blockScreenY - clickedBlockY),
      };
    });

    this.performRender();
  }

  private onMoveDuplicate(event: MouseEvent): void {
    if (!this.copyBlocks.length) {
      return;
    }

    const mouse = this.getMousePosition(event);
    if (this.lastMouseX === undefined || this.lastMouseY === undefined) {
      this.lastMouseX = mouse.x;
      this.lastMouseY = mouse.y;
      return;
    }

    const deltaX = mouse.x - this.lastMouseX;
    const deltaY = mouse.y - this.lastMouseY;
    this.ghosts = this.ghosts.map((ghost) => ({ ...ghost, x: ghost.x + deltaX, y: ghost.y + deltaY }));
    this.lastMouseX = mouse.x;
    this.lastMouseY = mouse.y;

    this.performRender();
  }

  private onEndDuplicate(point: TPoint): void {
    if (!this.copyBlocks.length || !this.initialPoint) {
      return;
    }

    this.ghosts = [];
    this.lastMouseX = undefined;
    this.lastMouseY = undefined;
    this.performRender();

    const delta = {
      x: point.x - this.initialPoint.x,
      y: point.y - this.initialPoint.y,
    };

    const items = this.copyBlocks.flatMap((blockState) => {
      const view = blockState.getViewComponent();
      if (!view || !view.isEntityAvailable()) return [];
      return [{ block: view, coord: { x: blockState.x + delta.x, y: blockState.y + delta.y } }];
    });

    this.copyBlocks = [];
    this.initialPoint = null;

    const endEvent = this.context.graph.emit("blocks-duplicate", { items, delta });
    if (endEvent.defaultPrevented) {
      return;
    }

    const { graph } = this.context;
    const sources = items.filter((item) => item.block.isEntityAvailable());
    const duplicates = createDuplicates({
      // Listeners may change `coord` without preventing the event, so the copies use it as is.
      blocks: sources.map((item) => ({ block: item.block.connectedState.asTBlock(), coord: item.coord })),
      connections: graph.rootStore.connectionsList.$connections.value.map((connection) => connection.toJSON()),
      delta,
      createId: createDuplicateBlockId,
    });

    graph.api.unsetSelection();
    for (const block of duplicates.blocks) {
      graph.api.addBlock(block, { selected: true, strategy: ESelectionStrategy.APPEND });
    }
    for (const connection of duplicates.connections) {
      graph.api.addConnection(connection);
    }
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
