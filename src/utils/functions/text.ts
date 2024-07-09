export function getFontSize(fontSize, scale) {
  return (fontSize / scale) | 0;
}

const canvas: HTMLCanvasElement = document.createElement("canvas");
const context: CanvasRenderingContext2D = canvas.getContext("2d");
const mapTextToMeasures: Map<string, number> = new Map();

export function measureText(text, font, approximate = true): number {
  context.font = font;

  if (!approximate) {
    return Math.floor(context.measureText(text).width + 1);
  }

  const key = `${text}-${font}`;

  if (!mapTextToMeasures.has(key)) {
    mapTextToMeasures.set(key, Math.floor(context.measureText(text).width + 1));
  }

  return mapTextToMeasures.get(key);
}

function sliceAt(string: string, index: number): Array<string> {
  return [string.slice(0, index), string.slice(index)];
}

function notEmptyLine(line: TWordWrapResult): boolean {
  return line.width > 0 && line.text.length > 0;
}

export type TPayloadWrappedText = {
  name: TWrapText;
};

type TWordWrapResult = {
  text: string;
  width: number;
};

type TWordWrapOptions = {
  lineHeight: number;
  measureText: (text: string) => number;
  maxWidth?: number;
  maxHeight?: number;
  wordWrap?: boolean;
};

function wrapLines(
  text: string,
  { lineHeight, measureText, maxWidth = +Infinity, maxHeight = +Infinity, wordWrap = true }: TWordWrapOptions
): Array<TWordWrapResult> {
  let lines = [];

  if (!text) {
    return lines;
  }

  if (!wordWrap) {
    lines = [{ text, width: measureText(text) }];
    return lines;
  }

  // split string by space-like symbols/sequences.
  const words = text.trim().split(/\s+/);

  const SPACE = " ";
  const MAX_ITERATIONS = 1000;

  const spaceWidth = measureText(SPACE);

  let currentLine = "";
  let currentLineWidth = 0;

  let nextWordWidth;
  let nextWidth;
  let totalHeight = 0;

  const lineBreak = () => {
    const text = currentLine.trim();
    // all lines start with one space, we remove it here.
    const width = text.length > 0 ? currentLineWidth - spaceWidth : 0;

    lines.push({ text, width });

    currentLine = "";
    currentLineWidth = 0;
    totalHeight += lineHeight;
  };

  // Iterate over all words, trying to insert as many in line as possible
  // until we exceed the maximum line width. When it happens,
  // we either insert a line break before the upcoming word
  // or break the current word if it is the only one.

  // Presenting words as a stack so that we can push() bits of words on top of it.
  const stack = words.slice().reverse();
  let nextWord;
  let iterations = 0;

  // We also watch for next total height so that we don't overflow.
  while (iterations < MAX_ITERATIONS && stack.length > 0 && totalHeight + lineHeight <= maxHeight) {
    iterations++;
    nextWord = stack.pop();
    nextWordWidth = measureText(nextWord);

    // We don't check for currentLineWidth === 0,
    // so all lines have space symbol at the start.
    // We will trim it later.
    nextWidth = currentLineWidth + spaceWidth + nextWordWidth;

    // if the next word fits, append it
    if (nextWidth <= maxWidth) {
      currentLine += SPACE + nextWord;
      currentLineWidth = nextWidth;
      continue;
    }

    // if it doesn't, and currentLine is not empty, push the word back
    // and do the line break
    if (currentLineWidth > 0) {
      stack.push(nextWord);
      lineBreak();
    } else {
      // Current word doesn't fit into a line and it's the only one.
      // Let's cut one symbol from the end until it fits.
      let parts = [nextWord, ""];
      let breakAt = nextWord.length - 1;
      while (breakAt > 0 && nextWordWidth > maxWidth) {
        parts = sliceAt(nextWord, breakAt);
        breakAt--;
        nextWordWidth = measureText(parts[0]);
      }

      // At this moment we broke current word in two pieces:
      // partA will be the currentLine, and partB should be considered as
      // a usual word on the next iteration.
      currentLine = parts[0];
      currentLineWidth = nextWordWidth;
      lineBreak();
      stack.push(parts[1]);
    }
  }

  // If we accumulated something and will not reach the max width
  // by adding a line, make a line out of accumulated words.
  if (currentLineWidth && totalHeight + lineHeight <= maxHeight) {
    lineBreak();
  }

  return lines.filter(notEmptyLine);
}

export type TMeasureTextOptions = {
  font?: string;
  wordWrap?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  lineHeight?: number;
};

export type TWrapText = {
  width: number;
  height: number;
  lineHeight: number;
  linesWords: string[];
  linesWidths: number[];
};

export function measureMultilineText(
  text: string,
  font = "12px",
  { lineHeight, wordWrap = false, maxWidth = Infinity, maxHeight = Infinity }: TMeasureTextOptions
): TWrapText {
  const boundMeasureText = (text) => measureText(text, font);
  lineHeight = lineHeight || parseInt(font.replace(/\D/gi, ""), 10);
  const lines = wrapLines(text, {
    measureText: boundMeasureText,
    lineHeight: lineHeight || parseInt(font.replace(/\D/gi, ""), 10),
    wordWrap,
    maxWidth,
    maxHeight,
  });

  let maxLineWidth = 0;
  const linesWords: string[] = [];
  const linesWidths: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    linesWords.push(lines[i].text);
    linesWidths.push(lines[i].width);
    maxLineWidth = Math.max(maxLineWidth, lines[i].width);
  }

  return {
    width: maxLineWidth,
    height: Math.min(Math.floor(linesWords.length * lineHeight + lineHeight * 0.3), maxHeight),
    lineHeight,
    linesWords,
    linesWidths,
  };
}
