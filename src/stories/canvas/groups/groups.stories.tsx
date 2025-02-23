import React, { useEffect } from "react";

import type { Meta, StoryFn } from "@storybook/react";
import groupBy from "lodash/groupBy";

import { BlockGroups, Group } from "../../../components/canvas/groups";
import { BlockState, Graph, GraphCanvas, GraphState, TBlock, useGraph, useGraphEvent } from "../../../index";
import { getUsableRectByBlockIds } from "../../../utils/functions";
import { useFn } from "../../../utils/hooks/useFn";
import { BlockStory } from "../../main/Block";

const createConfig = () => {
  const blocks: TBlock[] = [
    // Группа 1
    {
      id: "block1",
      is: "block",
      name: "Block 1",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
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
      height: 100,
      group: "group1",
      selected: false,
      anchors: [],
    },
    // Группа 2
    {
      id: "block3",
      is: "block",
      name: "Block 3",
      x: 500,
      y: 100,
      width: 200,
      height: 100,
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
      height: 100,
      group: "group2",
      selected: false,
      anchors: [],
    },
    // Блок без группы
    {
      id: "block5",
      is: "block",
      name: "Block without group",
      x: 300,
      y: 400,
      width: 200,
      height: 100,
      selected: false,
      anchors: [],
    },
  ];

  return { blocks };
};

const MyGroup = Group.define({
  padding: [10, 10, 10, 10],
  draggable: true,
  updateBlocksOnDrag: true,
});

const GroupsLayer = BlockGroups.withBlockGrouping({
  groupingFn: (blocks: BlockState[]) => {
    return groupBy(blocks, (block) => block.$state.value.group);
  },
  mapToGroups: (grounId: string, blocks: BlockState[]) => ({
    id: grounId,
    name: grounId,
    rect: getUsableRectByBlockIds(blocks),
    component: MyGroup,
  }),
});

const GraphApp = () => {
  const { graph, setEntities, start } = useGraph({});
  const config = createConfig();

  useEffect(() => {
    const layer = graph.addLayer(GroupsLayer, {});
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
