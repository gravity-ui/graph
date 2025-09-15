import { useCallback, useLayoutEffect, useMemo } from "react";

import { computed } from "@preact/signals-core";

import { TAnchor } from "@gravity-ui/graph";
import { Graph } from "@gravity-ui/graph";
import { AnchorState } from "@gravity-ui/graph";
import { noop } from "@gravity-ui/graph";

import { useBlockState } from "./useBlockState";
import { useSignal } from "./useSignal";

export function useBlockAnchorState(graph: Graph, anchor: TAnchor): AnchorState | undefined {
  const blockState = useBlockState(graph, anchor.blockId);
  const signal = useMemo(() => {
    return computed(() => {
      if (!blockState) return undefined;
      if (!Array.isArray(blockState.$anchorStates?.value)) return undefined;

      return blockState.$anchorStates.value.find((a) => a.id === anchor.id);
    });
  }, [blockState, anchor]);
  return useSignal(signal);
}

export function useBlockAnchorPosition(
  state: AnchorState | undefined,
  anchorContainerRef: React.MutableRefObject<HTMLDivElement> | undefined
) {
  const refreshAnchorPosition = useCallback(() => {
    const position = state.block.getViewComponent().getAnchorPosition(state.state) || { x: 0, y: 0 };
    anchorContainerRef.current.style.setProperty("--graph-block-anchor-x", `${position.x}px`);
    anchorContainerRef.current.style.setProperty("--graph-block-anchor-y", `${position.y}px`);
  }, []);

  useLayoutEffect(() => {
    if (!state) {
      return noop;
    }
    if (!anchorContainerRef || !anchorContainerRef.current) {
      return noop;
    }

    refreshAnchorPosition();

    return state.block.$geometry.subscribe(() => {
      refreshAnchorPosition();
    });
  }, [state.block]);
}
