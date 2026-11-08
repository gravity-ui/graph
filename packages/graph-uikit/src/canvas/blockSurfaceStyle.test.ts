import type { TGraphColors } from "@gravity-ui/graph";

import { DEFAULT_UIKIT_PALETTE } from "../theme/palette";

import { getUikitBlockSurfaceStyle } from "./blockSurfaceStyle";

const colors = {
  block: { background: "float", border: "line", selectedBorder: "brand", text: "text" },
} as TGraphColors;

const base = {
  theme: "normal" as const,
  selected: false,
  hovered: false,
  scale: 1,
  colors,
  palette: DEFAULT_UIKIT_PALETTE,
};

describe("getUikitBlockSurfaceStyle", () => {
  it("draws a normal block with float background and generic border", () => {
    expect(getUikitBlockSurfaceStyle(base)).toEqual({ fills: ["float"], stroke: "line", lineWidth: 1, radius: 8 });
  });

  it("layers the status color over the float background", () => {
    const style = getUikitBlockSurfaceStyle({ ...base, theme: "info" });
    expect(style.fills).toEqual(["float", DEFAULT_UIKIT_PALETTE.status.info.background]);
    expect(style.stroke).toBe(DEFAULT_UIKIT_PALETTE.status.info.border);
  });

  it("uses the hover border, and selection wins over hover", () => {
    expect(getUikitBlockSurfaceStyle({ ...base, hovered: true }).stroke).toBe(DEFAULT_UIKIT_PALETTE.blockHoverBorder);
    expect(getUikitBlockSurfaceStyle({ ...base, hovered: true, selected: true })).toMatchObject({
      stroke: "brand",
      lineWidth: 2,
    });
  });

  it("keeps borders at least one screen pixel and drops the radius when it is invisible", () => {
    expect(getUikitBlockSurfaceStyle({ ...base, scale: 0.25 }).lineWidth).toBe(4);
    expect(getUikitBlockSurfaceStyle({ ...base, scale: 0.1 }).radius).toBe(0);
  });
});
