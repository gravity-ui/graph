import { ECanChangeBlockGeometry, TGraphConfig } from "../../../index";

export const SankeyBlockIs = "sankey-block";

export const SankeyConnectionIs = "sankey-connection";

export const config: TGraphConfig = {
  configurationName: "SankeyGraph",
  blocks: [
    {
      id: "action_1",
      is: SankeyBlockIs,
      x: 0,
      y: 250,
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
      is: SankeyBlockIs,
      x: 264.8705940820894,
      y: 70.26792005177452,
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
      is: SankeyBlockIs,
      x: 262.96272160754336,
      y: 254.31023333360088,
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
      is: SankeyBlockIs,
      x: 505.13401497581117,
      y: 256.7755540611757,
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
      is: SankeyBlockIs,
      x: 507.5402198868044,
      y: 425.37285964153574,
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
      is: SankeyBlockIs,
      x: 504.66841343278975,
      y: 71.47427606327619,
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
      is: SankeyBlockIs,
      x: 504.41831999664726,
      y: -97.26667814787487,
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
      is: SankeyConnectionIs,
    },
    {
      sourceBlockId: "action_1",
      sourceAnchorId: "action_1-2_out",
      targetBlockId: "action_3",
      targetAnchorId: "action_3-1_in",
      id: "action_1-2_out:action_3-1_in",
      is: SankeyConnectionIs,
    },
    {
      sourceBlockId: "action_2",
      sourceAnchorId: "action_2-1_out",
      targetBlockId: "action_7",
      targetAnchorId: "action_7-1_in",
      id: "action_2-1_out:action_7-1_in",
      is: SankeyConnectionIs,
    },
    {
      sourceBlockId: "action_2",
      sourceAnchorId: "action_2-2_out",
      targetBlockId: "action_6",
      targetAnchorId: "action_6-1_in",
      id: "action_2-2_out:action_6-1_in",
      is: SankeyConnectionIs,
    },
    {
      sourceBlockId: "action_3",
      sourceAnchorId: "action_3-1_out",
      targetBlockId: "action_6",
      targetAnchorId: "action_6-2_in",
      id: "action_3-1_out:action_6-2_in",
      is: SankeyConnectionIs,
    },
    {
      sourceBlockId: "action_3",
      sourceAnchorId: "action_3-2_out",
      targetBlockId: "action_4",
      targetAnchorId: "action_4-1_in",
      id: "action_3-2_out:action_4-1_in",
      is: SankeyConnectionIs,
    },
    {
      sourceBlockId: "action_3",
      sourceAnchorId: "action_3-3_out",
      targetBlockId: "action_5",
      targetAnchorId: "action_5-1_in",
      id: "action_3-3_out:action_5-1_in",
      is: SankeyConnectionIs,
    },
  ],
  settings: {
    canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
    useBlocksAnchors: false,
    showConnectionArrows: false,
  },
};
