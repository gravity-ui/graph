import React, { useCallback, useEffect, useState } from "react";

import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { TDefinitionGroup } from "@gravity-ui/graph";
import { BlockGroupsTransferLayer } from "@gravity-ui/graph";
import { ECanDrag, Graph, GraphState, Group, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useGraphEvent, useLayer } from "@gravity-ui/graph-react";
import { BlockStory } from "../../main/Block";

const createConfig = () => {
  const blocks: TBlock[] = [
    // Group A blocks (blue group)
    {
      id: "block-a1",
      is: "block",
      name: "Block A1",
      x: 50,
      y: 50,
      width: 150,
      height: 80,
      selected: false,
      anchors: [],
    },
    {
      id: "block-a2",
      is: "block",
      name: "Block A2",
      x: 50,
      y: 150,
      width: 150,
      height: 80,
      selected: false,
      anchors: [],
    },
    {
      id: "block-a3",
      is: "block",
      name: "Block A3",
      x: 50,
      y: 250,
      width: 150,
      height: 80,
      selected: false,
      anchors: [],
    },
    // Group B blocks (green group)
    {
      id: "block-b1",
      is: "block",
      name: "Block B1",
      x: 350,
      y: 50,
      width: 150,
      height: 80,
      selected: false,
      anchors: [],
    },
    {
      id: "block-b2",
      is: "block",
      name: "Block B2",
      x: 350,
      y: 150,
      width: 150,
      height: 80,
      selected: false,
      anchors: [],
    },
    // Group C blocks (purple group)
    {
      id: "block-c1",
      is: "block",
      name: "Block C1",
      x: 650,
      y: 50,
      width: 150,
      height: 80,
      selected: false,
      anchors: [],
    },
    // Blocks without group
    {
      id: "block-free1",
      is: "block",
      name: "Free Block 1",
      x: 200,
      y: 400,
      width: 150,
      height: 80,
      selected: false,
      anchors: [],
    },
    {
      id: "block-free2",
      is: "block",
      name: "Free Block 2",
      x: 450,
      y: 400,
      width: 150,
      height: 80,
      selected: false,
      anchors: [],
    },
  ];

  return { blocks };
};

// Blue group style
const GroupA = Group.define({
  style: {
    background: "rgba(59, 130, 246, 0.1)",
    border: "rgba(59, 130, 246, 0.4)",
    borderWidth: 2,
    selectedBackground: "rgba(59, 130, 246, 0.2)",
    selectedBorder: "rgba(59, 130, 246, 0.8)",
    highlightedBackground: "rgba(59, 130, 246, 0.3)",
    highlightedBorder: "rgba(59, 130, 246, 1)",
  },
});

// Green group style
const GroupB = Group.define({
  style: {
    background: "rgba(34, 197, 94, 0.1)",
    border: "rgba(34, 197, 94, 0.4)",
    borderWidth: 2,
    selectedBackground: "rgba(34, 197, 94, 0.2)",
    selectedBorder: "rgba(34, 197, 94, 0.8)",
    highlightedBackground: "rgba(34, 197, 94, 0.3)",
    highlightedBorder: "rgba(34, 197, 94, 1)",
  },
});

// Purple group style
const GroupC = Group.define({
  style: {
    background: "rgba(168, 85, 247, 0.1)",
    border: "rgba(168, 85, 247, 0.4)",
    borderWidth: 2,
    selectedBackground: "rgba(168, 85, 247, 0.2)",
    selectedBorder: "rgba(168, 85, 247, 0.8)",
    highlightedBackground: "rgba(168, 85, 247, 0.3)",
    highlightedBorder: "rgba(168, 85, 247, 1)",
  },
});

const groupsInfo: TDefinitionGroup[] = [
  {
    id: "group-a",
    blocksIds: ["block-a1", "block-a2", "block-a3"],
    component: GroupA,
  },
  {
    id: "group-b",
    blocksIds: ["block-b1", "block-b2"],
    component: GroupB,
  },
  {
    id: "group-c",
    blocksIds: ["block-c1"],
    component: GroupC,
  },
];

const GroupsLayer = BlockGroupsTransferLayer.withPredefinedGroups();

