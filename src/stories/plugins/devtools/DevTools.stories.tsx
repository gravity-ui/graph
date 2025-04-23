import React, { useCallback, useEffect } from "react";

import type { Meta, StoryObj } from "@storybook/react";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph } from "../../../graph";
import { DevToolsLayer } from "../../../plugins/devtools/DevToolsLayer";
import { DEFAULT_DEVTOOLS_LAYER_PROPS } from "../../../plugins/devtools/constants";
import { TDevToolsLayerProps } from "../../../plugins/devtools/types";
import { GraphBlock, GraphCanvas, useGraph, useLayer } from "../../../react-component";
import { generatePrettyBlocks } from "../../configurations/generatePretty";

// Define some basic global styles directly or assume they exist globally
const storyContainerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: "600px",
  position: "relative",
  display: "flex",
};

// Helper component to render basic blocks for the story
const RenderBlock = ({ graph, block }: { graph: Graph; block: TBlock }) => {
  return (
    <GraphBlock graph={graph} block={block}>
      {block.name}
    </GraphBlock>
  );
};

// Storybook Component Template
const DevToolsStoryComponent = (args: Omit<TDevToolsLayerProps, "graph" | "camera" | "root" | "emitter">) => {
  const { graph } = useGraph({
    settings: {
      canZoomCamera: true,
      canDragCamera: true,
    },
  });

  // Add the DevToolsLayer using the useLayer hook
  useLayer(graph, DevToolsLayer, {
    showRuler: args.showRuler,
    showCrosshair: args.showCrosshair,
    rulerSize: args.rulerSize,
    minMajorTickDistance: args.minMajorTickDistance,
    rulerBackgroundColor: args.rulerBackgroundColor,
    rulerTickColor: args.rulerTickColor,
    rulerTextColor: args.rulerTextColor,
    rulerTextFont: args.rulerTextFont,
    crosshairColor: args.crosshairColor,
    crosshairTextColor: args.crosshairTextColor,
    crosshairTextFont: args.crosshairTextFont,
    crosshairTextBackgroundColor: args.crosshairTextBackgroundColor,
  });

  // Load initial data and start graph
  useEffect(() => {
    if (graph) {
      // Generate graph data using the utility
      const generatedData = generatePrettyBlocks({
        layersCount: 10,
        connectionsPerLayer: 30,
        dashedLine: true,
      });
      graph.setEntities({ blocks: generatedData.blocks, connections: generatedData.connections });
      graph.start();
      graph.zoomTo("center", { padding: 50 });
    }
  }, [graph]);

  // Memoize renderBlock function
  const renderBlockCallback = useCallback((g: Graph, block: TBlock) => <RenderBlock graph={g} block={block} />, []);

  return (
    <div style={storyContainerStyle}>
      <GraphCanvas graph={graph} renderBlock={renderBlockCallback} />
    </div>
  );
};

// Storybook Meta Configuration
const meta: Meta<typeof DevToolsStoryComponent> = {
  title: "Plugins/DevTools",
  component: DevToolsStoryComponent,
  tags: ["autodocs"],
  argTypes: {
    showRuler: { control: "boolean" },
    showCrosshair: { control: "boolean" },
    rulerSize: { control: { type: "range", min: 10, max: 50, step: 1 } },
    minMajorTickDistance: { control: { type: "range", min: 20, max: 150, step: 5 } },
    rulerBackgroundColor: { control: "color" },
    rulerTickColor: { control: "color" },
    rulerTextColor: { control: "color" },
    rulerTextFont: { control: "text" },
    crosshairColor: { control: "color" },
    crosshairTextColor: { control: "color" },
    crosshairTextFont: { control: "text" },
    crosshairTextBackgroundColor: { control: "color" },
  },
  args: {
    // Default values for story controls, matching layer defaults
    showRuler: DEFAULT_DEVTOOLS_LAYER_PROPS.showRuler,
    showCrosshair: DEFAULT_DEVTOOLS_LAYER_PROPS.showCrosshair,
    rulerSize: DEFAULT_DEVTOOLS_LAYER_PROPS.rulerSize,
    minMajorTickDistance: DEFAULT_DEVTOOLS_LAYER_PROPS.minMajorTickDistance,
    rulerBackgroundColor: DEFAULT_DEVTOOLS_LAYER_PROPS.rulerBackgroundColor,
    rulerTickColor: DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTickColor,
    rulerTextColor: DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextColor,
    rulerTextFont: DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextFont,
    crosshairColor: DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairColor,
    crosshairTextColor: DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextColor,
    crosshairTextFont: DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextFont,
    crosshairTextBackgroundColor: DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextBackgroundColor,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Export the story
export const Default: Story = {};
