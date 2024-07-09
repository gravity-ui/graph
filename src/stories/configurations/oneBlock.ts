import { TGraphConfig } from "../../graph";
import { storiesSettings } from "./definitions";

export const oneBlockConfig: TGraphConfig = {
  configurationName: "simple",
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
  cameraScale: 0.9,
  rect: {
    x: -156,
    y: 0,
    width: 631,
    height: 494,
  },
  settings: storiesSettings,
};
