import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { TBlock } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";
import "./Block.css";
import { setCssProps } from "../utils/functions/cssProp";
import { useBlockViewState } from "./hooks/useBlockState";

export const GraphBlock = <T extends TBlock>({
  graph,
  block,
  children,
  className,
  containerClassName,
}: {
  graph: Graph;
  block: T;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewState = useBlockViewState(graph, block);

  useLayoutEffect(() => {
    setCssProps(containerRef.current, {
      "--graph-block-geometry-x": `${block.x}px`,
      "--graph-block-geometry-y": `${block.y}px`,
      "--graph-block-geometry-width": `${block.width}px`,
      "--graph-block-geometry-height": `${block.height}px`,
    })
  }, [block.x, block.y, block.width, block.height, containerRef]);

  useEffect(() => {
    if (viewState) {
      return viewState.$viewState.subscribe(({zIndex, order}) => {
        setCssProps(containerRef.current, {
          "--graph-block-z-index": `${zIndex}`,
          "--graph-block-order": `${order}`,
        })
      });
    }
  }, [viewState, containerRef]);


  return (
    <div className={`graph-block-container ${containerClassName}`} ref={containerRef}>
      <div className={`graph-block-wrapper ${className} ${block.selected ? "selected" : ""}`}>{children}</div>
    </div>
  );
};
