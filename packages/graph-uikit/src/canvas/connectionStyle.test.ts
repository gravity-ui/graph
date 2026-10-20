import type { TGraphColors } from "@gravity-ui/graph";

import { DEFAULT_UIKIT_PALETTE } from "../theme/palette";

import { getUikitConnectionLineWidth, getUikitConnectionStroke } from "./connectionStyle";

const colors = { connection: { background: "line", selectedBackground: "brand" } } as TGraphColors;

describe("connection style", () => {
  it("picks normal, hover and selected colors", () => {
    expect(getUikitConnectionStroke({}, colors, DEFAULT_UIKIT_PALETTE)).toBe("line");
    expect(getUikitConnectionStroke({ hovered: true }, colors, DEFAULT_UIKIT_PALETTE)).toBe(
      DEFAULT_UIKIT_PALETTE.connectionHover
    );
    expect(getUikitConnectionStroke({ hovered: true, selected: true }, colors, DEFAULT_UIKIT_PALETTE)).toBe("brand");
  });

  it("keeps per-connection styles on top", () => {
    expect(
      getUikitConnectionStroke({ hovered: true, styles: { background: "custom" } }, colors, DEFAULT_UIKIT_PALETTE)
    ).toBe("custom");
    expect(
      getUikitConnectionStroke({ selected: true, styles: { selectedBackground: "own" } }, colors, DEFAULT_UIKIT_PALETTE)
    ).toBe("own");
  });

  it("uses screen-pixel widths", () => {
    expect(getUikitConnectionLineWidth({}, 1)).toBe(1);
    expect(getUikitConnectionLineWidth({ hovered: true }, 2)).toBe(1);
    expect(getUikitConnectionLineWidth({ selected: true }, 0.5)).toBe(4);
  });
});
