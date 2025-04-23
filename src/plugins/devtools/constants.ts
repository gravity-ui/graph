import type { TDevToolsLayerProps, TDevToolsLayerState } from "./types";

/** Default properties for the DevToolsLayer */
export const DEFAULT_DEVTOOLS_LAYER_PROPS: Omit<TDevToolsLayerProps, "graph" | "camera" | "root" | "emitter"> = {
  showRuler: true,
  showCrosshair: true,
  rulerSize: 20,
  minMajorTickDistance: 50, // Minimum screen pixels between major ticks
  rulerBackgroundColor: "rgba(45, 45, 45, 0.9)",
  rulerTickColor: "rgba(150, 150, 150, 1)",
  rulerTextColor: "rgba(200, 200, 200, 1)",
  rulerTextFont: "11px Helvetica",
  crosshairColor: "rgba(255, 0, 0, 0.7)",
  crosshairTextColor: "rgba(255, 255, 255, 1)",
  crosshairTextFont: "11px Helvetica",
  crosshairTextBackgroundColor: "rgba(0, 0, 0, 0.7)",
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
