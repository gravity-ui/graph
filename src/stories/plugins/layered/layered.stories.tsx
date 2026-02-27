import React, { useEffect, useMemo } from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import { Description, Meta as StorybookMeta, Title } from "@storybook/addon-docs/blocks";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { BezierMultipointConnection, Graph, GraphState, TBlock, TConnection } from "../../../index";
import type { LayeredLayoutOptions } from "../../../plugins/layered";
import { useLayeredLayout } from "../../../plugins/layered";
import { GraphCanvas, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { TMultipointConnection } from "../../../store/connection/ConnectionState";
import { BlockStory } from "../../main/Block";

import { layeredConfig } from "./config";

import "@gravity-ui/uikit/styles/styles.css";

export interface GraphAppLayoutArgs {
  nodeHorizontalGap?: number;
  nodeVerticalGap?: number;
  layerSpacingFactor?: number;
  defaultNodeWidth?: number;
  defaultNodeHeight?: number;
}

const GraphApp = (args: GraphAppLayoutArgs = {}) => {
  const layoutOptions = useMemo<LayeredLayoutOptions | undefined>(() => {
    const opts: LayeredLayoutOptions = {
      ...(args.nodeHorizontalGap !== undefined && { nodeHorizontalGap: args.nodeHorizontalGap }),
      ...(args.nodeVerticalGap !== undefined && { nodeVerticalGap: args.nodeVerticalGap }),
      ...(args.layerSpacingFactor !== undefined && { layerSpacingFactor: args.layerSpacingFactor }),
      ...(args.defaultNodeWidth !== undefined && { defaultNodeWidth: args.defaultNodeWidth }),
      ...(args.defaultNodeHeight !== undefined && { defaultNodeHeight: args.defaultNodeHeight }),
    };
    return Object.keys(opts).length > 0 ? opts : undefined;
  }, [
    args.nodeHorizontalGap,
    args.nodeVerticalGap,
    args.layerSpacingFactor,
    args.defaultNodeWidth,
    args.defaultNodeHeight,
  ]);

  const { graph, setEntities, start } = useGraph({
    settings: {
      connection: BezierMultipointConnection,
    },
  });

  const { isLoading, result } = useLayeredLayout({
    ...layeredConfig,
    layoutOptions,
  });

  useEffect(() => {
    if (isLoading || !result) return;

    const connections = layeredConfig.connections.reduce<
      (TConnection & Pick<TMultipointConnection, "points" | "labels">)[]
    >((acc, connection) => {
      const id = connection.id ?? `${String(connection.sourceBlockId)}/${String(connection.targetBlockId)}`;
      if (id in result.edges) {
        acc.push({
          id,
          sourceBlockId: connection.sourceBlockId,
          targetBlockId: connection.targetBlockId,
          ...result.edges[id],
        });
      }
      return acc;
    }, []);

    const blocks = layeredConfig.blocks.map((block) => ({
      ...block,
      ...result.blocks[block.id],
      name: block.id.toString(),
      is: "Block",
    }));

    setEntities({
      blocks,
      connections,
    });

    graph.zoomTo("center", { padding: 300 });
  }, [isLoading, result]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
    }
  });

  const renderBlockFn = useFn((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  });

  return (
    <ThemeProvider theme={"light"}>
      <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />
    </ThemeProvider>
  );
};

const meta: Meta<typeof GraphApp> = {
  title: "Plugins/Layered",
  component: GraphApp,
  tags: ["autodocs"],
  parameters: {
    docs: {
      page: () => (
        <>
          <StorybookMeta />
          <Title />
          <Description />
        </>
      ),
      description: {
        component:
          "The useLayeredLayout hook computes a hierarchical (layered) graph layout. It arranges nodes in " +
          "layers/columns based on the direction of connections, suitable for DAGs and flow diagrams.\n\n" +
          "## Usage\n\n" +
          "```tsx\n" +
          "const { isLoading, result } = useLayeredLayout({ blocks, connections, layoutOptions });\n" +
          "```\n\n" +
          "### Parameters\n\n" +
          "- `blocks`: Array of block descriptors with `id`, `width`, `height`, and optional `level`\n" +
          "- `connections`: Array of connections with `sourceBlockId`, `targetBlockId`, and optional `id`\n" +
          "- `layoutOptions`: Optional layout tuning (gaps, default sizes, layer spacing)\n" +
          "- `onError`: Optional callback for layout errors\n\n" +
          "### Returns\n\n" +
          "- `isLoading`: Boolean indicating if the layout computation is in progress\n" +
          "- `result`: Object with `blocks` (positions by id) and `edges` (points/labels by connection id)\n\n" +
          "## Layout Options\n\n" +
          "- `nodeHorizontalGap`: Horizontal gap between nodes in the same layer (default: 2× defaultNodeWidth)\n" +
          "- `nodeVerticalGap`: Vertical gap between adjacent layers (default: 200)\n" +
          "- `defaultNodeWidth` / `defaultNodeHeight`: Default node size when not provided (default: 100)\n" +
          "- `layerSpacingFactor`: Multiplier for spacing between layers (default: 1.7)\n\n" +
          "## Example\n\n" +
          "```tsx\n" +
          "import { useGraph, useLayeredLayout } from '@gravity-ui/graph';\n\n" +
          "const { graph, setEntities, start } = useGraph();\n" +
          "const { isLoading, result } = useLayeredLayout({\n" +
          "  blocks: [{ id: '1', width: 100, height: 50 }, { id: '2', width: 100, height: 50 }],\n" +
          "  connections: [{ sourceBlockId: '1', targetBlockId: '2' }],\n" +
          "  layoutOptions: { nodeHorizontalGap: 80, nodeVerticalGap: 120 },\n" +
          "});\n\n" +
          "useEffect(() => {\n" +
          "  if (!isLoading && result) {\n" +
          "    setEntities({ blocks: mapBlocks(result), connections: mapConnections(result) });\n" +
          "  }\n" +
          "}, [isLoading, result]);\n" +
          "```",
      },
    },
  },
  argTypes: {
    nodeHorizontalGap: {
      control: { type: "number", min: 0, max: 300, step: 10 },
      description: "Horizontal gap between nodes in the same layer",
    },
    nodeVerticalGap: {
      control: { type: "number", min: 0, max: 400, step: 10 },
      description: "Vertical gap between adjacent layers",
    },
    layerSpacingFactor: {
      control: { type: "number", min: 0.5, max: 4, step: 0.1 },
      description: "Multiplier for spacing between layers",
    },
    defaultNodeWidth: {
      control: { type: "number", min: 20, max: 200, step: 10 },
      description: "Default node width when not provided",
    },
    defaultNodeHeight: {
      control: { type: "number", min: 20, max: 200, step: 10 },
      description: "Default node height when not provided",
    },
  },
};

export default meta;

export const Default: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
