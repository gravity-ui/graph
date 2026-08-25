import React, { memo, useEffect, useState } from "react";

import { Block as CanvasBlock, TBlock } from "../components/canvas/blocks/Block";
import { Graph, GraphState } from "../graph";
import { ECameraScaleLevel } from "../services/camera/CameraService";
import { BlockState } from "../store/block/Block";

import { useSignal } from "./hooks";
import { useSceneChange } from "./hooks/useSceneChange";
import { useCompareState } from "./utils/hooks/useCompareState";

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

  useSceneChange(graphObject, () => {
    const cameraLevel = graphObject.cameraService.getCameraBlockScaleLevel();
    if (cameraLevel !== ECameraScaleLevel.Detailed) {
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

  useEffect(() => {
    setGraphState(graphObject.state);

    return graphObject.on("state-change", (event) => {
      setGraphState(event.detail.state);
    });
  }, [graphObject, setGraphState]);

  return (
    <div>
      {graphState === GraphState.READY &&
        blockStates.map((blockState) => {
          return (
            <Block key={blockState.id} renderBlock={renderBlock} graphObject={graphObject} blockState={blockState} />
          );
        })}
    </div>
  );
});
