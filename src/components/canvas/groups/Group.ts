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
  protected groupState!: GroupState<T>;
  public cursor = "pointer";

  protected style: TGroupStyle;
  protected geometry: TGroupGeometry;

  /** Whether the group is highlighted (block is being dragged over it) */
  protected highlighted = false;

  /** Whether the group is currently being dragged */
  protected isDragging = false;

  protected dragStartRect: { x: number; y: number } | null = null;
  protected lastSnappedPos: { x: number; y: number } | null = null;

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

    this.addEventListener("click", this.handleClick);
  }

  protected handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    const isMeta = isMetaKeyEvent(event);
    this.groupState.setSelection(
      !isMeta ? true : !this.groupState.$selected.value,
      !isMeta ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
    );
  };

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
    return Boolean(this.props.draggable) && isAllowDrag(canDrag, Boolean(this.state.selected));
  }

  /**
   * Override to apply snapping or other position transforms during drag.
   * Called with the raw (pre-snap) target position computed from the drag start + cumulative diff.
   * The default implementation returns the position unchanged (no snapping).
   *
   * @example
   * ```typescript
   * protected override snapPosition(x: number, y: number) {
   *   const grid = 16;
   *   return { x: Math.round(x / grid) * grid, y: Math.round(y / grid) * grid };
   * }
   * ```
   */
  protected snapPosition(x: number, y: number): { x: number; y: number } {
    const gridSize = this.context.constants.block.SNAPPING_GRID_SIZE;
    if (gridSize <= 1) {
      return { x, y };
    }
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    };
  }

  /**
   * Handle drag start - stores the initial rect position and sets isDragging flag.
   * Subclasses that override this method should call super.handleDragStart() to preserve this behavior.
   */
  public override handleDragStart(_context: DragContext): void {
    this.isDragging = true;
    this.dragStartRect = { x: this.state.rect.x, y: this.state.rect.y };
    this.lastSnappedPos = { x: this.state.rect.x, y: this.state.rect.y };
  }

  /**
   * Handle drag update - moves the group rect and notifies via onDragUpdate.
   * Uses the cumulative diff from drag start so that snapPosition always operates
   * on the absolute target position (avoids error accumulation from per-frame deltas).
   * onDragUpdate is called only when the position actually changes.
   */
  public override handleDrag(diff: DragDiff, _context: DragContext): void {
    if (!this.dragStartRect || !this.lastSnappedPos) {
      return;
    }

    const { x: newX, y: newY } = this.snapPosition(
      this.dragStartRect.x + diff.diffX,
      this.dragStartRect.y + diff.diffY
    );

    const deltaX = newX - this.lastSnappedPos.x;
    const deltaY = newY - this.lastSnappedPos.y;
    this.lastSnappedPos = { x: newX, y: newY };

    const rect = {
      x: newX,
      y: newY,
      width: this.state.rect.width,
      height: this.state.rect.height,
    };
    this.setState({ rect });
    this.updateHitBox(rect);

    if (deltaX !== 0 || deltaY !== 0) {
      this.props.onDragUpdate(this.props.id, { deltaX, deltaY });
    }
  }

  /**
   * Handle drag end - clears isDragging flag and drag tracking state.
   * Subclasses that override this method should call super.handleDragEnd() to preserve this behavior.
   */
  public override handleDragEnd(_context: DragContext): void {
    this.isDragging = false;
    this.dragStartRect = null;
    this.lastSnappedPos = null;
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
    this.groupState.setViewComponent(this);
    return this.subscribeSignal(this.groupState.$state, (group) => {
      if (!group) {
        return;
      }
      if (this.isDragging) {
        // Suppress rect update during drag to prevent the block bounding-box signal chain
        // from overwriting the position set by handleDrag / subclass snapping logic.
        // Use getState() instead of this.state to get the pending nextState (which includes
        // the rect set by handleDrag in the same frame), preventing it from being overwritten
        // with the stale this.state.rect.
        const { rect: _rect, ...groupWithoutRect } = group;
        this.setState({
          ...this.getState(),
          ...groupWithoutRect,
        } as T);
      } else {
        this.setState({
          ...this.state,
          ...group,
        } as T);
        // Inner blocks-area rect; updateHitBox applies geometry padding via getRect().
        this.updateHitBox(group.rect);
      }
    });
  }

  protected unmount(): void {
    this.groupState.setViewComponent(undefined);
    super.unmount();
  }

  protected updateHitBox(rect: TRect): void {
    const hitArea = this.getRect(rect);
    this.setHitBox(hitArea.x, hitArea.y, hitArea.x + hitArea.width, hitArea.y + hitArea.height);
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
