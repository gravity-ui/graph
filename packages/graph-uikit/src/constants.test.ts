import { DEFAULT_UIKIT_PALETTE, DEFAULT_UIKIT_TYPOGRAPHY, UIKIT_GRAPH_CONSTANTS, UIKIT_GRAPH_TOKENS } from "./index";
import type { TUikitPalette } from "./index";

describe("UIKIT_GRAPH_CONSTANTS", () => {
  it("matches the uikit metrics used by canvas and React blocks", () => {
    expect(UIKIT_GRAPH_CONSTANTS.block).toEqual({
      radius: 8,
      padding: 12,
      gap: 4,
      borderWidth: 1,
      selectedBorderWidth: 2,
    });
    expect(UIKIT_GRAPH_CONSTANTS.text.minScreenFontSize).toBe(4);
  });
});

describe("shared defaults", () => {
  it("cannot be changed through one consumer", () => {
    // The cast stands for a consumer that ignores the read-only type.
    const text = DEFAULT_UIKIT_PALETTE.text as TUikitPalette["text"];

    expect(() => {
      text.primary = "red";
    }).toThrow(TypeError);
    expect(DEFAULT_UIKIT_PALETTE.text.primary).toBe("rgba(0, 0, 0, 0.85)");
  });

  it("are frozen deeply", () => {
    expect(Object.isFrozen(DEFAULT_UIKIT_PALETTE.status.info)).toBe(true);
    expect(Object.isFrozen(DEFAULT_UIKIT_TYPOGRAPHY["body-1"])).toBe(true);
    expect(Object.isFrozen(UIKIT_GRAPH_TOKENS.colors.block)).toBe(true);
    expect(Object.isFrozen(UIKIT_GRAPH_TOKENS.palette.status.info)).toBe(true);
    expect(Object.isFrozen(UIKIT_GRAPH_CONSTANTS.block)).toBe(true);
  });
});
