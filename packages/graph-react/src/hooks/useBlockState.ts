import { BlockState, CanvasBlock, Graph, TBlock, TBlockId, isTBlock } from "@gravity-ui/graph";

import { useComputedSignal } from "./useSignal";

/** Meta is the caller's data schema; it does not establish entity existence or a custom view class. */
export function useBlockState<Meta extends Record<string, unknown> = {}>(
  graph: Graph,
  block: TBlock<Meta> | TBlockId
): BlockState<TBlock<Meta>> | undefined {
  return useComputedSignal(() => useSyncBlockState(graph, block), [graph, block]);
}

/** Read without subscribing. Meta is inferred from block data or explicitly declared for an ID lookup. */
export function useSyncBlockState<Meta extends Record<string, unknown> = {}>(
  graph: Graph,
  block: TBlock<Meta> | TBlockId
): BlockState<TBlock<Meta>> | undefined {
  // Shared storage erases metadata schemas. This boundary restores only the caller-declared
  // Meta, not arbitrary entity fields, custom view methods, or a guarantee of existence.
  return graph.rootStore.blocksList.$blocksMap.value.get(isTBlock(block) ? block.id : block) as
    | BlockState<TBlock<Meta>>
    | undefined;
}

export function useBlockViewState<Meta extends Record<string, unknown> = {}>(
  graph: Graph,
  block: TBlock<Meta> | TBlockId
): CanvasBlock<TBlock<Meta>> | undefined {
  const blockState = useBlockState(graph, block);
  // View storage likewise retains the shared canvas class and erases only the data schema.
  return useComputedSignal(
    () => blockState?.$viewComponent.value as CanvasBlock<TBlock<Meta>> | undefined,
    [blockState]
  );
}
