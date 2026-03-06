import { TRect } from "../../../../utils/types/shapes";

import { CollapseShiftStrategy, TShiftStrategyContext } from "./CollapseShiftStrategy";
import { outerGroupBounds, partitionOuterBlocks } from "./DirectionalShiftStrategy";

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
