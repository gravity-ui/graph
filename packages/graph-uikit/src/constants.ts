/**
 * Metrics shared by canvas rendering and React blocks. The block radius matches uikit `--g-border-radius-l`
 * (8px) and the padding `--g-spacing-3` (12px).
 */
export const UIKIT_GRAPH_CONSTANTS = {
  block: {
    radius: 8,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    selectedBorderWidth: 2,
  },
  connection: {
    lineWidth: 1,
    activeLineWidth: 2,
    labelRadius: 4,
    labelPaddingX: 4,
    labelPaddingY: 0,
  },
  text: {
    /** Text smaller than this on screen (px) is not drawn. */
    minScreenFontSize: 4,
  },
  hover: {
    /** Frames to debounce canvas hover changes, same as BaseConnection. */
    frameInterval: 3,
  },
} as const;
