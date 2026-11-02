import { Graph } from "../../../../graph";
import { GraphMouseEvent } from "../../../../graphEvents";
import { globalScheduler } from "../../../../lib/Scheduler";
import { TBlock } from "../../blocks/Block";

import { ConnectionLayer } from "./ConnectionLayer";

const blocks: TBlock[] = [
  { is: "Block", id: "a", name: "A", x: 0, y: 0, width: 100, height: 50, selected: false, anchors: [] },
  { is: "Block", id: "b", name: "B", x: 300, y: 0, width: 100, height: 50, selected: false, anchors: [] },
];

function mouse(type: string, x: number, y: number, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...init });
}

describe("ConnectionLayer cancellation", () => {
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

  it("drops the new connection without creating it when the drag is cancelled", () => {
    const layer = graph.addLayer(ConnectionLayer, {});
    layer.enable();
    const source = graph.blocks.getBlockState("a")?.getViewComponent();
    if (!source) throw new Error("Expected block view");
    const onCancel = jest.fn();
    const onDrop = jest.fn();
    const onCreated = jest.fn();
    graph.on("connection-create-cancel", onCancel, { signal: events.signal });
    graph.on("connection-create-drop", onDrop, { signal: events.signal });
    graph.on("connection-created", onCreated, { signal: events.signal });

    const sourceEvent = mouse("mousedown", 10, 10, { shiftKey: true });
    document.dispatchEvent(sourceEvent);
    layer["handleMouseDown"](
      new CustomEvent("mousedown", { detail: { target: source, sourceEvent } }) as GraphMouseEvent
    );
    document.dispatchEvent(mouse("mousemove", 100, 10));
    document.dispatchEvent(mouse("mousemove", 160, 10));
    window.dispatchEvent(new Event("blur"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel.mock.calls[0][0].detail).toMatchObject({ sourceBlockId: "a" });
    expect(onDrop).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(graph.rootStore.connectionsList.$connections.value).toHaveLength(0);
  });
});
