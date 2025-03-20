import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { TGraphColors } from "..";
import { GraphHTMLLayer } from "../components/canvas/layers/graphLayer/GraphHTMLLayer";
import { Graph } from "../graph";
import { setCssProps } from "../utils/functions/cssProp";
import { useFn } from "../utils/hooks/useFn";

import { TBlockListProps } from "./BlocksList";
import { TGraphEventCallbacks } from "./events";
import { useGraphEvent, useGraphEvents } from "./hooks/useGraphEvents";

export type GraphProps = Pick<Partial<TBlockListProps>, "renderBlock"> &
  Partial<TGraphEventCallbacks> & {
    className?: string;
    graph: Graph;
  };

export function GraphCanvas({ graph, className, renderBlock, ...cbs }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>();
  const htmlLayerRef = useRef<GraphHTMLLayer>();

  const [portal, setPortal] = useState<React.ReactPortal | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      graph.attach(containerRef.current);
    }
    return () => graph.detach();
  }, [graph, containerRef]);

  useEffect(() => {
    if (!htmlLayerRef.current) {
      htmlLayerRef.current = graph.addLayer(GraphHTMLLayer, { renderBlock, onChangePortal: setPortal });
    }
  }, []);

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
        {portal}
      </div>
    </div>
  );
}
