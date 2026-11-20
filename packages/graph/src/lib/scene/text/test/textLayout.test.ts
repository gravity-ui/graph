import { measureMultilineText } from "../../../../utils/functions/text";
import type { TScenePrimitive } from "../../types";
import { ELLIPSIS, TEXT_METRICS_PX, boundingLineCount, isLayoutValid, layoutText } from "../textLayout";
import type { ISceneTextMetrics } from "../textLayout";
import { CanvasTextMetrics } from "../textMetrics";
import { placeText, resolveTextSize, textAnchor, textBounds, textClip } from "../textPlacement";

type TText = Extract<TScenePrimitive, { kind: "text" }>;

/**
 * Widths that scale with the font size: each character's width per pixel of font size, from its code. No two words of
 * the corpus share an integer width boundary, so v1's rounding (`Math.floor(width + 1)`) is the only rounding.
 */
function charWidth(char: string): number {
  return char === " " ? 0.2831 : 0.31 + ((char.charCodeAt(0) * 7919) % 97) / 311;
}

function widthAt(text: string, px: number): number {
  let width = 0;
  for (const char of text) width += charWidth(char) * px;
  return width;
}

/** The shared metrics with the corpus widths: measured at TEXT_METRICS_PX, a top 0.8 of the size below the line. */
const metrics: ISceneTextMetrics = {
  generation: 0,
  width: (text) => widthAt(text, TEXT_METRICS_PX),
  top: () => 0.8 * TEXT_METRICS_PX,
};

/** A 10-unit text, 12 per line, in a 100 x 48 box at (4, 20). */
function text(patch: Partial<TText> = {}): TText {
  return {
    kind: "text",
    text: "t",
    family: "f",
    size: 10,
    lineHeight: 12,
    x: 4,
    y: 20,
    width: 100,
    height: 48,
    ...patch,
  };
}

describe("resolveTextSize", () => {
  it("is the size of a world text and the clamped screen size of a camera-aware one", () => {
    expect(resolveTextSize(text(), 0.1)).toBe(10);
    expect(resolveTextSize(text({ cameraAware: true }), 0.5)).toBe(20);
    expect(resolveTextSize(text({ cameraAware: { maxWorld: 40 } }), 0.1)).toBe(40);
    expect(resolveTextSize(text({ cameraAware: { minWorld: 8 } }), 2)).toBe(8);
    expect(resolveTextSize(text({ cameraAware: false }), 0.5)).toBe(10);
  });

  it("is the authored world size under a policy that turns camera awareness off", () => {
    expect(resolveTextSize(text({ cameraAware: { maxWorld: 40 } }), 0.1, { cameraAware: false })).toBe(10);
    expect(resolveTextSize(text({ cameraAware: true }), 0.5, { cameraAware: true })).toBe(20);
  });
});

describe("layoutText against v1 measureMultilineText", () => {
  let measure: jest.SpyInstance;

  // Once for the block: jest-canvas-mock binds the prototype's measureText into each context it creates, and v1 keeps
  // its one context.
  beforeAll(() => {
    // v1 measures with a canvas context at the font's pixel size; the mock gives it the corpus widths.
    measure = jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(function (
      this: CanvasRenderingContext2D,
      value: string
    ): TextMetrics {
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1]);
      return { width: widthAt(value, px) } as TextMetrics;
    });
  });

  afterAll(() => measure.mockRestore());

  const CORPUS = [
    "Load the daily partitions",
    "Supercalifragilisticexpialidocious words split by characters",
    "several   spaces   between    words",
    "lines\nwith\nnewlines and\ttabs",
    "  leading and trailing spaces  ",
    "a b c d e f g h i j k l m n o p q r s t u v w x y z",
    "Antidisestablishmentarianism",
    "x",
  ];
  const BOXES: ReadonlyArray<[width: number, height: number | undefined]> = [
    [80, 48],
    [140, 30],
    [60, undefined],
    [200, 100],
    [45, 1000],
    [100, 8],
  ];
  const SIZES = [7.3, 9, 13, 17.75, 24];
  for (const source of CORPUS) {
    it(`gives v1's lines for ${JSON.stringify(source)}`, () => {
      for (const [width, height] of BOXES) {
        for (const size of SIZES) {
          // v1 drew at the resolved size with a line height of the same pitch: 1.25 of the font here.
          const primitive = text({ text: source, size: 9, lineHeight: 11.25, width, height, cameraAware: true });
          const pitch = (11.25 / 9) * size;
          const v1 = measureMultilineText(source, `${size}px f`, {
            wordWrap: true,
            maxWidth: width,
            maxHeight: height,
            lineHeight: pitch,
          });
          const layout = layoutText(primitive, size, metrics);
          expect(layout.lines).toEqual(v1.linesWords);
          // Each line's raw width is its words' and the single spaces' between them.
          layout.lines.forEach((line, row) => {
            const words = line.split(" ");
            const raw = words.reduce((sum, word) => sum + widthAt(word, TEXT_METRICS_PX), 0);
            expect(layout.widths[row]).toBeCloseTo(raw + (words.length - 1) * widthAt(" ", TEXT_METRICS_PX), 6);
          });
        }
      }
    });
  }
});

