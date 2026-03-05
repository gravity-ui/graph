import { batch } from "@preact/signals-core";

import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState } from "../../../store/block/Block";
import { GroupState, TGroup } from "../../../store/group/Group";
import { getBlocksRect } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";

import { BlockGroups } from "./BlockGroups";
import { Group, TGroupProps } from "./Group";

/** A single collapse direction axis value. */
export type TCollapseDirection = "start" | "center" | "end";

// ---------------------------------------------------------------------------
// Shift strategy API
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers shared by both strategies
// ---------------------------------------------------------------------------

/**
 * Partition outer blocks into ungrouped and grouped-by-their-group-id.
 * Blocks that belong to the collapsing group are excluded.
 */
function partitionOuterBlocks(
  allBlocks: readonly BlockState[],
  groupBlockIds: Set<string | number>
): { ungrouped: BlockState[]; byGroup: Map<string, BlockState[]> } {
  const ungrouped: BlockState[] = [];
  const byGroup = new Map<string, BlockState[]>();

  allBlocks.forEach((blockState) => {
    if (groupBlockIds.has(blockState.id)) return;

    const outerGroupId = blockState.$state.value.group;
    if (outerGroupId) {
      const existing = byGroup.get(outerGroupId);
      if (existing) {
        existing.push(blockState);
      } else {
        byGroup.set(outerGroupId, [blockState]);
      }
    } else {
      ungrouped.push(blockState);
    }
  });

  return { ungrouped, byGroup };
}

/**
 * Compute the bounds of an outer group, using its registered GroupState rect
 * when available and falling back to a bounding box over its blocks otherwise.
 */
function outerGroupBounds(
  blocks: BlockState[],
  outerGroupId: string,
  getGroupState: (id: string) => GroupState | undefined
): { gx: number; gy: number; gxMax: number; gyMax: number } {
  const outerGroupState = getGroupState(outerGroupId);
  if (outerGroupState) {
    const rect = outerGroupState.$state.value.rect;
    return { gx: rect.x, gy: rect.y, gxMax: rect.x + rect.width, gyMax: rect.y + rect.height };
  }
  return {
    gx: Math.min(...blocks.map((b) => b.x)),
    gxMax: Math.max(...blocks.map((b) => b.x + b.width)),
    gy: Math.min(...blocks.map((b) => b.y)),
    gyMax: Math.max(...blocks.map((b) => b.y + b.height)),
  };
}

// ---------------------------------------------------------------------------
// DirectionalShiftStrategy
// ---------------------------------------------------------------------------

/**
 * Compute how much a component at `center` should shift along one axis.
 *
 * Components LEFT/ABOVE the group  → shift  +factor * delta  (move toward group)
 * Components RIGHT/BELOW the group → shift -(1-factor) * delta  (move toward group)
 * Components overlapping the group → no shift
 */
function computeAxisShift(center: number, refMin: number, refMax: number, factor: number, delta: number): number {
  if (center < refMin) return factor * delta;
  if (center > refMax) return -(1 - factor) * delta;
  return 0;
}

/**
 * Default shift strategy: moves each outer block (or group-as-unit) by a fixed
 * delta along each axis based on which side of the collapsing group it occupies.
 *
 * A block shifts along axis A only when its extent in axis B overlaps the
 * group's extent in axis B (perpendicular-overlap guard), preventing
 * diagonally-positioned blocks from drifting into adjacent groups.
 */
