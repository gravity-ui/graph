import React from "react";

import { Graph } from "@gravity-ui/graph";
import { act, render, renderHook } from "@testing-library/react";

import { GraphCanvas } from "./GraphCanvas";
import { useGraphEvent } from "./hooks/useGraphEvents";
import { ReactLayer } from "./layer";

describe("GraphCanvas", () => {
  it("delivers the graph click from pointer input, including its graph target", () => {
    const graph = new Graph({});
    const onClick = jest.fn();
    const { unmount } = render(<GraphCanvas graph={graph} onClick={onClick} />);
    act(() => graph.start());
    const canvas = graph.getGraphCanvas();
    act(() => {
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).not.toHaveBeenCalled();
    act(() => {
      for (const type of ["pointerdown", "pointerup"]) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 9,
            pointerType: "mouse",
            button: 0,
            buttons: type === "pointerdown" ? 1 : 0,
            bubbles: true,
          })
        );
      }
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    const [event] = onClick.mock.calls[0];
    expect(event.type).toBe("click");
    expect(event.target).toBe(graph);
    expect(event.event.pointerId).toBe(9);
    unmount();
    graph.unmount();
  });

  it("destroys its ReactLayer on unmount while the external graph stays alive", () => {
    const graph = new Graph({});
    const { unmount } = render(<GraphCanvas graph={graph} renderBlock={() => <div>Block</div>} />);
    const reactLayer = graph.layers.getLayers().find((layer) => layer instanceof ReactLayer);
    if (!reactLayer) throw new Error("Expected a ReactLayer");
    // unmount is a protected lifecycle hook; the spy only observes it through the instance.
    const unmounted = jest.spyOn(reactLayer as unknown as { unmount(): void }, "unmount");

    act(() => unmount());

    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(graph.layers.getLayers()).not.toContain(reactLayer);
    act(() => graph.unmount());
    expect(unmounted).toHaveBeenCalledTimes(1);
  });
});

function startDrag(graph: Graph) {
  const pointer = (type: string, x: number) => {
    graph.getGraphCanvas().dispatchEvent(
      new PointerEvent(type, {
        pointerType: "mouse",
        pointerId: 7,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        bubbles: true,
        clientX: x,
        clientY: 20,
      })
    );
  };
  pointer("pointerdown", 20);
  pointer("pointermove", 40);
  return () => {
    pointer("pointermove", 60);
    pointer("pointerup", 60);
  };
}

test.each(["unmount", "graph replacement", "external abort"])("a once drag claim is cancelled on %s", (cleanup) => {
  const root = document.body.appendChild(document.createElement("div"));
  const graph = new Graph({}, root);
  const replacement = new Graph({});
  graph.start();
  const operation = { owner: "panel", start: jest.fn(), move: jest.fn(), end: jest.fn(), cancel: jest.fn() };
  const controller = new AbortController();
  const hook = renderHook(
    ({ source }) => {
      useGraphEvent(source, "dragstart", (event) => event.claim(operation), { once: true, signal: controller.signal });
    },
    { initialProps: { source: graph } }
  );
  const finish = startDrag(graph);
  expect(operation.start).toHaveBeenCalledTimes(1);
  operation.move.mockClear();
  if (cleanup === "unmount") hook.unmount();
  if (cleanup === "graph replacement") hook.rerender({ source: replacement });
  if (cleanup === "external abort") controller.abort();
  expect(operation.cancel).toHaveBeenCalledTimes(1);
  finish();
  expect(operation.move).not.toHaveBeenCalled();
  expect(operation.end).not.toHaveBeenCalled();
  if (cleanup !== "unmount") hook.unmount();
  expect(operation.cancel).toHaveBeenCalledTimes(1);
  graph.unmount();
  replacement.unmount();
  root.remove();
});

test("removing GraphCanvas onDragStart cancels its active drag while the graph stays mounted", () => {
  const graph = new Graph({});
  const operation = { owner: "panel", start: jest.fn(), move: jest.fn(), end: jest.fn(), cancel: jest.fn() };
  const view = render(<GraphCanvas graph={graph} onDragStart={(event) => event.claim(operation)} />);
  act(() => graph.start());
  const finish = startDrag(graph);
  expect(operation.start).toHaveBeenCalledTimes(1);
  operation.move.mockClear();
  view.rerender(<GraphCanvas graph={graph} />);
  expect(operation.cancel).toHaveBeenCalledTimes(1);
  finish();
  expect(operation.move).not.toHaveBeenCalled();
  expect(operation.end).not.toHaveBeenCalled();
  view.unmount();
  expect(operation.cancel).toHaveBeenCalledTimes(1);
  graph.unmount();
});

test("a suspended mode change cannot veto camera updates until its UI commits", async () => {
  const graph = new Graph({});
  const hookModes = jest.fn();
  const canvasModes = jest.fn();
  const editRender = jest.fn();
  let ready = false;
  let finishLoading!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishLoading = resolve;
  });

  function Mode({ mode }: { mode: "pan" | "edit" }) {
    if (mode === "edit" && !ready) {
      editRender();
      throw pending;
    }
    return <span>{mode}</span>;
  }
  function Editor({ mode }: { mode: "pan" | "edit" }) {
    useGraphEvent(graph, "camera-change", (event) => {
      hookModes(mode);
      if (mode === "edit") event.preventDefault();
    });
    return (
      <>
        <GraphCanvas graph={graph} onCameraChange={() => canvasModes(mode)} />
        <Mode mode={mode} />
      </>
    );
  }
  const editor = (mode: "pan" | "edit") => (
    <React.Suspense fallback={null}>
      <Editor mode={mode} />
    </React.Suspense>
  );
  const view = render(editor("pan"));
  act(() => React.startTransition(() => view.rerender(editor("edit"))));
  expect(editRender).toHaveBeenCalled();
  expect(view.getByText("pan")).toBeDefined();
  act(() => graph.cameraService.set({ scale: 0.5 }));
  expect(hookModes).toHaveBeenLastCalledWith("pan");
  expect(canvasModes).toHaveBeenLastCalledWith("pan");
  expect(graph.$camera.peek().scale).toBe(0.5);

  await act(async () => {
    ready = true;
    finishLoading();
    await pending;
  });
  expect(view.getByText("edit")).toBeDefined();
  act(() => graph.cameraService.set({ scale: 0.25 }));
  expect(hookModes).toHaveBeenLastCalledWith("edit");
  expect(canvasModes).toHaveBeenLastCalledWith("edit");
  expect(graph.$camera.peek().scale).toBe(0.5);
  view.unmount();
  graph.unmount();
});
