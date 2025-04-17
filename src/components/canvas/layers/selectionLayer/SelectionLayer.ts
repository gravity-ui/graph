import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../../../graphEvents";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { selectBlockList } from "../../../../store/block/selectors";
import { getXY, isBlock, isMetaKeyEvent } from "../../../../utils/functions";
import { dragListener } from "../../../../utils/functions/dragListener";
import { render } from "../../../../utils/renderers/render";
import { EVENTS } from "../../../../utils/types/events";
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
  private unmountCbs: Array<() => void> = [];

  constructor(props: LayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
      },
      ...props,
    });

    this.setContext({
      canvas: this.getCanvas(),
      ctx: this.getCanvas().getContext("2d"),
    });
    this.bindEventHandlers();
  }

  private bindEventHandlers(): void {
    this.performRender = this.performRender.bind(this);
    this.context.graph.on("camera-change", this.performRender);
    this.unmountCbs.push(this.context.graph.on("mousedown", this.handleMouseDown, { capture: true }));
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
      ctx.roundRect(
        this.selection.x,
        this.selection.y,
        this.selection.width,
        this.selection.height,
        Number(window.devicePixelRatio)
      );
      ctx.closePath();

      ctx.fill();
      ctx.stroke();
    });
  }

  protected unmount(): void {
    this.unbindEventHandlers();
    this.unmountCbs.forEach((cb) => cb());
  }

  private unbindEventHandlers(): void {
    this.context.graph.off("camera-change", this.performRender);
  }

  private handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const event = extractNativeGraphMouseEvent(nativeEvent);
    const target = nativeEvent.detail.target;
    if (target instanceof Anchor || target instanceof Block) {
      return;
    }

    if (event && isMetaKeyEvent(event)) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      dragListener(this.context.graph.getGraphHTML().ownerDocument)
        .on(EVENTS.DRAG_START, this.startSelectionRender)
        .on(EVENTS.DRAG_UPDATE, this.updateSelectionRender)
        .on(EVENTS.DRAG_END, this.endSelectionRender);
    }
  };

  private updateSelectionRender = (event: MouseEvent) => {
    const [x, y] = getXY(this.context.canvas, event);
    this.selection.width = x - this.selection.x;
    this.selection.height = y - this.selection.y;
    this.performRender();
  };

  private startSelectionRender = (event: MouseEvent) => {
    const [x, y] = getXY(this.context.canvas, event);
    this.selection.x = x;
    this.selection.y = y;
  };

  private endSelectionRender = (event: MouseEvent) => {
    if (this.selection.width === 0 && this.selection.height === 0) {
      return;
    }

    const [x, y] = getXY(this.context.canvas, event);
    const selectionRect = getSelectionRect(this.selection.x, this.selection.y, x, y);
    const cameraRect = this.context.graph.cameraService.applyToRect(
      selectionRect[0],
      selectionRect[1],
      selectionRect[2],
      selectionRect[3]
    );
    this.applySelectedArea(cameraRect[0], cameraRect[1], cameraRect[2], cameraRect[3]);
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
