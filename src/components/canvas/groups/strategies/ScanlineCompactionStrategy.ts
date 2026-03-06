import { TRect } from "../../../../utils/types/shapes";

import { CollapseShiftStrategy, TShiftStrategyContext } from "./CollapseShiftStrategy";

// ---------------------------------------------------------------------------
// Scanline helpers
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

// ---------------------------------------------------------------------------

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
