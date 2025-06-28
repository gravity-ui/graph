import React, { useEffect, useLayoutEffect, useRef } from "react";

import { TBlock } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";

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
  const lastStateRef = useRef({ x: 0, y: 0, width: 0, height: 0, zIndex: 0 });
  const viewState = useBlockViewState(graph, block);
  const state = useBlockState(graph, block);

  useEffect(() => {
    viewState?.setHiddenBlock(true);
    return () => viewState?.setHiddenBlock(false);
  }, [viewState]);

  // Оптимизированные обновления только при реальных изменениях
  useEffect(() => {
    if (!containerRef.current || !state) return;

    const element = containerRef.current;
    const lastState = lastStateRef.current;

    // Проверяем, что действительно изменилось
    const hasPositionChange = lastState.x !== state.x || lastState.y !== state.y;
    const hasSizeChange = lastState.width !== state.width || lastState.height !== state.height;

    if (hasPositionChange) {
      // Используем transform для позиции - самый быстрый способ
      element.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
      lastState.x = state.x;
      lastState.y = state.y;
    }

    if (hasSizeChange) {
      // Размеры устанавливаем напрямую
      element.style.width = `${state.width}px`;
      element.style.height = `${state.height}px`;
      lastState.width = state.width;
      lastState.height = state.height;
    }
  }, [state?.x, state?.y, state?.width, state?.height]);

  useEffect(() => {
    if (viewState && containerRef.current) {
      return viewState.$viewState.subscribe(({ zIndex, order }) => {
        const element = containerRef.current;
        const lastState = lastStateRef.current;
        const newZIndex = (zIndex || 0) + (order || 0);

        if (element && lastState.zIndex !== newZIndex) {
          element.style.zIndex = `${newZIndex}`;
          lastState.zIndex = newZIndex;
        }
      });
    }
    return undefined;
  }, [viewState]);

  if (!viewState || !state) {
    return null;
  }

  return (
    <div className={`graph-block-container ${containerClassName || ""}`} ref={containerRef}>
      <div className={`graph-block-wrapper ${className || ""} ${state.selected ? "selected" : ""}`}>{children}</div>
    </div>
  );
};
