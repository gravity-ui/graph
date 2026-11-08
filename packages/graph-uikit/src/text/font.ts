import type { Graph } from "@gravity-ui/graph";

import { getUikitGraphStore } from "../store/UikitGraphStore";
import type { TUikitTextStyle, TUikitTextVariant } from "../theme/types";

// TODO(graph-core): line height parsed from font string — "500 13px" becomes 50013 in core layoutText.
export function buildUikitFont(style: TUikitTextStyle): string {
  return `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

/** Falls back to body-1 for a variant the typography lacks (e.g. one added by a newer uikit). */
export function getUikitTextStyle(graph: Graph, variant: TUikitTextVariant = "body-1"): TUikitTextStyle {
  const typography = getUikitGraphStore(graph).$typography.value;
  // The record type claims every variant; at runtime the consumer's uikit may know more than the kit.
  const style: TUikitTextStyle | undefined = typography[variant];
  return style ?? typography["body-1"];
}

export function getUikitFont(graph: Graph, variant?: TUikitTextVariant): string {
  return buildUikitFont(getUikitTextStyle(graph, variant));
}

export function getUikitLineHeight(graph: Graph, variant?: TUikitTextVariant): number {
  return getUikitTextStyle(graph, variant).lineHeight;
}
