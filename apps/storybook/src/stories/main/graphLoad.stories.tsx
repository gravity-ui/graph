import React, { useState } from "react";

import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../configurations/generatePretty";

import { GraphApp, graphEditorMeta } from "./GraphEditorExample";

const meta: Meta<typeof GraphApp> = {
  ...graphEditorMeta,
  id: "stories-main-grapheditor",
  title: "Scene/Diagnostics/Stock connections",
  argTypes: {
    ...graphEditorMeta.argTypes,
    renderer: { control: "inline-radio", options: ["canvas", "webgl"] },
  },
};

export default meta;
type Story = StoryObj<typeof GraphApp>;

export const GraphStressTest: Story = {
  name: "Straight connection load",
  args: { renderer: "canvas", useBezierConnections: false },
  render: function Render(args) {
    const [config] = useState(() =>
      generatePrettyBlocks({
        seed: 7,
        layersCount: 110,
        connectionsPerLayer: 1000,
        overrideSettings: { useBezierConnections: false },
      })
    );
    return <GraphApp {...args} config={config} />;
  },
};

export const NirvanaMaxGraphTest: Story = {
  name: "Nirvana overview",
  args: { renderer: "canvas" },
  render: function Render(args) {
    const [config] = useState(() =>
      generatePrettyBlocks({
        seed: 7,
        layersCount: 55,
        connectionsPerLayer: 400,
        overrideSettings: { useBezierConnections: true },
      })
    );
    return <GraphApp {...args} config={config} />;
  },
};
