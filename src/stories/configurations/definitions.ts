import { ECanChangeBlockGeometry } from "../../store/settings";

export enum EAnchorType {
  IN = "IN",
  OUT = "OUT",
}

export const storiesSettings = {
  canDragCamera: true,
  canZoomCamera: true,
  canDuplicateBlocks: true,
  canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
  canCreateNewConnections: true,
  showConnectionArrows: true,
  scaleFontSize: 1,
  useBezierConnections: true,
  useBlocksAnchors: true,
  connectivityComponentOnClickRaise: true,
  showConnectionLabels: true,
};
