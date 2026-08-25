import React, { useCallback, useEffect } from "react";

import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph } from "../../../graph";
import { DevToolsLayer } from "../../../plugins/devtools/DevToolsLayer";
import { DEFAULT_DEVTOOLS_LAYER_PROPS } from "../../../plugins/devtools/constants";
import { TDevToolsLayerProps } from "../../../plugins/devtools/types";
import { GraphBlock, GraphCanvas, useGraph, useLayer } from "../../../react-components";
import { generatePrettyBlocks } from "../../configurations/generatePretty";

// Define some basic global styles directly or assume they exist globally
const storyContainerStyle: React.CSSProperties = {
  width: "100%",
  height: "600px",
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
    rulerBackdropBlur: args.rulerBackdropBlur,
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
  parameters: {
    docs: {
      description: {
        component:
          "## DevToolsLayer\n\n" +
          "The `DevToolsLayer` adds development helper tools on top of the graph:\n\n" +
          "- **Rulers:** Horizontal and vertical rulers along the viewport edges, showing world coordinates.\n" +
          "- **Crosshair:** A dynamic crosshair that follows the mouse cursor, displaying its current world coordinates.\n\n" +
          "All configurable parameters (color, size, blur) are controlled via the layer's props.",
      },
      source: {
        language: "tsx",
        code: `
import React from 'react';
import { GraphCanvas, useGraph, useLayer, DevToolsLayer } from '@gravity-ui/graph';

function MyGraphWithDevTools() {
  const { graph } = useGraph({
    settings: {
      canZoomCamera: true,
      canDragCamera: true,
    }
    /* Other graph config */
  });

  // Add the DevToolsLayer with desired options
  useLayer(graph, DevToolsLayer, {
    showRuler: true,
    showCrosshair: true,
    rulerSize: 20,
    // Example colors (using default values)
    rulerBackgroundColor: '${DEFAULT_DEVTOOLS_LAYER_PROPS.rulerBackgroundColor}',
    rulerTickColor: '${DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTickColor}',
    rulerTextColor: '${DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextColor}',
    crosshairColor: '${DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairColor}',
    crosshairTextColor: '${DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextColor}',
    crosshairTextBackgroundColor: '${DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextBackgroundColor}',
    rulerBackdropBlur: 5,
    // ... other TDevToolsLayerProps
  });

  // Add graph data and start in useEffect
  React.useEffect(() => {
    if (graph) {
      // Example: graph.setEntities({ blocks: [], connections: [] });
      // Example: graph.start();
      // Example: graph.zoomTo('center');
    }
  }, [graph]);

  return (
    <GraphCanvas
      graph={graph}
      // renderBlock={...} // Your block rendering function
    />
  );
}
        `,
      },
    },
  },
  argTypes: {
    showRuler: { control: "boolean", description: "Show/hide rulers" },
    showCrosshair: { control: "boolean", description: "Show/hide crosshair" },
    rulerSize: {
      control: { type: "range", min: 10, max: 50, step: 1 },
      description: "Thickness of the rulers (in pixels)",
    },
    minMajorTickDistance: {
      control: { type: "range", min: 20, max: 150, step: 5 },
      description: "Minimum screen distance between major ruler ticks (in screen pixels)",
    },
    rulerBackgroundColor: {
      control: "color",
      description: "Background color for the rulers (accepts standard CSS colors)",
    },
    rulerTickColor: {
      control: "color",
      description: "Color for the ruler ticks (accepts standard CSS colors)",
    },
    rulerTextColor: {
      control: "color",
      description: "Color for the ruler text labels (accepts standard CSS colors)",
    },
    rulerTextFont: { control: "text", description: "Font for the ruler text labels" },
    crosshairColor: {
      control: "color",
      description: "Color for the crosshair lines (accepts standard CSS colors)",
    },
    crosshairTextColor: {
      control: "color",
      description: "Color for the crosshair coordinate text (accepts standard CSS colors)",
    },
    crosshairTextFont: { control: "text", description: "Font for the crosshair coordinate text" },
    crosshairTextBackgroundColor: {
      control: "color",
      description: "Background color for the crosshair coordinate text (accepts standard CSS colors)",
    },
    rulerBackdropBlur: {
      control: { type: "range", min: 0, max: 20, step: 1 },
      description: "Blur strength for the background under the rulers (in pixels)",
    },
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
    rulerBackdropBlur: DEFAULT_DEVTOOLS_LAYER_PROPS.rulerBackdropBlur,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Export the story
export const Default: Story = {};
