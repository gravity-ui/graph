import React, { useEffect, useMemo, useRef, useState } from "react";

import { noop } from "lodash";

import { TBlock, Graph } from "@gravity-ui/graph";

import { useSignalEffect } from "./hooks";
import { useBlockState } from "./hooks/useBlockState";
import { cn } from "./utils/cn";

import "./Block.css";

export type TGraphBlockProps<T extends TBlock> = {
  /**
   * Graph instance
   */
  graph: Graph;
  /**
   * Block instance
   */
  block: T;
  /**
   * Class name for wrapper div
   * * The difference between the "containerClassName" and "className" props:
   * - containerClassName is applied to the container div
   * - className is applied to the wrapper div
   * ```jsx
   * // container for position and size
   * <div className={`graph-block-container ${containerClassName}`}>
   *   // wrapper for block content
   *   <div className={`graph-block-wrapper ${className}`}>
   *     {children}
   *   </div>
   * </div>
   * ```
   */
  className?: string;
  /**
   * Class name for container div
   * * The difference between the "containerClassName" and "className" props:
   * - containerClassName is applied to the container div
   * - className is applied to the wrapper div
   * ```jsx
   * // container for position and size
   * <div className={`graph-block-container ${containerClassName}`}>
   *   // wrapper for block content
   *   <div className={`graph-block-wrapper ${className}`}>
   *     {children}
   *   </div>
   * </div>
   * ```
   */
  containerClassName?: string;
  /**
   * Flag to hide canvas block automatically when react will render the block.
   * If you want to manage canvas block visibility manually, you can set `autoHideCanvas` to `false`, and pass `canvasVisible` prop to control it.
   */
  autoHideCanvas?: boolean;
  /**
   * Flag to manage visibility of canvas block.
   * If you want to manage visibility of canvas block manually, you can set `autoHideCanvas` to `false`, and pass `canvasVisible` prop to control it.
   */
  canvasVisible?: boolean;

  children: React.ReactNode;
};

/**
 * Base block component for render HTML block via react
 *
 * Creates a container for the graph block, correctly places it on the canvas, updates the geometry and z-index when the state changes
 *
 * By default will be hide canvas block automatically when react will render the block.
 * But if you want to manage canvas block visibility manually, you can set `autoHideCanvas` prop to `false`, and pass `canvasVisible` prop to control it.
 *
 *
 * @example
 * ```jsx
 * <GraphBlock graph={graph} block={block}>
 *   <div>This is a HTML block with name {block.name}</div>
 *   <button onClick={() => console.log("`Click me` button clicked")}>Click me</button>
 * </GraphBlock>
 * ```
 *
 */
export const GraphBlock = <T extends TBlock>({
  graph,
  block,
  children,
  className,
  containerClassName,
  autoHideCanvas = true,
  canvasVisible,
}: TGraphBlockProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastStateRef = useRef({ x: 0, y: 0, width: 0, height: 0, zIndex: 0 });
  const state = useBlockState(graph, block);

  const viewState = state?.getViewComponent();
  const [interactive, setInteractive] = useState(viewState?.isInteractive() ?? false);

  /**
   * By reason of scheduler, canvas layer get the camera state before react will initialize the block
   * so if canvas block will hide before react will render the block,
   * user will see empty space for a moment, and after react blocks will be initialized,user will see the html-block.
   * In order to prevent that flickering, we need to hide the canvas  block **only** after react render the block.
   */
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

  /**
   * Update the block geometry and z-index when the state changes.
   */
  useSignalEffect(() => {
    const geometry = state?.$geometry.value;
    const container = containerRef.current;
    const lastState = lastStateRef.current;
    if (!container || !geometry) {
      return;
    }

    const hasPositionChange = lastStateRef.current.x !== geometry.x || lastStateRef.current.y !== geometry.y;

    if (hasPositionChange) {
      container.style.setProperty("--graph-block-geometry-x", `${geometry.x}px`);
      container.style.setProperty("--graph-block-geometry-y", `${geometry.y}px`);
      lastState.x = geometry.x;
      lastState.y = geometry.y;
    }

    const hasSizeChange = lastState.width !== geometry.width || lastState.height !== geometry.height;
    if (hasSizeChange) {
      container.style.setProperty("--graph-block-geometry-width", `${geometry.width}px`);
      container.style.setProperty("--graph-block-geometry-height", `${geometry.height}px`);
      lastState.width = geometry.width;
      lastState.height = geometry.height;
    }

    const { zIndex, order } = viewState.$viewState.value;

    const newZIndex = (zIndex || 0) + (order || 0);

    if (lastState.zIndex !== newZIndex) {
      container.style.zIndex = `${newZIndex}`;
      lastState.zIndex = newZIndex;
    }
  }, [containerRef, lastStateRef, state, viewState]);

  /**
   * Update the interactive state when the view state changes.
   * Interactive state is defined by props.interactive
   * So to handle update this props we use onChange callback from view state.
   */
  useEffect(() => {
    if (!viewState) return noop;
    setInteractive(viewState.isInteractive());
    return viewState.onChange(() => {
      setInteractive(viewState.isInteractive());
    });
  }, [viewState]);

  const containerClassNames = useMemo(() => {
    return cn("graph-block-container", containerClassName, !interactive ? "graph-block-container-non-interactive" : "");
  }, [containerClassName, interactive]);

  const wrapperClassNames = useMemo(() => {
    return cn("graph-block-wrapper", className, state?.$selected.value ? "selected" : "");
  }, [className, state?.$selected.value]);

  if (!viewState || !state) {
    return null;
  }

  return (
    <div className={containerClassNames} ref={containerRef}>
      <div className={wrapperClassNames}>{children}</div>
    </div>
  );
};
