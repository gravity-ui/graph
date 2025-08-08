import React, { memo, useEffect, useMemo, useState } from "react";

import isEqual from "lodash/isEqual";

import { Block as CanvasBlock, TBlock } from "../components/canvas/blocks/Block";
import { Graph, GraphState } from "../graph";
import { ESchedulerPriority } from "../lib";
import { ECameraScaleLevel, TCameraState } from "../services/camera/CameraService";
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

  if (!block) return;

  return props.renderBlock(props.graphObject, block, props.blockState);
});

export const BlocksList = memo(function BlocksList({ renderBlock, graphObject }: TBlockListProps) {
  const [blockStates, setBlockStates] = useState([]);
  const [isRenderAllowed, setRenderAllowed] = useCompareState(false);
  const [graphState, setGraphState] = useCompareState(graphObject.state);

  const render = useFn((graphObject: Graph, block: TBlock) => {
    return renderBlock(graphObject, block);
  });

  const updateBlockList = useFn(() => {
    if (graphObject.cameraService.getCameraBlockScaleLevel() !== ECameraScaleLevel.Detailed) {
      setBlockStates([]);
      return;
    }
    const statesInRect = graphObject.getElementsInViewport([CanvasBlock]).map((component) => component.connectedState);

    setBlockStates((blocks) => {
      if (
        !isEqual(
          statesInRect.map((state: BlockState<TBlock>) => state.id).sort(),
          blocks.map((state: BlockState<TBlock>) => state.id).sort()
        )
      ) {
        return statesInRect;
      }
      return blocks;
    });
  });

  const scheduleListUpdate = useMemo(() => {
    return debounce(() => updateBlockList(), {
      priority: ESchedulerPriority.HIGHEST,
      frameInterval: 1,
    });
  }, []);

  useGraphEvent(graphObject, "state-change", () => {
    setGraphState(graphObject.state);
  });

  useEffect(() => {
    setGraphState(graphObject.state);
  }, [graphObject]);

  useGraphEvent(graphObject, "camera-change", ({ scale }: TCameraState) => {
    if (graphObject.cameraService.getCameraBlockScaleLevel(scale) !== ECameraScaleLevel.Detailed) {
      setRenderAllowed(false);
      return;
    }
    setRenderAllowed(true);
    scheduleListUpdate();
    if (!isRenderAllowed) {
      scheduleListUpdate.flush();
    }
  });

  useEffect(() => {
    return () => {
      scheduleListUpdate.cancel();
    };
  }, []);

  // init list
  useEffect(() => {
    graphObject.hitTest.waitUsableRectUpdate(() => {
      if (graphObject.cameraService.getCameraBlockScaleLevel() !== ECameraScaleLevel.Detailed) {
        setRenderAllowed(false);
        return;
      }
      setRenderAllowed(true);
      scheduleListUpdate.flush();
    });
    return graphObject.hitTest.onUsableRectUpdate(updateBlockList);
  }, [graphObject.hitTest, isRenderAllowed, graphState]);

  return (
    <>
      {graphState === GraphState.READY &&
        isRenderAllowed &&
        blockStates.map((blockState) => {
          return (
            <Block key={blockState.id} renderBlock={render} graphObject={graphObject} blockState={blockState}></Block>
          );
        })}
    </>
  );
});
