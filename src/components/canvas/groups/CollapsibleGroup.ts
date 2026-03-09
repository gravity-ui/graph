import { batch } from "@preact/signals-core";

import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState } from "../../../store/block/Block";
import { TGroup, TGroupId } from "../../../store/group/Group";
import { TRect } from "../../../utils/types/shapes";

import { Group } from "./Group";

// Re-export strategies and types so groups/index.ts can aggregate them from
// a single import without reaching into the strategies sub-directory.
export {
  CollapseShiftStrategy,
  DirectionalShiftStrategy,
  CompactLayoutStrategy,
  ScanlineCompactionStrategy,
  ConstraintLayoutStrategy,
} from "./strategies";
export type { TShiftStrategyContext } from "./strategies";

// ---------------------------------------------------------------------------
// Event declaration
// ---------------------------------------------------------------------------

declare module "../../../graphEvents" {
  interface GraphEventsDefinitions {
    "group-collapse-change": (
      event: CustomEvent<{
        groupId: TGroupId;
        collapsed: boolean;
        currentRect: TRect;
        nextRect: TRect;
      }>
    ) => void;
  }
}

/** A single collapse direction axis value. */
export type TCollapseDirection = "start" | "center" | "end";

// ---------------------------------------------------------------------------
// TCollapsibleGroup interface
// ---------------------------------------------------------------------------

export interface TCollapsibleGroup extends TGroup {
  /** Whether this group is currently collapsed */
  collapsed?: boolean;
  /**
   * The visual rect used when collapsed. When set, the group renders and
   * responds to hit-tests using this rect instead of the normal `rect`.
   *
   * `rect` itself continues to be managed by `withBlockGrouping` (or
   * manually) and always reflects the real block bounding box.
   */
  collapsedRect?: TRect;
  /**
   * Where the collapsed header appears relative to the full group rect.
   *
   * - `x`: `"start"` → left edge  |  `"center"` → centered  |  `"end"` → right edge
   * - `y`: `"start"` → top edge   |  `"center"` → centered  |  `"end"` → bottom edge
   *
   * Defaults to `{ x: "start", y: "start" }` (top-left corner).
   *
   * Only used by the default collapse rect computation. Ignored when
   * {@link getCollapseRect} is provided.
   */
  collapseDirection?: { x?: TCollapseDirection; y?: TCollapseDirection };
  /**
   * User-defined function to compute the collapsed rect from the expanded rect.
   *
   * When not provided, a default implementation computes a
   * {@link DEFAULT_COLLAPSED_WIDTH}×{@link DEFAULT_COLLAPSED_HEIGHT} rect
   * pinned at the position determined by {@link collapseDirection}.
   *
   * @example
   * ```typescript
   * const group: TCollapsibleGroup = {
   *   id: "my-group",
   *   rect: { x: 0, y: 0, width: 400, height: 300 },
   *   component: CollapsibleGroup,
   *   getCollapseRect: (_group, rect) => ({
   *     x: rect.x + rect.width / 2 - 100,
   *     y: rect.y,
   *     width: 200,
   *     height: 48,
   *   }),
   * };
   * ```
   */
  getCollapseRect?: (group: TCollapsibleGroup, expandedRect: TRect) => TRect;
}

const DEFAULT_COLLAPSED_WIDTH = 200;
const DEFAULT_COLLAPSED_HEIGHT = 48;

const DIRECTION_FACTOR: Record<TCollapseDirection, number> = { start: 0, center: 0.5, end: 1 };

/**
 * Default collapse rect computation. Produces a rect of the given size
 * pinned at the position determined by `direction`.
 *
 * Exported so users can call it from their custom `getCollapseRect` and
 * extend or modify the default behavior.
 *
 * @param expandedRect - The full group rect before collapsing.
 * @param direction - Where the header is pinned (defaults to top-left).
 * @param collapsedWidth - Header width (defaults to 200).
 * @param collapsedHeight - Header height (defaults to 48).
 */
export function computeDefaultCollapseRect(
  expandedRect: TRect,
  direction?: { x?: TCollapseDirection; y?: TCollapseDirection },
  collapsedWidth?: number,
  collapsedHeight?: number
): TRect {
  const w = collapsedWidth ?? DEFAULT_COLLAPSED_WIDTH;
  const h = collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT;
  const ax = DIRECTION_FACTOR[direction?.x ?? "start"];
  const ay = DIRECTION_FACTOR[direction?.y ?? "start"];
  return {
    x: expandedRect.x + ax * (expandedRect.width - w),
    y: expandedRect.y + ay * (expandedRect.height - h),
    width: w,
    height: h,
  };
}

