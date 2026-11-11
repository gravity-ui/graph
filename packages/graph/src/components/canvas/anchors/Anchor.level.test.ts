import { Graph } from "../../../graph";
import { ECameraScaleLevel } from "../../../services/camera/cameraScaleEnums";

import { Anchor } from "./index";

describe("Anchor hover factor follows graph.scene.$level", () => {
  const factorFor = (graph: Graph): number => {
    const stub = { context: { graph } } as unknown as Anchor;
    return Anchor.prototype.getHoverFactor.call(stub);
  };

  it("uses the detailed factor when the strategy returns Detailed below SCALES[2]", () => {
    const graph = new Graph({});
    graph.cameraService.set({ scale: 0.05 });
    expect(factorFor(graph)).toBe(Anchor.CANVAS_HOVER_FACTOR);

    graph.updateSettings({ getCameraBlockScaleLevel: () => ECameraScaleLevel.Detailed });
    expect(factorFor(graph)).toBe(Anchor.DETAILED_HOVER_FACTOR);
  });
});
