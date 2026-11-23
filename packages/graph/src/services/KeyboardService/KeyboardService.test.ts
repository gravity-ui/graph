import { Graph } from "../../graph";

describe("KeyboardService", () => {
  it("delivers key presses and releases until unsubscribe or graph unmount", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const graph = new Graph({}, root);
    graph.start();
    const pressed = jest.fn();
    graph.keyboardService.onPress("Shift", pressed);
    const press = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
    press();
    expect(pressed).toHaveBeenCalledTimes(1);

    const released = jest.fn();
    const unsubscribe = graph.keyboardService.onRelease("Shift", released);
    const release = () => document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    release();
    expect(released).toHaveBeenCalledTimes(1);
    expect(graph.keyboardService.isShiftPressed()).toBe(false);
    unsubscribe();
    release();
    expect(released).toHaveBeenCalledTimes(1);

    press();
    expect(graph.keyboardService.isShiftPressed()).toBe(true);
    graph.unmount();
    press();

    expect(pressed).toHaveBeenCalledTimes(2);
    expect(graph.keyboardService.isShiftPressed()).toBe(false);
    root.remove();
  });
});
