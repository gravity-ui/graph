import { TComponentState } from "../../../lib/Component";
import { DragContext, DragDiff } from "../../../services/drag";
import { ESelectionStrategy } from "../../../services/selection/types";
import { BlockState } from "../../../store/block/Block";
import { GroupState, TGroup, TGroupId } from "../../../store/group/Group";
import { isAllowDrag, isMetaKeyEvent } from "../../../utils/functions";
import { TMeasureTextOptions } from "../../../utils/functions/text";
import { layoutText } from "../../../utils/renderers/text";
import { TRect } from "../../../utils/types/shapes";
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
  onDragUpdate: (groupId: string, diff: { deltaX: number; deltaY: number }) => void;
  style?: Partial<TGroupStyle>;
  geometry?: Partial<TGroupGeometry>;
  draggable?: boolean;
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
  }

  public getEntityId() {
    return this.props.id;
  }

  /**
   * Check if group can be dragged based on props.draggable and canDrag setting
   */
  public override isDraggable(): boolean {
    const canDrag = this.context.graph.rootStore.settings.$canDrag.value;
    return Boolean(this.props.draggable) && isAllowDrag(canDrag, this.state.selected);
  }

  /**
   * Handle drag start - nothing special needed, DragService handles autopanning and cursor
   */
  public override handleDragStart(_context: DragContext): void {
    // DragService handles autopanning and cursor locking
  }

  /**
   * Handle drag update - update group rect and notify via callback
   */
  public override handleDrag(diff: DragDiff, _context: DragContext): void {
    const rect = {
      x: this.state.rect.x + diff.deltaX,
      y: this.state.rect.y + diff.deltaY,
      width: this.state.rect.width,
      height: this.state.rect.height,
    };
    this.setState({
      rect,
    });
    this.updateHitBox(rect);
    this.props.onDragUpdate(this.props.id, { deltaX: diff.deltaX, deltaY: diff.deltaY });
  }

  /**
   * Handle drag end - nothing special needed, DragService handles cleanup
   */
  public override handleDragEnd(_context: DragContext): void {
    // DragService handles autopanning disable and cursor unlock
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
    this.subscribeSignal(this.groupState.$selected, (selected) => {
      this.setState({
        selected,
      });
    });
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

  protected layoutText(text: string, textParams?: TMeasureTextOptions) {
    const currentRect = this.getRect();
    return layoutText(text, this.context.ctx, currentRect, {
      maxWidth: currentRect.width,
      maxHeight: currentRect.height,
      ...textParams,
    });
  }

  protected renderBody(ctx: CanvasRenderingContext2D, rect = this.getRect()) {
    ctx.strokeStyle = this.state.selected ? this.style.selectedBorder : this.style.border;
    ctx.fillStyle = this.state.selected ? this.style.selectedBackground : this.style.background;
    ctx.lineWidth = this.style.borderWidth;

    // Рисуем прямоугольник группы
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();
  }

  protected render() {
    this.renderBody(this.context.ctx, this.getRect());
  }
}
