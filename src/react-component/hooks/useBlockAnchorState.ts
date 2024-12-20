import { useLayoutEffect, useMemo, useState } from "react";

import { computed } from "@preact/signals-core";
import debounce from "lodash/debounce";

import { TAnchor } from "../../components/canvas/anchors";
import { Graph } from "../../graph";
import { AnchorState } from "../../store/anchor/Anchor";

import { useBlockState } from "./useBlockState";
import { useSignal } from "./useSignal";

export function useBlockAnchorState(graph: Graph, anchor: TAnchor): AnchorState | undefined {
  const blockState = useBlockState(graph, anchor.blockId);
  const signal = useMemo(() => {
    return computed(() => {
      if (!blockState) return;
      if (!Array.isArray(blockState.$anchorStates?.value)) return;

      return blockState.$anchorStates.value.find((a) => a.id === anchor.id);
    });
  }, [blockState, anchor]);
  return useSignal(signal);
}

export function useBlockAnchorPosition(state: AnchorState | undefined) {
  const [pos, setPos] = useState<{ x: number; y: number }>(
    state.block ? state.block.getViewComponent().getAnchorPosition(state.state) : { x: 0, y: 0 }
  );

  useLayoutEffect(() => {
    if (!state) {
      return;
    }
    return state.block.$geometry.subscribe(
      debounce(() => {
        const position = state.block.getViewComponent().getAnchorPosition(state.state);
        setPos(position);
      }, 16)
    );
  }, [state.block]);

  return pos;
}
