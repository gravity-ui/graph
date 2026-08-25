import React from "react";

import { Meta, StoryFn } from "@storybook/react/*";

import { GraphPLayground } from "./GraphPlayground";

const meta: Meta = {
  title: "Playground",
  component: GraphPLayground,
};

export default meta;

export const Default: StoryFn = () => <GraphPLayground />;
