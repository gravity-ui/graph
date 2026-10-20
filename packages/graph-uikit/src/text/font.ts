import type { Graph } from "@gravity-ui/graph";

import { getUikitGraphStore } from "../store/UikitGraphStore";
import type { TUikitTextStyle, TUikitTextVariant } from "../theme/types";

// TODO(graph-core): line height parsed from font string — "500 13px" becomes 50013 in core layoutText.
export function buildUikitFont(style: TUikitTextStyle): string {
  return `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

export function getUikitTextStyle(graph: Graph, variant: TUikitTextVariant = "body-1"): TUikitTextStyle {
  return getUikitGraphStore(graph).$typography.value[variant];
}

export function getUikitFont(graph: Graph, variant?: TUikitTextVariant): string {
  return buildUikitFont(getUikitTextStyle(graph, variant));
}

export function getUikitLineHeight(graph: Graph, variant?: TUikitTextVariant): number {
  return getUikitTextStyle(graph, variant).lineHeight;
}
