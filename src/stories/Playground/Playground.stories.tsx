import React from "react";

import { Meta, StoryFn } from "@storybook/react/*";

import { GraphPLayground } from "./GraphPlayground";

const meta: Meta = {
  title: "Playground/playgground",
  component: GraphPLayground,
};

export default meta;

export const Default: StoryFn = () => <GraphPLayground />;
