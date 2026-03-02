import { batch } from "@preact/signals-core";

import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState } from "../../../store/block/Block";
import { TGroup } from "../../../store/group/Group";
import { getBlocksRect } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";

import { BlockGroups } from "./BlockGroups";
import { Group, TGroupProps } from "./Group";

/** Horizontal anchor: which X-axis point of the full rect stays fixed during collapse. */
export type TCollapseAnchorX = "left" | "center" | "right";

/** Vertical anchor: which Y-axis point of the full rect stays fixed during collapse. */
export type TCollapseAnchorY = "top" | "center" | "bottom";

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
   * Horizontal anchor point for collapse (default: "left").
   * "left"   → top-left corner is pinned (freed space is to the right)
   * "center" → group shrinks symmetrically from both sides
   * "right"  → top-right corner is pinned (freed space is to the left)
   */
  collapseAnchorX?: TCollapseAnchorX;
  /**
   * Vertical anchor point for collapse (default: "top").
   * "top"    → top edge is pinned (freed space is below)
   * "center" → group shrinks symmetrically from both sides
   * "bottom" → bottom edge is pinned (freed space is above)
   */
  collapseAnchorY?: TCollapseAnchorY;
}

const DEFAULT_COLLAPSED_WIDTH = 200;
const DEFAULT_COLLAPSED_HEIGHT = 48;

const ANCHOR_X_FACTOR: Record<TCollapseAnchorX, number> = { left: 0, center: 0.5, right: 1 };
const ANCHOR_Y_FACTOR: Record<TCollapseAnchorY, number> = { top: 0, center: 0.5, bottom: 1 };

/**
 * A Group component that supports collapsing and expanding.
 *
 * When collapsed:
 * - All blocks in the group are hidden (not deleted from the store)
 * - Connection ports of hidden blocks are redirected to the group edges
 * - The group rect shrinks to a compact header, pinned at the configured anchor
 * - Surrounding blocks shift inward to fill the freed space
 *
 * When expanded, all of the above is reversed.
 *
 * Toggle collapse/expand by double-clicking the group.
 *
 * ### Collapse anchor
 *
 * Set `collapseAnchorX` / `collapseAnchorY` on the TCollapsibleGroup data to
 * control where the shrunken header appears:
 *
 * ```
 *  collapseAnchorX: "left"   → header at left edge   (freed space on the right)
 *  collapseAnchorX: "center" → header at center       (freed space on both sides)
 *  collapseAnchorX: "right"  → header at right edge   (freed space on the left)
 *  collapseAnchorY: "top"    → header at top edge     (freed space below)
 *  collapseAnchorY: "center" → header at center       (freed space above & below)
 *  collapseAnchorY: "bottom" → header at bottom edge  (freed space above)
 * ```
 *
 * Default: `"left"` / `"top"` — same as the original behaviour.
 *
 * ### Usage
 * ```typescript
 * const group: TCollapsibleGroup = {
 *   id: "my-group",
 *   rect: { x: 0, y: 0, width: 0, height: 0 }, // auto-computed from blocks
 *   component: CollapsibleGroup,
 *   collapsed: false,
 *   collapseAnchorX: "left",
 *   collapseAnchorY: "top",
 * };
 * ```
 * Blocks must carry `group: "my-group"` in their TBlock data.
 */
export class CollapsibleGroup<T extends TCollapsibleGroup = TCollapsibleGroup> extends Group<T> {
  constructor(props: TGroupProps, parent: BlockGroups) {
    super(props, parent);

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

  /**
   * Compute the collapsed rect for a given full rect, respecting the configured
   * collapseAnchorX / collapseAnchorY values.
   *
   * The anchor point in the full rect is mapped to the same anchor point in
   * the collapsed rect, so the "pinned" corner/edge does not move.
   */
  private computeCollapsedRect(fullRect: TRect): TRect {
    const state = this.groupState.$state.value as T;
    const ax = ANCHOR_X_FACTOR[state.collapseAnchorX ?? "left"];
    const ay = ANCHOR_Y_FACTOR[state.collapseAnchorY ?? "top"];
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

    // Prevent withBlockGrouping auto-rect from overriding the collapsed rect
    this.groupState.lockSize();

    batch(() => {
      // 1. Hide all blocks inside the group
      this.applyBlockVisibility(true);

      // 2. Redirect their ports to the collapsed group edges
      this.delegatePorts(collapsedRect);

      // 3. Shrink group rect and persist state.
      //    expandedRect stores the full rect (with any padding) so expand()
      //    can restore it exactly instead of recomputing from block positions.
      this.groupState.updateGroup({
        rect: collapsedRect,
        collapsed: true,
        collapsedRect: collapsedRect,
        expandedRect: fullRect,
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
    const fullRect =
      state.expandedRect ?? getBlocksRect(groupBlocks.map((b) => b.asTBlock()));

    // Re-enable withBlockGrouping auto-rect now that blocks will be visible again
    this.groupState.unlockSize();

    batch(() => {
      // 1. Restore block visibility (they resume managing their own ports)
      this.applyBlockVisibility(false);

      // 2. Restore group rect and clear collapsed state
      this.groupState.updateGroup({
        rect: fullRect,
        collapsed: false,
        collapsedRect: undefined,
        expandedRect: undefined,
      } as Partial<T>);
    });
  }

  // ---------------------------------------------------------------------------
  // Block shifting (reserved for future implementation)
  // ---------------------------------------------------------------------------

  // TODO: implement shiftOuterBlocks — shift surrounding blocks and groups
  // inward on collapse and outward on expand.

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
