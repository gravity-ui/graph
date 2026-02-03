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
  /** Background color when group is highlighted (block is being dragged over it) */
  highlightedBackground: string;
  /** Border color when group is highlighted */
  highlightedBorder: string;
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
  highlightedBackground: "rgba(100, 200, 100, 0.3)",
  highlightedBorder: "rgba(100, 200, 100, 0.8)",
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

  /** Whether the group is highlighted (block is being dragged over it) */
  protected highlighted = false;

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

  /**
   * Set the highlighted state of the group
   */
  public setHighlighted(highlighted: boolean): void {
    if (this.highlighted !== highlighted) {
      this.highlighted = highlighted;
      this.performRender();
    }
  }

  /**
   * Check if the group is currently highlighted (block is being dragged over it).
   *
   * This method is useful for custom group components that override the `render()` method
   * and need to apply different styling when the group is highlighted during transfer mode.
   *
   * @returns `true` if the group is highlighted, `false` otherwise
   *
   * @example
   * ```typescript
   * class CustomGroup extends Group {
   *   protected override render() {
   *     const ctx = this.context.ctx;
   *     const rect = this.getRect();
   *
   *     // Apply different styles based on state
   *     if (this.isHighlighted()) {
   *       ctx.strokeStyle = 'rgba(100, 200, 100, 1)';
   *       ctx.lineWidth = 3;
   *     } else if (this.state.selected) {
   *       ctx.strokeStyle = 'rgba(100, 100, 100, 1)';
   *       ctx.lineWidth = 2;
   *     } else {
   *       ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
   *       ctx.lineWidth = 1;
   *     }
   *
   *     ctx.beginPath();
   *     ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
   *     ctx.stroke();
   *   }
   * }
   * ```
   */
  public isHighlighted(): boolean {
    return this.highlighted;
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
    // Determine colors based on state priority: highlighted > selected > default
    if (this.highlighted) {
      ctx.strokeStyle = this.style.highlightedBorder;
      ctx.fillStyle = this.style.highlightedBackground;
    } else if (this.state.selected) {
      ctx.strokeStyle = this.style.selectedBorder;
      ctx.fillStyle = this.style.selectedBackground;
    } else {
      ctx.strokeStyle = this.style.border;
      ctx.fillStyle = this.style.background;
    }
    ctx.lineWidth = this.highlighted ? this.style.borderWidth + 1 : this.style.borderWidth;

    // Draw group rectangle
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();
  }

  protected render() {
    this.renderBody(this.context.ctx, this.getRect());
  }
}
