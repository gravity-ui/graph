import React, { useCallback, useEffect } from "react";

import { BlockGroups, BlockState, Graph, GraphState, Group, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useGraphEvent } from "@gravity-ui/graph-react";
import type { Meta, StoryFn } from "@storybook/react";
import groupBy from "lodash/groupBy";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

const MyGroup = Group.define({
  style: {
    background: "rgba(100, 100, 100, 0.1)",
    border: "rgba(100, 100, 100, 0.3)",
    borderWidth: 2,
    selectedBackground: "rgba(100, 100, 100, 1)",
    selectedBorder: "rgba(100, 100, 100, 1)",
  },
});

const GroupsLayer = BlockGroups.withBlockGrouping({
  groupingFn: (blocks: BlockState[]) => {
    return groupBy(blocks, (block) => block.$state.value.group);
  },
  mapToGroups: (grounId: string, { rect }) => ({
    id: grounId,
    rect,
    component: MyGroup,
  }),
});

const LargeGraphApp = () => {
  const { graph, setEntities, start } = useGraph({});

  useEffect(() => {
    const layer = graph.addLayer(GroupsLayer, {
      updateBlocksOnDrag: true,
    } as any);
    return () => {
      layer.detachLayer();
    };
  }, [graph]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      const config = generatePrettyBlocks({ layersCount: 15, connectionsPerLayer: 50 });
      config.blocks = config.blocks.map((block, index) => ({
        ...block,
        group: `group${Math.floor(index / 10)}`,
      }));

      setEntities(config);
      start();
      graph.zoomTo("center", { padding: 100 });
    }
  });

  const renderBlockFn = useCallback((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  }, []);

  return <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
};

const meta: Meta = {
  title: "Canvas/Groups",
  component: LargeGraphApp,
};

export default meta;

export const LargeGroupedGraph: StoryFn = () => <LargeGraphApp />;
