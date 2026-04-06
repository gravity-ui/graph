import { TMeasureTextOptions, TWrapText, measureMultilineText } from "../../utils/functions/text";
import { TRect } from "../../utils/types/shapes";

const cache = new Map<string, TWrapText>();

const getMeasureKey = (value: string, params: TMeasureTextOptions) => {
  return `${value}/${params.font}/${params.maxWidth}/${params.maxHeight}/${params.wordWrap}/${params.lineHeight}`;
};

export function clearTextCache() {
  cache.clear();
}

export function cachedMeasureText(text: string, params: TMeasureTextOptions): TWrapText {
  const key = getMeasureKey(text, params);
  let result = cache.get(key);
  if (result === undefined) {
    result = measureMultilineText(text, params.font, params);
    cache.set(key, result);
  }
  return result;
}

export function layoutText(text: string, ctx: CanvasRenderingContext2D, rect: TTExtRect, params: TMeasureTextOptions) {
  let x = rect.x;

  switch (ctx.textAlign) {
    case "center": {
      // if (rect.width) {
      x = rect.x + (rect.width || 0) / 2;
      // }
      break;
    }
    case "right":
    case "end": {
      x = rect.x + (rect.width ?? 0);
      break;
    }
  }

  ctx.textBaseline = "top";
  let y = rect.y;

  const resolvedFont = params.font ?? ctx.font;
  ctx.font = resolvedFont;
  const parsedFromFont = Number.parseInt(resolvedFont.replace(/\D/gi, ""), 10);
  const lineHeight =
    params.lineHeight ?? (Number.isFinite(parsedFromFont) ? parsedFromFont : 12);
  const measures = cachedMeasureText(text, {
    wordWrap: true,
    maxWidth: rect.width,
    maxHeight: rect.height,
    ...params,
  });
  const lines: [string, number, number][] = [];
  for (const line of measures.linesWords) {
    lines.push([line, x, y]);
    y += lineHeight;
    if (rect.height && y > rect.y + rect.height - lineHeight) {
      break;
    }
  }
  return {
    measures,
    lines,
    lineHeight,
  };
}

export type TTExtRect = Omit<TRect, "width" | "height"> & Partial<Pick<TRect, "width" | "height">>;
export function renderText(text: string, ctx: CanvasRenderingContext2D, rect: TTExtRect, params: TMeasureTextOptions) {
  const { lines, measures } = layoutText(text, ctx, rect, params);

  for (const [line, x, y] of lines) {
    ctx.fillText(line, x, y);
  }

  return measures;
}
