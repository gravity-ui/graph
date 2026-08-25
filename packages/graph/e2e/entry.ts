// E2E bundle entry point with CSS imports
import "../src/services/Layer.css";
import "../src/react-components/graph-canvas.css";
import "../src/react-components/Block.css";
import "../src/react-components/Anchor.css";

// Re-export everything from main index
export * from "../src/index";

// Re-export bezier helpers for e2e tests
export { generateBezierParams, getPointOfBezierCurve } from "../src/components/canvas/connections/bezierHelpers";
