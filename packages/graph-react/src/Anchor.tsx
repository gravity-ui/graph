import React, { useEffect, useMemo } from "react";

import { Anchor, AnchorState, Graph, TAnchor, anchorEntityId } from "@gravity-ui/graph";

import { useComputedSignal, useSignal } from "./hooks";
import { useBlockAnchorPosition, useBlockAnchorState } from "./hooks/useBlockAnchorState";
import { useEntityStyle } from "./hooks/useEntityStyle";
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
  const viewComponent = useComputedSignal(
    () => (anchorState?.$viewComponentReady.value ? anchorState.getViewComponent() : undefined),
    [anchorState]
  );
  const [raised, setRaised] = React.useState(false);

  useBlockAnchorPosition(anchorState, anchorContainerRef);

  // Anchor ids are unique only within their block: tags address anchors by block-qualified ids.
  const entity = useMemo(
    () => ({ type: "anchor", id: anchorEntityId(anchor.blockId, anchor.id) }),
    [anchor.blockId, anchor.id]
  );
  const target = viewComponent ? (viewComponent.constructor as typeof Anchor) : Anchor;
  const entityStyle = useEntityStyle(graph, entity, target, "graph-block-anchor");

  const classNames = useMemo(() => {
    return cn(
      "graph-block-anchor",
      `graph-block-anchor-${anchor.type.toLocaleLowerCase()}`,
      `graph-block-position-${position}`,
      {
        "graph-block-anchor-raised": raised,
        "graph-block-anchor-selected": selected,
      },
      entityStyle.className,
      className
    );
  }, [anchor?.type, position, className, selected, raised, entityStyle.className]);

  useEffect(() => {
    setRaised(viewComponent?.state.raised ?? false);
    return viewComponent?.onChange(() => {
      setRaised(viewComponent.state.raised);
    });
  }, [viewComponent]);

  useEffect(() => {
    const container = anchorContainerRef.current;
    const hoverScale = viewComponent?.getHoverFactor();
    if (hoverScale !== undefined) {
      container?.style.setProperty("--graph-block-anchor-hover-scale", hoverScale.toString());
    } else {
      container?.style.removeProperty("--graph-block-anchor-hover-scale");
    }
  }, [viewComponent, selected]);

  if (!anchorState) return null;
  const layout = typeof children === "function" ? children(anchorState) : children;

  return (
    <div ref={anchorContainerRef} className={classNames} style={entityStyle.style}>
      {layout}
    </div>
  );
}
