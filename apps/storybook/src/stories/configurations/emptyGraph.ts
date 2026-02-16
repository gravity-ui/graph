import { TGraphConfig } from "../../graph";

import { storiesSettings } from "./definitions";

export const emptyGraphConfig: TGraphConfig = {
  configurationName: "emptyGraph",
  blocks: [],
  connections: [],
  cameraScale: 1,
  rect: {
    x: -400,
    y: -300,
    width: 800,
    height: 600,
  },
  settings: storiesSettings,
};
