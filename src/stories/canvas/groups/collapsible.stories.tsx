import React, { useEffect } from "react";

import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { BlockGroups, CollapsibleGroup } from "../../../components/canvas/groups";
import type { BlockGroupsProps, BlockState } from "../../../components/canvas/groups";
import type { TCollapsibleGroup } from "../../../components/canvas/groups/CollapsibleGroup";
import { ECanDrag, Graph, GraphState, TBlock, TConnection } from "../../../index";
import { GraphCanvas, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { BlockStory } from "../../main/Block";

// ---------------------------------------------------------------------------
// Wide-group layout
//
//  [L-A] ──────────────────────────────────────────── [R-A]
//          ┌──────────────────────────────────────┐
//          │  GROUP A   [A1]   [A2]   [A3]       │
//          └──────────────────────────────────────┘
//
//               ┌──────────────────────────────────────┐
//               │  GROUP B   [B1]   [B2]   [B3]       │
//               └──────────────────────────────────────┘
//  [L-B] ──────────────────────────────────────────────── [R-B]
//
// Group rects are auto-computed via withBlockGrouping: whenever blocks inside
// a group move, the group border follows automatically. On collapse, the size
// is locked so the compact header stays; on expand, the lock is released and
// the rect snaps back to the block bounding box.
//
// Double-click any group to collapse it. Double-click the collapsed header
// to expand. Outer blocks shift via the `group-collapse-change` event handler.
// ---------------------------------------------------------------------------

const BLOCK_W = 200;
const BLOCK_H = 100;
const GROUP_PAD = 60;
const COL_GAP = 80;
const ROW_GAP = 200;
const OUTER_GAP = 80;

// ---------------------------------------------------------------------------
// Group A inner blocks  (row y = 0)
// ---------------------------------------------------------------------------
const GA_COUNT = 3;
const GA_Y = 0;
const GA_X0 = 600;

const GA_BLOCKS: TBlock[] = Array.from({ length: GA_COUNT }, (_, i) => ({
  id: `ga-${i + 1}`,
  is: "Block" as const,
  name: `A${i + 1}`,
  selected: false,
  x: GA_X0 + i * (BLOCK_W + COL_GAP),
  y: GA_Y,
  width: BLOCK_W,
  height: BLOCK_H,
  anchors: [],
  group: "group-a",
}));

// ---------------------------------------------------------------------------
// Group B inner blocks  (row y = ROW_GAP + BLOCK_H, shifted right)
// ---------------------------------------------------------------------------
const GB_COUNT = 3;
const GB_Y = GA_Y + BLOCK_H + ROW_GAP;
const GB_X0 = GA_X0 + BLOCK_W + COL_GAP; // one column to the right

const GB_BLOCKS: TBlock[] = Array.from({ length: GB_COUNT }, (_, i) => ({
  id: `gb-${i + 1}`,
  is: "Block" as const,
  name: `B${i + 1}`,
  selected: false,
  x: GB_X0 + i * (BLOCK_W + COL_GAP),
  y: GB_Y,
  width: BLOCK_W,
  height: BLOCK_H,
  anchors: [],
  group: "group-b",
}));

// ---------------------------------------------------------------------------
// Bounding boxes for the two groups (used to position outer blocks)
// ---------------------------------------------------------------------------
const GA_RIGHT = GA_X0 + GA_COUNT * (BLOCK_W + COL_GAP) - COL_GAP; // right edge of last A block
const GB_RIGHT = GB_X0 + GB_COUNT * (BLOCK_W + COL_GAP) - COL_GAP;

// ---------------------------------------------------------------------------
// Outer "chain" blocks – one on each side of each group row
// ---------------------------------------------------------------------------
const OUTER_BLOCKS: TBlock[] = [
  {
    id: "outer-l-a",
    is: "Block" as const,
    name: "L-A",
    selected: false,
    x: GA_X0 - GROUP_PAD - OUTER_GAP - BLOCK_W,
    y: GA_Y,
    width: BLOCK_W,
    height: BLOCK_H,
    anchors: [],
  },
  {
    id: "outer-r-a",
    is: "Block" as const,
    name: "R-A",
    selected: false,
    x: GA_RIGHT + GROUP_PAD + OUTER_GAP,
    y: GA_Y,
    width: BLOCK_W,
    height: BLOCK_H,
    anchors: [],
  },
  {
    id: "outer-l-b",
    is: "Block" as const,
    name: "L-B",
    selected: false,
    x: GB_X0 - GROUP_PAD - OUTER_GAP - BLOCK_W,
    y: GB_Y,
    width: BLOCK_W,
    height: BLOCK_H,
    anchors: [],
  },
  {
    id: "outer-r-b",
    is: "Block" as const,
    name: "R-B",
    selected: false,
    x: GB_RIGHT + GROUP_PAD + OUTER_GAP,
    y: GB_Y,
    width: BLOCK_W,
    height: BLOCK_H,
    anchors: [],
  },
];

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------
const CONNECTIONS: TConnection[] = [
  { id: "c-la-a1", sourceBlockId: "outer-l-a", targetBlockId: "ga-1" },
  { id: "c-a3-ra", sourceBlockId: `ga-${GA_COUNT}`, targetBlockId: "outer-r-a" },
  { id: "c-lb-b1", sourceBlockId: "outer-l-b", targetBlockId: "gb-1" },
  { id: "c-b3-rb", sourceBlockId: `gb-${GB_COUNT}`, targetBlockId: "outer-r-b" },
  // Cross-connection to see port delegation when collapsed
  { id: "c-a2-b2", sourceBlockId: "ga-2", targetBlockId: "gb-2" },
];

const ALL_BLOCKS: TBlock[] = [...GA_BLOCKS, ...GB_BLOCKS, ...OUTER_BLOCKS];

// ---------------------------------------------------------------------------
// Auto-grouping class — groups are derived from block.group field, rect is
// recomputed automatically as blocks move (with GROUP_PAD padding).
// On collapse, CollapsibleGroup calls groupState.lockSize() so this computed
// rect doesn't override the compact header; on expand, lockSize() is released.
// ---------------------------------------------------------------------------
const CollapsibleBlockGroups = BlockGroups.withBlockGrouping<BlockGroupsProps, BlockGroups>({
  groupingFn: (blocks: BlockState[]): Record<string, BlockState[]> => {
    const result: Record<string, BlockState[]> = {};
    blocks.forEach((block) => {
      const groupId = block.$state.value.group;
      if (groupId) {
        if (!result[groupId]) result[groupId] = [];
        result[groupId].push(block);
      }
    });
    return result;
  },
  mapToGroups: (_key, { rect }): TCollapsibleGroup => ({
    id: _key,
    rect: {
      x: rect.x - GROUP_PAD,
      y: rect.y - GROUP_PAD,
      width: rect.width + GROUP_PAD * 2,
      height: rect.height + GROUP_PAD * 2,
    },
    collapsed: !!(Math.floor(Math.random() * 10) % 2),
    component: CollapsibleGroup,
    collapseDirection: { x: "center", y: "center" },
    // `collapsed` is intentionally omitted: existing state is preserved by
    // updateGroup()'s spread, and newly created groups default to false.
  }),
});

// ---------------------------------------------------------------------------
// Story component
// ---------------------------------------------------------------------------

const CollapsibleGroupsApp = () => {
  const { graph, setEntities, start } = useGraph({
    settings: {
      canDrag: ECanDrag.ALL,
    },
  });

  useEffect(() => {
    const blockGroups = graph.addLayer(CollapsibleBlockGroups, {
      draggable: true,
      updateBlocksOnDrag: true,
    });
    return () => {
      blockGroups.detachLayer();
    };
  }, [graph]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      setEntities({ blocks: ALL_BLOCKS, connections: CONNECTIONS });
      start();
      graph.zoomTo("center", { padding: 150 });
    }
  });

  // Toggle collapse/expand on double-click
  useGraphEvent(graph, "dblclick", ({ target }) => {
    if (target instanceof CollapsibleGroup) {
      if (target.isCollapsed()) {
        target.expand();
      } else {
        target.collapse();
      }
    }
  });

  // Shift outer blocks to fill freed space on collapse/expand
  useGraphEvent(graph, "group-collapse-change", ({ groupId, currentRect, nextRect }) => {
    console.log("EMIT: group-collapse-change", { groupId, currentRect, nextRect });
  });

  const renderBlockFn = useFn((graphObject: Graph, block: TBlock) => <BlockStory graph={graphObject} block={block} />);

  return <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta = {
  title: "Canvas/Groups",
  component: CollapsibleGroupsApp,
  parameters: {
    docs: {
      description: {
        component:
          "Two wide `CollapsibleGroup` instances with outer blocks on both sides. " +
          "Group rects are auto-computed from block positions via `withBlockGrouping`. " +
          "**Double-click** a group to collapse it: blocks hide, connections redirect " +
          "to group edges. Outer blocks shift via `group-collapse-change` event handler. " +
          "Double-click the header to expand.",
      },
    },
  },
};

export default meta;

export const CollapsibleGroups: StoryFn = () => <CollapsibleGroupsApp />;
CollapsibleGroups.storyName = "Collapsible Groups";
