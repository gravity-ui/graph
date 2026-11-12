import { fadeColor, mixColor, parseColorAlpha, readColorRgba } from "./colorAlpha";

// Without a document `parseColor` returns null: the helpers then read only what `parseColorRgba` reads.
jest.mock("../../utils/functions/color", () => ({ parseColor: (): null => null }));

describe("colour helpers without a DOM", () => {
  it("read only hex, rgb() and rgba() colours", () => {
    expect(readColorRgba("#ff0000")).toEqual([255, 0, 0, 1]);
    expect(readColorRgba("red")).toBeUndefined();
    expect(parseColorAlpha("hsla(0, 100%, 50%, 0.5)")).toBe(1);
  });

  it("leave a colour they cannot read as is", () => {
    expect(mixColor("red", "#ffffff", 0.5)).toBe("red");
    expect(mixColor("#000000", "white", 0.5)).toBe("#000000");
    expect(fadeColor("red", 0.5)).toBe("red");
    expect(fadeColor("#000000", 0.5)).toBe("rgba(0, 0, 0, 0.5)");
  });
});
