import type { TDevToolsLayerProps, TDevToolsLayerState } from "./types";

/** Default properties for the DevToolsLayer */
export const DEFAULT_DEVTOOLS_LAYER_PROPS: Omit<TDevToolsLayerProps, "graph" | "camera" | "root" | "emitter"> = {
  showRuler: true,
  showCrosshair: true,
  rulerSize: 25,
  minMajorTickDistance: 50, // Minimum screen pixels between major ticks
  rulerBackgroundColor: "rgba(46, 46, 46, .4)",
  rulerTickColor: "rgb(93, 93, 93)",
  rulerTextColor: "rgba(245, 245, 245, 0.8)",
  rulerTextFont: "11px Helvetica",
  crosshairColor: "rgba(255, 0, 0, 0.7)",
  crosshairTextColor: "rgba(255, 255, 255, 1)",
  crosshairTextFont: "11px Helvetica",
  crosshairTextBackgroundColor: "rgba(0, 0, 0, 0.7)",
  rulerBackdropBlur: 5, // Default blur strength in pixels
};

/** Initial state for the DevToolsLayer */
export const INITIAL_DEVTOOLS_LAYER_STATE: TDevToolsLayerState = {
  mouseX: null,
  mouseY: null,
  isMouseInside: false,
};

/** Factor for minor tick length relative to major tick length */
export const MINOR_TICK_LENGTH_FACTOR = 0.6;

/** Length of major ticks */
export const MAJOR_TICK_LENGTH = 8;
