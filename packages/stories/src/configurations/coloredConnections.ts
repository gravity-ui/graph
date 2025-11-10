import { TGraphConfig } from "@gravity-ui/graph";

import { storiesSettings } from "./definitions";

export const coloredConnections: TGraphConfig = {
  blocks: [
    {
      x: 265,
      y: 334,
      width: 200,
      height: 160,
      id: "One",
      is: "Block",
      selected: false,
      name: "One",
      anchors: [],
    },
    {
      x: 565,
      y: 30,
      width: 200,
      height: 160,
      id: "Two",
      is: "Block",
      selected: false,
      name: "Two",
      anchors: [],
    },
    {
      x: 565,
      y: 234,
      width: 200,
      height: 160,
      id: "Three",
      is: "Block",
      selected: false,
      name: "Three",
      anchors: [],
    },
    {
      x: 565,
      y: 430,
      width: 200,
      height: 160,
      id: "Four",
      is: "Block",
      selected: false,
      name: "Four",
      anchors: [],
    },
    {
      x: 565,
      y: 630,
      width: 200,
      height: 160,
      id: "Five",
      is: "Block",
      selected: false,
      name: "Five",
      anchors: [],
    },
  ],
  connections: [
    {
      sourceBlockId: "One",
      targetBlockId: "Two",
    },
    {
      sourceBlockId: "One",
      targetBlockId: "Three",
      styles: {
        background: "rgb(48, 170, 110)",
        selectedBackground: "rgb(45, 139, 93)",
      },
    },
    {
      sourceBlockId: "One",
      targetBlockId: "Four",
      styles: {
        background: "rgb(255, 190, 92)",
        selectedBackground: "rgb(211, 158, 80)",
      },
    },
    {
      sourceBlockId: "One",
      targetBlockId: "Five",
      styles: {
        background: "rgb(233, 3, 58)",
        selectedBackground: "rgb(189, 9, 53)",
      },
    },
  ],
  settings: {
    ...storiesSettings,
    useBezierConnections: true,
  },
};