describe("layoutText", () => {
  it("keeps the lines while they fit the box's height at the resolved pitch, then maxLines", () => {
    const words = "aa bb cc dd ee ff gg hh";
    // At size 10 a word is 6 and a space 3: one word per 9-wide line, 12 per line; at size 20 the pitch is 24.
    const narrow = text({ text: words, width: 9, height: 48 });
    const tiny: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 25, top: () => 80 };
    expect(layoutText(narrow, 10, tiny).lines).toEqual(["aa", "bb", "cc", "dd"]);
    expect(layoutText({ ...narrow, height: 20, cameraAware: true }, 20, tiny).lines).toEqual([]);
    expect(layoutText({ ...narrow, maxLines: 2 }, 10, tiny).lines).toEqual(["aa", "bb"]);
    expect(layoutText({ ...narrow, height: undefined }, 10, tiny).lines).toHaveLength(8);
  });

  it("keeps one line without wrapping, and none when the box's height holds none", () => {
    const tiny: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 25, top: () => 80 };
    // The whitespace as written, each whitespace character drawn as a space.
    expect(layoutText(text({ text: "a  b\nc", wrap: false, width: 4 }), 10, tiny).lines).toEqual(["a  b c"]);
    expect(layoutText(text({ text: "a b", wrap: false, height: 5 }), 10, tiny).lines).toEqual([]);
  });

  it("ends the last kept line with an ellipsis when content remains, reserving its width", () => {
    const tiny: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 50, top: () => 80 };
    // At size 10 a character is 5 wide, so 5 + 1 per word: "abcd" is 21, "…" 6.
    const one = text({ text: "abcd efgh ijkl", width: 30, height: 12, overflow: "ellipsis" });
    expect(layoutText(one, 10, tiny).lines).toEqual(["abcd…"]);
    const single = text({ text: "abcdefghij", wrap: false, width: 30, overflow: "ellipsis", height: undefined });
    expect(layoutText(single, 10, tiny).lines).toEqual(["abcd…"]);
    // The whole line fits with nothing after it: no ellipsis.
    expect(layoutText({ ...single, text: "abcd" }, 10, tiny).lines).toEqual(["abcd"]);
    // Not even the ellipsis fits: nothing is drawn.
    expect(layoutText({ ...single, width: 4 }, 10, tiny).lines).toEqual([]);
    expect(ELLIPSIS).toBe("…");
  });

  it("records the sizes that give the same lines and the same clip", () => {
    const primitives = [
      text({ text: "Load the daily partitions of the warehouse", width: 90, height: 60 }),
      // A pitch under the size: the last line's em box passes the box's bottom from some size on.
      text({ text: "Load the daily partitions of the warehouse", width: 90, height: 60, lineHeight: 7 }),
      text({ text: "Load the daily partitions", width: 90, height: 60, verticalAlign: "middle", lineHeight: 8 }),
      // One unwrapped line, wider than the box from some size on.
      text({ text: "Load the daily partitions", width: 90, height: 60, wrap: false }),
      text({ text: "Load the daily partitions", width: 90, wrap: false, overflow: "ellipsis" }),
      text({ text: "Supercalifragilistic", width: 40, height: 100, verticalAlign: "bottom" }),
    ];
    let widest = 0;
    const clips = new Set<boolean>();
    for (const primitive of primitives) {
      for (const size of [6, 8, 9.5, 11, 13, 16, 20]) {
        const layout = layoutText(primitive, size, metrics);
        expect(layout.minSize).toBeLessThanOrEqual(size);
        expect(layout.maxSize).toBeGreaterThanOrEqual(size);
        widest = Math.max(widest, layout.maxSize - layout.minSize);
        clips.add(layout.overflows);
        for (let probe = 4; probe < 30; probe += 0.173) {
          if (!isLayoutValid(layout, probe, metrics)) continue;
          const fresh = layoutText(primitive, probe, metrics);
          expect(fresh.lines).toEqual(layout.lines);
          expect(fresh.overflows).toBe(layout.overflows);
        }
      }
    }
    // The ranges are not pinned to their sizes: a zoom between line breaks lays nothing out.
    expect(widest).toBeGreaterThan(0.5);
    expect([...clips].sort()).toEqual([false, true]);
  });

  it("keeps an empty text's range unbounded: no decision depends on its size", () => {
    for (const value of ["", "   ", "\n\t"]) {
      const layout = layoutText(text({ text: value, cameraAware: true }), 10, metrics);
      expect(layout.lines).toEqual([]);
      expect([layout.minSize, layout.maxSize]).toEqual([0, Infinity]);
      expect(layout.overflows).toBe(false);
    }
  });

  it("does not take an empty piece after a forced break for omitted content (no false ellipsis)", () => {
    // 5 units a character and 6 a space at size 10: " hello" (32) does not fit 30, so "hello" (26) takes the line
    // alone and an empty piece follows it; the 10-high box holds that one line.
    const five: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 50, top: () => 80 };
    const hello = text({ text: "hello", size: 10, lineHeight: 10, width: 30, height: 10, overflow: "ellipsis" });
    expect(layoutText(hello, 10, five).lines).toEqual(["hello"]);
    expect(layoutText({ ...hello, height: undefined, maxLines: 1 }, 10, five).lines).toEqual(["hello"]);
    // Real content past the line still ends it with "…".
    expect(layoutText({ ...hello, text: "hello world" }, 10, five).lines).toEqual(["hell…"]);
  });

  it("drops a line of one piece no wider than a space, as v1 did", () => {
    // Arial-like widths: "i" 0.222 em, a space 0.278 em. At size 40 in a 16-wide box " i" (21) does not fit, so "i"
    // (9) takes a line alone: v1 measured it as 9 minus a space (12) and dropped it.
    const widths: Record<string, number> = { i: 22.2, " ": 27.8 };
    const arial: ISceneTextMetrics = {
      generation: 0,
      width: (value) => widths[value] ?? value.length * 50,
      top: () => 80,
    };
    const narrow = text({ text: "i", size: 10, cameraAware: true, lineHeight: 10, width: 16, height: 80 });
    expect(layoutText(narrow, 40, arial).lines).toEqual([]);
    // At size 10 the line fits with its leading space and is kept.
    expect(layoutText(narrow, 10, arial).lines).toEqual(["i"]);
  });

  it("measures an unwrapped text whole, keeps its whitespace and cuts it as fitText did", () => {
    // Courier-like: 0.6 em a character. At size 10 "a b c" measures 30, rounded 31: it fits a 31-wide box whole.
    const courier: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 60, top: () => 80 };
    const line = text({ text: "a b c", wrap: false, width: 31, height: undefined, overflow: "ellipsis" });
    expect(layoutText(line, 10, courier).lines).toEqual(["a b c"]);
    expect(layoutText({ ...line, text: "a  b" }, 10, courier).lines).toEqual(["a  b"]);
    expect(layoutText({ ...line, text: "a\tb\nc", overflow: "clip", width: 1000 }, 10, courier).lines).toEqual([
      "a b c",
    ]);
    // Too wide: each candidate with its "…" measured whole, trailing spaces trimmed: "abc d…" is 37, "abc …" 31.
    expect(layoutText({ ...line, text: "abc def" }, 10, courier).lines).toEqual(["abc…"]);
  });

  it("measures a font whose widths do not scale linearly at the resolved size", () => {
    // Optical sizing: 0.6 em a character below 50 px, 0.5 em above.
    const measure = jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(function (
      this: CanvasRenderingContext2D,
      value: string
    ): TextMetrics {
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1]);
      return { width: value.length * px * (px < 50 ? 0.6 : 0.5) } as TextMetrics;
    });
    try {
      const optical = new CanvasTextMetrics();
      expect(optical.linear("aaaa bbbb", "f", "normal")).toBe(false);
      // At 13 px "aaaa" is 31.2 (32) and a space 7.8 (8): " aaaa bbbb" is 80, past the 75-wide box. Scaled from
      // 100 px it would be 68 and fit.
      const primitive = text({ text: "aaaa bbbb", size: 13, lineHeight: 13, width: 75, height: 100 });
      const layout = layoutText(primitive, 13, optical);
      expect(layout.lines).toEqual(["aaaa", "bbbb"]);
      expect(layout.widths[0]).toBeCloseTo(4 * 0.6 * 100, 6);
      // Widths at one size hold at that size only.
      expect([layout.minSize, layout.maxSize]).toEqual([13, 13]);
    } finally {
      measure.mockRestore();
    }
  });

  it("keeps the scaled widths of a font that scales linearly", () => {
    const measure = jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(function (
      this: CanvasRenderingContext2D,
      value: string
    ): TextMetrics {
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1]);
      return { width: value.length * px * 0.5 } as TextMetrics;
    });
    try {
      const plain = new CanvasTextMetrics();
      expect(plain.linear("aaaa bbbb", "f", "normal")).toBe(true);
      const layout = layoutText(text({ text: "aaaa bbbb", size: 13, width: 75, height: 100 }), 13, plain);
      expect(layout.lines).toEqual(["aaaa bbbb"]);
      expect(layout.maxSize).toBeGreaterThan(13);
    } finally {
      measure.mockRestore();
    }
  });

  it("probes linearity per font and character group: an emoji fallback is measured at the resolved size", () => {
    // Arial-like: a space 0.278 em and other characters 0.5 em at any size; emoji (a fallback font) 17/13 em under
    // 50 px and 1 em above, as Codex measured on macOS (17 units at 13 px against 13 scaled from 100 px).
    const samples: string[] = [];
    const measure = jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(function (
      this: CanvasRenderingContext2D,
      value: string
    ): TextMetrics {
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1]);
      samples.push(value);
      let width = 0;
      for (const char of value) {
        const emoji = (char.codePointAt(0) ?? 0) >= 0x1f000;
        width += emoji ? (px < 50 ? 17 / 13 : 1) * px : (char === " " ? 0.278 : 0.5) * px;
      }
      return { width } as TextMetrics;
    });
    try {
      const fonts = new CanvasTextMetrics();
      expect(fonts.linear("Load the warehouse", "Arial", "normal")).toBe(true);
      // Cyrillic, the main consumer's UI, stays on the scaled path; its group is probed once.
      expect(fonts.linear("Загрузка данных", "Arial", "normal")).toBe(true);
      const probes = samples.length;
      expect(fonts.linear("Ещё раз", "Arial", "normal")).toBe(true);
      expect(samples.length).toBe(probes);
      expect(fonts.linear("😀 😀", "Arial", "normal")).toBe(false);
      expect(fonts.linear("Load 😀", "Arial", "normal")).toBe(false);
      // v1 measured "😀" at 13 px: 17 (18 rounded), a space 4, so " 😀 😀" (44) does not fit 40. Scaled, it would
      // be 36 and fit.
      const emoji = text({ text: "😀 😀", family: "Arial", size: 13, lineHeight: 13, width: 40, height: 100 });
      const layout = layoutText(emoji, 13, fonts);
      expect(layout.lines).toEqual(["😀", "😀"]);
      expect([layout.minSize, layout.maxSize]).toEqual([13, 13]);
      const cyrillic = layoutText({ ...emoji, text: "Загрузка данных", width: 200 }, 13, fonts);
      expect(cyrillic.lines).toEqual(["Загрузка данных"]);
      expect(cyrillic.maxSize).toBeGreaterThan(13);
      // Late web fonts drop the probes with the widths: the next text probes again.
      fonts.clear();
      const before = samples.length;
      expect(fonts.linear("Загрузка", "Arial", "normal")).toBe(true);
      expect(samples.length).toBeGreaterThan(before);
    } finally {
      measure.mockRestore();
    }
  });

  it("keeps an empty text's range unbounded on a font that does not scale linearly", () => {
    const measure = jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(function (
      this: CanvasRenderingContext2D,
      value: string
    ): TextMetrics {
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1]);
      return { width: value.length * px * (px < 50 ? 0.6 : 0.5) } as TextMetrics;
    });
    try {
      const optical = new CanvasTextMetrics();
      expect(optical.linear("a", "f", "normal")).toBe(false);
      for (const value of ["", "   ", "\n\t"]) {
        const layout = layoutText(text({ text: value, cameraAware: true }), 13, optical);
        expect(layout.lines).toEqual([]);
        expect([layout.minSize, layout.maxSize]).toEqual([0, Infinity]);
      }
    } finally {
      measure.mockRestore();
    }
  });

  it("is stale once the metrics change", () => {
    const layout = layoutText(text({ text: "a b" }), 10, metrics);
    expect(isLayoutValid(layout, 10, metrics)).toBe(true);
    expect(isLayoutValid(layout, 10, { ...metrics, generation: 1 })).toBe(false);
  });

  it("measures the widths of its lines, unrounded, and whether its layout overflows the box", () => {
    const layout = layoutText(text({ text: "aaa bb", width: 1000 }), 10, metrics);
    expect(layout.lines).toEqual(["aaa bb"]);
    expect(layout.widths[0]).toBeCloseTo(widthAt("aaa bb", TEXT_METRICS_PX), 9);
    expect(layout.overflows).toBe(false);
    // A line wider than the box: one unwrapped line.
    expect(layoutText(text({ text: "aaa bb", wrap: false, width: 5 }), 10, metrics).overflows).toBe(true);
    // A line whose em box (10 high from its top) passes the box's bottom: the pitch (6) is under the font size.
    expect(layoutText(text({ text: "aaa bb", width: 1000, lineHeight: 6, height: 8 }), 10, metrics).overflows).toBe(
      true
    );
    const heightless = text({ text: "aaa bb", width: 1000, lineHeight: 6, height: undefined });
    expect(layoutText(heightless, 10, metrics).overflows).toBe(false);
    // A block centred in a box it does not fit sticks out at the top: its lines are kept while they fit, so only the
    // em box of a pitch under the size can.
    const centred = text({ text: "aaa bb", width: 1000, lineHeight: 6, height: 8, verticalAlign: "middle" });
    expect(layoutText(centred, 10, metrics).overflows).toBe(true);
  });
});

