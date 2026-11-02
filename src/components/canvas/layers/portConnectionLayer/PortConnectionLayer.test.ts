import { Graph } from "../../../../graph";
import { GraphMouseEvent } from "../../../../graphEvents";
import { GraphComponent } from "../../GraphComponent";

import { PortConnectionLayer } from "./PortConnectionLayer";

class PortOwner extends GraphComponent {
  public getEntityId(): string {
    return "port-owner";
  }
}

function mouse(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

function setup() {
  const graph = new Graph({ settings: { dragThreshold: 0 } }, document.createElement("div"));
  graph.start();
  const layer = graph.addLayer(PortConnectionLayer, {});
  layer.enable();
  const owner = new PortOwner({}, graph.getGraphLayer());
  const [x, y] = graph.cameraService.applyToPoint(0, 0);
  owner.updatePort("port", { x, y, meta: { [PortConnectionLayer.PortMetaKey]: { snappable: true } } });

  const onCancel = jest.fn();
  const onDrop = jest.fn();
  graph.on("port-connection-cancel", onCancel);
  graph.on("port-connection-create-drop", onDrop);

  const startConnection = (): void => {
    const sourceEvent = mouse("mousedown", 0, 0);
    document.dispatchEvent(sourceEvent);
    layer["handleMouseDown"](
      new CustomEvent("mousedown", { detail: { target: owner, sourceEvent } }) as GraphMouseEvent
    );
    document.dispatchEvent(mouse("mousemove", 100, 100));
    document.dispatchEvent(mouse("mousemove", 200, 200));
  };

  return { graph, onCancel, onDrop, startConnection };
}

describe("PortConnectionLayer cancellation", () => {
  it("cancels a new connection on Escape without dropping it", () => {
    const { graph, onCancel, onDrop, startConnection } = setup();

    startConnection();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
    document.dispatchEvent(mouse("mouseup", 200, 200));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
    graph.detach();
  });

  it("cancels a new connection when the window loses focus", () => {
    const { graph, onCancel, onDrop, startConnection } = setup();

    startConnection();
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(mouse("mouseup", 200, 200));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
    graph.detach();
  });
});
