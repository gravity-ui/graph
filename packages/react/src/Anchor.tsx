import React, { useMemo } from "react";

import { TAnchor } from "@gravity-ui/graphcanvas/anchors";
import { Graph } from "@gravity-ui/graph";
import { AnchorState } from "@gravity-ui/graphanchor/Anchor";

import { useSignal } from "./hooks";
import { useBlockAnchorPosition, useBlockAnchorState } from "./hooks/useBlockAnchorState";

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

  useBlockAnchorPosition(anchorState, anchorContainerRef);

  const selected = useSignal(anchorState?.$selected);

  const render = typeof children === "function" ? children : () => children;
  const classNames = useMemo(() => {
    return `graph-block-anchor ${`graph-block-anchor-${anchor.type.toLocaleLowerCase()}`} ${`graph-block-position-${position}`} ${
      className || ""
    } ${selected ? "graph-block-anchor-selected" : ""}`;
  }, [anchor, position, className, selected]);

  if (!anchorState) return null;

  return (
    <div ref={anchorContainerRef} className={classNames}>
      {render(anchorState)}
    </div>
  );
}