const GroupTransferApp = () => {
  const { graph, setEntities, start } = useGraph({
    settings: {
      canDrag: ECanDrag.ALL,
    },
  });

  const [groups, setGroups] = useState<TDefinitionGroup[]>(groupsInfo);
  const config = createConfig();

  const groupsLayer = useLayer(graph, GroupsLayer, {
    draggable: true,
    onBlockGroupChange: (changes) => {
      setGroups((groups) => {
        const newGroups = groups.map((g) => ({ ...g, blocksIds: [...g.blocksIds] }));

        changes.forEach(({ blockId, sourceGroup, targetGroup }) => {
          // Remove from source
          if (sourceGroup) {
            const source = newGroups.find((g) => g.id === sourceGroup);
            if (source) {
              source.blocksIds = source.blocksIds.filter((id) => id !== blockId);
            }
          }
          // Add to target
          if (targetGroup) {
            const target = newGroups.find((g) => g.id === targetGroup);
            if (target) {
              target.blocksIds.push(blockId);
            }
          }
        });

        return newGroups;
      });
    },
    onTransferEnd: (blockIds, targetGroupId) => {
      console.log("onTransferEnd", blockIds, targetGroupId);
    },
    onTransferStart: (blockIds, sourceGroupIds) => {
      console.log("onTransferStart", blockIds, sourceGroupIds);
    },
    transferEnabled: true,
    updateBlocksOnDrag: true,
  });

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      setEntities(config);
      start();
      graph.zoomTo("center", { padding: 100 });
    }
  });

  useEffect(() => {
    if (groupsLayer) {
      groupsLayer.defineGroups(groups);
    }
  }, [groupsLayer, groups]);

  const renderBlockFn = useCallback((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  }, []);

  return (
    <div style={{ display: "flex", height: "100%", gap: "16px" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />
      </div>
      <div
        style={{
          width: "300px",
          padding: "16px",
          background: "#1e1e1e",
          color: "#fff",
          fontFamily: "monospace",
          fontSize: "12px",
          overflow: "auto",
        }}
      >
        <h3 style={{ margin: "0 0 16px 0", color: "#fff" }}>Instructions</h3>
        <ul style={{ margin: "0 0 16px 0", paddingLeft: "20px", lineHeight: "1.6" }}>
          <li>
            <strong>Start dragging</strong> any block, then <strong>hold Shift</strong> to enter transfer mode
          </li>
          <li>
            Notice: <strong>ALL groups freeze</strong> their size when Shift is held
          </li>
          <li>Move cursor over a target group — it will highlight</li>
          <li>
            <strong>Release Shift</strong> to transfer the block to the highlighted group
          </li>
          <li>Release Shift outside any group to remove block from its group</li>
          <li>
            <strong>Multi-select</strong> blocks and drag with Shift to transfer all at once
          </li>
        </ul>

        <h3 style={{ margin: "0 0 12px 0", color: "#fff" }}>Groups</h3>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <span style={{ padding: "4px 8px", background: "rgba(59, 130, 246, 0.3)", borderRadius: "4px" }}>
            Group A (Blue)
          </span>
          <span style={{ padding: "4px 8px", background: "rgba(34, 197, 94, 0.3)", borderRadius: "4px" }}>
            Group B (Green)
          </span>
          <span style={{ padding: "4px 8px", background: "rgba(168, 85, 247, 0.3)", borderRadius: "4px" }}>
            Group C (Purple)
          </span>
        </div>
      </div>
    </div>
  );
};

const meta: Meta = {
  title: "Canvas/Groups",
  component: GroupTransferApp,
};

export default meta;

export const GroupTransfer: StoryFn = () => <GroupTransferApp />;
GroupTransfer.parameters = {
  docs: {
    description: {
      story: `
## Group Transfer Demo

This story demonstrates the block-to-group transfer feature using \`TransferableBlockGroups\`.

### How to use:
1. Start dragging any block
2. **Hold Shift** to activate transfer mode (ALL groups freeze their size)
3. Drag over a target group - it will be highlighted
4. **Release Shift** to transfer the block to the highlighted group
5. If you release Shift outside any group, the block will be removed from its group
6. If you release mouse (without releasing Shift first), transfer is cancelled

### Multi-block transfer:
- Select multiple blocks (Cmd/Ctrl + Click)
- Drag with Shift to transfer all selected blocks at once

### Usage:
\`\`\`tsx
import { TransferableBlockGroups } from "@gravity-ui/graph";

const GroupsLayer = TransferableBlockGroups.withBlockGrouping({
  groupingFn: (blocks) => groupBy(blocks, (b) => b.group),
  mapToGroups: (groupId, { rect }) => ({ id: groupId, rect }),
});

graph.addLayer(GroupsLayer, { transferEnabled: true });
\`\`\`
      `,
    },
  },
};
