import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import type { GraphDragOperation } from "../../../../services/input/press";
import { isMetaKeyEvent } from "../../../../utils/functions";
import { render } from "../../../../utils/renderers/render";

function getSelectionRect(sx: number, sy: number, ex: number, ey: number): number[] {
  if (sx > ex) [sx, ex] = [ex, sx];
  if (sy > ey) [sy, ey] = [ey, sy];
  return [sx, sy, ex - sx, ey - sy];
}
export class SelectionLayer extends Layer<
  LayerProps,
  LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  // Store selection in world coordinates to handle auto-panning correctly
  private selectionStartWorld: { x: number; y: number } | null = null;
  private selectionEndWorld: { x: number; y: number } | null = null;

  constructor(props: LayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true, // Automatically apply camera transformation
        ...props.canvas,
      },
      ...props,
    });

    this.requireCanvas();
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    this.onGraphEvent("dragstart", ({ target, pressEvent, claim }) => {
      if (target === this.context.graph && pressEvent.button === 0 && isMetaKeyEvent(pressEvent)) {
        claim(this.selectionDrag);
      }
    });
    super.afterInit();
  }

  protected render(): void {
    this.resetTransform();
    if (!this.hasActiveSelection()) {
      return;
    }
    this.drawSelectionArea();
  }

  /**
   * Selection is active only when it has a non-zero size on both axes.
   * A zero-size rect is neither drawn nor applied.
   */
  private hasActiveSelection(): boolean {
    if (!this.selectionStartWorld || !this.selectionEndWorld) {
      return false;
    }
    const hasSizeX = Math.abs(this.selectionEndWorld.x - this.selectionStartWorld.x) > 0.1;
    const hasSizeY = Math.abs(this.selectionEndWorld.y - this.selectionStartWorld.y) > 0.1;
    return hasSizeX && hasSizeY;
  }

  private drawSelectionArea(): void {
    if (!this.selectionStartWorld || !this.selectionEndWorld) {
      return;
    }

    // Calculate selection rectangle in world coordinates
    // Layer will automatically apply camera transformation thanks to transformByCameraPosition
    const x = Math.min(this.selectionStartWorld.x, this.selectionEndWorld.x);
    const y = Math.min(this.selectionStartWorld.y, this.selectionEndWorld.y);
    const width = Math.abs(this.selectionEndWorld.x - this.selectionStartWorld.x);
    const height = Math.abs(this.selectionEndWorld.y - this.selectionStartWorld.y);

    render(this.context.ctx, (ctx) => {
      ctx.fillStyle = this.context.colors.selection.background;
      ctx.strokeStyle = this.context.colors.selection.border;
      ctx.beginPath();
      ctx.lineWidth = Math.round(1 / this.context.graph.cameraService.getCameraScale());
      ctx.roundRect(x, y, width, height, Number(this.context.graph.layers.getDPR()));
      ctx.closePath();

      ctx.fill();
      ctx.stroke();
    });
  }

  private updateSelectionRender = (event: PointerEvent, [worldX, worldY]: [number, number]) => {
    this.selectionEndWorld = { x: worldX, y: worldY };
    this.performRender();
  };

  private startSelectionRender = (_event: PointerEvent, [worldX, worldY]: [number, number]) => {
    this.selectionStartWorld = { x: worldX, y: worldY };
    this.selectionEndWorld = { x: worldX, y: worldY };
  };

  private endSelectionRender = (event: PointerEvent) => {
    if (!this.selectionStartWorld || !this.selectionEndWorld) {
      return;
    }

    if (!this.hasActiveSelection()) {
      this.resetSelectionRender();
      return;
    }

    // Calculate selection rect in world coordinates
    const worldRect = getSelectionRect(
      this.selectionStartWorld.x,
      this.selectionStartWorld.y,
      this.selectionEndWorld.x,
      this.selectionEndWorld.y
    );

    this.applySelectedArea(worldRect[0], worldRect[1], worldRect[2], worldRect[3], event.shiftKey);

    this.resetSelectionRender();
  };

  private resetSelectionRender = (): void => {
    this.selectionStartWorld = null;
    this.selectionEndWorld = null;
    this.performRender();
  };

  private readonly selectionDrag: GraphDragOperation = {
    owner: "SelectionLayer",
    start: this.startSelectionRender,
    move: this.updateSelectionRender,
    end: this.endSelectionRender,
    cancel: this.resetSelectionRender,
  };

  private applySelectedArea(x: number, y: number, w: number, h: number, shiftPressed: boolean): void {
    const selectableEntityTypes = this.context.graph.$graphConstants.value.selectionLayer.SELECTABLE_ENTITY_TYPES;
    const shiftStrategy = this.context.graph.$graphConstants.value.selectionLayer.SHIFT_STRATEGY;
    const strategy = shiftPressed ? shiftStrategy : this.context.graph.$graphConstants.value.selectionLayer.STRATEGY;

    const elements = selectableEntityTypes.length
      ? this.context.graph.getElementsOverRect({ x, y, width: w, height: h }, selectableEntityTypes)
      : [];
    this.context.graph.rootStore.selectionService.selectRelatedElements(elements, strategy);
  }
}