describe("placeText", () => {
  const ALIGNS: ReadonlyArray<[TText["verticalAlign"], number, number]> = [
    // The block's top, centre or bottom lies on the box's top (20), centre (44) or bottom (68).
    ["top", 20, 0],
    ["middle", 44, 0.5],
    ["bottom", 68, 1],
  ];

  for (const [verticalAlign, edge, share] of ALIGNS) {
    it(`puts the block of lines ${verticalAlign} in the box, the pitch scaled with the size`, () => {
      for (const size of [10, 20, 80]) {
        const place = placeText(text({ verticalAlign }), 2, size, metrics);
        const pitch = 12 * (size / 10);
        expect(place.pitch).toBeCloseTo(pitch, 9);
        expect(place.top + share * 2 * pitch).toBeCloseTo(edge, 9);
        expect(place.baseline).toBeCloseTo(0.8 * size, 9);
      }
    });
  }

  it("anchors lines by align, and a heightless block to the block at the authored size", () => {
    expect(textAnchor(text({ align: "center" }), 1).x).toBe(54);
    expect(textAnchor(text({ align: "right" }), 1).x).toBe(104);
    expect(textAnchor(text({ height: undefined, verticalAlign: "middle" }), 2).y).toBe(32);
    expect(placeText(text({ lineHeight: 0 }), 1, 20, metrics).pitch).toBe(0);
  });
});

