import React, { useEffect, useMemo } from "react";

import { Graph, GraphState, TBlock, TConnection, TGraphConfig } from "@gravity-ui/graph";
import {
  GraphCanvas,
  MultipointConnection,
  TMultipointConnection,
  useElk,
  useFn,
  useGraph,
  useGraphEvent,
} from "@gravity-ui/graph-react";
import { ThemeProvider } from "@gravity-ui/uikit";
import { Description, Meta as StorybookMeta, Title } from "@storybook/addon-docs/blocks";
import type { Meta, StoryFn } from "@storybook/react-webpack5";
import ELK, { ElkNode } from "elkjs";

import { BlockStory } from "../../main/Block";

import { getExampleConfig } from "./getExampleConfig";

export enum Algorithm {
  Box = "box",
  Layered = "layered",
  Disco = "disco",
  Radial = "radial",
  MrTree = "mrtree",
  Force = "force",
  Stress = "stress",
  Random = "random",
  SporeOverlap = "sporeOverlap",
  SporeCompaction = "sporeCompaction",
}

import "@gravity-ui/uikit/styles/styles.css";

interface GraphAppProps {
  elkConfig?: ElkNode;
  graphConfig?: TGraphConfig;
}

const GraphApp = ({ elkConfig, graphConfig }: GraphAppProps) => {
  const elk = useMemo(() => new ELK(), []);

  const { graph, setEntities, start } = useGraph({
    settings: {
      connection: MultipointConnection as any,
    },
  });

  const { isLoading, result } = useElk(elkConfig, elk);

  useEffect(() => {
    if (isLoading || !result) return;

    const connections = graphConfig.connections.reduce<
      (TConnection & Pick<TMultipointConnection, "points" | "labels">)[]
    >((acc, connection) => {
      if (connection.id in result.edges) {
        acc.push({
          ...connection,
          ...result.edges[connection.id],
        });
      }
      return acc;
    }, []);

    const blocks = graphConfig.blocks.map((block) => {
      return {
        ...block,
        ...result.blocks[block.id],
      };
    });

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
  title: "Plugins/ELK",
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
          "The useElk hook is used to compute graph layouts using the ELK (Eclipse Layout Kernel) layout engine. It " +
          "provides a React-friendly way to integrate ELK.js into your application.\n\n" +
          "## Usage\n\n" +
          "```tsx\n" +
          "const { isLoading, result } = useElk(elkConfig, elk);\n" +
          "```\n\n" +
          "### Parameters\n\n" +
          "- `elkConfig`: ElkNode configuration object that describes the graph structure and layout options\n" +
          "- `elk`: Instance of the ELK layout engine\n\n" +
          "### Returns\n\n" +
          "- `isLoading`: Boolean indicating if the layout computation is in progress\n" +
          "- `result`: The computed layout result containing node positions and edge routing information\n\n" +
          "## Layout Algorithms\n\n" +
          "ELK.js supports several layout algorithms that can be specified in the elkConfig:\n\n" +
          "- `box`: Pack the nodes like boxes\n" +
          "- `layered`: Hierarchical layout, good for DAGs and trees\n" +
          "- `force`: Force-directed layout\n" +
          "- `stress`: Stress-minimizing layout\n" +
          "- `mrtree`: Traditional tree layout\n" +
          "- `radial`: Radial layout\n" +
          "- `random`: Random node placement\n\n" +
          "## Example\n\n" +
          "```tsx\n" +
          "import React from 'react';\n" +
          "import { GraphCanvas, useGraph, useElk } from '@gravity-ui/graph';\n" +
          "import ELK from 'elkjs';\n\n" +
          "const elkConfig = {\n" +
          '  id: "root",\n' +
          "  children: [\n" +
          '    { id: "n1", width: 30, height: 30 },\n' +
          '    { id: "n2", width: 30, height: 30 }\n' +
          "  ],\n" +
          "  edges: [\n" +
          '    { id: "e1", sources: ["n1"], targets: ["n2"] }\n' +
          "  ],\n" +
          "  layoutOptions: {\n" +
          "    'algorithm': 'layered',\n" +
          "    'elk.direction': 'DOWN',\n" +
          "    'elk.spacing.nodeNode': '50'\n" +
          "  }\n" +
          "};\n\n" +
          "function MyGraphWithElk() {\n" +
          "  const elk = React.useMemo(() => new ELK(), []);\n" +
          "  const { graph } = useGraph();\n\n" +
          "  const { isLoading, result } = useElk(elkConfig, elk);\n\n" +
          "  React.useEffect(() => {\n" +
          "    if (!isLoading && result) {\n" +
          "      graph.setEntities({\n" +
          "        blocks: result.blocks,\n" +
          "        connections: result.edges\n" +
          "      });\n" +
          "    }\n" +
          "  }, [isLoading, result]);\n\n" +
          "  return <GraphCanvas graph={graph} />;\n" +
          "}\n" +
          "```\n\n" +
          "## Resources\n\n" +
          "- [ELK.js on GitHub](https://github.com/kieler/elkjs)\n" +
          "- [ELK Documentation](https://eclipse.dev/elk/documentation.html)\n" +
          "- [ELK Algorithm Documentation](https://eclipse.dev/elk/reference/algorithms.html)",
      },
    },
  },
  argTypes: {
    elkConfig: {
      control: "object",
      description: "ELK layout configuration object",
    },
    graphConfig: {
      control: "object",
      description: "Graph configuration with blocks and connections",
    },
  },
};

export default meta;

// Create a story for each algorithm
export const Box: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
Box.args = getExampleConfig(Algorithm.Box);

export const Layered: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
Layered.args = getExampleConfig(Algorithm.Layered);

export const Disco: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
Disco.args = getExampleConfig(Algorithm.Disco);

export const Radial: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
Radial.args = getExampleConfig(Algorithm.Radial);

export const MrTree: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
MrTree.args = getExampleConfig(Algorithm.MrTree);

export const Force: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
Force.args = getExampleConfig(Algorithm.Force);

export const Stress: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
Stress.args = getExampleConfig(Algorithm.Stress);

export const Random: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
Random.args = getExampleConfig(Algorithm.Random);

export const SporeOverlap: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
SporeOverlap.args = getExampleConfig(Algorithm.SporeOverlap);

export const SporeCompaction: StoryFn<typeof GraphApp> = (args) => <GraphApp {...args} />;
SporeCompaction.args = getExampleConfig(Algorithm.SporeCompaction);
