import { Block } from "@gravity-ui/graph";
import { TPoint } from "@gravity-ui/graph";

import { storiesSettings } from "./definitions";

class VerticalBlock extends Block {
  public override getConnectionPoint(direction: "in" | "out"): TPoint {
    return {
      x: (this.state.x + this.state.width / 2) | 0,
      y: this.state.y + (direction === "out" ? this.state.height : 0),
    };
  }
}

export const verticalGraphConfig = {
  configurationName: "simple vertical graph",
  blocks: [
    {
      x: 250,
      y: 0,
      width: 200,
      height: 150,
      id: "block-1708813283240-1",
      is: "verticalBlock",
      selected: false,
      name: "block-1708813283240-1",
      anchors: [],
    },
    {
      x: 536,
      y: 421,
      width: 200,
      height: 150,
      id: "block-1708813283240-2",
      is: "verticalBlock",
      selected: false,
      name: "block-1708813283240-2",
      anchors: [],
    },
    {
      x: -12,
      y: 412,
      width: 200,
      height: 150,
      id: "block-1708813283240-3",
      is: "verticalBlock",
      selected: false,
      name: "block-1708813283240-3",
      anchors: [],
    },
    {
      x: 273,
      y: 768,
      width: 200,
      height: 150,
      id: "block-1708813283240-4",
      is: "verticalBlock",
      selected: false,
      name: "block-1708813283240-4",
      anchors: [],
    },
  ],
  connections: [
    {
      sourceBlockId: "block-1708813283240-1",
      targetBlockId: "block-1708813283240-2",
    },
    {
      sourceBlockId: "block-1708813283240-1",
      targetBlockId: "block-1708813283240-3",
    },
    {
      sourceBlockId: "block-1708813283240-2",
      targetBlockId: "block-1708813283240-4",
    },
  ],
  rect: {
    x: -500,
    y: -2000,
    width: 2000,
    height: 2000,
  },
  cameraXY: {
    x: 375,
    y: 98,
  },
  cameraScale: 0.19,
  settings: {
    ...storiesSettings,
    showConnectionLabels: true,
    useBezierConnections: true,
    bezierConnectionDirection: "vertical",
    blockComponents: {
      verticalBlock: VerticalBlock,
    },
  },
};
