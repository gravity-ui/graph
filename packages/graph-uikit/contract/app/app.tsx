import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

import { GraphState } from "@gravity-ui/graph";
import { useGraphEvent } from "@gravity-ui/graph-react";
import {
  GraphContextMenu,
  GraphTooltip,
  UikitGraphCanvas,
  useUikitGraph,
  type TUikitBlock,
} from "@gravity-ui/graph-uikit";
import { ThemeProvider } from "@gravity-ui/uikit";
import "@gravity-ui/uikit/styles/styles.css";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
import "@gravity-ui/graph-uikit/styles.css";

import "../../../../scripts/package-contract/shared/base.css";
import "./app.css";

const blocks = [
  {
    id: "uikit-source",
    is: "Block",
    x: 180,
    y: 160,
    width: 220,
    height: 120,
    name: "uikit source",
    anchors: [],
    meta: { description: "installed kit", theme: "info" },
  },
] satisfies TUikitBlock[];

function UikitGraph(): React.ReactElement {
  const { graph, setEntities, start } = useUikitGraph({ mode: "view" });

  useLayoutEffect(() => {
    setEntities({ blocks, connections: [] });
    start();
  }, [setEntities, start]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.READY) {
      graph.zoomTo("center");
      const root = document.querySelector<HTMLDivElement>("#react-root");
      if (root) {
        root.dataset.state = "ready";
      }
    }
  });

  return (
    <UikitGraphCanvas graph={graph}>
      <GraphTooltip content={(entity) => String(entity.id)} />
      <GraphContextMenu items={() => null} />
    </UikitGraphCanvas>
  );
}

const root = document.querySelector<HTMLDivElement>("#react-root");
if (!root) {
  throw new Error("React root was not found.");
}

createRoot(root).render(
  <ThemeProvider theme="light">
    <UikitGraph />
  </ThemeProvider>
);