/**
 * A Group component that supports collapsing and expanding.
 *
 * When collapsed:
 * - All blocks in the group are hidden (not deleted from the store)
 * - Connection ports of hidden blocks are redirected to the group edges
 * - The group renders as a compact header using `collapsedRect`
 * - The real `rect` (block bounding box) is NOT locked — `withBlockGrouping`
 *   continues to track block positions normally
 *
 * When expanded, all of the above is reversed.
 *
 * Collapse/expand is triggered programmatically via {@link collapse} and
 * {@link expand}. There is no built-in UI trigger — subscribe to graph
 * events (e.g. `dblclick`) and call these methods from your handler.
 *
 * A cancelable `group-collapse-change` event is emitted before each
 * transition. Call `event.preventDefault()` to cancel the operation.
 *
 * ### Collapse rect
 *
 * Provide `getCollapseRect` on the TCollapsibleGroup data to control
 * where the group collapses to. If not provided, the default
 * implementation uses `collapseDirection` to pin a 200×48 header.
 *
 * ### Usage
 * ```typescript
 * const group: TCollapsibleGroup = {
 *   id: "my-group",
 *   rect: { x: 0, y: 0, width: 0, height: 0 },
 *   component: CollapsibleGroup,
 *   collapsed: false,
 *   collapseDirection: { x: "start", y: "start" },
 * };
 * ```
 *
 * Blocks must carry `group: "my-group"` in their TBlock data.
 */
export class CollapsibleGroup<T extends TCollapsibleGroup = TCollapsibleGroup> extends Group<T> {
  /**
   * Extend base subscription to also react to collapsed state on init.
   * subscribeSignal fires immediately with the current value, so a group
   * that starts with collapsed: true will hide its blocks on mount.
   */
  protected override subscribeToGroup(): ReturnType<Group["subscribeToGroup"]> {
    const unsub = super.subscribeToGroup();

    this.subscribeSignal(this.groupState.$state, (group: T) => {
      if (group.collapsed) {
        this.applyBlockVisibility(true);
        this.delegatePorts();
      }
    });

    return unsub;
  }

  // ---------------------------------------------------------------------------
  // Overrides — use collapsedRect for rendering and hit-testing when collapsed
  // ---------------------------------------------------------------------------

  /**
   * Returns the visual rect. When collapsed, returns `collapsedRect`
   * (with padding) so the group renders as a compact header.
   */
  protected override getRect(rect?: TRect): TRect {
    const state = this.getState() as T;
    if (state.collapsed && state.collapsedRect) {
      return super.getRect(state.collapsedRect);
    }
    return super.getRect(rect);
  }

  /**
   * Sets the hitbox from collapsedRect when collapsed.
   */
  protected override updateHitBox(rect: TRect): void {
    super.updateHitBox(this.getRect(rect));
  }

