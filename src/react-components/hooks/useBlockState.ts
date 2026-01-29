import { useState } from "react";

import { TBlock, isTBlock } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";

import { useComputedSignal } from "./useSignal";

export function useBlockState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  const [blockState, setBlockState] = useState(
    graph.rootStore.blocksList.$blocksMap.value.get(isTBlock(block) ? block.id : block)
  );
  useComputedSignal(() => {
    const v = graph.rootStore.blocksList.$blocksMap.value.get(isTBlock(block) ? block.id : block);
    if (v !== blockState) {
      setBlockState(v);
    }
    return v;
  }, [graph, block]);
  return blockState;
}

export function useBlockViewState<T extends TBlock>(graph: Graph, block: T | T["id"]) {
  const blockState = useBlockState(graph, block);
  return blockState?.getViewComponent();
}
