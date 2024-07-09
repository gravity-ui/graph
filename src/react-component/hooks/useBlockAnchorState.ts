import { TAnchor } from "../../components/canvas/anchors";
import { Graph } from "../../graph";
import { useSignal } from "./useSignal";
import { useBlockState } from "./useBlockState";
import { AnchorState } from "../../store/anchor/Anchor";
import { computed } from "@preact/signals-core";
import { useMemo } from "react";

export function useBlockAnchorState(graph: Graph, anchor: TAnchor): AnchorState | undefined {
  const blockState = useBlockState(graph, anchor.blockId);
  const signal = useMemo(() => {
    return computed(() => blockState.$anchorStates.value.find((a) => a.id === anchor.id));
  }, [blockState, anchor]);
  return useSignal(signal);
}
