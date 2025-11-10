import { TGraphConfig } from "@gravity-ui/graph";

import { storiesSettings } from "./definitions";

export const oneBlockConfig: TGraphConfig = {
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
};
