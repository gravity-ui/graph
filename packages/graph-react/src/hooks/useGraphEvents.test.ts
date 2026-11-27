import { Graph } from "@gravity-ui/graph";
import { renderHook } from "@testing-library/react";

import { useGraphEvent, useGraphEvents } from "./useGraphEvents";

test("single and named listeners receive the core event synchronously and follow graph replacement", () => {
  const first = new Graph({});
  const second = new Graph({});
  const initial = jest.fn();
  const replacement = jest.fn();
  const single = jest.fn();
  const { rerender, unmount } = renderHook(
    ({ graph, callback }) => {
      useGraphEvents(graph, { onStateChange: callback });
      useGraphEvent(graph, "state-change", single);
    },
    { initialProps: { graph: first, callback: initial } }
  );
  const firstEvent = first.emit("state-change", { state: first.state });
  expect(initial.mock.calls[0]).toHaveLength(1);
  expect(initial.mock.calls[0][0]).toBe(firstEvent);
  expect(single.mock.calls[0]).toHaveLength(1);
  expect(single.mock.calls[0][0]).toBe(firstEvent);
  rerender({ graph: first, callback: replacement });
  first.emit("state-change", { state: first.state });
  rerender({ graph: second, callback: replacement });
  first.emit("state-change", { state: first.state });
  second.emit("state-change", { state: second.state });
  unmount();
  second.emit("state-change", { state: second.state });
  expect(initial).toHaveBeenCalledTimes(1);
  expect(replacement).toHaveBeenCalledTimes(2);
  expect(single).toHaveBeenCalledTimes(3);
  first.unmount();
  second.unmount();
});

test("adding another named callback keeps the existing listener in dispatch order", () => {
  const graph = new Graph({});
  const order: string[] = [];
  const { rerender, unmount } = renderHook(
    ({ observeCamera }) =>
      useGraphEvents(graph, {
        onStateChange: () => order.push("React"),
        onCameraChange: observeCamera ? () => order.push("camera") : undefined,
      }),
    { initialProps: { observeCamera: false } }
  );
  const off = graph.on("state-change", () => order.push("core"));
  rerender({ observeCamera: true });
  graph.emit("state-change", { state: graph.state });
  expect(order).toEqual(["React", "core"]);
  off();
  unmount();
  graph.unmount();
});

test("fresh options and callbacks do not rearm a once listener", () => {
  const graph = new Graph({});
  const initial = jest.fn();
  const replacement = jest.fn();
  const { rerender, unmount } = renderHook(
    ({ callback }) =>
      useGraphEvent(graph, "state-change", callback, {
        once: true,
        inScale: ["detailed", "schematic", "minimalistic"],
      }),
    { initialProps: { callback: initial } }
  );
  rerender({ callback: replacement });
  graph.emit("state-change", { state: graph.state });
  rerender({ callback: initial });
  graph.emit("state-change", { state: graph.state });
  expect(initial).not.toHaveBeenCalled();
  expect(replacement).toHaveBeenCalledTimes(1);
  unmount();
  graph.unmount();
});

test("press listeners preserve capture, default prevention and abort during synchronous dispatch", () => {
  const root = document.body.appendChild(document.createElement("div"));
  const graph = new Graph({}, root);
  graph.start();
  const received: string[] = [];
  const controller = new AbortController();
  const { unmount } = renderHook(() => {
    useGraphEvent(
      graph,
      "press",
      (event) => {
        received.push(`capture:${event.event.pointerId}`);
        event.preventDefault();
      },
      { capture: true, signal: controller.signal }
    );
    useGraphEvents(graph, { onPress: (event) => received.push(`bubble:${event.defaultPrevented}`) });
  });
  const tap = () => {
    for (const type of ["pointerdown", "pointerup"]) {
      root.dispatchEvent(
        new PointerEvent(type, {
          pointerType: "mouse",
          pointerId: 4,
          bubbles: true,
          button: 0,
          buttons: type === "pointerdown" ? 1 : 0,
        })
      );
    }
  };
  tap();
  expect(received).toEqual(["capture:4", "bubble:true"]);
  controller.abort();
  tap();
  expect(received).toEqual(["capture:4", "bubble:true", "bubble:false"]);
  unmount();
  tap();
  expect(received).toHaveLength(3);
  graph.unmount();
  root.remove();
});

test("pinch and camera-change callbacks can each veto a real two-finger zoom before it commits", () => {
  const root = document.body.appendChild(document.createElement("div"));
  const graph = new Graph({ settings: { touchPolicy: "editor" } }, root);
  graph.start();
  graph.cameraService.set({ x: 0, y: 0, scale: 0.5, scaleMax: 2 });
  const before = graph.$camera.peek();
  const updates = jest.fn();
  const proposals = jest.fn();
  const { unmount } = renderHook(() => {
    useGraphEvent(graph, "pinch", (event) => {
      if (event.phase !== "update") return;
      updates(
        event.distance,
        event.pointers.map((pointer) => pointer.pointerId)
      );
      if (event.distance === 80) event.preventDefault();
    });
    useGraphEvent(graph, "camera-change", (event) => {
      proposals(event.scale);
      event.preventDefault();
    });
  });
  const touch = (type: string, pointerId: number, x: number) =>
    root.dispatchEvent(
      new PointerEvent(type, {
        pointerType: "touch",
        pointerId,
        clientX: x,
        clientY: 30,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        bubbles: true,
      })
    );
  touch("pointerdown", 1, 20);
  touch("pointerdown", 2, 60);
  touch("pointermove", 2, 100);
  expect(updates).toHaveBeenLastCalledWith(80, [1, 2]);
  expect(proposals).not.toHaveBeenCalled();
  touch("pointermove", 2, 180);
  expect(updates).toHaveBeenLastCalledWith(160, [1, 2]);
  expect(proposals).toHaveBeenCalledWith(1);
  expect(graph.$camera.peek()).toBe(before);
  touch("pointerup", 2, 180);
  touch("pointerup", 1, 20);
  unmount();
  graph.unmount();
  root.remove();
});
