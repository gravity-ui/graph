import { Graph } from "../../graph";

describe("KeyboardService", () => {
  it("stops observing the document after the graph releases its root", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const graph = new Graph({}, root);
    graph.start();
    const pressed = jest.fn();
    graph.keyboardService.onPress("Shift", pressed);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
    expect(pressed).toHaveBeenCalledTimes(1);

    graph.unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));

    expect(pressed).toHaveBeenCalledTimes(1);
    expect(graph.keyboardService.isShiftPressed()).toBe(false);
    root.remove();
  });
});
