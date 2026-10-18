import type { TGraphColors, TGraphConstants } from "@gravity-ui/graph";

import {
  filterSupportedCSSChanges,
  mapCSSChangesToGraphColors,
  mapCSSChangesToGraphConstants,
  mapGraphColorsToCSSVariables,
  mapGraphConstantsToCSSVariables,
} from "./mapping";

describe("CSS variable mapping", () => {
  const changes = [
    { name: "--graph-block-background", value: " rgb(1, 2, 3) " },
    { name: "--graph-connection-label-hover-text", value: "#fff" },
    { name: "--graph-block-width", value: "240px" },
    { name: "--graph-grid-size", value: "16.7" },
    { name: "--graph-camera-speed", value: "fast" },
    { name: "--unrelated", value: "red" },
  ];

  it("maps color variables to a nested colors patch", () => {
    expect(mapCSSChangesToGraphColors(changes)).toEqual({
      block: { background: "rgb(1, 2, 3)" },
      connectionLabel: { hoverText: "#fff" },
    });
  });

  it("maps numeric variables to a constants patch with float and int conversion", () => {
    expect(mapCSSChangesToGraphConstants(changes)).toEqual({
      block: { WIDTH: 240 },
      system: { GRID_SIZE: 16 },
      camera: { SPEED: 0 },
    });
  });

  it("keeps only supported variables", () => {
    expect(filterSupportedCSSChanges(changes).map((change) => change.name)).not.toContain("--unrelated");
    expect(filterSupportedCSSChanges(changes)).toHaveLength(changes.length - 1);
  });

  it("exports graph state as CSS variables", () => {
    const colors = { block: { background: "#111" }, canvas: { dots: "#222" } } as unknown as TGraphColors;
    const constants = { block: { WIDTH: 200 }, system: { GRID_SIZE: 20 } } as unknown as TGraphConstants;

    expect(mapGraphColorsToCSSVariables(colors)).toEqual({
      "--graph-block-background": "#111",
      "--graph-canvas-dots": "#222",
    });
    expect(mapGraphConstantsToCSSVariables(constants)).toEqual({
      "--graph-block-width": "200",
      "--graph-grid-size": "20",
    });
  });
});
