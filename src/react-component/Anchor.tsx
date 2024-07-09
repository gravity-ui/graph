import React, { useEffect, useMemo, useRef } from "react";
import { computed } from "@preact/signals-core";
import { TAnchor } from "../components/canvas/anchors";
import { Graph } from "../graph";
import { useSignal } from "./hooks";
import { useBlockAnchorState } from "./hooks/useBlockAnchorState";
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
  const container = useRef<HTMLDivElement>(null);

  const anchorState = useBlockAnchorState(graph, anchor);

  useEffect(() => {
    if (!container.current) {
      return;
    }
    if (position === "absolute") {
      const position = anchorState.block.getViewComponent().getAnchorPosition(anchor);
      if (position) {
        setCssProps(container.current, {
          "--graph-block-anchor-x": `${position.x}px`,
          "--graph-block-anchor-y": `${position.y}px`,
        });
      } else {
        removeCssProps(container.current, ["--graph-block-anchor-x", "--graph-block-anchor-y"]);
      }
    }
  }, [container, position, anchorState, anchor]);

  const selectedSignal = useMemo(() => {
    return computed(() => {
      return anchorState?.$selected.value;
    });
  }, [anchorState]);

  const selected = useSignal(selectedSignal);

  const render = typeof children === "function" ? children : () => children;
  const classNames = useMemo(() => {
    return `graph-block-anchor ${`graph-block-anchor-${anchor.type.toLocaleLowerCase()}`} ${`graph-block-position-${position}`} ${
      className || ""
    } ${selected ? "graph-block-anchor-selected" : ""}`;
  }, [anchor, position, className, selected]);

  return (
    <div ref={container} className={classNames}>
      {render(anchorState)}
    </div>
  );
}
