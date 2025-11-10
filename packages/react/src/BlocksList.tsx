import React, { memo, useEffect, useLayoutEffect, useMemo, useState } from "react";

import {
  BlockState,
  CanvasBlock,
  ECameraScaleLevel,
  ESchedulerPriority,
  Graph,
  GraphState,
  TBlock,
  debounce,
} from "@gravity-ui/graph";

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
  const [graphState, setGraphState] = useCompareState(graphObject.state);
  const [cameraScaleLevel, setCameraScaleLevel] = useState(graphObject.cameraService.getCameraBlockScaleLevel());

  // Pure function to check if rendering is allowed
  const isDetailedScale = useFn((scale: number = graphObject.cameraService.getCameraScale()) => {
    return graphObject.cameraService.getCameraBlockScaleLevel(scale) === ECameraScaleLevel.Detailed;
  });
  const updateBlockList = useFn(() => {
    if (!isDetailedScale()) {
      setBlockStates([]);
      return;
    }

    setBlockStates((prevStates) => {
      const statesInRect = graphObject
        .getElementsInViewport([CanvasBlock])
        .map((component) => component.connectedState);
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
  useGraphEvent(graphObject, "camera-change", ({ scale }) => {
    setCameraScaleLevel((level) =>
      level === graphObject.cameraService.getCameraBlockScaleLevel(scale)
        ? level
        : graphObject.cameraService.getCameraBlockScaleLevel(scale)
    );
    scheduleListUpdate();
  });

  // Subscribe to hitTest updates to catch when blocks become available in viewport
  useEffect(() => {
    const handler = () => {
      scheduleListUpdate();
    };

    graphObject.hitTest.on("update", handler);

    return () => {
      graphObject.hitTest.off("update", handler);
    };
  }, [graphObject, scheduleListUpdate]);

  // Check initial camera scale on mount to handle cases where zoomTo() is called
  // during initialization before the camera-change event subscription is active
  useLayoutEffect(() => {
    scheduleListUpdate();
    return () => {
      scheduleListUpdate.cancel();
    };
  }, [graphObject, scheduleListUpdate]);

  return (
    <>
      {graphState === GraphState.READY &&
        cameraScaleLevel === ECameraScaleLevel.Detailed &&
        blockStates.map((blockState) => {
          return (
            <Block key={blockState.id} renderBlock={renderBlock} graphObject={graphObject} blockState={blockState} />
          );
        })}
    </>
  );
});