describe("textBounds", () => {
  it("is the box of a text with a height, whatever its size", () => {
    expect(textBounds(text({ cameraAware: true }), 1000, metrics)).toEqual({ minX: 4, minY: 20, maxX: 104, maxY: 68 });
    expect(textClip(text({ height: undefined }))).toEqual({ minX: 4, minY: -Infinity, maxX: 104, maxY: Infinity });
  });

  it("covers the lines of a heightless text at its largest size, and half that size around them", () => {
    const tiny: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 25, top: () => 80 };
    // Three 2-letter words, one per line at size 20 (10 + 1 each in a 15-wide box): 3 lines of 24.
    const heightless = text({ text: "aa bb cc", width: 15, height: undefined });
    expect(textBounds(heightless, 20, tiny)).toEqual({ minX: 4, minY: 10, maxX: 19, maxY: 20 + 72 + 10 });
  });

  it("covers the lines a smaller size draws where v1's filter drops every line at the largest", () => {
    // Codex's case, Arial-like widths: at size 10 " i i" (12) fits the 16-wide box, so ten "i" make five lines; at
    // size 40 each "i" (9) is narrower than a space (12) and v1 drops its line, so the largest size draws none.
    const widths: Record<string, number> = { i: 22.2, " ": 27.8 };
    const arial: ISceneTextMetrics = {
      generation: 0,
      width: (value) => [...value].reduce((sum, char) => sum + (widths[char] ?? 50), 0),
      top: () => 80,
    };
    const primitive = text({
      text: "i i i i i i i i i i",
      size: 10,
      lineHeight: 10,
      width: 16,
      height: undefined,
      x: 0,
      y: 0,
      cameraAware: { maxWorld: 40 },
    });
    expect(layoutText(primitive, 40, arial).lines).toEqual([]);
    expect(layoutText(primitive, 10, arial).lines).toHaveLength(5);
    const bounds = textBounds(primitive, 40, arial);
    // The world mode's five lines reach y = 50: the bounds hold them, and every other size up to 40.
    expect(bounds.maxY).toBeGreaterThanOrEqual(50);
    for (let size = 1; size <= 40; size += 0.5) {
      const lines = layoutText(primitive, size, arial).lines.length;
      expect(lines * size).toBeLessThanOrEqual(bounds.maxY);
    }
  });

  it("bounds the lines of every smaller size by its count at the largest (random texts, kerned pairs)", () => {
    const widths: Record<string, number> = { i: 22.2, l: 22.2, a: 55.6, m: 83.3, W: 94.4, M: 83.3 };
    let state = 7;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    const chars = Object.keys(widths);
    const sizes = [1, 2, 3, 5, 7, 10, 14, 20, 30, 45, 64];
    let checked = 0;
    for (let n = 0; n < 600; n++) {
      const space = [27.8, 10, 60, 120][Math.floor(random() * 4)];
      const kerned: ISceneTextMetrics = {
        generation: 0,
        width: (value) =>
          [...value].reduce((sum, char) => sum + (char === " " ? space : widths[char] ?? 50), 0) -
          15 * (value.split("Wa").length - 1),
        top: () => 80,
      };
      const words: string[] = [];
      for (let w = Math.floor(random() * 10); w >= 0; w--) {
        let word = "";
        for (let c = Math.floor(random() * (random() < 0.2 ? 14 : 4)); c >= 0; c--) {
          word += chars[Math.floor(random() * chars.length)];
        }
        words.push(word);
      }
      const primitive = text({
        text: words.join(" "),
        width: 2 + Math.floor(random() * 120),
        height: undefined,
        lineHeight: 10,
        maxLines: random() < 0.3 ? 1 + Math.floor(random() * 4) : undefined,
        overflow: random() < 0.3 ? "ellipsis" : undefined,
      });
      for (let largest = 0; largest < sizes.length; largest++) {
        const bound = boundingLineCount(primitive, sizes[largest], kerned);
        for (let smaller = 0; smaller <= largest; smaller++) {
          expect(layoutText(primitive, sizes[smaller], kerned).lines.length).toBeLessThanOrEqual(bound);
          checked++;
        }
      }
    }
    expect(checked).toBe(600 * 66);
  });
});
