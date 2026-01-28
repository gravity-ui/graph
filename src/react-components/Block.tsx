import React, { useEffect, useMemo, useRef } from "react";

import { computed } from "@preact/signals-core";

import { TBlock } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";

import { useSignal } from "./hooks";
import { useBlockState, useBlockViewState } from "./hooks/useBlockState";

import "./Block.css";

export const GraphBlock = <T extends TBlock>({
  graph,
  block,
  children,
  className,
  containerClassName,
  autoHideCanvas = true,
  canvasVisible,
}: {
  graph: Graph;
  block: T;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  autoHideCanvas?: boolean;
  canvasVisible?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastStateRef = useRef({ x: 0, y: 0, width: 0, height: 0, zIndex: 0 });
  const viewState = useBlockViewState(graph, block);
  const state = useBlockState(graph, block);

  const $selected = useMemo(() => computed(() => state?.$selected.value ?? false), [state]);

  const selected = useSignal($selected);

  useEffect(() => {
    if (!autoHideCanvas) {
      if (canvasVisible !== undefined) {
        viewState?.setHiddenBlock(Boolean(canvasVisible));
      }
    } else {
      viewState?.setHiddenBlock(true);
    }
    return () => viewState?.setHiddenBlock(false);
  }, [viewState, canvasVisible]);

  // Subscribe directly to geometry signal to avoid extra React renders during drag
  useEffect(() => {
    if (!containerRef.current || !state) {
      return;
    }

    const element = containerRef.current;
    const lastState = lastStateRef.current;

    const applyGeometry = (geometry: { x: number; y: number; width: number; height: number }) => {
      const hasPositionChange = lastState.x !== geometry.x || lastState.y !== geometry.y;
      const hasSizeChange = lastState.width !== geometry.width || lastState.height !== geometry.height;

      if (hasPositionChange) {
        // Используем transform для позиции - самый быстрый способ
        element.style.setProperty("--graph-block-geometry-x", `${geometry.x}px`);
        element.style.setProperty("--graph-block-geometry-y", `${geometry.y}px`);
        // element.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
        lastState.x = geometry.x;
        lastState.y = geometry.y;
      }

      if (hasSizeChange) {
        element.style.setProperty("--graph-block-geometry-width", `${geometry.width}px`);
        element.style.setProperty("--graph-block-geometry-height", `${geometry.height}px`);
        lastState.width = geometry.width;
        lastState.height = geometry.height;
      }
    };

    applyGeometry(state.$geometry.value);

    const unsubscribe = state.$geometry.subscribe((geometry) => {
      applyGeometry(geometry);
    });

    return unsubscribe;
  }, [state]);

  useEffect(() => {
    if (viewState && containerRef.current) {
      containerRef.current.style.pointerEvents = viewState.isInteractive() ? "auto" : "none";
      return viewState.onChange(() => {
        if (containerRef.current) {
          containerRef.current.style.pointerEvents = viewState.isInteractive() ? "auto" : "none";
        }
      });
    }
    return undefined;
  }, [viewState]);

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
      <div className={`graph-block-wrapper ${className || ""} ${selected ? "selected" : ""}`}>{children}</div>
    </div>
  );
};
