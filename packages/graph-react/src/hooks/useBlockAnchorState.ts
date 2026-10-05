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
  useSignalEffect(() => {
    if (!state || !anchorContainerRef?.current) {
      return;
    }

    if (!state.$viewComponentReady.value) {
      return;
    }

    const viewComponent = state.getViewComponent();
    if (!viewComponent) {
      return;
    }

    const position = viewComponent.getPosition();
    if (!position) {
      return;
    }

    const blockGeometry = state.block.$geometry.value;

    if (!position || !blockGeometry) {
      anchorContainerRef.current?.style.removeProperty("--graph-block-anchor-x");
      anchorContainerRef.current?.style.removeProperty("--graph-block-anchor-y");
      return;
    }
    anchorContainerRef.current?.style.setProperty("--graph-block-anchor-x", `${position.x - blockGeometry.x}px`);
    anchorContainerRef.current?.style.setProperty("--graph-block-anchor-y", `${position.y - blockGeometry.y}px`);
  }, [state, anchorContainerRef]);
}
