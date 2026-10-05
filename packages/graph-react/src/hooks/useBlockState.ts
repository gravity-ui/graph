import { BlockState, CanvasBlock, Graph, TBlock, TBlockId, isTBlock } from "@gravity-ui/graph";

import { useComputedSignal } from "./useSignal";

export function useBlockState(graph: Graph, block: TBlock | TBlockId): BlockState | undefined {
  return useComputedSignal(() => {
    return graph.rootStore.blocksList.$blocksMap.value.get(isTBlock(block) ? block.id : block);
  }, [graph, block]);
}

export function useSyncBlockState(graph: Graph, block: TBlock | TBlockId): BlockState | undefined {
  return graph.rootStore.blocksList.$blocksMap.value.get(isTBlock(block) ? block.id : block);
}

export function useBlockViewState(graph: Graph, block: TBlock | TBlockId): CanvasBlock | undefined {
  const blockState = useBlockState(graph, block);
  return useComputedSignal(() => blockState?.$viewComponent.value, [blockState]);
}