  /**
   * When dragging a collapsed group, also move the collapsedRect.
   */
  public override handleDrag(
    diff: import("../../../services/drag").DragDiff,
    context: import("../../../services/drag").DragContext
  ): void {
    const state = this.state as T;
    if (state.collapsed && state.collapsedRect) {
      // Update collapsedRect in the store so it persists
      this.groupState.updateGroup({
        collapsedRect: {
          x: state.collapsedRect.x + diff.deltaX,
          y: state.collapsedRect.y + diff.deltaY,
          width: state.collapsedRect.width,
          height: state.collapsedRect.height,
        },
      } as Partial<T>);
    }
    // Let base Group handle the rest (update rect, hitbox, onDragUpdate)
    super.handleDrag(diff, context);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Whether this group is currently in the collapsed state. */
  public isCollapsed(): boolean {
    return (this.groupState.$state.value as T).collapsed ?? false;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getGroupBlocks(): BlockState[] {
    return this.context.graph.rootStore.groupsList.$blockGroups.value[this.props.id] ?? [];
  }

  /**
   * Compute the collapsed rect for a given full rect.
   *
   * Uses the user-provided `getCollapseRect` if available, otherwise falls
   * back to the direction-based default.
   */
  private computeCollapsedRect(fullRect: TRect): TRect {
    const state = this.groupState.$state.value as T;
    if (state.getCollapseRect) {
      return state.getCollapseRect(state, fullRect);
    }
    return computeDefaultCollapseRect(fullRect, state.collapseDirection);
  }

  // ---------------------------------------------------------------------------
  // Collapse
  // ---------------------------------------------------------------------------

  /**
   * Collapse the group: set collapsedRect, hide member blocks,
   * and redirect their ports to the group edges.
   *
   * Emits a cancelable `group-collapse-change` event before applying changes.
   * If a listener calls `event.preventDefault()`, the collapse is cancelled.
   */
  public collapse(): void {
    const currentRect = this.groupState.$state.value.rect;
    const nextRect = this.computeCollapsedRect(currentRect);

    this.context.graph.executеDefaultEventAction(
      "group-collapse-change",
      {
        groupId: this.props.id as TGroupId,
        collapsed: true,
        currentRect,
        nextRect,
      },
      () => {
        batch(() => {
          this.applyBlockVisibility(true);
          this.delegatePorts(nextRect);
          this.groupState.updateGroup({
            collapsed: true,
            collapsedRect: nextRect,
          } as Partial<T>);
        });

        // Explicitly update hitbox to the collapsed rect.
        this.updateHitBox(nextRect);
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Expand
  // ---------------------------------------------------------------------------

  /**
   * Expand the group: remove collapsedRect, show member blocks, and let
   * them resume managing their own ports.
   *
   * Emits a cancelable `group-collapse-change` event before applying changes.
   * If a listener calls `event.preventDefault()`, the expand is cancelled.
   */
  public expand(): void {
    const state = this.groupState.$state.value as T;
    const currentRect = state.collapsedRect ?? state.rect;
    const nextRect = state.rect;

    this.context.graph.executеDefaultEventAction(
      "group-collapse-change",
      {
        groupId: this.props.id as TGroupId,
        collapsed: false,
        currentRect,
        nextRect,
      },
      () => {
        batch(() => {
          this.applyBlockVisibility(false);
          this.groupState.updateGroup({
            collapsed: false,
            collapsedRect: undefined,
          } as Partial<T>);
        });

        // Explicitly update hitbox to the full rect. The signal
        // subscription also calls updateHitBox, but our override
        // may see stale `this.state.collapsed` during the batch.
        this.updateHitBox(this.groupState.$state.value.rect);
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Block visibility
  // ---------------------------------------------------------------------------

  private applyBlockVisibility(hidden: boolean): void {
    this.getGroupBlocks().forEach((blockState) => {
      blockState.requestHidden(hidden);
    });
  }

  // ---------------------------------------------------------------------------
  // Port delegation
  // ---------------------------------------------------------------------------

  /**
   * Redirect all ports of group blocks to the edges of targetRect (or the
   * current collapsedRect / group rect when no rect is provided).
   *
   * - Input port  → left-center edge  (rect.x,           rect.y + height/2)
   * - Output port → right-center edge (rect.x + width,   rect.y + height/2)
   * - IN anchors  → left-center edge
   * - OUT anchors → right-center edge
   */
  private delegatePorts(targetRect?: TRect): void {
    const state = this.groupState.$state.value as T;
    const rect = this.getRect(targetRect); //targetRect ?? state.collapsedRect ?? state.rect;
    const leftX = rect.x;
    const rightX = rect.x + rect.width;
    const midY = rect.y + rect.height / 2;

    this.getGroupBlocks().forEach((blockState) => {
      const canvasBlock = blockState.getViewComponent();
      if (!canvasBlock) return;

      canvasBlock.getInputPort()?.setPoint(leftX, midY);
      canvasBlock.getOutputPort()?.setPoint(rightX, midY);

      blockState.$anchors.value.forEach((anchor) => {
        const x = anchor.type === EAnchorType.OUT ? rightX : leftX;
        canvasBlock.getAnchorPort(anchor.id)?.setPoint(x, midY);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  protected override render(): void {
    const collapsed = (this.state as T).collapsed ?? false;
    if (collapsed) {
      this.renderCollapsedView(this.context.ctx);
    } else {
      super.render();
    }
  }

  /**
   * Render the compact header shown when the group is collapsed.
   * Override this method to customise the collapsed appearance.
   */
  protected renderCollapsedView(ctx: CanvasRenderingContext2D): void {
    const rect = this.getRect();

    if (this.isHighlighted()) {
      ctx.strokeStyle = this.style.highlightedBorder;
      ctx.fillStyle = this.style.highlightedBackground;
    } else if (this.state.selected) {
      ctx.strokeStyle = this.style.selectedBorder;
      ctx.fillStyle = this.style.selectedBackground;
    } else {
      ctx.strokeStyle = this.style.border;
      ctx.fillStyle = this.style.background;
    }

    ctx.lineWidth = this.style.borderWidth;

    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();

    // Label with collapse indicator
    const label = `[−] ${String(this.props.id)}`;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width - 16);
  }
}
