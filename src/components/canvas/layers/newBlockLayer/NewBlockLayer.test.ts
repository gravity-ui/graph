import { Graph } from "../../../../graph";
import { GraphMouseEvent } from "../../../../graphEvents";
import { globalScheduler } from "../../../../lib/Scheduler";
import { TBlock } from "../../blocks/Block";

import { NewBlockLayer } from "./NewBlockLayer";

const blocks: TBlock[] = [
  { is: "Block", id: "a", name: "A", x: 0, y: 0, width: 100, height: 50, selected: false, anchors: [] },
];

function mouse(type: string, x: number, y: number, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...init });
}

describe("NewBlockLayer cancellation", () => {
  let graph: Graph;
  let events: AbortController;

  beforeEach(() => {
    graph = new Graph({ blocks, settings: { dragThreshold: 0 } }, document.createElement("div"));
    graph.start();
    globalScheduler.performUpdate();
    events = new AbortController();
  });

  afterEach(() => {
    events.abort();
    graph.stop();
    graph.unmount();
  });

  it("drops the block copies without adding them when the drag is cancelled", () => {
    const layer = graph.addLayer(NewBlockLayer, {});
    const block = graph.blocks.getBlockState("a")?.getViewComponent();
    if (!block) throw new Error("Expected block view");
    const onCancel = jest.fn();
    const onAdded = jest.fn();
    graph.on("block-add-cancel-from-shadow", onCancel, { signal: events.signal });
    graph.on("block-added-from-shadow", onAdded, { signal: events.signal });

    const sourceEvent = mouse("mousedown", 10, 10, { altKey: true });
    document.dispatchEvent(sourceEvent);
    layer["handleMouseDown"](
      new CustomEvent("mousedown", { detail: { target: block, sourceEvent } }) as GraphMouseEvent
    );
    document.dispatchEvent(mouse("mousemove", 100, 100));
    document.dispatchEvent(mouse("mousemove", 200, 200));
    window.dispatchEvent(new Event("blur"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel.mock.calls[0][0].detail.blocks).toEqual([block]);
    expect(onAdded).not.toHaveBeenCalled();
    expect(graph.rootStore.blocksList.$blocks.value).toHaveLength(1);
  });
});
