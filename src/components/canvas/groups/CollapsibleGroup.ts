import { batch } from "@preact/signals-core";

import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState } from "../../../store/block/Block";
import { getBlocksRect } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";

import { TGroup } from "../../../store/group/Group";

import { BlockGroups } from "./BlockGroups";
import { Group, TGroupProps } from "./Group";
import {
  CollapseShiftStrategy,
  ConstraintLayoutStrategy,
  DirectionalShiftStrategy,
  TShiftStrategyContext,
} from "./strategies";

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

/** A single collapse direction axis value. */
export type TCollapseDirection = "start" | "center" | "end";

// ---------------------------------------------------------------------------
// TCollapsibleGroup interface
// ---------------------------------------------------------------------------

export interface TCollapsibleGroup extends TGroup {
  /** Whether this group is currently collapsed */
  collapsed?: boolean;
  /**
   * The rect used when collapsed, stored so expand() can compute the reverse
   * shift even after a page reload with collapsed: true.
   */
  collapsedRect?: TRect;
  /**
   * The full rect before collapsing (including any padding around blocks).
   * Stored on collapse so expand() can restore the exact original rect rather
   * than recomputing a tight bounding box from block positions.
   */
  expandedRect?: TRect;
  /**
   * Positions of all outer blocks (not members of this group) captured before
   * the collapse shift. Used by expand() to restore positions exactly, since
   * pure positional reconstruction is ambiguous after blocks move inward.
   */
  expandedOuterPositions?: Record<string, { x: number; y: number }>;
  /**
   * Where the collapsed header appears relative to the full group rect.
   *
   * - `x`: `"start"` → left edge  |  `"center"` → centered  |  `"end"` → right edge
   * - `y`: `"start"` → top edge   |  `"center"` → centered  |  `"end"` → bottom edge
   *
   * Defaults to `{ x: "start", y: "start" }` (top-left corner).
   */
  collapseDirection?: { x?: TCollapseDirection; y?: TCollapseDirection };
  /**
   * Strategy instance controlling how outer blocks shift on collapse/expand.
   * Defaults to {@link DirectionalShiftStrategy}.
   *
   * Pass a pre-configured instance so strategies with constructor parameters
   * (e.g. {@link ScanlineCompactionStrategy}) can be tuned per group.
   *
   * @example
   * ```typescript
   * const group: TCollapsibleGroup = {
   *   id: "my-group",
   *   // ...
   *   shiftStrategy: new CompactLayoutStrategy(),
   *   // or:
   *   shiftStrategy: new ConstraintLayoutStrategy(),
   * };
   * ```
   */
  shiftStrategy?: CollapseShiftStrategy;
}

const DEFAULT_COLLAPSED_WIDTH = 200;
const DEFAULT_COLLAPSED_HEIGHT = 48;

const DIRECTION_FACTOR: Record<TCollapseDirection, number> = { start: 0, center: 0.5, end: 1 };

/**
 * A Group component that supports collapsing and expanding.
 *
 * When collapsed:
 * - All blocks in the group are hidden (not deleted from the store)
 * - Connection ports of hidden blocks are redirected to the group edges
 * - The group rect shrinks to a compact header, pinned at the configured direction
 * - Outer blocks shift inward to fill the freed space
 *
 * When expanded, all of the above is reversed.
 *
 * Toggle collapse/expand by double-clicking the group.
 *
 * ### Collapse direction
 *
 * Set `collapseDirection` on the TCollapsibleGroup data to control where the
 * shrunken header appears relative to the full group rect:
 *
 * ```
 *  collapseDirection.x: "start"  → header at left edge   (freed space on the right)
 *  collapseDirection.x: "center" → header at center       (freed space on both sides)
 *  collapseDirection.x: "end"    → header at right edge   (freed space on the left)
 *  collapseDirection.y: "start"  → header at top edge     (freed space below)
 *  collapseDirection.y: "center" → header at center       (freed space above & below)
 *  collapseDirection.y: "end"    → header at bottom edge  (freed space above)
 * ```
 *
 * Default: `{ x: "start", y: "start" }` — top-left corner.
 *
 * ### Shift strategy
 *
 * Set `shiftStrategy` on the TCollapsibleGroup data to choose how outer blocks
 * move when the group collapses or expands:
 *
 * ```
 *  shiftStrategy: new DirectionalShiftStrategy()          (default) — fixed delta per side
 *  shiftStrategy: new CompactLayoutStrategy()                       — gap-preserving compaction
 *  shiftStrategy: new ScanlineCompactionStrategy(gap)               — global void-removal
 *  shiftStrategy: new ConstraintLayoutStrategy()                    — DAG-based, fully reversible
 * ```
 *
 * ### Usage
 * ```typescript
 * const group: TCollapsibleGroup = {
 *   id: "my-group",
 *   rect: { x: 0, y: 0, width: 0, height: 0 }, // auto-computed from blocks
 *   component: CollapsibleGroup,
 *   collapsed: false,
 *   collapseDirection: { x: "start", y: "start" },
 *   shiftStrategy: new ConstraintLayoutStrategy(),
 * };
 * ```
 * Blocks must carry `group: "my-group"` in their TBlock data.
 */
