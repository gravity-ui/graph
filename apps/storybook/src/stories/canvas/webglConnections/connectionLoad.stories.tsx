import React from "react";

import { BlockConnection } from "@gravity-ui/graph";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import {
  GeneratedConnections,
  rendererControl,
  shaderControls,
  shaderDefaults,
  useShaderControls,
} from "./ConnectionScene";
import type { ConnectionArgs, ShaderArgs } from "./ConnectionScene";
import {
  cometsCode,
  glowCode,
  gradientCode,
  particlesCode,
  perConnectionCode,
  pipelineCode,
  runningDashCode,
  signalWaveCode,
  stillDashCode,
  stressCode,
} from "./codeSamples";
import {
  comets,
  dataStyled,
  glowLines,
  gradientLines,
  particleLines,
  pipeline,
  runningDash,
  signalWave,
  stillDash,
} from "./lines";

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

const straight = {
  plain: { connection: BlockConnection, code: stressCode },
  dash: { connection: runningDash, code: runningDashCode },
  style: { connection: dataStyled, code: perConnectionCode },
};

export const GraphStress: StoryObj<LoadArgs & { effect: keyof typeof straight }> = {
  name: "Straight connections",
  args: { connectionsPerLayer: 1000, effect: "plain" },
  argTypes: { effect: { name: "Connection style", control: "select", options: Object.keys(straight) } },
  render: ({ effect, ...args }) => (
    <GeneratedConnections
      {...args}
      {...straight[effect]}
      variant={effect}
      layersCount={110}
      useBezierConnections={false}
      instruction="Compare straight connections across 110 layers. Switch the renderer or connection style and pan across the same graph."
    />
  ),
};

const effects = {
  pipeline: { connection: pipeline, code: pipelineCode },
  comets: { connection: comets, code: cometsCode },
  wave: { connection: signalWave, code: signalWaveCode },
  particles: { connection: particleLines, code: particlesCode },
  gradient: { connection: gradientLines, code: gradientCode },
  glow: { connection: glowLines, code: glowCode },
  still: { connection: stillDash, code: stillDashCode },
};

const nirvanaMiddle = { x: 31000, y: -1500, width: 5000, height: 3000 };
type NirvanaArgs = LoadArgs & ShaderArgs & { effect: keyof typeof effects };

function NirvanaScene(args: NirvanaArgs) {
  useShaderControls(args);
  return (
    <GeneratedConnections
      {...args}
      {...effects[args.effect]}
      variant={args.effect}
      layersCount={55}
      initialView={nirvanaMiddle}
      instruction="The middle layers of the Nirvana fixture show dense Bézier crossings. Compare a mix of effects with a single shader, then pan and zoom."
    />
  );
}

export const NirvanaEffects: StoryObj<NirvanaArgs> = {
  name: "Nirvana effects",
  args: { effect: "pipeline", connectionsPerLayer: 400, ...shaderDefaults },
  argTypes: {
    effect: { name: "Effect", control: "select", options: Object.keys(effects) },
    ...shaderControls,
  },
  render: (args) => <NirvanaScene {...args} />,
};
