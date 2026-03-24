import type { Graph } from "../../graph";
import { initGraphConstants } from "../../graphConfig";

import { ECameraScaleLevel } from "./cameraScaleEnums";
import { defaultGetCameraBlockScaleLevel } from "./defaultGetCameraBlockScaleLevel";

function createGraphWithBlockScales(scales: [number, number, number]): Graph {
  return {
    graphConstants: {
      block: { SCALES: scales },
    },
  } as unknown as Graph;
}

describe("defaultGetCameraBlockScaleLevel", () => {
  describe("uses block.SCALES[1] and block.SCALES[2] as thresholds", () => {
    const SCALES: [number, number, number] = [0.01, 0.2, 0.6];
    const graph = createGraphWithBlockScales(SCALES);
    const [, s1, s2] = SCALES;

    it("returns Minimalistic when scale < SCALES[1]", () => {
      expect(defaultGetCameraBlockScaleLevel(graph, s1 - 1e-6)).toBe(ECameraScaleLevel.Minimalistic);
      expect(defaultGetCameraBlockScaleLevel(graph, 0.05)).toBe(ECameraScaleLevel.Minimalistic);
    });

    it("returns Schematic when scale >= SCALES[1] and scale < SCALES[2]", () => {
      expect(defaultGetCameraBlockScaleLevel(graph, s1)).toBe(ECameraScaleLevel.Schematic);
      expect(defaultGetCameraBlockScaleLevel(graph, (s1 + s2) / 2)).toBe(
        ECameraScaleLevel.Schematic
      );
      expect(defaultGetCameraBlockScaleLevel(graph, s2 - 1e-6)).toBe(ECameraScaleLevel.Schematic);
    });

    it("returns Detailed when scale >= SCALES[2]", () => {
      expect(defaultGetCameraBlockScaleLevel(graph, s2)).toBe(ECameraScaleLevel.Detailed);
      expect(defaultGetCameraBlockScaleLevel(graph, 1)).toBe(ECameraScaleLevel.Detailed);
    });

    it("does not use SCALES[0] for tier resolution (only [1] and [2])", () => {
      const graphLowS0 = createGraphWithBlockScales([0.99, s1, s2]);
      const graphHighS0 = createGraphWithBlockScales([0.001, s1, s2]);
      const scale = 0.1;
      expect(defaultGetCameraBlockScaleLevel(graphLowS0, scale)).toBe(
        defaultGetCameraBlockScaleLevel(graphHighS0, scale)
      );
    });
  });

  describe("matches initGraphConstants.block.SCALES", () => {
    it("uses library default SCALES [0.125, 0.225, 0.7] semantics", async () => {
      const graph = createGraphWithBlockScales(initGraphConstants.block.SCALES);

      expect(defaultGetCameraBlockScaleLevel(graph, 0.1)).toBe(ECameraScaleLevel.Minimalistic);
      expect(defaultGetCameraBlockScaleLevel(graph, 0.225)).toBe(ECameraScaleLevel.Schematic);
      expect(defaultGetCameraBlockScaleLevel(graph, 0.5)).toBe(ECameraScaleLevel.Schematic);
      expect(defaultGetCameraBlockScaleLevel(graph, 0.7)).toBe(ECameraScaleLevel.Detailed);
    });
  });
});
