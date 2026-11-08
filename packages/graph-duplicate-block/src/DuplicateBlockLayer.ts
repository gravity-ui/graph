import { CanvasBlock, ESelectionStrategy, Layer } from "@gravity-ui/graph";
import type { BlockState, LayerContext, LayerProps, TPoint, UnwrapGraphEvents } from "@gravity-ui/graph";

import { createDuplicateBlockId, createDuplicateConnectionId, createDuplicates } from "./createDuplicates";

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
  /** Preview rectangles in world coordinates, so they stay where the copies will be added. */
  private ghosts: TGhost[] = [];
  private enabled = true;

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
    // Preventing the graph mousedown stops the block drag, DragService and the camera pan.
    this.onGraphEvent("mousedown", this.handleMouseDown, {
      capture: true,
    });
    super.afterInit();
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

    // Prevents the block drag and the context menu.
    graphEvent.preventDefault();
    event.preventDefault();

    this.context.graph.dragService.startDrag(
      {
        onStart: (_event, coords) => this.onStartDuplicate(target, { x: coords[0], y: coords[1] }),
        onUpdate: (_event, coords) => this.onMoveDuplicate({ x: coords[0], y: coords[1] }),
        onEnd: (_event, coords) => this.onEndDuplicate({ x: coords[0], y: coords[1] }),
      },
      // Anchors the drag at the press point rather than at the first move past the drag threshold.
      { cursor: "copy", initialEvent: event }
    );
  };

  protected render(): void {
    this.resetTransform();

    if (!this.ghosts.length) {
      return;
    }

    const scale = this.context.camera.getCameraScale();
    const cameraRect = this.context.camera.getCameraRect();
    const ctx = this.context.ctx;
    ctx.save();
    ctx.fillStyle = this.props.ghostBackground || this.context.colors.block.border;
    for (const ghost of this.ghosts) {
      ctx.fillRect(
        ghost.x * scale + cameraRect.x,
        ghost.y * scale + cameraRect.y,
        ghost.width * scale,
        ghost.height * scale
      );
    }
    ctx.restore();
  }

  private onStartDuplicate(block: CanvasBlock, point: TPoint): void {
    const isBlockSelected = block.connectedState.selected;

    let blockStates: BlockState[];
    if (isBlockSelected) {
      const selectedBlockStates = this.context.graph.blocks.$selectedBlocks.value;
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

    this.ghosts = this.copyBlocks.map(({ x, y, width, height }) => ({ x, y, width, height }));
    this.performRender();
  }

  private onMoveDuplicate(point: TPoint): void {
    if (!this.ghosts.length || !this.initialPoint) {
      return;
    }

    const delta = { x: point.x - this.initialPoint.x, y: point.y - this.initialPoint.y };
    this.ghosts = this.copyBlocks.map(({ x, y, width, height }) => ({ x: x + delta.x, y: y + delta.y, width, height }));
    this.performRender();
  }

  private onEndDuplicate(point: TPoint): void {
    if (!this.copyBlocks.length || !this.initialPoint) {
      return;
    }

    this.ghosts = [];
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
      connections: graph.connections.toJSON(),
      delta,
      createId: createDuplicateBlockId,
      createConnectionId: createDuplicateConnectionId,
    });

    // Three store writes: `batch` is not part of the public core API, and updateEntities batches its own.
    graph.api.unsetSelection();
    graph.updateEntities(duplicates);
    graph.api.selectBlocks(
      duplicates.blocks.map((duplicate) => duplicate.id),
      true,
      ESelectionStrategy.REPLACE
    );
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
