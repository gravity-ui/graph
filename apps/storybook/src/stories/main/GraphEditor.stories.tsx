import React from "react";

import type { TStyleRule } from "@gravity-ui/graph";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { CustomLayerConfig } from "../configurations/CustomLayerConfig";
import { oneBezierConnectionConfig } from "../configurations/bezierConnection";
import { coloredConnections } from "../configurations/coloredConnections";
import { customBlockRules, customSchematicViewConfig } from "../configurations/customBlocksView";
import { emptyGraphConfig } from "../configurations/emptyGraph";
import { generatePrettyBlocks } from "../configurations/generatePretty";
import { oneBlockConfig } from "../configurations/oneBlock";
import { oneStraightConfig } from "../configurations/oneConnection";
import { verticalGraphConfig } from "../configurations/verticalGraph";
import { withAnchorsConfig } from "../configurations/withAnchors";

import { GraphApp, graphEditorMeta } from "./GraphEditorExample";

import "@gravity-ui/uikit/styles/styles.css";

const meta: Meta<typeof GraphApp> = { ...graphEditorMeta };
export default meta;
type Story = StoryObj<typeof GraphApp>;

export const OneBlock: Story = {
  render: (args) => <GraphApp {...args} config={oneBlockConfig}></GraphApp>,
};

export const OneStraightConnection: Story = {
  args: {
    useBezierConnections: false,
  },
  render: (args) => <GraphApp {...args} config={oneStraightConfig}></GraphApp>,
};

export const OneBezierConnection: Story = {
  render: (args) => <GraphApp {...args} config={oneBezierConnectionConfig}></GraphApp>,
};

export const ColoredConnections: Story = {
  render: (args) => <GraphApp {...args} config={coloredConnections}></GraphApp>,
};

export const WithAnchors: Story = {
  render: (args) => <GraphApp {...args} config={withAnchorsConfig}></GraphApp>,
};

export const HundredBlocks: Story = {
  render: (args) => (
    <GraphApp
      {...args}
      config={generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 100, dashedLine: true })}
    ></GraphApp>
  ),
};

export const ThousandBlocks: Story = {
  render: (args) => (
    <GraphApp {...args} config={generatePrettyBlocks({ layersCount: 25, connectionsPerLayer: 200 })}></GraphApp>
  ),
};

export const FiveThousandsBlocks: Story = {
  args: {
    useBezierConnections: false,
  },
  render: (args) => (
    <GraphApp {...args} config={generatePrettyBlocks({ layersCount: 40, connectionsPerLayer: 300 })}></GraphApp>
  ),
};

export const CustomSchematicBlock: Story = {
  render: (args) => (
    <GraphApp {...args} config={customSchematicViewConfig} rules={customBlockRules as readonly TStyleRule[]}></GraphApp>
  ),
};
export const CustomLayer: Story = {
  render: (args) => <GraphApp {...args} config={CustomLayerConfig}></GraphApp>,
};

export const VerticalGraph: Story = {
  render: (args) => <GraphApp {...args} config={verticalGraphConfig}></GraphApp>,
};

export const SnappingGraph: Story = {
  render: (args) => (
    <GraphApp
      {...args}
      config={generatePrettyBlocks({ layersCount: 4, connectionsPerLayer: 100 })}
      constants={{ block: { SNAPPING_GRID_SIZE: 60 } }}
    ></GraphApp>
  ),
};

export const EmptyGraph: Story = {
  render: (args) => <GraphApp {...args} config={emptyGraphConfig}></GraphApp>,
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates behavior of an empty graph. This tests the fix for HitTest service where waitUsableRectUpdate would never resolve for graphs initialized without elements.",
      },
    },
  },
};