export class CollapsibleGroup<T extends TCollapsibleGroup = TCollapsibleGroup> extends Group<T> {
  private readonly shiftStrategy: CollapseShiftStrategy;

  constructor(props: TGroupProps, parent: BlockGroups) {
    super(props, parent);

    this.shiftStrategy =
      (this.groupState.$state.value as T).shiftStrategy ?? new DirectionalShiftStrategy();

    this.addEventListener("dblclick", (event: MouseEvent) => {
      event.stopPropagation();
      this.toggleCollapsed();
    });
  }

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
  // Helpers
  // ---------------------------------------------------------------------------

  private getGroupBlocks(): BlockState[] {
    return this.context.graph.rootStore.groupsList.$blockGroups.value[this.props.id] ?? [];
  }

  private toggleCollapsed(): void {
    const collapsed = (this.groupState.$state.value as T).collapsed ?? false;
    if (collapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /** Read direction factors from current state. */
  private getDirectionFactors(): { ax: number; ay: number } {
    const state = this.groupState.$state.value as T;
    return {
      ax: DIRECTION_FACTOR[state.collapseDirection?.x ?? "start"],
      ay: DIRECTION_FACTOR[state.collapseDirection?.y ?? "start"],
    };
  }

  /**
   * Compute the collapsed rect for a given full rect, respecting the configured
   * collapseDirection values.
   *
   * The direction point in the full rect maps to the same point in the
   * collapsed rect, so the "pinned" corner/edge does not move.
   */
  private computeCollapsedRect(fullRect: TRect): TRect {
    const { ax, ay } = this.getDirectionFactors();
    return {
      x: fullRect.x + ax * (fullRect.width - DEFAULT_COLLAPSED_WIDTH),
      y: fullRect.y + ay * (fullRect.height - DEFAULT_COLLAPSED_HEIGHT),
      width: DEFAULT_COLLAPSED_WIDTH,
      height: DEFAULT_COLLAPSED_HEIGHT,
    };
  }

  // ---------------------------------------------------------------------------
  // Collapse
  // ---------------------------------------------------------------------------

  public collapse(): void {
    const groupBlocks = this.getGroupBlocks();
    if (groupBlocks.length === 0) return;

    const fullRect = this.groupState.$state.value.rect;
    const collapsedRect = this.computeCollapsedRect(fullRect);
    const { ax, ay } = this.getDirectionFactors();

    // Capture outer block positions BEFORE shifting so expand() can restore
    // them exactly (positional reconstruction from post-collapse coords is ambiguous).
    const groupBlockIds = new Set(this.getGroupBlocks().map((b) => b.id));
    const expandedOuterPositions: Record<string, { x: number; y: number }> = {};
    this.context.graph.rootStore.blocksList.$blocks.value.forEach((blockState) => {
      if (!groupBlockIds.has(blockState.id)) {
        expandedOuterPositions[String(blockState.id)] = { x: blockState.x, y: blockState.y };
      }
    });

    // Prevent withBlockGrouping auto-rect from overriding the collapsed rect
    this.groupState.lockSize();

    batch(() => {
      // 1. Hide all blocks inside the group
      this.applyBlockVisibility(true);

      // 2. Redirect their ports to the collapsed group edges
      this.delegatePorts(collapsedRect);

      // 3. Shift outer components inward to fill the freed space.
      //    Reference rect = fullRect (blocks are still at pre-collapse positions).
      //    Delta is positive: group is shrinking.
      this.shiftOuterComponents(
        fullRect,
        ax,
        ay,
        fullRect.width - DEFAULT_COLLAPSED_WIDTH,
        fullRect.height - DEFAULT_COLLAPSED_HEIGHT
      );

      // 4. Shrink group rect and persist state.
      //    expandedRect stores the full rect (with any padding) so expand()
      //    can restore it exactly instead of recomputing from block positions.
      //    expandedOuterPositions stores outer block coords for exact restore.
      this.groupState.updateGroup({
        rect: collapsedRect,
        collapsed: true,
        collapsedRect: collapsedRect,
        expandedRect: fullRect,
        expandedOuterPositions,
      } as Partial<T>);
    });
  }

  // ---------------------------------------------------------------------------
  // Expand
  // ---------------------------------------------------------------------------

  public expand(): void {
    const state = this.groupState.$state.value as T;
    const groupBlocks = this.getGroupBlocks();

    // Prefer the stored full rect (preserves original padding around blocks).
    // Fall back to recomputing from block positions only if the group was
    // created with collapsed: true (no expandedRect persisted yet).
    const fullRect = state.expandedRect ?? getBlocksRect(groupBlocks.map((b) => b.asTBlock()));

    // The reference rect for position checks is the current collapsed rect —
    // outer blocks are already at shifted positions relative to it.
    const collapsedRect = state.collapsedRect ?? this.groupState.$state.value.rect;

    const { ax, ay } = this.getDirectionFactors();
    const expandedOuterPositions = state.expandedOuterPositions;

    // Re-enable withBlockGrouping auto-rect now that blocks will be visible again
    this.groupState.unlockSize();

    batch(() => {
      // 1. Restore block visibility (they resume managing their own ports)
      this.applyBlockVisibility(false);

      // 2. Restore outer block positions.
      //
      //    Priority order:
      //    a) Strategy handles it via expandOuterComponents() — fully self-
      //       contained strategies like ConstraintLayoutStrategy recompute
      //       positions from their internal DAG and return true here.
      //    b) Snapshot from collapse — exact positions captured before shifting.
      //    c) Fallback shiftOuterComponents — for groups loaded with
      //       collapsed: true where no snapshot was persisted.
      const strategyHandled = this.shiftStrategy.expandOuterComponents(
        collapsedRect,
        ax,
        ay,
        -(fullRect.width - DEFAULT_COLLAPSED_WIDTH),
        -(fullRect.height - DEFAULT_COLLAPSED_HEIGHT),
        {
          groupBlockIds: new Set(this.getGroupBlocks().map((b) => b.id)),
          allBlocks: this.context.graph.rootStore.blocksList.$blocks.value,
          getGroupState: (id) => this.context.graph.rootStore.groupsList.getGroupState(id),
        }
      );

      if (!strategyHandled) {
        if (expandedOuterPositions) {
          this.context.graph.rootStore.blocksList.$blocks.value.forEach((blockState) => {
            const saved = expandedOuterPositions[String(blockState.id)];
            if (saved) {
              blockState.updateXY(saved.x, saved.y);
            }
          });
        } else {
          // Fallback for groups that were loaded with collapsed: true (no snapshot).
          this.shiftOuterComponents(
            collapsedRect,
            ax,
            ay,
            -(fullRect.width - DEFAULT_COLLAPSED_WIDTH),
            -(fullRect.height - DEFAULT_COLLAPSED_HEIGHT)
          );
        }
      }

      // 3. Restore group rect and clear collapsed state
      this.groupState.updateGroup({
        rect: fullRect,
        collapsed: false,
        collapsedRect: undefined,
        expandedRect: undefined,
        expandedOuterPositions: undefined,
      } as Partial<T>);
    });
  }

  // ---------------------------------------------------------------------------
  // Outer component shifting
  // ---------------------------------------------------------------------------

  /**
   * Shift all outer blocks (not members of this group) toward or away from
   * the group to fill / restore the freed space on collapse / expand.
   *
   * The active {@link CollapseShiftStrategy} (set via `TCollapsibleGroup.shiftStrategy`,
   * defaults to {@link DirectionalShiftStrategy}) performs the actual work.
   *
   * Override this method in subclasses to also shift other groups or apply
   * additional custom displacement logic.
   *
   * @param referenceRect - Group rect used as the boundary for side detection:
   *   - collapse: use the full (pre-collapse) rect
   *   - expand:   use the collapsed rect (blocks are already at shifted positions)
   * @param ax - X direction factor (0 = start/left, 0.5 = center, 1 = end/right)
   * @param ay - Y direction factor (0 = start/top,  0.5 = center, 1 = end/bottom)
   * @param deltaX - Freed X space: positive on collapse, negative on expand
   * @param deltaY - Freed Y space: positive on collapse, negative on expand
   */
  protected shiftOuterComponents(referenceRect: TRect, ax: number, ay: number, deltaX: number, deltaY: number): void {
    if (deltaX === 0 && deltaY === 0) return;
    this.shiftStrategy.shiftOuterComponents(referenceRect, ax, ay, deltaX, deltaY, {
      groupBlockIds: new Set(this.getGroupBlocks().map((b) => b.id)),
      allBlocks: this.context.graph.rootStore.blocksList.$blocks.value,
      getGroupState: (id) => this.context.graph.rootStore.groupsList.getGroupState(id),
    });
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
   * current group rect when no rect is provided).
   *
   * - Input port  → left-center edge  (rect.x,           rect.y + height/2)
   * - Output port → right-center edge (rect.x + width,   rect.y + height/2)
   * - IN anchors  → left-center edge
   * - OUT anchors → right-center edge
   */
  private delegatePorts(targetRect?: TRect): void {
    const rect = targetRect ?? this.groupState.$state.value.rect;
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
