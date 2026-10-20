import React, { useEffect, useState } from "react";

import { useGraphContext, useSignal } from "@gravity-ui/graph-react";
import { Popup } from "@gravity-ui/uikit";
import type { PopupPlacement } from "@gravity-ui/uikit";

import { getUikitGraphStore } from "../store/UikitGraphStore";

import { createHoverAnchor } from "./entity";
import type { TGraphComponentEntity, TGraphHoverState } from "./types";

import "./GraphTooltip.css";

type TTooltipKind = TGraphComponentEntity["kind"];

export type TGraphTooltipProps = {
  /** Return null to show no tooltip for this entity. */
  content: (entity: TGraphComponentEntity) => React.ReactNode | null;
  /** Default: ["block", "connection", "anchor"]. */
  kinds?: TTooltipKind[];
  /** Default: 500. */
  openDelay?: number;
  /** Default: 0. */
  closeDelay?: number;
  /** Default: "top". */
  placement?: PopupPlacement;
};

const DEFAULT_KINDS: TTooltipKind[] = ["block", "connection", "anchor"];

/** uikit Popup anchored to the hovered graph entity on every LOD level. */
export function GraphTooltip({
  content,
  kinds = DEFAULT_KINDS,
  openDelay = 500,
  closeDelay = 0,
  placement = "top",
}: TGraphTooltipProps): React.ReactElement | null {
  const { graph } = useGraphContext();
  const store = getUikitGraphStore(graph);
  const hovered = useSignal(store.$hovered);
  const pressed = useSignal(store.$pointerPressed);
  const menuOpen = useSignal(store.$contextMenu) !== null;
  // Subscriptions that only trigger a re-render: the anchor below is rebuilt on every render.
  useSignal(store.$cameraVersion);
  const [active, setActive] = useState<TGraphHoverState | null>(null);
  useSignal(active?.entity.kind === "block" ? active.entity.component.connectedState.$geometry : undefined);

  // No tooltip next to an open context menu.
  const target = hovered && !pressed && !menuOpen && kinds.includes(hovered.entity.kind) ? hovered : null;
  const isOpen = active !== null;

  useEffect(() => {
    if (target && isOpen) {
      // Moving between entities switches immediately once a tooltip is shown.
      setActive(target);
      return undefined;
    }
    const timer = setTimeout(() => setActive(target), target ? openDelay : closeDelay);
    return () => clearTimeout(timer);
  }, [target, isOpen, openDelay, closeDelay]);

  if (!active) {
    return null;
  }
  const node = content(active.entity);
  if (node === null || node === undefined) {
    return null;
  }
  return (
    <Popup
      open
      // A new anchor object per render: Popup re-reads the anchor only when its identity changes.
      anchorElement={createHoverAnchor(graph, active)}
      placement={placement}
      role="tooltip"
      returnFocus={false}
      disableLayer
      // Popup sets inline `pointer-events: auto` on its floating wrapper; `none` is inherited by the surface.
      floatingStyles={{ pointerEvents: "none" }}
      // The tooltip is controlled by hover only: nothing dismisses it, so skip the document listeners.
      disableEscapeKeyDown
      disableOutsideClick
      qa="graph-uikit-tooltip"
    >
      <div className="graph-uikit-tooltip">{node}</div>
    </Popup>
  );
}
