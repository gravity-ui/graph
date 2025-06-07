import React, { useEffect } from "react";

import type { Meta, StoryFn } from "@storybook/react";
import groupBy from "lodash/groupBy";

import { BlockGroups, Group } from "../../../components/canvas/groups";
import { BlockState, ECanChangeBlockGeometry, Graph, GraphState, TBlock } from "../../../index";
import { GraphCanvas, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { BlockStory } from "../../main/Block";

const createConfig = () => {
  const blocks: TBlock[] = [
    {
      id: "block1",
      is: "block",
      name: "Block 1",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      group: "group1",
      selected: false,
      anchors: [],
    },
    {
      id: "block2",
      is: "block",
      name: "Block 2",
      x: 150,
      y: 250,
      width: 200,
      height: 150,
      group: "group1",
      selected: false,
      anchors: [],
    },
    {
      id: "block3",
      is: "block",
      name: "Block 3",
      x: 500,
      y: 100,
      width: 200,
      height: 150,
      group: "group2",
      selected: false,
      anchors: [],
    },
    {
      id: "block4",
      is: "block",
      name: "Block 4",
      x: 550,
      y: 250,
      width: 200,
      height: 150,
      group: "group2",
      selected: false,
      anchors: [],
    },
    {
      id: "block5",
      is: "block",
      name: "Block without group",
      x: 300,
      y: 400,
      width: 200,
      height: 150,
      selected: false,
      anchors: [],
    },
  ];

  return { blocks };
};

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

const GraphApp = () => {
  const { graph, setEntities, start } = useGraph({
    settings: {
      canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
    },
  });
  const config = createConfig();

  useEffect(() => {
    const layer = graph.addLayer(GroupsLayer, {
      draggable: true,
      updateBlocksOnDrag: true,
    });
    return () => {
      layer.detachLayer();
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
  title: "Canvas/Groups",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
