import { TComponentState } from "../../../lib/Component";
import { BlockState } from "../../../store/block/Block";
import { GroupState, TGroup, TGroupId } from "../../../store/group/Group";
import { TRect } from "../../../utils/types/shapes";
import { GraphComponent } from "../GraphComponent";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BlockGroups } from "./BlockGroups";

export type TGroupProps = {
  id: TGroupId;
};

type TGroupState = TComponentState &
  TGroup & {
    rect: TRect;
  };

export type TGroupViewState = {
  padding: [number, number, number, number];
  draggable: boolean;
  updateBlocksOnDrag: boolean;
  background: string;
  border: string;
  borderWidth: number;
  selectedBackground: string;
  selectedBorder: string;
  textColor: string;
  selectedTextColor: string;
};

const defaultViewState: TGroupViewState = {
  padding: [20, 20, 20, 20],
  draggable: false,
  updateBlocksOnDrag: false,
  background: "rgba(100, 100, 100, 0.1)",
  border: "rgba(100, 100, 100, 0.3)",
  borderWidth: 2,
  selectedBackground: "rgba(100, 100, 100, 1)",
  selectedBorder: "rgba(100, 100, 100, 1)",
  textColor: "rgba(100, 100, 100, 0.7)",
  selectedTextColor: "rgba(100, 100, 100, 0.9)",
};

export class Group extends GraphComponent<TGroupProps, TGroupState, TGraphLayerContext> {
  public static define(state: Partial<TGroupViewState>) {
    return class SpecificGroup extends Group {
      protected viewState = {
        ...defaultViewState,
        ...state,
      };
    };
  }

  public declare context: TGraphLayerContext;
  protected blocks: BlockState[] = [];

  protected groupState: GroupState | undefined;

  public cursor = "pointer";

  protected viewState = defaultViewState;

  constructor(props: TGroupProps, parent: BlockGroups) {
    super(props, parent);
    this.subscribeToGroup();

    this.addEventListener("click", (event) => {
      event.stopPropagation();
      this.groupState.setSelection(true);
    });

    this.onDrag({
      onDragUpdate: ({ diffX, diffY }) => {
        if (this.viewState.draggable) {
          // this.blocks.forEach((block) => {
          //   const nextX = block.x - diffX;
          //   const nextY = block.y - diffY;
          //   block.updateXY(nextX, nextY);
          // });
          const rect = {
            x: this.state.rect.x - diffX,
            y: this.state.rect.y - diffY,
            width: this.state.rect.width,
            height: this.state.rect.height,
          };
          this.setState({
            rect,
          });
          this.updateHitBox(rect);
        }
      },
    });
  }

  protected subscribeToGroup() {
    return this.subscribeSignal(this.context.graph.rootStore.groupsList.$groupsMap, () => {
      const group = this.context.graph.rootStore.groupsList.getGroupState(this.props.id);
      this.groupState = group;
      if (group) {
        this.setState({
          ...this.state,
          ...group.asTGroup(),
        });
        this.updateHitBox(group.$state.value.rect);
      }
    });
  }

  protected updateHitBox(rect: TRect) {
    this.setHitBox(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  }

  protected render() {
    const ctx = this.context.ctx;
    const rect = this.state.rect;
    const [paddingTop, paddingRight, paddingBottom, paddingLeft] = this.viewState.padding;

    // Настраиваем стиль для группы
    ctx.strokeStyle = this.state.selected ? this.viewState.selectedBorder : this.viewState.border;
    ctx.fillStyle = this.state.selected ? this.viewState.selectedBackground : this.viewState.background;
    ctx.lineWidth = this.viewState.borderWidth;

    // Рисуем прямоугольник группы
    ctx.beginPath();
    ctx.roundRect(
      rect.x - paddingLeft,
      rect.y - paddingTop,
      rect.width + paddingLeft + paddingRight,
      rect.height + paddingTop + paddingBottom,
      8
    );
    ctx.fill();
    ctx.stroke();

    // Рисуем название группы в правом верхнем углу
    if (this.state.name) {
      ctx.fillStyle = this.state.selected ? this.viewState.selectedTextColor : this.viewState.textColor;
      ctx.font = "14px Arial";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(this.state.name, rect.x + rect.width - 10, rect.y + 10);
    }
  }
}
