import { CSSVariableType } from "./types";
import type { CSSVariableMappings, CSSVariablesLayerProps } from "./types";

/**
 * Default props for CSSVariablesLayer
 */
export const DEFAULT_CSS_VARIABLES_LAYER_PROPS: Partial<CSSVariablesLayerProps> = {
  debug: false,
  html: {
    zIndex: 1,
    classNames: ["css-variables-layer"],
    transformByCameraPosition: false,
  },
};

/**
 * Mapping of CSS variables to graph colors and constants
 */
export const CSS_VARIABLE_MAPPINGS: CSSVariableMappings = [
  // Canvas colors
  {
    cssVariable: "--graph-canvas-background",
    graphPath: "canvas.layerBackground",
    typeConverter: CSSVariableType.COLOR,
  },
  {
    cssVariable: "--graph-canvas-below-background",
    graphPath: "canvas.belowLayerBackground",
    typeConverter: CSSVariableType.COLOR,
  },
  { cssVariable: "--graph-canvas-dots", graphPath: "canvas.dots", typeConverter: CSSVariableType.COLOR },
  { cssVariable: "--graph-canvas-border", graphPath: "canvas.border", typeConverter: CSSVariableType.COLOR },

  // Block colors
  { cssVariable: "--graph-block-background", graphPath: "block.background", typeConverter: CSSVariableType.COLOR },
  { cssVariable: "--graph-block-border", graphPath: "block.border", typeConverter: CSSVariableType.COLOR },
  { cssVariable: "--graph-block-text", graphPath: "block.text", typeConverter: CSSVariableType.COLOR },
  {
    cssVariable: "--graph-block-selected-border",
    graphPath: "block.selectedBorder",
    typeConverter: CSSVariableType.COLOR,
  },

  // Anchor colors
  { cssVariable: "--graph-anchor-background", graphPath: "anchor.background", typeConverter: CSSVariableType.COLOR },
  {
    cssVariable: "--graph-anchor-selected-border",
    graphPath: "anchor.selectedBorder",
    typeConverter: CSSVariableType.COLOR,
  },

  // Connection colors
  {
    cssVariable: "--graph-connection-background",
    graphPath: "connection.background",
    typeConverter: CSSVariableType.COLOR,
  },
  {
    cssVariable: "--graph-connection-selected-background",
    graphPath: "connection.selectedBackground",
    typeConverter: CSSVariableType.COLOR,
  },

  // Connection label colors
  {
    cssVariable: "--graph-connection-label-background",
    graphPath: "connectionLabel.background",
    typeConverter: CSSVariableType.COLOR,
  },
  {
    cssVariable: "--graph-connection-label-hover-background",
    graphPath: "connectionLabel.hoverBackground",
    typeConverter: CSSVariableType.COLOR,
  },
  {
    cssVariable: "--graph-connection-label-selected-background",
    graphPath: "connectionLabel.selectedBackground",
    typeConverter: CSSVariableType.COLOR,
  },
  {
    cssVariable: "--graph-connection-label-text",
    graphPath: "connectionLabel.text",
    typeConverter: CSSVariableType.COLOR,
  },
  {
    cssVariable: "--graph-connection-label-hover-text",
    graphPath: "connectionLabel.hoverText",
    typeConverter: CSSVariableType.COLOR,
  },
  {
    cssVariable: "--graph-connection-label-selected-text",
    graphPath: "connectionLabel.selectedText",
    typeConverter: CSSVariableType.COLOR,
  },

  // Selection colors
  {
    cssVariable: "--graph-selection-background",
    graphPath: "selection.background",
    typeConverter: CSSVariableType.COLOR,
  },
  { cssVariable: "--graph-selection-border", graphPath: "selection.border", typeConverter: CSSVariableType.COLOR },

  // Block constants
  { cssVariable: "--graph-block-width", graphPath: "block.WIDTH", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-block-height", graphPath: "block.HEIGHT", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-block-width-min", graphPath: "block.WIDTH_MIN", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-block-head-height", graphPath: "block.HEAD_HEIGHT", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-block-body-padding", graphPath: "block.BODY_PADDING", typeConverter: CSSVariableType.FLOAT },

  // System constants
  { cssVariable: "--graph-grid-size", graphPath: "system.GRID_SIZE", typeConverter: CSSVariableType.INT },
  { cssVariable: "--graph-usable-rect-gap", graphPath: "system.USABLE_RECT_GAP", typeConverter: CSSVariableType.FLOAT },

  // Camera constants
  { cssVariable: "--graph-camera-speed", graphPath: "camera.SPEED", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-camera-step", graphPath: "camera.STEP", typeConverter: CSSVariableType.FLOAT },

  // Text constants
  {
    cssVariable: "--graph-text-base-font-size",
    graphPath: "text.BASE_FONT_SIZE",
    typeConverter: CSSVariableType.FLOAT,
  },
  { cssVariable: "--graph-text-padding", graphPath: "text.PADDING", typeConverter: CSSVariableType.FLOAT },
];

/**
 * Set of all supported CSS variable names for quick lookup
 */
export const SUPPORTED_CSS_VARIABLES = new Set(CSS_VARIABLE_MAPPINGS.map((mapping) => mapping.cssVariable));
