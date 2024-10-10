import { TAnchor } from "../../components/canvas/anchors";
import { Graph } from "../../graph";
import { useSignal } from "./useSignal";
import { useBlockState } from "./useBlockState";
import { AnchorState } from "../../store/anchor/Anchor";
import { computed } from "@preact/signals-core";
import { useEffect, useMemo, useRef } from "react";
import debounce from "lodash/debounce";

export function useBlockAnchorState(graph: Graph, anchor: TAnchor): AnchorState | undefined {
  const blockState = useBlockState(graph, anchor.blockId);
  const signal = useMemo(() => {
    return computed(() => blockState.$anchorStates.value.find((a) => a.id === anchor.id));
  }, [blockState, anchor]);
  return useSignal(signal);
}

export function useBlockAnchorPosition(state: AnchorState | undefined, onUpdate: (position: {x: number, y: number}) => void) {
  const fnRef = useRef(onUpdate);
  fnRef.current = onUpdate;

  useEffect(() => {
    if(!state) {
      return;
    }
    return state.block.$geometry.subscribe(debounce(() => {
      const position = state.block.getViewComponent().getAnchorPosition(state.state);
      fnRef.current(position);
    }, 16))
  }, [state.block])
} 

