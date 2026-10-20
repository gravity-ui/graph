import type { TUikitTextProps } from "./types";

export const ELLIPSIS = "…";

export type TMeasure = (text: string) => number;

export type TLayoutTextOptions = Pick<TUikitTextProps, "ellipsis" | "ellipsisLines" | "whiteSpace" | "wordBreak"> & {
  maxWidth: number;
  /** Lines that fit vertically; extra lines are dropped (ellipsized with `ellipsis` / `ellipsisLines`). */
  maxLines?: number;
};

/** Cuts text so that it ends with "…" and fits `maxWidth`; the ellipsis is added even when the text fits. */
function truncateWithEllipsis(text: string, maxWidth: number, measure: TMeasure): string {
  if (measure(ELLIPSIS) > maxWidth) {
    return "";
  }
  const chars = Array.from(text);
  const withEllipsis = (count: number): string => `${chars.slice(0, count).join("").trimEnd()}${ELLIPSIS}`;
  // Invariant: withEllipsis(low) fits.
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(withEllipsis(mid)) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return withEllipsis(low);
}

// TODO(graph-core): ellipsis / line clamp in layoutText — core has none.
export function ellipsize(text: string, maxWidth: number, measure: TMeasure): string {
  return measure(text) <= maxWidth ? text : truncateWithEllipsis(text, maxWidth, measure);
}

function breakWord(word: string, maxWidth: number, measure: TMeasure): string[] {
  const chunks: string[] = [];
  let chunk = "";
  for (const char of word) {
    if (chunk && measure(chunk + char) > maxWidth) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk += char;
    }
  }
  if (chunk) {
    chunks.push(chunk);
  }
  return chunks;
}

function wrapParagraph(paragraph: string, maxWidth: number, measure: TMeasure, breakWords: boolean): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of paragraph.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (measure(word) <= maxWidth || !breakWords) {
      current = word;
      continue;
    }
    const chunks = breakWord(word, maxWidth, measure);
    lines.push(...chunks.slice(0, -1));
    current = chunks[chunks.length - 1] ?? "";
  }
  lines.push(current);
  return lines;
}

/** Splits text into lines the way uikit `<Text>` lays it out in the DOM. */
export function layoutUikitText(
  text: string,
  options: TLayoutTextOptions,
  measure: TMeasure
): { lines: string[]; width: number } {
  const { maxWidth, whiteSpace, wordBreak, ellipsis = false, ellipsisLines } = options;
  const singleLine = ellipsis || whiteSpace === "nowrap";
  const normalized = whiteSpace === "break-spaces" ? text : text.replace(/\s+/g, " ").trim();

  let lines = singleLine
    ? [normalized.replace(/\n/g, " ")]
    : normalized.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measure, Boolean(wordBreak)));

  const limit = Math.min(singleLine ? 1 : ellipsisLines ?? Infinity, options.maxLines ?? Infinity);
  const truncate = ellipsis || ellipsisLines !== undefined;

  if (lines.length > limit) {
    const kept = lines.slice(0, Math.max(limit, 0));
    if (truncate && kept.length > 0) {
      // Lines were dropped, so the last kept one always ends with "…" (and keeps room for it).
      const last = kept.length - 1;
      kept[last] = truncateWithEllipsis(kept[last], maxWidth, measure);
    }
    lines = kept;
  } else if (truncate && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = ellipsize(lines[last], maxWidth, measure);
  }

  return { lines, width: lines.reduce((max, line) => Math.max(max, measure(line)), 0) };
}
