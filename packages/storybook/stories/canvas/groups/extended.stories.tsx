import React, { useEffect } from "react";

import type { Meta, StoryFn } from "@storybook/react";

import { BlockGroups, Group } from "../../../components/canvas/groups";
import { Graph, GraphState, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useGraphEvent } from "@gravity-ui/graph/react";
import { useFn } from "@gravity-ui/graph/react";
import { TGroup } from "@gravity-ui/graph";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

interface ExtendedTGroup extends TGroup {
  description: string;
  priority: number;
}

class CustomGroup extends Group<ExtendedTGroup> {
  protected override render() {
    super.render();
    const ctx = this.context.ctx;
    const rect = this.getRect();

    if (this.state.description) {
      ctx.font = "12px Arial";
      ctx.fillStyle = this.context.colors.block.text;
      ctx.fillText(this.state.description, rect.x + 10, rect.y + 40);
    }

    if (this.state.priority) {
      ctx.font = "bold 14px Arial";
      const text = `P${this.state.priority}`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillText(text, rect.x + rect.width - textWidth - 10, rect.y + 25);
    }
  }
}

const ExtendedGroupsApp = () => {
  const { graph, setEntities, start } = useGraph({});

  useEffect(() => {
    const blockGroups = graph.addLayer(BlockGroups, {
      draggable: false,
      groupComponent: CustomGroup,
    });

    blockGroups.setGroups([
      {
        id: "group1",
        description: "Left Area description",
        priority: 1,
        rect: { x: 0, y: 0, width: 800, height: 400 },
      },
      {
        id: "group2",
        description: "Right Area description",
        priority: 2,
        rect: { x: 850, y: 0, width: 800, height: 400 },
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
  component: ExtendedGroupsApp,
};

export default meta;

export const ExtendedGroups: StoryFn = () => <ExtendedGroupsApp />;
