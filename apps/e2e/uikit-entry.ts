// uikit E2E bundle entry point: core, React, uikit and @gravity-ui/graph-uikit in one bundle, so the kit
// renders in the same React tree and ThemeProvider as the fixture app. Kept separate from react-entry so
// uikit global styles never reach the other React specs.
import React from "react";
import ReactDOM from "react-dom/client";

import "@gravity-ui/uikit/styles/styles.css";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
import "@gravity-ui/graph-uikit/styles.css";

export * from "@gravity-ui/graph";
export {
  GraphContextMenu,
  GraphTooltip,
  UikitGraphCanvas,
  getUikitGraphStore,
  useUikitGraph,
} from "@gravity-ui/graph-uikit";
export { ThemeProvider } from "@gravity-ui/uikit";
export { React, ReactDOM };
