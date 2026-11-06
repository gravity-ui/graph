import type { TBaseConnectionState, TGraphColors } from "@gravity-ui/graph";

import { UIKIT_GRAPH_CONSTANTS } from "../constants";
import type { TUikitPalette } from "../theme/types";

type TConnectionStyleState = Partial<Pick<TBaseConnectionState, "selected" | "hovered" | "styles">>;

export function getUikitConnectionStroke(
  state: TConnectionStyleState,
  colors: TGraphColors,
  palette: TUikitPalette
): string {
  if (state.selected) {
    return state.styles?.selectedBackground || colors.connection.selectedBackground;
  }
  if (state.styles?.background) {
    return state.styles.background;
  }
  return state.hovered ? palette.connectionHover : colors.connection.background;
}

/** World line width that renders as 1 (or 2 when active) screen pixels. */
export function getUikitConnectionLineWidth(
  state: Partial<Pick<TBaseConnectionState, "selected" | "hovered">>,
  scale: number
): number {
  const { lineWidth, activeLineWidth } = UIKIT_GRAPH_CONSTANTS.connection;
  return (state.selected || state.hovered ? activeLineWidth : lineWidth) / scale;
}
