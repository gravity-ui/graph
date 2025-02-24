import { TComponentState } from "../../../lib/Component";
import { BlockState } from "../../../store/block/Block";
import { GroupState, TGroup, TGroupId } from "../../../store/group/Group";
import { isMetaKeyEvent } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";
import { ESelectionStrategy } from "../../../utils/types/types";
import { GraphComponent } from "../GraphComponent";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BlockGroups } from "./BlockGroups";

export type TGroupStyle = {
  background: string;
  border: string;
  borderWidth: number;
  selectedBackground: string;
  selectedBorder: string;
};

export type TGroupGeometry = {
  padding: [number, number, number, number];
};

export type TGroupProps = {
  id: TGroupId;
  onDragUpdate: (groupId: string, diff: { diffX: number; diffY: number }) => void;
  style?: Partial<TGroupStyle>;
  geometry?: Partial<TGroupGeometry>;
  draggable?: boolean;
  updateBlocksOnDrag?: boolean;
};

type TGroupState<T extends TGroup = TGroup> = TComponentState &
  T & {
    rect: TRect;
  };

const defaultStyle: TGroupStyle = {
  background: "rgba(100, 100, 100, 0.1)",
  border: "rgba(100, 100, 100, 0.3)",
  borderWidth: 2,
  selectedBackground: "rgba(100, 100, 100, 1)",
  selectedBorder: "rgba(100, 100, 100, 1)",
};

const defaultGeometry: TGroupGeometry = {
  padding: [20, 20, 20, 20],
};

export class Group<T extends TGroup = TGroup> extends GraphComponent<TGroupProps, TGroupState<T>, TGraphLayerContext> {
  public static define(config: { style?: Partial<TGroupStyle>; geometry?: Partial<TGroupGeometry> }): typeof Group {
    return class SpecificGroup<T extends TGroup = TGroup> extends Group<T> {
      constructor(props: TGroupProps, parent: BlockGroups) {
        super(
          {
            ...props,
            style: {
              ...defaultStyle,
              ...config.style,
              ...props.style,
            },
            geometry: {
              ...defaultGeometry,
              ...config.geometry,
              ...props.geometry,
            },
          },
          parent
        );
      }
    };
  }

  public get zIndex() {
    return 0;
  }

  public declare context: TGraphLayerContext;
  protected blocks: BlockState[] = [];
  protected groupState: GroupState | undefined;
  public cursor = "pointer";

  protected style: TGroupStyle;
  protected geometry: TGroupGeometry;

  constructor(props: TGroupProps, parent: BlockGroups) {
    super(props, parent);

    this.style = {
      ...defaultStyle,
      ...props.style,
    };

    this.geometry = {
      ...defaultGeometry,
      ...props.geometry,
    };

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
        if (this.props.draggable) {
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
          if (this.props.updateBlocksOnDrag) {
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
    const [paddingTop, paddingRight, paddingBottom, paddingLeft] = this.geometry.padding;
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
        } as T);
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
    ctx.strokeStyle = this.state.selected ? this.style.selectedBorder : this.style.border;
    ctx.fillStyle = this.state.selected ? this.style.selectedBackground : this.style.background;
    ctx.lineWidth = this.style.borderWidth;

    // Рисуем прямоугольник группы
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();
  }
}
