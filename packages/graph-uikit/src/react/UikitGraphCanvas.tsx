import React from "react";

import { ConnectionEditingLayer } from "@gravity-ui/graph-connection-editing";
import { GraphCanvas, useLayer, useSignal } from "@gravity-ui/graph-react";
import type { GraphProps, TRenderBlockFn } from "@gravity-ui/graph-react";

import { UikitInteractionLayer } from "../interactions/UikitInteractionLayer";
import { getUikitGraphStore } from "../store/UikitGraphStore";
import { useUikitGraphTheme } from "../theme/useUikitGraphTheme";

import { UikitGraphBlock } from "./UikitGraphBlock";

const renderUikitBlock: TRenderBlockFn = (graph, block) => <UikitGraphBlock graph={graph} block={block} />;

/** GraphCanvas with the uikit theme bridge, interaction layer and connection editing (edit mode). */
export function UikitGraphCanvas({
  graph,
  renderBlock = renderUikitBlock,
  children,
  ...canvasProps
}: GraphProps): React.ReactElement {
  const mode = useSignal(getUikitGraphStore(graph).$mode);

  useUikitGraphTheme(graph);
  useLayer(graph, UikitInteractionLayer, {});
  // Always mounted: toggling `enabled` keeps the layer and its subscriptions stable.
  useLayer(graph, ConnectionEditingLayer, { enabled: mode === "edit" });

  return (
    <GraphCanvas graph={graph} renderBlock={renderBlock} {...canvasProps}>
      {children}
    </GraphCanvas>
  );
}