export class DirectionalShiftStrategy extends CollapseShiftStrategy {
  public override shiftOuterComponents(
    referenceRect: TRect,
    ax: number,
    ay: number,
    deltaX: number,
    deltaY: number,
    { groupBlockIds, allBlocks, getGroupState }: TShiftStrategyContext
  ): void {
    const { x: rx, y: ry } = referenceRect;
    const rxMax = rx + referenceRect.width;
    const ryMax = ry + referenceRect.height;

    const { ungrouped, byGroup } = partitionOuterBlocks(allBlocks, groupBlockIds);

    ungrouped.forEach((blockState) => {
      const bxMax = blockState.x + blockState.width;
      const byMax = blockState.y + blockState.height;
      const cx = (blockState.x + bxMax) / 2;
      const cy = (blockState.y + byMax) / 2;

      const yOverlap = byMax > ry && blockState.y < ryMax;
      const xOverlap = bxMax > rx && blockState.x < rxMax;

      const shiftX = yOverlap ? computeAxisShift(cx, rx, rxMax, ax, deltaX) : 0;
      const shiftY = xOverlap ? computeAxisShift(cy, ry, ryMax, ay, deltaY) : 0;
      if (shiftX !== 0 || shiftY !== 0) {
        blockState.updateXY(blockState.x + shiftX, blockState.y + shiftY);
      }
    });

    byGroup.forEach((blocks, outerGroupId) => {
      const { gx, gy, gxMax, gyMax } = outerGroupBounds(blocks, outerGroupId, getGroupState);
      const cx = (gx + gxMax) / 2;
      const cy = (gy + gyMax) / 2;

      const yOverlap = gyMax > ry && gy < ryMax;
      const xOverlap = gxMax > rx && gx < rxMax;

      const shiftX = yOverlap ? computeAxisShift(cx, rx, rxMax, ax, deltaX) : 0;
      const shiftY = xOverlap ? computeAxisShift(cy, ry, ryMax, ay, deltaY) : 0;
      if (shiftX !== 0 || shiftY !== 0) {
        blocks.forEach((blockState) => {
          blockState.updateXY(blockState.x + shiftX, blockState.y + shiftY);
        });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// CompactLayoutStrategy
// ---------------------------------------------------------------------------

/** Describes either a single ungrouped block or a group treated as a unit. */
interface TCompactItem {
  /** Left edge of the item's bounding box. */
  x: number;
  /** Top edge of the item's bounding box. */
  y: number;
  /** Right edge of the item's bounding box. */
  xMax: number;
  /** Bottom edge of the item's bounding box. */
  yMax: number;
  /** Apply a displacement to all blocks covered by this item. */
  applyShift: (dx: number, dy: number) => void;
}

/**
 * Gap-preserving compaction strategy.
 *
 * Instead of applying the same fixed delta to every block on a given side,
 * this strategy sorts the items by their position and packs them from the
 * collapsed header edge outward, preserving the original gap each item had
 * relative to the nearest group edge (and the gaps between consecutive items).
 *
 * For a single item per side the result is identical to DirectionalShiftStrategy.
 * The difference emerges when multiple items stand in a chain: compaction keeps
 * every inter-item gap intact regardless of whether the gaps are uniform.
 */
export class CompactLayoutStrategy extends CollapseShiftStrategy {
  public override shiftOuterComponents(
    referenceRect: TRect,
    ax: number,
    ay: number,
    deltaX: number,
    deltaY: number,
    { groupBlockIds, allBlocks, getGroupState }: TShiftStrategyContext
  ): void {
    const { x: rx, y: ry } = referenceRect;
    const rxMax = rx + referenceRect.width;
    const ryMax = ry + referenceRect.height;

    const { ungrouped, byGroup } = partitionOuterBlocks(allBlocks, groupBlockIds);

    // Build items list — one item per ungrouped block, one item per outer group.
    const items: TCompactItem[] = [];

    ungrouped.forEach((blockState) => {
      items.push({
        x: blockState.x,
        y: blockState.y,
        xMax: blockState.x + blockState.width,
        yMax: blockState.y + blockState.height,
        applyShift: (dx, dy) => {
          if (dx !== 0 || dy !== 0) blockState.updateXY(blockState.x + dx, blockState.y + dy);
        },
      });
    });

    byGroup.forEach((blocks, outerGroupId) => {
      const { gx, gy, gxMax, gyMax } = outerGroupBounds(blocks, outerGroupId, getGroupState);
      items.push({
        x: gx,
        y: gy,
        xMax: gxMax,
        yMax: gyMax,
        applyShift: (dx, dy) => {
          if (dx !== 0 || dy !== 0) {
            blocks.forEach((b) => b.updateXY(b.x + dx, b.y + dy));
          }
        },
      });
    });

    // Compact along X for items whose Y extent overlaps the freed Y band.
    if (deltaX !== 0) {
      const headerLeft = rx + ax * deltaX;
      const headerRight = rxMax - (1 - ax) * deltaX;

      // LEFT items: pack right-to-left from headerLeft, preserving gap to groupLeft.
      const leftItems = items
        .filter((item) => item.yMax > ry && item.y < ryMax && item.xMax <= rx)
        .sort((a, b) => b.x - a.x); // descending: closest to group first

      let cursor = headerLeft;
      leftItems.forEach((item) => {
        const gap = rx - item.xMax; // original gap from item's right edge to group's left edge
        const newXMax = cursor - gap;
        const dx = newXMax - item.xMax;
        item.applyShift(dx, 0);
        cursor = newXMax - (item.xMax - item.x); // move cursor to new item.x
      });

      // RIGHT items: pack left-to-right from headerRight, preserving gap to groupRight.
      const rightItems = items
        .filter((item) => item.yMax > ry && item.y < ryMax && item.x >= rxMax)
        .sort((a, b) => a.x - b.x); // ascending: closest to group first

      cursor = headerRight;
      rightItems.forEach((item) => {
        const gap = item.x - rxMax; // original gap from group's right edge to item's left edge
        const newX = cursor + gap;
        const dx = newX - item.x;
        item.applyShift(dx, 0);
        cursor = newX + (item.xMax - item.x); // move cursor to new item.xMax
      });
    }

    // Compact along Y for items whose X extent overlaps the freed X band.
    if (deltaY !== 0) {
      const headerTop = ry + ay * deltaY;
      const headerBottom = ryMax - (1 - ay) * deltaY;

      // TOP items: pack bottom-to-top from headerTop, preserving gap to groupTop.
      const topItems = items
        .filter((item) => item.xMax > rx && item.x < rxMax && item.yMax <= ry)
        .sort((a, b) => b.y - a.y); // descending: closest to group first

      let cursor = headerTop;
      topItems.forEach((item) => {
        const gap = ry - item.yMax;
        const newYMax = cursor - gap;
        const dy = newYMax - item.yMax;
        item.applyShift(0, dy);
        cursor = newYMax - (item.yMax - item.y);
      });

      // BOTTOM items: pack top-to-bottom from headerBottom, preserving gap to groupBottom.
      const bottomItems = items
        .filter((item) => item.xMax > rx && item.x < rxMax && item.y >= ryMax)
        .sort((a, b) => a.y - b.y); // ascending: closest to group first

      cursor = headerBottom;
      bottomItems.forEach((item) => {
        const gap = item.y - ryMax;
        const newY = cursor + gap;
        const dy = newY - item.y;
        item.applyShift(0, dy);
        cursor = newY + (item.yMax - item.y);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// ScanlineCompactionStrategy
// ---------------------------------------------------------------------------

/** Represents an "island" of merged intervals along one axis. */
interface TScanlineIsland {
  /** Start coordinate of the merged interval. */
  start: number;
  /** End coordinate of the merged interval. */
  end: number;
  /** Indices into the items array that belong to this island. */
  itemIndices: number[];
}

/**
 * Builds sorted, merged intervals from an array of items (each with a start
 * and end along one axis) and computes how much to shift each item so that
 * the voids between islands are removed while a minimum `gap` is preserved.
 *
 * Returns a per-item shift amount (negative = move toward origin).
 *
 * @param items  Each element carries { start, end } for the axis being processed.
 * @param gap    Minimum gap to keep between adjacent islands (default 0).
 */
function computeScanlineShifts(items: ReadonlyArray<{ start: number; end: number }>, gap: number): number[] {
  if (items.length === 0) return [];

  // Sort items by start coordinate, keeping original index for result mapping.
  const indexed = items.map((item, idx) => ({ ...item, idx })).sort((a, b) => a.start - b.start);

  // Merge overlapping / adjacent intervals (within `gap` tolerance).
  const islands: TScanlineIsland[] = [];
  let cur: TScanlineIsland = { start: indexed[0].start, end: indexed[0].end, itemIndices: [indexed[0].idx] };

  for (let i = 1; i < indexed.length; i++) {
    const { start, end, idx } = indexed[i];
    if (start <= cur.end + gap) {
      // Overlapping or close enough — merge into current island.
      cur.end = Math.max(cur.end, end);
      cur.itemIndices.push(idx);
    } else {
      islands.push(cur);
      cur = { start, end, itemIndices: [idx] };
    }
  }
  islands.push(cur);

  // Compute per-island cumulative shift.
  // First island is anchored (shift = 0); subsequent islands are pulled toward it.
  const shifts = new Array<number>(items.length).fill(0);
  let cumulative = 0;

  for (let i = 1; i < islands.length; i++) {
    const prev = islands[i - 1];
    const island = islands[i];
    const actualVoid = island.start - prev.end;
    const toRemove = Math.max(0, actualVoid - gap);
    cumulative += toRemove;
    island.itemIndices.forEach((itemIdx) => {
      shifts[itemIdx] = -cumulative;
    });
  }

  return shifts;
}

/**
 * Global scanline (void-removal) compaction strategy.
 *
 * After a group collapses, this strategy projects all outer blocks onto each
 * axis, finds the empty gaps ("voids"), and shifts blocks to close those gaps —
 * similar to deleting empty rows/columns in a spreadsheet.  The result is a
 * maximally compact layout with a configurable minimum gap between islands.
 *
 * Only axes where space was actually freed (|deltaX| > 0 or |deltaY| > 0) are
 * compacted, so a purely horizontal collapse never disturbs the vertical layout.
 *
 * @example
 * ```typescript
 * // Keep at least 20px between block clusters.
 * const group: TCollapsibleGroup = {
 *   shiftStrategy: new ScanlineCompactionStrategy(20),
 *   // ...
 * };
 * ```
 */
export class ScanlineCompactionStrategy extends CollapseShiftStrategy {
  private readonly gap: number;

  constructor(gap = 10) {
    super();
    this.gap = gap;
  }

  public override shiftOuterComponents(
    _referenceRect: TRect,
    _ax: number,
    _ay: number,
    deltaX: number,
    deltaY: number,
    { groupBlockIds, allBlocks }: TShiftStrategyContext
  ): void {
    const outerBlocks = allBlocks.filter((b) => !groupBlockIds.has(b.id));
    if (outerBlocks.length === 0) return;

    // Shifts along each axis, indexed by outerBlocks position.
    const xShifts = new Array<number>(outerBlocks.length).fill(0);
    const yShifts = new Array<number>(outerBlocks.length).fill(0);

    if (deltaX !== 0) {
      const xItems = outerBlocks.map((b) => ({ start: b.x, end: b.x + b.width }));
      const computed = computeScanlineShifts(xItems, this.gap);
      computed.forEach((shift, i) => {
        xShifts[i] = shift;
      });
    }

    if (deltaY !== 0) {
      // Apply x-shifts first so y-compaction works on the updated x-positions.
      // Since we're computing before updating, derive updated x for y-pass context
      // (y-compaction only looks at y-extents, so x doesn't matter here).
      const yItems = outerBlocks.map((b) => ({ start: b.y, end: b.y + b.height }));
      const computed = computeScanlineShifts(yItems, this.gap);
      computed.forEach((shift, i) => {
        yShifts[i] = shift;
      });
    }

    outerBlocks.forEach((block, i) => {
      const dx = xShifts[i];
      const dy = yShifts[i];
      if (dx !== 0 || dy !== 0) {
        block.updateXY(block.x + dx, block.y + dy);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// ConstraintLayoutStrategy
// ---------------------------------------------------------------------------

/** Sentinel ID representing the collapsing group as a virtual DAG node. */
const CONSTRAINT_GROUP_SENTINEL = "__constraint_layout_group__";

/** Per-block position/size snapshot captured in the expanded state. */
interface TBlockConstraintSnapshot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Constraint-based (DAG) layout strategy for fully reversible collapse/expand.
 *
 * ### How it works
 *
 * On the **first collapse** the strategy captures the current spatial topology:
 * for each outer block it finds the blocks that are *directly to its left*
 * (Y-overlapping) and *directly above* it (X-overlapping) and records them as
 * its predecessors in a directed acyclic graph (DAG). The collapsing group
 * itself is added as a virtual node so downstream blocks can depend on it.
 *
 * On every subsequent collapse/expand the strategy solves a **longest-path**
 * problem on that fixed DAG, substituting the group's *current* width/height.
 * Because the skeleton never changes:
 *
 * - **Collapse** — group shrinks → downstream blocks are pulled inward
 *   automatically (vacuum fills itself).
 * - **Expand** — group grows back → downstream blocks are pushed back to their
 *   exact original positions (no snapshot required).
 *
 * ### Gap preservation
 *
 * The original spacing between every pair of connected nodes is stored as part
 * of the edge weight.  This means blocks are not compacted to a fixed minimum
 * gap — their *actual* inter-block spacing from the expanded layout is restored
 * on every expand, guaranteeing **exact reversibility**.
 *
 * @example
 * ```typescript
 * const group: TCollapsibleGroup = {
 *   id: "my-group",
 *   shiftStrategy: new ConstraintLayoutStrategy(),
 *   // ...
 * };
 * ```
 */
export class ConstraintLayoutStrategy extends CollapseShiftStrategy {
  // Predecessor lists — built once from the expanded state.
  private xPreds: Map<string | number, Array<string | number>> | null = null;
  private yPreds: Map<string | number, Array<string | number>> | null = null;

  // Per-edge original gaps: gaps.get(nodeId)?.get(predId) = original spacing.
  private xGaps: Map<string | number, Map<string | number, number>> | null = null;
  private yGaps: Map<string | number, Map<string | number, number>> | null = null;

  // Expanded-state snapshots of outer blocks.
  private snapshots: Map<string | number, TBlockConstraintSnapshot> | null = null;

  // Group's expanded rect (fixed once built).
  private groupRect: TRect | null = null;

  // Current effective group size (updated on every shiftOuterComponents call).
  private groupCurrentW = 0;
  private groupCurrentH = 0;

  // -------------------------------------------------------------------------

  private buildTopology(outerBlocks: readonly BlockState[], expandedGroupRect: TRect): void {
    this.snapshots = new Map();
    this.xPreds = new Map();
    this.yPreds = new Map();
    this.xGaps = new Map();
    this.yGaps = new Map();
    this.groupRect = { ...expandedGroupRect };
    this.groupCurrentW = expandedGroupRect.width;
    this.groupCurrentH = expandedGroupRect.height;

    for (const b of outerBlocks) {
      this.snapshots.set(b.id, { x: b.x, y: b.y, w: b.width, h: b.height });
      this.xPreds.set(b.id, []);
      this.yPreds.set(b.id, []);
      this.xGaps.set(b.id, new Map());
      this.yGaps.set(b.id, new Map());
    }

    type TNode = { id: string | number; x: number; y: number; width: number; height: number };
    const nodes: TNode[] = [
      { id: CONSTRAINT_GROUP_SENTINEL, ...expandedGroupRect },
      ...outerBlocks.map((b) => ({ id: b.id, x: b.x, y: b.y, width: b.width, height: b.height })),
    ];

    // X-DAG: sort left→right; Y-overlap required to form an edge.
    const xSorted = [...nodes].sort((a, b) => a.x - b.x);
    for (let i = 0; i < xSorted.length; i++) {
      const cur = xSorted[i];
      if (cur.id === CONSTRAINT_GROUP_SENTINEL) continue;
      for (let j = 0; j < i; j++) {
        const prev = xSorted[j];
        if (cur.y < prev.y + prev.height && cur.y + cur.height > prev.y) {
          this.xPreds.get(cur.id)!.push(prev.id);
          this.xGaps.get(cur.id)!.set(prev.id, cur.x - (prev.x + prev.width));
        }
      }
    }

    // Y-DAG: sort top→bottom; X-overlap required to form an edge.
    const ySorted = [...nodes].sort((a, b) => a.y - b.y);
    for (let i = 0; i < ySorted.length; i++) {
      const cur = ySorted[i];
      if (cur.id === CONSTRAINT_GROUP_SENTINEL) continue;
      for (let j = 0; j < i; j++) {
        const prev = ySorted[j];
        if (cur.x < prev.x + prev.width && cur.x + cur.width > prev.x) {
          this.yPreds.get(cur.id)!.push(prev.id);
          this.yGaps.get(cur.id)!.set(prev.id, cur.y - (prev.y + prev.height));
        }
      }
    }
  }

  public override shiftOuterComponents(
    referenceRect: TRect,
    _ax: number,
    _ay: number,
    deltaX: number,
    deltaY: number,
    { groupBlockIds, allBlocks }: TShiftStrategyContext
  ): void {
    const outerBlocks = allBlocks.filter((b) => !groupBlockIds.has(b.id));
    if (outerBlocks.length === 0) return;

    // Build topology lazily on the first call.
    // At that point outer blocks are still at their expanded positions and
    // referenceRect is the full (expanded) group rect.
    if (this.xPreds === null) {
      this.buildTopology(outerBlocks, referenceRect);
    }

    // referenceRect.size − delta = new group size after this operation:
    //   collapse (delta > 0): expanded − freed  = collapsed ✓
    //   expand   (delta < 0): collapsed + |delta| = expanded ✓
    if (deltaX !== 0) this.groupCurrentW = referenceRect.width - deltaX;
    if (deltaY !== 0) this.groupCurrentH = referenceRect.height - deltaY;

    if (deltaX !== 0) this.solveAxis(true, outerBlocks);
    if (deltaY !== 0) this.solveAxis(false, outerBlocks);
  }

  public override expandOuterComponents(
    collapsedRect: TRect,
    ax: number,
    ay: number,
    deltaX: number,
    deltaY: number,
    ctx: TShiftStrategyContext
  ): boolean {
    // If topology was never built (group loaded with collapsed: true), we cannot
    // solve — fall back to the snapshot/directional restore in expand().
    if (this.xPreds === null) return false;
    this.shiftOuterComponents(collapsedRect, ax, ay, deltaX, deltaY, ctx);
    return true;
  }

  private solveAxis(isX: boolean, outerBlocks: readonly BlockState[]): void {
    const preds = isX ? this.xPreds! : this.yPreds!;
    const gaps = isX ? this.xGaps! : this.yGaps!;
    const snaps = this.snapshots!;
    const gRect = this.groupRect!;
    const gBasePos = isX ? gRect.x : gRect.y;
    const gCurrentSize = isX ? this.groupCurrentW : this.groupCurrentH;

    const cache = new Map<string | number, number>();

    const getPos = (id: string | number): number => {
      const cached = cache.get(id);
      if (cached !== undefined) return cached;

      let result: number;

      if (id === CONSTRAINT_GROUP_SENTINEL) {
        // Group's position is fixed; only its size changes.
        result = gBasePos;
      } else {
        const nodePreds = preds.get(id);
        if (!nodePreds || nodePreds.length === 0) {
          // No constraints — keep the original expanded position.
          const snap = snaps.get(id);
          result = snap ? (isX ? snap.x : snap.y) : 0;
        } else {
          // Position = max over predecessors of (predPos + predCurrentSize + origGap).
          let maxRight = -Infinity;
          for (const predId of nodePreds) {
            const predPos = getPos(predId);
            const predSize =
              predId === CONSTRAINT_GROUP_SENTINEL
                ? gCurrentSize
                : isX
                  ? snaps.get(predId)?.w ?? 0
                  : snaps.get(predId)?.h ?? 0;
            const origGap = gaps.get(id)?.get(predId) ?? 0;
            maxRight = Math.max(maxRight, predPos + predSize + origGap);
          }
          result = maxRight === -Infinity ? 0 : maxRight;
        }
      }

      cache.set(id, result);
      return result;
    };

    for (const block of outerBlocks) {
      const newPos = getPos(block.id);
      if (isX ? newPos !== block.x : newPos !== block.y) {
        block.updateXY(isX ? newPos : block.x, isX ? block.y : newPos);
      }
    }
  }
}

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
   *   shiftStrategy: new ScanlineCompactionStrategy(20),
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
 *   shiftStrategy: new ScanlineCompactionStrategy(20),
 * };
 * ```
 * Blocks must carry `group: "my-group"` in their TBlock data.
 */
export class CollapsibleGroup<T extends TCollapsibleGroup = TCollapsibleGroup> extends Group<T> {
  private readonly shiftStrategy: CollapseShiftStrategy;

  constructor(props: TGroupProps, parent: BlockGroups) {
    super(props, parent);

    this.shiftStrategy = new ConstraintLayoutStrategy();
    // (this.groupState.$state.value as T).shiftStrategy ?? new DirectionalShiftStrategy();

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
