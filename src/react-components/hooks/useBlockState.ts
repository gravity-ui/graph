import { useState } from "react";

import { TBlock, isTBlock } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";

import { useComputedSignal } from "./useSignal";

export function useBlockState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  return useComputedSignal(() => {
    return graph.rootStore.blocksList.$blocksMap.value.get(isTBlock(block) ? block.id : block);
  }, [graph, block]);
}

export function useBlockViewState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  const blockState = useBlockState(graph, block);
  return blockState?.getViewComponent();
}
