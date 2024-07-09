import "@gravity-ui/uikit/styles/styles.css";
import type { Meta, StoryFn } from "@storybook/react";
import React, { useRef } from "react";
import { GraphComponentStory } from "../main/GraphEditor";
import { generatePrettyBlocks } from "../configurations/generatePretty";
import { MiniMapLayer, LayerConfig, Graph, ECanChangeBlockGeometry } from "../../";
import { ThemeProvider } from "@gravity-ui/uikit";

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
          ...generatePrettyBlocks(10, 10),
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
