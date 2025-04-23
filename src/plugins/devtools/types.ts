import type { TComponentState } from "../../lib/Component";
import type { LayerProps } from "../../services/Layer";

/** Configuration options for the DevToolsLayer */
export interface TDevToolsLayerProps extends LayerProps {
  /** Show rulers */
  showRuler?: boolean;
  /** Show crosshair */
  showCrosshair?: boolean;
  /** Size (width/height) of the rulers in pixels */
  rulerSize?: number;
  /** Minimum screen distance between major ticks in pixels */
  minMajorTickDistance?: number;
  /** Background color for the rulers */
  rulerBackgroundColor?: string;
  /** Color for the ruler ticks */
  rulerTickColor?: string;
  /** Color for the ruler text labels */
  rulerTextColor?: string;
  /** Font for the ruler text labels */
  rulerTextFont?: string;
  /** Color for the crosshair lines */
  crosshairColor?: string;
  /** Color for the crosshair coordinate text */
  crosshairTextColor?: string;
  /** Font for the crosshair coordinate text */
  crosshairTextFont?: string;
  /** Background color for the crosshair coordinate text */
  crosshairTextBackgroundColor?: string;
}

/** State managed by the DevToolsLayer */
export interface TDevToolsLayerState extends TComponentState {
  /** Current mouse X position relative to the graph container (screen coordinates) */
  mouseX: number | null;
  /** Current mouse Y position relative to the graph container (screen coordinates) */
  mouseY: number | null;
  /** Whether the mouse is currently inside the graph container */
  isMouseInside: boolean;
  [key: string]: any;
}

/** Internal structure for tick calculation */
export interface TickInfo {
  /** World coordinate step between major ticks */
  majorTickStep: number;
  /** World coordinate step between minor ticks */
  minorTickStep: number;
  /** Number of minor ticks between major ticks */
  minorTicksPerMajor: number;
  /** Fixed precision for labels */
  precision: number;
}
