import { Graph } from "../../graph";
import { ECameraScaleLevel } from "../camera/cameraScaleEnums";

import { createSceneLevel } from "./sceneLevel";

describe("createSceneLevel", () => {
  it("follows the camera scale through the default strategy", () => {
    const graph = new Graph({});
    const $level = createSceneLevel(graph);
    graph.cameraService.set({ scale: 0.05 });
    expect($level.value).toBe("minimalistic");
    graph.cameraService.set({ scale: 0.3 });
    expect($level.value).toBe("schematic");
    graph.cameraService.set({ scale: 0.9 });
    expect($level.value).toBe("detailed");
    graph.unmount();
  });

  it("re-evaluates on a strategy change and on setConstants", () => {
    const graph = new Graph({});
    const $level = createSceneLevel(graph);
    graph.cameraService.set({ scale: 0.5 });
    expect($level.value).toBe("schematic");
    graph.updateSettings({ getCameraBlockScaleLevel: () => ECameraScaleLevel.Detailed });
    expect($level.value).toBe("detailed");
    graph.resetSettings(["getCameraBlockScaleLevel"]);
    graph.setConstants({ block: { SCALES: [0.1, 0.2, 0.4] } });
    expect($level.value).toBe("detailed");
    graph.unmount();
  });
});
