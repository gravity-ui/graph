import { Block } from "../../components/canvas/blocks/Block";
import { TPoint } from "../../utils/types/shapes";

import { storiesSettings } from "./definitions";

type Rectangle = {
  center: TPoint;
  width: number;
  height: number;
};

function calculateConnectionLine(rectA: Rectangle, rectB: Rectangle): TPoint {
  const halfWidthA = rectA.width / 2;
  const halfHeightA = rectA.height / 2;
  const halfWidthB = rectB.width / 2;
  const halfHeightB = rectB.height / 2;

  const leftA = rectA.center.x - halfWidthA;
  const rightA = rectA.center.x + halfWidthA;
  const topA = rectA.center.y + halfHeightA;
  const bottomA = rectA.center.y - halfHeightA;

  const leftB = rectB.center.x - halfWidthB;
  const rightB = rectB.center.x + halfWidthB;
  const topB = rectB.center.y + halfHeightB;
  const bottomB = rectB.center.y - halfHeightB;

  let start: TPoint | null = null;

  if (rightA < leftB) {
    // RectA is to the left of RectB
    start = { x: rightA, y: rectA.center.y };
  } else if (leftA > rightB) {
    // RectA is to the right of RectB
    start = { x: leftA, y: rectA.center.y };
  } else if (bottomA > topB) {
    // RectA is above RectB
    start = { x: rectA.center.x, y: bottomA };
  } else if (topA < bottomB) {
    // RectA is below RectB
    start = { x: rectA.center.x, y: topA };
  } else {
    throw new Error("Rectangles intersect, unable to draw a connecting line.");
  }

  if (!start) {
    throw new Error("Unable to calculate starting points.");
  }

  return start;
}

class BlockWithCustomConnectionsPoints extends Block {
  public override getConnectionPoint(direction: "in" | "out", target: Block): TPoint {
    const nodeA: Rectangle = {
      center: { x: this.state.x + this.state.width / 2, y: this.state.y + this.state.height / 2 },
      height: this.state.height,
      width: this.state.width,
    };
    const nodeB: Rectangle = {
      center: { x: target.state.x + target.state.width / 2, y: target.state.y + target.state.height / 2 },
      height: target.state.height,
      width: target.state.width,
    };
    try {
      return calculateConnectionLine(nodeA, nodeB);
    } catch (error) {
      // default if error
      return {
        x: this.state.x + (direction === "out" ? this.state.width : 0),
        y: (this.state.y + this.state.height / 2) | 0,
      };
    }
  }
}

export const customConnectionsPointsGraphConfig = {
  configurationName: "graph with custom connections points",
  blocks: [
    {
      x: 250,
      y: 0,
      width: 200,
      height: 150,
      id: "block-1708813283240-1",
      is: "BlockWithCustomConnectionsPoints",
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
      is: "BlockWithCustomConnectionsPoints",
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
      is: "BlockWithCustomConnectionsPoints",
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
      is: "BlockWithCustomConnectionsPoints",
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
    useBezierConnections: false,
    blockComponents: {
      BlockWithCustomConnectionsPoints: BlockWithCustomConnectionsPoints,
    },
  },
};
