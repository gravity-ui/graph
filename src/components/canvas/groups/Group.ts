import { BlockState } from "../../../store/block/Block";
import { getUsableRectByBlockIds, getXY } from "../../../utils/functions";
import { EVENTS } from "../../../utils/types/events";
import { TRect } from "../../../utils/types/shapes";
import { GraphComponent } from "../GraphComponent";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

export type TGroupProps = {
  id: string;
};

export class Group extends GraphComponent<TGroupProps, { rect: TRect; selected: boolean }, TGraphLayerContext> {
  public declare context: TGraphLayerContext;
  protected blocks: BlockState[] = [];
  protected lastDragEvent?: MouseEvent;
  protected startDragCoords: number[] = [];

  public cursor = "pointer";

  constructor(props: TGroupProps, parent: GraphLayer) {
    super(props, parent);
    this.subscribeToBlocks();

    this.addEventListener(EVENTS.DRAG_START, this);
    this.addEventListener(EVENTS.DRAG_UPDATE, this);
    this.addEventListener(EVENTS.DRAG_END, this);
    this.addEventListener("click", this);
  }

  public handleEvent(event: CustomEvent) {
    switch (event.type) {
      case EVENTS.DRAG_START: {
        this.onDragStart(event.detail.sourceEvent);
        break;
      }
      case EVENTS.DRAG_UPDATE: {
        this.onDragUpdate(event.detail.sourceEvent);
        break;
      }
      case EVENTS.DRAG_END: {
        this.onDragEnd();
        break;
      }
      case "click": {
        this.setState({ selected: !this.state.selected });
        break;
      }
    }
  }

  protected onDragStart(event: MouseEvent) {
    this.lastDragEvent = event;
    const xy = getXY(this.context.canvas, event);
    this.startDragCoords = this.context.camera.applyToPoint(xy[0], xy[1]);
  }

  protected onDragUpdate(event: MouseEvent) {
    if (!this.startDragCoords.length) return;

    this.lastDragEvent = event;
    const [canvasX, canvasY] = getXY(this.context.canvas, event);
    const [cameraSpaceX, cameraSpaceY] = this.context.camera.applyToPoint(canvasX, canvasY);

    const diffX = (this.startDragCoords[0] - cameraSpaceX) | 0;
    const diffY = (this.startDragCoords[1] - cameraSpaceY) | 0;

    // Обновляем позиции всех блоков в группе
    this.blocks.forEach((block) => {
      const nextX = block.x - diffX;
      const nextY = block.y - diffY;
      block.updateXY(nextX, nextY);
    });

    this.startDragCoords = [cameraSpaceX, cameraSpaceY];
  }

  protected onDragEnd() {
    this.lastDragEvent = undefined;
    this.startDragCoords = [];
  }

  protected subscribeToBlocks() {
    this.setHitBox(0, 0, 0, 0);
    return this.subscribeSignal(this.context.graph.rootStore.blocksList.$blockGroups, () => {
      const blocks = this.context.graph.rootStore.blocksList.$blockGroups.value[this.props.id] || [];
      this.blocks = blocks;

      if (blocks.length) {
        const rect = getUsableRectByBlockIds(blocks);
        const padding = 20;
        const newRect = {
          x: rect.x - padding,
          y: rect.y - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        };

        this.setState({ rect: newRect, selected: this.state?.selected || false });
        this.updateHitBox(newRect);
      }
      this.performRender();
    });
  }

  protected updateHitBox(rect: TRect) {
    this.setHitBox(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  }

  protected render() {
    if (!this.blocks.length) return;

    const ctx = this.context.ctx;
    const rect = this.state.rect;

    // Настраиваем стиль для группы
    ctx.strokeStyle = this.state.selected ? "rgba(100, 100, 100, 0.6)" : "rgba(100, 100, 100, 0.3)";
    ctx.fillStyle = this.state.selected ? "rgba(100, 100, 100, 0.2)" : "rgba(100, 100, 100, 0.1)";
    ctx.lineWidth = this.state.selected ? 3 : 2;

    // Рисуем прямоугольник группы
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();

    // Рисуем название группы
    ctx.fillStyle = this.state.selected ? "rgba(100, 100, 100, 0.9)" : "rgba(100, 100, 100, 0.7)";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Group: ${this.props.id}`, rect.x + 10, rect.y + 20);
  }
}
