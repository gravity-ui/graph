import { useMemo } from "react";

import { Graph, TBlock } from "@gravity-ui/graph";
import { computed } from "@preact/signals-core";

import { useSignal } from "./useSignal";

export function useBlockState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  const signal = useMemo(() => {
    return computed(() => graph.rootStore.blocksList.getBlockState(typeof block === "object" ? block.id : block));
  }, [graph, block]);
  return useSignal(signal);
}

export function useBlockViewState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  const blockState = useBlockState(graph, block);
  return blockState?.getViewComponent();
}
