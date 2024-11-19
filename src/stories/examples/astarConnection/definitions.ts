import { ECanChangeBlockGeometry, TGraphConfig } from "../../../index";

export const AstarBlockIs = "astar-block";
export const AstarConnectionIs = "astar-connection";

export const ASTAR_BLOCK_MARGIN = 10;
export const ASTAR_LINE_MARGIN = 10;
export const ASTAR_STEP = 10;
export const ASTAR_SEARCH_THRESHOLD = 50000;
export const ASTAR_CHANGE_DIRECTION_RATIO = 10;
export const ASTAR_LINE_OCCUPIED_RATIO = 10;

export const config: TGraphConfig = {
  configurationName: "AstarGraph",
  blocks: [
    {
      id: "action_1",
      is: AstarBlockIs,
      x: -80,
      y: 343,
      width: 126,
      height: 126,
      selected: true,
      name: "Block #1",
      anchors: [
        {
          id: "action_1-1_out",
          blockId: "action_1",
          type: "OUT",
        },
        {
          id: "action_1-2_out",
          blockId: "action_1",
          type: "OUT",
        },
      ],
      meta: {
        description: "Description",
      },
    },
    {
      id: "action_2",
      is: AstarBlockIs,
      x: 102,
      y: 252,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #2",
      anchors: [
        {
          id: "action_2-1_in",
          blockId: "action_2",
          type: "IN",
        },
        {
          id: "action_2-1_out",
          blockId: "action_2",
          type: "OUT",
        },
        {
          id: "action_2-2_out",
          blockId: "action_2",
          type: "OUT",
        },
      ],
      meta: {
        description: "Description",
      },
    },
    {
      id: "action_3",
      is: AstarBlockIs,
      x: 276,
      y: 323,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #3",
      anchors: [
        {
          id: "action_3-1_in",
          blockId: "action_3",
          type: "IN",
        },
        {
          id: "action_3-1_out",
          blockId: "action_3",
          type: "OUT",
        },
        {
          id: "action_3-2_out",
          blockId: "action_3",
          type: "OUT",
        },
        {
          id: "action_3-3_out",
          blockId: "action_3",
          type: "OUT",
        },
      ],
      meta: {
        description: "Description",
      },
    },
    {
      id: "action_4",
      is: AstarBlockIs,
      x: 93,
      y: 440,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #4",
      anchors: [
        {
          id: "action_4-1_in",
          blockId: "action_4",
          type: "IN",
        },
      ],
      meta: {
        description: "Description",
      },
    },
    {
      id: "action_5",
      is: AstarBlockIs,
      x: -55,
      y: 511,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #5",
      anchors: [
        {
          id: "action_5-1_in",
          blockId: "action_5",
          type: "IN",
        },
      ],
      meta: {
        description: "Description",
      },
    },
    {
      id: "action_6",
      is: AstarBlockIs,
      x: 280,
      y: 512,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #6",
      anchors: [
        {
          id: "action_6-1_in",
          blockId: "action_6",
          type: "IN",
        },
        {
          id: "action_6-2_in",
          blockId: "action_6",
          type: "IN",
        },
      ],
      meta: {
        description: "Description",
      },
    },
    {
      id: "action_7",
      is: AstarBlockIs,
      x: 90,
      y: 609,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #7",
      anchors: [
        {
          id: "action_7-1_in",
          blockId: "action_7",
          type: "IN",
        },
      ],
      meta: {
        description: "Description",
      },
    },
  ],
  connections: [
    {
      sourceBlockId: "action_1",
      sourceAnchorId: "action_1-1_out",
      targetBlockId: "action_2",
      targetAnchorId: "action_2-1_in",
      id: "action_1-1_out:action_2-1_in",
      is: AstarConnectionIs,
    },
    {
      sourceBlockId: "action_1",
      sourceAnchorId: "action_1-2_out",
      targetBlockId: "action_3",
      targetAnchorId: "action_3-1_in",
      id: "action_1-2_out:action_3-1_in",
      is: AstarConnectionIs,
    },
    {
      sourceBlockId: "action_2",
      sourceAnchorId: "action_2-1_out",
      targetBlockId: "action_7",
      targetAnchorId: "action_7-1_in",
      id: "action_2-1_out:action_7-1_in",
      is: AstarConnectionIs,
    },
    {
      sourceBlockId: "action_2",
      sourceAnchorId: "action_2-2_out",
      targetBlockId: "action_6",
      targetAnchorId: "action_6-1_in",
      id: "action_2-2_out:action_6-1_in",
      is: AstarConnectionIs,
    },
    {
      sourceBlockId: "action_3",
      sourceAnchorId: "action_3-1_out",
      targetBlockId: "action_6",
      targetAnchorId: "action_6-2_in",
      id: "action_3-1_out:action_6-2_in",
      is: AstarConnectionIs,
    },
    {
      sourceBlockId: "action_3",
      sourceAnchorId: "action_3-2_out",
      targetBlockId: "action_4",
      targetAnchorId: "action_4-1_in",
      id: "action_3-2_out:action_4-1_in",
      is: AstarConnectionIs,
    },
    {
      sourceBlockId: "action_3",
      sourceAnchorId: "action_3-3_out",
      targetBlockId: "action_5",
      targetAnchorId: "action_5-1_in",
      id: "action_3-3_out:action_5-1_in",
      is: AstarConnectionIs,
    },
  ],
  settings: {
    canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
    useBlocksAnchors: false,
    showConnectionArrows: false,
  },
};
