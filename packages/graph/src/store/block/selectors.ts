import { Graph } from "../../graph";
import { AnchorState } from "../anchor/Anchor";

import { BlockState, TBlockId } from "./Block";

export function selectBlockList(graph: Graph) {
  return graph.rootStore.blocksList;
}

export function selectBlockById(graph: Graph, id: TBlockId): BlockState | undefined {
  return selectBlockList(graph).$blocksMap.value.get(id);
}

export function selectBlockAnchor(graph: Graph, blockId: TBlockId, anchorId: string): AnchorState | undefined {
  return selectBlockById(graph, blockId)?.getAnchorById(anchorId);
}
