import React, { useEffect, useLayoutEffect, useRef } from "react";
import { Graph } from "../graph";
import { createPortal } from "react-dom";
import { BlocksList, TBlockListProps } from "./BlocksList";
import { useGraphEvent, useGraphEvents } from "./hooks/useGraphEvents";
import { TGraphEventCallbacks } from "./events";
import { TGraphColors } from "..";
import { useFn } from "../utils/hooks/useFn";
import { setCssProps } from "../utils/functions/cssProp";

export type GraphProps = Pick<Partial<TBlockListProps>, "renderBlock"> &
  Partial<TGraphEventCallbacks> & {
    className?: string;
    graph: Graph;
  };

export function GraphCanvas({ graph, className, renderBlock, ...cbs }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>();

  useEffect(() => {
    if (containerRef.current) {
      graph.attach(containerRef.current);
    }
    return () => graph.detach();
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
        {graph &&
          createPortal(
            <BlocksList graphObject={graph} renderBlock={renderBlock} />,
            graph.getGraphHTML() as HTMLDivElement,
            "graph-blocks-list"
          )}
      </div>
    </div>
  );
}
