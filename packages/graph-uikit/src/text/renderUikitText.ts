import type { Graph, TRect } from "@gravity-ui/graph";

import { UIKIT_GRAPH_CONSTANTS } from "../constants";
import { getUikitGraphStore } from "../store/UikitGraphStore";

import { buildUikitFont, getUikitTextStyle } from "./font";
import { layoutUikitText } from "./layoutUikitText";
import { getMeasureContext, measureTextWidth } from "./measure";
import type { TUikitTextLayout, TUikitTextProps } from "./types";

const EMPTY_LAYOUT: TUikitTextLayout = { lines: [], width: 0, height: 0 };

export function measureUikitText(
  graph: Graph,
  text: string,
  props: TUikitTextProps & { maxWidth: number; maxLines?: number },
  ctx: CanvasRenderingContext2D | null = getMeasureContext()
): TUikitTextLayout {
  if (!ctx) {
    return EMPTY_LAYOUT;
  }
  const style = getUikitTextStyle(graph, props.variant);
  const font = buildUikitFont(style);
  const { lines, width } = layoutUikitText(text, props, (value) => measureTextWidth(ctx, font, value));
  return { lines, width, height: lines.length * style.lineHeight };
}

function getAnchorX(rect: TRect, align: CanvasTextAlign): number {
  if (align === "center") {
    return rect.x + rect.width / 2;
  }
  if (align === "right" || align === "end") {
    return rect.x + rect.width;
  }
  return rect.x;
}

/** Draws text like uikit `<Text>` inside `rect` (world coordinates). */
export function renderUikitText(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  text: string,
  rect: TRect,
  props: TUikitTextProps = {}
): TUikitTextLayout {
  const style = getUikitTextStyle(graph, props.variant);
  if (style.fontSize * graph.cameraService.getCameraScale() < UIKIT_GRAPH_CONSTANTS.text.minScreenFontSize) {
    return EMPTY_LAYOUT;
  }
  const font = buildUikitFont(style);
  const maxLines = Math.max(1, Math.floor(rect.height / style.lineHeight));
  const { lines, width } = layoutUikitText(text, { ...props, maxWidth: rect.width, maxLines }, (value) =>
    measureTextWidth(ctx, font, value)
  );
  const align = props.align ?? "left";
  const x = getAnchorX(rect, align);
  const halfLeading = (style.lineHeight - style.fontSize) / 2;

  ctx.font = font;
  ctx.fillStyle = props.fill ?? getUikitGraphStore(graph).$palette.value.text[props.color ?? "primary"];
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    ctx.fillText(line, x, rect.y + index * style.lineHeight + halfLeading);
  });

  return { lines, width, height: lines.length * style.lineHeight };
}
