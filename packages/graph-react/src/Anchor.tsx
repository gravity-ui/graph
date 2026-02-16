import React, { useEffect, useMemo } from "react";

import { TAnchor, Graph, AnchorState } from "@gravity-ui/graph";

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
  const [raised, setRaised] = React.useState(false);

  useBlockAnchorPosition(anchorState, anchorContainerRef);

  const classNames = useMemo(() => {
    return cn(
      "graph-block-anchor",
      `graph-block-anchor-${anchor.type.toLocaleLowerCase()}`,
      `graph-block-position-${position}`,
      {
        "graph-block-anchor-raised": raised,
        "graph-block-anchor-selected": selected,
      },
      className
    );
  }, [anchor?.type, position, className, selected, raised]);

  useEffect(() => {
    const component = anchorState?.getViewComponent();
    if (!component) {
      return () => {};
    }
    return component.onChange(() => {
      setRaised(component.state.raised);
    });
  }, [anchorState]);

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
  const layout = typeof children === "function" ? children(anchorState) : children;

  return (
    <div ref={anchorContainerRef} className={classNames}>
      {layout}
    </div>
  );
}
