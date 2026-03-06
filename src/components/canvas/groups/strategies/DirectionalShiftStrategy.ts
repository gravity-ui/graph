import { BlockState } from "../../../../store/block/Block";
import { GroupState } from "../../../../store/group/Group";
import { TRect } from "../../../../utils/types/shapes";

import { CollapseShiftStrategy, TShiftStrategyContext } from "./CollapseShiftStrategy";

// ---------------------------------------------------------------------------
// Shared helpers (also used by CompactLayoutStrategy)
// ---------------------------------------------------------------------------

/**
 * Partition outer blocks into ungrouped and grouped-by-their-group-id.
 * Blocks that belong to the collapsing group are excluded.
 */
export function partitionOuterBlocks(
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
export function outerGroupBounds(
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
