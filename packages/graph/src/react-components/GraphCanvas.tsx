import React, { useEffect, useLayoutEffect, useRef } from "react";

import { TGraphColors } from "..";
import { Graph } from "../graph";
import { setCssProps } from "../utils/functions/cssProp";

import { TBlockListProps } from "./BlocksList";
import { TGraphEventCallbacks } from "./events";
import { useLayer } from "./hooks";
import { useGraphEvent, useGraphEvents } from "./hooks/useGraphEvents";
import { ReactLayer } from "./layer";
import { useFn } from "./utils/hooks/useFn";

export type GraphProps = Pick<Partial<TBlockListProps>, "renderBlock"> &
  Partial<TGraphEventCallbacks> & {
    className?: string;
    blockListClassName?: string;
    graph: Graph;
    reactLayerRef?: React.MutableRefObject<ReactLayer | null>;
  };

export function GraphCanvas({ graph, className, blockListClassName, renderBlock, reactLayerRef, ...cbs }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>();

  const reactLayer = useLayer(graph, ReactLayer, {
    blockListClassName,
  });

  if (reactLayerRef) {
    reactLayerRef.current = reactLayer;
  }

  useEffect(() => {
    if (containerRef.current) {
      graph.attach(containerRef.current);
    }

    return () => {
      graph.detach();
    };
  }, [graph, containerRef]);

  useGraphEvents(graph, cbs);

  const setColors = useFn((colors: TGraphColors) => {
    setCssProps(containerRef.current, {
      "--graph-block-bg": colors.block.background,
      "--graph-block-border": colors.block.border,
      "--graph-block-border-selected": colors.block.selectedBorder,
      "--graph-block-anchor-bg": colors.anchor.background,
      "--graph-block-anchor-border-selected": colors.anchor.selectedBorder,
    });
  });

  useLayoutEffect(() => {
    setColors(graph.graphColors);
  }, [graph, setColors]);

  useGraphEvent(graph, "colors-changed", ({ colors }) => {
    setColors(colors);
  });

  return (
    <div className={className}>
      <div style={{ position: "absolute", overflow: "hidden", width: "100%", height: "100%" }} ref={containerRef}>
        {graph && reactLayer && reactLayer.renderPortal(renderBlock)}
      </div>
    </div>
  );
}
