import React from "react";

import type { Graph } from "@gravity-ui/graph";
import { useSignal } from "@gravity-ui/graph-react";
import { ActionTooltip, Button, Icon } from "@gravity-ui/uikit";

import { cx } from "../react/cx";

import type { TGraphToolbarContext, TGraphToolbarGroup, TGraphToolbarLayout } from "./types";

import "./GraphUikitToolbar.css";

export type TGraphUikitToolbarProps = {
  graph: Graph;
  actions: TGraphToolbarGroup[];
  /** Multiplicative zoom step. Default: 0.1. */
  zoomStep?: number;
  /** Default: "vertical". */
  layout?: TGraphToolbarLayout;
  className?: string;
  qa?: string;
};

/** Floating toolbar of uikit buttons grouped into cards. */
export function GraphUikitToolbar({
  graph,
  actions,
  zoomStep = 0.1,
  layout = "vertical",
  className,
  qa,
}: TGraphUikitToolbarProps): React.ReactElement {
  // Re-render on camera and selection changes so `disabled(graph)` predicates stay current.
  useSignal(graph.$camera);
  useSignal(graph.blocks.blockSelectionBucket.$selected);
  useSignal(graph.connections.connectionSelectionBucket.$selected);

  const context: TGraphToolbarContext = { zoomStep };
  const placement = layout === "vertical" ? "right" : "top";

  return (
    <div className={cx("graph-uikit-toolbar", `graph-uikit-toolbar_layout_${layout}`, className)} data-qa={qa}>
      {actions.map((toolbarGroup, groupIndex) => (
        // Groups have no identity; the list is static per render.
        <div key={groupIndex} className="graph-uikit-toolbar__group">
          {toolbarGroup.actions.map((item) => {
            const disabled =
              typeof item.disabled === "function" ? item.disabled(graph, context) : Boolean(item.disabled);
            return (
              <ActionTooltip key={item.id ?? item.title} title={item.title} hotkey={item.hotkey} placement={placement}>
                <Button
                  className="graph-uikit-toolbar__button"
                  view={item.view ?? "flat"}
                  size="l"
                  disabled={disabled}
                  aria-label={item.title}
                  onClick={() => item.action(graph, context)}
                >
                  {item.icon ? <Icon data={item.icon} size={16} /> : item.label}
                </Button>
              </ActionTooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
