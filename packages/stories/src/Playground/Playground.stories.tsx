import React from "react";

import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { GraphPLayground } from "./GraphPlayground";

const meta: Meta = {
  title: "Playground",
  component: GraphPLayground,
};

export default meta;

export const Default: StoryFn = () => <GraphPLayground />;
