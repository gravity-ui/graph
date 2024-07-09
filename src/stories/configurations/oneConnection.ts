import { storiesSettings } from "./definitions";
import { TGraphConfig } from "../../graph";

export const oneStraightConfig: TGraphConfig = {
  configurationName: "simple",
  blocks: [
    {
      x: 265,
      y: 334,
      width: 200,
      height: 160,
      id: "Left",
      is: "Block",
      selected: false,
      name: "Left block",
      anchors: [],
    },
    {
      x: 565,
      y: 234,
      width: 200,
      height: 160,
      id: "Right",
      is: "Block",
      selected: false,
      name: "Right block",
      anchors: [],
    },
  ],
  connections: [
    {
      sourceBlockId: "Left",
      targetBlockId: "Right",
    },
  ],
  settings: {
    ...storiesSettings,
    useBezierConnections: false,
  },
  cameraScale: 0.5,
  rect: {
    x: -156,
    y: 0,
    width: 631,
    height: 494,
  },
};
