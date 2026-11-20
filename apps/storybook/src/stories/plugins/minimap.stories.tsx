import React, { useLayoutEffect, useRef, useState } from "react";

import { ECanDrag, Graph } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../configurations/generatePretty";
import { GraphComponentStory } from "../main/GraphEditor";

import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-minimap/styles.css";
import "@gravity-ui/uikit/styles/styles.css";

type MiniMapArgs = { minimap: boolean };

const GraphApp = ({ minimap }: MiniMapArgs) => {
  const graphRef = useRef<Graph | undefined>(undefined);
  const [config] = useState(() => ({
    ...generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10 }),
    settings: { canDrag: ECanDrag.ALL },
  }));

  useLayoutEffect(() => {
    const graph = graphRef.current;
    if (!minimap || !graph) return undefined;
    const layer = graph.addLayer(MiniMapLayer, {
      location: "topLeft",
      cameraBorderColor: "var(--g-color-private-yellow-550-solid)",
      cameraBorderSize: 2,
      width: 200,
      height: 200,
    });
    return () => graph.removeLayer(layer);
  }, [minimap]);

  return (
    <ThemeProvider theme={"light"}>
      <GraphComponentStory graphRef={graphRef} config={config} />
    </ThemeProvider>
  );
};

const meta: Meta<MiniMapArgs> = {
  title: "Plugins/MiniMap",
  component: GraphApp,
  args: { minimap: false },
  argTypes: { minimap: { name: "Minimap", control: "boolean" } },
};

export default meta;

export const Default: StoryFn<MiniMapArgs> = (args) => <GraphApp {...args} />;
