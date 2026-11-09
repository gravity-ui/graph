import { Graph } from "../../../../graph";
import { GraphMouseEvent } from "../../../../graphEvents";
import { globalScheduler } from "../../../../lib/Scheduler";
import { TBlock } from "../../blocks/Block";

const blocks: TBlock[] = [
  { is: "Block", id: "a", name: "A", x: 0, y: 0, width: 100, height: 50, selected: false, anchors: [] },
];

function mouse(type: string, x: number, y: number, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...init });
}

function select(graph: Graph, from: [number, number], to: [number, number]): void {
  const camera = graph.getGraphLayer().$.camera;
  const sourceEvent = mouse("mousedown", from[0], from[1], { ctrlKey: true });
  document.dispatchEvent(sourceEvent);
  graph.emit("mousedown", { target: camera, sourceEvent } as GraphMouseEvent["detail"]);
  document.dispatchEvent(mouse("mousemove", from[0] + 10, from[1] + 10, { ctrlKey: true }));
  document.dispatchEvent(mouse("mousemove", to[0], to[1], { ctrlKey: true }));
}

describe("SelectionLayer cancellation", () => {
  let graph: Graph;

  beforeEach(() => {
    const root = document.createElement("div");
    graph = new Graph({ blocks, settings: { dragThreshold: 0 } }, root);
    graph.start();
    globalScheduler.performUpdate();
  });

  afterEach(() => {
    graph.stop();
    graph.unmount();
  });

  it("selects the blocks in the area on mouseup", () => {
    const [x0, y0] = graph.cameraService.getAbsoluteXY(-50, -50);
    const [x1, y1] = graph.cameraService.getAbsoluteXY(150, 100);
    select(graph, [x0, y0], [x1, y1]);
    document.dispatchEvent(mouse("mouseup", x1, y1, { ctrlKey: true }));

    expect(graph.rootStore.blocksList.$selectedBlocks.value.map((b) => b.id)).toEqual(["a"]);
  });

  it("removes the selection area without selecting when the drag is cancelled", () => {
    const [x0, y0] = graph.cameraService.getAbsoluteXY(-50, -50);
    const [x1, y1] = graph.cameraService.getAbsoluteXY(150, 100);
    select(graph, [x0, y0], [x1, y1]);
    window.dispatchEvent(new Event("blur"));

    expect(graph.rootStore.blocksList.$selectedBlocks.value).toHaveLength(0);
    expect(graph["selectionLayer"]["selectionStartWorld"]).toBeNull();
  });

  it("starts the selection area at the press", () => {
    const [x0, y0] = graph.cameraService.getAbsoluteXY(-50, -50);
    const [x1, y1] = graph.cameraService.getAbsoluteXY(150, 100);
    select(graph, [x0, y0], [x1, y1]);

    const [x, y] = graph.cameraService.applyToPoint(x0, y0);
    expect(graph["selectionLayer"]["selectionStartWorld"]).toEqual({ x, y });
    document.dispatchEvent(mouse("mouseup", x1, y1, { ctrlKey: true }));
  });
});
