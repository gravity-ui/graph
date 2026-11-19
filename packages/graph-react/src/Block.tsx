import React, {
  ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CanvasBlock, ESchedulerPriority, Graph, TBlock, TStyleTarget } from "@gravity-ui/graph";

import { BlockOutline } from "./BlockOutline";
import { useSchedulerDebounce, useSignalEffect } from "./hooks";
import { useBlockState, useBlockViewState } from "./hooks/useBlockState";
import { useEntityStyle } from "./hooks/useEntityStyle";
import { useSignal } from "./hooks/useSignal";
import { applyBlockContainerLayout } from "./utils/applyBlockContainerLayout";
import { cn } from "./utils/cn";
import { prepareAnchorMotion } from "./utils/prepareAnchorMotion";

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
   * Hides the canvas block once React has rendered it, while the scene is at the detailed level (default `true`).
   * To manage the canvas block's visibility yourself, set `autoHideCanvas` to `false` and pass `canvasVisible`.
   */
  autoHideCanvas?: boolean;
  /**
   * With `autoHideCanvas={false}`: `true` and `undefined` both keep the canvas block drawn and register the view's
   * presence, so the block's children are hit through it at the detailed level (D4); `false` hands the block over to
   * the HTML view.
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setContainerRef = useCallback(
    (container: HTMLDivElement | null) => {
      containerRef.current = container;
      if (typeof ref === "function") ref(container);
      else if (ref) ref.current = container;
    },
    [ref]
  );
  const lastStateRef = useRef({ x: 0, y: 0, width: 0, height: 0, zIndex: 0 });
  const state = useBlockState(graph, block);

  const stopMoving = useSchedulerDebounce(
    (container: HTMLDivElement) => {
      container.classList.remove("graph-block-container-moving");
    },
    { priority: ESchedulerPriority.LOW, frameTimeout: 150 }
  );

  const viewState = useBlockViewState(graph, block);
  const [interactive, setInteractive] = useState(viewState?.isInteractive() ?? false);

  /**
   * The handover (spec §10): the view holds its block once React has mounted it, so the canvas look stays until the
   * HTML exists; the core hides the block only at the detailed level, so zooming out draws it in the frame that hides
   * the HTML. `autoHideCanvas={false}` with `canvasVisible` holds it the same way and lets the scene keep drawing
   * while `canvasVisible` is true (for example `canvasVisible={!ready}` until the view's data is ready).
   */
  useEffect(() => {
    if (!viewState) return undefined;
    // The view is shown either way (D4): without auto-hide and without canvasVisible it keeps the canvas drawn.
    return viewState.delegateRender({ canvasVisible: autoHideCanvas ? false : canvasVisible ?? true });
  }, [viewState, autoHideCanvas, canvasVisible]);

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

  const blockComponents = useSignal(graph.rootStore.settings.$blockComponents);
  const blockClass: TStyleTarget = blockComponents[block.is] || CanvasBlock;
  const entityStyle = useEntityStyle(graph, { type: "block", id: block.id }, blockClass, "graph-block");
  const hasMotion = entityStyle.motion !== undefined && entityStyle.motion !== "none";
  useLayoutEffect(() => {
    const container = containerRef.current;
    return hasMotion && viewState && container ? prepareAnchorMotion(container) : undefined;
  }, [hasMotion, viewState, children]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!hasMotion || !viewState || !container) return undefined;

    const reset = () => {
      container.removeAttribute("data-graph-block-motion");
      container.style.removeProperty("--graph-block-motion-x");
      container.style.removeProperty("--graph-block-motion-y");
    };
    const unsubscribe = graph.scene.onBlockMotion(block.id, (x, y) => {
      if (x === 0 && y === 0) {
        reset();
        return;
      }
      container.style.setProperty("--graph-block-motion-x", `${x}px`);
      container.style.setProperty("--graph-block-motion-y", `${y}px`);
      container.toggleAttribute("data-graph-block-motion", true);
    });
    return () => {
      unsubscribe();
      reset();
    };
  }, [graph, block.id, hasMotion, viewState]);
  const outline = entityStyle.outline;
  const hasOutline = outline && Number.isFinite(outline.width) && outline.width > 0;
  const selected = state?.$selected.value;

  const wrapperClassNames = useMemo(() => {
    return cn("graph-block-wrapper", className, selected ? "selected" : "", entityStyle.className);
  }, [className, selected, entityStyle.className]);

  if (!viewState || !state) {
    return null;
  }

  return (
    <div className={containerClassNames} ref={setContainerRef}>
      <div
        className={wrapperClassNames}
        style={hasOutline ? { ...entityStyle.style, borderColor: "transparent" } : entityStyle.style}
      >
        {children}
      </div>
      {hasOutline && <BlockOutline outline={outline} />}
    </div>
  );
}

export const GraphBlock = forwardRef(GraphBlockInner) as <T extends TBlock>(
  props: TGraphBlockProps<T> & { ref?: React.Ref<HTMLDivElement> }
) => React.ReactElement | null;
