import { ellipsize, layoutUikitText } from "./layoutUikitText";

// 10 px per character.
const measure = (text: string): number => Array.from(text).length * 10;

describe("layoutUikitText", () => {
  it("keeps text that fits on one line", () => {
    expect(layoutUikitText("alpha", { maxWidth: 100 }, measure)).toEqual({ lines: ["alpha"], width: 50 });
  });

  it("wraps on words", () => {
    expect(layoutUikitText("alpha beta gamma", { maxWidth: 100 }, measure).lines).toEqual(["alpha beta", "gamma"]);
  });

  it("collapses whitespace by default and keeps line breaks with break-spaces", () => {
    expect(layoutUikitText("a \n  b", { maxWidth: 100 }, measure).lines).toEqual(["a b"]);
    expect(layoutUikitText("a\nb", { maxWidth: 100, whiteSpace: "break-spaces" }, measure).lines).toEqual(["a", "b"]);
  });

  it("truncates a single line with ellipsis", () => {
    expect(layoutUikitText("alpha beta gamma", { maxWidth: 80, ellipsis: true }, measure).lines).toEqual(["alpha b…"]);
  });

  it("clamps lines with ellipsisLines", () => {
    expect(layoutUikitText("alpha beta gamma", { maxWidth: 100, ellipsisLines: 1 }, measure).lines).toEqual([
      "alpha bet…",
    ]);
  });

  it("drops lines beyond maxLines without ellipsis", () => {
    expect(layoutUikitText("alpha beta gamma", { maxWidth: 100, maxLines: 1 }, measure).lines).toEqual(["alpha beta"]);
  });

  it("does not wrap with nowrap", () => {
    expect(layoutUikitText("alpha beta gamma", { maxWidth: 50, whiteSpace: "nowrap" }, measure).lines).toEqual([
      "alpha beta gamma",
    ]);
  });

  it("breaks long words only with wordBreak", () => {
    expect(layoutUikitText("abcdefghijkl", { maxWidth: 50 }, measure).lines).toEqual(["abcdefghijkl"]);
    expect(layoutUikitText("abcdefghijkl", { maxWidth: 50, wordBreak: "break-all" }, measure).lines).toEqual([
      "abcde",
      "fghij",
      "kl",
    ]);
  });

  it("reports the widest line", () => {
    expect(layoutUikitText("alpha beta gamma", { maxWidth: 100 }, measure).width).toBe(100);
  });
});

describe("ellipsize", () => {
  it("returns an empty string when not even the ellipsis fits", () => {
    expect(ellipsize("alpha", 5, measure)).toBe("");
  });
});
