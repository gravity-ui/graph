import React from "react";

import { BlockConnection } from "@gravity-ui/graph";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { GeneratedConnections, rendererControl } from "./ConnectionScene";
import type { ConnectionArgs } from "./ConnectionScene";
import { gradientCode, runningDashCode, stressCode } from "./codeSamples";
import { gradientLines, runningDash } from "./lines";

type LoadArgs = ConnectionArgs & { connectionsPerLayer: number };
const meta: Meta<LoadArgs> = {
  id: "canvas-webglconnections",
  title: "Scene/Diagnostics/Connection load",
  args: { renderer: "webgl" },
  argTypes: {
    renderer: rendererControl,
    connectionsPerLayer: { name: "Connections per layer", control: "select", options: [50, 400, 1000] },
  },
  parameters: { layout: "fullscreen" },
};
export default meta;

const styles = {
  plain: { connection: BlockConnection, code: stressCode },
  dash: { connection: runningDash, code: runningDashCode },
  gradient: { connection: gradientLines, code: gradientCode },
};

type StyledLoadArgs = LoadArgs & { effect: keyof typeof styles };
const styleControl = {
  name: "Connection style",
  options: Object.keys(styles),
  control: { type: "select", labels: { plain: "Solid", dash: "Dash flow", gradient: "Gradient" } },
} satisfies NonNullable<Meta<StyledLoadArgs>["argTypes"]>["effect"];

export const GraphStress: StoryObj<StyledLoadArgs> = {
  name: "Straight connections",
  args: { connectionsPerLayer: 1000, effect: "plain" },
  argTypes: { effect: styleControl },
  render: ({ effect, ...args }) => (
    <GeneratedConnections
      {...args}
      {...styles[effect]}
      variant={effect}
      layersCount={110}
      useBezierConnections={false}
      instruction="Compare straight connections across 110 layers. Switch the renderer or connection style and pan across the same graph."
    />
  ),
};

const nirvanaMiddle = { x: 31000, y: -1500, width: 5000, height: 3000 };
export const NirvanaEffects: StoryObj<StyledLoadArgs> = {
  name: "Nirvana effects",
  args: { effect: "dash", connectionsPerLayer: 400 },
  argTypes: { effect: styleControl },
  render: ({ effect, ...args }) => (
    <GeneratedConnections
      {...args}
      {...styles[effect]}
      variant={effect}
      layersCount={55}
      initialView={nirvanaMiddle}
      instruction="Compare the solid stroke, running dashes and the gradient across dense Bézier crossings. Pan and zoom to see the same routes at different scales."
    />
  ),
};
