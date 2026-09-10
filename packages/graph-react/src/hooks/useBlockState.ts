import { Graph, TBlock, isTBlock } from "@gravity-ui/graph";

import { useComputedSignal } from "./useSignal";

export function useBlockState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  return useComputedSignal(() => {
    return graph.rootStore.blocksList.$blocksMap.value.get(isTBlock(block) ? block.id : block);
  }, [graph, block]);
}

export function useSyncBlockState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  return graph.rootStore.blocksList.$blocksMap.value.get(isTBlock(block) ? block.id : block);
}

export function useBlockViewState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  const blockState = useBlockState(graph, block);
  return blockState?.getViewComponent();
}
