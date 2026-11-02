import React, { useEffect, useRef } from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { Graph } from "../../../graph";
import { initGraphColors, initGraphConstants } from "../../../graphConfig";
import type { TGridLayer } from "../../../graphConfig";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { GraphComponentStory } from "../../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

type TBelowLayerStoryArgs = {
  gridLayers: TGridLayer[];
  fadeFrom: number;
  fadeTo: number;
  dotScaleLimit: number;
  belowLayerBackground: string;
  layerBackground: string;
  dots: string;
  border: string;
};

const config = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10, dashedLine: true });

const BelowLayerStory = ({
  gridLayers,
  fadeFrom,
  fadeTo,
  dotScaleLimit,
  belowLayerBackground,
  layerBackground,
  dots,
  border,
}: TBelowLayerStoryArgs): React.JSX.Element => {
  const graphRef = useRef<Graph | undefined>(undefined);

  // GraphComponentStory assigns graphRef during render, so it is set before these effects run
  useEffect(() => {
    graphRef.current?.setConstants({
      system: {
        GRID_LAYERS: gridLayers,
        GRID_LAYER_FADE: [fadeFrom, fadeTo],
        GRID_DOT_SCALE_LIMIT: dotScaleLimit,
      },
    });
  }, [gridLayers, fadeFrom, fadeTo, dotScaleLimit]);

  useEffect(() => {
    graphRef.current?.setColors({
      canvas: { belowLayerBackground, layerBackground, dots, border },
    });
  }, [belowLayerBackground, layerBackground, dots, border]);

  return (
    <ThemeProvider theme={"light"}>
      <GraphComponentStory graphRef={graphRef} config={config}></GraphComponentStory>
    </ThemeProvider>
  );
};

const { GRID_LAYERS, GRID_LAYER_FADE, GRID_DOT_SCALE_LIMIT } = initGraphConstants.system;

const DEFAULT_ARGS: TBelowLayerStoryArgs = {
  gridLayers: GRID_LAYERS.map((layer) => ({ ...layer })),
  fadeFrom: GRID_LAYER_FADE[0],
  fadeTo: GRID_LAYER_FADE[1],
  dotScaleLimit: GRID_DOT_SCALE_LIMIT,
  belowLayerBackground: initGraphColors.canvas.belowLayerBackground,
  layerBackground: initGraphColors.canvas.layerBackground,
  dots: initGraphColors.canvas.dots,
  border: initGraphColors.canvas.border,
};

const meta: Meta<typeof BelowLayerStory> = {
  title: "Api/gridLayers",
  component: BelowLayerStory,
  args: DEFAULT_ARGS,
  argTypes: {
    gridLayers: {
      control: "object",
      description:
        "`GRID_LAYERS`: `[{ step, dotSize }]` — `step` in `GRID_SIZE` units, `dotSize` is a dot diameter in CSS px. " +
        "Invalid layers are ignored.",
      table: { category: "Grid" },
    },
    fadeFrom: {
      control: { type: "range", min: 0, max: 40, step: 1 },
      description: "`GRID_LAYER_FADE[0]`: on-screen step (CSS px) at which a layer starts to fade in",
      table: { category: "Grid" },
    },
    fadeTo: {
      control: { type: "range", min: 0, max: 80, step: 1 },
      description: "`GRID_LAYER_FADE[1]`: on-screen step (CSS px) at which a layer is fully visible",
      table: { category: "Grid" },
    },
    dotScaleLimit: {
      control: { type: "range", min: 0, max: 1, step: 0.005 },
      description: "`GRID_DOT_SCALE_LIMIT`: camera scale below which dots shrink with the world (0 — no limit)",
      table: { category: "Grid" },
    },
    belowLayerBackground: {
      control: "color",
      description: "`colors.canvas.belowLayerBackground`: background outside the usable rect",
      table: { category: "Colors" },
    },
    layerBackground: {
      control: "color",
      description: "`colors.canvas.layerBackground`: background of the usable rect",
      table: { category: "Colors" },
    },
    dots: {
      control: "color",
      description: "`colors.canvas.dots`: grid dot color",
      table: { category: "Colors" },
    },
    border: {
      control: "color",
      description: "`colors.canvas.border`: usable rect border",
      table: { category: "Colors" },
    },
  },
};

export default meta;

type TStory = StoryObj<typeof meta>;

export const Default: TStory = {};

export const DarkCanvas: TStory = {
  args: {
    belowLayerBackground: "#2d2d2d",
    layerBackground: "#3d3d3d",
    dots: "#6d6d6d",
    border: "#2d2d2d",
  },
};

// Coarse enough to be visible right away: the story fits the graph at a scale of about 0.05
export const TwoLayers: TStory = {
  args: {
    gridLayers: [
      { step: 5, dotSize: 2 },
      { step: 25, dotSize: 3.6 },
    ],
    fadeFrom: 8,
    fadeTo: 20,
  },
};

export const NoDotLimit: TStory = {
  args: {
    dotScaleLimit: 0,
  },
};
