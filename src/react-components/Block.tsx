import React, { useEffect, useLayoutEffect, useRef } from "react";

import { TBlock } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";
import { setCssProps } from "../utils/functions/cssProp";

import { useBlockState, useBlockViewState } from "./hooks/useBlockState";

import "./Block.css";

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
  const state = useBlockState(graph, block);

  useEffect(() => {
    viewState?.setHiddenBlock(true);
    return () => viewState?.setHiddenBlock(false);
  }, [viewState]);

  useLayoutEffect(() => {
    setCssProps(containerRef.current, {
      "--graph-block-geometry-x": `${block.x}px`,
      "--graph-block-geometry-y": `${block.y}px`,
      "--graph-block-geometry-width": `${block.width}px`,
      "--graph-block-geometry-height": `${block.height}px`,
    });
  }, [block.x, block.y, block.width, block.height, containerRef]);

  useEffect(() => {
    if (viewState) {
      return viewState.$viewState.subscribe(({ zIndex, order }) => {
        setCssProps(containerRef.current, {
          "--graph-block-z-index": `${zIndex}`,
          "--graph-block-order": `${order}`,
        });
      });
    }
  }, [viewState, containerRef]);

  if (!viewState || !state) {
    return;
  }

  return (
    <div className={`graph-block-container ${containerClassName}`} ref={containerRef}>
      <div className={`graph-block-wrapper ${className} ${state.selected ? "selected" : ""}`}>{children}</div>
    </div>
  );
};
