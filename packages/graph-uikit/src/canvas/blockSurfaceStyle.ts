import type { TGraphColors } from "@gravity-ui/graph";

import { UIKIT_GRAPH_CONSTANTS } from "../constants";
import type { TUikitBlockTheme, TUikitPalette } from "../theme/types";

export type TUikitBlockSurfaceStyle = {
  /** Painted in order; a status color is layered over the opaque float background. */
  fills: string[];
  stroke: string;
  /** World units. */
  lineWidth: number;
  /** World units; 0 when it would be smaller than one screen pixel. */
  radius: number;
};

export type TUikitBlockSurfaceParams = {
  theme: TUikitBlockTheme;
  selected: boolean;
  hovered: boolean;
  scale: number;
  colors: TGraphColors;
  palette: TUikitPalette;
};

export function getUikitBlockSurfaceStyle(params: TUikitBlockSurfaceParams): TUikitBlockSurfaceStyle {
  const { theme, selected, hovered, scale, colors, palette } = params;
  const status = theme === "normal" ? undefined : palette.status[theme];
  const { borderWidth, selectedBorderWidth, radius } = UIKIT_GRAPH_CONSTANTS.block;

  let stroke = status ? status.border : colors.block.border;
  if (hovered) {
    stroke = palette.blockHoverBorder;
  }
  if (selected) {
    stroke = colors.block.selectedBorder;
  }
  const width = selected ? selectedBorderWidth : borderWidth;

  return {
    fills: status ? [colors.block.background, status.background] : [colors.block.background],
    stroke,
    lineWidth: Math.max(width, width / scale),
    radius: radius * scale < 1 ? 0 : radius,
  };
}
