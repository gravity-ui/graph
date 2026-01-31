import React, { useEffect, useMemo } from "react";

import { TAnchor } from "../components/canvas/anchors";
import { Graph } from "../graph";
import { AnchorState } from "../store/anchor/Anchor";

import { useSignal } from "./hooks";
import { useBlockAnchorPosition, useBlockAnchorState } from "./hooks/useBlockAnchorState";
import { cn } from "./utils/cn";

import "./Anchor.css";

export function GraphBlockAnchor({
  graph,
  anchor,
  position = "fixed",
  children,
  className,
}: {
  graph: Graph;
  anchor: TAnchor;
  position: "absolute" | "fixed";
  className?: string;
  children?: React.ReactNode | ((anchorState: AnchorState) => React.ReactNode);
}) {
  const anchorContainerRef = React.useRef<HTMLDivElement>(null);
  const anchorState = useBlockAnchorState(graph, anchor);
  const selected = useSignal(anchorState?.$selected);

  useBlockAnchorPosition(anchorState, anchorContainerRef);

  const classNames = useMemo(() => {
    return cn(
      "graph-block-anchor",
      `graph-block-anchor-${anchor.type.toLocaleLowerCase()}`,
      `graph-block-position-${position}`,
      className,
      selected ? "graph-block-anchor-selected" : ""
    );
  }, [anchor?.type, position, className, selected]);

  useEffect(() => {
    if (anchorContainerRef.current) {
      const viewComponent = anchorState?.getViewComponent();
      const hoverScale = viewComponent?.getHoverFactor();
      if (hoverScale !== undefined) {
        anchorContainerRef.current.style.setProperty("--graph-block-anchor-hover-scale", hoverScale.toString());
      }
    }
  }, [anchorState?.$selected.value]);

  if (!anchorState) return null;
  const render = typeof children === "function" ? children : () => children;

  return (
    <div ref={anchorContainerRef} className={classNames}>
      {render(anchorState)}
    </div>
  );
}
