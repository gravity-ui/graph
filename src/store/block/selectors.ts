import { TBlock } from "components/canvas/blocks/Block";
import { Graph } from "../../graph";
import { BlockState, TBlockId } from "./Block";

export function selectBlockList(graph: Graph) {
  return graph.rootStore.blocksList;
}

export function selectBlockById<T extends TBlock>(graph: Graph, id: TBlockId) {
  return selectBlockList(graph).$blocksMap.value.get(id) as BlockState<T> | undefined;
}

export function selectBlockAnchor(graph: Graph, blockId: TBlockId, anchorId: string) {
  return selectBlockById(graph, blockId)?.getAnchorById(anchorId);
}
