import { BlockState } from "../../../../store/block/Block";
import { GroupState } from "../../../../store/group/Group";
import { TRect } from "../../../../utils/types/shapes";

/** Context provided to every CollapseShiftStrategy call. */
export interface TShiftStrategyContext {
  /** IDs of blocks that belong to the collapsing group (they are already hidden). */
  groupBlockIds: Set<string | number>;
  /** All blocks currently in the graph. */
  allBlocks: readonly BlockState[];
  /** Look up another group's registered state by its id (may return undefined). */
  getGroupState: (id: string) => GroupState | undefined;
}

/**
 * Pluggable algorithm for shifting outer blocks when a CollapsibleGroup
 * collapses or expands.
 *
 * Built-in implementations:
 *   - {@link DirectionalShiftStrategy} (default) — fixed delta per side
 *   - {@link CompactLayoutStrategy} — gap-preserving compaction
 *   - {@link ScanlineCompactionStrategy} — global void-removal compaction
 *   - {@link ConstraintLayoutStrategy} — DAG-based, fully reversible
 *
 * Pass an instance via `TCollapsibleGroup.shiftStrategy` to activate.
 */
export abstract class CollapseShiftStrategy {
  /**
   * Called when the group collapses to shift outer blocks inward.
   *
   * @param referenceRect  Full group rect (collapse) or collapsed rect (expand).
   * @param ax             X direction factor: 0=start, 0.5=center, 1=end.
   * @param ay             Y direction factor: 0=start, 0.5=center, 1=end.
   * @param deltaX         Freed X space: >0 on collapse, <0 on expand.
   * @param deltaY         Freed Y space: >0 on collapse, <0 on expand.
   * @param ctx            Provides access to blocks and groups in the graph.
   */
  public abstract shiftOuterComponents(
    referenceRect: TRect,
    ax: number,
    ay: number,
    deltaX: number,
    deltaY: number,
    ctx: TShiftStrategyContext
  ): void;

  /**
   * Called when the group expands to restore outer blocks to their original
   * positions. The default implementation returns `false`, which causes
   * `CollapsibleGroup.expand()` to fall back to the snapshot/directional
   * approach.
   *
   * Strategies that track their own state (e.g. {@link ConstraintLayoutStrategy})
   * should override this to return `true` after updating block positions,
   * signalling that the snapshot restore should be skipped.
   *
   * @param collapsedRect  Current (collapsed) group rect.
   * @param ax             X direction factor.
   * @param ay             Y direction factor.
   * @param deltaX         Negative: space being restored (expand).
   * @param deltaY         Negative: space being restored (expand).
   * @param ctx            Provides access to blocks and groups in the graph.
   * @returns `true` if the strategy handled the restore, `false` to use snapshot.
   */
  public expandOuterComponents(
    _collapsedRect: TRect,
    _ax: number,
    _ay: number,
    _deltaX: number,
    _deltaY: number,
    _ctx: TShiftStrategyContext
  ): boolean {
    return false;
  }
}
