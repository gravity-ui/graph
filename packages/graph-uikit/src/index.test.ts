import * as api from "./index";

describe("public API", () => {
  it("exports only the documented runtime values", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        // Facade
        "useUikitGraph",
        "UikitGraphCanvas",
        // React
        "UikitGraphBlock",
        "UikitGraphBlockContent",
        // Canvas
        "UikitBlock",
        "UikitConnection",
        "traceRoundedRect",
        "getUikitBlockSurfaceStyle",
        // Text
        "renderUikitText",
        "measureUikitText",
        "getUikitFont",
        "getUikitLineHeight",
        "clearUikitTextCache",
        // Theme
        "UIKIT_GRAPH_TOKENS",
        "DEFAULT_UIKIT_PALETTE",
        "DEFAULT_UIKIT_TYPOGRAPHY",
        "readUikitTheme",
        "useUikitGraphTheme",
        // Store
        "getUikitGraphStore",
        // Interactions
        "GraphTooltip",
        "GraphContextMenu",
        "useHoveredEntity",
        "UikitInteractionLayer",
        "getEntityViewportRect",
        // Toolbar
        "GraphUikitToolbar",
        "group",
        "zoomGroup",
        // Constants
        "UIKIT_GRAPH_CONSTANTS",
      ].sort()
    );
  });
});
