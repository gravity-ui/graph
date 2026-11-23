import type { Graph } from "../../graph";
import { initGraphConstants } from "../../graphConfig";

import { ECameraScaleLevel } from "./cameraScaleEnums";
import { defaultGetCameraBlockScaleLevel } from "./defaultGetCameraBlockScaleLevel";

function createGraphWithBlockScales(scales: readonly [number, number, number]): Graph {
  return {
    graphConstants: {
      block: { SCALES: scales },
    },
  } as unknown as Graph;
}

describe("defaultGetCameraBlockScaleLevel", () => {
  it.each([
    ["library defaults", initGraphConstants.block.SCALES, 0.225, 0.7],
    ["custom thresholds", [0.01, 0.2, 0.6], 0.2, 0.6],
  ] as const)("switches levels at the configured boundaries for %s", (_name, scales, schematic, detailed) => {
    const graph = createGraphWithBlockScales(scales);
    const samples = [0.05, schematic - 1e-6, schematic, (schematic + detailed) / 2, detailed - 1e-6, detailed, 1];
    const { Minimalistic, Schematic, Detailed } = ECameraScaleLevel;
    expect(samples.map((scale) => defaultGetCameraBlockScaleLevel(graph, scale))).toEqual([
      Minimalistic,
      Minimalistic,
      Schematic,
      Schematic,
      Schematic,
      Detailed,
      Detailed,
    ]);
  });

  it("ignores SCALES[0] when choosing a block level", () => {
    for (const lowest of [0.001, 0.99]) {
      expect(defaultGetCameraBlockScaleLevel(createGraphWithBlockScales([lowest, 0.2, 0.6]), 0.1)).toBe(
        ECameraScaleLevel.Minimalistic
      );
    }
  });
});
