import { UIKIT_GRAPH_CONSTANTS } from "./index";

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
