import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../../../graphEvents";
import { DragHandler } from "../../../../services/DragController";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { selectBlockList } from "../../../../store/block/selectors";
import { isBlock, isMetaKeyEvent } from "../../../../utils/functions";
import { render } from "../../../../utils/renderers/render";
import { TRect } from "../../../../utils/types/shapes";
import { Anchor } from "../../anchors";
import { Block } from "../../blocks/Block";

function getSelectionRect(sx: number, sy: number, ex: number, ey: number): number[] {
  if (sx > ex) [sx, ex] = [ex, sx];
  if (sy > ey) [sy, ey] = [ey, sy];
  return [sx, sy, ex - sx, ey - sy];
}

export class SelectionLayer extends Layer<
  LayerProps,
  LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  private readonly selection: TRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  constructor(props: LayerProps) {
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
   * @returns {void}
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
    return this.selection.width !== 0 || this.selection.height !== 0;
  }

  private drawSelectionArea(): void {
    render(this.context.ctx, (ctx) => {
      ctx.fillStyle = this.context.colors.selection.background;
      ctx.strokeStyle = this.context.colors.selection.border;
      ctx.beginPath();

      // Преобразуем мировые координаты в координаты canvas для рендеринга
      const scale = this.context.camera.getCameraScale();
      const cameraRect = this.context.camera.getCameraRect();

      const canvasX = this.selection.x * scale + cameraRect.x;
      const canvasY = this.selection.y * scale + cameraRect.y;
      const canvasWidth = this.selection.width * scale;
      const canvasHeight = this.selection.height * scale;

      ctx.roundRect(canvasX, canvasY, canvasWidth, canvasHeight, Number(this.context.graph.layers.getDPR()));
      ctx.closePath();

      ctx.fill();
      ctx.stroke();
    });
  }

  private handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const event = extractNativeGraphMouseEvent(nativeEvent);
    const target = nativeEvent.detail.target;
    if (target instanceof Anchor || target instanceof Block) {
      return;
    }

    if (!this.root?.ownerDocument) {
      return;
    }

    if (event && isMetaKeyEvent(event)) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();

      const selectionHandler: DragHandler = {
        onDraggingStart: this.startSelectionRender,
        onDragUpdate: this.updateSelectionRender,
        onDragEnd: this.endSelectionRender,
      };

      this.context.graph.dragController.start(selectionHandler, event, {
        enableEdgePanning: true, // Отключаем edge panning для выделения
      });
    }
  };

  private updateSelectionRender = (event: MouseEvent) => {
    const worldPoint = this.context.graph.getPointInCameraSpace(event);
    this.selection.width = worldPoint.x - this.selection.x;
    this.selection.height = worldPoint.y - this.selection.y;
    this.performRender();
  };

  private startSelectionRender = (event: MouseEvent) => {
    const worldPoint = this.context.graph.getPointInCameraSpace(event);
    this.selection.x = worldPoint.x;
    this.selection.y = worldPoint.y;
  };

  private endSelectionRender = (event: MouseEvent) => {
    if (this.selection.width === 0 && this.selection.height === 0) {
      return;
    }

    const worldPoint = this.context.graph.getPointInCameraSpace(event);
    const selectionRect = getSelectionRect(this.selection.x, this.selection.y, worldPoint.x, worldPoint.y);

    // Координаты уже в мировом пространстве, преобразование не нужно
    this.applySelectedArea(selectionRect[0], selectionRect[1], selectionRect[2], selectionRect[3]);
    this.selection.width = 0;
    this.selection.height = 0;
    this.performRender();
  };

  private applySelectedArea(x: number, y: number, w: number, h: number): void {
    const foundComponents = this.context.graph.hitTest.testHitBox({
      minX: x,
      minY: y,
      maxX: x + w,
      maxY: y + h,
      x,
      y,
    });

    const blocks = foundComponents.filter((component) => isBlock(component));
    const blocksIds = blocks.map((component: Block) => component.state.id);

    selectBlockList(this.context.graph).updateBlocksSelection(blocksIds, Boolean(blocks.length));
  }
}
