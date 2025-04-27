import { TBlock } from "../../../components/canvas/blocks/Block";

export const DEVTOOLS_STORY_BLOCKS: TBlock[] = [
  {
    id: "b1",
    is: "block",
    name: "Block 1",
    x: 150,
    y: 100,
    width: 120,
    height: 80,
    selected: false,
    anchors: [],
  },
  {
    id: "b2",
    is: "block",
    name: "Block 2",
    x: 400,
    y: 250,
    width: 150,
    height: 60,
    selected: false,
    anchors: [],
  },
  {
    id: "b3",
    is: "block",
    name: "Block 3 (near origin)",
    x: -50,
    y: -30,
    width: 100,
    height: 100,
    selected: false,
    anchors: [],
  },
];
