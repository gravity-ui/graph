import { TGraphConfig } from "@gravity-ui/graph";

import { ToolboxLayer } from "../main/ToolboxLayer";

import { storiesSettings } from "./definitions";

export const CustomLayerConfig: TGraphConfig = {
  blocks: [
    {
      x: 265,
      y: 334,
      width: 200,
      height: 160,
      id: "Lonely block without anchors",
      is: "Block",
      selected: false,
      name: "one block",
      anchors: [],
    },
  ],
  connections: [],
  settings: storiesSettings,
  layers: [[ToolboxLayer, {}]],
};
