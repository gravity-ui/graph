import { TGraphConfig } from "@gravity-ui/graph";

import { storiesSettings } from "./definitions";

export const oneStraightConfig: TGraphConfig = {
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
};
