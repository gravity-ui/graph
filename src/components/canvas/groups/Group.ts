import { TComponentState } from "../../../lib/Component";
import { BlockState } from "../../../store/block/Block";
import { GroupState, TGroup, TGroupId } from "../../../store/group/Group";
import { isMetaKeyEvent } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";
import { ESelectionStrategy } from "../../../utils/types/types";
import { GraphComponent } from "../GraphComponent";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BlockGroups } from "./BlockGroups";

export type TGroupProps = {
  id: TGroupId;
  onDragUpdate: (groupId: string, diff: { diffX: number; diffY: number }) => void;
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

  public get zIndex() {
    return 0;
  }

  public declare context: TGraphLayerContext;
  protected blocks: BlockState[] = [];

  protected groupState: GroupState | undefined;

  public cursor = "pointer";

  protected viewState = defaultViewState;

  constructor(props: TGroupProps, parent: BlockGroups) {
    super(props, parent);
    this.subscribeToGroup();

    this.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();
      this.groupState.setSelection(
        true,
        !isMetaKeyEvent(event) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
      );
    });

    this.onDrag({
      onDragStart: (_event) => {
        this.cursor = "grabbing";
      },
      onDragUpdate: ({ diffX, diffY }) => {
        if (this.viewState.draggable) {
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
          if (this.viewState.updateBlocksOnDrag) {
            this.props.onDragUpdate(this.props.id, { diffX, diffY });
          }
        }
      },
      onDrop: () => {
        this.cursor = "pointer";
      },
    });
  }

  protected getRect(rect = this.state.rect) {
    const [paddingTop, paddingRight, paddingBottom, paddingLeft] = this.viewState.padding;
    return {
      x: rect.x - paddingLeft,
      y: rect.y - paddingTop,
      width: rect.width + paddingLeft + paddingRight,
      height: rect.height + paddingTop + paddingBottom,
    };
  }

  protected subscribeToGroup() {
    this.groupState = this.context.graph.rootStore.groupsList.getGroupState(this.props.id);
    return this.subscribeSignal(this.groupState.$state, (group) => {
      if (group) {
        this.setState({
          ...this.state,
          ...group,
        });
        this.updateHitBox(this.getRect(group.rect));
      }
    });
  }

  protected updateHitBox(rect: TRect) {
    this.setHitBox(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  }

  protected render() {
    const ctx = this.context.ctx;
    const rect = this.getRect();

    // Настраиваем стиль для группы
    ctx.strokeStyle = this.state.selected ? this.viewState.selectedBorder : this.viewState.border;
    ctx.fillStyle = this.state.selected ? this.viewState.selectedBackground : this.viewState.background;
    ctx.lineWidth = this.viewState.borderWidth;

    // Рисуем прямоугольник группы
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
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
