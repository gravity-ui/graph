import React, { CSSProperties, useEffect, useMemo, useRef } from "react";
import { computed } from "@preact/signals-core";
import { TAnchor } from "../components/canvas/anchors";
import { Graph } from "../graph";
import { useSignal } from "./hooks";
import { useBlockAnchorPosition, useBlockAnchorState } from "./hooks/useBlockAnchorState";
import { AnchorState } from "../store/anchor/Anchor";

import "./Anchor.css";
import { removeCssProps, setCssProps } from "../utils/functions/cssProp";

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

  const anchorState = useBlockAnchorState(graph, anchor);

  const coords = useBlockAnchorPosition(anchorState)

  const selected = useSignal(anchorState?.$selected);

  const render = typeof children === "function" ? children : () => children;
  const classNames = useMemo(() => {
    return `graph-block-anchor ${`graph-block-anchor-${anchor.type.toLocaleLowerCase()}`} ${`graph-block-position-${position}`} ${
      className || ""
    } ${selected ? "graph-block-anchor-selected" : ""}`;
  }, [anchor, position, className, selected]);

  return (
    <div 
      style={{
        "--graph-block-anchor-x": `${coords.x}px`,
        "--graph-block-anchor-y": `${coords.y}px`,
      } as CSSProperties}
      className={classNames}
    >
      {render(anchorState)}
    </div>
  );
}
