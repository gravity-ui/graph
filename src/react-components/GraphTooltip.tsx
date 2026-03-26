import React, { useEffect, useMemo, useState } from "react";

import { Tooltip } from "@gravity-ui/uikit";

import { EventedComponent } from "../components/canvas/EventedComponent/EventedComponent";
import { GraphComponent } from "../components/canvas/GraphComponent";

import { useGraphContext } from "./GraphContext";
import { GraphPortal } from "./GraphPortal";
import { useGraphEvent } from "./hooks/useGraphEvents";
import { THoverDebounceConfig, useHoveredGraphComponent } from "./hooks/useHoveredGraphComponent";

type TooltipBaseProps = Omit<React.ComponentProps<typeof Tooltip>, "children" | "content" | "open">;
const GRAPH_TOOLTIP_POPUP_CLASSNAME = "graph-tooltip-popup";

export interface GraphTooltipProps {
  /**
   * Returns tooltip content for the currently hovered graph component.
   * Return null/undefined to hide tooltip for this component.
   */
  getTooltipContent: (component: EventedComponent) => React.ReactNode | string | null | undefined;
  /**
   * Additional class names for internal HTML layer.
   */
  className?: string;
  /**
   * Layer z-index.
   * @default 300
   */
  zIndex?: number;
  /**
   * Additional props for @gravity-ui/uikit Tooltip.
   * open/content/children are controlled internally.
   */
  tooltipProps?: TooltipBaseProps;
  /**
   * Debounce for acquiring hover target.
   */
  hoverEnterDebounce?: THoverDebounceConfig;
  /**
   * Debounce for losing hover target.
   */
  hoverLeaveDebounce?: THoverDebounceConfig;
}

export function GraphTooltip({
  getTooltipContent,
  className,
  zIndex,
  tooltipProps,
  hoverEnterDebounce,
  hoverLeaveDebounce,
}: GraphTooltipProps): React.ReactElement | null {
  const { graph } = useGraphContext();
  const [anchorRevision, setAnchorRevision] = useState(0);

  const isOverTooltipElement = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) {
      return false;
    }
    return target.closest(`.${GRAPH_TOOLTIP_POPUP_CLASSNAME}`) !== null;
  };

  const { hoveredComponent } = useHoveredGraphComponent({
    graph,
    isHoverLockTarget: isOverTooltipElement,
    enterDebounce: hoverEnterDebounce,
    leaveDebounce: hoverLeaveDebounce,
  });

  useGraphEvent(graph, "camera-change", () => {
    if (hoveredComponent) {
      setAnchorRevision((prev) => prev + 1);
    }
  });

  useEffect(() => {
    if (!(hoveredComponent instanceof GraphComponent)) {
      return undefined;
    }

    return hoveredComponent.onChange(() => {
      setAnchorRevision((prev) => prev + 1);
    });
  }, [hoveredComponent]);

  const content = useMemo(() => {
    if (!hoveredComponent) {
      return null;
    }
    return getTooltipContent(hoveredComponent);
  }, [hoveredComponent, getTooltipContent]);

  const tooltipAnchor = useMemo(() => {
    if (!(hoveredComponent instanceof GraphComponent) || !graph?.layers.$root) {
      return null;
    }

    const [minX, minY, maxX, maxY] = hoveredComponent.getHitBox();
    const cameraState = graph.cameraService.getCameraState();
    const rootRect = graph.layers.$root.getBoundingClientRect();

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      x: rootRect.left + centerX * cameraState.scale + cameraState.x,
      y: rootRect.top + centerY * cameraState.scale + cameraState.y,
    };
  }, [anchorRevision, graph, hoveredComponent]);

  const isOpen = content !== null && content !== undefined;
  if (!graph) {
    return null;
  }

  return (
    <GraphPortal className={className} zIndex={zIndex} transformByCameraPosition={false}>
      <Tooltip
        {...tooltipProps}
        className={[GRAPH_TOOLTIP_POPUP_CLASSNAME, tooltipProps?.className].filter(Boolean).join(" ")}
        open={isOpen}
        content={content}
        strategy="fixed"
      >
        <div
          data-testid="graph-tooltip-anchor"
          style={{
            position: "fixed",
            left: `${tooltipAnchor?.x ?? 0}px`,
            top: `${tooltipAnchor?.y ?? 0}px`,
            width: "1px",
            height: "1px",
            pointerEvents: "none",
          }}
        />
      </Tooltip>
    </GraphPortal>
  );
}
