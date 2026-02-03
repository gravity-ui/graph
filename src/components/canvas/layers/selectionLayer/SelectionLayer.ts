import { GraphMouseEvent, extractNativeGraphMouseEvent, isGraphEvent } from "../../../../graphEvents";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { Camera } from "../../../../services/camera/Camera";
import { ESelectionStrategy } from "../../../../services/selection";
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

    this.setContext({
      canvas: this.getCanvas(),
      ctx: this.getCanvas().getContext("2d"),
    });
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    // Set up event handlers here instead of in constructor
    this.onGraphEvent("mousedown", this.handleMouseDown, {
      capture: true,
    });

    // Call parent afterInit to ensure proper initialization
    super.afterInit();
  }

  protected render(): void {
    this.resetTransform();
    if (!this.hasActiveSelection()) {
      return;
    }
    this.drawSelectionArea();
  }

  private hasActiveSelection(): boolean {
    return this.selectionStartWorld !== null && this.selectionEndWorld !== null;
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

  private handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    if (!this.root?.ownerDocument) {
      return;
    }
    const event = extractNativeGraphMouseEvent(nativeEvent);
    const target = nativeEvent.detail.target;
    // If target is camera, that means that user is start selection outside any elements
    if (!(target instanceof Camera)) {
      return;
    }

    if (event && isMetaKeyEvent(event)) {
      // nativeEvent.preventDefault();
      // nativeEvent.stopPropagation();
      if (isGraphEvent(nativeEvent)) {
        nativeEvent.stopGraphEventPropagation();
      }
      this.context.graph.dragService.startDrag({
        onStart: this.startSelectionRender,
        onUpdate: this.updateSelectionRender,
        onEnd: this.endSelectionRender,
      });
    }
  };

  private updateSelectionRender = (event: MouseEvent, [worldX, worldY]: [number, number]) => {
    this.selectionEndWorld = { x: worldX, y: worldY };
    this.performRender();
  };

  private startSelectionRender = (_event: MouseEvent, [worldX, worldY]: [number, number]) => {
    this.selectionStartWorld = { x: worldX, y: worldY };
    this.selectionEndWorld = { x: worldX, y: worldY };
  };

  private endSelectionRender = (_event: MouseEvent) => {
    if (!this.selectionStartWorld || !this.selectionEndWorld) {
      return;
    }

    // Check if selection has any size
    const hasSizeX = Math.abs(this.selectionEndWorld.x - this.selectionStartWorld.x) > 0.1;
    const hasSizeY = Math.abs(this.selectionEndWorld.y - this.selectionStartWorld.y) > 0.1;

    if (!hasSizeX || !hasSizeY) {
      this.selectionStartWorld = null;
      this.selectionEndWorld = null;
      this.performRender();
      return;
    }

    // Calculate selection rect in world coordinates
    const worldRect = getSelectionRect(
      this.selectionStartWorld.x,
      this.selectionStartWorld.y,
      this.selectionEndWorld.x,
      this.selectionEndWorld.y
    );

    this.applySelectedArea(worldRect[0], worldRect[1], worldRect[2], worldRect[3]);

    // Clear selection
    this.selectionStartWorld = null;
    this.selectionEndWorld = null;
    this.performRender();
  };

  private applySelectedArea(x: number, y: number, w: number, h: number): void {
    const selectableEntityTypes = this.context.graph.$graphConstants.value.selectionLayer.SELECTABLE_ENTITY_TYPES;

    const elements = this.context.graph.getElementsOverRect({ x, y, width: w, height: h }, selectableEntityTypes);
    this.context.graph.rootStore.selectionService.selectRelatedElements(elements, ESelectionStrategy.REPLACE);
  }
}
