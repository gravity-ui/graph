import { TAnchor } from "../../components/canvas/anchors";
import { Graph } from "../../graph";
import { AnchorState } from "../../store/anchor/Anchor";

import { useBlockState } from "./useBlockState";
import { useComputedSignal, useSignalEffect } from "./useSignal";

export function useBlockAnchorState(graph: Graph, anchor: TAnchor): AnchorState | undefined {
  const blockState = useBlockState(graph, anchor.blockId);
  return useComputedSignal(() => {
    if (!blockState) return undefined;
    if (!Array.isArray(blockState.$anchorStates?.value)) return undefined;

    return blockState.$anchorStates.value.find((a) => a.id === anchor.id);
  }, [blockState, anchor]);
}

export function useBlockAnchorPosition(
  state: AnchorState | undefined,
  anchorContainerRef: React.MutableRefObject<HTMLDivElement> | undefined
) {
  useSignalEffect(() => {
    if (!state || !anchorContainerRef?.current) {
      return;
    }

    const position = state.getViewComponent()?.getPosition();
    const blockGeometry = state.block.$geometry.value;

    if (!position || !blockGeometry) {
      anchorContainerRef.current?.style.removeProperty("--graph-block-anchor-x");
      anchorContainerRef.current?.style.removeProperty("--graph-block-anchor-y");
      return;
    }
    anchorContainerRef.current?.style.setProperty("--graph-block-anchor-x", `${position.x - blockGeometry.x}px`);
    anchorContainerRef.current?.style.setProperty("--graph-block-anchor-y", `${position.y - blockGeometry.y}px`);
  }, [state?.block]);
}
