import React, { useLayoutEffect } from "react";

import { Graph, GraphState, TBlock, TGraphColorsPatch, TGraphConfig } from "@gravity-ui/graph";
import { GraphCanvas, HookGraphParams, TGraphEventCallbacks, useGraph, useGraphEvent } from "@gravity-ui/graph-react";

import { useFn } from "../../useFn";

import { BlockStory } from "./Block";

export type TGraphComponentProps = {
  config: TGraphConfig;
  graphRef?: React.MutableRefObject<Graph | undefined>;
  colors?: TGraphColorsPatch;
  constants?: NonNullable<HookGraphParams["viewConfiguration"]>["constants"];
  /** Return `null` to fall back to the default `BlockStory`. */
  renderBlock?: <T extends TBlock>(graphObject: Graph, block: T) => React.JSX.Element | null;
};

const action =
  (name: string) =>
  (...args: unknown[]) => {
    console.log(name, "[", ...args, "]");
  };

const callbacks = {
  onPress: action("press"),
  onClick: action("click"),
  onDoubleClick: action("dblclick"),
  onPointerEnter: action("pointerenter"),
  onPointerLeave: action("pointerleave"),
  onCameraChange: action("onCameraChange"),
  onBlockDragStart: action("onBlockDragStart"),
  onBlockDrag: action("onBlockDrag"),
  onBlockDragEnd: action("onBlockDragEnd"),
  onBlocksSelectionChange: action("onBlocksSelectionChange"),
  onBlockAnchorSelectionChange: action("onBlockAnchorSelectionChange"),
  onBlockChange: action("onBlockChange"),
  onConnectionSelectionChange: action("onConnectionSelectionChange"),
} satisfies Partial<TGraphEventCallbacks>;

export const GraphComponentStory = ({ config, graphRef, constants, colors, renderBlock }: TGraphComponentProps) => {
  const { graph, setEntities, start } = useGraph({
    settings: config.settings,
    layers: config.layers,
    viewConfiguration: {
      constants,
      colors,
    },
  });
  if (graphRef) {
    graphRef.current = graph;
  }

  useLayoutEffect(() => {
    setEntities({ blocks: config.blocks, connections: config.connections });
  }, [setEntities, config.blocks, config.connections]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  const renderBlockFn = useFn((graphObject: Graph, block: TBlock) => {
    return renderBlock?.(graphObject, block) || <BlockStory graph={graphObject} block={block} />;
  });

  return <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} {...callbacks} />;
};
