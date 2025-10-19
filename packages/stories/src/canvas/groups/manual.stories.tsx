import React, { useEffect } from "react";

import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { BlockGroups, Group } from "@gravity-ui/graph";
import { Graph, GraphState, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useGraphEvent } from "@gravity-ui/graph-react";
import { useFn } from "@gravity-ui/graph-react";
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

  useEffect(() => {
    const blockGroups = graph.addLayer(BlockGroups, {
      draggable: false,
    });

    blockGroups.setGroups([
      {
        id: "group1",
        rect: { x: 0, y: 0, width: 800, height: 400 },
        component: LeftGroup,
      },
      {
        id: "group2",
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
      setEntities(generatePrettyBlocks({ layersCount: 5, connectionsPerLayer: 10 }));
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
  title: "Canvas/Groups",
  component: ManualGroupsApp,
};

export default meta;

export const ManualGroups: StoryFn = () => <ManualGroupsApp />;
