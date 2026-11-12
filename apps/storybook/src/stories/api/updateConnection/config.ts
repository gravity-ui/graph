import { TGraphConfig } from "@gravity-ui/graph";

import { storiesSettings } from "../../configurations/definitions";

export const graphConfig: TGraphConfig = {
  configurationName: "simple",
  blocks: [
    {
      x: 265,
      y: 334,
      width: 200,
      height: 160,
      id: "OneLeft",
      is: "Block",
      name: "OneLeft",
      anchors: [],
    },
    {
      x: 265,
      y: 594,
      width: 200,
      height: 160,
      id: "TwoLeft",
      is: "Block",
      name: "TwoLeft",
      anchors: [],
    },
    {
      x: 565,
      y: 334,
      width: 200,
      height: 160,
      id: "OneRight",
      is: "Block",
      name: "OneRight",
      anchors: [],
    },
    {
      x: 565,
      y: 594,
      width: 200,
      height: 160,
      id: "TwoRight",
      is: "Block",
      name: "TwoRight",
      anchors: [],
    },
  ],
  connections: [
    {
      sourceBlockId: "OneLeft",
      targetBlockId: "TwoRight",
      styles: {
        background: "rgb(255, 190, 92)",
        selectedBackground: "rgb(211, 158, 80)",
      },
    },
  ],
  settings: {
    ...storiesSettings,
    useBezierConnections: true,
  },
  cameraScale: 0.5,
  rect: {
    x: -156,
    y: 0,
    width: 631,
    height: 494,
  },
};
