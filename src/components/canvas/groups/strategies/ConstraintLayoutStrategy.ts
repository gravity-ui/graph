import { BlockState } from "../../../../store/block/Block";
import { TRect } from "../../../../utils/types/shapes";

import { CollapseShiftStrategy, TShiftStrategyContext } from "./CollapseShiftStrategy";

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

// ---------------------------------------------------------------------------

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
                  ? (snaps.get(predId)?.w ?? 0)
                  : (snaps.get(predId)?.h ?? 0);
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
