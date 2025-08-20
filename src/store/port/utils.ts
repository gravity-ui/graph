import { TBlockId } from "../block/Block";

export const createBlockPointPortId = (blockId: TBlockId, isInput = false) => {
  return `${String(blockId)}_${isInput ? "input" : "output"}`;
};

export const createAnchorPortId = (blockId: TBlockId, anchorId: string) => {
  return `${String(blockId)}/${anchorId}`;
};

export const createPortId = (blockId: TBlockId, anchorId?: string, isInput = false) => {
  if (anchorId) {
    return `${String(blockId)}/${anchorId}`;
  } else {
    return `${String(blockId)}_${isInput ? "input" : "output"}`;
  }
};
