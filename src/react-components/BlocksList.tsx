import React, { memo, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { Block as CanvasBlock, TBlock } from "../components/canvas/blocks/Block";
import { Graph, GraphState } from "../graph";
import { ESchedulerPriority } from "../lib";
import { ECameraScaleLevel } from "../services/camera/CameraService";
import { BlockState } from "../store/block/Block";
import { debounce } from "../utils/functions";

import { useSignal } from "./hooks";
import { useGraphEvent } from "./hooks/useGraphEvents";
import { useCompareState } from "./utils/hooks/useCompareState";
import { useFn } from "./utils/hooks/useFn";

export type TRenderBlockFn = <T extends TBlock>(graphObject: Graph, block: T) => React.JSX.Element;

export type TBlockListProps = {
  graphObject: Graph;
  renderBlock: TRenderBlockFn;
};

export type TBlockProps = {
  blockState: BlockState<TBlock>;
  graphObject: Graph;
  renderBlock: <T extends TBlock>(graphObject: Graph, block: T, blockState: BlockState<T>) => React.JSX.Element;
};

export const Block: React.FC<TBlockProps> = memo((props: TBlockProps) => {
  const block = useSignal(props.blockState.$state);

  if (!block) return null;

  return props.renderBlock(props.graphObject, block, props.blockState);
});

/**
 * Optimized comparison using Set instead of map.sort + lodash.isEqual
 * For proof that Set is faster than map.sort + lodash.isEqual run `node benchmarks/blocklist-comparison.bench.js`
 *
 * Note: lodash.isEqual is more memory-efficient for large lists, but we expect no more than 100 blocks
 * in detailed view, where Set-based comparison significantly outperforms map.sort + lodash.isEqual
 */
const hasBlockListChanged = (newStates: BlockState<TBlock>[], oldStates: BlockState<TBlock>[]): boolean => {
  if (newStates.length !== oldStates.length) return true;

  const oldIds = new Set(oldStates.map((state) => state.id));
  return newStates.some((state) => !oldIds.has(state.id));
};

export const BlocksList = memo(function BlocksList({ renderBlock, graphObject }: TBlockListProps) {
  const [blockStates, setBlockStates] = useState<BlockState<TBlock>[]>([]);
  const [isRenderAllowed, setRenderAllowed] = useCompareState(false);
  const [graphState, setGraphState] = useCompareState(graphObject.state);

  // Pure function to check if rendering is allowed
  const isDetailedScale = useFn(() => {
    return graphObject.cameraService.getCameraBlockScaleLevel() === ECameraScaleLevel.Detailed;
  });

  const updateBlockList = useFn(() => {
    const statesInRect = graphObject.getElementsInViewport([CanvasBlock]).map((component) => component.connectedState);

    setBlockStates((prevStates) => {
      return hasBlockListChanged(statesInRect, prevStates) ? statesInRect : prevStates;
    });
  });

  const scheduleListUpdate = useMemo(() => {
    return debounce(() => updateBlockList(), {
      priority: ESchedulerPriority.HIGHEST,
      frameInterval: 1,
    });
  }, [updateBlockList]);

  // Sync graph state
  useGraphEvent(graphObject, "state-change", () => {
    setGraphState(graphObject.state);
  });

  useEffect(() => {
    setGraphState(graphObject.state);
  }, [graphObject, setGraphState]);

  // Handle camera changes and render mode switching
  useGraphEvent(graphObject, "camera-change", () => {
    const wasAllowed = isRenderAllowed;
    const isAllowed = isDetailedScale();

    setRenderAllowed(isAllowed);

    if (!isAllowed) {
      // Clear blocks when switching out of detailed mode
      setBlockStates([]);
      return;
    }

    scheduleListUpdate();
    if (!wasAllowed) {
      // Immediate flush on first transition to Detailed mode
      scheduleListUpdate.flush();
    }
  });

  // Subscribe to hitTest updates to catch when blocks become available in viewport
  useEffect(() => {
    const handler = () => {
      if (!isDetailedScale()) return;
      scheduleListUpdate();
    };

    graphObject.hitTest.on("update", handler);

    return () => {
      graphObject.hitTest.off("update", handler);
    };
  }, [graphObject, isDetailedScale, scheduleListUpdate]);

  // Check initial camera scale on mount to handle cases where zoomTo() is called
  // during initialization before the camera-change event subscription is active
  useLayoutEffect(() => {
    const isAllowed = isDetailedScale();
    setRenderAllowed(isAllowed);

    if (isAllowed) {
      scheduleListUpdate.flush();
    }
  }, [graphObject, isDetailedScale, scheduleListUpdate, setRenderAllowed]);

  // Cleanup scheduled updates on unmount
  useEffect(() => {
    return () => {
      scheduleListUpdate.cancel();
    };
  }, [scheduleListUpdate]);

  return (
    <>
      {graphState === GraphState.READY &&
        isRenderAllowed &&
        blockStates.map((blockState) => {
          return (
            <Block key={blockState.id} renderBlock={renderBlock} graphObject={graphObject} blockState={blockState} />
          );
        })}
    </>
  );
});
