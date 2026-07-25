import {
  Graph,
  createAnchorPortId,
  createPortId,
  defaultGetCameraBlockScaleLevel,
  type TGraphColors,
  type TPoint,
} from "@gravity-ui/graph";

const point: TPoint = { x: 0, y: 0 };
const colors: Partial<TGraphColors> = {};

export const vanillaContract = {
  Graph,
  colors,
  point,
  anchorPortId: createAnchorPortId("block", "anchor"),
  portId: createPortId("block", "port"),
  scaleLevel: defaultGetCameraBlockScaleLevel(1),
};
