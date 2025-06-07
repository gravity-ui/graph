import React, { useLayoutEffect } from "react";

import { TBlock } from "../../components/canvas/blocks/Block";
import { Graph, GraphState, TGraphConfig } from "../../graph";
import { TGraphColors, TGraphConstants } from "../../graphConfig";
import { GraphCanvas } from "../../react-component/GraphCanvas";
import { TGraphEventCallbacks } from "../../react-component/events";
import { useGraph } from "../../react-component/hooks/useGraph";
import { useGraphEvent } from "../../react-component/hooks/useGraphEvents";
import { useFn } from "../../utils/hooks/useFn";

import { BlockStory } from "./Block";

export type TGraphComponentProps = {
  config: TGraphConfig;
  graphRef?: React.MutableRefObject<Graph>;
  colors?: TGraphColors;
  constants?: TGraphConstants;
  renderBlock?: <T extends TBlock>(graphObject: Graph, block: T) => React.JSX.Element;
};

const action =
  (name: string) =>
  (...args) => {
    console.log(name, "[", ...args, "]");
  };

const callbacks = {
  mousedown: action("mousedown"),
  click: action("click"),
  dblclick: action("dblclick"),
  mouseenter: action("mouseenter"),
  mouseleave: action("mouseleave"),
  onCameraChange: action("onCameraChange"),
  onBlockDragStart: action("onBlockDragStart"),
  onBlockDrag: action("onBlockDrag"),
  onBlockDragEnd: action("onBlockDragEnd"),
  onBlockSelectionChange: action("onBlockSelectionChange"),
  onBlockAnchorSelectionChange: action("onBlockAnchorSelectionChange"),
  onBlockChange: action("onBlockChange"),
  onConnectionSelectionChange: action("onConnectionSelectionChange"),
} as Partial<TGraphEventCallbacks>;

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
