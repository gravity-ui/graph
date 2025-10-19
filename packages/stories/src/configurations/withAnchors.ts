import { TAnchor } from "@gravity-ui/graphcanvas/anchors";
import { TGraphConfig } from "@gravity-ui/graph";

import { EAnchorType, storiesSettings } from "./definitions";

export const withAnchorsConfig: TGraphConfig = {
  configurationName: "simple",
  cameraScale: 0.5,
  blocks: [
    {
      x: 265,
      y: 334,
      width: 200,
      height: 300,
      id: "Left",
      is: "Block",
      selected: false,
      name: "left blocks",
      anchors: [
        {
          id: "anchor-left-1",
          blockId: "Left",
          type: EAnchorType.OUT,
          index: 0,
        },
        {
          id: "anchor-left-2",
          blockId: "Left",
          type: EAnchorType.OUT,
          index: 1,
        },
        {
          id: "anchor-left-3",
          blockId: "Left",
          type: EAnchorType.OUT,
          index: 2,
        },
        {
          id: "anchor-left-4",
          blockId: "Left",
          type: EAnchorType.IN,
          index: 0,
        },
      ] as TAnchor[],
    },
    {
      x: 565,
      y: 334,
      width: 200,
      height: 300,
      id: "Right",
      is: "Block",
      selected: false,
      name: "right block",
      anchors: [
        {
          id: "anchor-right-1",
          blockId: "Right",
          type: EAnchorType.IN,
          index: 0,
        },
        {
          id: "anchor-right-2",
          blockId: "Right",
          type: EAnchorType.IN,
          index: 1,
        },
        {
          id: "anchor-right-3",
          blockId: "Right",
          type: EAnchorType.OUT,
          index: 0,
        },
      ] as TAnchor[],
    },
  ],
  connections: [],
  rect: {
    x: -156,
    y: 0,
    width: 631,
    height: 494,
  },
  settings: {
    ...storiesSettings,
    useBezierConnections: true,
  },
};
