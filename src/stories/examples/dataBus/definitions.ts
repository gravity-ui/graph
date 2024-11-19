import { ECanChangeBlockGeometry, TBlock, TGraphConfig } from "../../../index";

export const DataBusBlockIs = "data-bus-block";
export const SimpleBlockIs = "simple-block";
export const DataBusConnectionIs = "data-bus-connection";
export const DATA_BUS_MAGNETIC_DISTANCE = 10;

export type TDataBusBlockMeta = {
  type: "IN" | "OUT";
  direction: "VERTICAL" | "HORIZONTAL";
};

export type TDataBusBlock = TBlock<TDataBusBlockMeta>;

export const config: TGraphConfig<TDataBusBlock> = {
  blocks: [
    {
      id: "action_1",
      is: SimpleBlockIs,
      x: 0,
      y: 250,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #1",
      anchors: [
        {
          id: "action_1_in",
          blockId: "action_1",
          type: "IN",
        },
        {
          id: "action_1_out",
          blockId: "action_1",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_4",
      is: SimpleBlockIs,
      x: 457,
      y: -55,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #4",
      anchors: [
        {
          id: "action_4_in",
          blockId: "action_4",
          type: "IN",
        },
        {
          id: "action_4_out",
          blockId: "action_4",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_5",
      is: SimpleBlockIs,
      x: 454,
      y: 111,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #5",
      anchors: [
        {
          id: "action_5_in",
          blockId: "action_5",
          type: "IN",
        },
        {
          id: "action_5_out",
          blockId: "action_5",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_6",
      is: SimpleBlockIs,
      x: 454,
      y: 280,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #6",
      anchors: [
        {
          id: "action_6_in",
          blockId: "action_6",
          type: "IN",
        },
        {
          id: "action_6_out",
          blockId: "action_6",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_7",
      is: SimpleBlockIs,
      x: 455,
      y: 466,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #7",
      anchors: [
        {
          id: "action_7_in",
          blockId: "action_7",
          type: "IN",
        },
        {
          id: "action_7_out",
          blockId: "action_7",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_8",
      is: SimpleBlockIs,
      x: 660.0802413594818,
      y: -59.533807955326154,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #8",
      anchors: [
        {
          id: "action_8_in",
          blockId: "action_8",
          type: "IN",
        },
        {
          id: "action_8_out",
          blockId: "action_8",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_9",
      is: SimpleBlockIs,
      x: 658.1493886836523,
      y: 113.40675015326235,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #9",
      anchors: [
        {
          id: "action_9_in",
          blockId: "action_9",
          type: "IN",
        },
        {
          id: "action_9_out",
          blockId: "action_9",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_10",
      is: SimpleBlockIs,
      x: 660.2883600811926,
      y: 284.5799987574952,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #10",
      anchors: [
        {
          id: "action_10_in",
          blockId: "action_10",
          type: "IN",
        },
        {
          id: "action_10_out",
          blockId: "action_10",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_11",
      is: SimpleBlockIs,
      x: 661.1052671157026,
      y: 464.48248632436867,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #11",
      anchors: [
        {
          id: "action_11_in",
          blockId: "action_11",
          type: "IN",
        },
        {
          id: "action_11_out",
          blockId: "action_11",
          type: "OUT",
        },
      ],
    },
    {
      id: "action_12",
      is: SimpleBlockIs,
      x: 1129.020941143669,
      y: 231.43607569646957,
      width: 126,
      height: 126,
      selected: false,
      name: "Block #12",
      anchors: [
        {
          id: "action_12_in",
          blockId: "action_12",
          type: "IN",
        },
        {
          id: "action_12_out",
          blockId: "action_12",
          type: "OUT",
        },
      ],
    },
    {
      id: "bus_1",
      is: DataBusBlockIs,
      x: 225.1257397583497,
      y: -46.34484644308105,
      width: 20,
      height: 600,
      selected: false,
      name: "1BUS",
      anchors: [],
      meta: {
        type: "IN",
        direction: "VERTICAL",
      },
    },
    {
      id: "bus_2",
      is: DataBusBlockIs,
      x: 920.460335720443,
      y: -61.292900182322,
      width: 20,
      height: 600,
      selected: false,
      name: "2BUS",
      anchors: [],
      meta: {
        type: "OUT",
        direction: "VERTICAL",
      },
    },
  ],
  connections: [
    {
      sourceBlockId: "action_1",
      sourceAnchorId: "action_1_out",
      targetBlockId: "action_4",
      targetAnchorId: "action_4_in",
      id: "action_1_out:action_4_in",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "action_1",
      sourceAnchorId: "action_1_out",
      targetBlockId: "action_5",
      targetAnchorId: "action_5_in",
      id: "action_1_out:action_5_in",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "action_1",
      sourceAnchorId: "action_1_out",
      targetBlockId: "action_6",
      targetAnchorId: "action_6_in",
      id: "action_1_out:action_6_in",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "action_1",
      sourceAnchorId: "action_1_out",
      targetBlockId: "action_7",
      targetAnchorId: "action_7_in",
      id: "action_1_out:action_7_in",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "action_8",
      sourceAnchorId: "action_8_out",
      targetBlockId: "action_12",
      targetAnchorId: "action_12_in",
      id: "action_8_out:action_12_in",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "action_9",
      sourceAnchorId: "action_9_out",
      targetBlockId: "action_12",
      targetAnchorId: "action_12_in",
      id: "action_9_out:action_12_in",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "action_10",
      sourceAnchorId: "action_10_out",
      targetBlockId: "action_12",
      targetAnchorId: "action_12_in",
      id: "action_10_out:action_12_in",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "action_11",
      sourceAnchorId: "action_11_out",
      targetBlockId: "action_12",
      targetAnchorId: "action_12_in",
      id: "action_11_out:action_12_in",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "action_1",
      sourceAnchorId: "action_1_out",
      targetBlockId: "bus_1",
      id: "action_1_out:bus_1",
      is: DataBusConnectionIs,
    },
    {
      sourceBlockId: "bus_2",
      targetBlockId: "action_12",
      targetAnchorId: "action_12_in",
      id: "bus_2:action_12_in",
      is: DataBusConnectionIs,
    },
  ],
  settings: {
    canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
    showConnectionArrows: false,
  },
};
