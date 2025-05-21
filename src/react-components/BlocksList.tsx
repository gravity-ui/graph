import React, { memo, useEffect, useMemo, useState } from "react";

import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";

import { Block as CanvasBlock, TBlock } from "../components/canvas/blocks/Block";
import { Graph, GraphState } from "../graph";
import { ECameraScaleLevel } from "../services/camera/CameraService";
import { BlockState } from "../store/block/Block";

import { useSignal } from "./hooks";
import { useGraphEvent } from "./hooks/useGraphEvents";
import { useCompareState } from "./utils/hooks/useCompareState";
import { useFn } from "./utils/hooks/useFn";

export type TBlockListProps = {
  graphObject: Graph;
  renderBlock: <T extends TBlock>(graphObject: Graph, block: T) => React.JSX.Element;
};

export type TBlockProps = {
  blockState: BlockState<TBlock>;
  graphObject: Graph;
  renderBlock: <T extends TBlock>(graphObject: Graph, block: T, blockState: BlockState<T>) => React.JSX.Element;
};

export const Block: React.FC<TBlockProps> = (props: TBlockProps) => {
  const block = useSignal(props.blockState.$state);

  if (!block) return;

  return props.renderBlock(props.graphObject, block, props.blockState);
};
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
    const CAMERA_VIEWPORT_TRESHOLD = graphObject.graphConstants.system.CAMERA_VIEWPORT_TRESHOLD;
    const cameraSize = graphObject.cameraService.getCameraState();

    const x = -cameraSize.relativeX - cameraSize.relativeWidth * CAMERA_VIEWPORT_TRESHOLD;
    const y = -cameraSize.relativeY - cameraSize.relativeHeight * CAMERA_VIEWPORT_TRESHOLD;
    const width = -cameraSize.relativeX + cameraSize.relativeWidth * (1 + CAMERA_VIEWPORT_TRESHOLD) - x;
    const height = -cameraSize.relativeY + cameraSize.relativeHeight * (1 + CAMERA_VIEWPORT_TRESHOLD) - y;

    const statesInRect = graphObject
      .getElementsOverRect(
        {
          x,
          y,
          width,
          height,
        },
        [CanvasBlock]
      )
      .map((component: CanvasBlock) => component.connectedState);
    if (
      !isEqual(
        statesInRect.map((state: BlockState<TBlock>) => state.id).sort(),
        blockStates.map((state: BlockState<TBlock>) => state.id).sort()
      )
    ) {
      setBlockStates(statesInRect);
    }
  });

  const scheduleListUpdate = useMemo(() => {
    return debounce(() => updateBlockList(), 0);
  }, []);

  useGraphEvent(graphObject, "state-change", () => {
    setGraphState(graphObject.state);
  });

  useEffect(() => {
    setGraphState(graphObject.state);
  }, [graphObject]);

  useGraphEvent(graphObject, "camera-change", ({ scale }) => {
    if (graphObject.cameraService.getCameraBlockScaleLevel(scale) !== ECameraScaleLevel.Detailed) {
      setRenderAllowed(false);
      return;
    }
    setRenderAllowed(true);
    scheduleListUpdate();
  });

  // init list
  useEffect(() => {
    graphObject.hitTest.on("update", scheduleListUpdate);

    scheduleListUpdate();
    return () => {
      graphObject.hitTest.off("update", scheduleListUpdate);
    };
  }, [graphObject.cameraService, graphObject.hitTest, scheduleListUpdate]);

  return (
    <>
      {graphState === GraphState.READY &&
        isRenderAllowed &&
        blockStates.map((blockState) => {
          return (
            <Block
              key={blockState.id.toString()}
              renderBlock={render}
              graphObject={graphObject}
              blockState={blockState}
            ></Block>
          );
        })}
    </>
  );
});
