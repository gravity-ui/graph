// React E2E bundle entry point
import React from "react";
import ReactDOM from "react-dom/client";

import "../src/services/Layer.css";
import "../src/react-components/graph-canvas.css";
import "../src/react-components/Block.css";
import "../src/react-components/Anchor.css";

// Re-export everything from main and react indexes
export * from "../src/index";
export * from "../src/react-components/index";
export { React, ReactDOM };
