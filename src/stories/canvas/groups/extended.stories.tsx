import React, { useEffect } from "react";

import type { Meta, StoryFn } from "@storybook/react";

import { BlockGroups, Group } from "../../../components/canvas/groups";
import { Graph, GraphCanvas, GraphState, TBlock, useGraph, useGraphEvent } from "../../../index";
import { TGroup } from "../../../store/group/Group";
import { useFn } from "../../../utils/hooks/useFn";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

// Определяем расширенный тип группы
interface ExtendedTGroup extends TGroup {
  description: string;
  priority: number;
}

// Создаем кастомный компонент группы
class CustomGroup extends Group<ExtendedTGroup> {
  protected override render() {
    super.render();
    const ctx = this.context.ctx;
    const rect = this.getRect();

    // Отрисовываем описание под названием группы
    if (this.state.description) {
      ctx.font = "12px Arial";
      ctx.fillStyle = this.context.colors.block.text;
      ctx.fillText(this.state.description, rect.x + 10, rect.y + 40);
    }

    // Отрисовываем приоритет в правом верхнем углу
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
  const config = generatePrettyBlocks(5, 10, true);

  useEffect(() => {
    const blockGroups = graph.addLayer(BlockGroups, {
      draggable: false,
      updateBlocksOnDrag: false,
      groupComponent: CustomGroup,
    });

    // Создаем группы вручную
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
  title: "Canvas/Groups/Extended",
  component: ExtendedGroupsApp,
};

export default meta;

export const ExtendedGroups: StoryFn = () => <ExtendedGroupsApp />;
