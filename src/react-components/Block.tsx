import React, {
  ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { TBlock } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";
import { ESchedulerPriority } from "../lib/Scheduler";

import { useComputedSignal, useSchedulerDebounce, useSignalEffect } from "./hooks";
import { useBlockState } from "./hooks/useBlockState";
import { applyBlockContainerLayout } from "./utils/applyBlockContainerLayout";
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
function GraphBlockInner<T extends TBlock>(
  { graph, block, children, className, containerClassName, autoHideCanvas = true, canvasVisible }: TGraphBlockProps<T>,
  ref: ForwardedRef<HTMLDivElement>
) {
  const containerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => containerRef.current);
  const lastStateRef = useRef({ x: 0, y: 0, width: 0, height: 0, zIndex: 0 });
  const state = useBlockState(graph, block);

  const stopMoving = useSchedulerDebounce(
    (container: HTMLDivElement) => {
      container.classList.remove("graph-block-container-moving");
    },
    { priority: ESchedulerPriority.LOW, frameTimeout: 150 }
  );

  const viewState = useComputedSignal(() => state?.$viewComponent.value, [state]);
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
        // Manual canvas visibility: use setRenderDelegated so the canvas block stays
        // in the hit-test tree (unlike setHiddenBlock which removes the hitbox). Needed
        // when HTML/React owns the pixels but interactions should still target the block.
        viewState?.setRenderDelegated(!canvasVisible);
      }
    } else {
      // Auto: suppress canvas rendering once React has mounted the block
      viewState?.setRenderDelegated(true);
    }
    return () => viewState?.setRenderDelegated(false);
  }, [viewState, canvasVisible]);

  /**
   * Synchronously set initial block geometry before the browser paints
   * to prevent blocks from flashing at position (0, 0) when mounting.
   */
  useLayoutEffect(() => {
    const geometry = state?.$geometry.value;
    const container = containerRef.current;
    if (!container || !geometry || !viewState) {
      return;
    }
    applyBlockContainerLayout(container, geometry, viewState, lastStateRef.current);
  }, [state, viewState]);

  /**
   * Update the block geometry and z-index when the state changes.
   */
  useSignalEffect(() => {
    const geometry = state?.$geometry.value;
    const container = containerRef.current;
    if (!container || !geometry || !viewState) {
      return;
    }

    const { hasPositionChange } = applyBlockContainerLayout(container, geometry, viewState, lastStateRef.current);

    if (hasPositionChange) {
      if (!container.classList.contains("graph-block-container-moving")) {
        container.classList.add("graph-block-container-moving");
      }
      stopMoving(container);
    }
  }, [containerRef, lastStateRef, state, viewState]);

  /**
   * Update the interactive state when the view state changes.
   * Interactive state is defined by props.interactive
   * So to handle update this props we use onChange callback from view state.
   */
  useEffect(() => {
    if (!viewState) return;
    setInteractive(viewState.isInteractive());
    // eslint-disable-next-line consistent-return
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
}

export const GraphBlock = forwardRef(GraphBlockInner) as <T extends TBlock>(
  props: TGraphBlockProps<T> & { ref?: React.Ref<HTMLDivElement> }
) => React.ReactElement | null;
