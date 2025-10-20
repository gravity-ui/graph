import React, { useRef } from "react";

import { Constructor, ECanChangeBlockGeometry, Graph, LayerConfig, MiniMapLayer } from "@gravity-ui/graph";
import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../configurations/generatePretty";
import { GraphComponentStory } from "../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const layers: LayerConfig<Constructor<MiniMapLayer>>[] = [
  [
    MiniMapLayer,
    {
      location: "topLeft",
      cameraBorderColor: "var(--g-color-private-yellow-550-solid)",
      cameraBorderSize: 2,
      width: 200,
      height: 200,
    },
  ],
];

const GraphApp = () => {
  const graphRef = useRef<Graph | undefined>(undefined);

  return (
    <ThemeProvider theme={"light"}>
      <GraphComponentStory
        graphRef={graphRef}
        config={{
          ...generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10 }),
          layers,
          settings: { canChangeBlockGeometry: ECanChangeBlockGeometry.ALL },
        }}
      />
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Plugins/MiniMap",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
