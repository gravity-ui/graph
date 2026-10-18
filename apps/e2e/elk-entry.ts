// ELK E2E bundle entry point: core, the React package, the browser-ready ELK build and the public
// @gravity-ui/graph-elk entrypoints in one bundle, so the ELK hook runs in the same React tree as GraphCanvas.
import ELK from "elkjs/lib/elk.bundled.js";
import React from "react";
import ReactDOM from "react-dom/client";

import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";

export * from "@gravity-ui/graph";
export { GraphBlock, GraphBlockAnchor, GraphCanvas, useGraph } from "@gravity-ui/graph-react";
export { elkConverter } from "@gravity-ui/graph-elk";
export { useElk } from "@gravity-ui/graph-elk/react";
export { ELK, React, ReactDOM };
