// Public API. Everything not listed here is internal and may change without notice.

// Facade
export { useUikitGraph } from "./react/useUikitGraph";
export type { TUikitGraphParams } from "./react/useUikitGraph";
export { UikitGraphCanvas } from "./react/UikitGraphCanvas";
export type { TUikitGraphMode } from "./store/UikitGraphStore";

// React
export { UikitGraphBlock, UikitGraphBlockContent } from "./react/UikitGraphBlock";
export type { TUikitGraphBlockProps } from "./react/UikitGraphBlock";

// Canvas
export { UikitBlock } from "./canvas/UikitBlock";
export { UikitConnection } from "./canvas/UikitConnection";
export type { TUikitBlock, TUikitBlockMeta } from "./canvas/types";
export type { TUikitBlockTheme } from "./theme/types";
export { traceRoundedRect } from "./canvas/roundedRect";
export { getUikitBlockSurfaceStyle } from "./canvas/blockSurfaceStyle";
export type { TUikitBlockSurfaceStyle } from "./canvas/blockSurfaceStyle";

// Text
export { measureUikitText, renderUikitText } from "./text/renderUikitText";
export { getUikitFont, getUikitLineHeight } from "./text/font";
export { clearUikitTextCache } from "./text/measure";
export type { TUikitTextLayout, TUikitTextProps } from "./text/types";
export type { TUikitTextColor, TUikitTextVariant } from "./theme/types";

// Theme
export { UIKIT_GRAPH_TOKENS } from "./theme/tokens";
export type { TUikitGraphTokens } from "./theme/tokens";
export { DEFAULT_UIKIT_PALETTE } from "./theme/palette";
export { DEFAULT_UIKIT_TYPOGRAPHY } from "./theme/typography";
export { readUikitTheme } from "./theme/resolveUikitTheme";
export { useUikitGraphTheme } from "./theme/useUikitGraphTheme";
export type { TUikitGraphTheme, TUikitPalette, TUikitStatus, TUikitTextStyle, TUikitTypography } from "./theme/types";

// Store
export { getUikitGraphStore } from "./store/UikitGraphStore";
export type { UikitGraphStore } from "./store/UikitGraphStore";

// Interactions
export { GraphTooltip } from "./interactions/GraphTooltip";
export type { TGraphTooltipProps } from "./interactions/GraphTooltip";
export { GraphContextMenu } from "./interactions/GraphContextMenu";
export type { TGraphContextMenuProps, TGraphMenuItem } from "./interactions/GraphContextMenu";
export { useHoveredEntity } from "./interactions/useHoveredEntity";
export { UikitInteractionLayer } from "./interactions/UikitInteractionLayer";
export { getEntityViewportRect } from "./interactions/entity";
export type {
  TClientRect,
  TGraphComponentEntity,
  TGraphEntity,
  TGraphEntityKind,
  TGraphHoverState,
} from "./interactions/types";

// Constants
export { UIKIT_GRAPH_CONSTANTS } from "./constants";
