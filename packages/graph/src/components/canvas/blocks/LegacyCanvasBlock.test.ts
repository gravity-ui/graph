import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";

import { LegacyCanvasBlock } from "./LegacyCanvasBlock";

class Painted extends LegacyCanvasBlock {
  public paints = 0;

  protected override render(): void {
    this.paints++;
    super.render();
  }
}

describe("LegacyCanvasBlock", () => {
  it("is an immediate block whose render() runs in the frame walk", () => {
    const graph = new Graph({ settings: { blockComponents: { Block: Painted } } }, document.createElement("div"));
    graph.setEntities({
      blocks: [{ id: "a", is: "Block", name: "a", x: 0, y: 0, width: 100, height: 50, anchors: [] }],
      connections: [],
    });
    graph.start();
    graph.cameraService.resize({ width: 1000, height: 800 });
    for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
    const view = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    expect(view).toBeInstanceOf(Painted);
    expect((view as Painted).paints).toBeGreaterThan(0);
    expect(LegacyCanvasBlock.mode).toBe("immediate");
    graph.unmount();
  });
});
