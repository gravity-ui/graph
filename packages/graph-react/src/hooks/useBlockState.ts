import { useMemo } from "react";

import { computed } from "@preact/signals-core";

import { TBlock, isTBlock, Graph } from "@gravity-ui/graph";

import { useSignal } from "./useSignal";

export function useBlockState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  const signal = useMemo(() => {
    return computed(() => graph.rootStore.blocksList.getBlockState(isTBlock(block) ? block.id : block));
  }, [graph, block]);
  return useSignal(signal);
}

export function useBlockViewState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  const blockState = useBlockState(graph, block);
  return blockState?.getViewComponent();
}
