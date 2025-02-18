import { TComponentState } from "../../../lib/Component";
import { BlockState } from "../../../store/block/Block";
import { TGroup, TGroupId } from "../../../store/group/Group";
import { getUsableRectByBlockIds, getXY } from "../../../utils/functions";
import { dragListener } from "../../../utils/functions/dragListener";
import { EVENTS } from "../../../utils/types/events";
import { TRect } from "../../../utils/types/shapes";
import { GraphComponent } from "../GraphComponent";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

export type TGroupProps = {
  id: TGroupId;
};

type TGroupState = TComponentState &
  TGroup & {
    rect: TRect;
  };

export class Group extends GraphComponent<TGroupProps, TGroupState, TGraphLayerContext> {
  public declare context: TGraphLayerContext;
  protected blocks: BlockState[] = [];

  public cursor = "pointer";

  constructor(props: TGroupProps, parent: GraphLayer) {
    super(props, parent);
    this.subscribeToBlocks();
    this.subscribeToGroup();

    this.addEventListener("click", this);
    this.addEventListener("mousedown", this);

    this.onDrag({
      onDragStart: () => {
        this.setState({ selected: true });
      },
      onDragUpdate: ({ diffX, diffY }) => {
        this.blocks.forEach((block) => {
          const nextX = block.x - diffX;
          const nextY = block.y - diffY;
          block.updateXY(nextX, nextY);
        });
      },
    });
  }

  public handleEvent(event: CustomEvent) {
    switch (event.type) {
      case "click": {
        this.setState({ selected: !this.state.selected });
        break;
      }
    }
  }

  protected onBlocksUpdate = (blocks: BlockState[]) => {
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
  };

  protected subscribeToBlocks() {
    this.onBlocksUpdate(this.context.graph.rootStore.blocksList.$blockGroups.value[this.props.id]);
    return this.subscribeSignal(this.context.graph.rootStore.blocksList.$blockGroups, () => {
      const blocks = this.context.graph.rootStore.blocksList.$blockGroups.value[this.props.id] || [];
      this.onBlocksUpdate(blocks);
    });
  }

  protected subscribeToGroup() {
    return this.subscribeSignal(this.context.graph.rootStore.groupsList.$groupsMap, () => {
      const group = this.context.graph.rootStore.groupsList.getGroup(this.props.id);
      if (group) {
        this.setState({
          ...this.state,
          ...group,
        });
      }
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

    // Рисуем название группы в правом верхнем углу
    if (this.state.name) {
      ctx.fillStyle = this.state.selected ? "rgba(100, 100, 100, 0.9)" : "rgba(100, 100, 100, 0.7)";
      ctx.font = "14px Arial";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(this.state.name, rect.x + rect.width - 10, rect.y + 10);
    }
  }
}
