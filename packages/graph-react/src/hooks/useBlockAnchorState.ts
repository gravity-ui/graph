import { useCallback, useLayoutEffect } from "react";

import { AnchorState, Graph, TAnchor } from "@gravity-ui/graph";

import { useComputedSignal, useSignalEffect } from "./useSignal";

export function useBlockAnchorState(graph: Graph, anchor: TAnchor): AnchorState | undefined {
  return useComputedSignal(
    () => graph.rootStore.blocksList.getBlockState(anchor.blockId)?.getAnchorById(anchor.id),
    [graph, anchor.blockId, anchor.id]
  );
}

export function useBlockAnchorPosition(
  state: AnchorState | undefined,
  anchorContainerRef: React.RefObject<HTMLDivElement> | undefined
) {
  const updatePosition = useCallback(() => {
    // Subscribe even while the DOM ref is empty, so later mounts keep receiving
    // geometry and view-readiness changes without replacing the ref object.
    const blockGeometry = state?.block.$geometry.value;
    const position = state?.$viewComponentReady.value ? state.getViewComponent()?.getPosition() : undefined;
    const container = anchorContainerRef?.current;
    if (!container) return;

    if (!position || !blockGeometry) {
      container.style.removeProperty("--graph-block-anchor-x");
      container.style.removeProperty("--graph-block-anchor-y");
      return;
    }
    container.style.setProperty("--graph-block-anchor-x", `${position.x - blockGeometry.x}px`);
    container.style.setProperty("--graph-block-anchor-y", `${position.y - blockGeometry.y}px`);
  }, [state, anchorContainerRef]);

  // A stable ref object can acquire a new DOM node without changing identity.
  // Initialize that node after every commit, then keep signal-driven updates.
  useLayoutEffect(updatePosition);
  useSignalEffect(updatePosition, [updatePosition]);
}
