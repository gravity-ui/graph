import React, { useEffect } from "react";

import type { Meta, StoryFn } from "@storybook/react";

import { BlockGroups, Group } from "../../../components/canvas/groups";
import { Graph, GraphCanvas, GraphState, TBlock, useGraph, useGraphEvent } from "../../../index";
import { useFn } from "../../../utils/hooks/useFn";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

const LeftGroup = Group.define({
  style: {
    background: "rgba(100, 149, 237, 0.1)",
    border: "rgba(100, 149, 237, 0.3)",
    selectedBackground: "rgba(100, 149, 237, 0.2)",
    selectedBorder: "rgba(100, 149, 237, 0.5)",
  },
});

const RightGroup = Group.define({
  style: {
    background: "rgba(144, 238, 144, 0.1)",
    border: "rgba(144, 238, 144, 0.3)",
    selectedBackground: "rgba(144, 238, 144, 0.2)",
    selectedBorder: "rgba(144, 238, 144, 0.5)",
  },
});

const ManualGroupsApp = () => {
  const { graph, setEntities, start } = useGraph({});
  const config = generatePrettyBlocks(5, 10, true);

  useEffect(() => {
    const blockGroups = graph.addLayer(BlockGroups, {
      draggable: false,
      updateBlocksOnDrag: false,
    });

    // Создаем группы вручную
    blockGroups.setGroups([
      {
        id: "group1",
        name: "Left Area",
        rect: { x: 0, y: 0, width: 800, height: 400 },
        component: LeftGroup,
      },
      {
        id: "group2",
        name: "Right Area",
        rect: { x: 800, y: 0, width: 800, height: 400 },
        component: RightGroup,
      },
    ]);

    return () => {
      blockGroups.detachLayer();
    };
  }, [graph]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      setEntities(config);
      start();
      graph.zoomTo("center", { padding: 100 });
    }
  });

  const renderBlockFn = useFn((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  });

  return <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
};

const meta: Meta = {
  title: "Canvas/Groups/Manual",
  component: ManualGroupsApp,
};

export default meta;

/**
 * Shows how to create fixed area groups that automatically contain blocks based on their position.
 * Groups act as visual areas and cannot be moved.
 * Note: Dragging such groups is not recommended as this behavior is not yet implemented properly.
 * The groups should stay fixed while blocks can move freely between them.
 */
export const ManualGroups: StoryFn = () => <ManualGroupsApp />;
ManualGroups.parameters = {
  docs: {
    description: {
      story: `
This example shows how to create fixed area groups:
- Creates two non-draggable areas with different colors
- Left area (blue) automatically contains blocks with x < 800
- Right area (green) automatically contains blocks with x >= 800
- Areas stay fixed while blocks can be moved between them
- Useful for creating zones or regions in the graph

Note: Do not enable dragging for such area groups as this behavior is not yet implemented.
The groups should remain fixed in their positions while blocks can be freely moved between them.
`,
    },
  },
};
