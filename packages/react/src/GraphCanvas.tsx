import React, { useEffect, useLayoutEffect, useRef } from "react";

import { TGraphColors } from "..";
import { Graph } from "@gravity-ui/graph";
import { setCssProps } from "@gravity-ui/graphfunctions/cssProp";

import { TBlockListProps } from "./BlocksList";
import { GraphContextProvider } from "./GraphContext";
import { TGraphEventCallbacks } from "./events";
import { useLayer } from "./hooks";
import { useGraphEvent, useGraphEvents } from "./hooks/useGraphEvents";
import { ReactLayer } from "./layer";
import { cn } from "./utils/cn";
import { useFn } from "./utils/hooks/useFn";

import "./graph-canvas.css";

export type GraphProps = Pick<Partial<TBlockListProps>, "renderBlock"> &
  Partial<TGraphEventCallbacks> & {
    className?: string;
    blockListClassName?: string;
    graph: Graph;
    reactLayerRef?: React.MutableRefObject<ReactLayer | null>;
    children?: React.ReactNode;
  };

export function GraphCanvas({
  graph,
  className,
  blockListClassName,
  renderBlock,
  reactLayerRef,
  children,
  ...cbs
}: GraphProps) {
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
    <GraphContextProvider graph={graph}>
      <div className={cn("graph-wrapper", className)}>
        <div className="graph-canvas" ref={containerRef}>
          {graph && reactLayer && reactLayer.renderPortal(renderBlock)}
        </div>
        {children}
      </div>
    </GraphContextProvider>
  );
}
