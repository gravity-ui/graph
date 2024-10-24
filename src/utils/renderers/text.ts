import { TMeasureTextOptions, TWrapText, measureMultilineText } from "../../utils/functions/text";
import { TRect } from "../../utils/types/shapes";

const cache = new Map<string, TWrapText>();

const getMeasureKey = (value: string, params: TMeasureTextOptions) => {
  return `${value}/${params.font}/${params.maxWidth}/${params.maxHeight}/${params.wordWrap}/${params.lineHeight}`;
};

export function clearTextCache() {
  cache.clear();
}

export function cachedMeasureText(text: string, params: TMeasureTextOptions) {
  const key = getMeasureKey(text, params);
  if (!cache.has(key)) {
    cache.set(key, measureMultilineText(text, params.font, params));
  }
  return cache.get(key);
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
      x = rect.x + rect.width || 0;
      break;
    }
  }

  ctx.textBaseline = "top";
  let y = rect.y;

  ctx.font = params.font;
  const lineHeight = params.lineHeight || parseInt(params.font.replace(/\D/gi, ""), 10);
  const measures = cachedMeasureText(text, {
    wordWrap: true,
    maxWidth: rect.width,
    maxHeight: rect.height,
    ...params,
  });
  const lines = [];
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
