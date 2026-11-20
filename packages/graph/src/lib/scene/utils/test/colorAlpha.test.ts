import { fadeColor, mixColor, parseColorAlpha, parseColorRgba, readColorRgba } from "../colorAlpha";

describe("parseColorAlpha", () => {
  it("reads alpha from hex and functional colours", () => {
    expect(parseColorAlpha("#ff0000")).toBe(1);
    expect(parseColorAlpha("#f00")).toBe(1);
    expect(parseColorAlpha("#ff000080")).toBeCloseTo(128 / 255);
    expect(parseColorAlpha("#f008")).toBeCloseTo(136 / 255);
    expect(parseColorAlpha("rgb(1, 2, 3)")).toBe(1);
    expect(parseColorAlpha("rgba(0, 255, 0, 0.5)")).toBe(0.5);
    expect(parseColorAlpha("rgb(0 255 0 / 25%)")).toBe(0.25);
  });

  it("reads other CSS syntaxes through the DOM: hsla() and transparent carry alpha, named colours are opaque", () => {
    expect(parseColorAlpha("hsla(0, 100%, 50%, 0.5)")).toBe(0.5);
    expect(parseColorAlpha("transparent")).toBe(0);
    expect(parseColorAlpha("red")).toBe(1);
    expect(parseColorAlpha("nonsense")).toBe(1);
  });
});

describe("parseColorRgba", () => {
  it("parses hex and functional colours into r, g, b in 0..255 and a in 0..1", () => {
    expect(parseColorRgba("#ff8000")).toEqual([255, 128, 0, 1]);
    expect(parseColorRgba("#f80")).toEqual([255, 136, 0, 1]);
    expect(parseColorRgba("#ff800080")).toEqual([255, 128, 0, 128 / 255]);
    expect(parseColorRgba("rgb(1, 2, 3)")).toEqual([1, 2, 3, 1]);
    expect(parseColorRgba("rgba(1, 2, 3, 0.5)")).toEqual([1, 2, 3, 0.5]);
    expect(parseColorRgba(" rgb(1 2 3 / 25%) ")).toEqual([1, 2, 3, 0.25]);
    expect(parseColorRgba("rgb(100%, 0%, 50%)")).toEqual([255, 0, 127.5, 1]);
  });

  it("returns undefined for colours it does not parse: it never asks the DOM", () => {
    expect(parseColorRgba("red")).toBeUndefined();
    expect(parseColorRgba("hsl(0, 100%, 50%)")).toBeUndefined();
    expect(parseColorRgba("rgb(a, b, c)")).toBeUndefined();
    expect(parseColorRgba("rgb(1, 2)")).toBeUndefined();
    expect(parseColorRgba("#12345")).toBeUndefined();
  });
});

describe("readColorRgba", () => {
  it("reads what parseColorRgba reads, and other CSS syntaxes through the DOM as WebGL does", () => {
    expect(readColorRgba("#ff8000")).toEqual([255, 128, 0, 1]);
    expect(readColorRgba("rgb(100%, 0%, 50%)")).toEqual([255, 0, 127.5, 1]);
    expect(readColorRgba("red")).toEqual([255, 0, 0, 1]);
    expect(readColorRgba("hsl(120, 100%, 25%)")).toEqual([0, 128, 0, 1]);
    expect(readColorRgba("hsla(0, 100%, 50%, 0.5)")).toEqual([255, 0, 0, 0.5]);
  });

  it("returns undefined for an empty colour, which paints nothing", () => {
    expect(readColorRgba("")).toBeUndefined();
    expect(readColorRgba("  ")).toBeUndefined();
  });
});

describe("mixColor", () => {
  it("moves the rgb towards the other colour and keeps the alpha", () => {
    expect(mixColor("#000000", "#ffffff", 0.5)).toBe("rgba(128, 128, 128, 1)");
    expect(mixColor("rgba(0, 0, 255, 0.5)", "#ffffff", 0.25)).toBe("rgba(64, 64, 255, 0.5)");
    expect(mixColor("#000000", "rgba(255, 255, 255, 0)", 1)).toBe("rgba(255, 255, 255, 1)");
  });

  it("clamps the amount and returns the colour as is for 0 and for an empty colour", () => {
    expect(mixColor("#000000", "#ffffff", 2)).toBe("rgba(255, 255, 255, 1)");
    expect(mixColor("#000000", "#ffffff", -1)).toBe("#000000");
    expect(mixColor("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixColor("", "#ffffff", 0.5)).toBe("");
  });

  it("mixes named and hsl() colours on either side", () => {
    expect(mixColor("red", "#ffffff", 0.5)).toBe("rgba(255, 128, 128, 1)");
    expect(mixColor("hsl(120, 100%, 25%)", "#ffffff", 0.5)).toBe("rgba(128, 192, 128, 1)");
    expect(mixColor("#000000", "white", 0.5)).toBe("rgba(128, 128, 128, 1)");
  });
});

describe("fadeColor", () => {
  it("multiplies the colour's alpha by the opacity", () => {
    expect(fadeColor("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(fadeColor("rgba(0, 0, 255, 0.5)", 0.5)).toBe("rgba(0, 0, 255, 0.25)");
    expect(fadeColor("red", 0.4)).toBe("rgba(255, 0, 0, 0.4)");
    expect(fadeColor("hsl(120, 100%, 25%)", 0.5)).toBe("rgba(0, 128, 0, 0.5)");
  });

  it("clamps the opacity, returns the colour as is for 1 and NaN, and keeps an empty colour", () => {
    expect(fadeColor("#ff0000", 1)).toBe("#ff0000");
    expect(fadeColor("#ff0000", 2)).toBe("#ff0000");
    expect(fadeColor("#ff0000", Number.NaN)).toBe("#ff0000");
    expect(fadeColor("#ff0000", -1)).toBe("rgba(255, 0, 0, 0)");
    expect(fadeColor("", 0.5)).toBe("");
  });
});
