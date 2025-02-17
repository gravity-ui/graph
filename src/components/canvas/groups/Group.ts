import { BlockState } from "../../../store/block/Block";
import { getUsableRectByBlockIds } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";
import { GraphComponent } from "../GraphComponent";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

export type TGroupProps = {
  id: string;
};

export class Group extends GraphComponent<TGroupProps, { rect: TRect }, TGraphLayerContext> {
  public declare context: TGraphLayerContext;
  protected blocks: BlockState[] = [];

  constructor(props: TGroupProps, parent: GraphLayer) {
    super(props, parent);
    this.subscribeToBlocks();
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

        this.setState({ rect: newRect });
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
    ctx.strokeStyle = "rgba(100, 100, 100, 0.3)";
    ctx.fillStyle = "rgba(100, 100, 100, 0.1)";
    ctx.lineWidth = 2;

    // Рисуем прямоугольник группы
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();

    // Рисуем название группы
    ctx.fillStyle = "rgba(100, 100, 100, 0.7)";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Group: ${this.props.id}`, rect.x + 10, rect.y + 20);
  }
}
