import { Graph } from "../../../graph";
import { TRect } from "../../../utils/types/shapes";

import { DirectionalShiftStrategy } from "./strategies/DirectionalShiftStrategy";

/**
 * Standalone utility to shift outer blocks when a group collapses or expands.
 *
 * Call this from your `group-collapse-change` event handler if you want the
 * surrounding blocks to move inward (on collapse) or outward (on expand) to
 * fill the freed / restored space.
 *
 * Uses {@link DirectionalShiftStrategy} internally — each outer block shifts
 * by a fixed delta based on which side of the group it occupies.
 *
 * @example
 * ```typescript
 * import { shiftBlocksOnGroupCollapse } from "@gravity-ui/graph";
 *
 * graph.on("group-collapse-change", (event) => {
 *   const { groupId, currentRect, nextRect } = event.detail;
 *   const groupBlocks = graph.rootStore.groupsList.$blockGroups.value[groupId] ?? [];
 *   shiftBlocksOnGroupCollapse({
 *     graph,
 *     currentRect,
 *     nextRect,
 *     groupBlockIds: new Set(groupBlocks.map((b) => b.id)),
 *   });
 * });
 * ```
 */
export function shiftBlocksOnGroupCollapse(options: {
  graph: Graph;
  currentRect: TRect;
  nextRect: TRect;
  groupBlockIds: Set<string | number>;
}): void {
  const { graph, currentRect, nextRect, groupBlockIds } = options;
  const deltaX = currentRect.width - nextRect.width;
  const deltaY = currentRect.height - nextRect.height;
  if (deltaX === 0 && deltaY === 0) return;

  // Derive direction factors from the rect position change.
  const ax =
    currentRect.width !== nextRect.width ? (nextRect.x - currentRect.x) / (currentRect.width - nextRect.width) : 0;
  const ay =
    currentRect.height !== nextRect.height ? (nextRect.y - currentRect.y) / (currentRect.height - nextRect.height) : 0;

  const strategy = new DirectionalShiftStrategy();
  strategy.shiftOuterComponents(currentRect, ax, ay, deltaX, deltaY, {
    groupBlockIds,
    allBlocks: graph.rootStore.blocksList.$blocks.value,
    getGroupState: (id) => graph.rootStore.groupsList.getGroupState(id),
  });
}
