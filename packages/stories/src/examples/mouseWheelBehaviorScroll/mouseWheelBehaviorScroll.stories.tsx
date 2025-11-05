import React, { useLayoutEffect } from "react";

import { ECanChangeBlockGeometry, Graph, GraphState, TBlock } from "@gravity-ui/graph";
import { GraphBlock, GraphCanvas, HookGraphParams, useFn, useGraph, useGraphEvent } from "@gravity-ui/graph-react";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

const config: HookGraphParams = {
  viewConfiguration: {
    constants: {
      camera: {
        MOUSE_WHEEL_BEHAVIOR: "scroll",
      },
    },
  },
  settings: {
    canDragCamera: true,
    canZoomCamera: true,
    canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
    canCreateNewConnections: true,
    showConnectionArrows: false,
    useBezierConnections: true,
    useBlocksAnchors: true,
    showConnectionLabels: false,
  },
};

function GraphWithMouseWheelBehaviorScroll() {
  const { graph, setEntities, start } = useGraph(config);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  useLayoutEffect(() => {
    setEntities({
      blocks: [
        {
          x: 265,
          y: 334,
          width: 200,
          height: 160,
          id: "Left",
          is: "Block",
          selected: false,
          name: "Left block",
          anchors: [],
        },
        {
          x: 565,
          y: 234,
          width: 200,
          height: 160,
          id: "Right",
          is: "Block",
          selected: false,
          name: "Right block",
          anchors: [],
        },
      ],
      connections: [
        {
          sourceBlockId: "Left",
          targetBlockId: "Right",
        },
      ],
    });
  }, [setEntities]);

  const renderBlockFn = useFn((graph: Graph, block: TBlock) => {
    return (
      <GraphBlock graph={graph} block={block}>
        {block.id.toLocaleString()}
      </GraphBlock>
    );
  });

  return <GraphCanvas graph={graph} renderBlock={renderBlockFn} />;
}

export const Default: StoryFn = () => <GraphWithMouseWheelBehaviorScroll />;

const meta: Meta = {
  title: "Examples/MouseWheelBehaviorScroll",
  component: GraphWithMouseWheelBehaviorScroll,
};

export default meta;
