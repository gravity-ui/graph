import { useMemo } from "react";

import { Graph } from "@gravity-ui/graph";
import type { BlockState, CanvasBlock, TBlock } from "@gravity-ui/graph";
import { computed } from "@preact/signals-core";

import { useSignal } from "./useSignal";

export function useBlockState<T extends TBlock>(graph: Graph, block: T | T["id"]): BlockState<T> | undefined {
  const signal = useMemo(() => {
    return computed(
      () =>
        graph.rootStore.blocksList.getBlockState(typeof block === "object" ? block.id : block) as
          | BlockState<T>
          | undefined
    );
  }, [graph, block]);
  return useSignal(signal);
}

export function useBlockViewState<T extends TBlock>(graph: Graph, block: T | T["id"]): CanvasBlock<T> | undefined {
  const blockState = useBlockState<T>(graph, block);
  return blockState?.getViewComponent() as CanvasBlock<T> | undefined;
}
